package com.MarbleMaze.watch

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import org.json.JSONObject

/** 无可见页面的离线兼容层。仅允许包内核心脚本，生命周期由 Activity 管理。 */
@SuppressLint("SetJavaScriptEnabled")
class GeneratorRuntime(
    context: Context,
    private val receive: (String) -> Unit,
    private val ready: ((JSONObject) -> Unit) -> Unit,
    private val wear: (String, String, Int, Int) -> Unit
) {
    private val handler = Handler(Looper.getMainLooper())
    private var closed = false
    private val view = WebView(context)
    init {
        view.settings.apply {
            javaScriptEnabled = true
            allowFileAccess = false
            allowContentAccess = false
        }
        view.addJavascriptInterface(Bridge(), "AndroidGenerator")
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                val path = when (request.url.toString()) {
                    "$ORIGIN/native-runtime.html" -> "generator/native-runtime.html"
                    "$ORIGIN/native-runtime.js" -> "generator/native-runtime.js"
                    "$ORIGIN/tools/maze/generator-core.js" -> "generator/tools/maze/generator-core.js"
                    "$ORIGIN/sync-client.js" -> "generator/sync-client.js"
                    else -> null
                }
                if (path == null) return WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(ByteArray(0)))
                return WebResourceResponse(if (path.endsWith(".js")) "text/javascript" else "text/html", "UTF-8", context.assets.open(path))
            }
            override fun onPageFinished(view: WebView, url: String) {
                if (!closed && url == "$ORIGIN/native-runtime.html") ready(::command)
            }
        }
        view.loadUrl("$ORIGIN/native-runtime.html")
    }
    private inner class Bridge {
        @JavascriptInterface fun publish(text: String) {
            if (text.length <= 256 * 1024) handler.post { if (!closed) receive(text) }
        }
        @JavascriptInterface fun scanDevices() = invoke("scan", "", 0, 0)
        @JavascriptInterface fun connectWear(id: String) = invoke("connect", id, 0, 0)
        @JavascriptInterface fun sendWear(token: Int, operationId: Int, text: String) {
            if (text.toByteArray(Charsets.UTF_8).size <= 16384) invoke("send", text, token, operationId)
        }
        @JavascriptInterface fun disconnectWear(token: Int, reason: String) = invoke("disconnect", reason, token, 0)
        private fun invoke(action: String, text: String, token: Int, id: Int) {
            handler.post { if (!closed) wear(action, text, token, id) }
        }
    }
    private fun command(command: JSONObject) {
        if (!closed) view.evaluateJavascript("window.NativeRuntime.command($command);", null)
    }
    fun event(event: JSONObject) {
        if (!closed) view.evaluateJavascript("window.NativeRuntime && window.NativeRuntime.onNativeEvent($event);", null)
    }
    fun close() {
        closed = true
        handler.removeCallbacksAndMessages(null)
        view.removeJavascriptInterface("AndroidGenerator")
        view.stopLoading()
        view.destroy()
    }
    private companion object { const val ORIGIN = "https://maze.local" }
}
