package expo.modules.applauncher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RectF
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import androidx.annotation.OptIn
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.abs

enum class FocusState { NEUTRAL, FOCUSED, DISTRACTED, DROWSY, ABSENT }

/**
 * Floating overlay bubble that shows a pulsing timer while the user
 * watches a lecture in another app.
 *
 * When faceTracking=true is passed via ACTION_SHOW, it also opens the
 * front camera and runs ML Kit face detection to detect concentration.
 * The bubble ring colour reflects the user's focus state:
 *   Purple  = timer only (no face tracking)
 *   Green   = face detected, focused
 *   Orange  = drowsy or looking away
 *   Red     = face absent (sends a notification after 15s)
 */
class OverlayService : Service(), LifecycleOwner {

    private val lifecycleRegistry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = lifecycleRegistry

    private var windowManager: WindowManager? = null
    private var overlayView: TimerBubbleView? = null
    private val handler = Handler(Looper.getMainLooper())
    private var elapsedSeconds = 0
    private var appName = "Lecture"

    // Face tracking
    private var faceTrackingEnabled = false
    private var cameraExecutor: ExecutorService? = null
    private var cameraProvider: ProcessCameraProvider? = null
    private var faceDetector: FaceDetector? = null
    private var noFaceSince = 0L
    private var lastAbsentNotifAt = 0L

    private val tickRunnable = object : Runnable {
        override fun run() {
            elapsedSeconds++
            overlayView?.updateTime(elapsedSeconds)
            handler.postDelayed(this, 1000)
        }
    }

    companion object {
        const val ACTION_SHOW = "guru.overlay.SHOW"
        const val ACTION_HIDE = "guru.overlay.HIDE"
        const val EXTRA_APP_NAME = "appName"
        const val EXTRA_FACE_TRACKING = "faceTracking"
        const val CHANNEL_ID = "guru_overlay_channel"
        const val NOTIF_ID = 9002
        const val ABSENT_NOTIF_ID = 9003
    }

    override fun onCreate() {
        super.onCreate()
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_CREATE)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_START)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_RESUME)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SHOW -> {
                appName = intent.getStringExtra(EXTRA_APP_NAME) ?: "Lecture"
                faceTrackingEnabled = intent.getBooleanExtra(EXTRA_FACE_TRACKING, false)
                startForeground(NOTIF_ID, buildNotification())
                showOverlay()
                startTimer()
                if (faceTrackingEnabled) startCamera()
            }
            ACTION_HIDE -> {
                stopCamera()
                hideOverlay()
                stopTimer()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    // ── Camera + Face Detection ───────────────────────────────────

    private fun startCamera() {
        cameraExecutor = Executors.newSingleThreadExecutor()

        val options = FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
            .build()
        faceDetector = FaceDetection.getClient(options)

        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            cameraProvider = future.get()
            bindCamera()
        }, ContextCompat.getMainExecutor(this))
    }

    @OptIn(ExperimentalGetImage::class)
    private fun bindCamera() {
        val provider = cameraProvider ?: return
        val detector = faceDetector ?: return
        val executor = cameraExecutor ?: return

        val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()

        analysis.setAnalyzer(executor) { imageProxy ->
            val mediaImage = imageProxy.image
            if (mediaImage != null) {
                val image = InputImage.fromMediaImage(
                    mediaImage, imageProxy.imageInfo.rotationDegrees
                )
                detector.process(image)
                    .addOnSuccessListener { faces -> handleFaces(faces) }
                    .addOnCompleteListener { imageProxy.close() }
            } else {
                imageProxy.close()
            }
        }

        try {
            provider.unbindAll()
            provider.bindToLifecycle(this, CameraSelector.DEFAULT_FRONT_CAMERA, analysis)
        } catch (e: Exception) {
            // Camera unavailable — degrade gracefully
        }
    }

    private fun handleFaces(faces: List<com.google.mlkit.vision.face.Face>) {
        val now = System.currentTimeMillis()

        if (faces.isEmpty()) {
            if (noFaceSince == 0L) noFaceSince = now
            val absentMs = now - noFaceSince

            if (absentMs > 15_000) {
                handler.post { overlayView?.updateFocusState(FocusState.ABSENT) }
                if (now - lastAbsentNotifAt > 30_000) {
                    lastAbsentNotifAt = now
                    sendAbsentNotification()
                }
            } else if (absentMs > 5_000) {
                handler.post { overlayView?.updateFocusState(FocusState.ABSENT) }
            }
            return
        }

        noFaceSince = 0L
        val face = faces[0]
        val leftEye = face.leftEyeOpenProbability ?: 1f
        val rightEye = face.rightEyeOpenProbability ?: 1f
        val avgEyeOpen = (leftEye + rightEye) / 2f
        val yaw = abs(face.headEulerAngleY)
        val pitch = abs(face.headEulerAngleX)

        val state = when {
            avgEyeOpen < 0.3f             -> FocusState.DROWSY
            yaw > 35f || pitch > 35f      -> FocusState.DISTRACTED
            else                          -> FocusState.FOCUSED
        }
        handler.post { overlayView?.updateFocusState(state) }
    }

    private fun sendAbsentNotification() {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "Study Timer Overlay",
                NotificationManager.IMPORTANCE_HIGH
            )
            manager.createNotificationChannel(ch)
        }
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pi = if (launchIntent != null) PendingIntent.getActivity(
            this, 1, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        ) else null

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            Notification.Builder(this, CHANNEL_ID)
        else @Suppress("DEPRECATION") Notification.Builder(this)

        val notif = builder
            .setContentTitle("👀 Where are you, Doctor?")
            .setContentText("Your face hasn't been detected for 15 seconds. Still studying?")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .apply { if (pi != null) setContentIntent(pi) }
            .setAutoCancel(true)
            .build()

        manager.notify(ABSENT_NOTIF_ID, notif)
    }

    private fun stopCamera() {
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_PAUSE)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_STOP)
        try { cameraProvider?.unbindAll() } catch (_: Exception) {}
        cameraProvider = null
        faceDetector?.close()
        faceDetector = null
        cameraExecutor?.shutdown()
        cameraExecutor = null
    }

    // ── Notification ──────────────────────────────────────────────

    private fun buildNotification(): Notification {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "Study Timer Overlay",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Shows floating timer while watching lectures" }
            manager.createNotificationChannel(ch)
        }
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pi = if (launchIntent != null) PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        ) else null

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            Notification.Builder(this, CHANNEL_ID)
        else @Suppress("DEPRECATION") Notification.Builder(this)

        val title = if (faceTrackingEnabled) "Studying: $appName · Face tracking ON"
                    else "Studying: $appName"

        return builder
            .setContentTitle(title)
            .setContentText("Tap to return to Guru")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .apply { if (pi != null) setContentIntent(pi) }
            .build()
    }

    // ── Overlay window ────────────────────────────────────────────

    private fun showOverlay() {
        if (overlayView != null) return
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        overlayView = TimerBubbleView(this, appName, faceTrackingEnabled) {
            val intent = packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                startActivity(intent)
            }
        }
        val size = dpToPx(72)
        val params = WindowManager.LayoutParams(
            size, size,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dpToPx(8)
            y = dpToPx(120)
        }
        overlayView!!.setOnTouchListener(DragTouchListener(params, windowManager!!))
        windowManager!!.addView(overlayView, params)
    }

    private fun hideOverlay() {
        overlayView?.let {
            try { windowManager?.removeView(it) } catch (_: Exception) {}
        }
        overlayView = null
    }

    private fun startTimer() {
        elapsedSeconds = 0
        handler.post(tickRunnable)
    }

    private fun stopTimer() {
        handler.removeCallbacks(tickRunnable)
    }

    private fun dpToPx(dp: Int): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(), resources.displayMetrics
        ).toInt()

    override fun onDestroy() {
        stopCamera()
        hideOverlay()
        stopTimer()
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_DESTROY)
        super.onDestroy()
    }

    // ════════════════════════════════════════════════════════════════
    // Bubble view — ring colour reflects focus state
    // ════════════════════════════════════════════════════════════════

    class TimerBubbleView(
        context: Context,
        private val appLabel: String,
        private val faceTracking: Boolean,
        val onTap: () -> Unit
    ) : View(context) {

        private var seconds = 0
        private var focusState = FocusState.NEUTRAL

        private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#CC1A1A2E")
            style = Paint.Style.FILL
        }
        private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 5f
        }
        private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 26f
            textAlign = Paint.Align.CENTER
            isFakeBoldText = true
        }
        private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = 18f
            textAlign = Paint.Align.CENTER
        }

        fun updateTime(secs: Int) {
            seconds = secs
            invalidate()
        }

        fun updateFocusState(state: FocusState) {
            focusState = state
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val cx = width / 2f
            val cy = height / 2f
            val r = (width / 2f) - 6f

            // Ring colour based on focus state
            val ringColor = when (focusState) {
                FocusState.FOCUSED    -> Color.parseColor("#4CAF50") // green
                FocusState.DISTRACTED -> Color.parseColor("#FF9800") // orange
                FocusState.DROWSY     -> Color.parseColor("#FF9800") // orange
                FocusState.ABSENT     -> Color.parseColor("#F44336") // red
                FocusState.NEUTRAL    -> Color.parseColor("#6C63FF") // purple (default)
            }

            // Background circle
            bgPaint.color = Color.parseColor(when (focusState) {
                FocusState.ABSENT  -> "#CC2A0A0A"
                FocusState.FOCUSED -> "#CC0A2A0A"
                else               -> "#CC1A1A2E"
            })
            canvas.drawCircle(cx, cy, r, bgPaint)

            // Progress ring (arc fills as each minute ticks by)
            ringPaint.color = ringColor
            val sweep = (seconds % 60) / 60f * 360f
            val oval = RectF(cx - r, cy - r, cx + r, cy + r)
            canvas.drawArc(oval, -90f, sweep, false, ringPaint)

            // Time text
            val mins = seconds / 60
            val secs = seconds % 60
            canvas.drawText(
                "${mins}:${secs.toString().padStart(2, '0')}",
                cx, cy + 8f, textPaint
            )

            // Focus icon (only when face tracking active)
            if (faceTracking) {
                val icon = when (focusState) {
                    FocusState.FOCUSED    -> "👁"
                    FocusState.DISTRACTED -> "👀"
                    FocusState.DROWSY     -> "😴"
                    FocusState.ABSENT     -> "❗"
                    FocusState.NEUTRAL    -> "👁"
                }
                canvas.drawText(icon, cx, cy - r + 20f, iconPaint)
            }
        }
    }

    // ════════════════════════════════════════════════════════════════
    // Drag handler
    // ════════════════════════════════════════════════════════════════

    class DragTouchListener(
        private val params: WindowManager.LayoutParams,
        private val wm: WindowManager
    ) : View.OnTouchListener {
        private var initialX = 0
        private var initialY = 0
        private var initialTouchX = 0f
        private var initialTouchY = 0f
        private var isTap = true

        override fun onTouch(v: View, event: MotionEvent): Boolean {
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x; initialY = params.y
                    initialTouchX = event.rawX; initialTouchY = event.rawY
                    isTap = true; return true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - initialTouchX
                    val dy = event.rawY - initialTouchY
                    if (abs(dx) > 10 || abs(dy) > 10) isTap = false
                    params.x = initialX + dx.toInt()
                    params.y = initialY + dy.toInt()
                    try { wm.updateViewLayout(v, params) } catch (_: Exception) {}
                    return true
                }
                MotionEvent.ACTION_UP -> {
                    if (isTap) { (v as? TimerBubbleView)?.onTap?.invoke(); v.performClick() }
                    return true
                }
            }
            return false
        }
    }
}
