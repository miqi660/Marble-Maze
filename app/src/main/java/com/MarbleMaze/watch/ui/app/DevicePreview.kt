package com.MarbleMaze.watch.ui.app

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.updateTransition
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.MarbleMaze.watch.ui.theme.BrutalColors
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/** 固定预览区域中，对设备几何做动画；不淡出页面，也不复制迷宫算法。 */
@Composable
fun DevicePreview(maze: MazeDefinition?, modifier: Modifier = Modifier, variant: DeviceVariant? = null,
                  seed: Long? = null, showPath: Boolean = false, profile: String = maze?.profile ?: "band") {
    val geometry = DeviceRenderProfile.resolve(profile, variant, maze?.cols ?: 8, maze?.rows ?: 15)
    val previewScale = remember { Animatable(1f) }
    val previewAlpha = remember { Animatable(1f) }
    val previewOffsetY = remember { Animatable(0f) }
    val previewSpring = remember { spring<Float>(stiffness = 800f, dampingRatio = 0.82f) }
    val previousTarget = remember { mutableStateOf(profile to variant) }
    LaunchedEffect(profile, variant) {
        val target = profile to variant
        if (previousTarget.value != target) {
            previousTarget.value = target
            coroutineScope {
                previewScale.snapTo(0.97f)
                previewAlpha.snapTo(0.90f)
                previewOffsetY.snapTo(6f)
                launch { previewScale.animateTo(1f, previewSpring) }
                launch { previewAlpha.animateTo(1f, previewSpring) }
                launch { previewOffsetY.animateTo(0f, previewSpring) }
            }
        }
    }
    // 只在设备型号变化时过渡设备外形；难度变化直接更新迷宫区域，避免预览画布来回移动。
    val transition = updateTransition(profile to variant, label = "目标设备几何")
    fun deviceGeometry(target: Pair<String, DeviceVariant?>) =
        DeviceRenderProfile.resolve(target.first, target.second, 8, 15)
    val width by transition.animateFloat({ tween(280) }, label = "设备宽") { deviceGeometry(it).width }
    val height by transition.animateFloat({ tween(280) }, label = "设备高") { deviceGeometry(it).height }
    val radius by transition.animateFloat({ tween(280) }, label = "外框圆角") { deviceGeometry(it).radius }
    val screenRadius by transition.animateFloat({ tween(280) }, label = "屏幕圆角") { deviceGeometry(it).screenRadius }
    val left by transition.animateFloat({ tween(280) }, label = "迷宫左边距") { deviceGeometry(it).mazeLeft }
    val mazeWidth by transition.animateFloat({ tween(280) }, label = "迷宫宽") { deviceGeometry(it).mazeWidth }
    val visualScale by transition.animateFloat({ tween(280) }, label = "内部视觉比例") { deviceGeometry(it).referenceScale }
    val titleY by transition.animateFloat({ tween(280) }, label = "标题位置") { deviceGeometry(it).titleY }
    val metaY by transition.animateFloat({ tween(280) }, label = "信息位置") { deviceGeometry(it).metaY }
    val footerY by transition.animateFloat({ tween(280) }, label = "底部位置") { deviceGeometry(it).footerY }
    val top = geometry.mazeTop
    val mazeHeight = geometry.mazeHeight
    val label = devicePreviewLabel(profile, variant)
    val paint = remember { Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER } }
    Canvas(modifier.graphicsLayer {
        scaleX = previewScale.value
        scaleY = previewScale.value
        alpha = previewAlpha.value
        translationY = previewOffsetY.value.dp.toPx()
    }.semantics { contentDescription = "$label 设备预览，${maze?.cols ?: 0} 列 ${maze?.rows ?: 0} 行，绿色起点、红色终点" }) {
        val padding = 12.dp.toPx()
        val fit = minOf((size.width - 2 * padding) / width, (size.height - 2 * padding) / height).coerceAtLeast(0f)
        val ox = (size.width - width * fit) / 2
        val oy = (size.height - height * fit) / 2
        withTransform({ translate(ox, oy); scale(fit, fit, Offset.Zero) }) {
            drawRoundRect(BrutalColors.Ink, topLeft = Offset(3f, 3f), size = Size(width, height), cornerRadius = CornerRadius(radius))
            drawRoundRect(BrutalColors.Ink, size = Size(width, height), cornerRadius = CornerRadius(radius))
            drawRoundRect(BrutalColors.Paper, topLeft = Offset(3f, 3f), size = Size(width - 6f, height - 6f), cornerRadius = CornerRadius(screenRadius))
            fun text(value: String, y: Float, fontSize: Float, bold: Boolean = false) {
                paint.color = BrutalColors.Ink.toArgb()
                paint.textSize = fontSize * visualScale
                paint.typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.MONOSPACE
                drawContext.canvas.nativeCanvas.drawText(value, width / 2f, y, paint)
            }
            text(label, titleY, 12f, true)
            text("MARBLE MAZE", metaY, 8f)
            if (maze != null) {
                drawMazeCanvas(maze, left, top, mazeWidth, mazeHeight, visualScale, showPath)
                text("${maze.cols} × ${maze.rows}", footerY, 12f, true)
                text("SEED ${seed ?: "—"}", footerY + 17f * visualScale, 8f)
            }
        }
    }
}

/** 同一套逻辑坐标绘制用于全部设备；Band 的 X/Y 单元比例始终一致。 */
private fun DrawScope.drawMazeCanvas(maze: MazeDefinition, left: Float, top: Float, width: Float,
                                     height: Float, visualScale: Float, showPath: Boolean) {
    val ux = width / maze.cols
    val uy = height / maze.rows
    val unit = minOf(ux, uy)
    fun point(index: Int) = Offset(left + (index % maze.cols + .5f) * ux, top + (index / maze.cols + .5f) * uy)
    if (showPath) maze.path.zipWithNext().forEach { (a, b) ->
        drawLine(BrutalColors.Yellow, point(a), point(b), unit * .20f, StrokeCap.Round)
    }
    maze.horizontal.chunked(3).forEach { (x, y, length) ->
        drawLine(BrutalColors.Ink, Offset(left + x * ux, top + y * uy), Offset(left + (x + length) * ux, top + y * uy), 4.2f * visualScale)
    }
    maze.vertical.chunked(3).forEach { (x, y, length) ->
        drawLine(BrutalColors.Ink, Offset(left + x * ux, top + y * uy), Offset(left + x * ux, top + (y + length) * uy), 4.2f * visualScale)
    }
    drawCircle(BrutalColors.Green, unit * .25f, point(maze.start))
    val goal = point(maze.goal)
    drawRoundRect(BrutalColors.Red, Offset(goal.x - unit * .24f, goal.y - unit * .24f), Size(unit * .48f, unit * .48f))
}
