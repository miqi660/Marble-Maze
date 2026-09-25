package com.MarbleMaze.watch.ui.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceScreen(vm: MazeViewModel, create: () -> Unit, picker: () -> Unit) {
    val state = vm.device
    var menu by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<CustomLevel?>(null) }
    var confirmation by remember { mutableStateOf<String?>(null) }
    PullToRefreshBox(isRefreshing = state.connected && state.busy, onRefresh = { if (state.canOperate) vm.operation("list") }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { Text("设备", style = MaterialTheme.typography.headlineSmall) }
            if (state.unknown) item {
                Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(20.dp)) {
                    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("无法确认同步结果", style = MaterialTheme.typography.titleMedium)
                        Text("设备可能已经完成保存，但手机没有成功读取最终状态。请重新连接设备并刷新关卡列表后再继续操作。")
                        Button(onClick = picker, enabled = !state.busy && !state.preparing) { Text("重新连接") }
                    }
                }
            }
            if (!state.connected) {
                item {
                    Column(Modifier.fillMaxWidth().padding(vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
                        Text("○", fontSize = 64.sp, color = MaterialTheme.colorScheme.outline)
                        Text(if (state.preparing || state.busy) "正在连接设备…" else "尚未连接设备", style = MaterialTheme.typography.titleLarge)
                        Text("连接后可以查看和管理\n设备中的自定义关卡。", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (!state.unknown) Button(onClick = picker, enabled = !state.preparing && !state.busy) { Text("连接设备") }
                    }
                }
            } else {
                item {
                    Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerLow) {
                        Row(Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(state.deviceName, style = MaterialTheme.typography.titleMedium)
                                Text("● 已连接", color = MaterialTheme.colorScheme.tertiary)
                                Text(state.levels?.let { "${it.size} 个自定义关卡" } ?: "正在读取关卡…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Box {
                                TextButton(onClick = { menu = true }, enabled = !state.busy) { Text("⋮", fontSize = 24.sp) }
                                DropdownMenu(menu, { menu = false }) {
                                    DropdownMenuItem(text = { Text("刷新关卡") }, onClick = { menu = false; vm.operation("list") })
                                    DropdownMenuItem(text = { Text("断开连接") }, onClick = { menu = false; vm.disconnect() })
                                    DropdownMenuItem(text = { Text("重新连接") }, onClick = { menu = false; vm.disconnect(); picker() })
                                }
                            }
                        }
                    }
                }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("自定义关卡", style = MaterialTheme.typography.titleMedium)
                        Text("${state.levels?.size ?: "—"} / 12", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                items(state.levels.orEmpty(), key = { it.index }) { level ->
                    Column {
                        Row(Modifier.fillMaxWidth().heightIn(min = 76.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("%02d".format(level.index + 1), Modifier.width(48.dp), fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(level.name.ifBlank { "自定义关卡" }, fontSize = 16.sp)
                                Text("${level.cols} × ${level.rows}", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            TextButton(onClick = { selected = level }, enabled = state.canOperate) { Text("⋮", fontSize = 24.sp) }
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
                if (state.levels?.isEmpty() == true) item { Text("暂无自定义关卡", Modifier.padding(vertical = 20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                item {
                    val full = (state.levels?.size ?: 0) >= 12
                    OutlinedButton(onClick = { if (vm.editor.maze == null) create() else vm.operation("add") },
                        enabled = !full && state.canOperate && !vm.editor.isGenerating, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
                        Text(if (full) "关卡已满" else if (vm.editor.maze == null) "＋ 先创建一个关卡" else "＋ 添加当前关卡")
                    }
                }
            }
            if (state.busy || state.preparing) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            if (state.message.isNotBlank() && !state.unknown) item { Text(state.message, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
    selected?.let { level ->
        if (confirmation == null) ModalBottomSheet(onDismissRequest = { selected = null }) {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("自定义关卡 %02d".format(level.index + 1), style = MaterialTheme.typography.titleLarge)
                Text("${level.cols} × ${level.rows}")
                ActionRow("使用当前关卡替换", vm.editor.maze != null && state.canOperate) { confirmation = "replace" }
                TextButton(onClick = { confirmation = "remove" }, enabled = state.canOperate) { Text("删除关卡", color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = { selected = null }) { Text("取消") }
            }
        } else {
            val remove = confirmation == "remove"
            AlertDialog(onDismissRequest = { confirmation = null; selected = null },
                title = { Text("${if (remove) "删除" else "替换"}自定义 %02d？".format(level.index + 1)) },
                text = { Text(if (remove) "删除后，后面的关卡编号会自动向前移动。" else
                    "当前关卡\n${vm.editor.cols} × ${vm.editor.rows} · ${MazeViewModel.label(vm.editor.preset)}\n\n将替换：\n自定义 %02d\n${level.cols} × ${level.rows}".format(level.index + 1)) },
                dismissButton = { TextButton(onClick = { confirmation = null; selected = null }) { Text("取消") } },
                confirmButton = { TextButton(onClick = { vm.operation(confirmation!!, level.index); confirmation = null; selected = null }, enabled = state.canOperate) {
                    Text(if (remove) "删除" else "替换", color = if (remove) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
                } })
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DevicePicker(vm: MazeViewModel, dismiss: () -> Unit) {
    val state = vm.device
    ModalBottomSheet(onDismissRequest = dismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("连接设备", style = MaterialTheme.typography.headlineSmall)
            Text("已连接到小米运动健康的设备", color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (state.scanning) LinearProgressIndicator(Modifier.fillMaxWidth())
            state.devices.forEach { node ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(node.name, Modifier.weight(1f))
                    Button(onClick = { vm.connect(node); dismiss() }, enabled = !state.scanning && !state.preparing && !state.busy) { Text("连接") }
                }
            }
            if (!state.scanning && state.devices.isEmpty()) Text("没有找到设备？请先在小米运动健康中连接设备。")
            if (state.message.isNotBlank()) Text(state.message, style = MaterialTheme.typography.bodyMedium)
            TextButton(onClick = vm::scan, enabled = !state.scanning && !state.preparing && !state.busy) { Text("重新查询") }
        }
    }
}
