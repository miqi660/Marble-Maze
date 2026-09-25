package com.MarbleMaze.watch

import android.content.ClipData
import android.content.ClipboardManager
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.ViewModelProvider
import com.MarbleMaze.watch.ui.app.MarbleMazeApp
import com.MarbleMaze.watch.ui.app.MazeViewModel
import com.MarbleMaze.watch.ui.theme.MarbleMazeTheme
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private lateinit var model: MazeViewModel
    private var runtime: GeneratorRuntime? = null
    private var pendingExport: String? = null
    private var wearConnection: WearConnection? = null
    private val createDocument = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val text = pendingExport
        pendingExport = null
        if (uri != null && text != null) {
            runCatching { checkNotNull(contentResolver.openOutputStream(uri)).use { it.write(text.toByteArray(Charsets.UTF_8)) } }
                .onSuccess { Toast.makeText(this, "已导出", Toast.LENGTH_SHORT).show() }
                .onFailure { model.notify("导出失败，请重试。") }
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        pendingExport = savedInstanceState?.getString("pendingExport")
        model = ViewModelProvider(this)[MazeViewModel::class.java]
        runtime = GeneratorRuntime(this, { if (!isFinishing && !isDestroyed) model.receive(it) },
            { if (!isFinishing && !isDestroyed) model.attach(it) }, ::wearAction)
        setContent {
            MarbleMazeTheme {
                MarbleMazeApp(model, copy = { text ->
                    if (text.length <= 128 * 1024) {
                        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("迷宫关卡", text))
                        Toast.makeText(this, "已复制", Toast.LENGTH_SHORT).show()
                    }
                }, export = { maze ->
                    if (!isFinishing && !isDestroyed && maze.json.toByteArray(Charsets.UTF_8).size <= 128 * 1024) {
                        if (pendingExport != null) model.notify("请先完成当前导出。")
                        else { pendingExport = maze.json; createDocument.launch(maze.id.replace(Regex("[^a-zA-Z0-9._-]"), "_") + ".json") }
                    }
                }, paste = {
                    getSystemService(ClipboardManager::class.java).primaryClip?.let {
                        if (it.itemCount > 0) it.getItemAt(0).coerceToText(this)?.toString().orEmpty() else ""
                    }.orEmpty()
                })
            }
        }
    }
    // SDK 仍按需初始化；Compose 无法直接访问 SDK 或 WebView。
    private fun wearAction(action: String, text: String, token: Int, id: Int) {
        if (isFinishing || isDestroyed) return
        if (action == "disconnect") { wearConnection?.disconnect(text, token); return }
        try {
            val connection = wearConnection ?: WearConnection(this) { event ->
                if (!isFinishing && !isDestroyed) runtime?.event(event)
            }.also { wearConnection = it }
            when (action) {
                "scan" -> connection.scan()
                "connect" -> connection.connect(text)
                "send" -> connection.send(token, id, text)
            }
        } catch (_: Exception) {
            runtime?.event(JSONObject().put("type", "unavailable").put("message", "设备服务不可用，请检查小米运动健康。"))
        } catch (_: LinkageError) {
            runtime?.event(JSONObject().put("type", "unavailable").put("message", "穿戴 SDK 无法加载，请检查手机兼容性"))
        }
    }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("pendingExport", pendingExport)
        super.onSaveInstanceState(outState)
    }
    override fun onDestroy() {
        model.detach()
        runtime?.close()
        runtime = null
        wearConnection?.close()
        wearConnection = null
        super.onDestroy()
    }
}
