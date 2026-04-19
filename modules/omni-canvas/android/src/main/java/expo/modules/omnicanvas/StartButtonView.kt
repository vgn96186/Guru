package expo.modules.omnicanvas

import android.content.Context
import android.view.HapticFeedbackConstants
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class StartButtonView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val labelState = mutableStateOf("START SESSION")
    private val sublabelState = mutableStateOf<String?>(null)
    private val colorState = mutableStateOf("#6366F1")
    private val disabledState = mutableStateOf(false)
    private val onPress by EventDispatcher<Unit>()

    init {
        addView(ComposeView(context).apply {
            setContent {
                StartButtonComponent(
                    label = labelState.value,
                    sublabel = sublabelState.value,
                    colorStr = colorState.value,
                    disabled = disabledState.value,
                    onPress = {
                        performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                        onPress(Unit)
                    }
                )
            }
        })
    }

    fun setLabel(label: String) { labelState.value = label }
    fun setSublabel(sublabel: String) { sublabelState.value = sublabel }
    fun setColor(color: String) { colorState.value = color }
    fun setDisabled(disabled: Boolean) { disabledState.value = disabled }
}

@Composable
fun StartButtonComponent(
    label: String,
    sublabel: String?,
    colorStr: String,
    disabled: Boolean,
    onPress: () -> Unit
) {
    val baseColor = try {
        Color(android.graphics.Color.parseColor(colorStr))
    } catch (e: Exception) {
        Color(0xFF6366F1)
    }

    val infiniteTransition = rememberInfiniteTransition()
    
    // Breathing scale animation
    val scale by infiniteTransition.animateFloat(
        initialValue = 0.98f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(2500, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        )
    )

    // Breathing glow animation
    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 0.8f,
        animationSpec = infiniteRepeatable(
            animation = tween(2500, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        )
    )

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        // Outer Glow
        Box(
            modifier = Modifier
                .size(140.dp)
                .graphicsLayer {
                    scaleX = scale * 1.2f
                    scaleY = scale * 1.2f
                    alpha = glowAlpha
                }
                .shadow(elevation = 20.dp, shape = CircleShape, ambientColor = baseColor, spotColor = baseColor)
                .background(baseColor.copy(alpha = 0.2f), CircleShape)
        )

        // Main Button
        Surface(
            modifier = Modifier
                .size(150.dp)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                }
                .clip(CircleShape)
                .clickable(
                    enabled = !disabled,
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() }
                ) { onPress() },
            shape = CircleShape,
            color = if (disabled) Color.Gray else baseColor,
            tonalElevation = 8.dp,
            shadowElevation = 12.dp
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(Color.White.copy(alpha = 0.2f), Color.Transparent),
                            center = Offset(50f, 50f)
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(16.dp)
                ) {
                    Text(
                        text = label,
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Center,
                        letterSpacing = 1.sp,
                        lineHeight = 20.sp
                    )
                    if (sublabel != null) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = sublabel,
                            color = Color.White.copy(alpha = 0.7f),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            textAlign = TextAlign.Center,
                            lineHeight = 14.sp
                        )
                    }
                }
            }
        }
    }
}
