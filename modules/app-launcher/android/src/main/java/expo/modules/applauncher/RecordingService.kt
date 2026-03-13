package expo.modules.applauncher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * Foreground service that records audio while the user watches a lecture app.
 *
 * Two modes:
 *   1. **Internal audio** (Android 10+, preferred) — uses AudioPlaybackCapture
 *      to grab only the target app's audio output. No background noise.
 *      Encodes PCM → AAC via MediaCodec + MediaMuxer into .m4a.
 *   2. **Microphone** (fallback for <API 29 or if projection is unavailable) —
 *      uses MediaRecorder with MIC source (original behaviour).
 *
 * Runs at 16kHz mono AAC — small files (~2MB/hour), good enough for Gemini audio.
 */
class RecordingService : Service() {

    // ── Mic-mode state ─────────────────────────────────────────────
    private var mediaRecorder: MediaRecorder? = null

    // ── Internal-audio-mode state ──────────────────────────────────
    private var audioRecord: AudioRecord? = null
    private var mediaCodec: MediaCodec? = null
    private var mediaMuxer: MediaMuxer? = null
    private var muxerTrackIndex = -1
    private var muxerStarted = false
    @Volatile private var isRecording = false
    @Volatile private var isPaused = false
    private var recordingThread: Thread? = null

    companion object {
        const val ACTION_START = "guru.recording.START"
        const val ACTION_STOP  = "guru.recording.STOP"
        const val ACTION_PAUSE = "guru.recording.PAUSE"
        const val ACTION_RESUME = "guru.recording.RESUME"
        const val EXTRA_OUTPUT_PATH = "outputPath"
        const val EXTRA_MODE = "mode"             // "internal" | "mic"
        const val EXTRA_TARGET_UID = "targetUid"  // UID of the medical app
        const val CHANNEL_ID = "guru_recording_channel"
        const val NOTIF_ID   = 9001

        const val SAMPLE_RATE = 16_000
        const val BIT_RATE    = 128_000

        private const val TAG = "RecordingService"

        /**
         * Static holder for the MediaProjection token.
         * Set by AppLauncherModule before starting the service.
         * Cleared after use.
         */
        @JvmStatic
        var mediaProjection: MediaProjection? = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val path = intent.getStringExtra(EXTRA_OUTPUT_PATH)
                    ?: return START_NOT_STICKY
                val mode = intent.getStringExtra(EXTRA_MODE) ?: "mic"
                val targetUid = intent.getIntExtra(EXTRA_TARGET_UID, -1)

                val useInternal = mode == "internal"
                    && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    && mediaProjection != null

                // Android 14+ (API 34) requires specifying foreground service type explicitly
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    val fgsType = if (useInternal) {
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION or
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    } else {
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    }
                    startForeground(NOTIF_ID, buildNotification(mode), fgsType)
                } else {
                    startForeground(NOTIF_ID, buildNotification(mode))
                }

                if (useInternal) {
                    startInternalRecording(path, targetUid)
                } else {
                    startMicRecording(path)
                }
            }
            ACTION_PAUSE -> {
                isPaused = true
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    try { mediaRecorder?.pause() } catch (_: Exception) {}
                }
            }
            ACTION_RESUME -> {
                isPaused = false
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    try { mediaRecorder?.resume() } catch (_: Exception) {}
                }
            }
            ACTION_STOP -> {
                stopAllRecording()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    // ════════════════════════════════════════════════════════════════
    // Notification
    // ════════════════════════════════════════════════════════════════

    private fun buildNotification(mode: String = "mic"): Notification {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "Lecture Recording",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Guru is capturing your lecture audio" }
            manager.createNotificationChannel(ch)
        }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        val text = if (mode == "internal")
            "Capturing app audio — no mic noise"
        else
            "Recording via microphone"
        return builder
            .setContentTitle("Guru is listening 🎧")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()
    }

    // ════════════════════════════════════════════════════════════════
    // Mode 1 — Internal audio (AudioPlaybackCapture → MediaCodec AAC)
    // ════════════════════════════════════════════════════════════════

    private fun startInternalRecording(path: String, targetUid: Int) {
        try {
            val projection = mediaProjection
                ?: throw IllegalStateException("MediaProjection is null")

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                startMicRecording(path)
                return
            }

            // ── AudioPlaybackCapture config ────────────────────────
            val configBuilder = AudioPlaybackCaptureConfiguration.Builder(projection)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)

            if (targetUid > 0) {
                configBuilder.addMatchingUid(targetUid)
                Log.d(TAG, "Filtering capture to UID=$targetUid")
            }

            val audioFormat = AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                .build()

            val minBuf = AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            val bufSize = maxOf(minBuf * 4, 8192)

            audioRecord = AudioRecord.Builder()
                .setAudioPlaybackCaptureConfig(configBuilder.build())
                .setAudioFormat(audioFormat)
                .setBufferSizeInBytes(bufSize)
                .build()

            // ── MediaCodec AAC encoder ─────────────────────────────
            val format = MediaFormat.createAudioFormat(
                MediaFormat.MIMETYPE_AUDIO_AAC, SAMPLE_RATE, 1
            ).apply {
                setInteger(MediaFormat.KEY_AAC_PROFILE,
                    MediaCodecInfo.CodecProfileLevel.AACObjectLC)
                setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
                setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, bufSize)
            }

            mediaCodec = MediaCodec.createEncoderByType(
                MediaFormat.MIMETYPE_AUDIO_AAC
            ).apply {
                configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            }

            mediaMuxer = MediaMuxer(path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

            // ── Start capture ──────────────────────────────────────
            isRecording = true
            muxerTrackIndex = -1
            muxerStarted = false
            audioRecord!!.startRecording()
            mediaCodec!!.start()

            recordingThread = Thread({ encodeLoop() }, "InternalAudioEncoder")
                .also { it.start() }
            Log.i(TAG, "Internal audio recording started → $path")

        } catch (e: Exception) {
            Log.e(TAG, "Internal recording failed, falling back to mic", e)
            releaseInternalResources()
            startMicRecording(path)
        }
    }

    /**
     * Reads PCM from AudioRecord → feeds MediaCodec → drains encoded AAC
     * → writes via MediaMuxer.
     */
    private fun encodeLoop() {
        val codec = mediaCodec ?: return
        val record = audioRecord ?: return
        val bufInfo = MediaCodec.BufferInfo()
        val timeoutUs = 10_000L

        try {
            while (isRecording) {
                // ── Feed PCM input ─────────────────────────────────
                val inIdx = codec.dequeueInputBuffer(timeoutUs)
                if (inIdx >= 0) {
                    val inBuf = codec.getInputBuffer(inIdx)!!
                    val read = record.read(inBuf, inBuf.remaining())
                    if (read > 0 && !isPaused) {
                        codec.queueInputBuffer(inIdx, 0, read,
                            System.nanoTime() / 1000, 0)
                    } else if (read > 0 && isPaused) {
                        // Drop frame but keep reading to prevent buffer overflow
                        codec.queueInputBuffer(inIdx, 0, 0,
                            System.nanoTime() / 1000, 0)
                    } else {
                        codec.queueInputBuffer(inIdx, 0, 0,
                            System.nanoTime() / 1000, 0)
                    }
                }
                // ── Drain encoded output ───────────────────────────
                drainEncoder(codec, bufInfo, timeoutUs)
            }

            // ── Signal end of stream ───────────────────────────────
            val eosIdx = codec.dequeueInputBuffer(timeoutUs)
            if (eosIdx >= 0) {
                codec.queueInputBuffer(eosIdx, 0, 0,
                    System.nanoTime() / 1000,
                    MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            }
            drainEncoder(codec, bufInfo, timeoutUs)
        } catch (e: Exception) {
            Log.e(TAG, "encodeLoop error", e)
        }
    }

    private fun drainEncoder(
        codec: MediaCodec,
        bufInfo: MediaCodec.BufferInfo,
        timeoutUs: Long
    ) {
        val muxer = mediaMuxer ?: return
        while (true) {
            val outIdx = codec.dequeueOutputBuffer(bufInfo, timeoutUs)
            when {
                outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    if (!muxerStarted) {
                        muxerTrackIndex = muxer.addTrack(codec.outputFormat)
                        muxer.start()
                        muxerStarted = true
                    }
                }
                outIdx >= 0 -> {
                    if (bufInfo.size > 0 && muxerStarted) {
                        val outBuf = codec.getOutputBuffer(outIdx)!!
                        outBuf.position(bufInfo.offset)
                        outBuf.limit(bufInfo.offset + bufInfo.size)
                        muxer.writeSampleData(muxerTrackIndex, outBuf, bufInfo)
                    }
                    codec.releaseOutputBuffer(outIdx, false)
                    if (bufInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0)
                        return
                }
                else -> break // INFO_TRY_AGAIN_LATER
            }
        }
    }

    // ════════════════════════════════════════════════════════════════
    // Mode 2 — Microphone (original MediaRecorder approach)
    // ════════════════════════════════════════════════════════════════

    private fun startMicRecording(path: String) {
        // VOICE_RECOGNITION first — it typically has NO echo cancellation,
        // which is critical for capturing speaker audio played on the same device.
        // UNPROCESSED is ideal for raw capture without system filtering (Android 7+).
        // MIC source on Samsung/OneUI has aggressive AEC that strips speaker audio.
        val audioSources = mutableListOf(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            audioSources.add(MediaRecorder.AudioSource.UNPROCESSED)
        }
        audioSources.addAll(listOf(
            MediaRecorder.AudioSource.CAMCORDER,
            MediaRecorder.AudioSource.MIC,
            MediaRecorder.AudioSource.DEFAULT,
        ))

        for (source in audioSources) {
            try {
                val sourceName = when (source) {
                    MediaRecorder.AudioSource.MIC -> "MIC"
                    MediaRecorder.AudioSource.VOICE_RECOGNITION -> "VOICE_RECOGNITION"
                    MediaRecorder.AudioSource.CAMCORDER -> "CAMCORDER"
                    9 -> "UNPROCESSED" // MediaRecorder.AudioSource.UNPROCESSED
                    else -> "DEFAULT"
                }
                Log.i(TAG, "Trying mic recording with source=$sourceName → $path")

                mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    MediaRecorder(this)
                } else {
                    @Suppress("DEPRECATION")
                    MediaRecorder()
                }
                mediaRecorder!!.apply {
                    setAudioSource(source)
                    setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                    setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                    setAudioSamplingRate(SAMPLE_RATE)
                    setAudioEncodingBitRate(BIT_RATE)
                    setOutputFile(path)
                    prepare()
                    start()
                }
                Log.i(TAG, "Mic recording STARTED with source=$sourceName → $path")
                return // Success — exit the loop
            } catch (e: Exception) {
                Log.w(TAG, "Mic recording failed with source, trying next", e)
                try { mediaRecorder?.release() } catch (_: Exception) {}
                mediaRecorder = null
            }
        }

        // All sources failed
        Log.e(TAG, "ALL audio sources failed for mic recording")
        // Write a tiny marker so JS can detect failure vs missing file
        try {
            java.io.File(path).writeText("RECORDING_FAILED")
            Log.w(TAG, "Wrote failure marker to $path")
        } catch (_: Exception) {}
        stopSelf()
    }

    // ════════════════════════════════════════════════════════════════
    // Stop / cleanup
    // ════════════════════════════════════════════════════════════════

    private fun stopAllRecording() {
        Log.i(TAG, "stopAllRecording: audioRecord=${audioRecord != null}, mediaRecorder=${mediaRecorder != null}")
        // Internal mode
        if (audioRecord != null) {
            isRecording = false
            recordingThread?.join(3000)
            recordingThread = null
            releaseInternalResources()
        }
        // Mic mode
        stopMicRecorder()
        Log.i(TAG, "stopAllRecording: done")
    }

    private fun releaseInternalResources() {
        try { audioRecord?.stop() } catch (_: Exception) {}
        try { audioRecord?.release() } catch (_: Exception) {}
        audioRecord = null

        try { mediaCodec?.stop() } catch (_: Exception) {}
        try { mediaCodec?.release() } catch (_: Exception) {}
        mediaCodec = null

        try {
            if (muxerStarted) mediaMuxer?.stop()
            mediaMuxer?.release()
        } catch (_: Exception) {}
        mediaMuxer = null
        muxerStarted = false

        try { mediaProjection?.stop() } catch (_: Exception) {}
        mediaProjection = null
    }

    private fun stopMicRecorder() {
        try {
            mediaRecorder?.apply {
                Log.i(TAG, "Stopping MediaRecorder…")
                stop()
                release()
                Log.i(TAG, "MediaRecorder stopped and released")
            }
        } catch (e: Exception) {
            Log.w(TAG, "stopMicRecorder error (may be normal if short recording)", e)
            try { mediaRecorder?.release() } catch (_: Exception) {}
        }
        mediaRecorder = null
    }

    override fun onDestroy() {
        stopAllRecording()
        super.onDestroy()
    }
}
