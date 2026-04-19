package expo.modules.applauncher

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.sin

@Composable
fun LectureOverlayComponent(
    focusState: FocusState,
    elapsedSeconds: Int,
    appName: String,
    isPaused: Boolean,
    isExpanded: Boolean,
    onToggleExpand: () -> Unit,
    onPauseResume: () -> Unit,
    onFinish: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition()
    
    // Breathe effect for the glow
    val breathePhase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 2f * Math.PI.toFloat(),
        animationSpec = infiniteRepeatable(tween(3000, easing = LinearEasing))
    )
    val breathe = (sin(breathePhase) + 1f) / 2f
    
    // Status color logic
    val statusColor = when (focusState) {
        FocusState.FOCUSED    -> Color(0xFF3FB950)
        FocusState.DISTRACTED -> Color(0xFFD97706)
        FocusState.DROWSY     -> Color(0xFFD97706)
        FocusState.ABSENT     -> Color(0xFFF14C4C)
        FocusState.NEUTRAL    -> Color(0xFF5E6AD2)
    }

    val animatedStatusColor by animateColorAsState(targetValue = statusColor, animationSpec = tween(600))

    Box(
        modifier = Modifier
            .wrapContentSize()
            .padding(24.dp), // Space for glow
        contentAlignment = Alignment.Center
    ) {
        // 1. Expansion Background Glow
        Box(
            modifier = Modifier
                .matchParentSize()
                .graphicsLayer {
                    alpha = (0.2f + 0.3f * breathe)
                    scaleX = 1.1f
                    scaleY = 1.1f
                }
                .background(animatedStatusColor.copy(alpha = 0.4f), RoundedCornerShape(32.dp))
        )

        // 2. Main Capsule
        Surface(
            modifier = Modifier
                .width(if (isExpanded) 120.dp else 88.dp)
                .animateContentSize()
                .clip(RoundedCornerShape(32.dp))
                .clickable { onToggleExpand() },
            color = Color(0xFF050505),
            shape = RoundedCornerShape(32.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(vertical = 24.dp)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Recording Dot
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .graphicsLayer { alpha = if (isPaused) 1f else (0.4f + 0.6f * breathe) }
                        .background(if (isPaused) Color(0xFF8A8A8E) else Color(0xFFF14C4C), CircleShape)
                )

                Spacer(Modifier.height(14.dp))

                // Timer
                val mins = elapsedSeconds / 60
                val secs = elapsedSeconds % 60
                Text(
                    text = "%02d:%02d".format(mins, secs),
                    color = Color.White,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = 0.5.sp
                )

                Spacer(Modifier.height(6.dp))

                // App Label
                Text(
                    text = appName.take(7).uppercase(),
                    color = Color(0xFF8A8A8E),
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                )

                // Expanded Actions
                AnimatedVisibility(
                    visible = isExpanded,
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically()
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Spacer(Modifier.height(16.dp))
                        
                        Text(
                            text = if (isPaused) "PAUSED" else "RECORDING",
                            color = if (isPaused) Color(0xFF8A8A8E) else Color(0xFF3FB950),
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold
                        )

                        Spacer(Modifier.height(16.dp))

                        // Pause/Resume Button
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF232327))
                                .clickable { onPauseResume() },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                if (isPaused) "▶" else "II",
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Black
                            )
                        }

                        Spacer(Modifier.height(12.dp))

                        // Finish Button
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(Color(0xFFF14C4C))
                                .clickable { onFinish() },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "■",
                                color = Color.White,
                                fontSize = 16.sp
                            )
                        }
                    }
                }
            }
        }
    }
}
