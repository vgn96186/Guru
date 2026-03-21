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
                    var fgsType = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                    if (faceTrackingEnabled) {
                        fgsType = fgsType or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
                    }
                    startForeground(NOTIF_ID, buildNotification(), fgsType)
                } else {
                    startForeground(NOTIF_ID, buildNotification())
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
        overlayView!!.setDragListener(DragTouchListener(this, params, windowManager!!))
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

        private val bubbleView = CompanionBubbleView(context, appLabel, faceTracking, pomodoroEnabled, pomodoroIntervalMinutes) {
            toggleExpanded()
        }

        private var isExpanded = false
        private var isRecordingPaused = false
        private var isPomodoroMode = false

        private val expandedCard = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            visibility = View.GONE
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dpToPx(14, context), dpToPx(18, context), dpToPx(14, context), dpToPx(16, context))
            // Transparent — the pill shape is drawn by CompanionBubbleView
            setBackgroundColor(Color.TRANSPARENT)
            alpha = 0f
        }

        private val headerRow = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }

        private val recDot = View(context).apply {
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(Color.parseColor("#8A7CFF"))
            }
            alpha = 0.8f
        }

        private val headerText = android.widget.TextView(context).apply {
            text = appLabel
            textSize = 12f
            setTextColor(Color.parseColor("#A0A3B1"))
            setTypeface(android.graphics.Typeface.SANS_SERIF, android.graphics.Typeface.NORMAL)
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            setSingleLine(true)
        }

        private val timerText = android.widget.TextView(context).apply {
            text = "00:00"
            textSize = 40f
            setTextColor(Color.WHITE)
            setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.NORMAL))
            letterSpacing = -0.02f
        }

        private val statusText = android.widget.TextView(context).apply {
            text = "You're in focus mode"
            textSize = 14f
            setTextColor(Color.parseColor("#A0A3B1"))
            gravity = Gravity.CENTER
        }

        private val actionsRow = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            weightSum = 2f
        }

        private val pauseBtn = android.widget.TextView(context).apply {
            text = "\u23F8"
            textSize = 20f
            setTextColor(Color.WHITE)
            setTypeface(android.graphics.Typeface.SANS_SERIF, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
            minWidth = dpToPx(52, context)
            minHeight = dpToPx(52, context)
            setPadding(0, 0, 0, dpToPx(2, context))
            contentDescription = "Pause recording"
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#14FFFFFF"))
                cornerRadius = dpToPx(16, context).toFloat()
                setStroke(dpToPx(1, context), Color.parseColor("#1AFFFFFF"))
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
            text = "\u25A0"
            textSize = 18f
            setTextColor(Color.WHITE)
            setTypeface(android.graphics.Typeface.SANS_SERIF, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
            minWidth = dpToPx(52, context)
            minHeight = dpToPx(52, context)
            setPadding(0, 0, 0, 0)
            contentDescription = "Finish lecture"
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#266C63FF")) // purple accent
                cornerRadius = dpToPx(16, context).toFloat()
                setStroke(dpToPx(1, context), Color.parseColor("#408A7CFF"))
            }
            setOnClickListener {
                vibrateLight(context)
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(PREF_RETURN_REQUESTED, true)
                    .apply()
                onReturnClick()
            }
        }

        private val quizBtn = android.widget.TextView(context).apply {
            text = "Take Quiz"
            textSize = 12f
            setSingleLine()
            ellipsize = android.text.TextUtils.TruncateAt.END
            setTextColor(Color.WHITE)
            setTypeface(android.graphics.Typeface.SANS_SERIF, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
            visibility = View.GONE
            setPadding(dpToPx(8, context), dpToPx(11, context), dpToPx(8, context), dpToPx(11, context))
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#26FF9800")) // orange accent
                cornerRadius = dpToPx(14, context).toFloat()
                setStroke(dpToPx(1, context), Color.parseColor("#40FF9800"))
            }
            setOnClickListener { v ->
                vibrateLight(context)
                // Trigger quiz return
                isPomodoroMode = false
                v.visibility = View.GONE
                statusText.text = "You're in focus mode"
                val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse("guru-study://pomodoro"))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                context.startActivity(intent)
            }
        }

        init {
            elevation = 30f
            clipChildren = false
            clipToPadding = false

            bubbleView.onPomodoroSuggest = {
                if (!isExpanded) {
                    isPomodoroMode = true
                    toggleExpanded()
                }
            }

            // Bubble view draws the entire pill shape (circle when collapsed, elongated pill when expanded)
            val bubbleSize = dpToPx(96, context)
            val bubbleParams = LayoutParams(bubbleSize, bubbleSize).apply {
                gravity = Gravity.TOP or Gravity.START
            }
            addView(bubbleView, bubbleParams)

            // Buttons overlay the pill's lower section (below the circle area + status text)
            val actionCardWidth = dpToPx(124, context)
            val cardParams = LayoutParams(actionCardWidth, LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.TOP or Gravity.START
                // Keep inside the pill body (CompanionBubbleView expands downward).
                topMargin = bubbleSize + dpToPx(30, context)
                leftMargin = ((bubbleSize - actionCardWidth) / 2f).toInt()
            }

            actionsRow.addView(
                pauseBtn,
                android.widget.LinearLayout.LayoutParams(0, dpToPx(52, context), 1f).apply {
                    marginEnd = dpToPx(8, context)
                }
            )
            actionsRow.addView(
                finishBtn,
                android.widget.LinearLayout.LayoutParams(0, dpToPx(52, context), 1f)
            )

            expandedCard.addView(actionsRow, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
            expandedCard.addView(quizBtn, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = dpToPx(10, context)
            })

            addView(expandedCard, cardParams)

            // When the pill grows, update the FrameLayout so WindowManager sees the new size
            bubbleView.onExpandHeightChanged = { newBubbleH ->
                val lp = bubbleView.layoutParams
                if (lp != null && lp.height != newBubbleH) {
                    lp.height = newBubbleH
                    bubbleView.layoutParams = lp
                }
            }

            // Entry animation
            scaleX = 0.2f
            scaleY = 0.2f
            alpha = 0f
            animate()
                .scaleX(1f).scaleY(1f).alpha(1f)
                .setDuration(600)
                .setInterpolator(OvershootInterpolator(1.2f))
                .start()
        }

        fun setDragListener(listener: OnTouchListener) {
            bubbleView.setOnTouchListener(listener)
        }

        private fun dpToPx(dp: Int, ctx: Context) = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(), ctx.resources.displayMetrics
        ).toInt()

        fun updateTime(secs: Int) {
            bubbleView.updateTime(secs)
            // format MM:SS
            val mins = secs / 60
            val s = secs % 60
            timerText.text = "${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}"
        }

        fun updateFocusState(state: FocusState) { bubbleView.updateFocusState(state) }

        fun setPaused(paused: Boolean) {
            isRecordingPaused = paused
            bubbleView.setPaused(paused)

            pauseBtn.text = if (paused) "\u25B6" else "\u23F8"
            pauseBtn.contentDescription = if (paused) "Resume recording" else "Pause recording"
            statusText.text = if (paused) "Take your time" else "You're in focus mode"
            // Dim rec dot when paused
            recDot.alpha = if (paused) 0.35f else 0.8f
        }

        private fun toggleExpanded() {
            isExpanded = !isExpanded
            vibrateLight(context)

            // Drive the pill morph animation on the bubble view
            bubbleView.animateExpand(isExpanded)

            if (isExpanded) {
                // Adjust visibility for Pomodoro mode
                if (isPomodoroMode) {
                    quizBtn.visibility = View.VISIBLE
                    pauseBtn.visibility = View.GONE
                    finishBtn.visibility = View.GONE
                    statusText.text = "Time for a quick quiz?"
                } else {
                    quizBtn.visibility = View.GONE
                    pauseBtn.visibility = View.VISIBLE
                    finishBtn.visibility = View.VISIBLE
                    statusText.text = if (isRecordingPaused) "Take your time" else "You're in focus mode"
                }

                // Show buttons with a slight delay so the pill has started growing
                expandedCard.visibility = View.VISIBLE
                expandedCard.alpha = 0f
                expandedCard.animate().alpha(1f)
                    .setStartDelay(120)
                    .setDuration(200)
                    .start()
            } else {
                isPomodoroMode = false // Reset mode when collapsed
                expandedCard.animate().alpha(0f)
                    .setDuration(150)
                    .withEndAction { expandedCard.visibility = View.GONE }
                    .start()
            }
        }

        fun destroy() {
            bubbleView.destroy()
        }

        private fun vibrateLight(ctx: Context) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val vm = ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                    vm?.defaultVibrator?.vibrate(VibrationEffect.createOneShot(18, 50))
                } else {
                    @Suppress("DEPRECATION")
                    val v = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                    @Suppress("DEPRECATION")
                    v?.vibrate(18)
                }
            } catch (_: Throwable) {
            }
        }
    }

class CompanionBubbleView(
        context: Context,
        private val appLabel: String,
        private val faceTracking: Boolean,
        private val pomodoroEnabled: Boolean,
        private val pomodoroIntervalMinutes: Int,
        val onTap: () -> Unit
    ) : View(context) {

        var onPomodoroSuggest: (() -> Unit)? = null


        private val density = context.resources.displayMetrics.density
        private val scaledDensity = context.resources.displayMetrics.scaledDensity
        private fun dpToPx(dp: Float) = dp * density
        private fun spToPx(sp: Float) = sp * scaledDensity

        private var seconds = 0
        private var isPaused = false
        private var focusState = FocusState.NEUTRAL
        private var prevFocusState = FocusState.NEUTRAL
        private var lastMilestone = 0
        private var milestoneFlashUntil = 0L
        private var stateTransitionProgress = 1f
        private val handler = Handler(Looper.getMainLooper())
        private var breathePhase = 0f

        // Pill expansion animation
        var expandProgress = 0f
            private set
        // Extra height in dp when fully expanded. Increased to ensure the pill fully
        // covers the Pause/Finish controls (prevents "Finish" spilling past the pill).
        private val expandedExtraDp = 165f
        private var expandAnimator: ValueAnimator? = null
        var onExpandHeightChanged: ((Int) -> Unit)? = null

        private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
        private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
        private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#A0A3B1"); textAlign = Paint.Align.CENTER; setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.NORMAL)) }
        private val timePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textAlign = Paint.Align.CENTER; setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD)) }
        private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#8A7CFF"); style = Paint.Style.FILL }
        private val redDotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#FF5252"); style = Paint.Style.FILL }

        private val animationRunnable = object : Runnable {
            override fun run() {
                breathePhase += 0.044f  // ~4.5s cycle to match Figma spec
                if (stateTransitionProgress < 1f) stateTransitionProgress = (stateTransitionProgress + 0.06f).coerceAtMost(1f)
                invalidate()
                handler.postDelayed(this, 32)
            }
        }

        init {
            setLayerType(LAYER_TYPE_SOFTWARE, null)
            labelPaint.textSize = spToPx(10f)
            labelPaint.letterSpacing = 0.08f
            // More premium/legible timer styling.
            timePaint.textSize = spToPx(20f)
            timePaint.setShadowLayer(dpToPx(10f), 0f, dpToPx(2f), Color.parseColor("#33000000"))
            ringPaint.strokeWidth = dpToPx(3f)
            handler.post(animationRunnable)
        }

        fun updateTime(s: Int) {
            seconds = s
            val mins = s / 60
            
            if (pomodoroEnabled && mins > 0 && mins % pomodoroIntervalMinutes == 0 && mins != lastMilestone) {
                lastMilestone = mins
                vibrateMilestone()
                // Auto-expand to suggest Pomodoro break
                onPomodoroSuggest?.invoke()
            } else if (mins > 0 && mins % 15 == 0 && mins != lastMilestone) {
                // Flash purple circle for 6 seconds at 15-minute intervals if not pomodoro hit
                lastMilestone = mins
                milestoneFlashUntil = System.currentTimeMillis() + 6000
                vibrateMilestone()
            }
            invalidate()
        }
        fun setPaused(paused: Boolean) {
            isPaused = paused
            invalidate()
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

        fun animateExpand(expand: Boolean) {
            expandAnimator?.cancel()
            val from = expandProgress
            val to = if (expand) 1f else 0f
            expandAnimator = ValueAnimator.ofFloat(from, to).apply {
                duration = if (expand) 320 else 220
                interpolator = if (expand) OvershootInterpolator(0.6f) else AccelerateDecelerateInterpolator()
                addUpdateListener { anim ->
                    expandProgress = anim.animatedValue as Float
                    // Update view height to accommodate the pill, capped to leave room above nav bar
                    val baseSize = dpToPx(96f).toInt()
                    val extraH = (expandProgress * dpToPx(expandedExtraDp)).toInt()
                    val screenH = context.resources.displayMetrics.heightPixels
                    val newH = (baseSize + extraH).coerceAtMost(screenH - dpToPx(96f).toInt())
                    if (layoutParams != null && layoutParams.height != newH) {
                        layoutParams.height = newH
                        requestLayout()
                        onExpandHeightChanged?.invoke(newH)
                    }
                    invalidate()
                }
                start()
            }
        }

        fun destroy() {
            handler.removeCallbacks(animationRunnable)
            expandAnimator?.cancel()
        }

        private fun getStateColor(s: FocusState): Int = when (s) {
            FocusState.FOCUSED    -> Color.parseColor("#4CAF50")
            FocusState.DISTRACTED -> Color.parseColor("#FF9800")
            FocusState.DROWSY     -> Color.parseColor("#FFC107")
            FocusState.ABSENT     -> Color.parseColor("#FF5252")
            FocusState.NEUTRAL    -> Color.parseColor("#6C63FF")
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
            val cx = w / 2f
            // Circle center stays at top half
            val circleCy = w / 2f
            val inset = dpToPx(2f)

            // Pill rect: when collapsed, it's a circle (h == w). When expanded, it elongates downward.
            val pillLeft = inset
            val pillTop = inset
            val pillRight = w - inset
            val pillBottom = h - inset
            val cornerR = (w / 2f) - inset  // semicircular ends

            val breathe = (sin(breathePhase.toDouble()).toFloat() + 1f) / 2f
            val ringAlpha = (0.4f + 0.6f * breathe)

            val gradientShader = LinearGradient(
                pillLeft, pillTop, pillRight, pillBottom,
                Color.parseColor("#6C63FF"), Color.parseColor("#8A7CFF"),
                Shader.TileMode.CLAMP
            )

            // Glow: 16dp stroke, inset by 8dp from outer boundary
            val glowInset = dpToPx(8f)
            val glowRect = RectF(pillLeft + glowInset, pillTop + glowInset, pillRight - glowInset, pillBottom - glowInset)
            val glowCorner = cornerR - glowInset
            ringPaint.shader = gradientShader
            ringPaint.strokeWidth = dpToPx(16f)
            ringPaint.alpha = (ringAlpha * 0.30f * 255).toInt()
            canvas.drawRoundRect(glowRect, glowCorner, glowCorner, ringPaint)

            // Main ring: 5dp stroke, inset by 2.5dp from outer boundary
            val ringInset = dpToPx(2.5f)
            val ringRect = RectF(pillLeft + ringInset, pillTop + ringInset, pillRight - ringInset, pillBottom - ringInset)
            val ringCorner = cornerR - ringInset
            ringPaint.shader = gradientShader
            ringPaint.strokeWidth = dpToPx(5f)
            ringPaint.alpha = (ringAlpha * 255).toInt()
            canvas.drawRoundRect(ringRect, ringCorner, ringCorner, ringPaint)
            ringPaint.shader = null

            // Dark fill — inside the ring (inset by 5dp total = ring outer edge)
            val fillInset = dpToPx(5f)
            val fillRect = RectF(pillLeft + fillInset, pillTop + fillInset, pillRight - fillInset, pillBottom - fillInset)
            val fillCorner = cornerR - fillInset
            bgPaint.color = Color.parseColor("#0D0D16")
            bgPaint.shader = null
            canvas.drawRoundRect(fillRect, fillCorner, fillCorner, bgPaint)

            // --- App name (uppercase, 10sp, #A0A3B1) — centered in circle area ---
            val outerR = cornerR
            val maxLabelWidth = outerR * 1.6f
            val labelRaw = appLabel.uppercase()
            val textPaint = android.text.TextPaint(labelPaint)
            val label = android.text.TextUtils.ellipsize(
                labelRaw, textPaint, maxLabelWidth, android.text.TextUtils.TruncateAt.END
            ).toString()
            // Push label up slightly to keep clear separation from timer.
            canvas.drawText(label, cx, circleCy - dpToPx(10f), labelPaint)

            // --- Timer (16sp, white 0.95 opacity) ---
            timePaint.alpha = (0.95f * 255).toInt()
            val mins = seconds / 60
            val secs = seconds % 60
            val timeStr = "${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}"
            // Pull timer down so it never collides with app label.
            canvas.drawText(timeStr, cx, circleCy + dpToPx(18f), timePaint)

            // --- Recording indicator dot (bottom-right of circle area) ---
            // Smoothly fades out as the pill expands (fully hidden by 30% expand)
            if (!isPaused) {
                val fadeAlpha = (1f - expandProgress * 3.33f).coerceIn(0f, 1f)
                if (fadeAlpha > 0f) {
                    val dotBreathe = 0.4f + 0.6f * breathe
                    dotPaint.alpha = (fadeAlpha * dotBreathe * 255).toInt()
                    val dotX = cx + outerR * 0.77f
                    val dotY = circleCy + outerR * 0.77f
                    canvas.drawCircle(dotX, dotY, dpToPx(3f), dotPaint)
                }
            }

            // --- Expanded content drawn on canvas (status text) ---
            if (expandProgress > 0.1f) {
                val contentAlpha = ((expandProgress - 0.1f) / 0.9f).coerceIn(0f, 1f)
                // Recording status below the circle
                val statusY = w + dpToPx(8f)
                labelPaint.alpha = (contentAlpha * 0.7f * 255).toInt()
                val statusStr = if (isPaused) "Paused" else "Recording"
                canvas.drawText(statusStr, cx, statusY, labelPaint)
                labelPaint.alpha = 255

                if (!isPaused) {
                    val dotAlpha = (contentAlpha * (0.3f + 0.7f * breathe) * 255).toInt()
                    redDotPaint.alpha = dotAlpha
                    val redDotY = statusY + dpToPx(14f)
                    canvas.drawCircle(cx, redDotY, dpToPx(3f), redDotPaint)
                }
            }
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

        override fun onDetachedFromWindow() {
            super.onDetachedFromWindow()
            handler.removeCallbacks(animationRunnable)
        }
    }

    class DragTouchListener(private val context: Context, private val params: WindowManager.LayoutParams, private val wm: WindowManager) : View.OnTouchListener {
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

        private fun snapToEdge(v: View) {
            val bw = v.width.takeIf { it > 0 } ?: 130
            val cx = params.x + bw / 2
            val tx = if (cx < screenWidth / 2) dpToPx(16) else screenWidth - bw - dpToPx(16)
            val ty = params.y.coerceIn(dpToPx(16), screenHeight - v.height - dpToPx(64))
            
            val sx = params.x
            val sy = params.y
            
            ValueAnimator.ofFloat(0f, 1f).apply {
                duration = 250
                interpolator = OvershootInterpolator(0.8f)
                addUpdateListener { animator ->
                    val p = animator.animatedValue as Float
                    params.x = (sx + (tx - sx) * p).toInt()
                    params.y = (sy + (ty - sy) * p).toInt()
                    try { wm.updateViewLayout(v.parent as View, params) } catch (e: Exception) {}
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
                    v.animate().scaleX(0.95f).scaleY(0.95f).setDuration(100).start()
                    return true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - initialTouchX
                    val dy = event.rawY - initialTouchY
                    if (abs(dx) > 10 || abs(dy) > 10) {
                        if (!isDragging) {
                            isDragging = true
                            vibrateLight()
                            v.animate().scaleX(1f).scaleY(1f).setDuration(50).start()
                        }
                        isTap = false
                        params.x = initialX + dx.toInt()
                        params.y = initialY + dy.toInt()
                        try { wm.updateViewLayout(v.parent as View, params) } catch (e: Exception) {}
                    }
                    return true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.animate().scaleX(1f).scaleY(1f).setDuration(100).start()
                    if (isTap) {
                        (v as? CompanionBubbleView)?.onTap?.invoke()
                        v.performClick()
                    } else {
                        snapToEdge(v)
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
