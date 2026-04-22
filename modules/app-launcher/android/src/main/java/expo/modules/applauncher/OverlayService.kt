package expo.modules.applauncher

import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.DisplayMetrics
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.OvershootInterpolator
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
import kotlin.math.sin

enum class FocusState { NEUTRAL, FOCUSED, DISTRACTED, DROWSY, ABSENT }

private object OverlayTheme {
    // Aligned with src/theme/linearTheme.ts
    val surface = Color.parseColor("#050505")
    val surfaceElevated = Color.parseColor("#232327")
    val textPrimary = Color.parseColor("#F2F2F2")
    val textMuted = Color.parseColor("#8A8A8E")
    val accent = Color.parseColor("#5E6AD2")
    val success = Color.parseColor("#3FB950")
    val warning = Color.parseColor("#D97706")
    val error = Color.parseColor("#F14C4C")
}

/**
 * Floating overlay bubble that acts as a virtual study companion (body double)
 * while the user watches a lecture in another app.
 *
 * Visually overhauled for a premium experience.
 */
class OverlayService : Service(), LifecycleOwner {

    private val lifecycleRegistry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = lifecycleRegistry

    private var windowManager: WindowManager? = null
    private var overlayView: InteractiveTimerOverlay? = null
    private val handler = Handler(Looper.getMainLooper())
    private var elapsedSeconds = 0
    private var isPaused = false
    private var appName = "Lecture"
    private var pomodoroEnabled = true
    private var pomodoroIntervalMinutes = 20

    // Face tracking
    private var faceTrackingEnabled = false
    private var cameraExecutor: ExecutorService? = null
    private var cameraProvider: ProcessCameraProvider? = null
    private var faceDetector: FaceDetector? = null
    private var noFaceSince = 0L
    private var lastAbsentNotifAt = 0L
    private var lastFaceAnalysisTime = 0L
    private val FACE_ANALYSIS_INTERVAL_MS = 2000L

    @Volatile private var thermalThrottleLevel: Int = 0
    private var frameCounter: Int = 0
    private var sperf: SamsungPerfController? = null

    private val tickRunnable = object : Runnable {
        override fun run() {
            if (!isPaused) {
                elapsedSeconds++
                overlayView?.updateTime(elapsedSeconds)
            }
            handler.postDelayed(this, 1000)
        }
    }

    companion object {
        const val ACTION_SHOW = "guru.overlay.SHOW"
        const val ACTION_HIDE = "guru.overlay.HIDE"
        const val ACTION_PAUSE = "guru.overlay.PAUSE"
        const val ACTION_RESUME = "guru.overlay.RESUME"
        const val EXTRA_APP_NAME = "appName"
        const val EXTRA_FACE_TRACKING = "faceTracking"
        const val EXTRA_POMODORO_ENABLED = "pomodoroEnabled"
        const val EXTRA_POMODORO_INTERVAL = "pomodoroInterval"
        const val CHANNEL_ID = "guru_overlay_channel"
        const val NOTIF_ID = 9002
        const val ABSENT_NOTIF_ID = 9003
        const val PREFS_NAME = "guru_overlay_prefs"
        const val PREF_RETURN_REQUESTED = "lecture_return_requested"
        const val PREF_POMODORO_BREAK_REQUESTED = "pomodoro_break_requested"
        @JvmStatic
        @Volatile
        var isServiceRunning = false
        @JvmStatic
        @Volatile
        var isOverlayVisible = false
    }

    override fun onCreate() {
        super.onCreate()
        isServiceRunning = true
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_CREATE)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_START)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_RESUME)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        isServiceRunning = true
        when (intent?.action) {
            ACTION_SHOW -> {
                appName = intent.getStringExtra(EXTRA_APP_NAME) ?: "Lecture"
                faceTrackingEnabled = intent.getBooleanExtra(EXTRA_FACE_TRACKING, false)
                pomodoroEnabled = intent.getBooleanExtra(EXTRA_POMODORO_ENABLED, true)
                pomodoroIntervalMinutes = intent.getIntExtra(EXTRA_POMODORO_INTERVAL, 20)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    var fgsType = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                    if (faceTrackingEnabled) {
                        fgsType = fgsType or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
                    }
                    try {
                        startForeground(NOTIF_ID, buildNotification(), fgsType)
                    } catch (e: Exception) {
                        android.util.Log.e("OverlayService", "startForeground rejected by OneUI: ${e.message}", e)
                        sendBroadcast(Intent("guru.fgs.blocked").setPackage(packageName))
                        stopSelf()
                        return START_NOT_STICKY
                    }
                } else {
                    try {
                        startForeground(NOTIF_ID, buildNotification())
                    } catch (e: Exception) {
                        android.util.Log.e("OverlayService", "startForeground rejected: ${e.message}", e)
                        sendBroadcast(Intent("guru.fgs.blocked").setPackage(packageName))
                        stopSelf()
                        return START_NOT_STICKY
                    }
                }
                showOverlay()
                startTimer()
                if (faceTrackingEnabled) startCamera()
            }
            ACTION_PAUSE -> {
                isPaused = true
                overlayView?.setPaused(true)
            }
            ACTION_RESUME -> {
                isPaused = false
                overlayView?.setPaused(false)
            }
            ACTION_HIDE -> {
                stopCamera()
                hideOverlay()
                stopTimer()
                stopForeground(STOP_FOREGROUND_REMOVE)
                isServiceRunning = false
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    // ── Camera + Face Detection ───────────────────────────────────

    private fun startCamera() {
        cameraExecutor = Executors.newSingleThreadExecutor()

        val sperf = SamsungPerfController(applicationContext)
        this.sperf = sperf
        val sperfActive = sperf.init()
        val faceBoostId = if (sperfActive) sperf.startPresetBoost(/* GPU */ 1, 5_000) else -1
        sperf.onThermalWarning = { level ->
            // Level >= 2 → throttle: skip every other frame downstream.
            thermalThrottleLevel = level
        }

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
            .setTargetResolution(android.util.Size(320, 240))
            .build()

        analysis.setAnalyzer(executor) { imageProxy ->
            if (thermalThrottleLevel >= 2 && (frameCounter++ % 2) == 0) {
                imageProxy.close()
                return@setAnalyzer
            }
            val now = System.currentTimeMillis()
            if (now - lastFaceAnalysisTime < FACE_ANALYSIS_INTERVAL_MS) {
                imageProxy.close()
                return@setAnalyzer
            }
            lastFaceAnalysisTime = now
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
            // Graceful degradation
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
            .setContentTitle("Hey, still here?")
            .setContentText("I haven't seen you in a bit. Come back and let's keep going!")
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
            ).apply { description = "Shows study companion while watching lectures" }
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

        return builder
            .setContentTitle("Guru is studying with you")
            .setContentText("Watching $appName together. Tap to return.")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .apply { if (pi != null) setContentIntent(pi) }
            .build()
    }

    // ── Overlay window ────────────────────────────────────────────

    private fun showOverlay() {
        if (overlayView != null) return
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        overlayView = InteractiveTimerOverlay(this, appName, faceTrackingEnabled, pomodoroEnabled, pomodoroIntervalMinutes) {
            val intent = packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                startActivity(intent)
            }
        }
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dpToPx(8)
            // Position below status bar + safe margin. Query status bar height to avoid notch overlap.
            val statusBarHeight = try {
                val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
                if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else dpToPx(24)
            } catch (_: Exception) { dpToPx(24) }
            y = statusBarHeight + dpToPx(16)
        }
        overlayView!!.setDragListener(DragTouchListener(this, params, windowManager!!, overlayView!!) {
            overlayView?.toggleExpanded()
        })
        windowManager!!.addView(overlayView, params)
        isOverlayVisible = true
    }

    private fun hideOverlay() {
        overlayView?.let {
            try { windowManager?.removeView(it) } catch (_: Exception) {}
        }
        overlayView = null
        isOverlayVisible = false
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
        isServiceRunning = false
        stopCamera()
        runCatching { sperf?.stopAllBoosts(); sperf?.shutdown() }
        overlayView?.destroy() // Clean up the animation handler before clearing the reference
        hideOverlay()
        stopTimer()
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_DESTROY)
        super.onDestroy()
    }

    // ════════════════════════════════════════════════════════════════
    // ════════════════════════════════════════════════════════════════
    // Interactive Layout
    // ════════════════════════════════════════════════════════════════

    class InteractiveTimerOverlay(
        context: Context,
        appLabel: String,
        faceTracking: Boolean,
        private val pomodoroEnabled: Boolean,
        private val pomodoroIntervalMinutes: Int,
        val onReturnClick: () -> Unit
    ) : android.widget.FrameLayout(context) {

        private val bubbleView = CompanionBubbleView(context, faceTracking, pomodoroEnabled, pomodoroIntervalMinutes)

        private var isExpanded = false
        private var isRecordingPaused = false
        private var isPomodoroMode = false

        private fun dpToPx(dp: Int, ctx: Context) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(), ctx.resources.displayMetrics).toInt()

        private val mainContainer = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(OverlayTheme.surface)
                cornerRadius = dpToPx(32, context).toFloat()
            }
        }

        private val contentWrapper = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            layoutParams = android.widget.LinearLayout.LayoutParams(
                dpToPx(88, context), // keep status labels on one line in expanded mode
                LayoutParams.WRAP_CONTENT
            )
            setPadding(0, dpToPx(24, context), 0, dpToPx(24, context))
        }

        private val recDot = View(context).apply {
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(OverlayTheme.error)
            }
            layoutParams = android.widget.LinearLayout.LayoutParams(dpToPx(12, context), dpToPx(12, context)).apply {
                bottomMargin = dpToPx(14, context)
            }
        }

        private val timerText = android.widget.TextView(context).apply {
            text = "00:00"
            textSize = 15f
            setTextColor(OverlayTheme.textPrimary)
            setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL))
            letterSpacing = 0.05f
            layoutParams = android.widget.LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dpToPx(6, context)
            }
        }

        private val headerText = android.widget.TextView(context).apply {
            text = appLabel.take(7).uppercase()
            textSize = 9f
            setTextColor(OverlayTheme.textMuted)
            setTypeface(android.graphics.Typeface.create("sans-serif-bold", android.graphics.Typeface.BOLD))
            letterSpacing = 0.1f
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            layoutParams = android.widget.LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
        }

        private val statusText = android.widget.TextView(context).apply {
            text = "RECORDING"
            textSize = 9f
            setTextColor(OverlayTheme.success)
            setTypeface(android.graphics.Typeface.create("sans-serif-bold", android.graphics.Typeface.BOLD))
            letterSpacing = 0.1f
            gravity = Gravity.CENTER
            maxLines = 1
            isSingleLine = true
            layoutParams = android.widget.LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = dpToPx(16, context)
            }
            visibility = View.GONE
        }

        private val actionsCol = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            visibility = View.GONE
            layoutParams = android.widget.LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = dpToPx(16, context)
            }
        }

        private val pauseBtn = android.widget.TextView(context).apply {
            text = "II"
            textSize = 14f
            setTextColor(OverlayTheme.textPrimary)
            setTypeface(android.graphics.Typeface.create("sans-serif-black", android.graphics.Typeface.BOLD))
            gravity = Gravity.CENTER
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(OverlayTheme.surfaceElevated)
            }
            layoutParams = android.widget.LinearLayout.LayoutParams(dpToPx(44, context), dpToPx(44, context)).apply {
                bottomMargin = dpToPx(12, context)
            }
            setOnClickListener {
                isRecordingPaused = !isRecordingPaused
                setPaused(isRecordingPaused)
                val recAction = if (isRecordingPaused) RecordingService.ACTION_PAUSE else RecordingService.ACTION_RESUME
                context.startService(Intent(context, RecordingService::class.java).apply { action = recAction })
                val ovAction = if (isRecordingPaused) OverlayService.ACTION_PAUSE else OverlayService.ACTION_RESUME
                context.startService(Intent(context, OverlayService::class.java).apply { action = ovAction })
                vibrateLight(context)
            }
        }

        private val finishBtn = android.widget.TextView(context).apply {
            text = "■"
            textSize = 16f
            setTextColor(OverlayTheme.textPrimary)
            gravity = Gravity.CENTER
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(OverlayTheme.error)
            }
            layoutParams = android.widget.LinearLayout.LayoutParams(dpToPx(44, context), dpToPx(44, context))
            setOnClickListener {
                vibrateLight(context)
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putBoolean(PREF_RETURN_REQUESTED, true).apply()
                onReturnClick()
            }
        }

        init {
            clipChildren = false
            clipToPadding = false

            bubbleView.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
            addView(bubbleView)

            contentWrapper.addView(recDot)
            contentWrapper.addView(timerText)
            contentWrapper.addView(headerText)
            contentWrapper.addView(statusText)

            actionsCol.addView(pauseBtn)
            actionsCol.addView(finishBtn)
            contentWrapper.addView(actionsCol)

            mainContainer.addView(contentWrapper)
            
            // Apply margins to the main container so it centers natively, securing padding-free space for the glow!
            val mainLp = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
            mainLp.gravity = Gravity.CENTER
            val margin = dpToPx(24, context)
            mainLp.setMargins(margin, margin, margin, margin)
            addView(mainContainer, mainLp)

            bubbleView.onPomodoroSuggest = {
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(PREF_POMODORO_BREAK_REQUESTED, true)
                    .apply()
                if (!isExpanded) {
                    isPomodoroMode = true
                    toggleExpanded()
                }
                onReturnClick()
            }
            
            bubbleView.onBreathe = { breathe ->
                if (!isRecordingPaused) {
                    recDot.alpha = 0.4f + (0.6f * breathe)
                }
            }

            scaleX = 0.8f
            scaleY = 0.8f
            alpha = 0f
            animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(500).setInterpolator(OvershootInterpolator(1.2f)).start()
        }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            mainContainer.measure(
                MeasureSpec.makeMeasureSpec(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.AT_MOST),
                MeasureSpec.makeMeasureSpec(MeasureSpec.getSize(heightMeasureSpec), MeasureSpec.AT_MOST)
            )
            
            val padding = dpToPx(24, context)
            val w = mainContainer.measuredWidth + (padding * 2)
            val h = mainContainer.measuredHeight + (padding * 2)
            
            bubbleView.measure(
                MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY)
            )
            
            setMeasuredDimension(w, h)
        }

        fun setDragListener(listener: OnTouchListener) {
            bubbleView.setOnTouchListener(listener)
            mainContainer.setOnTouchListener(listener)
            contentWrapper.setOnTouchListener(listener)
        }

        fun updateTime(secs: Int) {
            bubbleView.updateTime(secs)
            val mins = secs / 60
            val s = secs % 60
            timerText.text = "${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}"
        }

        fun updateFocusState(state: FocusState) { bubbleView.updateFocusState(state) }

        fun setPaused(paused: Boolean) {
            isRecordingPaused = paused
            pauseBtn.text = if (paused) "▶" else "II"
            statusText.text = if (paused) "PAUSED" else "RECORDING"
            statusText.setTextColor(if (paused) OverlayTheme.textMuted else OverlayTheme.success)
            recDot.background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(if (paused) OverlayTheme.textMuted else OverlayTheme.error)
            }
            recDot.alpha = 1f
        }

        fun toggleExpanded() {
            isExpanded = !isExpanded
            vibrateLight(context)

            if (isExpanded) {
                statusText.visibility = View.VISIBLE
                actionsCol.visibility = View.VISIBLE
                statusText.alpha = 0f
                actionsCol.alpha = 0f
                statusText.animate().alpha(1f).setDuration(200).start()
                actionsCol.animate().alpha(1f).setDuration(200).start()
            } else {
                statusText.visibility = View.GONE
                actionsCol.visibility = View.GONE
            }
            requestLayout()
        }

        fun destroy() {
            bubbleView.destroy()
        }

        private fun vibrateLight(ctx: Context) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator?.vibrate(VibrationEffect.createOneShot(18, 50))
                } else {
                    @Suppress("DEPRECATION")
                    (ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.vibrate(18)
                }
            } catch (_: Throwable) {}
        }
    }

    class CompanionBubbleView(
        context: Context,
        private val faceTracking: Boolean,
        private val pomodoroEnabled: Boolean,
        private val pomodoroIntervalMinutes: Int
    ) : View(context) {

        var onPomodoroSuggest: (() -> Unit)? = null
        var onBreathe: ((Float) -> Unit)? = null
        private val density = context.resources.displayMetrics.density
        private fun dpToPx(dp: Float) = dp * density

        private var focusState = FocusState.NEUTRAL
        private var prevFocusState = FocusState.NEUTRAL
        private var stateTransitionProgress = 1f
        private val handler = Handler(Looper.getMainLooper())
        private var breathePhase = 0f
        private var seconds = 0
        private var lastMilestone = 0
        private var milestoneFlashUntil = 0L

        private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }

        private val animationRunnable = object : Runnable {
            override fun run() {
                breathePhase += 0.044f
                val cb = (sin(breathePhase.toDouble()).toFloat() + 1f) / 2f
                onBreathe?.invoke(cb)
                if (stateTransitionProgress < 1f) stateTransitionProgress = (stateTransitionProgress + 0.06f).coerceAtMost(1f)
                invalidate()
                handler.postDelayed(this, 32)
            }
        }

        init {
            setLayerType(LAYER_TYPE_SOFTWARE, null)
            handler.post(animationRunnable)
        }

        fun updateTime(s: Int) {
            seconds = s
            val mins = s / 60
            if (pomodoroEnabled && mins > 0 && mins % pomodoroIntervalMinutes == 0 && mins != lastMilestone) {
                lastMilestone = mins
                vibrateMilestone()
                onPomodoroSuggest?.invoke()
            }
        }

        fun updateFocusState(s: FocusState) {
            if (s != focusState) {
                prevFocusState = focusState
                focusState = s
                stateTransitionProgress = 0f
                if (s == FocusState.ABSENT || s == FocusState.DISTRACTED) vibrateAlert()
                invalidate()
            }
        }

        fun destroy() {
            handler.removeCallbacks(animationRunnable)
        }

        private fun getStateColor(s: FocusState): Int = when (s) {
            FocusState.FOCUSED    -> OverlayTheme.success
            FocusState.DISTRACTED -> OverlayTheme.warning
            FocusState.DROWSY     -> OverlayTheme.warning
            FocusState.ABSENT     -> OverlayTheme.error
            FocusState.NEUTRAL    -> OverlayTheme.accent
        }

        private fun interpolateColor(f: Int, t: Int, p: Float): Int {
            val r = (Color.red(f) + (Color.red(t) - Color.red(f)) * p).toInt()
            val g = (Color.green(f) + (Color.green(t) - Color.green(f)) * p).toInt()
            val b = (Color.blue(f) + (Color.blue(t) - Color.blue(f)) * p).toInt()
            return Color.rgb(r, g, b)
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val w = width.toFloat()
            val h = height.toFloat()
            
            val padding = dpToPx(24f)
            val cornerR = dpToPx(32f) 
            
            val breathe = (sin(breathePhase.toDouble()).toFloat() + 1f) / 2f
            val ringAlpha = 0.5f + 0.5f * breathe

            val fromColor = getStateColor(prevFocusState)
            val toColor = getStateColor(focusState)
            val color = interpolateColor(fromColor, toColor, stateTransitionProgress)
            
            var finalColor = color
            if (System.currentTimeMillis() < milestoneFlashUntil) {
                finalColor = interpolateColor(color, OverlayTheme.accent, breathe)
            }

            // The mainContainer handles the inner capsule background now. We only draw the glowing bounding box.
            ringPaint.color = finalColor
            
            // 1. Sharp bright outline directly hugging the container
            val sw = dpToPx(2f)
            ringPaint.strokeWidth = sw
            ringPaint.alpha = (ringAlpha * 255).toInt()
            val strokeRect = RectF(padding, padding, w - padding, h - padding)
            canvas.drawRoundRect(strokeRect, cornerR, cornerR, ringPaint)
            
            // 2. Beautiful expansive soft glow outside the outline
            val glowW = dpToPx(20f)
            ringPaint.strokeWidth = glowW
            ringPaint.alpha = (ringAlpha * 0.35f * 255).toInt()
            canvas.drawRoundRect(strokeRect, cornerR, cornerR, ringPaint)
        }

        private fun vibrateMilestone() {
            try {
                val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) 
                    (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator 
                    else @Suppress("DEPRECATION") (context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) 
                    v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 50, 50, 50), -1))
            } catch (e: Exception) {}
        }

        private fun vibrateAlert() {
            try {
                val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) 
                    (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator 
                    else @Suppress("DEPRECATION") (context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) 
                    v.vibrate(VibrationEffect.createOneShot(100, VibrationEffect.DEFAULT_AMPLITUDE))
            } catch (e: Exception) {}
        }
    }

    class DragTouchListener(
        private val context: Context, 
        private val params: WindowManager.LayoutParams, 
        private val wm: WindowManager, 
        private val rootWindowView: View, 
        val onTap: () -> Unit
    ) : View.OnTouchListener {
        
        private var initialX = 0; private var initialY = 0; private var initialTouchX = 0f; private var initialTouchY = 0f; private var isTap = true; private var isDragging = false
        private val prefs: SharedPreferences = context.getSharedPreferences("guru_overlay_prefs", Context.MODE_PRIVATE)
        private val screenWidth: Int; private val screenHeight: Int
        private fun dpToPx(dp: Int) = (dp * context.resources.displayMetrics.density).toInt()
        
        init {
            val dm = context.resources.displayMetrics
            screenWidth = dm.widthPixels
            screenHeight = dm.heightPixels
            val savedX = prefs.getInt("overlay_x", -1)
            val savedY = prefs.getInt("overlay_y", -1)
            if (savedX >= 0 && savedY >= 0) {
                params.x = savedX.coerceIn(0, screenWidth - 100)
                params.y = savedY.coerceIn(0, screenHeight - 100)
            }
        }

        private fun savePosition() {
            prefs.edit().putInt("overlay_x", params.x).putInt("overlay_y", params.y).apply()
        }

        private fun snapToEdge() {
            val fw = rootWindowView.width.takeIf { it > 0 } ?: 130
            val cx = params.x + fw / 2
            val tx = if (cx < screenWidth / 2) dpToPx(8) else screenWidth - fw - dpToPx(8)
            val ty = params.y.coerceIn(dpToPx(16), screenHeight - fw - dpToPx(64))
            
            val sx = params.x
            val sy = params.y
            
            ValueAnimator.ofFloat(0f, 1f).apply {
                duration = 300
                interpolator = OvershootInterpolator(0.9f)
                addUpdateListener { animator ->
                    val p = animator.animatedValue as Float
                    params.x = (sx + (tx - sx) * p).toInt()
                    params.y = (sy + (ty - sy) * p).toInt()
                    try { wm.updateViewLayout(rootWindowView, params) } catch (e: Exception) {}
                }
                addListener(object : android.animation.Animator.AnimatorListener {
                    override fun onAnimationEnd(a: android.animation.Animator) { savePosition() }
                    override fun onAnimationStart(a: android.animation.Animator) {}
                    override fun onAnimationCancel(a: android.animation.Animator) {}
                    override fun onAnimationRepeat(a: android.animation.Animator) {}
                })
                start()
            }
        }

        private fun vibrateLight() {
            try {
                val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) 
                    (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator 
                    else @Suppress("DEPRECATION") (context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) 
                    v.vibrate(VibrationEffect.createOneShot(10, VibrationEffect.EFFECT_TICK))
            } catch (e: Exception) {}
        }

        override fun onTouch(v: View, event: MotionEvent): Boolean {
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x; initialY = params.y
                    initialTouchX = event.rawX; initialTouchY = event.rawY
                    isTap = true; isDragging = false
                    rootWindowView.animate().scaleX(0.96f).scaleY(0.96f).setDuration(120).start()
                    return true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - initialTouchX
                    val dy = event.rawY - initialTouchY
                    if (abs(dx) > 12 || abs(dy) > 12) {
                        if (!isDragging) {
                            isDragging = true
                            vibrateLight()
                            rootWindowView.animate().scaleX(1f).scaleY(1f).setDuration(80).start()
                        }
                        isTap = false
                        params.x = initialX + dx.toInt()
                        params.y = initialY + dy.toInt()
                        try { wm.updateViewLayout(rootWindowView, params) } catch (e: Exception) {}
                    }
                    return true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    rootWindowView.animate().scaleX(1f).scaleY(1f).setDuration(150).start()
                    if (isTap) {
                        onTap()
                        v.performClick()
                    } else {
                        snapToEdge()
                        vibrateLight()
                    }
                    isDragging = false
                    return true
                }
            }
            return false
        }
    }
}
