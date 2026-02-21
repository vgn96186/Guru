package expo.modules.applauncher

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import java.io.File

class AppLauncherModule : Module() {
    // Holds the current recording output path so JS can retrieve it after stopRecording
    private var currentRecordingPath: String? = null

    // MediaProjection request handling
    private var projectionDeferred: CompletableDeferred<Boolean>? = null
    private var projectionResultCode: Int = 0
    private var projectionData: Intent? = null

    companion object {
        private const val MEDIA_PROJECTION_RC = 7001
    }

    override fun definition() = ModuleDefinition {
        Name("GuruAppLauncher")

        // ── Activity result handler for MediaProjection ────────────
        OnActivityResult { _, payload ->
            if (payload.requestCode == MEDIA_PROJECTION_RC) {
                projectionResultCode = payload.resultCode
                projectionData = payload.data
                if (payload.resultCode == Activity.RESULT_OK && payload.data != null) {
                    projectionDeferred?.complete(true)
                } else {
                    projectionDeferred?.complete(false)
                }
            }
        }

        AsyncFunction("launchApp") { packageName: String ->
            val context = appContext.reactContext ?: throw Exception("No context")
            val pm = context.packageManager
            val intent = pm.getLaunchIntentForPackage(packageName)
                ?: throw Exception("App not installed: $packageName")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            return@AsyncFunction true
        }

        AsyncFunction("isAppInstalled") { packageName: String ->
            val context = appContext.reactContext ?: return@AsyncFunction false
            return@AsyncFunction try {
                context.packageManager.getPackageInfo(packageName, 0)
                true
            } catch (e: Exception) {
                false
            }
        }

        /**
         * Returns the UID of an installed app, or -1 if not found.
         * Used to filter AudioPlaybackCapture to that specific app.
         */
        AsyncFunction("getAppUid") { packageName: String ->
            val context = appContext.reactContext ?: return@AsyncFunction -1
            return@AsyncFunction try {
                val ai = context.packageManager.getApplicationInfo(packageName, 0)
                ai.uid
            } catch (e: Exception) {
                -1
            }
        }

        /**
         * Requests MediaProjection permission from the user (system dialog).
         * Returns true if granted, false if denied.
         * The projection token is stored on RecordingService.mediaProjection.
         */
        AsyncFunction("requestMediaProjection") { ->
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                // AudioPlaybackCapture not available below Android 10
                return@AsyncFunction false
            }

            val activity = appContext.currentActivity
                ?: throw Exception("No activity")
            val mpm = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE)
                as MediaProjectionManager

            projectionDeferred = CompletableDeferred()
            activity.startActivityForResult(
                mpm.createScreenCaptureIntent(),
                MEDIA_PROJECTION_RC
            )

            // Suspend until OnActivityResult fires
            val granted = runBlocking { projectionDeferred!!.await() }
            projectionDeferred = null

            if (granted && projectionData != null) {
                val projection = mpm.getMediaProjection(projectionResultCode, projectionData!!)
                RecordingService.mediaProjection = projection
            }
            return@AsyncFunction granted
        }

        /**
         * Starts audio recording.
         * @param targetPackage Package name of the app whose audio to capture.
         *                     If empty or null, uses microphone fallback.
         * Returns the absolute path where the .m4a will be saved.
         */
        AsyncFunction("startRecording") { targetPackage: String ->
            val context = appContext.reactContext ?: throw Exception("No context")
            val dir = context.filesDir
            val path = File(dir, "lecture_${System.currentTimeMillis()}.m4a").absolutePath
            currentRecordingPath = path

            // Determine recording mode & target UID
            val useInternal = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && RecordingService.mediaProjection != null
                && targetPackage.isNotEmpty()
            val targetUid = if (useInternal && targetPackage.isNotEmpty()) {
                try {
                    context.packageManager.getApplicationInfo(targetPackage, 0).uid
                } catch (_: Exception) { -1 }
            } else -1

            val intent = Intent(context, RecordingService::class.java).apply {
                action = RecordingService.ACTION_START
                putExtra(RecordingService.EXTRA_OUTPUT_PATH, path)
                putExtra(RecordingService.EXTRA_MODE, if (useInternal) "internal" else "mic")
                putExtra(RecordingService.EXTRA_TARGET_UID, targetUid)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            return@AsyncFunction path
        }

        /**
         * Stops the recorder. Returns the path of the saved file (or null if none).
         * Waits 600ms to ensure file is flushed.
         */
        AsyncFunction("stopRecording") { ->
            val context = appContext.reactContext ?: return@AsyncFunction null as String?
            val path = currentRecordingPath
            currentRecordingPath = null

            val intent = Intent(context, RecordingService::class.java).apply {
                action = RecordingService.ACTION_STOP
            }
            context.startService(intent)
            Thread.sleep(600) // Let encoder flush
            return@AsyncFunction path
        }

        /**
         * Deletes a recording file after transcription to free space.
         */
        AsyncFunction("deleteRecording") { path: String ->
            return@AsyncFunction try { File(path).delete() } catch (e: Exception) { false }
        }

        /**
         * Checks whether the app has SYSTEM_ALERT_WINDOW ("draw over other apps") permission.
         */
        AsyncFunction("canDrawOverlays") { ->
            val context = appContext.reactContext ?: return@AsyncFunction false
            return@AsyncFunction if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else true
        }

        /**
         * Opens system settings to grant SYSTEM_ALERT_WINDOW permission.
         */
        AsyncFunction("requestOverlayPermission") { ->
            val context = appContext.reactContext ?: throw Exception("No context")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    android.net.Uri.parse("package:${context.packageName}")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            }
            return@AsyncFunction true
        }

        /**
         * Shows the floating timer bubble on screen.
         * @param appName Display name of the app being watched.
         * @param faceTracking If true, opens front camera and runs face detection.
         */
        AsyncFunction("showOverlay") { appName: String, faceTracking: Boolean ->
            val context = appContext.reactContext ?: throw Exception("No context")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
                throw Exception("Overlay permission not granted")
            }
            val intent = Intent(context, OverlayService::class.java).apply {
                action = OverlayService.ACTION_SHOW
                putExtra(OverlayService.EXTRA_APP_NAME, appName)
                putExtra(OverlayService.EXTRA_FACE_TRACKING, faceTracking)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            return@AsyncFunction true
        }

        /**
         * Hides the floating timer bubble.
         */
        AsyncFunction("hideOverlay") { ->
            val context = appContext.reactContext ?: return@AsyncFunction true
            val intent = Intent(context, OverlayService::class.java).apply {
                action = OverlayService.ACTION_HIDE
            }
            context.startService(intent)
            return@AsyncFunction true
        }
    }
}
