package com.MarbleMaze.watch

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.MarbleMaze.watch.ui.theme.MarbleMazeTheme
import java.io.ByteArrayInputStream
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private var generatorView: WebView? = null
    private var pendingExport: String? = null
    private var wearConnection: WearConnection? = null
    private val createDocument = registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        val text = pendingExport
        pendingExport = null
        if (uri != null && text != null) {
            runCatching {
                checkNotNull(contentResolver.openOutputStream(uri)).use {
                    it.write(text.toByteArray(Charsets.UTF_8))
                }
            }.onSuccess { notifyUser("已导出") }
                .onFailure { notifyUser("导出失败，请重试") }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingExport = savedInstanceState?.getString("pendingExport")
        setContent {
            MarbleMazeTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { padding ->
                    AndroidView(
                        modifier = Modifier.fillMaxSize().padding(padding),
                        factory = { context ->
                            WebView(context).apply {
                                generatorView = this
                                settings.javaScriptEnabled = true
                                settings.allowFileAccess = false
                                settings.allowContentAccess = false
                                // 桥接仅开放给打包的离线页面，其他资源请求全部拒绝。
                                addJavascriptInterface(GeneratorBridge(), "AndroidGenerator")
                                webChromeClient = WebChromeClient()
                                webViewClient = object : WebViewClient() {
                                    override fun shouldOverrideUrlLoading(
                                        view: WebView, request: WebResourceRequest
                                    ) = true

                                    override fun shouldInterceptRequest(
                                        view: WebView, request: WebResourceRequest
                                    ): WebResourceResponse {
                                        val path = when (request.url.toString()) {
                                            "$ORIGIN/index.html" -> "generator/index.html"
                                            "$ORIGIN/tools/maze/generator-core.js" ->
                                                "generator/tools/maze/generator-core.js"
                                            "$ORIGIN/sync-client.js" -> "generator/sync-client.js"
                                            "$ORIGIN/sync-ui.js" -> "generator/sync-ui.js"
                                            else -> null
                                        }
                                        if (path == null) return WebResourceResponse(
                                            "text/plain", "UTF-8", 403, "Forbidden",
                                            emptyMap(), ByteArrayInputStream(ByteArray(0))
                                        )
                                        return WebResourceResponse(
                                            if (path.endsWith(".js")) "text/javascript" else "text/html",
                                            "UTF-8", assets.open(path)
                                        )
                                    }
                                }
                                loadUrl("$ORIGIN/index.html")
                            }
                        }
                    )
                }
            }
        }
    }

    private inner class GeneratorBridge {
        @JavascriptInterface
        fun scanDevices() = withWear { it.scan() }

        @JavascriptInterface
        fun connectWear(nodeId: String) = withWear { it.connect(nodeId) }

        @JavascriptInterface
        fun sendWear(token: Int, operationId: Int, text: String) = withWear {
            it.send(token, operationId, text)
        }

        @JavascriptInterface
        fun disconnectWear(token: Int, reason: String) {
            runOnUiThread { wearConnection?.disconnect(reason, token) }
        }

        @JavascriptInterface
        fun exportJson(name: String, text: String) {
            if (text.toByteArray(Charsets.UTF_8).size > 128 * 1024) return
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                if (pendingExport != null) {
                    notifyUser("请先完成当前导出")
                    return@runOnUiThread
                }
                pendingExport = text
                createDocument.launch(name.replace(Regex("[^a-zA-Z0-9._-]"), "_"))
            }
        }

        @JavascriptInterface
        fun copyText(text: String) {
            if (text.length > 128 * 1024) return
            runOnUiThread {
                getSystemService(ClipboardManager::class.java)
                    .setPrimaryClip(ClipData.newPlainText("迷宫关卡", text))
                notifyUser("已复制")
            }
        }
    }

    private fun notifyUser(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    private fun emitWearEvent(event: JSONObject) {
        if (!isFinishing && !isDestroyed) generatorView?.evaluateJavascript(
            "window.MazeSyncUI && window.MazeSyncUI.onNativeEvent(${event});", null
        )
    }

    // SDK 延迟到用户连接设备时初始化；服务缺失不影响离线生成器。
    private fun withWear(action: (WearConnection) -> Unit) {
        runOnUiThread {
            if (isFinishing || isDestroyed) return@runOnUiThread
            try {
                val connection = wearConnection ?: WearConnection(this, ::emitWearEvent).also {
                    wearConnection = it
                }
                action(connection)
            } catch (error: Exception) {
                emitWearEvent(JSONObject().put("type", "unavailable")
                    .put("message", "穿戴服务不可用：${error.message ?: "请检查小米运动健康"}"))
            } catch (_: LinkageError) {
                emitWearEvent(JSONObject().put("type", "unavailable")
                    .put("message", "穿戴 SDK 无法加载，请检查手机兼容性"))
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("pendingExport", pendingExport)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        wearConnection?.close()
        wearConnection = null
        generatorView?.apply {
            removeJavascriptInterface("AndroidGenerator")
            stopLoading()
            destroy()
        }
        generatorView = null
        super.onDestroy()
    }

    private companion object {
        const val ORIGIN = "https://maze.local"
    }
}
