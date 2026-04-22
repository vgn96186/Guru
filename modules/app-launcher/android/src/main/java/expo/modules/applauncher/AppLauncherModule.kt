package expo.modules.applauncher

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.delay
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import android.os.Environment
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

class AppLauncherModule : Module() {
    // Holds the current recording output path so JS can retrieve it after stopRecording
    private var currentRecordingPath: String? = null
    private var currentLiveTranscriptPath: String? = null
    private var currentLectureInsightPath: String? = null

    // MediaProjection request handling
    private var projectionDeferred: CompletableDeferred<Boolean>? = null
    private var projectionResultCode: Int = 0
    private var projectionData: Intent? = null

    // SAF folder picker handling â€” returns { treeUri, label, entries[] }
    private var folderPickerDeferred: CompletableDeferred<Map<String, Any>>? = null

    private companion object {
        private const val MEDIA_PROJECTION_RC = 7001
        private const val FOLDER_PICKER_RC = 7002
        private const val TAG = "GuruAppLauncher"
        private const val WAV_HEADER_BYTES = 44
        private const val WAV_BYTES_PER_SECOND = 16_000 * 1 * 2 // 16kHz mono 16-bit
    }

    private fun buildWavHeader(dataSize: Int): ByteArray {
        val header = ByteBuffer.allocate(WAV_HEADER_BYTES).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray(Charsets.US_ASCII))
        header.putInt(36 + dataSize)
        header.put("WAVE".toByteArray(Charsets.US_ASCII))
        header.put("fmt ".toByteArray(Charsets.US_ASCII))
        header.putInt(16) // PCM format chunk size
        header.putShort(1) // PCM
        header.putShort(1) // Mono
        header.putInt(16_000) // Sample rate
        header.putInt(32_000) // Byte rate
        header.putShort(2) // Block align
        header.putShort(16) // Bits per sample
        header.put("data".toByteArray(Charsets.US_ASCII))
        header.putInt(dataSize)
        return header.array()
    }

    private fun getPublicGuruDir(): File {
        val publicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
        val guruDir = File(publicDir, "Guru/Recordings")
        if (!guruDir.exists()) {
            guruDir.mkdirs()
        }
        return if (guruDir.exists()) guruDir else appContext.reactContext?.filesDir ?: File("/tmp")
    }

    private fun getPublicGuruRoot(): File {
        val publicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
        val guruDir = File(publicDir, "Guru")
        if (!guruDir.exists()) guruDir.mkdirs()
        return if (guruDir.exists()) guruDir else appContext.reactContext?.filesDir ?: File("/tmp")
    }

    /**
     * Recursively collects all .m4a files under Documents/Guru/.
     * Returns a list of maps with { name, path, size }.
     */
    private fun findAllM4aFiles(dir: File): List<Map<String, Any>> {
        val results = mutableListOf<Map<String, Any>>()
        val files = dir.listFiles() ?: return results
        for (f in files) {
            if (f.isDirectory) {
                results.addAll(findAllM4aFiles(f))
            } else if (f.name.endsWith(".m4a", ignoreCase = true) && f.length() > 100) {
                results.add(mapOf(
                    "name" to f.name,
                    "path" to f.absolutePath,
                    "size" to f.length()
                ))
            }
        }
        return results
    }

    private fun findLocalModelFiles(dir: File, maxDepth: Int = 6, depth: Int = 0): List<Map<String, Any>> {
        if (!dir.exists() || !dir.isDirectory || depth > maxDepth) return emptyList()
        val files = try {
            dir.listFiles() ?: return emptyList()
        } catch (e: Exception) {
            return emptyList()
        }

        val results = mutableListOf<Map<String, Any>>()
        for (f in files) {
            if (f.isDirectory) {
                results.addAll(findLocalModelFiles(f, maxDepth, depth + 1))
            } else if ((f.name.endsWith(".litertlm", ignoreCase = true) || f.name.endsWith(".bin", ignoreCase = true)) && f.length() > 100) {
                results.add(
                    mapOf(
                        "name" to f.name,
                        "path" to "file://" + f.absolutePath,
                        "size" to f.length(),
                        "modifiedAt" to f.lastModified(),
                    ),
                )
            }
        }
        return results
    }

    private fun getCandidateModelSearchRoots(): List<File> {
        val roots = mutableListOf<File>()
        val context = appContext.reactContext
        val primary = Environment.getExternalStorageDirectory()
        roots.add(primary)
        roots.add(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS))
        roots.add(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS))
        roots.add(getPublicGuruRoot())

        context?.getExternalFilesDirs(null)?.forEach { dir ->
            if (dir != null) {
                roots.add(dir)
                dir.parentFile?.parentFile?.parentFile?.let { roots.add(it) }
            }
        }

        return roots.distinctBy { it.absolutePath }
    }

    /**
     * Walks a SAF document tree URI and collects all .m4a files.
     * Returns list of maps with { name, path (content URI string), size }.
     */
    private fun walkDocumentTree(context: Context, treeUri: android.net.Uri): List<Map<String, Any>> {
        val results = mutableListOf<Map<String, Any>>()
        val docUri = androidx.documentfile.provider.DocumentFile.fromTreeUri(context, treeUri) ?: return results
        walkDocumentFileRecursive(docUri, results)
        return results
    }

    private fun walkDocumentFileRecursive(
        dir: androidx.documentfile.provider.DocumentFile,
        results: MutableList<Map<String, Any>>
    ) {
        for (file in dir.listFiles()) {
            if (file.isDirectory) {
                walkDocumentFileRecursive(file, results)
            } else if (file.name?.endsWith(".m4a", ignoreCase = true) == true && file.length() > 100) {
                results.add(mapOf(
                    "name" to (file.name ?: "unknown.m4a"),
                    "path" to file.uri.toString(),
                    "size" to file.length()
                ))
            }
        }
    }

    private fun getPublicGuruBackupDir(): File {
        val publicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
        val dir = File(publicDir, "Guru/Backups")
        if (!dir.exists()) dir.mkdirs()
        return if (dir.exists()) dir else appContext.reactContext?.filesDir ?: File("/tmp")
    }

    private fun splitWavIntoChunksNative(
        wavPath: String,
        chunkDataBytes: Int,
        stepBytes: Int,
        minChunkBytes: Int,
    ): List<Map<String, Any>> {
        val wavFile = File(wavPath)
        if (!wavFile.exists() || wavFile.length() <= WAV_HEADER_BYTES) return emptyList()

        val safeChunkBytes = if (chunkDataBytes <= 0) WAV_BYTES_PER_SECOND * 60 else chunkDataBytes
        val safeStepBytes = when {
            stepBytes <= 0 -> safeChunkBytes
            stepBytes > safeChunkBytes -> safeChunkBytes
            else -> stepBytes
        }
        val safeMinChunkBytes = if (minChunkBytes <= 0) WAV_BYTES_PER_SECOND else minChunkBytes

        val chunkDir = File(
            wavFile.parentFile ?: File("/tmp"),
            "wav-chunks-${System.currentTimeMillis()}",
        )
        chunkDir.mkdirs()

        val chunks = mutableListOf<Map<String, Any>>()
        RandomAccessFile(wavFile, "r").use { raf ->
            val totalSize = raf.length()
            var dataOffset = WAV_HEADER_BYTES.toLong()
            var chunkIndex = 0

            while (dataOffset < totalSize) {
                val remaining = (totalSize - dataOffset).toInt()
                val thisChunkBytes = minOf(safeChunkBytes, remaining)
                if (thisChunkBytes < safeMinChunkBytes) break

                val pcmData = ByteArray(thisChunkBytes)
                raf.seek(dataOffset)
                raf.readFully(pcmData)

                val chunkFile = File(chunkDir, "chunk_${chunkIndex.toString().padStart(3, '0')}.wav")
                FileOutputStream(chunkFile).use { out ->
                    out.write(buildWavHeader(thisChunkBytes))
                    out.write(pcmData)
                    out.flush()
                }

                val startSec = (dataOffset - WAV_HEADER_BYTES).toDouble() / WAV_BYTES_PER_SECOND.toDouble()
                val durationSec = thisChunkBytes.toDouble() / WAV_BYTES_PER_SECOND.toDouble()
                chunks.add(
                    mapOf(
                        "path" to chunkFile.absolutePath,
                        "startSec" to startSec,
                        "durationSec" to durationSec,
                    ),
                )

                dataOffset += safeStepBytes.toLong()
                chunkIndex += 1
            }
        }

        return chunks
    }

    override fun definition() = ModuleDefinition {
        Name("GuruAppLauncher")

        AsyncFunction("copyFileToPublicBackup") { sourcePath: String, destFilename: String ->
            return@AsyncFunction try {
                val sourceFile = File(sourcePath)
                if (!sourceFile.exists()) return@AsyncFunction false
                val destFile = File(getPublicGuruBackupDir(), destFilename)
                sourceFile.copyTo(destFile, overwrite = true)
                true
            } catch (e: Exception) {
                Log.e(TAG, "copyFileToPublicBackup failed", e)
                false
            }
        }

        AsyncFunction("copyFileFromPublicBackup") { filename: String, destPath: String ->
            return@AsyncFunction try {
                val sourceFile = File(getPublicGuruBackupDir(), filename)
                if (!sourceFile.exists()) return@AsyncFunction false
                val destFile = File(destPath)
                sourceFile.copyTo(destFile, overwrite = true)
                true
            } catch (e: Exception) {
                Log.e(TAG, "copyFileFromPublicBackup failed", e)
                false
            }
        }

        AsyncFunction("listPublicBackups") { ->
            return@AsyncFunction try {
                getPublicGuruBackupDir().list()?.toList() ?: emptyList<String>()
            } catch (e: Exception) {
                Log.e(TAG, "listPublicBackups failed", e)
                emptyList<String>()
            }
        }

        AsyncFunction("getPublicBackupDir") { ->
            return@AsyncFunction getPublicGuruBackupDir().absolutePath
        }

        AsyncFunction("listPublicRecordings") { ->
            return@AsyncFunction try {
                getPublicGuruDir().list()?.toList() ?: emptyList<String>()
            } catch (e: Exception) {
                Log.e(TAG, "listPublicRecordings failed", e)
                emptyList<String>()
            }
        }

        AsyncFunction("getPublicRecordingsDir") { ->
            return@AsyncFunction getPublicGuruDir().absolutePath
        }

        AsyncFunction("hasAllFilesAccess") { ->
            return@AsyncFunction if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Environment.isExternalStorageManager()
            } else {
                true // pre-Android 11, READ_EXTERNAL_STORAGE suffices
            }
        }

        AsyncFunction("requestAllFilesAccess") { ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
                val activity = appContext.currentActivity ?: throw Exception("No activity")
                try {
                    val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                    intent.data = android.net.Uri.parse("package:" + activity.packageName)
                    activity.startActivity(intent)
                } catch (e: Exception) {
                    val intent = Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                    activity.startActivity(intent)
                }
                return@AsyncFunction true
            }
            return@AsyncFunction false
        }

        AsyncFunction("findAllRecordings") { ->
            return@AsyncFunction try {
                findAllM4aFiles(getPublicGuruRoot())
            } catch (e: Exception) {
                Log.e(TAG, "findAllRecordings failed", e)
                emptyList<Map<String, Any>>()
            }
        }

        AsyncFunction("findLocalModelFiles") { ->
            return@AsyncFunction try {
                val deduped = linkedMapOf<String, Map<String, Any>>()
                for (root in getCandidateModelSearchRoots()) {
                    for (entry in findLocalModelFiles(root)) {
                        val path = entry["path"] as? String ?: continue
                        val existing = deduped[path]
                        if (existing == null) {
                            deduped[path] = entry
                        }
                    }
                }
                deduped.values.toList()
            } catch (e: Exception) {
                Log.e(TAG, "findLocalModelFiles failed", e)
                emptyList<Map<String, Any>>()
            }
        }

        AsyncFunction("scanPathForRecordings") { absolutePath: String ->
            return@AsyncFunction try {
                val dir = File(absolutePath)
                if (dir.exists() && dir.isDirectory) {
                    findAllM4aFiles(dir)
                } else {
                    emptyList<Map<String, Any>>()
                }
            } catch (e: Exception) {
                Log.e(TAG, "scanPathForRecordings failed for $absolutePath", e)
                emptyList<Map<String, Any>>()
            }
        }

        AsyncFunction("scanSafUri") { uriString: String ->
            return@AsyncFunction try {
                val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
                val uri = android.net.Uri.parse(uriString)
                walkDocumentTree(context, uri)
            } catch (e: Exception) {
                Log.e(TAG, "scanSafUri failed for $uriString", e)
                emptyList<Map<String, Any>>()
            }
        }

        // â”€â”€ Activity result handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        OnActivityResult { _, payload ->
            if (payload.requestCode == MEDIA_PROJECTION_RC) {
                projectionResultCode = payload.resultCode
                projectionData = payload.data
                if (payload.resultCode == Activity.RESULT_OK && payload.data != null) {
                    projectionDeferred?.complete(true)
                } else {
                    projectionDeferred?.complete(false)
                }
            } else if (payload.requestCode == FOLDER_PICKER_RC) {
                if (payload.resultCode == Activity.RESULT_OK && payload.data?.data != null) {
                    val treeUri = payload.data!!.data!!
                    val context = appContext.reactContext
                    if (context != null) {
                        // Persist read permission across reboots
                        try {
                            context.contentResolver.takePersistableUriPermission(
                                treeUri,
                                Intent.FLAG_GRANT_READ_URI_PERMISSION
                            )
                        } catch (e: Exception) {
                            Log.w(TAG, "Could not persist URI permission", e)
                        }
                        val entries = walkDocumentTree(context, treeUri)
                        // Derive a human-readable label from the URI
                        val decoded = java.net.URLDecoder.decode(treeUri.toString(), "UTF-8")
                        val label = decoded.substringAfterLast(":").substringAfterLast("/").ifEmpty { "Custom folder" }
                        folderPickerDeferred?.complete(mapOf(
                            "treeUri" to treeUri.toString(),
                            "label" to label,
                            "entries" to entries
                        ))
                    } else {
                        folderPickerDeferred?.complete(emptyMap())
                    }
                } else {
                    // User cancelled
                    folderPickerDeferred?.complete(emptyMap())
                }
            }
        }

        AsyncFunction("pickFolderAndScan") { ->
            val activity = appContext.currentActivity
                ?: throw Exception("No activity")

            folderPickerDeferred = CompletableDeferred()
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            }
            activity.startActivityForResult(intent, FOLDER_PICKER_RC)

            // Expo's AsyncFunction runs on a separate thread, so runBlocking is safe.
            val results = runBlocking { folderPickerDeferred!!.await() }
            folderPickerDeferred = null
            return@AsyncFunction results
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

            // Properly suspend without deadlocking the main thread!
            // Note: Expo's AsyncFunction runs on a separate thread, so runBlocking here is safe.
            val granted = runBlocking { projectionDeferred!!.await() }
            projectionDeferred = null

            if (granted && projectionData != null) {
                val projection = mpm.getMediaProjection(projectionResultCode, projectionData!!)
                RecordingService.mediaProjection = projection
            }
            return@AsyncFunction granted
        }

        AsyncFunction("startRecording") { targetPackage: String, deepgramKey: String?, groqKey: String? ->
            val context = appContext.reactContext ?: throw Exception("No context")
            // CRITICAL: Save to Public Documents/Guru so it SURVIVES reinstall
            val dir = getPublicGuruDir()
            val timestamp = System.currentTimeMillis()
            val path = File(dir, "lecture_${timestamp}.m4a").absolutePath
            val liveTranscriptPath = File(dir, "lecture_${timestamp}.live.txt").absolutePath
            val lectureInsightPath = File(dir, "lecture_${timestamp}.quiz.json").absolutePath
            currentRecordingPath = path
            currentLiveTranscriptPath = liveTranscriptPath
            currentLectureInsightPath = lectureInsightPath
            // ...

            // Determine recording mode & target UID
            val useInternal = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && RecordingService.mediaProjection != null
                && targetPackage.isNotEmpty()
            val targetUid = if (useInternal && targetPackage.isNotEmpty()) {
                try {
                    context.packageManager.getApplicationInfo(targetPackage, 0).uid
                } catch (_: Exception) { -1 }
            } else -1

            val mode = if (useInternal) "internal" else "mic"
            Log.i(TAG, "startRecording: mode=$mode, target=$targetPackage, uid=$targetUid, path=$path")

            val intent = Intent(context, RecordingService::class.java).apply {
                action = RecordingService.ACTION_START
                putExtra(RecordingService.EXTRA_OUTPUT_PATH, path)
                putExtra(RecordingService.EXTRA_MODE, mode)
                putExtra(RecordingService.EXTRA_TARGET_UID, targetUid)
                putExtra(RecordingService.EXTRA_LIVE_TRANSCRIPTION_KEY, deepgramKey)
                putExtra(RecordingService.EXTRA_LIVE_TRANSCRIPT_PATH, liveTranscriptPath)
                putExtra(RecordingService.EXTRA_INSIGHT_GENERATION_KEY, groqKey)
                putExtra(RecordingService.EXTRA_LECTURE_INSIGHT_PATH, lectureInsightPath)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }

            // Give the service a moment to start and verify it's actually recording
            runBlocking { delay(500) }
            val f = File(path)
            Log.i(TAG, "startRecording: after 500ms â€” file exists=${f.exists()}, size=${f.length()}")

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
            currentLiveTranscriptPath = null
            currentLectureInsightPath = null

            Log.i(TAG, "stopRecording: path=$path")

            // Send stop command to RecordingService
            try {
                val intent = Intent(context, RecordingService::class.java).apply {
                    action = RecordingService.ACTION_STOP
                }
                context.startService(intent)
            } catch (e: Exception) {
                Log.w(TAG, "stopRecording: failed to send stop intent (service may already be dead)", e)
            }

            if (path == null) {
                Log.w(TAG, "stopRecording: no path stored â€” returning null")
                return@AsyncFunction null as String?
            }

            // Wait for encoder/muxer flush and file fsync (up to 4s)
            var waitedMs = 0
            while (waitedMs < 4000) {
                val file = File(path)
                if (file.exists() && file.length() > 0L) {
                    // Check it's not our failure marker
                    if (file.length() < 50L) {
                        val content = try { file.readText() } catch (_: Exception) { "" }
                        if (content.startsWith("RECORDING_FAILED")) {
                            Log.w(TAG, "stopRecording: found failure marker â€” recording never worked")
                            try { file.delete() } catch (_: Exception) {}
                            return@AsyncFunction null as String?
                        }
                    }
                    Log.i(TAG, "stopRecording: file OK, size=${file.length()}, returning path")
                    return@AsyncFunction path
                }
                runBlocking { delay(250) }
                waitedMs += 250
            }

            val file = File(path)
            Log.w(TAG, "stopRecording: after ${waitedMs}ms â€” exists=${file.exists()}, size=${file.length()}")
            return@AsyncFunction if (file.exists() && file.length() > 0L) path else null
        }

        AsyncFunction("readLiveTranscript") { recordingPath: String ->
            return@AsyncFunction try {
                val transcriptPath =
                    recordingPath.replace(Regex("\\.[^.]+$"), ".live.txt")
                val transcriptFile = File(transcriptPath)
                if (!transcriptFile.exists()) {
                    null
                } else {
                    transcriptFile.readText().trim().ifBlank { null }
                }
            } catch (e: Exception) {
                Log.w(TAG, "readLiveTranscript failed for $recordingPath", e)
                null
            }
        }

        AsyncFunction("readLectureInsights") { recordingPath: String ->
            return@AsyncFunction try {
                val insightPath = recordingPath.replace(Regex("\\.[^.]+$"), ".quiz.json")
                val insightFile = File(insightPath)
                if (!insightFile.exists()) {
                    null
                } else {
                    insightFile.readText().trim().ifBlank { null }
                }
            } catch (e: Exception) {
                Log.w(TAG, "readLectureInsights failed for $recordingPath", e)
                null
            }
        }

        AsyncFunction("pauseRecording") { ->
            val context = appContext.reactContext ?: return@AsyncFunction false
            
            val intentRec = Intent(context, RecordingService::class.java).apply {
                action = RecordingService.ACTION_PAUSE
            }
            context.startService(intentRec)

            val intentOv = Intent(context, OverlayService::class.java).apply {
                action = OverlayService.ACTION_PAUSE
            }
            context.startService(intentOv)

            return@AsyncFunction true
        }

        AsyncFunction("resumeRecording") { ->
            val context = appContext.reactContext ?: return@AsyncFunction false

            val intentRec = Intent(context, RecordingService::class.java).apply {
                action = RecordingService.ACTION_RESUME
            }
            context.startService(intentRec)

            val intentOv = Intent(context, OverlayService::class.java).apply {
                action = OverlayService.ACTION_RESUME
            }
            context.startService(intentOv)

            return@AsyncFunction true
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
        AsyncFunction("showOverlay") { appName: String, faceTracking: Boolean, pomodoroEnabled: Boolean, pomodoroIntervalMinutes: Int ->
            val context = appContext.reactContext ?: throw Exception("No context")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
                throw Exception("Overlay permission not granted")
            }
            val intent = Intent(context, OverlayService::class.java).apply {
                action = OverlayService.ACTION_SHOW
                putExtra(OverlayService.EXTRA_APP_NAME, appName)
                putExtra(OverlayService.EXTRA_FACE_TRACKING, faceTracking)
                putExtra(OverlayService.EXTRA_POMODORO_ENABLED, pomodoroEnabled)
                putExtra(OverlayService.EXTRA_POMODORO_INTERVAL, pomodoroIntervalMinutes)
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

        /**
         * Validates a recording file exists and has real audio data.
         * Returns an object with { exists: boolean, size: number } from native File API.
         * This bypasses any JS file-system path-format issues.
         */
        AsyncFunction("validateRecordingFile") { path: String ->
            val file = File(path)
            val exists = file.exists()
            val size = if (exists) file.length() else 0L
            Log.i(TAG, "validateRecordingFile: path=$path, exists=$exists, size=$size")
            // Check for failure marker
            if (exists && size < 50L) {
                val content = try { file.readText() } catch (_: Exception) { "" }
                if (content.startsWith("RECORDING_FAILED")) {
                    Log.w(TAG, "validateRecordingFile: failure marker detected")
                    return@AsyncFunction mapOf("exists" to false, "size" to 0L)
                }
            }
            return@AsyncFunction mapOf("exists" to exists, "size" to size)
        }

        AsyncFunction("isRecordingActive") { ->
            return@AsyncFunction RecordingService.isServiceRunning
        }

        AsyncFunction("getRecordingElapsedSeconds") { ->
            return@AsyncFunction RecordingService.getElapsedRecordingSeconds()
        }

        AsyncFunction("isOverlayActive") { ->
            return@AsyncFunction OverlayService.isServiceRunning && OverlayService.isOverlayVisible
        }

        AsyncFunction("consumeLectureReturnRequest") { ->
            val context = appContext.reactContext ?: return@AsyncFunction false
            val prefs = context.getSharedPreferences(OverlayService.PREFS_NAME, Context.MODE_PRIVATE)
            val requested = prefs.getBoolean(OverlayService.PREF_RETURN_REQUESTED, false)
            if (requested) {
                prefs.edit().putBoolean(OverlayService.PREF_RETURN_REQUESTED, false).apply()
            }
            return@AsyncFunction requested
        }

        AsyncFunction("consumePomodoroBreakRequest") { ->
            val context = appContext.reactContext ?: return@AsyncFunction false
            val prefs = context.getSharedPreferences(OverlayService.PREFS_NAME, Context.MODE_PRIVATE)
            val requested = prefs.getBoolean(OverlayService.PREF_POMODORO_BREAK_REQUESTED, false)
            if (requested) {
                prefs.edit().putBoolean(OverlayService.PREF_POMODORO_BREAK_REQUESTED, false).apply()
            }
            return@AsyncFunction requested
        }

        /**
         * Converts an M4A/AAC audio file to 16kHz mono 16-bit PCM WAV.
         * Required because whisper.rn only accepts WAV input.
         * Returns the path to the WAV file, or null on failure.
         */
        AsyncFunction("convertToWav") { inputPath: String ->
            try {
                val wavPath = inputPath.replace(".m4a", ".wav")
                Log.i(TAG, "convertToWav: $inputPath â†’ $wavPath")

                val extractor = MediaExtractor()
                extractor.setDataSource(inputPath)

                // Find audio track
                var audioTrackIdx = -1
                for (i in 0 until extractor.trackCount) {
                    val fmt = extractor.getTrackFormat(i)
                    val mime = fmt.getString(MediaFormat.KEY_MIME) ?: ""
                    if (mime.startsWith("audio/")) {
                        audioTrackIdx = i
                        break
                    }
                }
                if (audioTrackIdx < 0) {
                    Log.w(TAG, "convertToWav: no audio track found")
                    extractor.release()
                    return@AsyncFunction null as String?
                }

                extractor.selectTrack(audioTrackIdx)
                val inputFormat = extractor.getTrackFormat(audioTrackIdx)
                val mime = inputFormat.getString(MediaFormat.KEY_MIME) ?: "audio/mp4a-latm"
                val sampleRate = inputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                val channels = inputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                Log.i(TAG, "convertToWav: input mime=$mime, rate=$sampleRate, ch=$channels")

                // Create decoder
                val decoder = MediaCodec.createDecoderByType(mime)
                decoder.configure(inputFormat, null, null, 0)
                decoder.start()

                val targetRate = 16000
                val targetChannels = 1
                
                var totalWavDataSize = 0
                val wavFile = java.io.File(wavPath)
                
                java.io.RandomAccessFile(wavFile, "rw").use { raf ->
                    // Reserve space for WAV header (44 bytes)
                    raf.write(ByteArray(44))

                    val bufInfo = MediaCodec.BufferInfo()
                    var inputEos = false
                    var outputEos = false
                    val timeoutUs = 10_000L

                    while (!outputEos) {
                        // Feed input
                        if (!inputEos) {
                            val inIdx = decoder.dequeueInputBuffer(timeoutUs)
                            if (inIdx >= 0) {
                                val inBuf = decoder.getInputBuffer(inIdx)!!
                                val readSize = extractor.readSampleData(inBuf, 0)
                                if (readSize < 0) {
                                    decoder.queueInputBuffer(inIdx, 0, 0, 0,
                                        MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                    inputEos = true
                                } else {
                                    decoder.queueInputBuffer(inIdx, 0, readSize,
                                        extractor.sampleTime, 0)
                                    extractor.advance()
                                }
                            }
                        }

                        // Drain output
                        val outIdx = decoder.dequeueOutputBuffer(bufInfo, timeoutUs)
                        if (outIdx >= 0) {
                            if (bufInfo.size > 0) {
                                val outBuf = decoder.getOutputBuffer(outIdx)!!
                                val chunk = ByteArray(bufInfo.size)
                                outBuf.get(chunk)
                                
                                val finalChunk = if (sampleRate != targetRate || channels != targetChannels) {
                                    resamplePcm(chunk, sampleRate, channels, targetRate, targetChannels)
                                } else {
                                    chunk
                                }
                                
                                raf.write(finalChunk)
                                totalWavDataSize += finalChunk.size
                            }
                            decoder.releaseOutputBuffer(outIdx, false)
                            if (bufInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                                outputEos = true
                            }
                        }
                    }

                    decoder.stop()
                    decoder.release()
                    extractor.release()

                    // Write proper WAV header at the beginning
                    raf.seek(0)
                    val bytesPerSample = 2
                    val byteRate = targetRate * targetChannels * bytesPerSample
                    val blockAlign = targetChannels * bytesPerSample
                    val headerSize = 44

                    val buf = ByteBuffer.allocate(headerSize).order(ByteOrder.LITTLE_ENDIAN)
                    buf.put("RIFF".toByteArray())
                    buf.putInt(totalWavDataSize + headerSize - 8)
                    buf.put("WAVE".toByteArray())
                    buf.put("fmt ".toByteArray())
                    buf.putInt(16)
                    buf.putShort(1)
                    buf.putShort(targetChannels.toShort())
                    buf.putInt(targetRate)
                    buf.putInt(byteRate)
                    buf.putShort(blockAlign.toShort())
                    buf.putShort((bytesPerSample * 8).toShort())
                    buf.put("data".toByteArray())
                    buf.putInt(totalWavDataSize)

                    raf.write(buf.array())
                }

                Log.i(TAG, "convertToWav: wrote WAV file ${wavFile.length()} bytes")

                return@AsyncFunction wavPath
            } catch (e: Exception) {
                Log.e(TAG, "convertToWav failed", e)
                return@AsyncFunction null as String?
            }
        }

        /**
         * Split a WAV file into chunk WAV files using native byte-level I/O.
         * Returns: [{ path, startSec, durationSec }]
         */
        AsyncFunction("splitWavIntoChunks") {
            wavPath: String,
            chunkDataBytes: Int,
            stepBytes: Int,
            minChunkBytes: Int ->
            return@AsyncFunction try {
                splitWavIntoChunksNative(
                    wavPath = wavPath,
                    chunkDataBytes = chunkDataBytes,
                    stepBytes = stepBytes,
                    minChunkBytes = minChunkBytes,
                )
            } catch (e: Exception) {
                Log.e(TAG, "splitWavIntoChunks failed", e)
                emptyList<Map<String, Any>>()
            }
        }

        AsyncFunction("concatenateFiles") { inputPaths: List<String>, outputPath: String ->
            return@AsyncFunction try {
                FileOutputStream(File(outputPath)).use { output ->
                    val buffer = ByteArray(65536)
                    for (inputPath in inputPaths) {
                        java.io.FileInputStream(File(inputPath)).use { input ->
                            var bytesRead: Int
                            while (input.read(buffer).also { bytesRead = it } != -1) {
                                output.write(buffer, 0, bytesRead)
                            }
                        }
                    }
                }
                true
            } catch (e: Exception) {
                Log.e(TAG, "concatenateFiles failed", e)
                false
            }
        }
    }

    /**
     * Simple linear resampling of 16-bit PCM audio.
     * Handles both sample rate conversion and stereoâ†’mono downmix.
     */
    private fun resamplePcm(
        input: ByteArray, srcRate: Int, srcChannels: Int,
        dstRate: Int, dstChannels: Int
    ): ByteArray {
        val bytesPerSample = 2 // 16-bit
        val srcFrameSize = bytesPerSample * srcChannels
        val srcFrames = input.size / srcFrameSize
        val dstFrames = (srcFrames.toLong() * dstRate / srcRate).toInt()

        val srcBuf = ByteBuffer.wrap(input).order(ByteOrder.LITTLE_ENDIAN)
        val dstBuf = ByteBuffer.allocate(dstFrames * bytesPerSample * dstChannels)
            .order(ByteOrder.LITTLE_ENDIAN)

        for (i in 0 until dstFrames) {
            val srcPos = (i.toLong() * srcFrames / dstFrames).toInt()
                .coerceIn(0, srcFrames - 1)
            val bytePos = srcPos * srcFrameSize

            // Read source sample(s) and mix to mono if needed
            var sample = 0
            for (ch in 0 until srcChannels) {
                sample += srcBuf.getShort(bytePos + ch * bytesPerSample).toInt()
            }
            sample /= srcChannels
            dstBuf.putShort(sample.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort())
        }

        return dstBuf.array()
    }

    /**
     * Writes a standard WAV file with 16-bit PCM data.
     */
    private fun writeWavFile(path: String, pcmData: ByteArray, sampleRate: Int, channels: Int) {
        val bytesPerSample = 2
        val byteRate = sampleRate * channels * bytesPerSample
        val blockAlign = channels * bytesPerSample
        val dataSize = pcmData.size
        val headerSize = 44

        FileOutputStream(path).use { fos ->
            val buf = ByteBuffer.allocate(headerSize).order(ByteOrder.LITTLE_ENDIAN)
            // RIFF header
            buf.put("RIFF".toByteArray())
            buf.putInt(dataSize + headerSize - 8) // file size - 8
            buf.put("WAVE".toByteArray())
            // fmt sub-chunk
            buf.put("fmt ".toByteArray())
            buf.putInt(16)              // sub-chunk size
            buf.putShort(1)             // PCM format
            buf.putShort(channels.toShort())
            buf.putInt(sampleRate)
            buf.putInt(byteRate)
            buf.putShort(blockAlign.toShort())
            buf.putShort((bytesPerSample * 8).toShort()) // bits per sample
            // data sub-chunk
            buf.put("data".toByteArray())
            buf.putInt(dataSize)

            fos.write(buf.array())
            fos.write(pcmData)
        }
    }
}
