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

        private val bubbleView = CompanionBubbleView(context, appLabel, faceTracking) {
             toggleMenu()
        }

        private var isMenuExpanded = false
        private var isRecordingPaused = false

        // Premium background pill
        private val menuLayout = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            visibility = View.GONE
            setPadding(dpToPx(16, context), dpToPx(8, context), dpToPx(16, context), dpToPx(8, context))
            gravity = Gravity.CENTER_VERTICAL

            // Background is part of the pill, handled by drawing or background drawable
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#E6121212")) // Dark, 90% opacity
                cornerRadius = dpToPx(999, context).toFloat()
                setStroke(dpToPx(1, context), Color.parseColor("#1AFFFFFF"))
            }

            // Pause button
            addView(android.widget.ImageView(context).apply {
                setImageResource(android.R.drawable.ic_media_pause)
                setColorFilter(Color.WHITE)
                setPadding(dpToPx(12, context), dpToPx(8, context), dpToPx(12, context), dpToPx(8, context))
                setOnClickListener {
                    isRecordingPaused = !isRecordingPaused
                    val intent = Intent(context, OverlayService::class.java).apply {
                        action = if (isRecordingPaused) ACTION_PAUSE else ACTION_RESUME
                    }
                    context.startService(intent)
                    setImageResource(if (isRecordingPaused) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause)
                    vibrateLight(context)
                }
            })

            // Divider
            addView(View(context).apply {
                layoutParams = android.widget.LinearLayout.LayoutParams(dpToPx(1, context), dpToPx(24, context)).apply {
                    setMargins(dpToPx(8, context), 0, dpToPx(8, context), 0)
                }
                setBackgroundColor(Color.parseColor("#33FFFFFF"))
            })

            // Finish button
            addView(android.widget.ImageView(context).apply {
                setImageResource(android.R.drawable.ic_menu_save)
                setColorFilter(Color.parseColor("#4CAF50"))
                setPadding(dpToPx(12, context), dpToPx(8, context), dpToPx(12, context), dpToPx(8, context))
                setOnClickListener {
                    vibrateLight(context)
                    onReturnClick()
                }
            })
        }

        init {
            // Initial layout for the expanded menu (hidden initially)
            val lpMenu = LayoutParams(LayoutParams.WRAP_CONTENT, dpToPx(52, context)).apply {
                gravity = Gravity.CENTER_VERTICAL or Gravity.START
                setMargins(dpToPx(80, context), 0, 0, 0)
            }
            addView(menuLayout, lpMenu)

            // Minimal Pill view (Guru Icon + Timer)
            val lpBubble = LayoutParams(dpToPx(110, context), dpToPx(52, context)).apply {
                gravity = Gravity.CENTER_VERTICAL or Gravity.START
            }
            addView(bubbleView, lpBubble)

            clipChildren = false
            clipToPadding = false
        }

        fun updateTime(seconds: Int) {
            bubbleView.updateTime(seconds)
        }

        fun updateFocusState(state: FocusState) {
            bubbleView.updateFocusState(state)
        }

        private fun toggleMenu() {
            isMenuExpanded = !isMenuExpanded
            vibrateLight(context)
            if (isMenuExpanded) {
                menuLayout.visibility = View.VISIBLE
                menuLayout.alpha = 0f
                menuLayout.translationX = -dpToPx(20, context).toFloat()
                menuLayout.animate()
                    .alpha(1f)
                    .translationX(0f)
                    .setDuration(250)
                    .setInterpolator(OvershootInterpolator(1.2f))
                    .start()
            } else {
                menuLayout.animate()
                    .alpha(0f)
                    .translationX(-dpToPx(20, context).toFloat())
                    .setDuration(200)
                    .setInterpolator(AccelerateDecelerateInterpolator())
                    .withEndAction { menuLayout.visibility = View.GONE }
                    .start()
            }
        }

        fun destroy() {
            bubbleView.destroy()
        }

        private fun dpToPx(dp: Int, ctx: Context): Int {
            return TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(), ctx.resources.displayMetrics
            ).toInt()
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

    class CompanionBubbleView(
        context: Context,
        private val appLabel: String,
        private val faceTracking: Boolean,
        val onTap: () -> Unit
    ) : View(context) {

        private val density = context.resources.displayMetrics.density
        private val scaledDensity = context.resources.displayMetrics.scaledDensity
        private fun dpToPx(dp: Float) = dp * density
        private fun spToPx(sp: Float) = sp * scaledDensity

        private var seconds = 0
        private var focusState = FocusState.NEUTRAL
        private val handler = Handler(Looper.getMainLooper())
        private var pulsePhase = 0f

        private val animationRunnable = object : Runnable {
            override fun run() {
                pulsePhase += 0.05f
                invalidate()
                handler.postDelayed(this, 30)
            }
        }

        private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#E6121212") // Dark pill surface
        }

        private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#1AFFFFFF")
            style = Paint.Style.STROKE
            strokeWidth = dpToPx(1f)
        }

        private val timePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = spToPx(13f)
            typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
            textAlign = Paint.Align.LEFT
        }

        private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#F44336") // Recording dot red
            style = Paint.Style.FILL
        }

        private val guruIconPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#6C63FF") // Guru primary color
            style = Paint.Style.FILL
        }

        private val guruInnerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.FILL
        }

        init {
            // Apply floating shadow to view elevation on API 21+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                elevation = dpToPx(10f)
            }
            handler.post(animationRunnable)
        }

        fun updateTime(s: Int) {
            seconds = s
            invalidate()
        }

        fun updateFocusState(state: FocusState) {
            focusState = state
            invalidate()
        }

        fun destroy() {
            handler.removeCallbacks(animationRunnable)
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val w = width.toFloat()
            val h = height.toFloat()
            val r = h / 2f

            // Pill Background
            canvas.drawRoundRect(0f, 0f, w, h, r, r, bgPaint)
            canvas.drawRoundRect(0f, 0f, w, h, r, r, borderPaint)

            // Guru Icon representing presence
            val iconX = h / 2f
            val iconY = h / 2f
            val iconR = h * 0.35f
            canvas.drawCircle(iconX, iconY, iconR, guruIconPaint)
            canvas.drawCircle(iconX, iconY, iconR * 0.4f, guruInnerPaint)

            // Pulsing Recording Dot
            val dotX = h + dpToPx(6f)
            val dotY = h / 2f
            val pulseAlpha = (120 + kotlin.math.sin(pulsePhase) * 135).toInt().coerceIn(0, 255)
            dotPaint.alpha = pulseAlpha
            
            // Pulse size slightly too
            val dotScale = 1f + kotlin.math.sin(pulsePhase) * 0.15f
            val dotR = dpToPx(4f) * dotScale
            canvas.drawCircle(dotX, dotY, dotR, dotPaint)

            // Timer Text
            val textX = dotX + dpToPx(12f)
            val textY = h / 2f + dpToPx(4.5f) // approximate vertical centering
            val mins = seconds / 60
            val secs = seconds % 60
            val timeStr = String.format("%02d:%02d", mins, secs)
            canvas.drawText(timeStr, textX, textY, timePaint)
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
