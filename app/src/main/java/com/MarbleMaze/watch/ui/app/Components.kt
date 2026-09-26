package com.MarbleMaze.watch.ui.app

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import com.MarbleMaze.watch.R
import androidx.compose.ui.unit.dp

@Composable
fun DifficultySelector(selected: String, enabled: Boolean = true, loading: Boolean = false, select: (String) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        MazeViewModel.presets.keys.forEach { key ->
            BrutalSegment(MazeViewModel.label(key), key == selected, { select(key) }, Modifier.weight(1f), enabled, loading)
        }
    }
}

@Composable
fun ActionRow(title: String, enabled: Boolean = true, onClick: () -> Unit) {
    BrutalOutlinedButton(onClick, Modifier.fillMaxWidth(), enabled) {
        Text(title, Modifier.weight(1f))
        AppIcon(if (title.contains("替换")) "swap" else "next")
    }
}

@Composable
fun ErrorDetails(message: String?, detail: String?) {
    if (message != null) {
        BrutalCard(color = com.MarbleMaze.watch.ui.theme.BrutalColors.Red, depth = 0.dp) { Text(message, Modifier.fillMaxWidth().padding(12.dp)) }
        if (detail != null) {
            var expanded by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
            TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "收起详细信息" else "详细信息") }
            if (expanded) Text(detail, style = MaterialTheme.typography.bodySmall)
        }
    }
}


@Composable
fun AppIcon(name: String, modifier: Modifier = Modifier) {
    val resource = when (name) {
        "back" -> R.drawable.ic_back
        "more" -> R.drawable.ic_more
        "watch" -> R.drawable.ic_watch
        "maze" -> R.drawable.ic_maze
        "add" -> R.drawable.ic_add
        "delete" -> R.drawable.ic_delete
        "swap" -> R.drawable.ic_swap
        "next" -> R.drawable.ic_next
        "route" -> R.drawable.ic_route
        "refresh" -> R.drawable.ic_refresh
        "shuffle" -> R.drawable.ic_shuffle
        "download" -> R.drawable.ic_download
        "upload" -> R.drawable.ic_upload
        else -> R.drawable.ic_maze
    }
    Icon(painterResource(resource), contentDescription = when (name) { "back" -> "返回"; "more" -> "更多操作"; else -> null }, modifier = modifier.size(24.dp))
}
