package com.MarbleMaze.watch.ui.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

@Composable
fun EditorScreen(vm: MazeViewModel, preview: () -> Unit, seed: () -> Unit, parameters: () -> Unit, import: () -> Unit) {
    val state = vm.editor
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("创建关卡", style = MaterialTheme.typography.headlineSmall)
        Surface(onClick = preview, enabled = state.maze != null && !state.isGenerating, shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp)) {
            MazePreview(state.maze, Modifier.fillMaxWidth().height(330.dp))
        }
        if (state.isGenerating) LinearProgressIndicator(Modifier.fillMaxWidth())
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(MazeViewModel.label(state.preset), style = MaterialTheme.typography.titleMedium)
            Text("${state.cols} × ${state.rows}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = seed, enabled = !state.isGenerating, modifier = Modifier.weight(1f)) {
                Text(state.seed?.let { "Seed $it" } ?: "Seed 未包含在导入关卡中")
            }
            TextButton(onClick = vm::incrementSeed, enabled = !state.isGenerating) { Text("+1") }
        }
        DifficultySelector(state.preset, !state.isGenerating, vm::preset)
        Button(onClick = { vm.generate() }, enabled = !state.isGenerating,
            shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.onPrimaryContainer),
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("随机生成") }
        ErrorDetails(state.error, state.detail)
        Column {
            ActionRow("参数", !state.isGenerating, parameters)
            HorizontalDivider()
            ActionRow("导入关卡", !state.isGenerating, import)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GeneratorSheet(vm: MazeViewModel, seedOnly: Boolean, dismiss: () -> Unit) {
    var cols by remember { mutableIntStateOf(vm.editor.cols) }
    var rows by remember { mutableIntStateOf(vm.editor.rows) }
    var seed by remember { mutableStateOf((vm.editor.seed ?: vm.randomSeed()).toString()) }
    val parsed = seed.toLongOrNull()?.takeIf { it in 0..4294967295L }
    val preset = MazeViewModel.presets.entries.find { it.value == cols to rows }?.key ?: "custom"
    ModalBottomSheet(onDismissRequest = dismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(if (seedOnly) "设置 Seed" else "生成参数", style = MaterialTheme.typography.headlineSmall)
            if (!seedOnly) {
                Text("难度")
                DifficultySelector(preset) { val value = MazeViewModel.presets.getValue(it); cols = value.first; rows = value.second }
                Text("尺寸", style = MaterialTheme.typography.titleMedium)
                Stepper("列", cols, 7..11) { cols = it }
                Stepper("行", rows, 13..20) { rows = it }
                if (preset == "custom") Text("自定义尺寸", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedTextField(seed, { seed = it }, label = { Text("Seed") }, singleLine = true,
                isError = parsed == null, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
            Text("使用相同 Seed 和相同尺寸，可以重新生成相同迷宫。", style = MaterialTheme.typography.bodyMedium)
            if (parsed == null) Text("请输入有效 Seed。", color = MaterialTheme.colorScheme.error)
            TextButton(onClick = { seed = vm.randomSeed().toString() }) { Text("随机 Seed") }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = dismiss) { Text("取消") }
                Button(onClick = { parsed?.let { vm.generate(cols, rows, it); dismiss() } }, enabled = parsed != null) { Text("应用") }
            }
        }
    }
}

@Composable
private fun Stepper(label: String, value: Int, range: IntRange, change: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        OutlinedButton(onClick = { change(value - 1) }, enabled = value > range.first) { Text("−") }
        Text(value.toString(), Modifier.padding(horizontal = 24.dp))
        OutlinedButton(onClick = { change(value + 1) }, enabled = value < range.last) { Text("+") }
    }
}

@Composable
fun ImportScreen(vm: MazeViewModel, paste: () -> String) {
    var text by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf("") }
    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Text("MazeDefinition JSON", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(text, { if (it.length <= 128 * 1024) text = it }, modifier = Modifier.fillMaxWidth().heightIn(min = 260.dp),
            placeholder = { Text("在此粘贴关卡 JSON") }, enabled = !vm.editor.isGenerating)
        OutlinedButton(onClick = { val value = paste(); if (value.length <= 128 * 1024) text = value else vm.notify("关卡文件过大，无法导入。") }, modifier = Modifier.fillMaxWidth()) { Text("从剪贴板粘贴") }
        Button(onClick = { vm.importMaze(text) }, enabled = text.isNotBlank() && !vm.editor.isGenerating, modifier = Modifier.fillMaxWidth()) { Text("校验并导入") }
        if (vm.editor.isGenerating) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (vm.editor.error != null) Text("无法导入关卡", style = MaterialTheme.typography.titleMedium)
        ErrorDetails(vm.editor.error, vm.editor.detail)
    }
}
