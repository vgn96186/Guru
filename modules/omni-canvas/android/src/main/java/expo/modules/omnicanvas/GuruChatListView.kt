package expo.modules.omnicanvas

import android.content.Context
import android.view.HapticFeedbackConstants
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import expo.modules.localllm.NativeTokenStream
import kotlinx.coroutines.flow.collect

class GuruChatListView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val messagesState = mutableStateOf<List<ChatMessageData>>(emptyList())
    private val isStreamingState = mutableStateOf(false)

    init {
        addView(ComposeView(context).apply {
            setContent {
                ChatList(
                    messages = messagesState.value,
                    isStreaming = isStreamingState.value
                )
            }
        })
    }

    fun setMessages(messages: List<ChatMessageData>) {
        messagesState.value = messages
    }

    fun setIsStreaming(isStreaming: Boolean) {
        isStreamingState.value = isStreaming
    }
}

@Composable
fun ChatList(messages: List<ChatMessageData>, isStreaming: Boolean) {
    val listState = rememberLazyListState()
    var displayMessages by remember { mutableStateOf(messages) }
    val context = LocalContext.current

    // Sync with external state, but internal updates handle the stream delta
    LaunchedEffect(messages) {
        displayMessages = messages
    }

    // Direct Native Stream Subscription (Bridge Skip)
    LaunchedEffect(isStreaming) {
        if (isStreaming) {
            NativeTokenStream.tokens.collect { token ->
                if (displayMessages.isNotEmpty() && displayMessages.last().role == "assistant") {
                    val last = displayMessages.last()
                    displayMessages = displayMessages.dropLast(1) + last.copy(text = last.text + token)
                    // Subtle haptic for token generation
                    (context as? android.app.Activity)?.window?.decorView?.performHapticFeedback(HapticFeedbackConstants.TEXT_HANDLE_MOVE)
                }
            }
        }
    }

    LaunchedEffect(displayMessages.size, if (displayMessages.isNotEmpty()) displayMessages.last().text.length else 0) {
        if (displayMessages.isNotEmpty()) {
            listState.animateScrollToItem(displayMessages.size - 1)
        }
    }

    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(displayMessages, key = { it.id }) { message ->
            AnimatedVisibility(
                visible = true,
                enter = fadeIn() + slideInVertically { it / 2 }
            ) {
                ChatBubble(message)
            }
        }
        
        if (isStreaming && (displayMessages.isEmpty() || displayMessages.last().role == "user")) {
            item { TypingIndicator() }
        }
    }
}

@Composable
fun ChatBubble(message: ChatMessageData) {
    val isUser = message.role == "user"
    
    Column(
        modifier = Modifier.fillMaxWidth().animateContentSize(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .clip(RoundedCornerShape(16.dp))
                .then(if (isUser) Modifier else Modifier.blur(20.dp)) // Glassmorphic base
                .background(
                    if (isUser) {
                        Brush.linearGradient(listOf(Color(0xFF6366F1), Color(0xFF4F46E5)))
                    } else {
                        Brush.verticalGradient(listOf(
                            Color(0xFFFFFFFF).copy(alpha = 0.7f),
                            Color(0xFFF1F5F9).copy(alpha = 0.5f)
                        ))
                    }
                )
                .then(if (!isUser) Modifier.border(0.5.dp, Color.White.copy(alpha = 0.5f), RoundedCornerShape(16.dp)) else Modifier)
                .padding(14.dp)
        ) {
            MarkdownText(
                text = message.text,
                color = if (isUser) Color.White else Color(0xFF1E293B)
            )
        }
        
        Text(
            text = if (isUser) "You" else "Guru AI",
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = Color.Gray.copy(alpha = 0.8f),
            modifier = Modifier.padding(top = 4.dp, start = 6.dp, end = 6.dp)
        )
    }
}

@Composable
fun MarkdownText(text: String, color: Color) {
    val annotatedString = buildAnnotatedString {
        var remainingText = text
        
        // Split by lines to handle bullet points
        val lines = text.split("\n")
        lines.forEachIndexed { index, line ->
            var currentLine = line
            
            // Handle Bullet Points
            if (currentLine.trimStart().startsWith("* ") || currentLine.trimStart().startsWith("- ")) {
                withStyle(style = SpanStyle(fontWeight = FontWeight.Bold, color = color.copy(alpha = 0.7f))) {
                    append("  • ")
                }
                currentLine = currentLine.trimStart().substring(2)
            }

            // Handle Bold (**text**)
            var lastIdx = 0
            val boldRegex = "\\*\\*(.*?)\\*\\*".toRegex()
            val matches = boldRegex.findAll(currentLine)
            
            matches.forEach { match ->
                append(currentLine.substring(lastIdx, match.range.first))
                withStyle(style = SpanStyle(fontWeight = FontWeight.Bold)) {
                    append(match.groupValues[1])
                }
                lastIdx = match.range.last + 1
            }
            append(currentLine.substring(lastIdx))
            
            if (index < lines.size - 1) {
                append("\n")
            }
        }
    }
    
    Text(
        text = annotatedString,
        color = color,
        fontSize = 15.sp,
        lineHeight = 22.sp
    )
}

@Composable
fun TypingIndicator() {
    val infiniteTransition = rememberInfiniteTransition()
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.8f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        )
    )

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFF1F5F9).copy(alpha = alpha))
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        Text("Guru is crafting a response...", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color.Gray)
    }
}
