package expo.modules.applauncher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
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
import android.os.Build
import android.os.IBinder
import android.util.Log

class RecordingService : Service() {

    private var mediaRecorder: MediaRecorder? = null

    private var audioRecord: AudioRecord? = null
    private var mediaCodec: MediaCodec? = null
    private var mediaMuxer: MediaMuxer? = null
    private var muxerTrackIndex = -1
    private var muxerStarted = false
    @Volatile private var isRecording = false
    @Volatile private var isPaused = false
    private var recordingThread: Thread? = null
    private var liveTranscriptionKey: String? = null
    private var liveTranscriptPath: String? = null
    private var insightGenerationKey: String? = null
    private var lectureInsightPath: String? = null
    private var deepgramLiveSession: DeepgramLiveSession? = null
    private var lectureInsightGenerator: LectureInsightGenerator? = null

    companion object {
        const val ACTION_START = "guru.recording.START"
        const val ACTION_STOP = "guru.recording.STOP"
        const val ACTION_PAUSE = "guru.recording.PAUSE"
        const val ACTION_RESUME = "guru.recording.RESUME"
        const val EXTRA_OUTPUT_PATH = "outputPath"
        const val EXTRA_MODE = "mode"
        const val EXTRA_TARGET_UID = "targetUid"
        const val EXTRA_LIVE_TRANSCRIPTION_KEY = "liveTranscriptionKey"
        const val EXTRA_LIVE_TRANSCRIPT_PATH = "liveTranscriptPath"
        const val EXTRA_INSIGHT_GENERATION_KEY = "insightGenerationKey"
        const val EXTRA_LECTURE_INSIGHT_PATH = "lectureInsightPath"
        const val CHANNEL_ID = "guru_recording_channel"
        const val NOTIF_ID = 9001

        const val SAMPLE_RATE = 16_000
        const val BIT_RATE = 128_000

        private const val TAG = "RecordingService"

        @JvmStatic
        @Volatile
        var isServiceRunning = false

        @JvmStatic
        var mediaProjection: MediaProjection? = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                isServiceRunning = true
                val path = intent.getStringExtra(EXTRA_OUTPUT_PATH) ?: return START_NOT_STICKY
                val mode = intent.getStringExtra(EXTRA_MODE) ?: "mic"
                val targetUid = intent.getIntExtra(EXTRA_TARGET_UID, -1)
                liveTranscriptionKey = intent.getStringExtra(EXTRA_LIVE_TRANSCRIPTION_KEY)
                liveTranscriptPath = intent.getStringExtra(EXTRA_LIVE_TRANSCRIPT_PATH)
                insightGenerationKey = intent.getStringExtra(EXTRA_INSIGHT_GENERATION_KEY)
                lectureInsightPath = intent.getStringExtra(EXTRA_LECTURE_INSIGHT_PATH)

                val useInternal = mode == "internal" &&
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                    mediaProjection != null

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
                    try {
                        mediaRecorder?.pause()
                    } catch (_: Exception) {}
                }
            }

            ACTION_RESUME -> {
                isPaused = false
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    try {
                        mediaRecorder?.resume()
                    } catch (_: Exception) {}
                }
            }

            ACTION_STOP -> {
                stopAllRecording()
                stopForeground(STOP_FOREGROUND_REMOVE)
                isServiceRunning = false
                stopSelf()
            }
        }

        return START_NOT_STICKY
    }

    private fun buildNotification(mode: String = "mic"): Notification {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Lecture Recording",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Guru is capturing your lecture audio"
            }
            manager.createNotificationChannel(channel)
        }

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        val text = if (mode == "internal") {
            "Capturing app audio"
        } else {
            "Recording via microphone"
        }

        return builder
            .setContentTitle("Guru is listening")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()
    }

    private fun buildAudioFormat(): AudioFormat =
        AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .build()

    private fun prepareEncoderAndMuxer(path: String, bufferSize: Int) {
        val format = MediaFormat.createAudioFormat(
            MediaFormat.MIMETYPE_AUDIO_AAC,
            SAMPLE_RATE,
            1,
        ).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, bufferSize)
        }

        mediaCodec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).apply {
            configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        }
        mediaMuxer = MediaMuxer(path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    }

    private fun startLiveTranscriptionIfConfigured() {
        val key = liveTranscriptionKey?.trim().orEmpty()
        val transcriptPath = liveTranscriptPath?.trim().orEmpty()
        if (key.isBlank() || transcriptPath.isBlank()) {
            return
        }
        try {
            deepgramLiveSession?.close()
        } catch (_: Exception) {}
        try {
            deepgramLiveSession = DeepgramLiveSession(key, transcriptPath).also { it.connect() }
            Log.i(TAG, "Deepgram live sidecar started -> $transcriptPath")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to start Deepgram live sidecar", e)
            deepgramLiveSession = null
        }
    }

    private fun closeLiveTranscriptionSession() {
        try {
            deepgramLiveSession?.close()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to close Deepgram live sidecar cleanly", e)
        }
        deepgramLiveSession = null
    }

    private fun startLectureInsightGenerationIfConfigured() {
        val key = insightGenerationKey?.trim().orEmpty()
        val transcriptPath = liveTranscriptPath?.trim().orEmpty()
        val insightPath = lectureInsightPath?.trim().orEmpty()
        if (key.isBlank() || transcriptPath.isBlank() || insightPath.isBlank()) {
            return
        }
        try {
            lectureInsightGenerator?.close()
        } catch (_: Exception) {}
        try {
            lectureInsightGenerator = LectureInsightGenerator(key, transcriptPath, insightPath)
            Log.i(TAG, "Background lecture insight generator started -> $insightPath")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to start lecture insight generator", e)
            lectureInsightGenerator = null
        }
    }

    private fun closeLectureInsightGenerator() {
        try {
            lectureInsightGenerator?.close()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to close lecture insight generator cleanly", e)
        }
        lectureInsightGenerator = null
    }

    private fun startPcmEncoding(path: String, threadName: String) {
        isRecording = true
        isPaused = false
        muxerTrackIndex = -1
        muxerStarted = false
        audioRecord?.startRecording()
        mediaCodec?.start()
        startLiveTranscriptionIfConfigured()
        startLectureInsightGenerationIfConfigured()
        recordingThread = Thread({ encodeLoop() }, threadName).also { it.start() }
        Log.i(TAG, "$threadName started -> $path")
    }

    private fun startInternalRecording(path: String, targetUid: Int) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                startMicRecording(path)
                return
            }

            val projection = mediaProjection ?: throw IllegalStateException("MediaProjection is null")
            val configBuilder = AudioPlaybackCaptureConfiguration.Builder(projection)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)

            if (targetUid > 0) {
                configBuilder.addMatchingUid(targetUid)
                Log.d(TAG, "Filtering capture to UID=$targetUid")
            }

            val audioFormat = buildAudioFormat()
            val minBuf = AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
            )
            val bufferSize = maxOf(minBuf * 4, 8192)

            audioRecord = AudioRecord.Builder()
                .setAudioPlaybackCaptureConfig(configBuilder.build())
                .setAudioFormat(audioFormat)
                .setBufferSizeInBytes(bufferSize)
                .build()

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                throw IllegalStateException("Internal AudioRecord failed to initialize")
            }

            prepareEncoderAndMuxer(path, bufferSize)
            startPcmEncoding(path, "InternalAudioEncoder")
        } catch (e: Exception) {
            Log.e(TAG, "Internal recording failed, falling back to mic", e)
            releaseInternalResources()
            startMicRecording(path)
        }
    }

    private fun encodeLoop() {
        val codec = mediaCodec ?: return
        val record = audioRecord ?: return
        val bufferInfo = MediaCodec.BufferInfo()
        val timeoutUs = 10_000L
        val pcmBuffer = ByteArray(4096)
        var lastInsightCheckAt = 0L
        var lastDeepgramDisconnectedLogAt = 0L

        try {
            while (isRecording) {
                val inputIndex = codec.dequeueInputBuffer(timeoutUs)
                if (inputIndex >= 0) {
                    val inputBuffer = codec.getInputBuffer(inputIndex) ?: continue
                    inputBuffer.clear()
                    val bytesToRead = minOf(pcmBuffer.size, inputBuffer.remaining())
                    val read = record.read(pcmBuffer, 0, bytesToRead)
                    when {
                        read > 0 && !isPaused -> {
                            inputBuffer.put(pcmBuffer, 0, read)
                            val liveSession = deepgramLiveSession
                            if (liveSession == null && liveTranscriptionKey?.isNotBlank() == true) {
                                val now = System.currentTimeMillis()
                                if (now - lastDeepgramDisconnectedLogAt >= 15_000L) {
                                    Log.w(TAG, "Deepgram live sidecar unavailable while audio capture continues")
                                    lastDeepgramDisconnectedLogAt = now
                                }
                            }
                            liveSession?.sendPcmChunk(pcmBuffer, read)
                            codec.queueInputBuffer(
                                inputIndex,
                                0,
                                read,
                                System.nanoTime() / 1000,
                                0,
                            )
                        }

                        read > 0 -> {
                            codec.queueInputBuffer(
                                inputIndex,
                                0,
                                0,
                                System.nanoTime() / 1000,
                                0,
                            )
                        }

                        else -> {
                            codec.queueInputBuffer(
                                inputIndex,
                                0,
                                0,
                                System.nanoTime() / 1000,
                                0,
                            )
                        }
                    }
                }

                drainEncoder(codec, bufferInfo, timeoutUs)

                val now = System.currentTimeMillis()
                if (now - lastInsightCheckAt >= 30_000L) {
                    lectureInsightGenerator?.scheduleIfNeeded()
                    lastInsightCheckAt = now
                }
            }

            val eosIndex = codec.dequeueInputBuffer(timeoutUs)
            if (eosIndex >= 0) {
                codec.queueInputBuffer(
                    eosIndex,
                    0,
                    0,
                    System.nanoTime() / 1000,
                    MediaCodec.BUFFER_FLAG_END_OF_STREAM,
                )
            }
            drainEncoder(codec, bufferInfo, timeoutUs)
            lectureInsightGenerator?.scheduleIfNeeded(force = true)
        } catch (e: Exception) {
            Log.e(TAG, "encodeLoop error", e)
        }
    }

    private fun drainEncoder(
        codec: MediaCodec,
        bufferInfo: MediaCodec.BufferInfo,
        timeoutUs: Long,
    ) {
        val muxer = mediaMuxer ?: return
        while (true) {
            val outputIndex = codec.dequeueOutputBuffer(bufferInfo, timeoutUs)
            when {
                outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    if (!muxerStarted) {
                        muxerTrackIndex = muxer.addTrack(codec.outputFormat)
                        muxer.start()
                        muxerStarted = true
                    }
                }

                outputIndex >= 0 -> {
                    if (bufferInfo.size > 0 && muxerStarted) {
                        val outputBuffer = codec.getOutputBuffer(outputIndex) ?: return
                        outputBuffer.position(bufferInfo.offset)
                        outputBuffer.limit(bufferInfo.offset + bufferInfo.size)
                        muxer.writeSampleData(muxerTrackIndex, outputBuffer, bufferInfo)
                    }
                    codec.releaseOutputBuffer(outputIndex, false)
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        return
                    }
                }

                else -> return
            }
        }
    }

    private fun createMicAudioRecord(
        source: Int,
        audioFormat: AudioFormat,
        bufferSize: Int,
    ): AudioRecord {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            AudioRecord.Builder()
                .setAudioSource(source)
                .setAudioFormat(audioFormat)
                .setBufferSizeInBytes(bufferSize)
                .build()
        } else {
            @Suppress("DEPRECATION")
            AudioRecord(
                source,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize,
            )
        }
    }

    private fun sourceName(source: Int): String = when (source) {
        MediaRecorder.AudioSource.MIC -> "MIC"
        MediaRecorder.AudioSource.VOICE_RECOGNITION -> "VOICE_RECOGNITION"
        MediaRecorder.AudioSource.CAMCORDER -> "CAMCORDER"
        MediaRecorder.AudioSource.DEFAULT -> "DEFAULT"
        9 -> "UNPROCESSED"
        else -> "SOURCE_$source"
    }

    private fun startMicRecording(path: String) {
        val audioSources = mutableListOf(MediaRecorder.AudioSource.VOICE_RECOGNITION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            audioSources.add(MediaRecorder.AudioSource.UNPROCESSED)
        }
        audioSources.addAll(
            listOf(
                MediaRecorder.AudioSource.CAMCORDER,
                MediaRecorder.AudioSource.MIC,
                MediaRecorder.AudioSource.DEFAULT,
            ),
        )

        val audioFormat = buildAudioFormat()
        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val bufferSize = maxOf(minBuf * 4, 8192)

        for (source in audioSources) {
            val label = sourceName(source)
            try {
                Log.i(TAG, "Trying PCM mic recording with source=$label -> $path")
                audioRecord = createMicAudioRecord(source, audioFormat, bufferSize)
                if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                    throw IllegalStateException("AudioRecord failed to initialize for $label")
                }
                prepareEncoderAndMuxer(path, bufferSize)
                startPcmEncoding(path, "MicAudioEncoder-$label")
                return
            } catch (e: Exception) {
                Log.w(TAG, "PCM mic recording failed with source=$label", e)
                releaseInternalResources()
            }
        }

        startLegacyMicRecording(path, audioSources)
    }

    private fun startLegacyMicRecording(path: String, audioSources: List<Int>) {
        closeLiveTranscriptionSession()
        closeLectureInsightGenerator()
        for (source in audioSources) {
            val label = sourceName(source)
            try {
                Log.i(TAG, "Trying legacy mic recording with source=$label -> $path")
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
                Log.i(TAG, "Legacy mic recording STARTED with source=$label -> $path")
                return
            } catch (e: Exception) {
                Log.w(TAG, "Legacy mic recording failed with source=$label", e)
                try {
                    mediaRecorder?.release()
                } catch (_: Exception) {}
                mediaRecorder = null
            }
        }

        Log.e(TAG, "ALL audio sources failed for mic recording")
        try {
            java.io.File(path).writeText("RECORDING_FAILED")
        } catch (_: Exception) {}
        isServiceRunning = false
        stopSelf()
    }

    private fun stopAllRecording() {
        Log.i(
            TAG,
            "stopAllRecording: audioRecord=${audioRecord != null}, mediaRecorder=${mediaRecorder != null}",
        )
        if (audioRecord != null) {
            isRecording = false
            recordingThread?.join(3000)
            recordingThread = null
            releaseInternalResources()
        }
        stopMicRecorder()
        closeLiveTranscriptionSession()
        closeLectureInsightGenerator()
        Log.i(TAG, "stopAllRecording: done")
    }

    private fun releaseInternalResources() {
        try {
            audioRecord?.stop()
        } catch (_: Exception) {}
        try {
            audioRecord?.release()
        } catch (_: Exception) {}
        audioRecord = null

        try {
            mediaCodec?.stop()
        } catch (_: Exception) {}
        try {
            mediaCodec?.release()
        } catch (_: Exception) {}
        mediaCodec = null

        try {
            if (muxerStarted) {
                mediaMuxer?.stop()
            }
            mediaMuxer?.release()
        } catch (_: Exception) {}
        mediaMuxer = null
        muxerTrackIndex = -1
        muxerStarted = false

        try {
            mediaProjection?.stop()
        } catch (_: Exception) {}
        mediaProjection = null

        closeLiveTranscriptionSession()
        closeLectureInsightGenerator()
    }

    private fun stopMicRecorder() {
        try {
            mediaRecorder?.apply {
                Log.i(TAG, "Stopping MediaRecorder")
                stop()
                release()
                Log.i(TAG, "MediaRecorder stopped and released")
            }
        } catch (e: Exception) {
            Log.w(TAG, "stopMicRecorder error (may be normal if short recording)", e)
            try {
                mediaRecorder?.release()
            } catch (_: Exception) {}
        }
        mediaRecorder = null
    }

    override fun onDestroy() {
        isServiceRunning = false
        stopAllRecording()
        super.onDestroy()
    }
}
