package expo.modules.omnicanvas

import android.content.Context
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.graphicsLayer
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import org.intellij.lang.annotations.Language

// AGSL Shader for GPU-powered fluid dynamics blob
// Uses Simplex noise and Fractal Brownian Motion for organic liquid movement
@Language("AGSL")
private const val TURBULENT_BLOB_SHADER = """
    uniform float2 resolution;
    uniform float time;
    uniform float intensity;
    uniform float phaseOffset;

    // Hash function for noise generation
    vec2 hash(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
    }

    // Simplex noise
    float noise(vec2 p) {
        const float K1 = 0.366025404;
        const float K2 = 0.211324865;

        vec2 i = floor(p + (p.x + p.y) * K1);
        vec2 a = p - i + (i.x + i.y) * K2;
        float m = step(a.y, a.x);
        vec2 o = vec2(m, 1.0 - m);
        vec2 b = a - o + K2;
        vec2 c = a - 1.0 + 2.0 * K2;

        vec3 h = max(0.5 - vec3(dot(a,a), dot(b,b), dot(c,c)), 0.0);
        vec3 n = h*h*h*h * vec3(dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+1.0)));
        return dot(n, vec3(70.0));
    }

    // Fractal Brownian Motion for layered turbulence
    float fbm(vec2 p) {
        float f = 0.0;
        float w = 0.5;
        for (int i = 0; i < 5; i++) {
            f += w * noise(p);
            p *= 2.0;
            w *= 0.5;
        }
        return f;
    }

    vec4 main(in vec2 fragCoord) {
        vec2 uv = fragCoord.xy / resolution.xy;
        vec2 center = vec2(0.5, 0.5);
        vec2 d = uv - center;

        float dist = length(d);

        // Base drift with phase offset for dual-layer effect
        float drift = time * 0.4 + phaseOffset;

        // Multi-octave displacement for organic turbulence
        float maxDisplacement = 0.18;
        vec2 noiseCoord = uv * 3.5 + vec2(drift, drift * 0.7);
        float displacement = fbm(noiseCoord) * maxDisplacement;

        // Secondary high-frequency detail
        displacement += fbm(noiseCoord * 2.5 + 100.0) * maxDisplacement * 0.3;

        // Apply displacement scaled by intensity
        float radius = 0.28;
        radius += displacement * intensity;

        // Breathing pulse
        radius += sin(time * 1.2) * 0.012;

        // Heartbeat pulses (subtle high-frequency bumps)
        float heartbeat = sin(time * 3.5) * 0.5 + 0.5;
        heartbeat = pow(heartbeat, 8.0) * 0.015 * intensity;
        radius += heartbeat;

        // Anti-aliased edge with softness varying by turbulence
        float edgeSoftness = 0.025 + (intensity * 0.015);
        float alpha = smoothstep(radius + edgeSoftness, radius - edgeSoftness, dist);

        // Radial gradient colors
        vec3 colorStart = vec3(0.608, 0.639, 0.933); // #9BA3EE
        vec3 colorMid = vec3(0.369, 0.314, 0.753);   // #5E6AD2 (accent)
        vec3 colorEnd = vec3(0.180, 0.231, 0.675);   // #2E3BAC

        float gradT = clamp(dist / (radius + 0.001), 0.0, 1.0);
        vec3 color = mix(colorStart, colorMid, smoothstep(0.0, 0.4, gradT));
        color = mix(color, colorEnd, smoothstep(0.4, 1.0, gradT));

        // Specular highlight simulation in shader
        vec2 lightDir = normalize(vec2(0.3, -0.4));
        vec2 normal = normalize(d + vec2(displacement * 0.5));
        float specular = max(0.0, dot(normal, lightDir));
        specular = pow(specular, 3.0) * 0.4 * intensity;
        color += vec3(specular);

        return vec4(color * alpha, alpha);
    }
"""

// Simplified glow shader for outer aura
@Language("AGSL")
private const val GLOW_SHADER = """
    uniform float2 resolution;
    uniform float time;
    uniform float intensity;

    float noise(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    vec4 main(in vec2 fragCoord) {
        vec2 uv = fragCoord.xy / resolution.xy;
        vec2 center = vec2(0.5, 0.5);
        float dist = length(uv - center);

        float drift = time * 0.3;
        float n = noise(uv * 2.0 + drift) * 0.5 + 0.5;

        float radius = 0.35 + n * 0.08 * intensity;
        float alpha = smoothstep(radius + 0.15, radius, dist) * 0.25;

        vec3 glowColor = vec3(0.369, 0.314, 0.753); // Accent color
        return vec4(glowColor * alpha, alpha);
    }
"""

// Shader for specular highlight overlay
@Language("AGSL")
private const val SPECULAR_SHADER = """
    uniform float2 resolution;
    uniform float time;

    vec4 main(in vec2 fragCoord) {
        vec2 uv = fragCoord.xy / resolution.xy;
        vec2 center = vec2(0.35, 0.35);
        float dist = length(uv - center);

        float radius = 0.12 + sin(time * 2.0) * 0.01;
        float alpha = smoothstep(radius, radius * 0.7, dist) * 0.6;

        return vec4(1.0, 1.0, 1.0, alpha);
    }
"""


class LoadingOrbView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val sizeState = mutableFloatStateOf(180f)
    private val effectState = mutableStateOf("turbulent")
    private val isActiveState = mutableStateOf(true)
    private val intensityModeState = mutableStateOf("active") // "calm", "active", "turbulent"

    init {
        addView(ComposeView(context).apply {
            setContent {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    TurbulentOrbAGSL(
                        size = sizeState.floatValue,
                        isActive = isActiveState.value,
                        intensityMode = intensityModeState.value
                    )
                } else {
                    // Fallback for older Android versions
                    ClassicOrbFallback(size = sizeState.floatValue)
                }
            }
        })
    }

    fun setSize(size: Float) {
        sizeState.floatValue = size
    }

    fun setEffect(effect: String) {
        effectState.value = effect
        // Map effect names to intensity modes
        intensityModeState.value = when (effect) {
            "calm", "resting" -> "calm"
            "turbulent", "intense" -> "turbulent"
            else -> "active"
        }
    }

    fun setIsActive(active: Boolean) {
        isActiveState.value = active
    }

    fun setIntensityMode(mode: String) {
        intensityModeState.value = mode
    }
}

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
@Composable
fun TurbulentOrbAGSL(
    size: Float,
    isActive: Boolean = true,
    intensityMode: String = "active"
) {
    val infiniteTransition = rememberInfiniteTransition(label = "turbulentOrb")

    // Continuous time animation for fluid flow
    val time by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(200000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "time"
    )

    // Pulsing glow animation (independent breathing)
    val glowScale by infiniteTransition.animateFloat(
        initialValue = 1.0f,
        targetValue = 1.35f,
        animationSpec = infiniteRepeatable(
            animation = tween(2500, easing = EaseInOutCubic),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glowPulse"
    )

    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(2500, easing = EaseInOutCubic),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glowAlpha"
    )

    // Intensity animation based on mode and active state
    val targetIntensity = when (intensityMode) {
        "calm" -> 0.15f
        "turbulent" -> 1.0f
        else -> 0.6f // active
    }

    val intensity = remember { Animatable(if (isActive) targetIntensity else 0.1f) }

    LaunchedEffect(isActive, intensityMode) {
        val newTarget = if (isActive) targetIntensity else 0.1f
        intensity.animateTo(
            newTarget,
            animationSpec = tween(1500, easing = EaseOutCubic)
        )
    }

    // Heartbeat pulse effect - periodic turbulence bumps
    val heartbeatPulse by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 8000
                1f at 0
                1f at 5500
                1.15f at 6000 // Pulse up
                1f at 6500   // Settle back
                1f at 7500
                1.08f at 7800 // Smaller secondary pulse
                1f at 8000
            },
            repeatMode = RepeatMode.Restart
        ),
        label = "heartbeat"
    )

    val finalIntensity = intensity.value * heartbeatPulse

    // Create shaders
    val mainShader = remember { RuntimeShader(TURBULENT_BLOB_SHADER) }
    val glowShader = remember { RuntimeShader(GLOW_SHADER) }
    val specularShader = remember { RuntimeShader(SPECULAR_SHADER) }

    Box(
        modifier = Modifier.size(size.dp),
        contentAlignment = Alignment.Center
    ) {
        val canvasSize = (size * LocalDensity.current.density).toFloat()
        val halfSize = canvasSize / 2

        // 1. Outer Pulsing Glow (behind everything)
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color(0xFF6366F1).copy(alpha = glowAlpha),
                        Color(0xFF6366F1).copy(alpha = 0f)
                    ),
                    center = Offset(halfSize, halfSize),
                    radius = (halfSize * glowScale * 0.9f).toFloat()
                ),
                radius = (halfSize * glowScale * 0.9f).toFloat(),
                center = Offset(halfSize, halfSize)
            )
        }

        // 2. Glow Layer (shader-based, larger, softer)
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    // Apply glow shader via RenderEffect
                    glowShader.setFloatUniform("resolution", canvasSize, canvasSize)
                    glowShader.setFloatUniform("time", time)
                    glowShader.setFloatUniform("intensity", finalIntensity * 0.7f)
                    renderEffect = android.graphics.RenderEffect.createShaderEffect(
                        glowShader
                    ).asComposeRenderEffect()
                }
        ) {
            // Draw full canvas for shader to fill
            drawRect(
                color = Color(0xFF5E6AD2).copy(alpha = 0.3f),
                size = androidx.compose.ui.geometry.Size(canvasSize, canvasSize)
            )
        }

        // 3. Main Turbulent Blob Layer
        Canvas(
            modifier = Modifier
                .fillMaxSize(0.85f)
                .graphicsLayer {
                    mainShader.setFloatUniform("resolution", canvasSize * 0.85f, canvasSize * 0.85f)
                    mainShader.setFloatUniform("time", time)
                    mainShader.setFloatUniform("intensity", finalIntensity)
                    mainShader.setFloatUniform("phaseOffset", 0f)
                    renderEffect = android.graphics.RenderEffect.createShaderEffect(
                        mainShader
                    ).asComposeRenderEffect()
                }
        ) {
            drawRect(
                color = Color.White,
                size = androidx.compose.ui.geometry.Size(canvasSize * 0.85f, canvasSize * 0.85f)
            )
        }

        // 4. Specular Highlight Overlay (top-left reflection)
        Canvas(
            modifier = Modifier
                .fillMaxSize(0.7f)
                .offset((-size * 0.08f).dp, (-size * 0.08f).dp)
                .graphicsLayer {
                    specularShader.setFloatUniform("resolution", canvasSize * 0.7f, canvasSize * 0.7f)
                    specularShader.setFloatUniform("time", time)
                    renderEffect = android.graphics.RenderEffect.createShaderEffect(
                        specularShader
                    ).asComposeRenderEffect()
                }
        ) {
            drawRect(
                color = Color.White.copy(alpha = 0.7f),
                size = androidx.compose.ui.geometry.Size(canvasSize * 0.7f, canvasSize * 0.7f)
            )
        }
    }
}

@Composable
fun ClassicOrbFallback(size: Float) {
    val infiniteTransition = rememberInfiniteTransition(label = "classic")

    val scale by infiniteTransition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        )
    )

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
        val density = LocalDensity.current.density
        Canvas(modifier = Modifier.fillMaxSize()) {
            val center = Offset((size * density).toFloat() / 2, (size * density).toFloat() / 2)
            val radius = ((size * density).toFloat() / 2) * 0.4f

            // Ambient Glow
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Color(0xFF6366F1).copy(alpha = 0.3f), Color.Transparent),
                    center = center,
                    radius = radius * 3f * scale
                ),
                radius = radius * 3f * scale,
                center = center
            )

            // Ripple Rings
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

            // Core Sphere
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
