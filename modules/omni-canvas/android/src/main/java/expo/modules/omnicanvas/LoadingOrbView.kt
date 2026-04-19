package expo.modules.omnicanvas

import android.content.Context
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.unit.dp
import android.graphics.RenderEffect
import android.graphics.Shader
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.os.Build
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.graphicsLayer
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

class LoadingOrbView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val sizeState = mutableFloatStateOf(180f)
    private val effectState = mutableStateOf("ripple")

    init {
        addView(ComposeView(context).apply {
            setContent {
                LoadingOrbComponent(
                    size = sizeState.floatValue,
                    effect = effectState.value
                )
            }
        })
    }

    fun setSize(size: Float) {
        sizeState.floatValue = size
    }

    fun setEffect(effect: String) {
        effectState.value = effect
    }
}

@Composable
fun LoadingOrbComponent(size: Float, effect: String) {
    val infiniteTransition = rememberInfiniteTransition()
    val isLiquid = effect == "liquid"
    
    // Core breathing
    val scale by infiniteTransition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        )
    )

    // Rotation for multiple rings
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(4000, easing = LinearEasing)
        )
    )

    Box(
        modifier = Modifier.size(size.dp),
        contentAlignment = Alignment.Center
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    if (isLiquid && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        val blur = 20f
                        val matrix = ColorMatrix(floatArrayOf(
                            1f, 0f, 0f, 0f, 0f,
                            0f, 1f, 0f, 0f, 0f,
                            0f, 0f, 1f, 0f, 0f,
                            0f, 0f, 0f, 20f, -1000f
                        ))
                        renderEffect = RenderEffect.createColorFilterEffect(
                            ColorMatrixColorFilter(matrix),
                            RenderEffect.createBlurEffect(blur, blur, Shader.TileMode.CLAMP)
                        ).asComposeRenderEffect()
                    }
                }
        ) {
            val center = Offset(size.dp.toPx() / 2, size.dp.toPx() / 2)
            val radius = (size.dp.toPx() / 2) * 0.4f

            // 1. Ambient Glow
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Color(0xFF6366F1).copy(alpha = 0.3f), Color.Transparent),
                    center = center,
                    radius = radius * 3f * scale
                ),
                radius = radius * 3f * scale,
                center = center
            )

            // 2. Ripple Rings
            for (i in 1..3) {
                val ringScale = (rotation + (i * 120)) % 360 / 360f
                val ringAlpha = 1f - ringScale
                drawCircle(
                    color = Color(0xFF6366F1).copy(alpha = ringAlpha * 0.4f),
                    radius = radius * (1f + ringScale * 2f),
                    center = center,
                    style = Stroke(width = 2.dp.toPx())
                )
            }

            // 3. Core Sphere
            scale(scale) {
                drawCircle(
                    brush = Brush.linearGradient(
                        colors = listOf(Color(0xFF9BA3EE), Color(0xFF4450C0)),
                        start = Offset(center.x - radius, center.y - radius),
                        end = Offset(center.x + radius, center.y + radius)
                    ),
                    radius = radius,
                    center = center
                )
                
                // Specular Highlight
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(Color.White.copy(alpha = 0.8f), Color.Transparent),
                        center = Offset(center.x - radius * 0.4f, center.y - radius * 0.4f),
                        radius = radius * 0.5f
                    ),
                    radius = radius * 0.5f,
                    center = Offset(center.x - radius * 0.4f, center.y - radius * 0.4f)
                )
            }
        }
    }
}
