# 自定义迷宫同步器

Android Compose → AndroidView WebView → 离线生成器 → sync-ui.js → sync-client.js → AndroidGenerator → WearConnection → 小米 Wearable SDK。保留原生成器、预览与导出及现有签名方案。

## 当前功能和流程

查询已连接设备、授权、注册监听成功后打开手环应用，完成 __hs__ 握手并自动 list。生成或导入合法关卡后可添加；替换、删除必须弹窗确认，取消不发送。

手环最多保存 12 个连续自定义关卡。业务 index 为 0-based（0..11），UI 显示 01..12。删除中间关卡后手环自动压缩列表，后续编号前移，手机始终以重新查询的结果显示。

- 0 项：显示“自定义关卡 0 / 12”“暂无自定义关卡”，当前生成关卡合法时可添加。
- 6、7 项：动态显示 01..06、01..07，每项展示名称、尺寸、替换和删除按钮。
- 12 项：禁用添加，替换和删除仍可用；删除并回读确认后恢复添加。
- 断线清除旧列表；重新连接必须重新查询。页面重建会关闭连接并恢复默认生成参数，重要关卡请先导出。

## 协议基准和确认

唯一协议基准：`C:/Users/Administrator/Desktop/表盘/重置/弹珠迷宫/src` 当前源码，2026-09-24 核对。该目录只读。

- 握手：`{"tag":"__hs__","count":0}`，只处理整数 0..2，手机最多尝试三次。
- 查询：`{"tag":"maze","stat":"list"}` → `{tag:"maze",type:"list",levels:[{index,id,name,cols,rows}]}`。
- 添加：`{tag:"maze",stat:"add",level:{...}}`，不指定 index，由手环追加。
- 替换：`{tag:"maze",stat:"replace",index:2,level:{...}}`。
- 删除：`{tag:"maze",stat:"remove",index:2}`。
- ACK：`{tag:"maze",type:"ack",stat,index,ok,message}`；添加失败时不含 index。严格匹配 type、stat、相关 index、布尔 ok。
- list 的 levels 必须是最多 12 项的数组，index 从 0 连续排列，cols/rows 为合法整数；`ok:false` 表示存储初始化失败，不能当作空列表成功。
- `levelForSync()` 保留：同步时去掉 render，对不含 crc 的精简体 JSON UTF-8 字节计算 CRC-32，添加八位大写十六进制 crc。精简体仍限制 1024 字节；预览和导出保留 render。

成功判定：请求 → ACK ok=true → 再次 list → 核对整个列表 → 显示成功。SDK sendMessage 成功和 ACK 本身均不代表最终成功。

添加核对长度增加一项、追加目标及原摘要；替换核对长度不变、目标及其他摘要；删除核对长度减少一项及后续前移。摘要核对 id、name、cols、rows 和新 index。确认不匹配时断开业务连接并要求重连核对。写操作或 ACK 后查询 8 秒超时均视为结果未知，不自动重发 add/replace/remove。手环拒绝操作后也要求重连查询，避免继续使用可能过期的列表。

协议没有请求 ID，list 不回传 CRC；串行操作、连接轮次隔离及全列表核对不能提供跨重连的严格请求关联或完整内容回读证明。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `app/src/main/assets/generator/tools/maze/generator-core.js` | 保留原生成与完整校验算法 |
| `app/src/main/assets/generator/index.html` | 生成预览、导出及动态关卡列表容器 |
| `app/src/main/assets/generator/sync-client.js` | 精简体、CRC、握手、串行请求和最终确认 |
| `app/src/main/assets/generator/sync-ui.js` | 动态列表、桥接事件、按钮与确认弹窗 |
| `app/src/main/java/com/MarbleMaze/watch/WearConnection.kt` | SDK 发现、授权、监听、启动和传输，保持不变 |
| `app/src/main/java/com/MarbleMaze/watch/MainActivity.kt` | WebView 与桥接，保持不变 |
| `tests/fixtures/band/` | 当前本地手环源码原样快照，仅用于测试 |

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

上述为上一阶段签名排查记录；本轮同步改造沿用已有 debug 签名配置。若手机拒绝覆盖安装不同签名 APK，需先保存应用数据再手动卸载旧版安装新版。没有连接设备，本次未验证手机实际安装的 APK 或手环实际安装的 RPK，也未验证错误在真机消失。

SDK 沿用本机 BestLyrics 参考工程中的 1.4 AAR，来源与哈希见 `app/libs/README.md`。不增加定位、存储或蓝牙扫描权限；设备发现由穿戴服务提供。页面仅加载 APK 内白名单资源。

## 本地测试与编译

```powershell
node tests/generator-core.test.cjs
node tests/generator-page.test.cjs
node --test tests/storage-init.test.cjs tests/sync-client.test.cjs tests/sync-ui.test.cjs
git diff --check
.\gradlew.bat assembleDebug
```

同步测试覆盖连续 12 关的边界、删除前移、异常 ACK/列表、超时、CRC、连接隔离与确认取消；使用实际 MazeSync、SlotStore fixture，仅替换平台通信和存储接口。模拟 DOM / Node 测试不是 Android WebView、SDK 或真机互联验证。

APK 输出：`app/build/outputs/apk/debug/app-debug.apk`。本任务只测试、编译，不安装 APK、不执行 ADB 部署、不启动手机应用、不向手环传输文件。

存储初始化失败时，手环 list 的 message 返回阶段、操作、key 和错误码，手机展示该信息。初始化失败允许下次查询重试；迁移跳过空旧键，不忽略真实存储失败。
