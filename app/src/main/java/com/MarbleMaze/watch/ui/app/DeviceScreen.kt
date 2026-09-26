package com.MarbleMaze.watch.ui.app

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.MarbleMaze.watch.ui.theme.BrutalColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceScreen(vm: MazeViewModel, picker: () -> Unit, onCreate: () -> Unit) {
    val state = vm.device
    var menu by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<CustomLevel?>(null) }
    var confirmation by remember { mutableStateOf<String?>(null) }
    PullToRefreshBox(isRefreshing = state.connected && state.operationKind == "refreshing", onRefresh = { if (state.canOperate) vm.operation("list") }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { PageHeader("MARBLE MAZE / DEVICE", "我的设备", "管理手环中的自定义关卡") }
            // unknown 保护：高优先级 Alert，始终可见，不自动消失。
            if (state.unknown) item {
                BrutalCard(color = BrutalColors.Red, border = 3.dp) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("无法确认同步结果", style = MaterialTheme.typography.titleMedium)
                        Text("设备可能已经完成保存，但手机没有成功读取最终状态。重新连接并刷新关卡列表后再继续操作。")
                        BrutalOutlinedButton(onClick = picker, enabled = !state.busy && !state.preparing) { Text("重新连接") }
                    }
                }
            }
            item {
                DeviceHeroCard(state, onRefresh = { vm.operation("list") }) {
                    if (state.connected) {
                        Box {
                            IconButton(onClick = { menu = true }, enabled = !state.busy) { AppIcon("more") }
                            DropdownMenu(menu, { menu = false }, modifier = Modifier.border(2.dp, BrutalColors.Ink, RoundedCornerShape(8.dp)),
                                shape = RoundedCornerShape(8.dp), tonalElevation = 0.dp, shadowElevation = 0.dp) {
                                DropdownMenuItem(leadingIcon = { AppIcon("refresh") }, text = { Text("刷新关卡") }, onClick = { menu = false; vm.operation("list") })
                                DropdownMenuItem(text = { Text("断开连接") }, onClick = { menu = false; vm.disconnect() })
                                DropdownMenuItem(text = { Text("重新连接") }, onClick = { menu = false; vm.disconnect(); picker() })
                            }
                        }
                    }
                }
            }
            if (!state.connected) {
                item {
                    Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text("尚未连接设备", style = MaterialTheme.typography.titleMedium)
                        Text("连接 Xiaomi Smart Band 后可以管理自定义关卡",
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                        if (!state.unknown) BrutalButton(onClick = picker, enabled = !state.preparing && !state.busy,
                            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
                            AppIcon("watch"); Spacer(Modifier.width(8.dp)); Text("连接设备", fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
            } else {
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("自定义关卡", style = MaterialTheme.typography.titleMedium)
                        BrutalTag("${state.levels?.size ?: "—"} / 12", color = BrutalColors.Paper)
                    }
                }
                items(state.levels.orEmpty(), key = { it.index }) { level ->
                    LevelCard(level, Modifier.animateItem(fadeInSpec = tween(200), fadeOutSpec = tween(200), placementSpec = tween(200))) { selected = level }
                }
                if (state.levels?.isEmpty() == true) item {
                    Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text("+", fontSize = 40.sp, fontWeight = FontWeight.ExtraBold, color = BrutalColors.Ink)
                        Text("还没有自定义关卡", style = MaterialTheme.typography.titleMedium)
                        Text("创建一个迷宫并发送到设备", style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                        BrutalButton(onClick = onCreate, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
                            AppIcon("add"); Spacer(Modifier.width(8.dp)); Text("前往创建", fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
            }
            if (state.busy || state.preparing) item { LinearProgressIndicator(Modifier.fillMaxWidth(), color = BrutalColors.Ink, trackColor = BrutalColors.Yellow) }
            if (state.message.isNotBlank() && !state.unknown) item { Text(state.message, style = MaterialTheme.typography.bodyMedium) }
        }
    }
    selected?.let { level ->
        if (confirmation == null) BrutalSheet(onDismissRequest = { selected = null }) {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                BrutalTag("%02d".format(level.index + 1))
                Text("自定义关卡 %02d".format(level.index + 1), style = MaterialTheme.typography.titleLarge)
                Text("${level.cols} × ${level.rows}", style = MaterialTheme.typography.titleMedium)
                ActionRow("使用当前关卡替换", vm.editor.maze != null && state.canOperate) { confirmation = "replace" }
                BrutalButton(onClick = { confirmation = "remove" }, enabled = state.canOperate, color = BrutalColors.Red, border = 2.dp, depth = 2.dp) {
                    AppIcon("delete"); Spacer(Modifier.width(8.dp)); Text("删除关卡")
                }
                TextButton(onClick = { selected = null }) { Text("取消") }
            }
        } else {
            val remove = confirmation == "remove"
            Dialog(onDismissRequest = { confirmation = null; selected = null }) {
                BrutalCard(border = 3.dp, depth = 5.dp) {
                    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                        Text("${if (remove) "删除" else "替换"}自定义 %02d？".format(level.index + 1), style = MaterialTheme.typography.titleLarge)
                        Text(if (remove) "删除后，后面的关卡编号会自动向前移动。" else
                            "当前关卡\n${vm.editor.cols} × ${vm.editor.rows} · ${MazeViewModel.label(vm.editor.preset)}\n\n将替换：\n自定义 %02d\n${level.cols} × ${level.rows}".format(level.index + 1))
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            BrutalOutlinedButton(onClick = { confirmation = null; selected = null }, modifier = Modifier.weight(1f)) { Text("取消") }
                            BrutalButton(onClick = { vm.operation(confirmation!!, level.index); confirmation = null; selected = null },
                                enabled = state.canOperate, modifier = Modifier.weight(1f), color = if (remove) BrutalColors.Red else BrutalColors.Yellow) {
                                Text(if (remove) "删除" else "替换")
                            }
                        }
                    }
                }
            }
        }
    }
}

/** 设备状态 Hero：Level 2，设备名称与容量是主信息。 */
@Composable
fun DeviceHeroCard(state: DeviceUiState, onRefresh: () -> Unit, actions: @Composable () -> Unit) {
    BrutalCard(Modifier.fillMaxWidth().animateContentSize(tween(160)), border = 3.dp, depth = 4.dp, radius = 14.dp) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AppIcon("watch"); Spacer(Modifier.width(10.dp))
                Text(if (state.connected) state.deviceName else "等待连接设备", Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                BrutalTag(when { state.unknown -> "结果未知"; state.preparing || state.operationKind == "connecting" -> "正在连接"; state.connected -> "已连接"; else -> "未连接" },
                    color = when { state.unknown -> BrutalColors.Red; state.connected -> BrutalColors.Green; else -> BrutalColors.Muted })
                actions()
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("${state.levels?.size ?: "—"} / 12", style = MaterialTheme.typography.titleLarge)
                    Text("CUSTOM LEVELS", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (state.connected) BrutalOutlinedButton(onClick = onRefresh, enabled = state.canOperate, modifier = Modifier.width(116.dp)) {
                    AppIcon("refresh"); Spacer(Modifier.width(6.dp)); Text("刷新")
                }
            }
        }
    }
}

/** 整卡点击进入操作；右侧 chevron 仅作指示，不再是独立小按钮。 */
@Composable
fun LevelCard(level: CustomLevel, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(onClick = onClick, modifier = modifier, shape = RoundedCornerShape(10.dp),
        border = BorderStroke(2.dp, BrutalColors.Ink), color = BrutalColors.Paper,
        tonalElevation = 0.dp, shadowElevation = 0.dp) {
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 86.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.width(64.dp).fillMaxHeight().background(BrutalColors.Yellow), contentAlignment = Alignment.Center) {
                Text("%02d".format(level.index + 1), fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
            }
            VerticalDivider(Modifier.fillMaxHeight(), thickness = 2.dp, color = BrutalColors.Ink)
            Column(Modifier.weight(1f).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(level.name.ifBlank { "自定义 %02d".format(level.index + 1) }, style = MaterialTheme.typography.titleMedium)
                Text("${level.cols} × ${level.rows}", style = MaterialTheme.typography.labelLarge)
            }
            AppIcon("next", Modifier.padding(end = 14.dp))
        }
    }
}

@Composable
fun DevicePicker(vm: MazeViewModel, dismiss: () -> Unit) {
    val state = vm.device
    BrutalSheet(onDismissRequest = dismiss) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("连接设备", style = MaterialTheme.typography.headlineSmall)
            Text("已连接到小米运动健康的设备", style = MaterialTheme.typography.bodyMedium)
            if (state.scanning) LinearProgressIndicator(Modifier.fillMaxWidth())
            state.devices.forEach { node ->
                BrutalCard(depth = 2.dp) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(node.name, style = MaterialTheme.typography.titleMedium)
                        BrutalOutlinedButton(onClick = { vm.connect(node); dismiss() }, enabled = !state.scanning && !state.preparing && !state.busy) { Text("连接") }
                    }
                }
            }
            if (!state.scanning && state.devices.isEmpty()) Text("没有找到设备？请先在小米运动健康中连接设备。")
            if (state.message.isNotBlank()) Text(state.message, style = MaterialTheme.typography.bodyMedium)
            BrutalOutlinedButton(onClick = vm::scan, enabled = !state.scanning && !state.preparing && !state.busy) { AppIcon("refresh"); Spacer(Modifier.width(8.dp)); Text("重新查询") }
        }
    }
}
