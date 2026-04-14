package expo.modules.localllm

import android.os.Build
import android.os.Process
import android.util.Log

object LocalBackendHealth {

    private const val TAG = "LocalBackendHealth"
    private const val CRASH_MARKER_MAX_AGE_MS = 1000L * 60L * 60L * 24L * 30L
    private const val VERIFIED_GPU_CPU_SAFE_RETRY_COOLDOWN_MS = 1000L * 60L * 60L * 24L
    private val CONSERVATIVE_CPU_MANUFACTURERS = setOf("xiaomi", "redmi", "poco")
    private val CONSERVATIVE_CPU_MODELS = listOf(
        "xiaomi 15",
        "mi 15",
        "galaxy z fold4",
        "sm-f936",
        "z flip7",
        "sm-f766",
    )
    private val CONSERVATIVE_CPU_HARDWARE_HINTS = listOf(
        "mt",
        "mediatek",
        "dimensity",
    )

    fun currentDeviceKey(): String {
        val fingerprint = Build.FINGERPRINT?.trim().orEmpty()
        if (fingerprint.isNotEmpty()) return fingerprint
        return listOf(Build.MANUFACTURER, Build.MODEL, Build.DEVICE, Build.HARDWARE)
            .filter { !it.isNullOrBlank() }
            .joinToString("|")
    }

    fun shouldForceCpu(preferCpu: Boolean): Boolean {
        recoverPendingGpuCrashIfNeeded()
        maybeRearmVerifiedGpu()
        val forceCpu = preferCpu ||
            LocalBackendPrefs.getLocalBackendPreference().equals("CPU", ignoreCase = true) ||
            isCpuSafeModeEnabled() ||
            shouldStartCpuConservatively()
        if (forceCpu && shouldStartCpuConservatively()) {
            Log.w(TAG, "Using conservative CPU-first mode on ${deviceDescriptor()}")
        }
        return forceCpu
    }

    fun isCpuSafeModeEnabled(): Boolean {
        return LocalBackendPrefs.getLocalCpuSafeDevice() == currentDeviceKey()
    }

    fun cpuSafeReason(): String = LocalBackendPrefs.getLocalCpuSafeReason()

    fun hasVerifiedGpuSuccess(): Boolean {
        return LocalBackendPrefs.getLocalGpuVerifiedDevice() == currentDeviceKey() &&
            LocalBackendPrefs.getLocalGpuVerifiedAt() > 0L
    }

    fun debugStateSummary(): String {
        val pendingDevice = LocalBackendPrefs.getPendingLocalGpuInitDevice().ifBlank { "-" }
        val pendingModel = LocalBackendPrefs.getPendingLocalGpuInitModel().ifBlank { "-" }
        val pendingAt = LocalBackendPrefs.getPendingLocalGpuInitAt()
        val pendingPid = LocalBackendPrefs.getPendingLocalGpuInitPid()
        val cpuSafeDevice = LocalBackendPrefs.getLocalCpuSafeDevice().ifBlank { "-" }
        val gpuVerifiedDevice = LocalBackendPrefs.getLocalGpuVerifiedDevice().ifBlank { "-" }
        val gpuVerifiedAt = LocalBackendPrefs.getLocalGpuVerifiedAt()
        val backendPreference = LocalBackendPrefs.getLocalBackendPreference().ifBlank { "-" }
        val reason = cpuSafeReason().ifBlank { "-" }
        val cpuSafeAt = LocalBackendPrefs.getLocalCpuSafeAt()
        return buildString {
            append("device=")
            append(currentDeviceKey())
            append(", cpuSafe=")
            append(isCpuSafeModeEnabled())
            append(", cpuSafeDevice=")
            append(cpuSafeDevice)
            append(", backendPreference=")
            append(backendPreference)
            append(", reason=")
            append(reason)
            append(", cpuSafeAt=")
            append(cpuSafeAt)
            append(", gpuVerified=")
            append(hasVerifiedGpuSuccess())
            append(", gpuVerifiedDevice=")
            append(gpuVerifiedDevice)
            append(", gpuVerifiedAt=")
            append(gpuVerifiedAt)
            append(", conservativeCpu=")
            append(shouldStartCpuConservatively())
            append(", pendingDevice=")
            append(pendingDevice)
            append(", pendingModel=")
            append(pendingModel)
            append(", pendingAt=")
            append(pendingAt)
            append(", pendingPid=")
            append(pendingPid)
        }
    }

    fun debugForceCpuSafe(reason: String = "debug") {
        enableCpuSafeMode(reason)
    }

    fun debugClearCpuSafeMode() {
        LocalBackendPrefs.clearLocalCpuSafeMode()
        if (LocalBackendPrefs.getLocalBackendPreference().equals("CPU", ignoreCase = true)) {
            LocalBackendPrefs.setLocalBackendPreference("")
        }
    }

    fun debugClearGpuVerified() {
        LocalBackendPrefs.clearLocalGpuVerified()
    }

    fun debugMarkPendingGpuInit(modelPath: String) {
        markGpuInitStarted(modelPath)
    }

    fun debugClearPendingGpuInit() {
        LocalBackendPrefs.clearPendingLocalGpuInit()
    }

    fun noteRecoverableGpuFailure(modelPath: String, error: Throwable?) {
        val reason = buildReason("gpu_failure", modelPath, error?.message)
        enableCpuSafeMode(reason)
        LocalBackendPrefs.clearPendingLocalGpuInit()
        Log.w(TAG, "GPU backend marked unsafe for this device: $reason")
    }

    fun noteGpuInitSuccess(modelPath: String) {
        LocalBackendPrefs.setLocalGpuVerifiedDevice(currentDeviceKey())
        LocalBackendPrefs.setLocalGpuVerifiedAt(System.currentTimeMillis())
        LocalBackendPrefs.clearPendingLocalGpuInit()
        Log.i(TAG, "GPU backend verified healthy for ${modelPath.substringAfterLast('/')}")
    }

    fun markGpuInitStarted(modelPath: String) {
        LocalBackendPrefs.setPendingLocalGpuInitDevice(currentDeviceKey())
        LocalBackendPrefs.setPendingLocalGpuInitModel(modelPath)
        LocalBackendPrefs.setPendingLocalGpuInitAt(System.currentTimeMillis())
        LocalBackendPrefs.setPendingLocalGpuInitPid(Process.myPid())
        Log.i(TAG, "Marked GPU init pending for ${modelPath.substringAfterLast('/')}")
    }

    fun markGpuInitFinished() {
        LocalBackendPrefs.clearPendingLocalGpuInit()
    }

    fun recoverPendingGpuCrashIfNeeded(): Boolean {
        val pendingDevice = LocalBackendPrefs.getPendingLocalGpuInitDevice()
        val pendingAt = LocalBackendPrefs.getPendingLocalGpuInitAt()
        val pendingPid = LocalBackendPrefs.getPendingLocalGpuInitPid()
        if (!shouldPromotePendingGpuCrash(currentDeviceKey(), pendingDevice, pendingAt, pendingPid, System.currentTimeMillis())) {
            return false
        }

        val modelPath = LocalBackendPrefs.getPendingLocalGpuInitModel()
        val reason = buildReason("gpu_init_crash", modelPath, "previous GPU engine init died before cleanup")
        enableCpuSafeMode(reason)
        LocalBackendPrefs.clearPendingLocalGpuInit()
        Log.w(TAG, "Recovered pending GPU init crash; forcing CPU-safe mode for this device")
        return true
    }

    internal fun shouldPromotePendingGpuCrash(
        currentDeviceKey: String,
        pendingDeviceKey: String?,
        pendingAtMs: Long,
        pendingPid: Int,
        nowMs: Long,
        maxAgeMs: Long = CRASH_MARKER_MAX_AGE_MS,
    ): Boolean {
        if (pendingDeviceKey.isNullOrBlank()) return false
        if (pendingDeviceKey != currentDeviceKey) return false
        if (pendingAtMs <= 0L) return false
        if (pendingPid > 0 && pendingPid == Process.myPid()) return false
        return nowMs - pendingAtMs <= maxAgeMs
    }

    private fun enableCpuSafeMode(reason: String) {
        val now = System.currentTimeMillis()
        LocalBackendPrefs.setLocalCpuSafeDevice(currentDeviceKey())
        LocalBackendPrefs.setLocalCpuSafeReason(reason)
        LocalBackendPrefs.setLocalCpuSafeAt(now)
        LocalBackendPrefs.setLocalBackendPreference("CPU")
    }

    private fun maybeRearmVerifiedGpu(nowMs: Long = System.currentTimeMillis()) {
        if (!shouldRearmVerifiedGpu(
                isCpuSafeModeEnabled = isCpuSafeModeEnabled(),
                hasVerifiedGpuSuccess = hasVerifiedGpuSuccess(),
                hasPendingGpuInitMarker = hasPendingGpuInitMarker(),
                cpuSafeReason = cpuSafeReason(),
                cpuSafeAtMs = LocalBackendPrefs.getLocalCpuSafeAt(),
                nowMs = nowMs,
            )) {
            return
        }

        Log.w(
            TAG,
            "Re-arming verified GPU backend after stale CPU-safe quarantine on ${deviceDescriptor()}",
        )
        LocalBackendPrefs.clearLocalCpuSafeMode()
        if (LocalBackendPrefs.getLocalBackendPreference().equals("CPU", ignoreCase = true)) {
            LocalBackendPrefs.setLocalBackendPreference("")
        }
    }

    private fun shouldStartCpuConservatively(): Boolean {
        val manufacturer = Build.MANUFACTURER?.trim()?.lowercase().orEmpty()
        val model = Build.MODEL?.trim()?.lowercase().orEmpty()
        val hardware = Build.HARDWARE?.trim()?.lowercase().orEmpty()
        return shouldConservativelyForceCpu(
            manufacturer = manufacturer,
            model = model,
            hardware = hardware,
            hasVerifiedGpuSuccess = hasVerifiedGpuSuccess(),
            isCpuSafeModeEnabled = isCpuSafeModeEnabled(),
        )
    }

    private fun deviceDescriptor(): String {
        return listOf(Build.MANUFACTURER, Build.MODEL, Build.HARDWARE)
            .filter { !it.isNullOrBlank() }
            .joinToString(" / ")
    }

    fun debugDeviceDescriptor(): String = deviceDescriptor()

    fun isConservativeCpuModeSuggested(): Boolean = shouldStartCpuConservatively()

    fun hasPendingGpuInitMarker(): Boolean {
        return shouldPromotePendingGpuCrash(
            currentDeviceKey = currentDeviceKey(),
            pendingDeviceKey = LocalBackendPrefs.getPendingLocalGpuInitDevice(),
            pendingAtMs = LocalBackendPrefs.getPendingLocalGpuInitAt(),
            pendingPid = LocalBackendPrefs.getPendingLocalGpuInitPid(),
            nowMs = System.currentTimeMillis(),
        )
    }

    internal fun shouldConservativelyForceCpu(
        manufacturer: String,
        model: String,
        hardware: String,
        hasVerifiedGpuSuccess: Boolean,
        isCpuSafeModeEnabled: Boolean,
    ): Boolean {
        if (hasVerifiedGpuSuccess) return false
        if (isCpuSafeModeEnabled) return false
        if (manufacturer in CONSERVATIVE_CPU_MANUFACTURERS) return true
        if (CONSERVATIVE_CPU_MODELS.any { model.contains(it) }) return true
        return CONSERVATIVE_CPU_HARDWARE_HINTS.any { hint ->
            hardware.contains(hint) || model.contains(hint)
        }
    }

    private fun buildReason(prefix: String, modelPath: String, detail: String?): String {
        val modelName = modelPath.substringAfterLast('/')
        return listOf(prefix, modelName, detail?.take(120))
            .filter { !it.isNullOrBlank() }
            .joinToString(": ")
    }

    internal fun shouldRearmVerifiedGpu(
        isCpuSafeModeEnabled: Boolean,
        hasVerifiedGpuSuccess: Boolean,
        hasPendingGpuInitMarker: Boolean,
        cpuSafeReason: String,
        cpuSafeAtMs: Long,
        nowMs: Long,
        cooldownMs: Long = VERIFIED_GPU_CPU_SAFE_RETRY_COOLDOWN_MS,
    ): Boolean {
        if (!isCpuSafeModeEnabled) return false
        if (!hasVerifiedGpuSuccess) return false
        if (hasPendingGpuInitMarker) return false
        if (!cpuSafeReason.startsWith("gpu_init_crash")) return false
        if (cpuSafeAtMs <= 0L) return false
        return nowMs - cpuSafeAtMs >= cooldownMs
    }
}