package expo.modules.localllm

import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig

/**
 * Process-wide singleton that keeps a single LiteRT-LM Engine alive.
 * Matches PokeClaw's implementation exactly.
 */
object EngineHolder {

    private const val TAG = "EngineHolder"

    private var engine: Engine? = null
    private var currentModelPath: String? = null
    private var currentBackendLabel: String? = null

    private fun backendLabel(backend: Backend): String =
        if (backend is Backend.CPU) "CPU" else if (backend is Backend.GPU) "GPU" else backend.javaClass.simpleName

    /**
     * Return the existing Engine if the model path matches, otherwise close the
     * old one and create a fresh Engine for the new model.
     */
    @Synchronized
    @JvmOverloads
    fun getOrCreate(modelPath: String, cacheDir: String, backend: Backend = Backend.CPU()): Engine {
        val existing = engine
        val requestedBackendLabel = backendLabel(backend)
        if (existing != null && currentModelPath == modelPath && currentBackendLabel == requestedBackendLabel) {
            Log.d(TAG, "getOrCreate: reusing engine for $modelPath (${currentBackendLabel ?: "unknown"})")
            return existing
        }

        // Different model or first call — close old engine first
        if (existing != null) {
            Log.i(
                TAG,
                "getOrCreate: runtime changed (model=$currentModelPath/${currentBackendLabel ?: "?"} -> $modelPath/$requestedBackendLabel), closing old engine"
            )
            try {
                existing.close()
            } catch (e: Exception) {
                Log.w(TAG, "getOrCreate: error closing old engine", e)
            }
            engine = null
            currentModelPath = null
        }

        Log.i(TAG, "getOrCreate: creating new engine for $modelPath with $requestedBackendLabel")
        return try {
            val engineConfig = EngineConfig(
                modelPath = modelPath,
                backend = backend,
                maxNumTokens = LocalBackendPrefs.getMaxNumTokens(),
                cacheDir = cacheDir
            )
            if (backend is Backend.GPU) {
                LocalBackendHealth.markGpuInitStarted(modelPath)
            }
            val newEngine = Engine(engineConfig).also { it.initialize() }
            if (backend is Backend.GPU) {
                LocalBackendHealth.markGpuInitFinished()
                LocalBackendHealth.noteGpuInitSuccess(modelPath)
            }
            engine = newEngine
            currentModelPath = modelPath
            currentBackendLabel = requestedBackendLabel
            Log.i(TAG, "getOrCreate: engine ready for $modelPath (${currentBackendLabel})")
            newEngine
        } catch (e: Exception) {
            if (backend is Backend.GPU) {
                LocalBackendHealth.noteRecoverableGpuFailure(modelPath, e)
            } else {
                LocalBackendHealth.markGpuInitFinished()
            }
            Log.e(TAG, "getOrCreate: failed to create engine for $modelPath", e)
            throw e
        }
    }

    /**
     * Explicitly close and release the engine. Call only when the model is being
     * unloaded entirely (e.g. user deletes the model file).
     */
    @Synchronized
    fun close() {
        Log.i(TAG, "close: releasing engine for $currentModelPath")
        try {
            engine?.close()
        } catch (e: Exception) {
            Log.w(TAG, "close: error closing engine", e)
        }
        engine = null
        currentModelPath = null
        currentBackendLabel = null
        Log.i(TAG, "close: done")
    }

    /** Returns true if an engine is live for the given model path. */
    @Synchronized
    fun isReady(modelPath: String): Boolean = engine != null && currentModelPath == modelPath

    /** Returns the actual backend label of the current shared engine, if any. */
    @Synchronized
    fun getBackendLabel(modelPath: String? = null): String? {
        return if (modelPath == null || currentModelPath == modelPath) currentBackendLabel else null
    }
}
