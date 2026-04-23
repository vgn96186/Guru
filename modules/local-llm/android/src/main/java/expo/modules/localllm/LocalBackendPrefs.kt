package expo.modules.localllm

import android.content.Context
import android.content.SharedPreferences

/**
 * SharedPreferences-based replica of PokeClaw's KVUtils for local LLM health tracking.
 */
object LocalBackendPrefs {
    private const val PREFS_NAME = "LocalLlmBackendPrefs"
    
    @Volatile
    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs == null) {
            synchronized(this) {
                if (prefs == null) {
                    prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                }
            }
        }
    }

    private fun getPrefs(): SharedPreferences {
        return prefs ?: throw IllegalStateException("LocalBackendPrefs not initialized. Call init(context) first.")
    }

    // ==================== String ====================
    private fun putString(key: String, value: String?) {
        getPrefs().edit().putString(key, value).apply()
    }

    private fun getString(key: String, defaultValue: String = ""): String {
        return getPrefs().getString(key, defaultValue) ?: defaultValue
    }

    // ==================== Int ====================
    private fun putInt(key: String, value: Int) {
        getPrefs().edit().putInt(key, value).apply()
    }

    private fun getInt(key: String, defaultValue: Int = 0): Int {
        return getPrefs().getInt(key, defaultValue)
    }

    // ==================== Long ====================
    private fun putLong(key: String, value: Long) {
        getPrefs().edit().putLong(key, value).apply()
    }

    private fun getLong(key: String, defaultValue: Long = 0L): Long {
        return getPrefs().getLong(key, defaultValue)
    }

    // ==================== Common Operations ====================
    private fun remove(vararg keys: String) {
        val editor = getPrefs().edit()
        keys.forEach { editor.remove(it) }
        editor.apply()
    }

    // ==================== Keys ====================
    private const val KEY_LOCAL_BACKEND_PREFERENCE = "KEY_LOCAL_BACKEND_PREFERENCE"
    private const val KEY_LOCAL_CPU_SAFE_DEVICE = "KEY_LOCAL_CPU_SAFE_DEVICE"
    private const val KEY_LOCAL_CPU_SAFE_REASON = "KEY_LOCAL_CPU_SAFE_REASON"
    private const val KEY_LOCAL_CPU_SAFE_AT = "KEY_LOCAL_CPU_SAFE_AT"
    private const val KEY_LOCAL_GPU_VERIFIED_DEVICE = "KEY_LOCAL_GPU_VERIFIED_DEVICE"
    private const val KEY_LOCAL_GPU_VERIFIED_AT = "KEY_LOCAL_GPU_VERIFIED_AT"
    private const val KEY_PENDING_LOCAL_GPU_INIT_DEVICE = "KEY_PENDING_LOCAL_GPU_INIT_DEVICE"
    private const val KEY_PENDING_LOCAL_GPU_INIT_MODEL = "KEY_PENDING_LOCAL_GPU_INIT_MODEL"
    private const val KEY_PENDING_LOCAL_GPU_INIT_AT = "KEY_PENDING_LOCAL_GPU_INIT_AT"
    private const val KEY_PENDING_LOCAL_GPU_INIT_PID = "KEY_PENDING_LOCAL_GPU_INIT_PID"
    private const val KEY_MAX_NUM_TOKENS = "KEY_MAX_NUM_TOKENS"
    private const val DEFAULT_MAX_NUM_TOKENS = 4096

    fun getLocalBackendPreference(): String = getString(KEY_LOCAL_BACKEND_PREFERENCE, "")
    fun setLocalBackendPreference(value: String) = putString(KEY_LOCAL_BACKEND_PREFERENCE, value)

    fun getLocalCpuSafeDevice(): String = getString(KEY_LOCAL_CPU_SAFE_DEVICE, "")
    fun setLocalCpuSafeDevice(value: String) = putString(KEY_LOCAL_CPU_SAFE_DEVICE, value)

    fun getLocalCpuSafeReason(): String = getString(KEY_LOCAL_CPU_SAFE_REASON, "")
    fun setLocalCpuSafeReason(value: String) = putString(KEY_LOCAL_CPU_SAFE_REASON, value)

    fun getLocalCpuSafeAt(): Long = getLong(KEY_LOCAL_CPU_SAFE_AT, 0L)
    fun setLocalCpuSafeAt(value: Long) = putLong(KEY_LOCAL_CPU_SAFE_AT, value)

    fun getLocalGpuVerifiedDevice(): String = getString(KEY_LOCAL_GPU_VERIFIED_DEVICE, "")
    fun setLocalGpuVerifiedDevice(value: String) = putString(KEY_LOCAL_GPU_VERIFIED_DEVICE, value)

    fun getLocalGpuVerifiedAt(): Long = getLong(KEY_LOCAL_GPU_VERIFIED_AT, 0L)
    fun setLocalGpuVerifiedAt(value: Long) = putLong(KEY_LOCAL_GPU_VERIFIED_AT, value)

    fun clearLocalCpuSafeMode() {
        remove(KEY_LOCAL_CPU_SAFE_DEVICE, KEY_LOCAL_CPU_SAFE_REASON, KEY_LOCAL_CPU_SAFE_AT)
    }

    fun clearLocalGpuVerified() {
        remove(KEY_LOCAL_GPU_VERIFIED_DEVICE, KEY_LOCAL_GPU_VERIFIED_AT)
    }

    fun getPendingLocalGpuInitDevice(): String = getString(KEY_PENDING_LOCAL_GPU_INIT_DEVICE, "")
    fun setPendingLocalGpuInitDevice(value: String) = putString(KEY_PENDING_LOCAL_GPU_INIT_DEVICE, value)

    fun getPendingLocalGpuInitModel(): String = getString(KEY_PENDING_LOCAL_GPU_INIT_MODEL, "")
    fun setPendingLocalGpuInitModel(value: String) = putString(KEY_PENDING_LOCAL_GPU_INIT_MODEL, value)

    fun getPendingLocalGpuInitAt(): Long = getLong(KEY_PENDING_LOCAL_GPU_INIT_AT, 0L)
    fun setPendingLocalGpuInitAt(value: Long) = putLong(KEY_PENDING_LOCAL_GPU_INIT_AT, value)

    fun getPendingLocalGpuInitPid(): Int = getInt(KEY_PENDING_LOCAL_GPU_INIT_PID, 0)
    fun setPendingLocalGpuInitPid(value: Int) = putInt(KEY_PENDING_LOCAL_GPU_INIT_PID, value)

    fun clearPendingLocalGpuInit() {
        remove(
            KEY_PENDING_LOCAL_GPU_INIT_DEVICE,
            KEY_PENDING_LOCAL_GPU_INIT_MODEL,
            KEY_PENDING_LOCAL_GPU_INIT_AT,
            KEY_PENDING_LOCAL_GPU_INIT_PID,
        )
    }

    // ==================== Max Output Tokens ====================
    fun getMaxNumTokens(): Int = getInt(KEY_MAX_NUM_TOKENS, DEFAULT_MAX_NUM_TOKENS)
    fun setMaxNumTokens(value: Int) = putInt(KEY_MAX_NUM_TOKENS, value)
}
