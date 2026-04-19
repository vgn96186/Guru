package expo.modules.omnicanvas

import android.content.Context
import android.view.HapticFeedbackConstants
import androidx.compose.animation.*
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import android.graphics.RenderEffect
import android.graphics.Shader
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.os.Build
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.lerp
import kotlin.math.sin
import kotlin.random.Random

class OmniOrbView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val stateValue = mutableStateOf<OrbState?>(null)
    private val onPress by EventDispatcher<Unit>()

    init {
        addView(ComposeView(context).apply {
            setContent {
                OmniOrbComponent(
                    state = stateValue.value,
                    onPress = {
                        performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                        onPress(Unit)
                    }
                )
            }
        })
    }

    fun setState(state: OrbState) {
        stateValue.value = state
    }
}

@Composable
fun OmniOrbComponent(state: OrbState?, onPress: () -> Unit) {
    if (state == null) return

    val density = LocalDensity.current
    val config = androidx.compose.ui.platform.LocalConfiguration.current
    val screenWidth = config.screenWidthDp
    val screenHeight = config.screenHeightDp
    val infiniteTransition = rememberInfiniteTransition()

    // 1. Lifecycle States
    val isBooting = state.phase == "booting"
    val isSettling = state.phase == "settling"
    val isButton = state.phase == "button"

    // 2. Animated Transitions
    val settleProgress by animateFloatAsState(
        targetValue = if (isSettling || isButton) 1f else 0f,
        animationSpec = tween(1200, easing = FastOutSlowInEasing)
    )

    // 3. Jitter (Energy)
    val jitterX by infiniteTransition.animateFloat(
        initialValue = -5f,
        targetValue = 5f,
        animationSpec = infiniteRepeatable(
            animation = tween(100, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        )
    )
    val jitterY by infiniteTransition.animateFloat(
        initialValue = -3f,
        targetValue = 6f,
        animationSpec = infiniteRepeatable(
            animation = tween(130, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        )
    )
    val jitterFactor = if (isBooting) 1f else 0f

    // 4. Breathing
    val breatheScale by infiniteTransition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(if (isBooting) 1200 else 2500, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        )
    )

    // 5. Liquid Noise (for the "Bridge" effect)
    val noiseX by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 100f,
        animationSpec = infiniteRepeatable(
            animation = tween(20000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        )
    )
    val noiseY by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 100f,
        animationSpec = infiniteRepeatable(
            animation = tween(25000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        )
    )
    
    val isLiquid = state.orbEffect == "liquid"

    // 6. Layout Calculation
    // We assume the component is fillMaxSize (absolute fill in RN)
    // So (0,0) is top-left.
    
    Box(
        modifier = Modifier.fillMaxSize()
    ) {
        // Particles (Relative to current orb pos)
        val currentX = lerp(screenWidth.toFloat() / 2f, state.targetX, settleProgress)
        val currentY = lerp(screenHeight.toFloat() / 2f, state.targetY, settleProgress)

        // The Orb
        Surface(
            modifier = Modifier
                .offset(
                    x = currentX.dp - (lerp(180f, state.targetSize, settleProgress) / 2).dp + (jitterX * jitterFactor).dp,
                    y = currentY.dp - (lerp(180f, state.targetSize, settleProgress) / 2).dp + (jitterY * jitterFactor).dp
                )
                .size(lerp(180f, state.targetSize, settleProgress).dp)
                .graphicsLayer {
                    scaleX = breatheScale
                    scaleY = breatheScale
                }
                .shadow(
                    elevation = if (isButton) 12.dp else 24.dp,
                    shape = CircleShape,
                    spotColor = Color(0xFF6366F1),
                    ambientColor = Color(0xFF6366F1)
                )
                .clip(CircleShape)
                .clickable(
                    enabled = isButton,
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() }
                ) { onPress() }
                .graphicsLayer {
                    if (isLiquid && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        // Ease blur to 0 as we settle for a perfect sphere
                        val blur = 32f * (1f - settleProgress)
                        if (blur > 0.1f) {
                            val matrix = ColorMatrix(floatArrayOf(
                                1f, 0f, 0f, 0f, 0f,
                                0f, 1f, 0f, 0f, 0f,
                                0f, 0f, 1f, 0f, 0f,
                                0f, 0f, 0f, 25f, -1200f
                            ))
                            renderEffect = RenderEffect.createColorFilterEffect(
                                ColorMatrixColorFilter(matrix),
                                RenderEffect.createBlurEffect(blur, blur, Shader.TileMode.CLAMP)
                            ).asComposeRenderEffect()
                        }
                    }
                },
            color = Color(0xFF6366F1),
            shape = CircleShape
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .then(
                        if (isLiquid) {
                            Modifier.graphicsLayer {
                                // Add inner noise to the liquid mass
                                translationX = (sin(noiseX + noiseY) * 15f * (1f - settleProgress)).dp.toPx()
                                translationY = (sin(noiseX * 0.7f) * 10f * (1f - settleProgress)).dp.toPx()
                                scaleX = 1f + (sin(noiseY * 0.5f) * 0.1f * (1f - settleProgress))
                                scaleY = 1f + (sin(noiseX * 0.3f) * 0.1f * (1f - settleProgress))
                            }
                        } else Modifier
                    )
                    .background(
                        Brush.radialGradient(
                            colors = listOf(Color(0xFF9BA3EE), Color(0xFF4450C0), Color(0xFF2E3BAC))
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                // Label fader
                if (isButton || isSettling) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(16.dp).graphicsLayer { alpha = settleProgress }
                    ) {
                        state.label?.let {
                            Text(
                                it,
                                color = Color.White,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Black,
                                textAlign = TextAlign.Center
                            )
                        }
                        state.sublabel?.let {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                it,
                                color = Color.White.copy(alpha = 0.7f),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }
            }
        }
    }
}

fun lerp(start: Float, end: Float, fraction: Float): Float {
    return start + (end - start) * fraction
}
