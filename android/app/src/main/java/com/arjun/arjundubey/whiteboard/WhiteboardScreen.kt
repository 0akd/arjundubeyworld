package com.arjun.arjundubey.whiteboard

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.arjun.arjundubey.Todo
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

val jsonParser = Json { ignoreUnknownKeys = true }

private val Violet500 = Color(0xFF8B5CF6)
private val Emerald500 = Color(0xFF10B981)
private val Rose500 = Color(0xFFF43F5E)

@Serializable
private data class WhiteboardSavedData(
    val version: Int = 2,
    val slides: List<WhiteboardSlide> = emptyList(),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WhiteboardScreen(
    todo: Todo,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
    onAutoSave: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val coroutineScope = rememberCoroutineScope()
    val isBlackboard = isSystemInDarkTheme()
    val defaultDrawingColor = if (isBlackboard) Color.White else Color.Black

    var localEraserWidth by remember { mutableFloatStateOf(50f) }
    var showControls by remember { mutableStateOf(true) }
    var hasUnsavedChanges by remember { mutableStateOf(false) }

    val savedData = remember {
        if (todo.whiteboardJson.isBlank()) {
            WhiteboardSavedData(slides = listOf(WhiteboardSlide(id = 1, title = "Slide 1")))
        } else {
            try {
                jsonParser.decodeFromString<WhiteboardSavedData>(todo.whiteboardJson)
            } catch (_: Exception) {
                try {
                    val legacySlides = jsonParser.decodeFromString<List<WhiteboardSlide>>(todo.whiteboardJson)
                    WhiteboardSavedData(slides = legacySlides)
                } catch (_: Exception) {
                    try {
                        val oldStrokes = jsonParser.decodeFromString<List<Stroke>>(todo.whiteboardJson)
                        val legacySlide = WhiteboardSlide(id = 1, title = "Slide 1", strokes = oldStrokes)
                        WhiteboardSavedData(slides = listOf(legacySlide))
                    } catch (_: Exception) {
                        WhiteboardSavedData(slides = listOf(WhiteboardSlide(id = 1, title = "Slide 1")))
                    }
                }
            }
        }
    }

    val cachedState = remember { WhiteboardSessionCache.get(todo.id) }
    var slides by remember { mutableStateOf(cachedState?.history?.getOrNull(cachedState.historyIndex) ?: savedData.slides) }
    var history by remember { mutableStateOf(cachedState?.history ?: listOf(savedData.slides)) }
    var historyIndex by remember { mutableIntStateOf(cachedState?.historyIndex ?: 0) }
    val maxHistory = 40
    var saveJob by remember { mutableStateOf<Job?>(null) }

    fun scheduleAutoSave() {
        if (!hasUnsavedChanges) return
        saveJob?.cancel()
        saveJob = coroutineScope.launch {
            delay(1800)
            if (hasUnsavedChanges) {
                val dataToSave = WhiteboardSavedData(version = 2, slides = slides)
                onAutoSave(jsonParser.encodeToString(WhiteboardSavedData.serializer(), dataToSave))
                hasUnsavedChanges = false
            }
        }
    }

    fun updateSlides(newSlides: List<WhiteboardSlide>) {
        val base = if (historyIndex + 1 < history.size) history.subList(0, historyIndex + 1) else history
        val newHistory = (base + listOf(newSlides)).takeLast(maxHistory)
        history = newHistory
        historyIndex = newHistory.lastIndex
        slides = newSlides
        WhiteboardSessionCache.save(todo.id, history, historyIndex)
    }

    val saveAndClose = {
        if (hasUnsavedChanges) {
            val dataToSave = WhiteboardSavedData(version = 2, slides = slides)
            onSave(jsonParser.encodeToString(WhiteboardSavedData.serializer(), dataToSave))
        }
        onDismiss()
    }

    val pagerState = rememberPagerState(pageCount = { slides.size })
    var currentPoints by remember { mutableStateOf<List<Point>>(emptyList()) }
    var isErasing by remember { mutableStateOf(false) }
    val currentWidth = 8f

    LaunchedEffect(slides.size) {
        if (slides.isNotEmpty() && pagerState.currentPage >= slides.size) {
            pagerState.animateScrollToPage(slides.lastIndex)
        }
    }

    BackHandler { saveAndClose() }

    Surface(
        modifier = modifier.fillMaxSize(),
        color = if (isBlackboard) Color(0xFF121212) else Color.White,
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
                    HorizontalPager(
                        state = pagerState,
                        modifier = Modifier.fillMaxSize(),
                        userScrollEnabled = false,
                    ) { page ->
                        val slide = slides[page]
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(if (isBlackboard) Color(0xFF121212) else Color.White)
                                .pointerInput(isErasing, localEraserWidth, pagerState.currentPage, defaultDrawingColor) {
                                    detectDragGestures(
                                        onDragStart = { offset ->
                                            val cw = size.width.toFloat()
                                            val ch = size.height.toFloat()
                                            if (cw > 0 && ch > 0) {
                                                currentPoints = listOf(Point(offset.x / cw, offset.y / ch))
                                            }
                                        },
                                        onDrag = { change, _ ->
                                            val cw = size.width.toFloat()
                                            val ch = size.height.toFloat()
                                            if (cw > 0 && ch > 0) {
                                                currentPoints = currentPoints + Point(change.position.x / cw, change.position.y / ch)
                                            }
                                        },
                                        onDragEnd = {
                                            if (currentPoints.size > 1) {
                                                val cw = size.width.toFloat()
                                                val simplifiedPoints = if (currentPoints.size > 10) {
                                                    currentPoints.filterIndexed { i, p ->
                                                        i == 0 || i == currentPoints.lastIndex || (kotlin.math.abs(p.x - currentPoints[i - 1].x) > 0.002f || kotlin.math.abs(p.y - currentPoints[i - 1].y) > 0.002f)
                                                    }
                                                } else currentPoints
                                                val newStroke = Stroke(
                                                    points = simplifiedPoints,
                                                    colorArgb = defaultDrawingColor.toArgb(),
                                                    strokeWidth = (if (isErasing) localEraserWidth else currentWidth) / cw,
                                                    isEraser = isErasing,
                                                    isNormalized = true,
                                                )
                                                val updated = slides.mapIndexed { index, s ->
                                                    if (index == page) s.copy(strokes = s.strokes + newStroke) else s
                                                }
                                                updateSlides(updated)
                                                hasUnsavedChanges = true
                                                scheduleAutoSave()
                                            }
                                            currentPoints = emptyList()
                                        },
                                    )
                                },
                        ) {
                            Canvas(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen),
                            ) {
                                val canvasWidthPx = size.width
                                val canvasHeightPx = size.height
                                slide.strokes.forEach { stroke ->
                                    if (stroke.points.size < 2) return@forEach
                                    val path = Path().apply {
                                        val first = stroke.points.first()
                                        if (stroke.isNormalized) {
                                            moveTo(first.x * canvasWidthPx, first.y * canvasHeightPx)
                                            stroke.points.drop(1).forEach { lineTo(it.x * canvasWidthPx, it.y * canvasHeightPx) }
                                        } else {
                                            moveTo(first.x, first.y)
                                            stroke.points.drop(1).forEach { lineTo(it.x, it.y) }
                                        }
                                    }

                                    val rawColor = Color(stroke.colorArgb)
                                    val renderColor = when {
                                        isBlackboard && rawColor == Color.Black -> Color.White
                                        !isBlackboard && rawColor == Color.White -> Color.Black
                                        else -> rawColor
                                    }

                                    drawPath(
                                        path = path,
                                        color = renderColor,
                                        style = androidx.compose.ui.graphics.drawscope.Stroke(
                                            width = if (stroke.isNormalized) stroke.strokeWidth * canvasWidthPx else stroke.strokeWidth,
                                            cap = StrokeCap.Round,
                                            join = StrokeJoin.Round,
                                        ),
                                        blendMode = if (stroke.isEraser) BlendMode.Clear else BlendMode.SrcOver,
                                    )
                                }
                                if (page == pagerState.currentPage && currentPoints.size >= 2) {
                                    val path = Path().apply {
                                        moveTo(currentPoints.first().x * canvasWidthPx, currentPoints.first().y * canvasHeightPx)
                                        currentPoints.drop(1).forEach { lineTo(it.x * canvasWidthPx, it.y * canvasHeightPx) }
                                    }
                                    drawPath(
                                        path = path,
                                        color = defaultDrawingColor,
                                        style = androidx.compose.ui.graphics.drawscope.Stroke(
                                            width = (if (isErasing) localEraserWidth else currentWidth),
                                            cap = StrokeCap.Round,
                                            join = StrokeJoin.Round,
                                        ),
                                        blendMode = if (isErasing) BlendMode.Clear else BlendMode.SrcOver,
                                    )
                                }
                            }
                        }
                    }

                    Column(
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        AnimatedVisibility(
                            visible = showControls && isErasing,
                            enter = fadeIn(tween(200)) + slideInVertically(tween(200)) { -it },
                            exit = fadeOut(tween(200)) + slideOutVertically(tween(200)) { -it },
                        ) {
                            Row(
                                modifier = Modifier
                                    .width(200.dp)
                                    .background(color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.9f), shape = RoundedCornerShape(16.dp))
                                    .padding(horizontal = 16.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text("Size", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Spacer(modifier = Modifier.width(8.dp))
                                Slider(
                                    value = localEraserWidth,
                                    onValueChange = { localEraserWidth = it },
                                    valueRange = 10f..100f,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                        Row(
                            modifier = Modifier
                                .background(color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.9f), shape = RoundedCornerShape(16.dp))
                                .horizontalScroll(rememberScrollState())
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (showControls) {
                                IconButton(
                                    onClick = { isErasing = false },
                                    modifier = Modifier.background(color = if (!isErasing) Violet500.copy(alpha = 0.2f) else Color.Transparent, shape = RoundedCornerShape(12.dp)),
                                ) { Text("🖊️", fontSize = 20.sp) }
                                IconButton(
                                    onClick = { isErasing = true },
                                    modifier = Modifier.background(color = if (isErasing) Violet500.copy(alpha = 0.2f) else Color.Transparent, shape = RoundedCornerShape(12.dp)),
                                ) { Text("🧽", fontSize = 20.sp) }
                                Box(modifier = Modifier.height(24.dp).width(1.dp).background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f)))
                                IconButton(
                                    onClick = {
                                        val updated = slides.mapIndexed { index, s ->
                                            if (index == pagerState.currentPage) s.copy(strokes = emptyList()) else s
                                        }
                                        updateSlides(updated)
                                        hasUnsavedChanges = true
                                        scheduleAutoSave()
                                    }
                                ) { Text("🗑️", fontSize = 20.sp) }
                                Box(modifier = Modifier.height(24.dp).width(1.dp).background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f)))
                                IconButton(
                                    onClick = {
                                        if (historyIndex > 0) {
                                            historyIndex--
                                            slides = history[historyIndex]
                                            hasUnsavedChanges = true
                                            WhiteboardSessionCache.save(todo.id, history, historyIndex)
                                            scheduleAutoSave()
                                        }
                                    },
                                    enabled = historyIndex > 0,
                                    modifier = Modifier.background(color = if (historyIndex > 0) Violet500.copy(alpha = 0.15f) else Color.Transparent, shape = RoundedCornerShape(12.dp)),
                                ) { Text("↩️", fontSize = 22.sp) }
                                IconButton(
                                    onClick = {
                                        if (historyIndex < history.lastIndex) {
                                            historyIndex++
                                            slides = history[historyIndex]
                                            hasUnsavedChanges = true
                                            WhiteboardSessionCache.save(todo.id, history, historyIndex)
                                            scheduleAutoSave()
                                        }
                                    },
                                    enabled = historyIndex < history.lastIndex,
                                    modifier = Modifier.background(color = if (historyIndex < history.lastIndex) Violet500.copy(alpha = 0.15f) else Color.Transparent, shape = RoundedCornerShape(12.dp)),
                                ) { Text("↪️", fontSize = 22.sp) }
                                Box(modifier = Modifier.height(24.dp).width(1.dp).background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f)))
                            }

                            IconButton(
                                onClick = { saveAndClose() },
                                modifier = Modifier.background(color = Emerald500.copy(alpha = 0.15f), shape = RoundedCornerShape(12.dp)),
                            ) { Text("💾", fontSize = 20.sp) }

                            IconButton(
                                onClick = { showControls = !showControls },
                                modifier = Modifier.background(color = Color.Transparent, shape = RoundedCornerShape(12.dp)),
                            ) { Text(if (showControls) "🔽" else "👁️", fontSize = 20.sp) }
                        }
                    }

                    if (showControls) {
                        Row(
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .padding(16.dp)
                                .fillMaxWidth()
                                .background(color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.95f), shape = RoundedCornerShape(20.dp))
                                .padding(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            val listState = rememberLazyListState()
                            LaunchedEffect(pagerState.currentPage) { listState.animateScrollToItem(pagerState.currentPage) }
                            LazyRow(
                                state = listState,
                                modifier = Modifier.weight(1f),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                itemsIndexed(slides) { index, _ ->
                                    FilterChip(
                                        selected = index == pagerState.currentPage,
                                        onClick = { coroutineScope.launch { pagerState.animateScrollToPage(index) } },
                                        label = { Text("Slide ${index + 1}") },
                                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Violet500.copy(alpha = 0.2f), selectedLabelColor = Violet500),
                                        border = FilterChipDefaults.filterChipBorder(borderColor = Color.Transparent, enabled = true, selected = index == pagerState.currentPage),
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            Box(modifier = Modifier.height(24.dp).width(1.dp).background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f)))
                            Spacer(modifier = Modifier.width(8.dp))
                            IconButton(
                                onClick = {
                                    val newId = (slides.maxOfOrNull { it.id } ?: 0) + 1
                                    val newSlides = slides + WhiteboardSlide(id = newId, title = "Slide $newId")
                                    updateSlides(newSlides)
                                    hasUnsavedChanges = true
                                    scheduleAutoSave()
                                    coroutineScope.launch { pagerState.animateScrollToPage(newSlides.lastIndex) }
                                },
                                modifier = Modifier.background(Emerald500.copy(alpha = 0.15f), RoundedCornerShape(12.dp)),
                            ) { Text("➕", fontSize = 16.sp) }
                            if (slides.size > 1) {
                                Spacer(modifier = Modifier.width(8.dp))
                                IconButton(
                                    onClick = {
                                        val currentIndex = pagerState.currentPage
                                        val newSlides = slides.filterIndexed { index, _ -> index != currentIndex }
                                        updateSlides(newSlides)
                                        hasUnsavedChanges = true
                                        scheduleAutoSave()
                                        if (newSlides.isNotEmpty()) {
                                            val newPage = currentIndex.coerceAtMost(newSlides.lastIndex)
                                            coroutineScope.launch { pagerState.animateScrollToPage(newPage) }
                                        }
                                    },
                                    modifier = Modifier.background(Rose500.copy(alpha = 0.15f), RoundedCornerShape(12.dp)),
                                ) { Text("❌", fontSize = 16.sp) }
                            }
                        }
                    }
                }
            }
}
