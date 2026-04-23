package expo.modules.localllm

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import expo.modules.kotlin.Promise

class LocalLlmModule : Module() {
    private val scope = CoroutineScope(Dispatchers.Default)
    private var lastPreferredBackend: String = "auto"

    override fun definition() = ModuleDefinition {
        Name("LocalLlm")

        Events("onLlmToken", "onLlmComplete", "onLlmError")

        OnCreate {
            LocalBackendPrefs.init(appContext.reactContext ?: throw Exception("React context not available"))
        }

        AsyncFunction("initialize") { options: InitializeOptions, promise: Promise ->
            scope.launch {
                try {
                    val context = appContext.reactContext ?: throw Exception("React context not available")
                    val modelPath = options.modelPath
                    if (modelPath.isNullOrBlank()) {
                        promise.reject("ERR_LOCAL_LLM_INIT", "modelPath is required but was null or empty", null)
                        return@launch
                    }
                    lastPreferredBackend = options.preferredBackend ?: "auto"
                    
                    // Store max tokens preference
                    options.maxNumTokens?.let { maxTokens ->
                        LocalBackendPrefs.setMaxNumTokens(maxTokens)
                    }
                    
                    val preferCpu = lastPreferredBackend.equals("cpu", ignoreCase = true)
                    val lease = LocalModelRuntime.acquireSharedEngine(context, modelPath, preferCpu)
                    promise.resolve(mapOf("backend" to lease.backendLabel))
                } catch (t: Throwable) {
                    promise.reject("ERR_LOCAL_LLM_INIT", t.message, t)
                }
            }
        }

        AsyncFunction("isInitialized") {
            return@AsyncFunction EngineHolder.getBackendLabel(null) != null
        }

        AsyncFunction("getBackend") {
            return@AsyncFunction EngineHolder.getBackendLabel(null) ?: "unknown"
        }

        AsyncFunction("chat") { messages: List<Map<String, String>>, options: GenerateOptions, promise: Promise ->
            scope.launch {
                try {
                    val context = appContext.reactContext ?: throw Exception("React context not available")
                    // Respect the backend preference from initialization
                    val preferCpu = lastPreferredBackend.equals("cpu", ignoreCase = true)
                    
                    val result = LocalModelRuntime.runChat(
                        context = context,
                        modelPath = options.modelPath ?: throw Exception("Model path required for chat"),
                        systemPrompt = options.systemInstruction ?: "",
                        messages = messages,
                        temperature = options.temperature?.toDouble() ?: 0.7,
                        preferCpu = preferCpu,
                        toolsJson = options.toolsJson,
                    )
                    promise.resolve(mapOf(
                        "text" to result.text,
                        "backend" to result.backendLabel,
                        "toolCallsJson" to result.toolCallsJson,
                        "finishReason" to result.finishReason,
                    ))
                } catch (t: Throwable) {
                    promise.reject("ERR_LOCAL_LLM_CHAT", t.message, t)
                }
            }
        }

        AsyncFunction("chatStream") { messages: List<Map<String, String>>, options: GenerateOptions, promise: Promise ->
            scope.launch {
                try {
                    val context = appContext.reactContext ?: throw Exception("React context not available")
                    val preferCpu = lastPreferredBackend.equals("cpu", ignoreCase = true)
                    
                    LocalModelRuntime.runChatStream(
                        context = context,
                        modelPath = options.modelPath ?: throw Exception("Model path required for chat"),
                        systemPrompt = options.systemInstruction ?: "",
                        messages = messages,
                        temperature = options.temperature?.toDouble() ?: 0.7,
                        preferCpu = preferCpu,
                        toolsJson = options.toolsJson,
                        onToken = { token ->
                            sendEvent("onLlmToken", mapOf("token" to token))
                        },
                        onComplete = { fullText, backendLabel, toolCallsJson, finishReason ->
                            sendEvent(
                                "onLlmComplete",
                                mapOf(
                                    "text" to fullText,
                                    "backend" to backendLabel,
                                    "toolCallsJson" to toolCallsJson,
                                    "finishReason" to finishReason,
                                ),
                            )
                        },
                        onError = { errorMsg ->
                            sendEvent("onLlmError", mapOf("error" to errorMsg))
                        }
                    )
                    promise.resolve(mapOf("status" to "streaming"))
                } catch (t: Throwable) {
                    promise.reject("ERR_LOCAL_LLM_CHAT_STREAM", t.message, t)
                }
            }
        }

        AsyncFunction("cancel") {
            LocalModelRuntime.cancel()
        }

        AsyncFunction("release") {
            LocalModelRuntime.resetSharedEngine()
        }

        AsyncFunction("resetSession") {
            LocalModelRuntime.resetSession()
        }

        // ── Gemini Nano (AICore) ──────────────────────────────────────────
        AsyncFunction("nanoCheckStatus") { promise: Promise ->
            scope.launch {
                try {
                    val result = GeminiNanoRuntime.checkStatus()
                    promise.resolve(mapOf(
                        "status" to result.status.name,
                        "errorMessage" to result.errorMessage,
                    ))
                } catch (t: Throwable) {
                    promise.reject("ERR_NANO_STATUS", t.message, t)
                }
            }
        }

        AsyncFunction("nanoDownloadIfNeeded") { promise: Promise ->
            scope.launch {
                try {
                    val result = GeminiNanoRuntime.downloadIfNeeded()
                    promise.resolve(mapOf(
                        "status" to result.status.name,
                        "errorMessage" to result.errorMessage,
                    ))
                } catch (t: Throwable) {
                    promise.reject("ERR_NANO_DOWNLOAD", t.message, t)
                }
            }
        }

        AsyncFunction("nanoWarmup") { promise: Promise ->
            scope.launch {
                try {
                    GeminiNanoRuntime.warmup()
                    promise.resolve(true)
                } catch (t: Throwable) {
                    promise.reject("ERR_NANO_WARMUP", t.message, t)
                }
            }
        }

        AsyncFunction("nanoGenerate") { options: NanoGenerateOptions, promise: Promise ->
            scope.launch {
                try {
                    val result = GeminiNanoRuntime.generate(
                        prompt = options.prompt,
                        systemInstruction = options.systemInstruction,
                        temperature = options.temperature ?: 0.3f,
                        topK = options.topK ?: 40,
                        maxOutputTokens = options.maxOutputTokens ?: 256,
                    )
                    promise.resolve(mapOf(
                        "text" to result.text,
                        "backend" to result.backend,
                    ))
                } catch (t: Throwable) {
                    promise.reject("ERR_NANO_GENERATE", t.message, t)
                }
            }
        }

        AsyncFunction("nanoGradeAnswer") { options: NanoGradeOptions, promise: Promise ->
            scope.launch {
                try {
                    val result = GeminiNanoRuntime.gradeAnswer(
                        question = options.question,
                        userAnswer = options.userAnswer,
                        correctAnswer = options.correctAnswer,
                    )
                    promise.resolve(mapOf(
                        "text" to result.text,
                        "backend" to result.backend,
                    ))
                } catch (t: Throwable) {
                    promise.reject("ERR_NANO_GRADE", t.message, t)
                }
            }
        }

        // ── Gemma LiteRT Warmup ───────────────────────────────────────────
        AsyncFunction("warmup") { modelPath: String, promise: Promise ->
            scope.launch {
                try {
                    val context = appContext.reactContext ?: throw Exception("React context not available")
                    if (modelPath.isBlank()) {
                        promise.reject("ERR_WARMUP", "modelPath is required", null)
                        return@launch
                    }
                    val preferCpu = lastPreferredBackend.equals("cpu", ignoreCase = true)
                    val lease = LocalModelRuntime.acquireSharedEngine(context, modelPath, preferCpu)
                    // Run a dummy inference to warm up KV cache and tokenizer
                    LocalModelRuntime.runChat(
                        context = context,
                        modelPath = modelPath,
                        systemPrompt = "You are a helpful assistant.",
                        messages = listOf(mapOf("role" to "user", "content" to "Hi")),
                        temperature = 0.1,
                        preferCpu = preferCpu,
                        toolsJson = null,
                    )
                    promise.resolve(mapOf(
                        "backend" to lease.backendLabel,
                        "warmedUp" to true,
                    ))
                } catch (t: Throwable) {
                    promise.reject("ERR_WARMUP", t.message, t)
                }
            }
        }

        OnDestroy {
            scope.cancel()
            LocalModelRuntime.resetSharedEngine()
        }
    }
}

data class InitializeOptions(
    @expo.modules.kotlin.records.Field val modelPath: String?,
    @expo.modules.kotlin.records.Field val maxNumTokens: Int?,
    @expo.modules.kotlin.records.Field val preferredBackend: String?
) : expo.modules.kotlin.records.Record

data class GenerateOptions(
    @expo.modules.kotlin.records.Field val modelPath: String?,
    @expo.modules.kotlin.records.Field val systemInstruction: String?,
    @expo.modules.kotlin.records.Field val temperature: Float?,
    @expo.modules.kotlin.records.Field val topK: Int?,
    @expo.modules.kotlin.records.Field val topP: Float?,
    @expo.modules.kotlin.records.Field val toolsJson: String?
) : expo.modules.kotlin.records.Record

data class NanoGenerateOptions(
    @expo.modules.kotlin.records.Field val prompt: String,
    @expo.modules.kotlin.records.Field val systemInstruction: String?,
    @expo.modules.kotlin.records.Field val temperature: Float?,
    @expo.modules.kotlin.records.Field val topK: Int?,
    @expo.modules.kotlin.records.Field val maxOutputTokens: Int?
) : expo.modules.kotlin.records.Record

data class NanoGradeOptions(
    @expo.modules.kotlin.records.Field val question: String,
    @expo.modules.kotlin.records.Field val userAnswer: String,
    @expo.modules.kotlin.records.Field val correctAnswer: String?
) : expo.modules.kotlin.records.Record