package expo.modules.omnicanvas

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.text.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.*

data class Particle(
    var x: Float,
    var y: Float,
    var vx: Float,
    var vy: Float,
    var life: Float,
    val color: Color
)

class MindMapCanvasView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val scope = CoroutineScope(Dispatchers.Main + Job())
    private val onNodePress by EventDispatcher<Map<String, Any>>()
    private val onCanvasPan by EventDispatcher<Map<String, Any>>()
    private val onZoomChange by EventDispatcher<Map<String, Any>>()

    private var nodesState = mutableStateOf<List<NodeData>>(emptyList())
    private var edgesState = mutableStateOf<List<EdgeData>>(emptyList())
    private val zoomState = mutableFloatStateOf(1f)
    private val offsetState = mutableStateOf(Offset.Zero)

    // Physics & Particle State
    private val velocities = mutableMapOf<Int, Offset>()
    private var draggedNodeId: Int? = null
    private var particles = mutableStateListOf<Particle>()
    private var physicsJob: Job? = null

    init {
        val composeView = ComposeView(context).apply {
            setContent {
                MindMapCanvas(
                    nodes = nodesState.value,
                    edges = edgesState.value,
                    zoom = zoomState.floatValue,
                    offset = offsetState.value,
                    particles = particles,
                    onNodeClick = { id -> onNodePress(mapOf("nodeId" to id)) },
                    onNodeDrag = { id, pos -> 
                        draggedNodeId = id
                        updateNodePosition(id, pos)
                    },
                    onDragEnd = { draggedNodeId = null }
                )
            }
        }
        addView(composeView)
        startPhysicsLoop()
    }

    private fun updateNodePosition(id: Int, pos: Offset) {
        nodesState.value = nodesState.value.map { 
            if (it.id == id) it.copy(x = pos.x, y = pos.y) else it 
        }
    }

    private fun startPhysicsLoop() {
        physicsJob?.cancel()
        physicsJob = scope.launch {
            while (isActive) {
                val currentNodes = nodesState.value
                val currentEdges = edgesState.value

                // Update Particles
                if (particles.isNotEmpty()) {
                    val iterator = particles.iterator()
                    while (iterator.hasNext()) {
                        val p = iterator.next()
                        p.x += p.vx
                        p.y += p.vy
                        p.life -= 0.02f
                        if (p.life <= 0) iterator.remove()
                    }
                }

                if (currentNodes.size > 1) {
                    val nextNodes = currentNodes.map { node ->
                        if (node.isCenter || node.id == draggedNodeId) return@map node

                        var force = Offset.Zero
                        
                        // 1. Repulsion (Nodes push each other)
                        currentNodes.forEach { other ->
                            if (node.id != other.id) {
                                val delta = Offset(node.x - other.x, node.y - other.y)
                                val distSq = delta.getDistanceSquared().coerceAtLeast(100f)
                                force += delta / (distSq * 0.01f) // Strength factor
                            }
                        }

                        // 2. Attraction (Springs on edges)
                        currentEdges.forEach { edge ->
                            if (edge.sourceId == node.id || edge.targetId == node.id) {
                                val otherId = if (edge.sourceId == node.id) edge.targetId else edge.sourceId
                                val other = currentNodes.find { it.id == otherId }
                                if (other != null) {
                                    val delta = Offset(other.x - node.x, other.y - node.y)
                                    val dist = delta.getDistance()
                                    val springForce = (dist - 150f) * 0.05f // Rest length 150
                                    force += (delta / dist) * springForce
                                }
                            }
                        }

                        // Apply velocity & damping
                        val v = (velocities[node.id] ?: Offset.Zero) * 0.9f + force * 0.1f
                        velocities[node.id] = v
                        
                        node.copy(x = node.x + v.x, y = node.y + v.y)
                    }
                    nodesState.value = nextNodes
                    delay(16) // ~60fps
                } else {
                    delay(100)
                }
            }
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        physicsJob?.cancel()
    }

    fun spawnBurst(x: Float, y: Float) {
        repeat(20) {
            val angle = Math.random() * 2 * Math.PI
            val speed = Math.random() * 5 + 2
            particles.add(Particle(
                x = x, y = y,
                vx = (Math.cos(angle) * speed).toFloat(),
                vy = (Math.sin(angle) * speed).toFloat(),
                life = 1.0f,
                color = Color(0xFF6366F1).copy(alpha = 0.8f)
            ))
        }
    }

    fun setNodes(nodes: List<NodeData>) {
        if (nodes.size > nodesState.value.size) {
            // New nodes added, spawn burst at the last one's location
            nodes.lastOrNull()?.let { spawnBurst(it.x, it.y) }
        }
        // Reset velocities for new nodes if they don't exist
        nodes.forEach { if (!velocities.containsKey(it.id)) velocities[it.id] = Offset.Zero }
        nodesState.value = nodes
    }

    fun setEdges(edges: List<EdgeData>) {
        edgesState.value = edges
    }

    fun setZoom(zoom: Float) {
        zoomState.floatValue = zoom
    }

    fun setOffsetX(x: Float) {
        offsetState.value = offsetState.value.copy(x = x)
    }

    fun setOffsetY(y: Float) {
        offsetState.value = offsetState.value.copy(y = y)
    }
}

@OptIn(ExperimentalTextApi::class)
@Composable
fun MindMapCanvas(
    nodes: List<NodeData>,
    edges: List<EdgeData>,
    zoom: Float,
    offset: Offset,
    particles: List<Particle>,
    onNodeClick: (Int) -> Unit,
    onNodeDrag: (Int, Offset) -> Unit,
    onDragEnd: () -> Unit
) {
    val textMeasurer = rememberTextMeasurer()
    val currentScale = zoom
    val currentOffset = offset

    Canvas(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(nodes, currentScale, currentOffset) {
                detectDragGestures(
                    onDragStart = { },
                    onDragEnd = { onDragEnd() },
                    onDragCancel = { onDragEnd() },
                    onDrag = { change, dragAmount ->
                        val canvasX = (change.position.x - currentOffset.x) / currentScale
                        val canvasY = (change.position.y - currentOffset.y) / currentScale
                        
                        val node = nodes.find { n ->
                            canvasX >= n.x - 80 && canvasX <= n.x + 80 &&
                            canvasY >= n.y - 30 && canvasY <= n.y + 30
                        }
                        node?.let { onNodeDrag(it.id, Offset(canvasX, canvasY)) }
                    }
                )
                detectTapGestures { tapOffset ->
                    val canvasX = (tapOffset.x - currentOffset.x) / currentScale
                    val canvasY = (tapOffset.y - currentOffset.y) / currentScale
                    nodes.find { n ->
                        canvasX >= n.x - 80 && canvasX <= n.x + 80 &&
                        canvasY >= n.y - 30 && canvasY <= n.y + 30
                    }?.let { onNodeClick(it.id) }
                }
            }
    ) {
        // Draw Edges with Bezier curves
        edges.forEach { edge ->
            val source = nodes.find { it.id == edge.sourceId }
            val target = nodes.find { it.id == edge.targetId }
            if (source != null && target != null) {
                val start = Offset(source.x * currentScale + currentOffset.x, source.y * currentScale + currentOffset.y)
                val end = Offset(target.x * currentScale + currentOffset.x, target.y * currentScale + currentOffset.y)
                
                val path = Path().apply {
                    moveTo(start.x, start.y)
                    cubicTo(
                        (start.x + end.x) / 2, start.y,
                        (start.x + end.x) / 2, end.y,
                        end.x, end.y
                    )
                }
                drawPath(
                    path = path,
                    color = Color(0xFFE0E0E0),
                    style = Stroke(width = 2f * currentScale)
                )
            }
        }

        // Draw Nodes
        nodes.forEach { node ->
            val drawX = node.x * currentScale + currentOffset.x
            val drawY = node.y * currentScale + currentOffset.y
            
            val nodeWidth = 160f * currentScale
            val nodeHeight = 50f * currentScale
            
            // Glassmorphic Node
            drawRoundRect(
                brush = Brush.verticalGradient(
                    colors = listOf(
                        if (node.isCenter) Color(0xFFB5CBE6) else Color(0xFFFFFFFF).copy(alpha = 0.9f),
                        if (node.isCenter) Color(0xFFA3BBD9) else Color(0xFFF0F4F8).copy(alpha = 0.9f)
                    )
                ),
                topLeft = Offset(drawX - nodeWidth / 2, drawY - nodeHeight / 2),
                size = Size(nodeWidth, nodeHeight),
                cornerRadius = CornerRadius(8f * currentScale, 8f * currentScale)
            )
            
            // Node Border
            drawRoundRect(
                color = if (node.isCenter) Color(0xFF1E1E1E) else Color(0xFFD1D9E6),
                topLeft = Offset(drawX - nodeWidth / 2, drawY - nodeHeight / 2),
                size = Size(nodeWidth, nodeHeight),
                cornerRadius = CornerRadius(8f * currentScale, 8f * currentScale),
                style = Stroke(width = 1f * currentScale)
            )

            // Text
            val textLayoutResult = textMeasurer.measure(
                text = AnnotatedString(node.label),
                style = TextStyle(
                    fontSize = (12f * currentScale).sp,
                    color = Color(0xFF1E1E1E),
                    textAlign = TextAlign.Center
                ),
                constraints = androidx.compose.ui.unit.Constraints(
                    maxWidth = (nodeWidth * 0.9f).toInt()
                )
            )
            
            drawText(
                textLayoutResult = textLayoutResult,
                topLeft = Offset(
                    drawX - textLayoutResult.size.width / 2,
                    drawY - textLayoutResult.size.height / 2
                )
            )
        }

        // Draw Particles
        particles.forEach { p ->
            drawCircle(
                color = p.color.copy(alpha = p.life),
                radius = 4f * currentScale,
                center = Offset(p.x * currentScale + currentOffset.x, p.y * currentScale + currentOffset.y)
            )
        }
    }
}
