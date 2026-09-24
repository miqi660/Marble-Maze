# 自定义迷宫同步器

现有 Android 工程已接入离线迷宫生成器和小米穿戴 SDK 的同步代码。

## 当前功能

- 原样复用参考目录的 `generator-core.js`，支持四档难度、自定义合法尺寸、uint32 种子、随机生成、路径预览和粘贴 JSON 校验。
- Android 剪贴板复制、系统文件选择器导出关卡及生成报告。
- 查询小米运动健康中的已连接设备，申请互联授权，打开手环迷宫页面并握手。
- 读取自定义 A/B 槽位，上传当前生成或导入的关卡、清空槽位；覆盖和清空由页面弹窗确认。
- 串行处理操作，手环 ACK 成功后重新读取槽位并核对目标 ID/空槽位，再显示完成。SDK 发送成功不会直接显示同步成功。
- 写入超时或发送失败视为结果可能未知，断开并要求重新连接查询，不自动重发写入。

## 使用流程

1. 在小米运动健康中连接手环，并确保手环上已安装配对的弹珠迷宫。
2. 在应用中点击“查询设备”，选择设备并连接；按系统提示授权。
3. 握手成功后自动读取 A/B 槽位。
4. 在下方生成或导入关卡，再点击对应槽位的“上传当前关卡”。
5. 等待手环保存确认和槽位刷新。结果未知时先重连核对，不直接重复覆盖。

页面重建（例如旋转屏幕）会回到默认生成参数并关闭连接；重要关卡请先导出。若在同步中重建页面，操作可能已在手环执行，重连后查询槽位确认。

## 协议与文件

| 文件 | 职责 |
| --- | --- |
| `app/src/main/assets/generator/tools/maze/generator-core.js` | 原始生成与完整校验算法 |
| `app/src/main/assets/generator/index.html` | 生成、预览和槽位界面 |
| `app/src/main/assets/generator/sync-client.js` | 精简体 CRC、握手、串行请求、业务确认与超时状态机 |
| `app/src/main/assets/generator/sync-ui.js` | 页面与 Android 桥接事件、按钮状态和确认流程 |
| `app/src/main/java/com/MarbleMaze/watch/WearConnection.kt` | SDK 设备发现、授权、启动、监听和字节传输；隔离旧连接回调 |
| `app/src/main/java/com/MarbleMaze/watch/MainActivity.kt` | 本地 WebView、文件导出及 SDK 桥接；按需初始化 SDK |
| `tests/fixtures/band/` | 参考手环接收端原始代码快照，仅用于本地协议测试 |

以 `D:/code/MarbleMaze2/reference/src (2)` 中的实际接收端为准：

- 握手：`{"tag":"__hs__","count":0}`，仅处理整数 0..2，最大重试三次。
- 查询：`{"tag":"maze","stat":"list"}` → `{tag:"maze",type:"list",slots:[...]}`。
- 上传：`{tag:"maze",stat:"put",slot:"a"或"b",level:{...}}`。
- 清空：`{tag:"maze",stat:"clear",slot:"a"或"b"}`。
- 上传/清空回复：`{tag:"maze",type:"ack",slot,ok,message}`。
- `level` 去掉 `render`，对无 `crc` 的精简对象 `JSON.stringify` 后的 UTF-8 字节计算 CRC-32，添加八位大写十六进制 `crc`；精简体不超过 1024 字节。
- 导出 JSON 保留原始 MazeDefinition v1（含 render），UTF-8 且无尾换行。生成页显示的字节数/CRC 对应导出文件，与精简同步消息不同。

当前参考协议的 ACK 没有请求 ID，列表也不回传 CRC。串行请求、连接轮次隔离和 ACK 后列表核对可以减少迟到消息误判，但不能提供跨重连的严格请求关联或回读内容校验。未修改手环协议。

两端包名都是 `com.MarbleMaze.watch`。实际互联还要求签名配对一致，详见 [小米官方 interconnect 文档](https://iot.mi.com/vela/quickapp/zh/features/network/interconnect.html)。签名排查结果见下节。

## fingerprint verify failed 排查与调试配置

SDK 将该提示映射为 `SignatureVerifyFailedException`。已检查用户指定的 `C:/Users/Administrator/Desktop/表盘/重置/弹珠迷宫`：没有自定义 `sign` 目录，工具链回退到内置调试证书；`dist` 中两个现有 RPK 均包含该证书的 DER 数据。

| 本地产物/证书 | SHA-256 |
| --- | --- |
| 排查时现有 `app-debug.apk` | `24589A81F49EDF23AFEB736DB6CF6719316890EB9A45FA034431A92D68FA48A8` |
| Vela 工具链调试证书 / 新配置的本地 Android 调试密钥库 | `4E8E1EE24968B0DAD6D0956A7E14D848B38B22A203F39C389A45D8737BDC4585` |

Android `debug` 已指定使用 `.local-signing/vela-debug.p12`，release 配置未变。已验证该密钥库包含与证书匹配的私钥，指纹与上述 Vela 证书相同；密钥库被 Git 忽略。它沿用工具链公开调试密钥，仅供调试，不用于正式发布。

在其他工作副本上可使用 Python 和 `cryptography` 导入相同本地调试材料：

```powershell
python tools/import-vela-debug-signing.py --vela-project "C:\Users\Administrator\Desktop\表盘\重置\弹珠迷宫"
```

本次没有构建、重签现有 APK 或安装。现有 APK 仍是旧签名；后续自行构建的 debug APK 才会使用新配置。若手机拒绝覆盖安装不同签名 APK，需先保存应用数据再手动卸载旧版安装新版。没有连接设备，本次未验证手机实际安装的 APK 或手环实际安装的 RPK，也未验证错误在真机消失。

SDK 沿用本机 BestLyrics 参考工程中的 1.4 AAR，来源与哈希见 `app/libs/README.md`。不增加定位、存储或蓝牙扫描权限；设备发现由穿戴服务提供。页面仅加载 APK 内白名单资源。

## 本地检查（无需 Android 构建）

```powershell
node tests/generator-core.test.cjs
node tests/generator-page.test.cjs
node --test tests/sync-client.test.cjs tests/sync-ui.test.cjs
git diff --check
```

本轮检查：

- 生成器核心测试及原页面逻辑回归通过。
- 11 项同步协议测试、3 项页面同步流程测试通过。包含参考接收端的 A/B 上传/查询/清空，CRC、拒绝、超时、旧连接和迟到错误，以及覆盖取消和 SDK 失败恢复。
- 静态读取本地 AAR 的类签名，核对 NodeApi/AuthApi/MessageApi/ServiceApi 调用；未运行 SDK。
- 按用户要求，本轮没有执行 Gradle、Android 编译、lint、APK 打包或安装。新增 Kotlin 代码未经过编译验证。
- Mock/模拟 DOM 测试不是 Android WebView、SDK 或手环真实互联验证。

上一阶段曾通过 Kotlin 编译，但完整构建因 JVM 内存不足中断，日志保留在 `build/diagnostics/`；该历史结果不能作为本轮同步代码的编译证据。
