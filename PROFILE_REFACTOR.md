# App 分支：Profile 与创建流程

本次只修改 Android App；未修改手环源码、WearConnection、GeneratorRuntime、ACK 状态机或存储协议。

## 生成与参数

- `PROFILES.band.presets`：7×13、8×15、9×17、10×19。
- `PROFILES.pro.presets`：10×9、12×10、14×12、16×13。
- Band 保留原校验：列 7～11、行 13～20、宽高比 0.50～0.57。
- Pro 自定义尺寸暂定：列 7～16、行 9～20、宽高比 0.50～1.40；两种 Profile 均最多 220 格、256 个墙段。Pro 范围覆盖四档预设及跨 Profile 拓扑校验的交集，仍需真机验收。
- 分享格式只有 `<cols>x<rows>@<seed>`，例如 `12x10@38291627`；导入使用当前 Profile，Seed 范围 0～4294967295。
- 用户不再导入或导出完整 JSON。内部 MazeDefinition 字段、render.h/v、CRC 与精简同步载荷保留。
- Maze ID 分别使用 m-b / m-p，canonical hash 包含 Profile。

## 算法版本

默认 generatorVersion=2：保留 Mulberry32、DFS Backtracker、Perfect Maze、最长顶行/底行起终点。候选种子为 `(seed + imul(i, 0x9E3779B9)) >>> 0`，i=0..3。

评分综合路径长度、适量转弯、死胡同、分支及墙段数量。墙段多于原始 seed 候选的方案直接淘汰；同分保留靠前候选。Profile 不参与 RNG、候选排序或评分。v1 仍可通过 buildFromSpec 显式复现；MazeDefinition 协议版本仍为 1。

分享字符串没有版本号，使用当前 App 算法版本，因此旧版 App 的同一 Seed 不保证与本次 v2 拓扑一致；相同完整 GenerationSpec 保持确定性。

桌面 Node 对两种 Profile 的专家档各生成 100 次：Band 中位数约 0.91 ms / P95 2.08 ms，Pro 约 1.27 ms / P95 1.83 ms。这不是手机 WebView 性能验收。

## 预览与参考文件

Band 参考画布 192×490。目标 Canvas 使用：

```
scale = min(targetWidth / 192, targetHeight / 490)
offsetX = (targetWidth - 192 * scale) / 2
offsetY = (targetHeight - 490 * scale) / 2
```

Compose 在参考坐标绘制后整体等比变换；墙宽、球半径、终点与边距随同一比例缩放。Band9 / Band10 共用此渲染路径，设备型号不参与拓扑。实际手环渲染端未在本次修改或验证。

Pro：画布 336×480，外圆角 42，屏幕圆角 40，迷宫区域 304×280，left=(336−304)/2=16，top=96。

附件只有需求文本。已只读核对桌面的 `C:/Users/Administrator/Desktop/迷宫生成器_demo.html`：其 Pro 原始参数、预设、Mulberry32、DFS 方向顺序、起终点选择与需求一致；未找到名称带 `(1)` 的原始附件，不能确认两份文件完全相同。未移植该 HTML 的 Band 参数。

## 交互与同步

创建页包含 Hero Preview、Profile、难度、Seed、随机生成、同一行导入/导出及添加按钮。导入为 BottomSheet，可输入分享字符串、粘贴或修改三个参数；校验成功后关闭。导出复制字符串并显示 Snackbar。

未连接时添加按钮打开现有设备选择器；连接已识别型号后自动切换 Profile 并保留 Seed、选择同级预设。添加保持正在发送状态直至 ACK 后最终 list 匹配，成功显示自定义编号。满 12 个禁用。Device 页只负责管理。

operationKind 分为 connecting / refreshing / adding / replacing / removing / syncing / idle。写入后的确认 list 仍显示对应写操作，只有独立 list 显示下拉刷新。未知结果继续锁住写入。

同步核心仅扩展列表摘要尺寸校验以接纳 Pro；不增加列表字段，不改 ACK、确认内容或重试规则。

## 验证边界

新增 Profile / 参数 / 确定性 / v1 复现 / 墙段预算 / 缩放 / Pro 同步与操作状态测试；更新旧 JSON 导入测试。JS 共 53 项通过。

执行 Gradle testDebugUnitTest、lintDebug、assembleDebug。构建只证明本地编译与离线检查，不证明 BLE 或目标手环兼容。

仍需手机与 Band9 / Band10 / Band9Pro 验证：型号名称识别、界面与键盘/剪贴板交互、WebView 生成延迟、连接与添加/替换/删除、12 关上限、断线/超时/unknown 恢复、实际 Pro 接收支持及设备像素布局。没有安装或运行真机。
