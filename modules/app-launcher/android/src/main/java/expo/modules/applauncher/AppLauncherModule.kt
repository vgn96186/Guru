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

    // MediaProjection request handling
    private var projectionDeferred: CompletableDeferred<Boolean>? = null
    private var projectionResultCode: Int = 0
    private var projectionData: Intent? = null

    private companion object {
        private const val MEDIA_PROJECTION_RC = 7001
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

        AsyncFunction("startRecording") { targetPackage: String ->
            val context = appContext.reactContext ?: throw Exception("No context")
            // CRITICAL: Save to Public Documents/Guru so it SURVIVES reinstall
            val dir = getPublicGuruDir()
            val path = File(dir, "lecture_${System.currentTimeMillis()}.m4a").absolutePath
            currentRecordingPath = path
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
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }

            // Give the service a moment to start and verify it's actually recording
            runBlocking { delay(500) }
            val f = File(path)
            Log.i(TAG, "startRecording: after 500ms — file exists=${f.exists()}, size=${f.length()}")

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
                Log.w(TAG, "stopRecording: no path stored — returning null")
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
                            Log.w(TAG, "stopRecording: found failure marker — recording never worked")
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
            Log.w(TAG, "stopRecording: after ${waitedMs}ms — exists=${file.exists()}, size=${file.length()}")
            return@AsyncFunction if (file.exists() && file.length() > 0L) path else null
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

        /**
         * Converts an M4A/AAC audio file to 16kHz mono 16-bit PCM WAV.
         * Required because whisper.rn only accepts WAV input.
         * Returns the path to the WAV file, or null on failure.
         */
        AsyncFunction("convertToWav") { inputPath: String ->
            try {
                val wavPath = inputPath.replace(".m4a", ".wav")
                Log.i(TAG, "convertToWav: $inputPath → $wavPath")

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
    }

    /**
     * Simple linear resampling of 16-bit PCM audio.
     * Handles both sample rate conversion and stereo→mono downmix.
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
