package com.MarbleMaze.watch

import android.content.ClipData
import android.content.ClipboardManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider
import com.MarbleMaze.watch.ui.app.MarbleMazeApp
import com.MarbleMaze.watch.ui.app.MazeViewModel
import com.MarbleMaze.watch.ui.theme.MarbleMazeTheme
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private lateinit var model: MazeViewModel
    private var runtime: GeneratorRuntime? = null
    private var wearConnection: WearConnection? = null
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        model = ViewModelProvider(this)[MazeViewModel::class.java]
        runtime = GeneratorRuntime(this, { if (!isFinishing && !isDestroyed) model.receive(it) },
            { if (!isFinishing && !isDestroyed) model.attach(it) }, ::wearAction)
        setContent {
            MarbleMazeTheme {
                MarbleMazeApp(model, copy = { text ->
                    if (text.length <= 128 * 1024) {
                        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("迷宫关卡", text))
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
    override fun onDestroy() {
        model.detach()
        runtime?.close()
        runtime = null
        wearConnection?.close()
        wearConnection = null
        super.onDestroy()
    }
}
