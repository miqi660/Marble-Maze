package com.MarbleMaze.watch.ui.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun MazePreview(maze: MazeDefinition?, modifier: Modifier = Modifier, showPath: Boolean = false) {
    val walls = MaterialTheme.colorScheme.onSurface
    Canvas(modifier.background(Color.White, RoundedCornerShape(20.dp)).semantics {
        contentDescription = maze?.let { "${it.cols} 列 ${it.rows} 行迷宫预览，绿色圆点为起点，红色色块为终点" } ?: "正在准备迷宫"
    }) {
        if (maze == null) return@Canvas
        val padding = 20.dp.toPx()
        val unit = minOf((size.width - 2 * padding) / maze.cols, (size.height - 2 * padding) / maze.rows)
        val ox = (size.width - maze.cols * unit) / 2
        val oy = (size.height - maze.rows * unit) / 2
        fun point(index: Int) = Offset(ox + (index % maze.cols + .5f) * unit, oy + (index / maze.cols + .5f) * unit)
        if (showPath) maze.path.zipWithNext().forEach { (a, b) ->
            drawLine(Color(0xFFE9BD3D), point(a), point(b), unit * .20f, StrokeCap.Round)
        }
        maze.horizontal.chunked(3).forEach { (x, y, length) ->
            drawLine(walls, Offset(ox + x * unit, oy + y * unit), Offset(ox + (x + length) * unit, oy + y * unit), 1.8.dp.toPx())
        }
        maze.vertical.chunked(3).forEach { (x, y, length) ->
            drawLine(walls, Offset(ox + x * unit, oy + y * unit), Offset(ox + x * unit, oy + (y + length) * unit), 1.8.dp.toPx())
        }
        drawCircle(Color(0xFF509C79), unit * .25f, point(maze.start))
        val goal = point(maze.goal)
        drawRoundRect(Color(0xFFDD8078), Offset(goal.x - unit * .24f, goal.y - unit * .24f), Size(unit * .48f, unit * .48f))
    }
}

@Composable
fun DifficultySelector(selected: String, enabled: Boolean = true, select: (String) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        MazeViewModel.presets.keys.forEach { key ->
            val active = key == selected
            Surface(color = if (active) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                shape = RoundedCornerShape(14.dp), modifier = Modifier.weight(1f)) {
                Box(Modifier.clickable(enabled = enabled) { select(key) }.padding(vertical = 14.dp), contentAlignment = Alignment.Center) {
                    Text(MazeViewModel.label(key), fontWeight = if (active) FontWeight.Bold else FontWeight.Normal)
                }
            }
        }
    }
}

@Composable
fun ActionRow(title: String, enabled: Boolean = true, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick).padding(vertical = 20.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline)
        Text("›", style = MaterialTheme.typography.titleLarge)
    }
}

@Composable
fun ErrorDetails(message: String?, detail: String?) {
    if (message != null) {
        Text(message, color = MaterialTheme.colorScheme.error)
        if (detail != null) {
            var expanded by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
            TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "收起详细信息" else "详细信息") }
            if (expanded) Text(detail, style = MaterialTheme.typography.bodySmall)
        }
    }
}

