package expo.modules.applauncher

import android.content.Context
import android.util.Log
import com.samsung.android.sdk.SsdkVendorCheck
import com.samsung.sdk.sperf.CustomParams
import com.samsung.sdk.sperf.PerformanceManager
import com.samsung.sdk.sperf.SPerf
import com.samsung.sdk.sperf.SPerfListener
import com.samsung.sdk.sperf.SPerfHelper

/**
 * Thin wrapper around Samsung Performance SDK (perfsdk-v1.0.0).
 *
 * Lifecycle:
 *   - init(ctx) once at app start. On non-Samsung devices returns false and all
 *     subsequent calls become no-ops (return -1 / false).
 *   - startPresetBoost / startCustomBoost open a session and return a token
 *     (boostId). stopBoost(token) releases it. Caller is responsible for
 *     pairing these — we never auto-release except via SDK timeout.
 *   - Thermal warnings fire via onThermalWarning (Int level) to a single
 *     consumer callback.
 *
 * Thread-safety: all methods are synchronized on `lock`. SDK calls are cheap
 * (binder IPC), so a coarse lock is fine.
 */
class SamsungPerfController(private val appContext: Context) {
    private val lock = Any()
    private var initialized = false
    private var manager: Any? = null
    private var perfManager: PerformanceManager? = null
    private val activeBoostIds = mutableSetOf<Int>()

    /** Invoked when SDK reports onHighTempWarning(level). Null when unset. */
    var onThermalWarning: ((Int) -> Unit)? = null

    /** Invoked when SDK releases a boost due to its own timeout. */
    var onReleasedByTimeout: (() -> Unit)? = null

    private val listener = object : SPerfListener {
        override fun onHighTempWarning(level: Int) {
            onThermalWarning?.invoke(level)
        }
        override fun onReleasedByTimeout() {
            onReleasedByTimeout?.invoke()
        }
    }

    fun isSamsung(): Boolean = try {
        SsdkVendorCheck.isSamsungDevice()
    } catch (t: Throwable) {
        Log.w(TAG, "SsdkVendorCheck failed", t)
        false
    }

    /** @return true if SDK came up on a Samsung device, false otherwise. */
    fun init(): Boolean = synchronized(lock) {
        if (initialized) return@synchronized true
        if (!isSamsung()) return@synchronized false
        return@synchronized try {
            if (!SPerf.initialize(appContext)) {
                Log.w(TAG, "SPerf.initialize returned false")
                return@synchronized false
            }
            manager = SPerfHelper.initSPerfManager(appContext)
            manager?.let { m ->
                SPerfHelper.addListener(m, listener)
            }
            perfManager = PerformanceManager.getInstance()
            initialized = true
            Log.i(TAG, "SPerf initialized v=${SPerf.getVersionName()}")
            true
        } catch (t: Throwable) {
            Log.w(TAG, "SPerf init threw", t)
            initialized = false
            false
        }
    }

    /** Returns boost id on success, -1 otherwise. */
    fun startPresetBoost(presetType: Int, durationMs: Int): Int = synchronized(lock) {
        if (!initialized) return@synchronized -1
        return@synchronized try {
            val m = manager
            val rc = if (m != null) SPerfHelper.startPresetBoost(m, presetType, durationMs) else -1
            if (rc >= 0) activeBoostIds.add(rc)
            rc
        } catch (t: Throwable) {
            Log.w(TAG, "startPresetBoost threw", t); -1
        }
    }

    /**
     * Custom boost via PerformanceManager.start(CustomParams).
     * pairs = list of (type, value, durationMs) tuples, e.g. (CustomParams.TYPE_CPU_MIN, 1500000, 3000).
     * Returns 0 on success, negative on error.
     */
    fun startCustomBoost(pairs: List<Triple<Int, Int, Int>>): Int = synchronized(lock) {
        if (!initialized) return@synchronized -1
        return@synchronized try {
            val params = CustomParams()
            pairs.forEach { (type, value, duration) -> params.add(type, value, duration) }
            perfManager?.start(params) ?: -1
        } catch (t: Throwable) {
            Log.w(TAG, "startCustomBoost threw", t); -1
        }
    }

    fun stopBoost(boostId: Int): Int = synchronized(lock) {
        if (!initialized) return@synchronized -1
        return@synchronized try {
            val m = manager
            val rc = if (m != null) SPerfHelper.stopBoost(m, boostId) else -1
            activeBoostIds.remove(boostId)
            rc
        } catch (t: Throwable) {
            Log.w(TAG, "stopBoost threw", t); -1
        }
    }

    fun stopAllBoosts(): Int = synchronized(lock) {
        if (!initialized) return@synchronized -1
        val ids = activeBoostIds.toList()
        var last = 0
        ids.forEach { last = stopBoost(it) }
        return@synchronized try {
            perfManager?.stop() ?: last
        } catch (t: Throwable) {
            last
        }
    }

    fun shutdown(): Unit = synchronized(lock) {
        if (!initialized) return@synchronized
        runCatching { stopAllBoosts() }
        initialized = false
        manager = null
        perfManager = null
    }

    companion object {
        private const val TAG = "SamsungPerf"
    }
}