package com.MarbleMaze.watch.ui.app

import androidx.compose.foundation.background
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.MarbleMaze.watch.ui.theme.BrutalColors
import kotlinx.coroutines.delay

@Composable
fun EditorScreen(vm: MazeViewModel, preview: () -> Unit, seed: () -> Unit, import: () -> Unit, export: () -> Unit, picker: () -> Unit, previewVariant: DeviceVariant?) {
    val state = vm.editor
    val device = vm.device
    // 快速生成不切换整组控件的外观；较慢任务才显示进度。
    var showGenerating by remember { mutableStateOf(false) }
    LaunchedEffect(state.isGenerating) {
        showGenerating = false
        if (state.isGenerating) { delay(150); showGenerating = true }
    }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Spacer(Modifier.height(2.dp))
            PageHeader("MARBLE MAZE / CREATE", "创建关卡", "生成并同步你的自定义迷宫")
            // Hero：Level 2，页面主要视觉焦点；整卡点击进入完整预览。
            BrutalCard(Modifier.fillMaxWidth(), border = 3.dp, depth = 4.dp, radius = 14.dp) {
                Column(Modifier.fillMaxWidth().clickable(enabled = state.maze != null && !state.isGenerating, onClickLabel = "查看完整预览", onClick = preview).padding(14.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        BrutalTag(devicePreviewLabel(state.profile, previewVariant))
                        Text(MazeViewModel.label(state.preset), style = MaterialTheme.typography.labelLarge)
                    }
                    DevicePreview(state.maze, Modifier.fillMaxWidth().height(320.dp), previewVariant, state.seed, profile = state.profile)
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("${state.cols} × ${state.rows}", fontWeight = FontWeight.ExtraBold, maxLines = 1)
                        Spacer(Modifier.width(12.dp))
                        Text("SEED ${state.seed}", Modifier.weight(1f), style = MaterialTheme.typography.labelLarge,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                        // 小型随机生成：编辑动作，不与「添加到设备」竞争一级视觉权重。
                        BrutalIconButton(onClick = { if (!state.isGenerating) vm.generate() },
                            loading = showGenerating, contentDescription = "随机生成") { AppIcon("shuffle") }
                    }
                }
            }
            Text("目标设备", style = MaterialTheme.typography.titleMedium)
            val profileOptions = remember { listOf(NeoJellyRadioItem("BAND"), NeoJellyRadioItem("PRO")) }
            NeoJellyRadioGroup(profileOptions, if (state.profile == "pro") 1 else 0, { index ->
                vm.selectProfile(if (index == 1) "pro" else "band")
            })
            if (device.connected) Text("当前设备 · ${device.deviceName} · ${state.deviceVariant?.profile ?: "型号未识别"}", style = MaterialTheme.typography.bodySmall)
            Text("难度", style = MaterialTheme.typography.titleMedium)
            DifficultySelector(state.preset, select = vm::preset)
            Text("Seed", style = MaterialTheme.typography.titleMedium)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                BrutalOutlinedButton(onClick = seed, loading = state.isGenerating, modifier = Modifier.weight(1f)) { Text("${state.seed}", style = MaterialTheme.typography.titleMedium) }
                BrutalOutlinedButton(onClick = vm::incrementSeed, loading = state.isGenerating, modifier = Modifier.width(68.dp)) { Text("+1") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                BrutalOutlinedButton(onClick = import, loading = state.isGenerating, modifier = Modifier.weight(1f)) { AppIcon("download"); Text("导入参数") }
                BrutalOutlinedButton(onClick = export, enabled = state.maze != null, loading = state.isGenerating, modifier = Modifier.weight(1f)) { AppIcon("upload"); Text("复制参数") }
            }
            ErrorDetails(state.error, state.detail)
            Spacer(Modifier.height(2.dp))
        }
        // Sticky 主操作：固定在底部导航上方，不跟随滚动，不遮挡内容。
        HorizontalDivider(thickness = 2.dp, color = BrutalColors.Ink)
        Box(Modifier.fillMaxWidth().background(BrutalColors.Background).imePadding().padding(horizontal = 16.dp, vertical = 12.dp)) {
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
                    Spacer(Modifier.width(8.dp)); Text("${device.levels.size} / 12", fontWeight = FontWeight.ExtraBold)
                }
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
    var cols by remember { mutableStateOf(vm.editor.cols.toString()) }
    var rows by remember { mutableStateOf(vm.editor.rows.toString()) }
    var seed by remember { mutableStateOf(vm.editor.seed?.toString() ?: "") }
    var clipboardError by remember { mutableStateOf(false) }
    val parsedCols = cols.toIntOrNull()?.takeIf { it in 1..99 }
    val parsedRows = rows.toIntOrNull()?.takeIf { it in 1..99 }
    val parsedSeed = seed.toLongOrNull()?.takeIf { it in 0..4294967295L }
    LaunchedEffect(vm.editor.imported) { if (vm.editor.imported) { vm.consumeImport(); dismiss() } }
    BrutalSheet(onDismissRequest = dismiss) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("导入关卡", style = MaterialTheme.typography.headlineSmall)
            Text("尺寸", style = MaterialTheme.typography.labelLarge)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                BrutalTextField(cols, { cols = it.filter { ch -> ch.isDigit() }.take(2); clipboardError = false }, singleLine = true, isError = parsedCols == null,
                    placeholder = { Text("列数") }, modifier = Modifier.weight(1f), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                Text("×", style = MaterialTheme.typography.titleMedium)
                BrutalTextField(rows, { rows = it.filter { ch -> ch.isDigit() }.take(2); clipboardError = false }, singleLine = true, isError = parsedRows == null,
                    placeholder = { Text("行数") }, modifier = Modifier.weight(1f), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            }
            BrutalTextField(seed, { seed = it.filter { ch -> ch.isDigit() }.take(10); clipboardError = false }, label = { Text("Seed") }, singleLine = true,
                isError = parsedSeed == null, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            TextButton(onClick = {
                val match = Regex("^(\\d+)x(\\d+)@(\\d+)$").matchEntire(paste().trim())
                if (match != null) {
                    cols = match.groupValues[1]; rows = match.groupValues[2]; seed = match.groupValues[3]
                    clipboardError = false
                } else clipboardError = true
            }) { AppIcon("download"); Spacer(Modifier.width(6.dp)); Text("从剪贴板读取") }
            if (clipboardError) Text("剪贴板中没有可识别的关卡参数（例如 8x15@38291627）", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            ErrorDetails(vm.editor.error, vm.editor.detail)
            BrutalButton(onClick = { vm.importSpec("${parsedCols}x${parsedRows}@${parsedSeed}") },
                enabled = parsedCols != null && parsedRows != null && parsedSeed != null && !vm.editor.isGenerating,
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("生成关卡", fontWeight = FontWeight.ExtraBold) }
        }
    }
}
