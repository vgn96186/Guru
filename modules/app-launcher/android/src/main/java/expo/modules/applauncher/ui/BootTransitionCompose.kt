package expo.modules.applauncher.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.delay

@Composable
fun BootTransitionCompose(
    bootPhase: String = "booting",
    isTurbulent: Boolean = true
) {
    if (bootPhase == "done") return

    // Background fade out when settling
    val bgAlpha by animateFloatAsState(
        targetValue = if (bootPhase == "settling") 0f else 1f,
        animationSpec = tween(1800, easing = FastOutSlowInEasing)
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = bgAlpha)),
        contentAlignment = Alignment.Center
    ) {
        AnimatedVisibility(
            visible = bootPhase != "settling",
            enter = fadeIn(tween(600)),
            exit = fadeOut(tween(1200))
        ) {
            val message = if (bootPhase == "booting") "Guru is waking up..." else "Loading progress..."
            LoadingOrbCompose(
                message = message,
                isTurbulent = isTurbulent
            )
        }
    }
}
