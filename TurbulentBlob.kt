package com.example.guru.ui.components

import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import org.intellij.lang.annotations.Language

/**
 * Turbulent to Smooth Blob Animation in Jetpack Compose
 * Uses AGSL (RuntimeShader) for high-performance fluid dynamics on Android 13+.
 */

@Language("AGSL")
private const val BLOB_SHADER = """
    uniform float2 resolution;
    uniform float time;
    uniform float intensity; // 0.0 = smooth, 1.0 = maximum turbulence

    // Hash function for noise
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

    // Fractional Brownian Motion for liquid turbulence
    float fbm(vec2 p) {
        float f = 0.0;
        float w = 0.5;
        for (int i = 0; i < 4; i++) {
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
        
        // Base drift for continuous flow
        float drift = time * 0.4;
        
        // Calculate displacement
        float maxDisplacement = 0.15;
        float displacement = fbm(uv * 4.0 + vec2(drift, drift * 0.8)) * maxDisplacement;
        
        // Apply displacement scaled by intensity
        float radius = 0.3; // Base radius of the sphere
        radius += displacement * intensity;
        
        // Subtle breathing (scale pulsing)
        radius += sin(time * 1.5) * 0.015;

        // Anti-aliased smooth edge (creates gooey look)
        float edgeSoftness = 0.03 + (intensity * 0.02);
        float alpha = smoothstep(radius + edgeSoftness, radius - edgeSoftness, dist);

        // Radial Gradient
        vec3 colorStart = vec3(0.608, 0.639, 0.933); // #9BA3EE
        vec3 colorMid = vec3(0.267, 0.314, 0.753);   // #4450C0
        vec3 colorEnd = vec3(0.180, 0.231, 0.675);   // #2E3BAC
        
        // Map distance to gradient colors
        float gradT = clamp(dist / (radius + 0.001), 0.0, 1.0);
        vec3 color = mix(colorStart, colorMid, smoothstep(0.0, 0.5, gradT));
        color = mix(color, colorEnd, smoothstep(0.5, 1.0, gradT));

        return vec4(color * alpha, alpha);
    }
"""

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
@Composable
fun TurbulentBlobAnimation(
    modifier: Modifier = Modifier,
    durationMs: Int = 15000
) {
    val shader = remember { RuntimeShader(BLOB_SHADER) }
    
    // Animation States
    var isAnimating by remember { mutableStateOf(false) }
    
    // Time driver for continuous flow
    val infiniteTransition = rememberInfiniteTransition(label = "time")
    val time by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 100f,
        animationSpec = infiniteRepeatable(
            animation = tween(100000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shaderTime"
    )

    // Intensity calculation over time
    var startTime by remember { mutableStateOf(0L) }
    var currentIntensity by remember { mutableStateOf(0.1f) } // Default resting intensity

    LaunchedEffect(isAnimating) {
        if (isAnimating) {
            startTime = System.currentTimeMillis()
            while (true) {
                val elapsed = System.currentTimeMillis() - startTime
                val progress = (elapsed.toFloat() / durationMs).coerceIn(0f, 1f)
                
                // Ramp up (0 to 15%) then Settle (15% to 100%)
                currentIntensity = if (progress < 0.15f) {
                    val rampProgress = progress / 0.15f
                    1f - (1f - rampProgress) * (1f - rampProgress)
                } else {
                    val settleProgress = (progress - 0.15f) / 0.85f
                    Math.pow(1.0 - settleProgress.toDouble(), 3.0).toFloat()
                }

                if (progress >= 1f) {
                    isAnimating = false
                    break
                }
                delay(16)
            }
        } else {
            // Resting flow intensity
            currentIntensity = 0.1f
        }
    }

    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        // Blob Canvas
        Canvas(
            modifier = Modifier
                .size(300.dp)
                .clickable {
                    if (!isAnimating) {
                        isAnimating = true
                    }
                }
        ) {
            shader.setFloatUniform("resolution", size.width, size.height)
            shader.setFloatUniform("time", time)
            shader.setFloatUniform("intensity", currentIntensity)
            
            drawRect(
                brush = ShaderBrush(shader),
                size = size
            )
        }

        // UI Overlay
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 60.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = if (isAnimating) "Processing..." else "Initiate Cycle",
                color = Color.White,
                fontSize = 18.sp,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            
            Button(
                onClick = { if (!isAnimating) isAnimating = true },
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF6366F1).copy(alpha = 0.2f),
                    contentColor = Color.White
                ),
                shape = RoundedCornerShape(50)
            ) {
                Text(text = if (isAnimating) "STABILIZING" else "RESTART CYCLE")
            }
        }
    }
}
