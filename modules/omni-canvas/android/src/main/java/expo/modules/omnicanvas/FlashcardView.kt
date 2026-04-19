package expo.modules.omnicanvas

import android.content.Context
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class FlashcardView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val cardState = mutableStateOf<FlashcardData?>(null)
    private val isFlippedState = mutableStateOf(false)
    private val onFlip by EventDispatcher<Map<String, Any>>()

    init {
        addView(ComposeView(context).apply {
            setContent {
                FlashcardContainer(
                    card = cardState.value,
                    isFlipped = isFlippedState.value,
                    onFlipRequest = {
                        isFlippedState.value = !isFlippedState.value
                        onFlip(mapOf("isFlipped" to isFlippedState.value))
                    }
                )
            }
        })
    }

    fun setCard(card: FlashcardData) {
        cardState.value = card
    }

    fun setIsFlipped(isFlipped: Boolean) {
        isFlippedState.value = isFlipped
    }
}

@Composable
fun FlashcardContainer(
    card: FlashcardData?,
    isFlipped: Boolean,
    onFlipRequest: () -> Unit
) {
    val rotation by animateFloatAsState(
        targetValue = if (isFlipped) 180f else 0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        )
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        if (card != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.7f)
                    .graphicsLayer {
                        rotationY = rotation
                        cameraDistance = 12f * density
                    }
                    .clickable { onFlipRequest() }
            ) {
                if (rotation <= 90f) {
                    // Front Side
                    CardContent(
                        text = card.front,
                        isBack = false,
                        isCloze = card.isCloze
                    )
                } else {
                    // Back Side
                    Box(
                        Modifier
                            .fillMaxSize()
                            .graphicsLayer { rotationY = 180f }
                    ) {
                        CardContent(
                            text = card.back,
                            isBack = true,
                            isCloze = card.isCloze
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun CardContent(text: String, isBack: Boolean, isCloze: Boolean) {
    val backgroundColor = if (isBack) Color(0xFFF1F5F9) else Color.White
    val borderColor = if (isBack) Color(0xFF6366F1) else Color(0xFFE2E8F0)

    Surface(
        modifier = Modifier.fillMaxSize(),
        shape = RoundedCornerShape(24.dp),
        color = backgroundColor,
        tonalElevation = 4.dp,
        shadowElevation = 8.dp,
        border = androidx.compose.foundation.BorderStroke(2.dp, borderColor)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            contentAlignment = Alignment.Center
        ) {
            val processedText = if (!isBack && isCloze) {
                // Simple Cloze masking: replace {{...}} with [...]
                text.replace(Regex("\\{\\{.*?\\}\\}"), "[...]")
            } else {
                // Highlight the answer if it was a cloze
                text.replace("{{", "").replace("}}", "")
            }

            Text(
                text = processedText,
                fontSize = 22.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                color = Color(0xFF1E293B),
                lineHeight = 32.sp
            )
            
            Text(
                text = if (isBack) "ANSWER" else "QUESTION",
                modifier = Modifier.align(Alignment.TopCenter),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = Color.Gray.copy(alpha = 0.5f)
            )
        }
    }
}
