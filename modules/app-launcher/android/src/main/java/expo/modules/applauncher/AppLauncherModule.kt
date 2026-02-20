package expo.modules.applauncher

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class AppLauncherModule : Module() {
    // Holds the current recording output path so JS can retrieve it after stopRecording
    private var currentRecordingPath: String? = null

    override fun definition() = ModuleDefinition {
        Name("GuruAppLauncher")

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
         * Starts a foreground-service mic recorder.
         * Returns the absolute path where the .m4a will be saved.
         */
        AsyncFunction("startRecording") { ->
            val context = appContext.reactContext ?: throw Exception("No context")
            val dir = context.filesDir
            val path = File(dir, "lecture_${System.currentTimeMillis()}.m4a").absolutePath
            currentRecordingPath = path

            val intent = Intent(context, RecordingService::class.java).apply {
                action = RecordingService.ACTION_START
                putExtra(RecordingService.EXTRA_OUTPUT_PATH, path)
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
         * Waits 600ms to ensure MediaRecorder flushes the file.
         */
        AsyncFunction("stopRecording") { ->
            val context = appContext.reactContext ?: return@AsyncFunction null as String?
            val path = currentRecordingPath
            currentRecordingPath = null

            val intent = Intent(context, RecordingService::class.java).apply {
                action = RecordingService.ACTION_STOP
            }
            context.startService(intent)
            Thread.sleep(600) // Let MediaRecorder flush
            return@AsyncFunction path
        }

        /**
         * Deletes a recording file after transcription to free space.
         */
        AsyncFunction("deleteRecording") { path: String ->
            return@AsyncFunction try { File(path).delete() } catch (e: Exception) { false }
        }
    }
}
