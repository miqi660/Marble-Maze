package com.MarbleMaze.watch.ui.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.clickable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

@Composable
fun EditorScreen(vm: MazeViewModel, preview: () -> Unit, seed: () -> Unit, import: () -> Unit, export: () -> Unit, picker: () -> Unit, previewVariant: DeviceVariant?) {
    val state = vm.editor
    val device = vm.device
    // 快速生成不切换整组控件的外观；较慢任务才显示进度文案。
    var showGenerating by remember { mutableStateOf(false) }
    LaunchedEffect(state.isGenerating) {
        showGenerating = false
        if (state.isGenerating) { delay(150); showGenerating = true }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("创建关卡", style = MaterialTheme.typography.headlineSmall)
        BrutalCard(Modifier.fillMaxWidth(), border = 3.dp, depth = 4.dp, radius = 14.dp) {
            Column(Modifier.fillMaxWidth().clickable(enabled = state.maze != null && !state.isGenerating, onClickLabel = "查看完整预览", onClick = preview).padding(14.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    BrutalTag(devicePreviewLabel(state.profile, previewVariant))
                    Text(MazeViewModel.label(state.preset), style = MaterialTheme.typography.labelLarge)
                }
                DevicePreview(state.maze, Modifier.fillMaxWidth().height(360.dp), previewVariant, state.seed, profile = state.profile)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${state.cols} × ${state.rows}", fontWeight = FontWeight.ExtraBold)
                    Text("SEED ${state.seed}", style = MaterialTheme.typography.labelLarge)
                }
            }
        }
        Text("目标设备", style = MaterialTheme.typography.titleMedium)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            listOf("band", "pro").forEach { profile ->
                BrutalSegment(profile.uppercase(), state.profile == profile, { vm.selectProfile(profile) }, Modifier.weight(1f), loading = state.isGenerating)
            }
        }
        if (device.connected) Text("当前设备 · ${device.deviceName} · ${state.deviceVariant?.profile ?: "型号未识别"}", style = MaterialTheme.typography.bodySmall)
        Text("难度", style = MaterialTheme.typography.titleMedium)
        DifficultySelector(state.preset, loading = state.isGenerating, select = vm::preset)
        Text("Seed", style = MaterialTheme.typography.titleMedium)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            BrutalOutlinedButton(onClick = seed, loading = state.isGenerating, modifier = Modifier.weight(1f)) { Text("${state.seed}", style = MaterialTheme.typography.titleMedium) }
            BrutalOutlinedButton(onClick = vm::incrementSeed, loading = state.isGenerating, modifier = Modifier.width(68.dp)) { Text("+1") }
        }
        BrutalButton(onClick = { vm.generate() }, loading = state.isGenerating, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
            AppIcon("shuffle"); Spacer(Modifier.width(12.dp))
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("RANDOMIZE", style = MaterialTheme.typography.titleMedium)
                Text(if (showGenerating) "正在生成…" else "随机生成")
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BrutalOutlinedButton(onClick = import, loading = state.isGenerating, modifier = Modifier.weight(1f)) { AppIcon("download"); Text("导入参数") }
            BrutalOutlinedButton(onClick = export, enabled = state.maze != null, loading = state.isGenerating, modifier = Modifier.weight(1f)) { AppIcon("upload"); Text("导出参数") }
        }
        ErrorDetails(state.error, state.detail)
        val full = (device.levels?.size ?: 0) >= 12
        BrutalButton(onClick = { if (!device.connected || device.unknown) picker() else vm.operation("add") },
            enabled = if (!device.connected || device.unknown) !device.busy && !device.preparing else !full && device.canOperate && state.maze != null,
            loading = state.isGenerating,
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
            AppIcon("add"); Spacer(Modifier.width(8.dp))
            Text(when {
                device.operationKind == "adding" -> "正在发送…"
                device.preparing || device.operationKind == "connecting" -> "正在连接…"
                !device.connected -> "连接设备后添加"
                device.unknown -> "重新连接并核对关卡"
                full -> "关卡已满 · 12 / 12"
                device.levels == null -> "正在读取关卡…"
                else -> "添加到 ${device.deviceName}"
            }, Modifier.weight(1f), fontWeight = FontWeight.ExtraBold)
            if (device.connected && !full && device.levels != null) {
                Spacer(Modifier.width(8.dp)); Text("${device.levels.size}/12", fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SeedSheet(vm: MazeViewModel, dismiss: () -> Unit) {
    var seed by remember { mutableStateOf(vm.editor.seed.toString()) }
    val parsed = seed.toLongOrNull()?.takeIf { it in 0..4294967295L }
    BrutalSheet(onDismissRequest = dismiss) {
        Column(Modifier.fillMaxWidth().imePadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("设置 Seed", style = MaterialTheme.typography.headlineSmall)
            BrutalTextField(seed, { seed = it }, label = { Text("Seed") }, singleLine = true,
                isError = parsed == null, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
            Text("Seed 范围：0 ～ 4294967295")
            BrutalButton(onClick = { parsed?.let { vm.generate(seed = it); dismiss() } }, enabled = parsed != null && !vm.editor.isGenerating, modifier = Modifier.fillMaxWidth()) { Text("应用") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ImportSpecSheet(vm: MazeViewModel, paste: () -> String, dismiss: () -> Unit) {
    var text by remember { mutableStateOf("") }
    var cols by remember { mutableStateOf(vm.editor.cols.toString()) }
    var rows by remember { mutableStateOf(vm.editor.rows.toString()) }
    var seed by remember { mutableStateOf(vm.editor.seed.toString()) }
    fun update(value: String) {
        text = value.take(128)
        Regex("^(\\d+)x(\\d+)@(\\d+)$").matchEntire(text.trim())?.let {
            cols = it.groupValues[1]; rows = it.groupValues[2]; seed = it.groupValues[3]
        }
    }
    LaunchedEffect(vm.editor.imported) { if (vm.editor.imported) { vm.consumeImport(); dismiss() } }
    BrutalSheet(onDismissRequest = dismiss) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("导入关卡", style = MaterialTheme.typography.headlineSmall)
            BrutalTextField(text, ::update, label = { Text("关卡参数") }, placeholder = { Text("12x10@38291627") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            TextButton(onClick = { update(paste()) }) { Text("从剪贴板粘贴") }
            Text("或者")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                BrutalTextField(cols, { cols = it; text = "" }, label = { Text("列数") }, singleLine = true, modifier = Modifier.weight(1f), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                BrutalTextField(rows, { rows = it; text = "" }, label = { Text("行数") }, singleLine = true, modifier = Modifier.weight(1f), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            }
            BrutalTextField(seed, { seed = it; text = "" }, label = { Text("Seed") }, singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            ErrorDetails(vm.editor.error, vm.editor.detail)
            BrutalButton(onClick = { vm.importSpec(text.ifBlank { "${cols}x${rows}@${seed}" }) }, enabled = !vm.editor.isGenerating, modifier = Modifier.fillMaxWidth()) { Text("生成关卡") }
        }
    }
}
