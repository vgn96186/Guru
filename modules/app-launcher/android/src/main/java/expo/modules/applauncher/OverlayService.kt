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
 * The companion reacts to the user's focus state, shows encouragement,
 * and celebrates milestones — creating the feeling of studying with someone.
 *
 * Focus state ring colours:
 *   Purple  = timer only (neutral/no face tracking)
 *   Green   = face detected, focused
 *   Orange  = drowsy or looking away
 *   Red     = face absent (sends notification after 15s)
 */
class OverlayService : Service(), LifecycleOwner {

    private val lifecycleRegistry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = lifecycleRegistry

    private var windowManager: WindowManager? = null
    private var overlayView: InteractiveTimerOverlay? = null
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
    // Throttle ML Kit to 1 analysis per 2 seconds to save battery during long lectures
    private var lastFaceAnalysisTime = 0L
    private val FACE_ANALYSIS_INTERVAL_MS = 2000L

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
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    val fgsType = if (faceTrackingEnabled) {
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                    } else {
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                    }
                    startForeground(NOTIF_ID, buildNotification(), fgsType)
                } else {
                    startForeground(NOTIF_ID, buildNotification())
                }
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
    ) : android.widget.LinearLayout(context) {

        private val bubbleView = CompanionBubbleView(context, appLabel, faceTracking) {
             toggleMenu()
        }

        private var isMenuExpanded = true
        private var isRecordingPaused = false

        private val menuLayout = android.widget.LinearLayout(context).apply {
            orientation = HORIZONTAL
            visibility = View.VISIBLE
            setPadding(16, 10, 16, 10)
            gravity = Gravity.CENTER_VERTICAL
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#F0171C28"))
                cornerRadius = 42f
                setStroke(2, Color.parseColor("#33425A8A"))
            }
            elevation = 12f
        }

        private val infoStack = android.widget.LinearLayout(context).apply {
            orientation = VERTICAL
            setPadding(0, 0, 16, 0)
        }

        private val appLabelView = android.widget.TextView(context).apply {
            text = appLabel.uppercase()
            textSize = 10f
            setTextColor(Color.parseColor("#E7ECFF"))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            letterSpacing = 0.08f
            maxLines = 1
        }

        private val modeChip = android.widget.TextView(context).apply {
            text = if (faceTracking) "Face focus on" else "Timer mode"
            textSize = 10f
            setTextColor(Color.parseColor("#A9B5D0"))
            setPadding(12, 6, 12, 6)
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#162133"))
                cornerRadius = 999f
                setStroke(1, Color.parseColor("#2D3952"))
            }
        }

        private val pauseBtn = android.widget.TextView(context).apply {
            text = "Pause"
            textSize = 12f
            setTextColor(Color.parseColor("#F4F6FF"))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
            minWidth = dpToPx(58, context)
            setPadding(16, 14, 16, 14)
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#222B3D"))
                cornerRadius = 28f
                setStroke(1, Color.parseColor("#31405D"))
            }
            setOnClickListener {
                isRecordingPaused = !isRecordingPaused
                text = if (isRecordingPaused) "Resume" else "Pause"
                val action = if (isRecordingPaused) RecordingService.ACTION_PAUSE else RecordingService.ACTION_RESUME
                val intent = Intent(context, RecordingService::class.java).apply { this.action = action }
                context.startService(intent)
                vibrateLight(context)
            }
        }

        private val returnBtn = android.widget.TextView(context).apply {
            text = "Return"
            textSize = 12f
            setTextColor(Color.parseColor("#FFD7D7"))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
            minWidth = dpToPx(58, context)
            setPadding(16, 14, 16, 14)
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#3A1D24"))
                cornerRadius = 28f
                setStroke(1, Color.parseColor("#6C3642"))
            }
            setOnClickListener {
                vibrateLight(context)
                onReturnClick()
            }
        }

        init {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            elevation = 16f

            infoStack.addView(appLabelView)
            infoStack.addView(modeChip, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = 8
            })
            menuLayout.addView(infoStack, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                marginEnd = 12
            })

            menuLayout.addView(pauseBtn, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                marginEnd = 12
            })
            menuLayout.addView(returnBtn)

            val bubbleParams = LayoutParams(dpToPx(104, context), dpToPx(104, context))
            addView(bubbleView, bubbleParams)

            val menuParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                marginStart = 8
            }
            addView(menuLayout, menuParams)
            
            // Entry animation
            scaleX = 0.3f
            scaleY = 0.3f
            alpha = 0f
            animate()
                .scaleX(1f).scaleY(1f).alpha(1f)
                .setDuration(400)
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

        private fun toggleMenu() {
            isMenuExpanded = !isMenuExpanded
            vibrateLight(context)
            
            if (isMenuExpanded) {
                menuLayout.visibility = View.VISIBLE
                menuLayout.scaleX = 0.5f
                menuLayout.alpha = 0f
                menuLayout.animate()
                    .scaleX(1f).alpha(1f)
                    .setDuration(200)
                    .setInterpolator(OvershootInterpolator())
                    .start()
            } else {
                menuLayout.animate()
                    .scaleX(0.5f).alpha(0f)
                    .setDuration(150)
                    .withEndAction { menuLayout.visibility = View.GONE }
                    .start()
            }

            val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val params = layoutParams as? WindowManager.LayoutParams
            if (params != null) {
                params.width = WindowManager.LayoutParams.WRAP_CONTENT
                wm.updateViewLayout(this, params)
            }
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

    // ════════════════════════════════════════════════════════════════
    // Companion Bubble — a body-double study companion with enhanced visuals
    // ════════════════════════════════════════════════════════════════

    class CompanionBubbleView(
        context: Context,
        private val appLabel: String,
        private val faceTracking: Boolean,
        val onTap: () -> Unit
    ) : View(context) {

        private var seconds = 0
        private var focusState = FocusState.NEUTRAL
        private var prevFocusState = FocusState.NEUTRAL
        private var lastMilestone = 0 // last milestone minute announced
        private var milestoneFlashUntil = 0L // show milestone message until this time
        private var stateTransitionProgress = 1f // 0..1 for smooth color transitions
        private var pulseScale = 1f
        private var xpEarned = 0 // XP accumulated this session (2 XP per minute)
        
        // Animation values
        private val handler = Handler(Looper.getMainLooper())
        private var breathePhase = 0f
        private var particlePhase = 0f

        // Companion encouragement messages by state
        private val encourageFocused = arrayOf(
            "In the zone 🔥", "Crushing it!", "Locked in", "Flow state ✨", "Nice focus", "Legend", "On fire"
        )
        private val encourageNeutral = arrayOf(
            "I'm here 👋", "We got this", "Let's go", "Right here", "Together", "Side by side"
        )
        private val encourageDistracted = arrayOf(
            "Hey, back here", "Eyes up 👀", "Come back", "Stay with me", "Focus"
        )
        private val encourageDrowsy = arrayOf(
            "Wake up! ☕", "Splash water?", "Stand up!", "Stay awake", "Energy!"
        )
        private val encourageAbsent = arrayOf(
            "Where'd you go?", "Come back! 😢", "Miss you", "Still here...", "Hello?"
        )
        private val milestoneMessages = arrayOf(
            "15 min! 🌟", "30 min! ⭐", "45 min! 💫", "1 HOUR! 🏆", "1h 15m! 🔥", "1h 30m! 💪", "1h 45m! 🚀", "2 HOURS! 👑"
        )

        // Paints
        private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
        }
        private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            maskFilter = BlurMaskFilter(20f, BlurMaskFilter.Blur.OUTER)
        }
        private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 6f
            strokeCap = Paint.Cap.ROUND
        }
        private val ringBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 6f
            color = Color.parseColor("#33FFFFFF")
        }
        private val breathePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 2f
        }
        private val headerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#E8EEFF")
            textSize = 10f
            textAlign = Paint.Align.CENTER
            isFakeBoldText = true
        }
        private val timePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 24f
            textAlign = Paint.Align.CENTER
            isFakeBoldText = true
            setShadowLayer(4f, 0f, 2f, Color.parseColor("#88000000"))
        }
        private val msgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = 10f
            textAlign = Paint.Align.CENTER
            color = Color.parseColor("#CBD4E8")
            isFakeBoldText = true
        }
        private val xpPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = 9f
            textAlign = Paint.Align.CENTER
            color = Color.parseColor("#6C63FF")
            isFakeBoldText = true
        }
        private val chipPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = Color.parseColor("#162133")
        }
        private val particlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
        }

        private val animationRunnable = object : Runnable {
            override fun run() {
                breathePhase += 0.05f
                particlePhase += 0.03f
                if (stateTransitionProgress < 1f) {
                    stateTransitionProgress = (stateTransitionProgress + 0.1f).coerceAtMost(1f)
                }
                invalidate()
                handler.postDelayed(this, 33) // ~30fps
            }
        }

        init {
            setLayerType(LAYER_TYPE_SOFTWARE, null) // Needed for blur effects
            handler.post(animationRunnable)
        }

        fun updateTime(secs: Int) {
            seconds = secs
            xpEarned = (secs / 60) * 2 // 2 XP per minute
            
            // Check milestones at 15-min intervals
            val mins = secs / 60
            if (mins > 0 && mins % 15 == 0 && mins != lastMilestone) {
                lastMilestone = mins
                milestoneFlashUntil = System.currentTimeMillis() + 5000 // show for 5s
                // Pulse animation for milestone
                pulseScale = 1.15f
                animate().scaleX(1f).scaleY(1f).setDuration(300).setInterpolator(OvershootInterpolator()).start()
                vibrateMilestone()
            }
            invalidate()
        }

        fun updateFocusState(state: FocusState) {
            if (state != focusState) {
                prevFocusState = focusState
                focusState = state
                stateTransitionProgress = 0f
                
                // Haptic feedback on state change
                if (state == FocusState.ABSENT || state == FocusState.DROWSY) {
                    vibrateAlert()
                }
            }
            invalidate()
        }

        private fun getMessage(): String {
            val now = System.currentTimeMillis()
            if (now < milestoneFlashUntil) {
                val idx = (lastMilestone / 15 - 1).coerceIn(0, milestoneMessages.size - 1)
                return milestoneMessages[idx]
            }
            // Rotate messages based on elapsed seconds (change every 10s)
            val pool = when (focusState) {
                FocusState.FOCUSED    -> encourageFocused
                FocusState.NEUTRAL    -> encourageNeutral
                FocusState.DISTRACTED -> encourageDistracted
                FocusState.DROWSY     -> encourageDrowsy
                FocusState.ABSENT     -> encourageAbsent
            }
            return pool[(seconds / 10) % pool.size]
        }

        private fun getStatusLabel(): String {
            if (!faceTracking) return "Timer mode"
            return when (focusState) {
                FocusState.FOCUSED -> "Focused"
                FocusState.NEUTRAL -> "Watching"
                FocusState.DISTRACTED -> "Refocus"
                FocusState.DROWSY -> "Wake up"
                FocusState.ABSENT -> "Come back"
            }
        }

        private fun getAppBadge(): String {
            return appLabel
                .split(" ")
                .filter { it.isNotBlank() }
                .take(2)
                .joinToString("") { it.first().uppercaseChar().toString() }
                .ifBlank { "G" }
        }
        
        private fun getStateColor(state: FocusState): Int {
            return when (state) {
                FocusState.FOCUSED    -> Color.parseColor("#4CAF50")
                FocusState.DISTRACTED -> Color.parseColor("#FF9800")
                FocusState.DROWSY     -> Color.parseColor("#FF9800")
                FocusState.ABSENT     -> Color.parseColor("#F44336")
                FocusState.NEUTRAL    -> Color.parseColor("#6C63FF")
            }
        }
        
        private fun interpolateColor(from: Int, to: Int, t: Float): Int {
            val r = (Color.red(from) + (Color.red(to) - Color.red(from)) * t).toInt()
            val g = (Color.green(from) + (Color.green(to) - Color.green(from)) * t).toInt()
            val b = (Color.blue(from) + (Color.blue(to) - Color.blue(from)) * t).toInt()
            return Color.rgb(r, g, b)
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val cx = width / 2f
            val cy = height / 2f
            val r = (width / 2f) - 10f
            val now = System.currentTimeMillis()
            val isMilestone = now < milestoneFlashUntil

            // Smooth color transition
            val prevColor = getStateColor(prevFocusState)
            val currColor = getStateColor(focusState)
            val ringColor = if (isMilestone) {
                Color.parseColor("#FFD700") // gold for milestones
            } else {
                interpolateColor(prevColor, currColor, stateTransitionProgress)
            }

            // Outer glow effect
            val breatheIntensity = ((sin(breathePhase.toDouble()) + 1.0) / 2.0 * 0.5 + 0.3).toFloat()
            glowPaint.color = Color.argb((80 * breatheIntensity).toInt(), Color.red(ringColor), Color.green(ringColor), Color.blue(ringColor))
            canvas.drawCircle(cx, cy, r + 6f, glowPaint)

            // Background with gradient
            val bgGradient = RadialGradient(
                cx, cy - r * 0.3f, r * 1.5f,
                intArrayOf(
                    Color.parseColor(when {
                        isMilestone              -> "#3D3D00"
                        focusState == FocusState.ABSENT  -> "#3A1515"
                        focusState == FocusState.FOCUSED -> "#153A15"
                        else                     -> "#1A1A2E"
                    }),
                    Color.parseColor("#0A0A14")
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            bgPaint.shader = bgGradient
            canvas.drawCircle(cx, cy, r, bgPaint)
            bgPaint.shader = null

            // Breathing pulse ring
            val breatheAlpha = (breatheIntensity * 120).toInt()
            breathePaint.color = Color.argb(breatheAlpha, Color.red(ringColor), Color.green(ringColor), Color.blue(ringColor))
            val breatheRadius = r + 3f + sin(breathePhase.toDouble()).toFloat() * 2f
            canvas.drawCircle(cx, cy, breatheRadius, breathePaint)

            // Progress ring background track
            val oval = RectF(cx - r, cy - r, cx + r, cy + r)
            canvas.drawArc(oval, -90f, 360f, false, ringBgPaint)

            // Progress ring arc (fills per minute)
            ringPaint.color = ringColor
            val sweep = (seconds % 60) / 60f * 360f
            canvas.drawArc(oval, -90f, sweep, false, ringPaint)
            
            // Floating particles for focused state
            if (focusState == FocusState.FOCUSED || isMilestone) {
                drawParticles(canvas, cx, cy, r, ringColor, isMilestone)
            }

            // Header app badge
            canvas.drawText(getAppBadge(), cx, cy - 18f, headerPaint)

            // Time
            val mins = seconds / 60
            val secs = seconds % 60
            canvas.drawText("${mins}:${secs.toString().padStart(2, '0')}", cx, cy + 8f, timePaint)

            // Status chip
            val statusLabel = if (isMilestone) "Milestone" else getStatusLabel()
            val chipWidth = r * 1.35f
            val chipTop = cy + 16f
            val chipBottom = chipTop + 18f
            chipPaint.color = if (isMilestone) Color.parseColor("#4A3B00") else Color.parseColor("#162133")
            canvas.drawRoundRect(RectF(cx - chipWidth / 2, chipTop, cx + chipWidth / 2, chipBottom), 14f, 14f, chipPaint)
            msgPaint.color = if (isMilestone) Color.parseColor("#FFD700") else Color.parseColor("#C9D3E8")
            canvas.drawText(statusLabel, cx, chipBottom - 5f, msgPaint)

            // Encouragement / milestone line
            val msg = getMessage()
            msgPaint.color = if (isMilestone) Color.parseColor("#FFE69A") else Color.parseColor("#9FAAC4")
            canvas.drawText(msg, cx, cy + r - 10f, msgPaint)
            
            // XP indicator at very bottom
            if (xpEarned > 0 && !isMilestone) {
                canvas.drawText("+${xpEarned} XP", cx, cy + r + 5f, xpPaint)
            }
        }
        
        private fun drawParticles(canvas: Canvas, cx: Float, cy: Float, r: Float, color: Int, isMilestone: Boolean) {
            val numParticles = if (isMilestone) 8 else 4
            for (i in 0 until numParticles) {
                val angle = (particlePhase + i * (Math.PI * 2 / numParticles)).toFloat()
                val dist = r + 8f + sin((particlePhase * 2 + i).toDouble()).toFloat() * 6f
                val px = cx + cos(angle.toDouble()).toFloat() * dist
                val py = cy + sin(angle.toDouble()).toFloat() * dist
                val size = 2f + sin((particlePhase * 3 + i).toDouble()).toFloat() * 1.5f
                val alpha = (150 + sin((particlePhase * 2 + i).toDouble()) * 80).toInt().coerceIn(80, 220)
                particlePaint.color = Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color))
                canvas.drawCircle(px, py, size, particlePaint)
            }
        }
        
        private fun vibrateMilestone() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                    vm?.defaultVibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 50, 50, 100), -1))
                } else {
                    @Suppress("DEPRECATION")
                    val v = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 50, 50, 100), -1))
                    }
                }
            } catch (_: Exception) {}
        }
        
        private fun vibrateAlert() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                    vm?.defaultVibrator?.vibrate(VibrationEffect.createOneShot(100, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    val v = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v?.vibrate(VibrationEffect.createOneShot(100, VibrationEffect.DEFAULT_AMPLITUDE))
                    }
                }
            } catch (_: Exception) {}
        }
        
        override fun onDetachedFromWindow() {
            super.onDetachedFromWindow()
            handler.removeCallbacks(animationRunnable)
        }
    }

    // ════════════════════════════════════════════════════════════════
    // Drag handler with snap-to-edge and position persistence
    // ════════════════════════════════════════════════════════════════

    class DragTouchListener(
        private val context: Context,
        private val params: WindowManager.LayoutParams,
        private val wm: WindowManager
    ) : View.OnTouchListener {
        private var initialX = 0
        private var initialY = 0
        private var initialTouchX = 0f
        private var initialTouchY = 0f
        private var isTap = true
        private var isDragging = false
        
        private val prefs: SharedPreferences = context.getSharedPreferences("guru_overlay_prefs", Context.MODE_PRIVATE)
        private val screenWidth: Int
        private val screenHeight: Int
        
        companion object {
            private const val PREF_X = "overlay_x"
            private const val PREF_Y = "overlay_y"
            private const val EDGE_MARGIN = 16
            private const val SNAP_DURATION = 250L
        }
        
        init {
            val dm = context.resources.displayMetrics
            screenWidth = dm.widthPixels
            screenHeight = dm.heightPixels
            
            // Restore saved position
            val savedX = prefs.getInt(PREF_X, -1)
            val savedY = prefs.getInt(PREF_Y, -1)
            if (savedX >= 0 && savedY >= 0) {
                params.x = savedX.coerceIn(0, screenWidth - 100)
                params.y = savedY.coerceIn(0, screenHeight - 100)
            }
        }
        
        private fun savePosition() {
            prefs.edit().putInt(PREF_X, params.x).putInt(PREF_Y, params.y).apply()
        }
        
        private fun snapToEdge(view: View) {
            val bubbleWidth = view.width.takeIf { it > 0 } ?: 130
            val centerX = params.x + bubbleWidth / 2
            
            // Determine which edge is closer
            val targetX = if (centerX < screenWidth / 2) {
                // Snap to left
                EDGE_MARGIN
            } else {
                // Snap to right
                screenWidth - bubbleWidth - EDGE_MARGIN
            }
            
            // Clamp Y within screen bounds
            val targetY = params.y.coerceIn(EDGE_MARGIN, screenHeight - view.height - EDGE_MARGIN * 4)
            
            // Animate to target position
            animateToPosition(view, targetX, targetY)
        }
        
        private fun animateToPosition(view: View, targetX: Int, targetY: Int) {
            val startX = params.x
            val startY = params.y
            
            ValueAnimator.ofFloat(0f, 1f).apply {
                duration = SNAP_DURATION
                interpolator = OvershootInterpolator(0.8f)
                addUpdateListener { animator ->
                    val progress = animator.animatedValue as Float
                    params.x = (startX + (targetX - startX) * progress).toInt()
                    params.y = (startY + (targetY - startY) * progress).toInt()
                    try {
                        wm.updateViewLayout(view.parent as View, params)
                    } catch (_: Exception) {}
                }
                addListener(object : android.animation.Animator.AnimatorListener {
                    override fun onAnimationEnd(animation: android.animation.Animator) {
                        savePosition()
                    }
                    override fun onAnimationStart(animation: android.animation.Animator) {}
                    override fun onAnimationCancel(animation: android.animation.Animator) {}
                    override fun onAnimationRepeat(animation: android.animation.Animator) {}
                })
                start()
            }
        }
        
        private fun vibrateLight() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                    vm?.defaultVibrator?.vibrate(VibrationEffect.createOneShot(10, VibrationEffect.EFFECT_TICK))
                } else {
                    @Suppress("DEPRECATION")
                    val v = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v?.vibrate(VibrationEffect.createOneShot(10, VibrationEffect.EFFECT_TICK))
                    }
                }
            } catch (_: Exception) {}
        }

        override fun onTouch(v: View, event: MotionEvent): Boolean {
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x; initialY = params.y
                    initialTouchX = event.rawX; initialTouchY = event.rawY
                    isTap = true
                    isDragging = false
                    
                    // Scale down slightly to indicate press
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
                            // Restore scale when starting drag
                            v.animate().scaleX(1f).scaleY(1f).setDuration(50).start()
                        }
                        isTap = false
                        params.x = initialX + dx.toInt()
                        params.y = initialY + dy.toInt()
                        try { wm.updateViewLayout(v.parent as View, params) } catch (_: Exception) {}
                    }
                    return true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    // Restore scale
                    v.animate().scaleX(1f).scaleY(1f).setDuration(100).start()
                    
                    if (isTap) {
                        (v as? CompanionBubbleView)?.onTap?.invoke()
                        v.performClick()
                    } else {
                        // Snap to nearest edge
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
