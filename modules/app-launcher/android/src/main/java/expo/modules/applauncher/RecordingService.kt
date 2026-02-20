package expo.modules.applauncher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import java.io.File

/**
 * Foreground service that records microphone audio while the user watches a lecture app.
 * Runs at 16kHz mono AAC — small files (~2MB/hour), good enough for Whisper / Gemini audio.
 */
class RecordingService : Service() {

    private var recorder: MediaRecorder? = null

    companion object {
        const val ACTION_START = "guru.recording.START"
        const val ACTION_STOP  = "guru.recording.STOP"
        const val EXTRA_OUTPUT_PATH = "outputPath"
        const val CHANNEL_ID = "guru_recording_channel"
        const val NOTIF_ID   = 9001
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val path = intent.getStringExtra(EXTRA_OUTPUT_PATH) ?: return START_NOT_STICKY
                startForeground(NOTIF_ID, buildNotification())
                startRecording(path)
            }
            ACTION_STOP -> {
                stopRecording()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    private fun buildNotification(): Notification {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "Lecture Recording",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Guru is listening to your lecture" }
            manager.createNotificationChannel(ch)
        }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle("Guru is listening 🎧")
            .setContentText("Audio will be transcribed when you return")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()
    }

    private fun startRecording(path: String) {
        try {
            recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            recorder!!.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(16000)   // Whisper / Gemini prefer 16kHz
                setAudioEncodingBitRate(32000) // ~0.23 MB/min → 45min ≈ 10MB
                setOutputFile(path)
                prepare()
                start()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            stopSelf()
        }
    }

    private fun stopRecording() {
        try {
            recorder?.apply {
                stop()
                release()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            recorder = null
        }
    }

    override fun onDestroy() {
        stopRecording()
        super.onDestroy()
    }
}
