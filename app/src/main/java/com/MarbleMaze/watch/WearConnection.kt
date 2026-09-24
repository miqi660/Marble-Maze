package com.MarbleMaze.watch

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.xiaomi.xms.wearable.Wearable
import com.xiaomi.xms.wearable.auth.Permission
import com.xiaomi.xms.wearable.message.OnMessageReceivedListener
import com.xiaomi.xms.wearable.node.Node
import com.xiaomi.xms.wearable.service.OnServiceConnectionListener
import com.xiaomi.xms.wearable.tasks.Task
import org.json.JSONArray
import org.json.JSONObject

/** 只负责 SDK 连接与收发；握手和业务确认由可独立测试的 sync-client.js 管理。 */
class WearConnection(context: Context, private val event: (JSONObject) -> Unit) {
    private val handler = Handler(Looper.getMainLooper())
    private val nodeApi = Wearable.getNodeApi(context)
    private val authApi = Wearable.getAuthApi(context)
    private val messageApi = Wearable.getMessageApi(context)
    private val serviceApi = Wearable.getServiceApi(context)
    private val nodes = mutableMapOf<String, Node>()
    private val registrations = mutableMapOf<String, Task<Void>>()
    private val cleanupWaiters = mutableMapOf<String, MutableList<() -> Unit>>()
    private var selected: Node? = null
    private var generation = 0
    private var scanning = false
    private var preparing = false
    private var closed = false
    private var prepareTimeout: Runnable? = null
    private val serviceListener = object : OnServiceConnectionListener {
        override fun onServiceConnected() = Unit
        override fun onServiceDisconnected() {
            handler.post { if (!closed) disconnect("小米运动健康服务已断开") }
        }
    }

    init { serviceApi.registerServiceConnectionListener(serviceListener) }

    private fun emit(type: String, vararg values: Pair<String, Any>) {
        if (closed) return
        val data = JSONObject().put("type", type).put("token", generation)
        values.forEach { (key, value) -> data.put(key, value) }
        event(data)
    }

    fun scan() {
        if (scanning || preparing || closed) return
        scanning = true
        val current = generation
        var finished = false
        fun finish(result: Result<List<Node>>) {
            if (finished || closed) return
            finished = true
            scanning = false
            if (current != generation) {
                emit("devices", "nodes" to JSONArray(), "message" to "连接已改变，请重新查询设备")
                return
            }
            nodes.clear()
            val list = JSONArray()
            result.getOrNull()?.forEach { node ->
                nodes[node.id] = node
                list.put(JSONObject().put("id", node.id).put("name", node.name))
            }
            emit("devices", "nodes" to list, "message" to (
                result.exceptionOrNull()?.message ?: if (nodes.isEmpty())
                    "未发现已连接设备，请先在小米运动健康中连接手环" else "请选择要连接的设备"
                ))
        }
        val timeout = Runnable { finish(Result.failure(IllegalStateException("设备查询超时，请打开小米运动健康后重试"))) }
        handler.postDelayed(timeout, 10000)
        try {
            nodeApi.connectedNodes.addOnSuccessListener { result -> handler.post {
                handler.removeCallbacks(timeout)
                finish(Result.success(result))
            } }.addOnFailureListener { error -> handler.post {
                handler.removeCallbacks(timeout)
                finish(Result.failure(error))
            } }
        } catch (error: Exception) {
            handler.removeCallbacks(timeout)
            finish(Result.failure(error))
        }
    }

    fun connect(nodeId: String) {
        if (preparing || closed) return
        val node = nodes[nodeId]
        if (node == null) {
            emit("disconnected", "message" to "设备列表已失效，请重新查询")
            return
        }
        disconnect("正在切换连接")
        selected = node
        preparing = true
        val current = generation
        fun valid() = !closed && generation == current && selected?.id == node.id
        fun fail(error: Exception) { handler.post {
            if (valid()) disconnect(error.message ?: "连接准备失败")
        } }
        fun ready() {
            if (!valid()) return
            prepareTimeout?.let(handler::removeCallbacks)
            prepareTimeout = null
            preparing = false
            emit("ready", "name" to (node.name ?: "穿戴设备"))
        }
        fun register() {
            if (!valid()) return
            emit("status", "message" to "正在注册手环消息接收…")
            val listener = OnMessageReceivedListener { sourceId, bytes ->
                if (bytes.size <= 16384) handler.post {
                    if (valid() && sourceId == node.id) emit("message", "text" to String(bytes, Charsets.UTF_8))
                }
            }
            try {
                val registration = messageApi.addListener(node.id, listener)
                registrations[node.id] = registration
                registration.addOnSuccessListener { handler.post {
                    if (valid()) try {
                        emit("status", "message" to "正在打开手环上的弹珠迷宫…")
                        nodeApi.launchWearApp(node.id, "/pages/levels")
                            .addOnSuccessListener { handler.post { ready() } }
                            .addOnFailureListener { handler.post {
                                if (valid()) {
                                    emit("status", "message" to "请在手环上打开弹珠迷宫，正在尝试握手…")
                                    ready()
                                }
                            } }
                    } catch (error: Exception) { fail(error) }
                } }.addOnFailureListener { fail(it) }
            } catch (error: Exception) { fail(error) }
        }
        fun cleanAndRegister() { if (valid()) removeListener(node.id) { register() } }
        prepareTimeout = Runnable { if (valid()) disconnect("连接准备超时，请检查互联授权后重试") }
        handler.postDelayed(prepareTimeout!!, 30000)
        emit("status", "message" to "正在检查小米运动健康互联授权…")
        try {
            authApi.checkPermission(node.id, Permission.DEVICE_MANAGER).addOnSuccessListener { granted -> handler.post {
                if (valid()) {
                    if (granted) cleanAndRegister()
                    else try {
                        authApi.requestPermission(node.id, Permission.DEVICE_MANAGER)
                            .addOnSuccessListener { permissions -> handler.post {
                                if (valid()) {
                                    if (permissions.contains(Permission.DEVICE_MANAGER)) cleanAndRegister()
                                    else fail(IllegalStateException("未获得设备管理授权"))
                                }
                            } }.addOnFailureListener { fail(it) }
                    } catch (error: Exception) { fail(error) }
                }
            } }.addOnFailureListener { fail(it) }
        } catch (error: Exception) { fail(error) }
    }

    fun send(token: Int, operationId: Int, text: String) {
        val node = selected
        if (closed || token != generation) return
        if (node == null || preparing || text.toByteArray(Charsets.UTF_8).size > 16384) {
            emit("sendError", "id" to operationId, "message" to "设备未准备好或消息超限")
            return
        }
        fun fail(error: Exception) { handler.post {
            if (!closed && token == generation) emit("sendError", "id" to operationId,
                "message" to (error.message ?: "发送失败"))
        } }
        try {
            messageApi.sendMessage(node.id, text.toByteArray(Charsets.UTF_8))
                .addOnFailureListener { fail(it) }
        } catch (error: Exception) { fail(error) }
    }

    fun disconnect(reason: String = "已断开连接", token: Int? = null) {
        if (token != null && token != generation) return
        emit("disconnected", "message" to reason)
        generation++
        preparing = false
        prepareTimeout?.let(handler::removeCallbacks)
        prepareTimeout = null
        val old = selected
        selected = null
        if (old != null) removeListener(old.id) {}
    }

    // 等待旧注册结束再移除，避免快速重连时旧 addListener 覆盖新监听器。
    private fun removeListener(nodeId: String, done: () -> Unit) {
        cleanupWaiters[nodeId]?.let { it.add(done); return }
        cleanupWaiters[nodeId] = mutableListOf(done)
        fun finish() { handler.post {
            cleanupWaiters.remove(nodeId)?.forEach { it() }
        } }
        fun remove() {
            try {
                val task = messageApi.removeListener(nodeId)
                task.addOnSuccessListener { finish() }.addOnFailureListener { finish() }
            } catch (_: Exception) { finish() }
        }
        val registration = registrations.remove(nodeId)
        if (registration == null) remove()
        else registration.addOnSuccessListener { handler.post { remove() } }
            .addOnFailureListener { handler.post { remove() } }
    }

    fun close() {
        closed = true
        disconnect()
        runCatching { serviceApi.unregisterServiceConnectionListener(serviceListener) }
    }
}
