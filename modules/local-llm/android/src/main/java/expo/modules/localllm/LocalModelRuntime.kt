package expo.modules.localllm

import android.content.Context
import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.SamplerConfig
import com.google.ai.edge.litertlm.MessageCallback
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.Content

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
)

object LocalModelRuntime {

    private const val TAG = "LocalModelRuntime"
    private const val DEFAULT_RETRY_COUNT = 5
    private const val DEFAULT_RESET_ATTEMPT = 3
    private const val DEFAULT_RETRY_SLEEP_MS = 1500L

    fun acquireSharedEngine(
        context: Context,
        modelPath: String,
        preferCpu: Boolean = false,
    ): LocalEngineLease {
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

    fun runChat(
        context: Context,
        modelPath: String,
        systemPrompt: String,
        messages: List<Map<String, String>>,
        temperature: Double = 0.3,
        preferCpu: Boolean = false,
    ): LocalSingleShotResult {
        // Detect reset needed
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
                    )
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
            // "assistant" messages are skipped because they are already present in the native Conversation state.
        }
        
        // Account for the messages we just sent + the assistant response we just got back.
        processedMessageCount = messages.size + 1
        
        return LocalSingleShotResult(
            text = lastResponse,
            backendLabel = lease.backendLabel
        )
    }

    fun runChatStream(
        context: Context,
        modelPath: String,
        systemPrompt: String,
        messages: List<Map<String, String>>,
        temperature: Double = 0.3,
        preferCpu: Boolean = false,
        onToken: (String) -> Unit,
        onComplete: (String, String) -> Unit,
        onError: (String) -> Unit
    ) {
        // Detect reset needed
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
                    )
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
            onComplete("", lease.backendLabel)
            return
        }

        val fullResponse = java.lang.StringBuilder()
        var lastEmittedLength = 0

        try {
            lease.conversation.sendMessageAsync(
                Contents.of(mutableListOf(Content.Text(prompt))),
                object : MessageCallback {
                    override fun onMessage(message: Message) {
                        val currentText = message.toString()
                        if (currentText.length > lastEmittedLength) {
                            val delta = currentText.substring(lastEmittedLength)
                            lastEmittedLength = currentText.length
                            fullResponse.append(delta)
                            onToken(delta)
                        }
                    }

                    override fun onDone() {
                        processedMessageCount = messages.size + 1
                        onComplete(fullResponse.toString(), lease.backendLabel)
                    }

                    override fun onError(throwable: Throwable) {
                        onError(throwable.message ?: "Unknown streaming error")
                    }
                }
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
