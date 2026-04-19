package expo.modules.omnicanvas

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
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

class NextLectureView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val composeView = ComposeView(context).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        setContent {
            NextLectureContent(data, onAction, onMarkDone)
        }
    }

    var data: NextLectureData? = null
        set(value) {
            field = value
            composeView.setContent {
                NextLectureContent(data, onAction, onMarkDone)
            }
        }

    var onAction: (() -> Unit)? = null
    var onMarkDone: (() -> Unit)? = null

    init {
        addView(composeView)
    }
}

@Composable
fun NextLectureContent(
    data: NextLectureData?,
    onAction: (() -> Unit)?,
    onMarkDone: (() -> Unit)?
) {
    if (data == null) return

    val theme = object {
        val surface = Color(0xFF1C1C1E)
        val textPrimary = Color(0xFFF2F2F2)
        val textMuted = Color(0xFF8A8A8E)
        val border = Color(0xFF2C2C2E)
        val success = Color(0xFF34C759)
    }

    Surface(
        modifier = Modifier
            .fillMaxSize()
            .clickable { onAction?.invoke() },
        color = theme.surface,
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, theme.border)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Subject Dot
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(parseColor(data.subColor))
                )

                // Info
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = data.title,
                        color = theme.textPrimary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1
                    )
                    Text(
                        text = "Lecture ${data.index} - ${data.completedCount}/${data.totalCount} (${data.pct}%)",
                        color = theme.textMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium
                    )
                }

                // Done Button
                Surface(
                    modifier = Modifier
                        .size(34.dp)
                        .clickable(enabled = !data.isBusy) { onMarkDone?.invoke() },
                    color = if (data.isBusy) Color.White.copy(alpha = 0.04f) else theme.success.copy(alpha = 0.08f),
                    shape = CircleShape,
                    border = androidx.compose.foundation.BorderStroke(
                        1.dp, 
                        if (data.isBusy) theme.border else theme.success.copy(alpha = 0.2f)
                    )
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (data.isBusy) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = theme.textMuted)
                        } else {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = "Done",
                                tint = theme.success,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }
            }

            // Progress Bar
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .align(Alignment.BottomCenter)
                    .background(theme.border)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(data.pct / 100f)
                        .fillMaxHeight()
                        .background(parseColor(data.batchColor))
                )
            }
        }
    }
}

fun parseColor(colorString: String): Color {
    return try {
        Color(android.graphics.Color.parseColor(colorString))
    } catch (_: Exception) {
        Color.Gray
    }
}
