package expo.modules.omnicanvas

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

class LectureReturnSheetView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val composeView = ComposeView(context).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        setContent {
            LectureReturnSheetContent(data, onAction)
        }
    }

    var data: LectureReturnData? = null
        set(value) {
            field = value
            composeView.setContent {
                LectureReturnSheetContent(data, onAction)
            }
        }

    var onAction: ((String, Map<String, Any?>?) -> Unit)? = null

    init {
        addView(composeView)
    }
}

@Composable
fun LectureReturnSheetContent(
    data: LectureReturnData?,
    onAction: ((String, Map<String, Any?>?) -> Unit)?
) {
    if (data == null) return

    val theme = object {
        val surface = Color(0xFF050505)
        val surfaceElevated = Color(0xFF1C1C1E)
        val accent = Color(0xFF5E6AD2)
        val textPrimary = Color(0xFFF2F2F2)
        val textMuted = Color(0xFF8A8A8E)
        val success = Color(0xFF3FB950)
        val error = Color(0xFFF14C4C)
        val warning = Color(0xFFD97706)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(theme.surface)
            .padding(16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Back from ${data.appName}!",
                    color = theme.textPrimary,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "${data.durationMinutes} min recorded",
                    color = theme.textMuted,
                    fontSize = 14.sp
                )
            }
            
            IconButton(onClick = { onAction?.invoke("close", null) }) {
                Text("×", color = theme.textPrimary, fontSize = 24.sp)
            }
        }

        Spacer(Modifier.height(24.dp))

        when (data.phase) {
            "intro", "transcribing" -> {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(theme.surfaceElevated)
                        .padding(20.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(
                            progress = { data.progressPercent / 100f },
                            color = theme.accent,
                            trackColor = theme.surface
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(
                            text = data.stageMessage ?: "Transcribing...",
                            color = theme.textPrimary,
                            fontWeight = FontWeight.Medium
                        )
                        data.progressLabel?.let {
                            Text(text = it, color = theme.textMuted, fontSize = 12.sp)
                        }
                    }
                }
            }
            
            "results" -> {
                data.analysis?.let { analysis ->
                    Text(
                        text = "SUMMARY",
                        color = theme.textMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = analysis.lectureSummary,
                        color = theme.textPrimary,
                        fontSize = 15.sp,
                        lineHeight = 22.sp
                    )

                    Spacer(Modifier.height(24.dp))

                    Text(
                        text = "TOPICS",
                        color = theme.textMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                    Spacer(Modifier.height(8.dp))
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        analysis.topics.forEach { topic ->
                            Surface(
                                color = theme.accent.copy(alpha = 0.15f),
                                shape = RoundedCornerShape(8.dp),
                                border = null
                            ) {
                                Text(
                                    text = topic,
                                    color = theme.accent,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }
                }
            }

            "quiz" -> {
                if (data.currentQ < data.quizQuestions.size) {
                    val q = data.quizQuestions[data.currentQ]
                    Text(
                        text = "QUESTION ${data.currentQ + 1}/${data.quizQuestions.size}",
                        color = theme.textMuted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = q.question,
                        color = theme.textPrimary,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Medium
                    )
                    
                    Spacer(Modifier.height(20.dp))
                    
                    q.options.forEachIndexed { index, option ->
                        val isSelected = data.selectedAnswer == index
                        val isCorrect = q.correctIndex == index
                        
                        val bgColor = when {
                            data.selectedAnswer == null -> theme.surfaceElevated
                            isSelected && isCorrect -> theme.success.copy(alpha = 0.2f)
                            isSelected && !isCorrect -> theme.error.copy(alpha = 0.2f)
                            isCorrect -> theme.success.copy(alpha = 0.2f)
                            else -> theme.surfaceElevated
                        }
                        
                        val borderColor = when {
                            data.selectedAnswer == null -> Color.Transparent
                            isSelected && isCorrect -> theme.success
                            isSelected && !isCorrect -> theme.error
                            isCorrect -> theme.success
                            else -> Color.Transparent
                        }

                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .clickable(enabled = data.selectedAnswer == null) {
                                    onAction?.invoke("selectAnswer", mapOf("index" to index))
                                },
                            color = bgColor,
                            shape = RoundedCornerShape(12.dp),
                            border = if (borderColor != Color.Transparent) 
                                androidx.compose.foundation.BorderStroke(1.dp, borderColor) 
                                else null
                        ) {
                            Text(
                                text = option,
                                color = theme.textPrimary,
                                modifier = Modifier.padding(16.dp),
                                fontSize = 15.sp
                            )
                        }
                    }
                }
            }
            
            "quiz_done" -> {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Score: ${data.score} / ${data.quizQuestions.size}",
                        color = theme.textPrimary,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Great job! You've earned ${data.score * 15} XP",
                        color = theme.success,
                        fontSize = 16.sp
                    )
                }
            }
        }

        Spacer(Modifier.height(32.dp))

        // Actions
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (data.phase == "results") {
                Button(
                    onClick = { onAction?.invoke("markAndQuiz", null) },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = theme.accent),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("Mark + Quiz", color = Color.White)
                }
                
                OutlinedButton(
                    onClick = { onAction?.invoke("markOnly", null) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, theme.textMuted)
                ) {
                    Text("Just Mark", color = theme.textPrimary)
                }
            } else if (data.phase == "quiz" && data.selectedAnswer != null) {
                Button(
                    onClick = { onAction?.invoke("nextQuestion", null) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = theme.accent),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(if (data.currentQ < data.quizQuestions.size - 1) "Next" else "Finish", color = Color.White)
                }
            } else if (data.phase == "quiz_done") {
                Button(
                    onClick = { onAction?.invoke("close", null) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = theme.accent),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("Done", color = Color.White)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FlowRow(
    modifier: Modifier = Modifier,
    horizontalArrangement: Arrangement.Horizontal = Arrangement.Start,
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    content: @Composable () -> Unit
) {
    androidx.compose.foundation.layout.FlowRow(
        modifier = modifier,
        horizontalArrangement = horizontalArrangement,
        verticalArrangement = verticalArrangement
    ) {
        content()
    }
}
