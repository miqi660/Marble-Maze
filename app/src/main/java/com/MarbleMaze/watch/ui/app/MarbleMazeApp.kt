package com.MarbleMaze.watch.ui.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import com.MarbleMaze.watch.ui.theme.BrutalColors
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MarbleMazeApp(vm: MazeViewModel, copy: (String) -> Unit, paste: () -> String) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var page by rememberSaveable { mutableStateOf("") }
    var sheet by remember { mutableStateOf("") }
    var menu by remember { mutableStateOf(false) }
    val previewVariant = vm.editor.deviceVariant
    var showPath by rememberSaveable { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }
    BackHandler(page.isNotEmpty()) { page = "" }
    LaunchedEffect(vm.notice) { vm.notice?.let { snackbar.showSnackbar(it); vm.notify(null) } }
    Scaffold(topBar = {
        // 根页面标题已进入页面内容；只有二级页面保留 TopBar。
        if (page.isNotEmpty()) TopAppBar(modifier = Modifier.border(2.dp, BrutalColors.Ink), colors = TopAppBarDefaults.topAppBarColors(containerColor = BrutalColors.Paper),
            title = { Text(if (page == "preview") "预览" else "关卡信息") },
            navigationIcon = { TextButton(onClick = { page = if (page == "details") "preview" else "" }) { AppIcon("back") } },
            actions = {
                if (page == "preview") Box {
                    TextButton(onClick = { menu = true }) { AppIcon("more") }
                    DropdownMenu(menu, { menu = false }, modifier = Modifier.border(2.dp, BrutalColors.Ink, RoundedCornerShape(8.dp)), shape = RoundedCornerShape(8.dp), tonalElevation = 0.dp, shadowElevation = 0.dp) {
                        DropdownMenuItem(text = { Text("查看关卡信息") }, onClick = { page = "details"; menu = false })
                    }
                }
            })
    }, bottomBar = {
        if (page.isEmpty()) Surface(color = BrutalColors.Background) {
            Column(Modifier.navigationBarsPadding()) {
                HorizontalDivider(thickness = 2.dp, color = BrutalColors.Ink)
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    BrutalNavigationItem("创建", "maze", tab == 0, { tab = 0 }, Modifier.weight(1f))
                    BrutalNavigationItem("设备", "watch", tab == 1, { tab = 1 }, Modifier.weight(1f))
                }
            }
        }
    }, snackbarHost = { SnackbarHost(snackbar) { data ->
        BrutalCard(Modifier.padding(16.dp), color = BrutalColors.Yellow, border = 2.dp) {
            Text(data.visuals.message, Modifier.fillMaxWidth().padding(16.dp), style = MaterialTheme.typography.labelLarge)
        }
    } }) { padding ->
        Box(Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding)) {
            when (page) {
                "preview" -> Column(Modifier.fillMaxSize().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("目标设备", Modifier.fillMaxWidth(), style = MaterialTheme.typography.labelLarge)
                    val profileOptions = remember { listOf(NeoJellyRadioItem("BAND"), NeoJellyRadioItem("PRO")) }
                    NeoJellyRadioGroup(profileOptions, if (vm.editor.profile == "pro") 1 else 0, { index ->
                        vm.selectProfile(if (index == 1) "pro" else "band")
                    })
                    BrutalCard(Modifier.fillMaxWidth().weight(1f), border = 3.dp, depth = 4.dp) {
                        DevicePreview(vm.editor.maze, Modifier.fillMaxSize(), previewVariant, vm.editor.seed, showPath, vm.editor.profile)
                    }
                    Spacer(Modifier.height(12.dp))
                    Text("预览模式", Modifier.fillMaxWidth(), style = MaterialTheme.typography.labelLarge)
                    val previewOptions = remember { listOf(NeoJellyRadioItem("标准"), NeoJellyRadioItem("路径")) }
                    NeoJellyRadioGroup(previewOptions, if (showPath) 1 else 0, { showPath = it == 1 })
                    Text("${vm.editor.cols} × ${vm.editor.rows} · ${MazeViewModel.label(vm.editor.preset)}", Modifier.padding(18.dp))
                }
                "details" -> LevelDetails(vm.editor)
                else -> if (tab == 0) EditorScreen(vm, { page = "preview" }, { sheet = "seed" }, { sheet = "importSpec" }, {
                    copy("${vm.editor.cols}x${vm.editor.rows}@${vm.editor.seed}")
                    vm.notify("已复制\n${vm.editor.cols} × ${vm.editor.rows} · Seed ${vm.editor.seed}")
                }, { sheet = "devices"; vm.scan() }, previewVariant)
                    else DeviceScreen(vm, { sheet = "devices"; vm.scan() }, onCreate = { tab = 0 })
            }
        }
    }
    when (sheet) {
        "seed" -> SeedSheet(vm) { sheet = "" }
        "importSpec" -> ImportSpecSheet(vm, paste) { sheet = "" }
        "devices" -> DevicePicker(vm) { sheet = "" }
    }
}

@Composable
private fun LevelDetails(state: EditorUiState) {
    val maze = state.maze ?: return
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("当前迷宫 · ${state.profile.uppercase()}", style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        BrutalCard(Modifier.fillMaxWidth(), color = BrutalColors.Yellow, border = 3.dp, depth = 4.dp, radius = 10.dp) {
            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        BrutalTag(state.profile.uppercase(), color = BrutalColors.Paper)
                        Text("${maze.cols} × ${maze.rows}", style = MaterialTheme.typography.headlineSmall, maxLines = 1)
                        Text("迷宫规格", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    MazeThumbnail(maze, Modifier.size(width = 112.dp, height = 164.dp))
                }
                HorizontalDivider(thickness = 2.dp, color = BrutalColors.Ink)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    LevelMetric("难度", MazeViewModel.label(state.preset), Modifier.weight(1f))
                    LevelMetric("最短路径", "${maze.steps} 步", Modifier.weight(1f))
                    LevelMetric("运行段", "${maze.runs}", Modifier.weight(1f))
                }
            }
        }
        BrutalCard(Modifier.fillMaxWidth(), border = 2.dp, depth = 2.dp, radius = 8.dp) {
            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("生成参数", style = MaterialTheme.typography.titleMedium)
                DetailRow("Seed", state.seed?.toString() ?: "—")
                DetailRow("规格", "${maze.cols} 列 × ${maze.rows} 行")
            }
        }
        var expanded by rememberSaveable { mutableStateOf(false) }
        BrutalCard(Modifier.fillMaxWidth(), border = 2.dp, depth = 2.dp, radius = 8.dp) {
            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("技术信息", style = MaterialTheme.typography.titleMedium)
                        Text("ID、载荷与校验值", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    BrutalOutlinedButton(onClick = { expanded = !expanded }, modifier = Modifier.width(88.dp)) {
                        Text(if (expanded) "收起" else "查看")
                    }
                }
                if (expanded) {
                    HorizontalDivider(thickness = 2.dp, color = BrutalColors.Ink)
                    DetailRow("Maze ID", maze.id)
                    DetailRow("Payload", "${maze.bytes} B")
                    DetailRow("CRC32", maze.crc)
                }
            }
        }
    }
}

@Composable
private fun LevelMetric(label: String, value: String, modifier: Modifier = Modifier) {
    BrutalCard(modifier, color = BrutalColors.Paper, border = 2.dp, depth = 1.dp, radius = 6.dp) {
        Column(Modifier.fillMaxWidth().heightIn(min = 68.dp).padding(horizontal = 8.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(value, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(0.8f), style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(value, Modifier.weight(1.2f), style = MaterialTheme.typography.bodyMedium,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun MazeThumbnail(maze: MazeDefinition, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(6.dp)
    Canvas(modifier
        .background(BrutalColors.Paper, shape)
        .border(2.dp, BrutalColors.Ink, shape)
        .padding(8.dp)
        .semantics { contentDescription = "${maze.cols} 列 ${maze.rows} 行迷宫缩略图" }) {
        val cols = maze.cols.coerceAtLeast(1)
        val rows = maze.rows.coerceAtLeast(1)
        val cellWidth = size.width / cols
        val cellHeight = size.height / rows
        val wallWidth = 1.5.dp.toPx()
        drawRect(BrutalColors.Ink, style = Stroke(wallWidth))
        maze.horizontal.chunked(3).forEach { (x, y, length) ->
            drawLine(BrutalColors.Ink,
                Offset(x * cellWidth, y * cellHeight),
                Offset((x + length) * cellWidth, y * cellHeight), wallWidth)
        }
        maze.vertical.chunked(3).forEach { (x, y, length) ->
            drawLine(BrutalColors.Ink,
                Offset(x * cellWidth, y * cellHeight),
                Offset(x * cellWidth, (y + length) * cellHeight), wallWidth)
        }
        fun center(index: Int) = Offset((index % cols + .5f) * cellWidth, (index / cols + .5f) * cellHeight)
        val markerRadius = minOf(cellWidth, cellHeight) * .28f
        drawCircle(BrutalColors.Green, markerRadius, center(maze.start))
        drawCircle(BrutalColors.Red, markerRadius, center(maze.goal))
    }
}
