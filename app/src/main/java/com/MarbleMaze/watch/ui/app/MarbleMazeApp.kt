package com.MarbleMaze.watch.ui.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MarbleMazeApp(vm: MazeViewModel, copy: (String) -> Unit, export: (MazeDefinition) -> Unit, paste: () -> String) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var page by rememberSaveable { mutableStateOf("") }
    var sheet by remember { mutableStateOf("") }
    var menu by remember { mutableStateOf(false) }
    var showPath by rememberSaveable { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }
    BackHandler(page.isNotEmpty()) { page = "" }
    LaunchedEffect(vm.editor.imported) {
        if (vm.editor.imported) {
            vm.consumeImport()
            if (page == "import") { page = ""; tab = 0; vm.notify("已导入关卡") }
        }
    }
    LaunchedEffect(vm.notice) { vm.notice?.let { snackbar.showSnackbar(it); vm.notify(null) } }
    Scaffold(topBar = {
        TopAppBar(title = { Text(when (page) { "preview" -> "预览"; "import" -> "导入关卡"; "details" -> "关卡信息"; else -> "弹珠迷宫" }) },
            navigationIcon = { if (page.isNotEmpty()) TextButton(onClick = { page = if (page == "details") "preview" else "" }) { Text("‹", fontSize = 30.sp) } },
            actions = {
                if (page == "preview") Box {
                    TextButton(onClick = { menu = true }) { Text("⋮", fontSize = 24.sp) }
                    DropdownMenu(menu, { menu = false }) {
                        DropdownMenuItem(text = { Text(if (showPath) "隐藏最短路径" else "显示最短路径") }, onClick = { showPath = !showPath; menu = false })
                        DropdownMenuItem(text = { Text("查看关卡信息") }, onClick = { page = "details"; menu = false })
                        DropdownMenuItem(text = { Text("导出 JSON") }, onClick = { vm.editor.maze?.let(export); menu = false })
                        DropdownMenuItem(text = { Text("复制 JSON") }, onClick = { vm.editor.maze?.let { copy(it.json) }; menu = false })
                    }
                }
            })
    }, bottomBar = {
        if (page.isEmpty()) NavigationBar {
            NavigationBarItem(selected = tab == 0, onClick = { tab = 0 }, icon = { Text("▦", fontSize = 24.sp) }, label = { Text("生成") })
            NavigationBarItem(selected = tab == 1, onClick = { tab = 1 }, icon = { Text("◉", fontSize = 24.sp) }, label = { Text("设备") })
        }
    }, snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Box(Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding)) {
            when (page) {
                "import" -> ImportScreen(vm, paste)
                "preview" -> Column(Modifier.fillMaxSize().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    MazePreview(vm.editor.maze, Modifier.fillMaxWidth().weight(1f), showPath)
                    Text("${vm.editor.cols} × ${vm.editor.rows} · ${MazeViewModel.label(vm.editor.preset)}", Modifier.padding(24.dp))
                }
                "details" -> LevelDetails(vm.editor)
                else -> if (tab == 0) EditorScreen(vm, { page = "preview" }, { sheet = "seed" }, { sheet = "parameters" }, { page = "import" })
                    else DeviceScreen(vm, { tab = 0 }, { sheet = "devices"; vm.scan() })
            }
        }
    }
    when (sheet) {
        "seed", "parameters" -> GeneratorSheet(vm, sheet == "seed") { sheet = "" }
        "devices" -> DevicePicker(vm) { sheet = "" }
    }
}

@Composable
private fun LevelDetails(state: EditorUiState) {
    val maze = state.maze ?: return
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Text("尺寸    ${maze.cols} × ${maze.rows}")
        Text("难度    ${MazeViewModel.label(state.preset)}")
        Text("Seed    ${state.seed?.toString() ?: "导入文件未提供"}")
        Text("最短路径    ${maze.steps} 步")
        HorizontalDivider()
        Text("技术信息", style = MaterialTheme.typography.titleMedium)
        Text("Maze ID\n${maze.id}")
        Text("Payload    ${maze.bytes} B")
        Text("CRC32    ${maze.crc}")
        Text("Render Runs    ${maze.runs}")
    }
}
