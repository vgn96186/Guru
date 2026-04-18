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
                    val preferCpu = options.preferredBackend?.equals("cpu", ignoreCase = true) ?: false
                    // Pre-warm the engine
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
                    
                    val result = LocalModelRuntime.runChat(
                        context = context,
                        modelPath = options.modelPath ?: throw Exception("Model path required for chat"),
                        systemPrompt = options.systemInstruction ?: "",
                        messages = messages,
                        temperature = options.temperature?.toDouble() ?: 0.7
                    )
                    promise.resolve(mapOf(
                        "text" to result.text,
                        "backend" to result.backendLabel
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
                    
                    LocalModelRuntime.runChatStream(
                        context = context,
                        modelPath = options.modelPath ?: throw Exception("Model path required for chat"),
                        systemPrompt = options.systemInstruction ?: "",
                        messages = messages,
                        temperature = options.temperature?.toDouble() ?: 0.7,
                        preferCpu = false,
                        onToken = { token ->
                            sendEvent("onLlmToken", mapOf("token" to token))
                        },
                        onComplete = { fullText, backendLabel ->
                            sendEvent("onLlmComplete", mapOf("text" to fullText, "backend" to backendLabel))
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
    @expo.modules.kotlin.records.Field val topP: Float?
) : expo.modules.kotlin.records.Record