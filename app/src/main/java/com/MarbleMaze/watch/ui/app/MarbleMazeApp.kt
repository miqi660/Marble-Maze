package com.MarbleMaze.watch.ui.app

import androidx.activity.compose.BackHandler
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
                    BrutalCard(Modifier.fillMaxWidth().weight(1f), border = 3.dp, depth = 4.dp) {
                        DevicePreview(vm.editor.maze, Modifier.fillMaxSize(), previewVariant, vm.editor.seed, showPath, vm.editor.profile)
                    }
                    Spacer(Modifier.height(16.dp))
                    BrutalButton(onClick = { showPath = !showPath }, color = if (showPath) BrutalColors.Yellow else BrutalColors.Paper, border = 2.dp, depth = 2.dp) {
                        AppIcon("route"); Spacer(Modifier.width(8.dp)); Text(if (showPath) "最短路径 · 已显示" else "最短路径 · 已隐藏")
                    }
                    Text("${vm.editor.cols} × ${vm.editor.rows} · ${MazeViewModel.label(vm.editor.preset)}", Modifier.padding(24.dp))
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
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Text("关卡信息", style = MaterialTheme.typography.headlineSmall)
        BrutalCard(Modifier.fillMaxWidth(), border = 3.dp, depth = 4.dp) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                BrutalTag(state.profile.uppercase())
                Text("${maze.cols} × ${maze.rows}", style = MaterialTheme.typography.headlineSmall)
                Text("难度    ${MazeViewModel.label(state.preset)}", style = MaterialTheme.typography.titleMedium)
                Text("Seed    ${state.seed}", style = MaterialTheme.typography.titleMedium)
                Text("最短路径    ${maze.steps} 步")
            }
        }
        var expanded by remember { mutableStateOf(false) }
        BrutalOutlinedButton(onClick = { expanded = !expanded }) { Text(if (expanded) "收起技术信息" else "技术信息") }
        if (expanded) BrutalCard(depth = 0.dp) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Maze ID\n${maze.id}")
                Text("Payload    ${maze.bytes} B")
                Text("CRC32    ${maze.crc}")
                Text("Render Runs    ${maze.runs}")
            }
        }
    }
}
