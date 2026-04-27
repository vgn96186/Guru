package expo.modules.applauncher.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

val ACCENT_LIGHT = Color(0xFF9BA3EE)
val ACCENT_BASE = Color(0xFF5A67D8)
val ACCENT_DEEP = Color(0xFF4450C0)
val ACCENT_DARK = Color(0xFF2E3BAC)



@Composable
fun LoadingOrbCompose(
    message: String = "Hey there! Let me think...",
    isTurbulent: Boolean = true,
    pathIntensity: Float = 1.0f,
    breathIntensity: Float = 1.0f
) {

    // Reuse Path + FloatArray buffers across frames to eliminate per-frame allocations.
    // Each draw rewinds and refills these instead of allocating new objects.
    val groundShadowPath = remember { Path() }
    val glowPath = remember { Path() }
    val bodyPath = remember { Path() }
    // 60 vertices × 2 floats (x, y) per layer; 3 layers
    val pointsBuffer = remember { FloatArray(60 * 2 * 3) }

    val infiniteTransition = rememberInfiniteTransition()

    // Core breathing (fast energetic pulse during boot)
    val scaleCore by infiniteTransition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        )
    )

    val opacityCore by infiniteTransition.animateFloat(
        initialValue = 0.85f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        )
    )

    // Time for turbulent blob
    val time by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 100f,
        animationSpec = infiniteRepeatable(
            animation = tween(40000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        )
    )

    // Ripple rings for classic mode
    val emitAnim1 by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(3500, easing = LinearOutSlowInEasing),
            repeatMode = RepeatMode.Restart
        )
    )
    val emitAnim2 by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(3500, easing = LinearOutSlowInEasing, delayMillis = 1200),
            repeatMode = RepeatMode.Restart
        )
    )
    val emitAnim3 by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(4000, easing = LinearOutSlowInEasing, delayMillis = 2400),
            repeatMode = RepeatMode.Restart
        )
    )

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val baseRadius = size.minDimension / 2f
            val center = Offset(size.width / 2f, size.height / 2f)

            if (isTurbulent) {
                // pathIntensity controls blob deformation only.
                // breathIntensity controls core breathing — kept alive even after turbulence calms.
                val effectiveScale = 1.0f + (scaleCore - 1.0f) * breathIntensity.coerceIn(0f, 1f)
                val effectiveOpacity = 1.0f + (opacityCore - 1.0f) * breathIntensity.coerceIn(0f, 1f)
                drawTurbulentOrb(center, baseRadius, time, effectiveScale, effectiveOpacity, pathIntensity.coerceIn(0f, 1f), groundShadowPath, glowPath, bodyPath, pointsBuffer)
            } else {
                // Static sphere — no internal animation. Box breathing is driven by RN wrapper.
                drawClassicOrb(center, baseRadius, 1.0f, 0f, 0f, 0f, groundShadowPath, glowPath, bodyPath, pointsBuffer)
            }
        }
    }
}

fun DrawScope.drawClassicOrb(
    center: Offset,
    baseRadius: Float,
    scaleCore: Float,
    emit1: Float,
    emit2: Float,
    emit3: Float,
    groundShadowPath: Path,
    glowPath: Path,
    bodyPath: Path,
    pointsBuffer: FloatArray
) {
    // The classic orb is now simply the turbulent orb mathematically calmed to a perfect sphere (intensity = 0).
    // This guarantees 100% visual parity with the settled boot sequence and shares the exact same 6-layer mercurial shaders.
    // Time and opacity are unused in classic static mode, so we pass 0f and 1f.
    drawTurbulentOrb(center, baseRadius, 0f, scaleCore, 1.0f, 0f, groundShadowPath, glowPath, bodyPath, pointsBuffer)
}

private const val N = 60

// Fills `outOffset..outOffset + N*2` of pointsBuffer with x/y pairs and rewinds+rebuilds `path`.
// Zero allocations: no Point class, no MutableList, no Path() construction.
private fun buildViscousBlobPath(
    path: Path,
    pointsBuffer: FloatArray,
    outOffset: Int,
    cx: Float,
    centerY: Float,
    S: Float,
    time: Float,
    intensity: Float,
    layerOffset: Float,
    cyOffset: Float,
    yScale: Float,
    intensityMult: Float
) {
    val cy = centerY + cyOffset * S
    val baseR = 50f * S
    val maxDeform = (28f - layerOffset * 5f) * S
    val baseLayerR = baseR - layerOffset * 2.5f * S
    val speedMult = 1.0 + layerOffset * 0.18
    val phaseOffset = layerOffset * 5.0
    val twoPiOverN = (Math.PI * 2.0) / N

    for (i in 0 until N) {
        val angle = i * twoPiOverN
        val phase = angle + phaseOffset
        val speed = time * speedMult

        val noise = sin(phase * 2 + speed * 0.7) * 0.5 +
                    sin(phase * 3 - speed * 1.1) * 0.28 +
                    cos(phase * 4 + speed * 1.6) * 0.12 +
                    sin(phase * 5 - speed * 2.0) * 0.04

        val smoothNoise = (noise / (1 + abs(noise) * 0.12)).toFloat()
        val currentR = baseLayerR + smoothNoise * intensity * intensityMult * maxDeform

        val idx = outOffset + i * 2
        pointsBuffer[idx]     = (cx + cos(angle) * currentR).toFloat()
        pointsBuffer[idx + 1] = (cy + sin(angle) * currentR * yScale).toFloat()
    }

    path.rewind()
    path.moveTo(pointsBuffer[outOffset], pointsBuffer[outOffset + 1])
    for (i in 0 until N) {
        val i0 = outOffset + ((i - 1 + N) % N) * 2
        val i1 = outOffset + i * 2
        val i2 = outOffset + ((i + 1) % N) * 2
        val i3 = outOffset + ((i + 2) % N) * 2

        val p0x = pointsBuffer[i0];     val p0y = pointsBuffer[i0 + 1]
        val p1x = pointsBuffer[i1];     val p1y = pointsBuffer[i1 + 1]
        val p2x = pointsBuffer[i2];     val p2y = pointsBuffer[i2 + 1]
        val p3x = pointsBuffer[i3];     val p3y = pointsBuffer[i3 + 1]

        val cp1x = p1x + (p2x - p0x) / 6f
        val cp1y = p1y + (p2y - p0y) / 6f
        val cp2x = p2x - (p3x - p1x) / 6f
        val cp2y = p2y - (p3y - p1y) / 6f

        path.cubicTo(cp1x, cp1y, cp2x, cp2y, p2x, p2y)
    }
    path.close()
}

fun DrawScope.drawTurbulentOrb(
    center: Offset,
    viewRadius: Float,
    time: Float,
    scaleCore: Float,
    opacityCore: Float,
    intensity: Float,
    groundShadowPath: Path,
    glowPath: Path,
    bodyPath: Path,
    pointsBuffer: FloatArray
) {
    // S maps 140 SVG units to the view size to match original JS scaling,
    // and applies the breathing scaleCore.
    val S = (viewRadius * 2f / 140f) * scaleCore
    val cx = center.x
    val cy0 = center.y

    // Layer 0: ground shadow (offset 0)
    buildViscousBlobPath(groundShadowPath, pointsBuffer, 0,        cx, cy0, S, time, intensity, 0f, 18f, 0.3f, 0.6f)
    // Layer 1: glow (offset N*2)
    buildViscousBlobPath(glowPath,         pointsBuffer, N * 2,    cx, cy0, S, time, intensity, 0f, 0f, 1f, 1.0f)
    // Layer 2: body (offset N*4)
    buildViscousBlobPath(bodyPath,         pointsBuffer, N * 2 * 2, cx, cy0, S, time, intensity, 0f, 0f, 1f, 1.0f)
    
    val bodyB = bodyPath.getBounds()
    val gsB = groundShadowPath.getBounds()
    val glB = glowPath.getBounds()

    val orbGroundShadow = Brush.radialGradient(
        0.00f to Color(0xFF1E1B4B).copy(alpha = 0.55f),
        0.35f to Color(0xFF0F0D2E).copy(alpha = 0.3f),
        0.65f to Color(0xFF000000).copy(alpha = 0.12f),
        1.00f to Color.Transparent,
        center = Offset(gsB.left + gsB.width * 0.5f, gsB.top + gsB.height * 0.5f),
        radius = gsB.width * 0.5f.coerceAtLeast(1f)
    )

    val orbGlow = Brush.radialGradient(
        0.00f to Color(0xFF818CF8).copy(alpha = 0.4f),
        0.35f to Color(0xFF6366F1).copy(alpha = 0.18f),
        0.65f to Color(0xFF4F46E5).copy(alpha = 0.06f),
        1.00f to Color.Transparent,
        center = Offset(glB.left + glB.width * 0.5f, glB.top + glB.height * 0.5f),
        radius = glB.width * 0.5f.coerceAtLeast(1f)
    )


    // --- Mercurial Liquid Metal (Start Button accent hue) ---

    // Base volume: Start Button accent fading rapidly to pitch black at edges
    val orbBody = Brush.radialGradient(
        0.00f to Color(0xFF8B95E0), // Light metallic accent
        0.25f to Color(0xFF5E6AD2), // Core accent (Start Button color)
        0.50f to Color(0xFF4651B3), // Dark accent
        0.80f to Color(0xFF20255C), // Very dark
        1.00f to Color(0xFF000000), // Pitch black edge
        center = Offset(bodyB.left + bodyB.width * 0.35f, bodyB.top + bodyB.height * 0.30f),
        radius = bodyB.width * 0.75f.coerceAtLeast(1f)
    )

    // Ambient Occlusion: Harsh bottom shadow for metallic weight
    val orbAO = Brush.radialGradient(
        0.00f to Color(0xFF000000).copy(alpha = 0.85f),
        0.40f to Color(0xFF000000).copy(alpha = 0.4f),
        0.70f to Color.Transparent,
        center = Offset(bodyB.left + bodyB.width * 0.5f, bodyB.top + bodyB.height * 0.85f),
        radius = bodyB.width * 0.65f.coerceAtLeast(1f)
    )

    // Specular: Soft white highlight painted directly onto the fluid path
    val orbSpecular = Brush.radialGradient(
        0.00f to Color(0xFFFFFFFF).copy(alpha = 0.95f),
        0.15f to Color(0xFFFFFFFF).copy(alpha = 0.45f),
        0.30f to Color(0xFFE0E7FF).copy(alpha = 0.15f),
        0.50f to Color.Transparent,
        center = Offset(bodyB.left + bodyB.width * 0.25f, bodyB.top + bodyB.height * 0.20f),
        radius = bodyB.width * 0.60f.coerceAtLeast(1f)
    )

    // Metallic Environment: Sweeping dark bands that create extreme 3D volume
    val orbMetallicEnvironment = Brush.radialGradient(
        0.00f to Color.Transparent,
        0.35f to Color.Transparent,
        0.55f to Color(0xFF000000).copy(alpha = 0.3f),
        0.80f to Color(0xFF000000).copy(alpha = 0.7f),
        1.00f to Color(0xFF000000).copy(alpha = 0.95f),
        center = Offset(bodyB.left + bodyB.width * 0.25f, bodyB.top + bodyB.height * 0.20f),
        radius = bodyB.width * 0.55f.coerceAtLeast(1f)
    )

    // Fresnel: Sharp metallic edge rim light
    val orbFresnel = Brush.radialGradient(
        0.00f to Color.Transparent,
        0.75f to Color.Transparent,
        0.85f to Color(0xFF5E6AD2).copy(alpha = 0.3f),
        0.95f to Color(0xFF8B95E0).copy(alpha = 0.6f),
        1.00f to Color(0xFFFFFFFF).copy(alpha = 0.9f),
        center = Offset(bodyB.left + bodyB.width * 0.5f, bodyB.top + bodyB.height * 0.5f),
        radius = bodyB.width * 0.5f.coerceAtLeast(1f)
    )

    // Ground Reflection: Soft bottom bounce
    val orbReflection = Brush.radialGradient(
        0.00f to Color(0xFF8B95E0).copy(alpha = 0.5f),
        0.30f to Color(0xFF5E6AD2).copy(alpha = 0.1f),
        0.60f to Color.Transparent,
        center = Offset(bodyB.left + bodyB.width * 0.5f, bodyB.top + bodyB.height * 0.85f),
        radius = bodyB.width * 0.45f.coerceAtLeast(1f)
    )

    drawPath(path = groundShadowPath, brush = orbGroundShadow, alpha = opacityCore)
    drawPath(path = glowPath, brush = orbGlow, alpha = opacityCore, blendMode = BlendMode.Screen)
    
    // Draw the single geometric liquid volume
    drawPath(path = bodyPath, brush = orbBody, alpha = opacityCore)
    
    // Paint full mercurial lighting onto the single volume
    clipPath(path = bodyPath) {
        drawPath(path = bodyPath, brush = orbAO, alpha = opacityCore)
        drawPath(path = bodyPath, brush = orbMetallicEnvironment, alpha = opacityCore)
        drawPath(path = bodyPath, brush = orbFresnel, alpha = opacityCore)
        drawPath(path = bodyPath, brush = orbReflection, alpha = opacityCore)
        drawPath(path = bodyPath, brush = orbSpecular, alpha = opacityCore)
    }
}
