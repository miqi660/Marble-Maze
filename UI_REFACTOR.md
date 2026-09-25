# Android Compose UI 重构

本次仅修改 App 分支手机端。手环代码、测试中的手环协议夹具、WearConnection、generator-core、sync-client、Manifest 权限和 Gradle 签名配置均保持原样。

## 页面与状态

- 一级页面仅「生成」「设备」，紧凑顶部与底部 NavigationBar。
- 生成：330dp 原生 Canvas 迷宫、四档难度、Seed 编辑/+1、随机生成、参数面板、独立 JSON 导入页。
- 预览：全屏 Canvas、可选最短路径、关卡信息、JSON 复制/系统文件导出。
- 设备：设备选择面板、连接状态、连续 0～12 项列表、下拉刷新/菜单刷新、添加、替换/删除确认。
- 重要结果在 Compose 中显示；Toast 仅用于已复制、已导出。
- 路由/面板/输入草稿属于 Compose 展示状态；EditorUiState、DeviceUiState 由 MazeViewModel 管理。
- UI 事件 → MazeViewModel → GeneratorRuntime → 原核心 → 状态快照 → ViewModel → Compose。
- JS 同步核心仍是设备列表的唯一业务来源，UI 不乐观插入、删除或自行复制维护列表。
- Activity 重建时销毁旧兼容层和连接，恢复当前迷宫；连接需要重新建立。进行中的操作保守视作结果未知。

## 兼容层与旧界面

GeneratorRuntime 使用未加入视图树的 WebView 加载 native-runtime.html，仅允许离线核心资源。正式 APK 不含旧网页界面，也不加载网页 Canvas 或 sync-ui。

原 index.html、sync-ui.js 原样移至 tests/fixtures/legacy-ui，旧测试改为读取夹具，继续提供旧行为的回归基线。新增 native-runtime.test.cjs 覆盖真正上线的兼容入口；NativeUiStateTest 覆盖原生写操作门禁与预设。

核心保持 MazeDefinition v1、原尺寸/seed/ID/完整校验/CRC/精简体/1024 字节限制。同步继续 add/replace/remove/list、握手、业务 ACK、再次 list、全列表核对，超时不自动重发。只有最终列表确认才报告成功。结果未知锁定在重新连接并取得有效列表后解除。

## 文件

- MainActivity.kt：原生 App 容器、文件导出/剪贴板、SDK 生命周期。
- GeneratorRuntime.kt：离线脚本白名单、消息桥、销毁清理。
- ui/app/MazeViewModel.kt：两类 UI 状态、数据解析、事件、门禁。
- ui/app/MarbleMazeApp.kt：两页导航、预览/导入/详情路由。
- ui/app/EditorScreen.kt：生成、导入、Seed 与参数面板。
- ui/app/DeviceScreen.kt：设备页、设备选择、操作确认。
- ui/app/Components.kt：Canvas、难度选择、操作行、错误详情。
- ui/theme/Theme.kt：暖白、黄色强调、柔和危险色；删除旧 Color.kt 紫色模板常量。
- assets/generator/native-runtime.html、native-runtime.js：无 DOM UI 的核心适配。
- tests/generator-page.test.cjs、sync-ui.test.cjs：保留测试，调整夹具路径。
- tests/native-runtime.test.cjs、app/src/test/.../NativeUiStateTest.kt：新入口与状态门禁测试。
- tests/fixtures/legacy-ui/index.html、sync-ui.js：旧 UI 回归夹具。

## 验证与边界

已运行生成器/旧页面回归、存储/同步/新兼容层测试，及 Gradle testDebugUnitTest、lintDebug、assembleDebug。具体结果见交付回复与 app/build/reports。

本环境无 Android 手机或 Android AVD，未执行真机界面、键盘、无障碍和 Wear SDK 端到端验收。构建和离线测试不代表实机同步验收。

## 后续迁移项

- generator/sync 仍运行于内部 WebView；未来按协议与确定性样本逐项迁移 Kotlin，不应直接重写后宣称等价。
- JS 状态消息仍为字符串，适配层根据现有消息识别未知状态；未来可在独立协议迁移阶段引入结构化结果类型。
- 当前关卡支持 Activity 配置重建恢复，进程结束后重新打开恢复默认生成状态，未增加本地关卡库。
- 需要 Android 实机确认 Canvas/大字体/小屏/输入法与重连体验，并执行新 UI 的真实设备同步验收。
- 保留原工程的依赖版本与模板资源 Lint 警告，未进行无关升级或资源清扫。
