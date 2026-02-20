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
import kotlin.math.abs

/**
 * Floating overlay bubble that shows a pulsing timer while the user
 * watches a lecture in another app. Tapping it returns to Guru.
 *
 * Requires SYSTEM_ALERT_WINDOW permission (Settings.canDrawOverlays).
 */
class OverlayService : Service() {

    private var windowManager: WindowManager? = null
    private var overlayView: TimerBubbleView? = null
    private val handler = Handler(Looper.getMainLooper())
    private var elapsedSeconds = 0
    private var appName = "Lecture"

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
        const val CHANNEL_ID = "guru_overlay_channel"
        const val NOTIF_ID = 9002
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SHOW -> {
                appName = intent.getStringExtra(EXTRA_APP_NAME) ?: "Lecture"
                startForeground(NOTIF_ID, buildNotification())
                showOverlay()
                startTimer()
            }
            ACTION_HIDE -> {
                hideOverlay()
                stopTimer()
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
                CHANNEL_ID, "Study Timer Overlay",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Shows floating timer while watching lectures" }
            manager.createNotificationChannel(ch)
        }

        // Tapping notification opens Guru
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = if (launchIntent != null) {
            PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else null

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle("Studying: $appName")
            .setContentText("Tap to return to Guru")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .apply { if (pendingIntent != null) setContentIntent(pendingIntent) }
            .build()
    }

    private fun showOverlay() {
        if (overlayView != null) return

        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        overlayView = TimerBubbleView(this, appName) {
            // On tap → return to Guru
            val intent = packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                startActivity(intent)
            }
        }

        val size = dpToPx(56)
        val params = WindowManager.LayoutParams(
            size, size,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dpToPx(8)
            y = dpToPx(120)
        }

        // Make draggable
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
            TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(),
            resources.displayMetrics
        ).toInt()

    override fun onDestroy() {
        hideOverlay()
        stopTimer()
        super.onDestroy()
    }

    // ════════════════════════════════════════════════════════════════
    // Custom drawn timer bubble
    // ════════════════════════════════════════════════════════════════

    class TimerBubbleView(
        context: Context,
        private val appLabel: String,
        val onTap: () -> Unit
    ) : View(context) {

        private var seconds = 0
        private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#CC6C63FF") // Semi-transparent purple
            style = Paint.Style.FILL
        }
        private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#FF6C63FF")
            style = Paint.Style.STROKE
            strokeWidth = 4f
        }
        private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 28f
            textAlign = Paint.Align.CENTER
            isFakeBoldText = true
        }
        private val subPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#CCCCCC")
            textSize = 16f
            textAlign = Paint.Align.CENTER
        }

        fun updateTime(secs: Int) {
            seconds = secs
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val cx = width / 2f
            val cy = height / 2f
            val r = (width / 2f) - 4f

            // Background circle
            canvas.drawCircle(cx, cy, r, bgPaint)

            // Animated ring (pulses every 60 seconds)
            val sweep = (seconds % 60) / 60f * 360f
            val oval = RectF(cx - r, cy - r, cx + r, cy + r)
            canvas.drawArc(oval, -90f, sweep, false, ringPaint)

            // Time text
            val mins = seconds / 60
            val secs = seconds % 60
            val timeStr = "${mins}:${secs.toString().padStart(2, '0')}"
            canvas.drawText(timeStr, cx, cy + 4f, textPaint)

            // Small dot at bottom to indicate "tap to return"
            val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.parseColor("#4CAF50")
            }
            canvas.drawCircle(cx, cy + r - 8f, 3f, dotPaint)
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
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isTap = true
                    return true
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
                    if (isTap) {
                        (v as? TimerBubbleView)?.onTap?.invoke()
                        v.performClick()
                    }
                    return true
                }
            }
            return false
        }
    }
}
