package expo.modules.omnicanvas

import android.content.Context
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

class ProgressDashboardView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val dataState = mutableStateOf<ProgressData?>(null)

    init {
        addView(ComposeView(context).apply {
            setContent {
                DashboardContent(data = dataState.value)
            }
        })
    }

    fun setData(data: ProgressData) {
        dataState.value = data
    }
}

@Composable
fun DashboardContent(data: ProgressData?) {
    if (data == null) return

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC)),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // 1. Readiness Rings
        item {
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = Color.White,
                tonalElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(24.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    ReadinessRings(
                        coverage = data.coveragePercent,
                        mastery = data.masteredCount.toFloat() / 100f // Scaling for demo
                    )
                    Spacer(Modifier.width(24.dp))
                    Column {
                        Text("Exam Readiness", fontSize = 14.sp, color = Color.Gray)
                        Text("${data.projectedScore}/300", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Color(0xFF6366F1))
                        Text("Projected Score", fontSize = 12.sp, color = Color.Gray)
                    }
                }
            }
        }

        // 2. Weekly Sparkline
        item {
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = Color.White,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(Modifier.padding(20.dp)) {
                    Text("Weekly Activity", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.Gray)
                    Spacer(Modifier.height(16.dp))
                    WeeklyBarChart(minutes = data.weeklyMinutes)
                }
            }
        }

        // 3. Telemetry Stats Grid
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard(Modifier.weight(1f), "Nodes", data.nodesCreated.toString(), Color(0xFF818CF8))
                StatCard(Modifier.weight(1f), "Cards", data.cardsCreated.toString(), Color(0xFFF472B6))
                StatCard(Modifier.weight(1f), "Streak", "${data.currentStreak}d", Color(0xFFFB923C))
            }
        }

        // 4. Subject Breakdown
        items(data.subjectBreakdown) { subject ->
            SubjectRow(subject)
        }
    }
}

@Composable
fun ReadinessRings(coverage: Float, mastery: Float) {
    val coverageAnimate = animateFloatAsState(coverage / 100f, tween(1500, easing = DecelerateInterpolator().toEasing()))
    val masteryAnimate = animateFloatAsState(mastery.coerceIn(0f, 1f), tween(1500, delayMillis = 300))

    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(100.dp)) {
        Canvas(Modifier.fillMaxSize()) {
            // Background rings
            drawCircle(Color(0xFFE2E8F0), radius = 45.dp.toPx(), style = Stroke(8.dp.toPx()))
            drawCircle(Color(0xFFE2E8F0), radius = 32.dp.toPx(), style = Stroke(8.dp.toPx()))

            // Foreground arcs
            drawArc(
                color = Color(0xFF6366F1),
                startAngle = -90f,
                sweepAngle = 360f * coverageAnimate.value,
                useCenter = false,
                topLeft = Offset(center.x - 45.dp.toPx(), center.y - 45.dp.toPx()),
                size = Size(90.dp.toPx(), 90.dp.toPx()),
                style = Stroke(8.dp.toPx())
            )
            drawArc(
                color = Color(0xFFFB923C),
                startAngle = -90f,
                sweepAngle = 360f * masteryAnimate.value,
                useCenter = false,
                topLeft = Offset(center.x - 32.dp.toPx(), center.y - 32.dp.toPx()),
                size = Size(64.dp.toPx(), 64.dp.toPx()),
                style = Stroke(8.dp.toPx())
            )
        }
    }
}

@Composable
fun WeeklyBarChart(minutes: List<Int>) {
    val maxMins = minutes.maxOrNull()?.coerceAtLeast(1) ?: 1
    val animations = minutes.map { animateFloatAsState(it.toFloat() / maxMins, tween(1000)) }

    Row(
        modifier = Modifier.fillMaxWidth().height(100.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom
    ) {
        animations.forEachIndexed { i, anim ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .width(24.dp)
                        .fillMaxHeight(anim.value.coerceAtLeast(0.05f))
                        .background(
                            Brush.verticalGradient(listOf(Color(0xFF6366F1), Color(0xFF818CF8))),
                            RoundedCornerShape(6.dp)
                        )
                )
                Spacer(Modifier.height(4.dp))
                Text(listOf("S", "M", "T", "W", "T", "F", "S")[i % 7], fontSize = 10.sp, color = Color.LightGray)
            }
        }
    }
}

@Composable
fun StatCard(modifier: Modifier, label: String, value: String, color: Color) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(20.dp),
        color = Color.White
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.Gray)
            Text(value, fontSize = 20.sp, fontWeight = FontWeight.Black, color = color)
        }
    }
}

@Composable
fun SubjectRow(subject: SubjectProgressData) {
    val barAnimate = animateFloatAsState(subject.percent / 100f, tween(1200))
    val subColor = Color(android.graphics.Color.parseColor(subject.color))

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = Color.White,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(subject.name, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text("${subject.percent.toInt()}%", fontSize = 14.sp, color = subColor, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth().height(6.dp).background(Color(0xFFF1F5F9), RoundedCornerShape(3.dp))) {
                Box(Modifier.fillMaxWidth(barAnimate.value).fillMaxHeight().background(subColor, RoundedCornerShape(3.dp)))
            }
        }
    }
}

fun DecelerateInterpolator(): android.view.animation.DecelerateInterpolator = android.view.animation.DecelerateInterpolator()
fun android.view.animation.Interpolator.toEasing(): androidx.compose.animation.core.Easing = androidx.compose.animation.core.Easing { input -> getInterpolation(input) }
