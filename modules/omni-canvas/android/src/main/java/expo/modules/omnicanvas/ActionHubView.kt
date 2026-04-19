package expo.modules.omnicanvas

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

class ActionHubView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val composeView = ComposeView(context).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        setContent {
            ActionHubContent(onAction)
        }
    }

    var onAction: ((String, Map<String, Any?>?) -> Unit)? = null

    init {
        addView(composeView)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ActionHubContent(onAction: ((String, Map<String, Any?>?) -> Unit)?) {
    val theme = object {
        val surface = Color(0xFF0D0D0F)
        val surfaceElevated = Color(0xFF1C1C1E)
        val accent = Color(0xFF5E6AD2)
        val textPrimary = Color(0xFFF2F2F2)
        val textMuted = Color(0xFF8A8A8E)
        val success = Color(0xFF3FB950)
        val glass = Color(0x1AFFFFFF)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.6f))))
            .padding(bottom = 12.dp),
        contentAlignment = Alignment.BottomCenter
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.94f)
                .clip(RoundedCornerShape(24.dp))
                .background(theme.surface)
                .verticalScroll(rememberScrollState())
                .padding(20.dp)
        ) {
            // Drag Handle
            Box(
                modifier = Modifier
                    .width(36.dp)
                    .height(4.dp)
                    .clip(CircleShape)
                    .background(theme.textMuted.copy(alpha = 0.4f))
                    .align(Alignment.CenterHorizontally)
            )

            Spacer(Modifier.height(16.dp))

            Text(
                text = "ACTION HUB",
                color = theme.textMuted,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.2.sp
            )

            Spacer(Modifier.height(16.dp))

            // Primary Actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                ActionTile(
                    title = "Record\nLecture",
                    icon = "mic",
                    modifier = Modifier.weight(1f),
                    theme = theme
                ) { onAction?.invoke("record", null) }
                
                ActionTile(
                    title = "Search\nTopics",
                    icon = "search",
                    modifier = Modifier.weight(1f),
                    theme = theme
                ) { onAction?.invoke("search", null) }

                ActionTile(
                    title = "Notes\nVault",
                    icon = "library",
                    modifier = Modifier.weight(1f),
                    theme = theme
                ) { onAction?.invoke("vault", null) }
            }

            Spacer(Modifier.height(16.dp))

            // Secondary Actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SmallActionPill("Daily Challenge", "flash", theme) { onAction?.invoke("daily", null) }
                SmallActionPill("Boss Battle", "shield", theme) { onAction?.invoke("boss", null) }
                SmallActionPill("Upload", "upload", theme) { onAction?.invoke("upload", null) }
            }

            Spacer(Modifier.height(24.dp))

            Text(
                text = "LAUNCH EXTERNAL APP",
                color = theme.textMuted,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.2.sp
            )

            Spacer(Modifier.height(16.dp))

            // External Apps Grid
            val apps = listOf(
                AppInfo("Marrow", Color(0xFFE91E63), "flask"),
                AppInfo("Prepladder", Color(0xFF00BCD4), "layers"),
                AppInfo("Cerebellum", Color(0xFF8BC34A), "school"),
                AppInfo("YouTube", Color(0xFFFF0000), "logo-youtube")
            )

            androidx.compose.foundation.layout.FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                maxItemsInEachRow = 3
            ) {
                apps.forEach { app ->
                    ExternalAppChip(app, theme) { onAction?.invoke("launchApp", mapOf("appId" to app.name.lowercase())) }
                }
            }
        }
    }
}

@Composable
fun ActionTile(title: String, icon: String, modifier: Modifier, theme: Any, onClick: () -> Unit) {
    Surface(
        modifier = modifier
            .height(84.dp)
            .clickable { onClick() },
        color = Color(0xFF1C1C1E),
        shape = RoundedCornerShape(14.dp)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Icon placeholder
            Box(Modifier.size(20.dp).background(Color.White.copy(alpha = 0.1f), CircleShape))
            Spacer(Modifier.height(8.dp))
            Text(
                text = title,
                color = Color.White,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
                lineHeight = 16.sp
            )
        }
    }
}

@Composable
fun SmallActionPill(label: String, icon: String, theme: Any, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.clickable { onClick() },
        color = Color(0xFF1C1C1E),
        shape = RoundedCornerShape(10.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(Modifier.size(12.dp).background(Color.White.copy(alpha = 0.1f), CircleShape))
            Spacer(Modifier.width(6.dp))
            Text(text = label, color = Color(0xFF8A8A8E), fontSize = 11.sp)
        }
    }
}

@Composable
fun ExternalAppChip(app: AppInfo, theme: Any, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(88.dp)
            .clickable { onClick() },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(app.color.copy(alpha = 0.12f))
                .background(Brush.radialGradient(listOf(app.color.copy(alpha = 0.05f), Color.Transparent))),
            contentAlignment = Alignment.Center
        ) {
            // App icon placeholder
            Box(Modifier.size(22.dp).background(app.color, CircleShape))
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = app.name,
            color = Color(0xFFF2F2F2),
            fontSize = 11.sp,
            textAlign = TextAlign.Center,
            maxLines = 1
        )
    }
}

data class AppInfo(val name: String, val color: Color, val icon: String)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun dummy() {}
