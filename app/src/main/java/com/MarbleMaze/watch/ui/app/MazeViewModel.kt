package com.MarbleMaze.watch.ui.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import org.json.JSONArray
import org.json.JSONObject
import kotlin.random.Random

data class MazeDefinition(
    val json: String, val id: String, val cols: Int, val rows: Int,
    val start: Int, val goal: Int, val horizontal: List<Int>, val vertical: List<Int>,
    val path: List<Int>, val steps: Int, val runs: Int, val bytes: Int, val crc: String, val profile: String = "band"
)
data class EditorUiState(
    val preset: String = "normal", val cols: Int = 8, val rows: Int = 15,
    val seed: Long? = 38291627, val maze: MazeDefinition? = null,
    val isGenerating: Boolean = true, val error: String? = null, val detail: String? = null,
    val imported: Boolean = false, val profile: String = "band", val deviceVariant: DeviceVariant? = null
)
data class CustomLevel(val index: Int, val name: String, val cols: Int, val rows: Int)
data class WearDevice(val id: String, val name: String)
data class DeviceUiState(
    val connected: Boolean = false, val deviceName: String = "穿戴设备",
    val levels: List<CustomLevel>? = null, val devices: List<WearDevice> = emptyList(),
    val busy: Boolean = false, val scanning: Boolean = false, val preparing: Boolean = false,
    val unknown: Boolean = false, val message: String = "", val operationKind: String = "idle"
) {
    val canOperate get() = connected && !busy && !preparing && !unknown && levels != null
}

/** Compose 只发送事件；关卡列表唯一来自同步核心的完整状态快照。 */
class MazeViewModel : ViewModel() {
    var editor by mutableStateOf(EditorUiState()); private set
    var device by mutableStateOf(DeviceUiState()); private set
    var notice by mutableStateOf<String?>(null); private set
    private var dispatch: ((JSONObject) -> Unit)? = null
    fun attach(sender: (JSONObject) -> Unit) {
        dispatch = sender
        val previous = editor
        send("resume", "unknown" to device.unknown)
        generate(previous.cols, previous.rows, previous.seed ?: randomSeed())
    }
    fun detach() {
        dispatch = null
        device = DeviceUiState(unknown = device.unknown || device.busy,
            message = if (device.busy || device.unknown) "无法确认操作结果，请重新连接并刷新关卡列表。" else "")
    }
    fun notify(message: String?) { notice = message }
    fun consumeImport() { editor = editor.copy(imported = false) }
    fun randomSeed(): Long = Random.nextLong(0, 4294967296L)
    fun generate(cols: Int = editor.cols, rows: Int = editor.rows, seed: Long = randomSeed(), profile: String = editor.profile) {
        if (dispatch == null) return
        editor = editor.copy(isGenerating = true, error = null, imported = false)
        send("generate", "profile" to profile, "cols" to cols, "rows" to rows, "seed" to seed)
    }
    fun preset(value: String) { val size = profilePresets(editor.profile).getValue(value); generate(size.first, size.second, editor.seed ?: randomSeed()) }
    fun incrementSeed() = generate(seed = ((editor.seed ?: 0L) + 1L) and 0xffffffffL)
    fun importSpec(text: String) {
        if (dispatch == null) return
        editor = editor.copy(isGenerating = true, error = null, imported = false)
        send("import", "profile" to editor.profile, "text" to text)
    }
    fun selectProfile(profile: String) {
        if (profile == editor.profile || editor.isGenerating) return
        val size = profilePresets(profile)[editor.preset] ?: profilePresets(profile).getValue("normal")
        // 生成成功后整体接收新 Profile、尺寸和迷宫，避免旧快照令动画反向。
        generate(size.first, size.second, editor.seed ?: randomSeed(), profile)
    }
    fun scan() = send("scan")
    fun connect(node: WearDevice) = send("connect", "id" to node.id, "name" to node.name)
    fun disconnect() = send("disconnect")
    fun operation(kind: String, index: Int? = null) {
        if (kind != "list" && !device.canOperate) return
        send(kind, "index" to index)
    }
    private fun send(action: String, vararg args: Pair<String, Any?>) {
        val command = JSONObject().put("action", action)
        args.forEach { command.put(it.first, it.second) }
        dispatch?.invoke(command)
    }
    fun receive(text: String) {
        runCatching {
            val root = JSONObject(text)
            val e = root.getJSONObject("editor")
            val m = e.optJSONObject("maze")
            val maze = m?.let {
                val render = it.getJSONObject("render")
                MazeDefinition(it.toString(), it.getString("id"), it.getInt("cols"), it.getInt("rows"),
                    it.getInt("start"), it.getInt("goal"), render.getJSONArray("h").ints(), render.getJSONArray("v").ints(),
                    e.optJSONArray("path").ints(), e.optInt("shortestPath"), e.optInt("runs"), e.optInt("bytes"), e.optString("crc"), it.getString("profile"))
            }
            editor = EditorUiState(e.getString("preset"), e.getInt("cols"), e.getInt("rows"),
                if (e.isNull("seed")) null else e.getLong("seed"), maze, e.optBoolean("generating"),
                e.nullableString("error"), e.nullableString("detail"), e.optBoolean("imported"), e.optString("profile", "band"), editor.deviceVariant)
            val d = root.getJSONObject("device")
            val levels = d.optJSONArray("levels")?.let { array -> List(array.length()) { i ->
                val item = array.getJSONObject(i)
                CustomLevel(item.getInt("index"), item.optString("name"), item.getInt("cols"), item.getInt("rows"))
            } }
            val nodes = d.optJSONArray("nodes")
            val devices = if (nodes == null) emptyList() else List(nodes.length()) { i ->
                val node = nodes.getJSONObject(i); WearDevice(node.getString("id"), node.optString("name", "穿戴设备"))
            }
            val raw = d.optString("message")
            val message = when {
                raw.contains("握手") && d.optBoolean("busy") -> "正在建立通信…"
                raw.contains("等待手环保存") -> "正在同步关卡…"
                raw.contains("正在读取") -> "正在读取关卡…"
                raw.contains("已连接，自定义") -> "关卡列表已更新"
                raw.contains("拒绝操作") -> "设备未能完成操作，请重新连接并检查关卡列表。"
                raw.contains("SDK") || raw.contains("穿戴服务不可用") -> "设备服务不可用，请检查小米运动健康后重新连接。"
                raw.any { it in 'a'..'z' || it in 'A'..'Z' } -> "设备通信未能完成，请检查小米运动健康并重新连接。"
                else -> raw
            }
            val previousDevice = device
            device = DeviceUiState(d.optBoolean("connected"), d.optString("name", "穿戴设备"), levels, devices,
                d.optBoolean("busy"), d.optBoolean("scanning"), d.optBoolean("preparing"), d.optBoolean("unknown"), message, d.optString("operationKind", "idle"))
            if (raw == "同步成功，已添加关卡" && previousDevice.operationKind == "adding" && !device.busy && !device.unknown) {
                notice = "已添加为自定义 %02d".format(levels?.size ?: 0)
            }
            val variant = if (device.connected) DeviceVariant.identify(device.deviceName) else null
            if (!editor.isGenerating && (variant != editor.deviceVariant || device.connected && !previousDevice.connected)) {
                editor = editor.copy(deviceVariant = variant)
                variant?.let { selectProfile(it.profile) }
            }
        }.onFailure { notice = "无法读取应用状态，请重新打开应用。" }
    }
    companion object {
        val presets = linkedMapOf("easy" to (7 to 13), "normal" to (8 to 15), "hard" to (9 to 17), "expert" to (10 to 19))
        fun profilePresets(profile: String) = if (profile == "pro") linkedMapOf("easy" to (10 to 9), "normal" to (12 to 10), "hard" to (14 to 12), "expert" to (16 to 13)) else presets
        fun label(preset: String) = mapOf("easy" to "简单", "normal" to "正常", "hard" to "困难", "expert" to "专家")[preset] ?: "自定义"
    }
}
private fun JSONArray?.ints(): List<Int> = if (this == null) emptyList() else List(length()) { getInt(it) }
private fun JSONObject.nullableString(key: String): String? = if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }

/** 设备型号只影响目标画布，不能参与迷宫随机数。 */
enum class DeviceVariant(val profile: String) {
    BAND9("band"), BAND10("band"), BAND9PRO("pro");
    companion object {
        fun identify(name: String): DeviceVariant? {
            val normalized = name.lowercase().replace(" ", "")
            return when {
                normalized.contains("band9pro") || normalized.contains("手环9pro") -> BAND9PRO
                normalized.contains("band10") || normalized.contains("手环10") -> BAND10
                normalized.contains("band9") || normalized.contains("手环9") -> BAND9
                else -> null
            }
        }
    }
}
