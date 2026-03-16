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
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RadialGradient
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
import kotlin.math.cos

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
        overlayView = InteractiveTimerOverlay(this, appName, faceTrackingEnabled) {
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
            y = dpToPx(120)
        }
        overlayView!!.setDragListener(DragTouchListener(this, params, windowManager!!))
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
        overlayView?.destroy() // Clean up the animation handler
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
        val onReturnClick: () -> Unit
    ) : android.widget.FrameLayout(context) {

        private val bubbleView = object : CompanionBubbleView(context, appLabel, faceTracking) {
            override fun onTap() {
                toggleMenu()
            }
        }

        private var isMenuExpanded = false
        private var isRecordingPaused = false

        private val menuLayout = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            visibility = View.GONE
            setPadding(dpToPx(64, context), dpToPx(8, context), dpToPx(12, context), dpToPx(8, context))
            gravity = Gravity.CENTER_VERTICAL
            background = android.graphics.drawable.GradientDrawable().apply {
                orientation = android.graphics.drawable.GradientDrawable.Orientation.TL_BR
                colors = intArrayOf(
                    Color.parseColor("#E61A1A24"), // theme.colors.surface with high alpha
                    Color.parseColor("#E60F0F14")  // theme.colors.background with high alpha
                )
                cornerRadius = dpToPx(32, context).toFloat()
                setStroke(dpToPx(1, context), Color.parseColor("#26FFFFFF")) // Subtle inner rim
            }
            elevation = 12f
            translationX = dpToPx(20, context).toFloat()
            alpha = 0f
        }

        private val infoStack = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(dpToPx(12, context), 0, dpToPx(16, context), 0)
        }

        private val appLabelView = android.widget.TextView(context).apply {
            text = appLabel.uppercase()
            textSize = 10f
            setTextColor(Color.parseColor("#B8B8D0"))
            setTypeface(android.graphics.Typeface.SANS_SERIF, android.graphics.Typeface.BOLD)
            letterSpacing = 0.15f
            maxLines = 1
        }

        private val modeChip = android.widget.TextView(context).apply {
            text = if (faceTracking) "LIVE FOCUS" else "STUDY TIMER"
            textSize = 8f
            setTextColor(Color.parseColor("#6C63FF"))
            setPadding(dpToPx(6, context), dpToPx(1, context), dpToPx(6, context), dpToPx(1, context))
            setTypeface(android.graphics.Typeface.SANS_SERIF, android.graphics.Typeface.BOLD)
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#1A6C63FF"))
                cornerRadius = 999f
            }
        }

        private val pauseBtn = android.widget.TextView(context).apply {
            text = "Pause"
            textSize = 11f
            setTextColor(Color.WHITE)
            setTypeface(android.graphics.Typeface.SANS_SERIF, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(dpToPx(14, context), dpToPx(8, context), dpToPx(14, context), dpToPx(8, context))
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#33334D"))
                cornerRadius = dpToPx(12, context).toFloat()
            }
            setOnClickListener {
                isRecordingPaused = !isRecordingPaused
                text = if (isRecordingPaused) "Resume" else "Pause"
                setTextColor(if (isRecordingPaused) Color.parseColor("#6C63FF") else Color.WHITE)
                
                val recAction = if (isRecordingPaused) RecordingService.ACTION_PAUSE else RecordingService.ACTION_RESUME
                context.startService(Intent(context, RecordingService::class.java).apply { action = recAction })

                val ovAction = if (isRecordingPaused) OverlayService.ACTION_PAUSE else OverlayService.ACTION_RESUME
                context.startService(Intent(context, OverlayService::class.java).apply { action = ovAction })

                vibrateLight(context)
            }
        }

        private val returnBtn = android.widget.TextView(context).apply {
            text = "Finish"
            textSize = 11f
            setTextColor(Color.WHITE)
            setTypeface(android.graphics.Typeface.SANS_SERIF, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(dpToPx(14, context), dpToPx(8, context), dpToPx(14, context), dpToPx(8, context))
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#F44336"))
                cornerRadius = dpToPx(12, context).toFloat()
            }
            setOnClickListener {
                vibrateLight(context)
                onReturnClick()
            }
        }

        init {
            elevation = 30f
            clipChildren = false
            clipToPadding = false

            infoStack.addView(appLabelView)
            infoStack.addView(modeChip, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = dpToPx(2, context)
            })
            menuLayout.addView(infoStack)

            menuLayout.addView(pauseBtn, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                marginEnd = dpToPx(6, context)
            })
            menuLayout.addView(returnBtn)

            // Add menu first so it's behind the bubble
            addView(menuLayout, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.CENTER_VERTICAL
            })

            val bubbleParams = LayoutParams(dpToPx(84, context), dpToPx(84, context)).apply {
                gravity = Gravity.CENTER_VERTICAL
            }
            addView(bubbleView, bubbleParams)
            
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

        fun updateTime(secs: Int) { bubbleView.updateTime(secs) }
        fun updateFocusState(state: FocusState) { bubbleView.updateFocusState(state) }

        fun setPaused(paused: Boolean) {
            isRecordingPaused = paused
            pauseBtn.text = if (paused) "Resume" else "Pause"
            pauseBtn.setTextColor(if (paused) Color.parseColor("#6C63FF") else Color.WHITE)
        }

        private fun toggleMenu() {
            isMenuExpanded = !isMenuExpanded
            vibrateLight(context)
            
            if (isMenuExpanded) {
                menuLayout.visibility = View.VISIBLE
                menuLayout.animate()
                    .translationX(0f)
                    .alpha(1f)
                    .setDuration(400)
                    .setInterpolator(OvershootInterpolator(1.0f))
                    .start()
            } else {
                menuLayout.animate()
                    .translationX(dpToPx(20, context).toFloat())
                    .alpha(0f)
                    .setDuration(300)
                    .setInterpolator(AccelerateDecelerateInterpolator())
                    .withEndAction { menuLayout.visibility = View.GONE }
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
                    vm?.defaultVibrator?.vibrate(VibrationEffect.createOneShot(15, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    val v = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v?.vibrate(VibrationEffect.createOneShot(15, VibrationEffect.DEFAULT_AMPLITUDE))
                    } else {
                        @Suppress("DEPRECATION")
                        v?.vibrate(15)
                    }
                }
            } catch (_: Exception) {}
        }
    }

    abstract class CompanionBubbleView(
        context: Context,
        private val appLabel: String,
        private val faceTracking: Boolean
    ) : View(context) {
        
        abstract fun onTap()

        private val density = context.resources.displayMetrics.density
        private val scaledDensity = context.resources.displayMetrics.scaledDensity
        private fun dpToPx(dp: Float) = dp * density
        private fun spToPx(sp: Float) = sp * scaledDensity

        private var seconds = 0
        private var focusState = FocusState.NEUTRAL
        private var prevFocusState = FocusState.NEUTRAL
        private var lastMilestone = 0
        private var milestoneFlashUntil = 0L
        private var stateTransitionProgress = 1f
        private val handler = Handler(Looper.getMainLooper())
        private var breathePhase = 0f
        private var particlePhase = 0f

        private val encourageFocused = arrayOf("Focused", "Locked in", "Guru is happy", "Study mode", "Flow state", "Keep going")
        private val encourageNeutral = arrayOf("Guru is here", "Let's learn", "Ready?", "Together")
        private val encourageDistracted = arrayOf("Eyes here! 👀", "Come back", "Guru is waiting", "Stay focused")
        private val encourageDrowsy = arrayOf("Wake up! ☕", "Energy up!", "Stay with Guru", "Take a breath")
        private val encourageAbsent = arrayOf("Guru misses you", "Where are you?", "Still here...", "Hello?")
        private val milestoneMessages = arrayOf("15m! 🌟", "30m! ⭐", "45m! 💫", "1 HOUR! 🏆", "1h 15m! 🔥", "1h 30m! 💪")

        private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
        private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; maskFilter = BlurMaskFilter(dpToPx(12f), BlurMaskFilter.Blur.OUTER) }
        private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
        private val ringBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.parseColor("#1AFFFFFF") }
        private val headerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#80FFFFFF"); textAlign = Paint.Align.CENTER; setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)) }
        private val timePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textAlign = Paint.Align.CENTER; setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD)) }
        private val msgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)) }
        private val particlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }

        private val animationRunnable = object : Runnable {
            override fun run() {
                breathePhase += 0.035f
                particlePhase += 0.025f
                if (stateTransitionProgress < 1f) stateTransitionProgress = (stateTransitionProgress + 0.06f).coerceAtMost(1f)
                invalidate()
                handler.postDelayed(this, 32)
            }
        }

        init {
            setLayerType(LAYER_TYPE_SOFTWARE, null)
            headerPaint.textSize = spToPx(8f)
            timePaint.textSize = spToPx(15f)
            msgPaint.textSize = spToPx(9f)
            ringPaint.strokeWidth = dpToPx(3.5f)
            ringBgPaint.strokeWidth = dpToPx(3.5f)
            handler.post(animationRunnable)
        }

        fun updateTime(s: Int) {
            seconds = s
            val mins = s / 60
            if (mins > 0 && mins % 15 == 0 && mins != lastMilestone) {
                lastMilestone = mins
                milestoneFlashUntil = System.currentTimeMillis() + 6000
                vibrateMilestone()
            }
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

        fun destroy() {
            handler.removeCallbacks(animationRunnable)
        }

        override fun onDetachedFromWindow() {
            super.onDetachedFromWindow()
            handler.removeCallbacks(animationRunnable)
        }

        private fun getMessage(): String {
            if (System.currentTimeMillis() < milestoneFlashUntil) {
                val idx = (lastMilestone / 15 - 1).coerceIn(0, milestoneMessages.size - 1)
                return milestoneMessages[idx]
            }
            val pool = when (focusState) {
                FocusState.FOCUSED    -> encourageFocused
                FocusState.NEUTRAL    -> encourageNeutral
                FocusState.DISTRACTED -> encourageDistracted
                FocusState.DROWSY     -> encourageDrowsy
                FocusState.ABSENT     -> encourageAbsent
            }
            return pool[(seconds / 12) % pool.size]
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
            val cx = width / 2f
            val cy = height / 2f
            val r = (width / 2f) - dpToPx(14f)
            val now = System.currentTimeMillis()
            val isMilestone = now < milestoneFlashUntil

            val ringColor = if (isMilestone) Color.parseColor("#FFD700") 
                            else interpolateColor(getStateColor(prevFocusState), getStateColor(focusState), stateTransitionProgress)

            val breathe = (sin(breathePhase.toDouble()).toFloat() + 1f) / 2f
            
            // Outer ambient glow
            glowPaint.color = Color.argb((45 * breathe + 15).toInt(), Color.red(ringColor), Color.green(ringColor), Color.blue(ringColor))
            canvas.drawCircle(cx, cy, r + dpToPx(4f), glowPaint)

            // Main body
            bgPaint.shader = RadialGradient(cx, cy, r, 
                intArrayOf(Color.parseColor("#2A2A38"), Color.parseColor("#12121A")), 
                null, Shader.TileMode.CLAMP)
            canvas.drawCircle(cx, cy, r, bgPaint)
            bgPaint.shader = null

            // Inner rim highlight
            val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = dpToPx(1.2f)
                color = Color.parseColor("#33FFFFFF")
            }
            canvas.drawCircle(cx, cy, r - dpToPx(0.6f), rimPaint)

            // Progress rings
            val oval = RectF(cx - r, cy - r, cx + r, cy + r)
            canvas.drawArc(oval, -90f, 360f, false, ringBgPaint)

            ringPaint.color = ringColor
            canvas.drawArc(oval, -90f, (seconds % 60) / 60f * 360f, false, ringPaint)
            
            drawCompanion(canvas, cx, cy, r, ringColor)

            // Text info
            val mins = seconds / 60
            val secs = seconds % 60
            canvas.drawText("${mins}:${secs.toString().padStart(2, '0')}", cx, cy + dpToPx(7f), timePaint)
            canvas.drawText("GURU", cx, cy - r * 0.5f, headerPaint)

            msgPaint.color = ringColor
            canvas.drawText(getMessage(), cx, cy + r - dpToPx(12f), msgPaint)
            
            if (focusState == FocusState.FOCUSED || isMilestone) {
                drawParticles(canvas, cx, cy, r, ringColor, isMilestone)
            }
        }

        private fun drawCompanion(canvas: Canvas, cx: Float, cy: Float, r: Float, color: Int) {
            val eyeSpacing = r * 0.45f
            val eyeY = cy - r * 0.18f
            val eyeW = r * 0.09f
            val eyeH = r * 0.13f
            
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                this.color = Color.WHITE
                style = Paint.Style.FILL
            }

            val isBlinking = (System.currentTimeMillis() % 5000) > 4800

            when {
                focusState == FocusState.ABSENT -> {
                    paint.style = Paint.Style.STROKE
                    paint.strokeWidth = dpToPx(2.5f)
                    paint.color = Color.parseColor("#66FFFFFF")
                    val arcRectL = RectF(cx - eyeSpacing/2 - eyeW, eyeY - eyeH/2, cx - eyeSpacing/2 + eyeW, eyeY + eyeH/2)
                    val arcRectR = RectF(cx + eyeSpacing/2 - eyeW, eyeY - eyeH/2, cx + eyeSpacing/2 + eyeW, eyeY + eyeH/2)
                    canvas.drawArc(arcRectL, 0f, 180f, false, paint)
                    canvas.drawArc(arcRectR, 0f, 180f, false, paint)
                }
                focusState == FocusState.DROWSY || isBlinking -> {
                    val rectL = RectF(cx - eyeSpacing/2 - eyeW, eyeY - dpToPx(1.5f), cx - eyeSpacing/2 + eyeW, eyeY + dpToPx(1.5f))
                    val rectR = RectF(cx + eyeSpacing/2 - eyeW, eyeY - dpToPx(1.5f), cx + eyeSpacing/2 + eyeW, eyeY + dpToPx(1.5f))
                    canvas.drawRoundRect(rectL, 4f, 4f, paint)
                    canvas.drawRoundRect(rectR, 4f, 4f, paint)
                }
                else -> {
                    val rectL = RectF(cx - eyeSpacing/2 - eyeW/2, eyeY - eyeH/2, cx - eyeSpacing/2 + eyeW/2, eyeY + eyeH/2)
                    val rectR = RectF(cx + eyeSpacing/2 - eyeW/2, eyeY - eyeH/2, cx + eyeSpacing/2 + eyeW/2, eyeY + eyeH/2)
                    canvas.drawRoundRect(rectL, eyeW, eyeW, paint)
                    canvas.drawRoundRect(rectR, eyeW, eyeW, paint)
                    
                    if (focusState == FocusState.FOCUSED) {
                        paint.color = color
                        canvas.drawCircle(cx - eyeSpacing/2, eyeY, eyeW * 0.35f, paint)
                        canvas.drawCircle(cx + eyeSpacing/2, eyeY, eyeW * 0.35f, paint)
                    }
                }
            }
        }

        private fun drawParticles(canvas: Canvas, cx: Float, cy: Float, r: Float, color: Int, isM: Boolean) {
            val num = if (isM) 12 else 6
            for (i in 0 until num) {
                val p = particlePhase + i * (Math.PI * 2 / num)
                val drift = sin(p * 2).toFloat() * dpToPx(4f)
                val d = r + dpToPx(8f) + drift
                val px = cx + cos(p).toFloat() * d
                val py = cy + sin(p).toFloat() * d
                val sz = dpToPx(2.5f) + sin(p * 4).toFloat() * dpToPx(1.2f)
                val alpha = (160 + sin(p * 3) * 90).toInt().coerceIn(0, 255)
                particlePaint.color = Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color))
                canvas.drawCircle(px, py, sz, particlePaint)
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

    }

    class DragTouchListener(private val context: Context, private val params: WindowManager.LayoutParams, private val wm: WindowManager) : View.OnTouchListener {
        private var initialX = 0; private var initialY = 0; private var initialTouchX = 0f; private var initialTouchY = 0f; private var isTap = true; private var isDragging = false
        private val prefs: SharedPreferences = context.getSharedPreferences("guru_overlay_prefs", Context.MODE_PRIVATE)
        private val screenWidth: Int; private val screenHeight: Int
        
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
            val tx = if (cx < screenWidth / 2) 16 else screenWidth - bw - 16
            val ty = params.y.coerceIn(16, screenHeight - v.height - 64)
            
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
                        (v as? CompanionBubbleView)?.onTap()
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
