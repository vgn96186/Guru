package expo.modules.omnicanvas

import android.content.Context
import android.view.HapticFeedbackConstants
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.sin

class QuickStatsBarView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val dataState = mutableStateOf<QuickStatsData?>(null)
    private val onGoalPress by EventDispatcher<Unit>()

    init {
        addView(ComposeView(context).apply {
            setContent {
                QuickStatsContent(
                    data = dataState.value,
                    onGoalPress = {
                        performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
                        onGoalPress(Unit)
                    }
                )
            }
        })
    }

    fun setData(data: QuickStatsData) {
        dataState.value = data
    }
}

@Composable
fun QuickStatsContent(data: QuickStatsData?, onGoalPress: () -> Unit) {
    if (data == null) return

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .shadow(4.dp, RoundedCornerShape(20.dp)),
        shape = RoundedCornerShape(20.dp),
        color = Color.White
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceAround
        ) {
            // 1. Progress Ring
            ProgressRing(percent = data.progressPercent, current = data.todayMinutes, goal = data.dailyGoal, onGoalPress = onGoalPress)

            Divider()

            // 2. Streak Flame
            StreakFlame(streak = data.streak)

            Divider()

            // 3. Level & Sessions
            LevelInfo(level = data.level, sessions = data.completedSessions)
        }
    }
}

@Composable
fun ProgressRing(percent: Float, current: Int, goal: Int, onGoalPress: () -> Unit) {
    val animatedPercent by animateFloatAsState(targetValue = percent / 100f, animationSpec = tween(1500, easing = FastOutSlowInEasing))

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(50.dp)) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                drawCircle(Color(0xFFF1F5F9), radius = size.minDimension / 2, style = Stroke(5.dp.toPx()))
                drawArc(
                    color = Color(0xFF6366F1),
                    startAngle = -90f,
                    sweepAngle = 360f * animatedPercent,
                    useCenter = false,
                    style = Stroke(5.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round)
                )
            }
            Text("${percent.toInt()}%", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFF1E293B))
        }
        Spacer(Modifier.height(4.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clip(CircleShape)
                .background(Color(0xFFEEF2FF))
                .clickable { onGoalPress() }
                .padding(horizontal = 8.dp, vertical = 2.dp)
        ) {
            Text("$current/$goal", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF6366F1))
            Icon(Icons.Default.KeyboardArrowDown, contentDescription = null, modifier = Modifier.size(12.dp), tint = Color(0xFF6366F1))
        }
    }
}

@Composable
fun StreakFlame(streak: Int) {
    val infiniteTransition = rememberInfiniteTransition()
    val flameScale by infiniteTransition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(tween(600, easing = LinearEasing), RepeatMode.Reverse)
    )
    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.6f,
        animationSpec = infiniteRepeatable(tween(800), RepeatMode.Reverse)
    )

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(40.dp)) {
            // Glow
            Box(
                Modifier
                    .size(24.dp)
                    .graphicsLayer { alpha = glowAlpha; scaleX = 1.5f; scaleY = 1.5f }
                    .background(Color(0xFFFB923C).copy(alpha = 0.3f), CircleShape)
            )
            // Flame Icon (Simple Canvas representation or use Painter)
            Canvas(Modifier.size(30.dp).graphicsLayer { scaleX = flameScale; scaleY = flameScale }) {
                val path = androidx.compose.ui.graphics.Path().apply {
                    moveTo(size.width / 2, 0f)
                    quadraticTo(size.width * 0.8f, size.height * 0.4f, size.width * 0.5f, size.height)
                    quadraticTo(size.width * 0.2f, size.height * 0.4f, size.width * 0.5f, 0f)
                }
                drawPath(path, Color(0xFFFB923C))
            }
        }
        Row(verticalAlignment = Alignment.Bottom) {
            Text("$streak", fontSize = 16.sp, fontWeight = FontWeight.Black, color = Color(0xFF1E293B))
            Text("days", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFFFB923C), modifier = Modifier.padding(start = 2.dp, bottom = 2.dp))
        }
        Text("streak", fontSize = 10.sp, color = Color.Gray)
    }
}

@Composable
fun LevelInfo(level: Int, sessions: Int) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Level $level", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1E293B))
        Text("$sessions done", fontSize = 11.sp, color = Color.Gray)
    }
}

@Composable
fun Divider() {
    Box(Modifier.width(1.dp).height(30.dp).background(Color(0xFFF1F5F9)))
}
