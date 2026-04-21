package expo.modules.localllm

import android.content.Context
import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.MessageCallback
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.ToolProvider
import com.google.ai.edge.litertlm.SamplerConfig
import com.google.ai.edge.litertlm.tool
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

data class LocalEngineLease(
    val engine: Engine,
    val backendLabel: String,
)

data class LocalConversationLease(
    val engine: Engine,
    val conversation: Conversation,
    val backendLabel: String,
)

data class LocalSingleShotResult(
    val text: String?,
    val backendLabel: String,
    /** JSON array of { "toolCallId", "toolName", "arguments" } — arguments is a JSON object. */
    val toolCallsJson: String? = null,
    /** "stop" or "tool_calls" for JS agentic loop */
    val finishReason: String = "stop",
)

object LocalModelRuntime {

    private const val TAG = "LocalModelRuntime"
    private const val DEFAULT_RETRY_COUNT = 5
    private const val DEFAULT_RESET_ATTEMPT = 3
    private const val DEFAULT_RETRY_SLEEP_MS = 1500L

    private val gson = Gson()

    fun acquireSharedEngine(
        context: Context,
        modelPath: String?,
        preferCpu: Boolean = false,
    ): LocalEngineLease {
        if (modelPath.isNullOrBlank()) {
            throw IllegalArgumentException("acquireSharedEngine called with null/empty modelPath. Ensure profile.localModelPath is set before calling.")
        }
        val shouldUseCpu = LocalBackendHealth.shouldForceCpu(preferCpu)
        if (shouldUseCpu) {
            val engine = EngineHolder.getOrCreate(modelPath, context.cacheDir.path, Backend.CPU())
            return LocalEngineLease(engine = engine, backendLabel = "CPU")
        }

        return try {
            val engine = EngineHolder.getOrCreate(modelPath, context.cacheDir.path, Backend.GPU())
            LocalEngineLease(engine = engine, backendLabel = EngineHolder.getBackendLabel(modelPath) ?: "GPU")
        } catch (e: Exception) {
            if (!isGpuBackendFailure(e)) throw e
            Log.w(TAG, "GPU runtime failed for $modelPath, retrying on CPU: ${e.message}")
            LocalBackendHealth.noteRecoverableGpuFailure(modelPath, e)
            forceCpuEngine(context, modelPath)
        }
    }

    private var activeConversationLease: LocalConversationLease? = null
    private var processedMessageCount = 0
    private var currentSessionModelPath: String? = null

    fun resetSession() {
        try {
            activeConversationLease?.conversation?.close()
        } catch (e: Exception) {
            Log.w(TAG, "resetSession: close failed", e)
        }
        activeConversationLease = null
        processedMessageCount = 0
        currentSessionModelPath = null
    }

    fun forceCpuEngine(context: Context, modelPath: String): LocalEngineLease {
        resetSharedEngine()
        val engine = EngineHolder.getOrCreate(modelPath, context.cacheDir.path, Backend.CPU())
        return LocalEngineLease(engine = engine, backendLabel = "CPU")
    }

    fun resetSharedEngine() {
        resetSession()
        try {
            EngineHolder.close()
        } catch (e: Exception) {
            Log.w(TAG, "resetSharedEngine: close failed", e)
        }
    }

    fun currentBackendLabel(modelPath: String?): String? {
        return EngineHolder.getBackendLabel(modelPath)
    }

    fun openConversation(
        context: Context,
        modelPath: String,
        conversationConfig: ConversationConfig,
        preferCpu: Boolean = false,
        maxRetries: Int = DEFAULT_RETRY_COUNT,
    ): LocalConversationLease {
        var lastError: Exception? = null
        var forceCpu = preferCpu

        for (attempt in 1..maxRetries) {
            try {
                val engineLease = acquireSharedEngine(context, modelPath, preferCpu = forceCpu)
                val conversation = engineLease.engine.createConversation(conversationConfig)
                return LocalConversationLease(
                    engine = engineLease.engine,
                    conversation = conversation,
                    backendLabel = engineLease.backendLabel,
                )
            } catch (e: Exception) {
                lastError = e
                Log.w(TAG, "openConversation attempt $attempt failed for $modelPath: ${e.message}")

                if (isSessionConflict(e)) {
                    throw IllegalStateException("Local model session already in use", e)
                }

                if (!forceCpu && isGpuBackendFailure(e)) {
                    Log.w(TAG, "openConversation: GPU path failed, forcing CPU for $modelPath")
                    LocalBackendHealth.noteRecoverableGpuFailure(modelPath, e)
                    forceCpuEngine(context, modelPath)
                    forceCpu = true
                } else if (attempt == DEFAULT_RESET_ATTEMPT) {
                    Log.w(TAG, "openConversation: resetting shared runtime for $modelPath")
                    try {
                        resetSharedEngine()
                    } catch (resetError: Exception) {
                        Log.e(TAG, "openConversation: shared runtime reset failed", resetError)
                    }
                }

                if (attempt < maxRetries) {
                    Thread.sleep(DEFAULT_RETRY_SLEEP_MS)
                }
            }
        }

        throw RuntimeException(
            "Failed to create conversation after $maxRetries retries: ${lastError?.message}",
            lastError
        )
    }

    private fun buildOpenApiTools(toolsJson: String?): List<ToolProvider> {
        if (toolsJson.isNullOrBlank()) return emptyList()
        return try {
            val type = object : TypeToken<List<Map<String, @JvmSuppressWildcards Any?>>>() {}.type
            val specs: List<Map<String, Any?>> = gson.fromJson(toolsJson, type) ?: emptyList()
            specs.mapNotNull { spec ->
                val name = spec["name"] as? String ?: return@mapNotNull null
                val description = (spec["description"] as? String) ?: ""
                val parameters = spec["parameters"] ?: emptyMap<String, Any?>()
                try {
                    tool(object : com.google.ai.edge.litertlm.OpenApiTool {
                        override fun getToolDescriptionJsonString(): String =
                            gson.toJson(
                                mapOf(
                                    "name" to name,
                                    "description" to description,
                                    "parameters" to parameters,
                                ),
                            )

                        override fun execute(paramsJsonString: String): String {
                            // streamText executes tools in JS — LiteRT only proposes calls.
                            return "{}"
                        }
                    })
                } catch (e: Exception) {
                    Log.w(TAG, "buildOpenApiTools: skip tool $name", e)
                    null
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "buildOpenApiTools: invalid toolsJson", e)
            emptyList()
        }
    }

    private fun sendMessageSafe(conv: Conversation, text: String): Any? {
        return try {
            conv.sendMessage(text, emptyMap())
        } catch (e: Exception) {
            val errorMsg = e.message ?: ""
            if (errorMsg.contains("Failed to parse tool calls", ignoreCase = true) &&
                errorMsg.contains("tool_call", ignoreCase = true)
            ) {
                val rawOutput = errorMsg.substringAfter("from response: ").substringBefore("code block:")
                    .ifEmpty { errorMsg.substringAfter("from response: ") }
                rawOutput.trim()
            } else {
                throw e
            }
        }
    }

    private fun responseText(raw: Any?): String {
        return when (raw) {
            is Message -> raw.contents?.toString()?.trim() ?: ""
            else -> raw?.toString()?.trim() ?: ""
        }
    }

    private fun extractToolCallsFromResponse(raw: Any?): List<Map<String, Any?>> {
        if (raw !is Message) return emptyList()
        val tcs = raw.toolCalls ?: return emptyList()
        val out = mutableListOf<Map<String, Any?>>()
        tcs.forEachIndexed { idx, tc ->
            try {
                val name = tc.name ?: return@forEachIndexed
                val args = tc.arguments ?: emptyMap<String, Any?>()
                val id = try {
                    tc.javaClass.getMethod("getId").invoke(tc) as? String
                } catch (_: Exception) {
                    null
                } ?: "litert_${System.currentTimeMillis()}_${idx}_$name"
                out.add(
                    mapOf(
                        "toolCallId" to id,
                        "toolName" to name,
                        "arguments" to args,
                    ),
                )
            } catch (e: Exception) {
                Log.w(TAG, "extractToolCallsFromResponse: skip entry", e)
            }
        }
        return out
    }

    /**
     * Full transcript replay with optional LiteRT OpenAPI tools (automaticToolCalling=false).
     * Used when tools are enabled or when the prompt contains tool/assistant turns from an agentic loop.
     */
    private fun runChatFullReplay(
        context: Context,
        modelPath: String,
        systemPrompt: String,
        messages: List<Map<String, String>>,
        temperature: Double,
        preferCpu: Boolean,
        toolsJson: String?,
    ): LocalSingleShotResult {
        resetSession()
        currentSessionModelPath = modelPath
        val nativeTools = buildOpenApiTools(toolsJson)
        val lease = openConversation(
            context = context,
            modelPath = modelPath,
            conversationConfig = ConversationConfig(
                systemInstruction = if (systemPrompt.isNotBlank()) Contents.of(systemPrompt) else null,
                tools = nativeTools,
                samplerConfig = SamplerConfig(
                    topK = 64,
                    topP = 0.95,
                    temperature = temperature,
                ),
                automaticToolCalling = false,
            ),
            preferCpu = preferCpu,
        )
        activeConversationLease = lease

        var lastRaw: Any? = null
        for (msg in messages) {
            val role = msg["role"] ?: "user"
            val content = msg["content"] ?: ""
            when (role) {
                "user" -> {
                    lastRaw = sendMessageSafe(lease.conversation, content)
                }
                "assistant" -> {
                    // Already reflected in native conversation state.
                }
                "tool" -> {
                    if (content.isBlank()) continue
                    try {
                        val type = object : TypeToken<List<Map<String, @JvmSuppressWildcards Any?>>>() {}.type
                        val results: List<Map<String, Any?>> = gson.fromJson(content, type) ?: emptyList()
                        for (r in results) {
                            val toolName = (r["toolName"] as? String) ?: "unknown"
                            val payload = r["output"]
                            val line = "[Tool $toolName result]: ${gson.toJson(payload)}".take(12_000)
                            lastRaw = sendMessageSafe(lease.conversation, line)
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "runChatFullReplay: tool message parse failed", e)
                    }
                }
            }
        }

        val textOut = responseText(lastRaw)
        val toolCalls = extractToolCallsFromResponse(lastRaw)
        val toolCallsJson = if (toolCalls.isNotEmpty()) gson.toJson(toolCalls) else null
        val finish = if (toolCalls.isNotEmpty()) "tool_calls" else "stop"
        processedMessageCount = messages.size + 1

        return LocalSingleShotResult(
            text = textOut.ifBlank { null },
            backendLabel = lease.backendLabel,
            toolCallsJson = toolCallsJson,
            finishReason = finish,
        )
    }

    fun runChat(
        context: Context,
        modelPath: String,
        systemPrompt: String,
        messages: List<Map<String, String>>,
        temperature: Double = 0.3,
        preferCpu: Boolean = false,
        toolsJson: String? = null,
    ): LocalSingleShotResult {
        val useTools = !toolsJson.isNullOrBlank()
        val hasToolTurn = messages.any { (it["role"] ?: "") == "tool" }
        if (useTools || hasToolTurn) {
            return runChatFullReplay(context, modelPath, systemPrompt, messages, temperature, preferCpu, toolsJson)
        }

        // Legacy incremental path (no LiteRT tool declarations)
        if (activeConversationLease == null || currentSessionModelPath != modelPath || processedMessageCount == 0 || messages.size < processedMessageCount) {
            resetSession()
            currentSessionModelPath = modelPath

            val lease = openConversation(
                context = context,
                modelPath = modelPath,
                conversationConfig = ConversationConfig(
                    systemInstruction = if (systemPrompt.isNotBlank()) Contents.of(systemPrompt) else null,
                    samplerConfig = SamplerConfig(
                        topK = 64,
                        topP = 0.95,
                        temperature = temperature,
                    ),
                ),
                preferCpu = preferCpu,
            )
            activeConversationLease = lease
            processedMessageCount = 0
        }

        val lease = activeConversationLease ?: throw IllegalStateException("No active lease")
        val newMessages = messages.subList(processedMessageCount.coerceAtMost(messages.size), messages.size)

        var lastResponse: String? = null
        for (msg in newMessages) {
            val role = msg["role"] ?: "user"
            val content = msg["content"] ?: ""
            if (role == "user") {
                lastResponse = lease.conversation.sendMessage(content, emptyMap()).contents?.toString()?.trim()
            }
        }

        processedMessageCount = messages.size + 1

        return LocalSingleShotResult(
            text = lastResponse,
            backendLabel = lease.backendLabel,
            toolCallsJson = null,
            finishReason = "stop",
        )
    }

    fun runChatStream(
        context: Context,
        modelPath: String,
        systemPrompt: String,
        messages: List<Map<String, String>>,
        temperature: Double = 0.3,
        preferCpu: Boolean = false,
        toolsJson: String? = null,
        onToken: (String) -> Unit,
        onComplete: (String, String, String?, String) -> Unit,
        onError: (String) -> Unit,
    ) {
        val useTools = !toolsJson.isNullOrBlank()
        val hasToolTurn = messages.any { (it["role"] ?: "") == "tool" }
        if (useTools || hasToolTurn) {
            try {
                val res = runChatFullReplay(
                    context,
                    modelPath,
                    systemPrompt,
                    messages,
                    temperature,
                    preferCpu,
                    toolsJson,
                )
                val txt = res.text ?: ""
                val CHUNK = 16
                for (i in txt.indices step CHUNK) {
                    onToken(txt.substring(i, minOf(i + CHUNK, txt.length)))
                }
                onComplete(txt, res.backendLabel, res.toolCallsJson, res.finishReason)
            } catch (e: Exception) {
                onError(e.message ?: "Unknown error")
            }
            return
        }

        if (activeConversationLease == null || currentSessionModelPath != modelPath || processedMessageCount == 0 || messages.size < processedMessageCount) {
            resetSession()
            currentSessionModelPath = modelPath

            val lease = openConversation(
                context = context,
                modelPath = modelPath,
                conversationConfig = ConversationConfig(
                    systemInstruction = if (systemPrompt.isNotBlank()) Contents.of(systemPrompt) else null,
                    samplerConfig = SamplerConfig(
                        topK = 64,
                        topP = 0.95,
                        temperature = temperature,
                    ),
                ),
                preferCpu = preferCpu,
            )
            activeConversationLease = lease
            processedMessageCount = 0
        }

        val lease = activeConversationLease ?: throw IllegalStateException("No active lease")
        val newMessages = messages.subList(processedMessageCount.coerceAtMost(messages.size), messages.size)

        var prompt = ""
        for (msg in newMessages) {
            val role = msg["role"] ?: "user"
            val content = msg["content"] ?: ""
            if (role == "user") {
                prompt = content
            }
        }

        if (prompt.isEmpty()) {
            onComplete("", lease.backendLabel, null, "stop")
            return
        }

        val fullResponse = java.lang.StringBuilder()
        var lastEmittedLength = 0

        try {
            lease.conversation.sendMessageAsync(
                Contents.of(mutableListOf(Content.Text(prompt))),
                object : MessageCallback {
                    override fun onMessage(message: Message) {
                        val currentText = message.contents?.toString() ?: message.toString()
                        if (currentText.length > lastEmittedLength) {
                            val delta = currentText.substring(lastEmittedLength)
                            lastEmittedLength = currentText.length
                            fullResponse.append(delta)
                            try {
                                onToken(delta)
                            } catch (e: Exception) {
                                Log.e(TAG, "Failed to emit onToken", e)
                            }
                        }
                    }

                    override fun onDone() {
                        processedMessageCount = messages.size + 1
                        onComplete(fullResponse.toString(), lease.backendLabel, null, "stop")
                    }

                    override fun onError(throwable: Throwable) {
                        onError(throwable.message ?: "Unknown streaming error")
                    }
                },
            )
        } catch (e: Exception) {
            onError(e.message ?: "Unknown error starting stream")
        }
    }

    fun cancel() {
        try {
            activeConversationLease?.conversation?.cancelProcess()
        } catch (e: Exception) {
            Log.w(TAG, "cancel: failed", e)
        }
    }

    fun isGpuBackendFailure(error: Throwable?): Boolean {
        val message = error?.message.orEmpty()
        if (message.isEmpty()) return false
        return message.contains("OpenCL", ignoreCase = true) ||
            message.contains("GPU", ignoreCase = true) ||
            message.contains("nativeSendMessage", ignoreCase = true) ||
            message.contains("Failed to create engine", ignoreCase = true) ||
            message.contains("compiled model", ignoreCase = true)
    }

    fun isSessionConflict(error: Throwable?): Boolean {
        val message = error?.message.orEmpty()
        if (message.isEmpty()) return false
        return message.contains("A session already exists", ignoreCase = true) ||
            message.contains("Only one session is supported at a time", ignoreCase = true) ||
            message.contains("session already in use", ignoreCase = true)
    }
}
