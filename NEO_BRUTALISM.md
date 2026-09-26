# 手机端 Neo-Brutalism UI

本轮基于已有 App 分支修改继续开发，仅调整 Compose 视觉与预览几何，没有更改生成、连接、ACK、最终 list 核对、unknown 保护或手环源码。

## 修改文件

- `ui/theme/Theme.kt`：背景 #F4F1E8、纸色 #FFFDF5、墨色 #151515、黄色 #FFD84D，以及少量状态绿/红；统一 6～16dp 圆角。
- `ui/theme/Type.kt`：页面标题 ExtraBold、数字/标题 Bold，正文保留正常字重。
- `ui/app/BrutalComponents.kt`：HardShadowBox、BrutalCard、BrutalButton、BrutalOutlinedButton、BrutalSegment、BrutalTag、BrutalTextField、BrutalSheet。
- `ui/app/DeviceRenderProfile.kt`：纯视觉几何与简短型号标签，不写入 MazeDefinition。
- `ui/app/DevicePreview.kt`：共享迷宫绘制、完整设备外框/Screen/标题/底部信息、280ms 几何动画。
- `ui/app/Components.kt`：难度选择、操作行、错误块接入公共组件；移除独立白底 MazePreview。
- `ui/app/EditorScreen.kt`：固定 360dp DevicePreview 区域的 Hero、Profile/难度 Segment、Seed 控件、随机生成与添加 CTA、同行导入/导出、参数和 Seed 面板。
- `ui/app/DeviceScreen.kt`：DeviceStatusCard、LevelCard、绿色连接状态、红色未知提示、设备选择和删除/替换确认。
- `ui/app/MarbleMazeApp.kt`：顶部/底部导航、预览页、显式路径按钮、信息页、Snackbar；未连接时不显示预览型号选择；Band 使用通用参考外框，连接后采用识别到的实际型号。
- `app/src/test/java/com/MarbleMaze/watch/DeviceRenderProfileTest.kt`：几何与型号标签测试。

## 硬阴影与交互

阴影通过 drawBehind 绘制偏移的黑色实心圆角矩形，blur=0；右下预留空间避免邻近内容覆盖阴影。主按钮 3dp 描边、5dp 阴影；普通按钮/Segment 2dp 描边，阴影 1～4dp。按压采集 interactionSource，75ms 移动前景至阴影位置，松开复位。卡片和菜单均无 Material 模糊 elevation。

主要卡片 12～14dp 圆角，按钮 9dp，输入框 8dp，标签 6dp。输入框采用独立标签与持续 2dp 描边。BottomSheet 3dp 黑色边线，使用统一纸色和方形拖动条。辅助色仅用于迷宫起终点、连接/错误状态。

## 设备映射

Band9 外框 192×490，Band10 外框 212×520，共用 192×490 的内部参考坐标。

```
scale = min(targetWidth / 192, targetHeight / 490)
offsetX = (targetWidth - 192 * scale) / 2
offsetY = (targetHeight - 490 * scale) / 2
```

Band10 的 scale 约为 1.0612245，offsetX 约为 4.12245，offsetY=0。迷宫位置、宽高、线宽、标记、文字都按统一比例映射；外层再对手机可用预览区域做一次等比 Fit Center。没有将 Band10 内部横向拉满。Band 迷宫沿用本 App 的 172 参考宽度及等大网格，不移植 HTML 中不同的 Band 预设。

Pro 外框 336×480，radius=42、screenRadius=40；迷宫 left=16、top=96、width=304、height=280。Band/Pro 使用同一个迷宫绘制函数，只由 DeviceRenderProfile 提供布局参数。

外层预览区域固定；设备宽、高、圆角、迷宫宽高和位置同时进行 280ms 动画，页面不整体淡入淡出。连接后使用实际识别到的型号。切 Profile 的 Seed/同级预设规则继续沿用已有 ViewModel。

## 验证边界

执行 JS 测试、Gradle testDebugUnitTest、lintDebug、assembleDebug，以及 git diff --check。几何测试覆盖 Band9/Band10 的统一比例与居中、五组 Band 尺寸的方形单元格和信息区间距、Pro 精确参数、标签不会冒用其他 Profile 型号。

当前 adb 无设备，emulator 无 AVD，SDK 未发现 system-images，因此没有安装 APK，也没有完成运行界面的人工截图验收。源代码检查与几何测试不能代替屏幕验收。

待真实手机检查：不同屏幕宽度/字体缩放下按钮和长设备名换行、BottomSheet 与软键盘、Hero 及关卡列表间距、75ms 按压反馈、280ms 切换流畅度、TalkBack、状态栏和手势导航。仍需与 Band9/Band10/Pro 实际画面对照；这里是手机视觉 mockup，不代表修改了手环端布局。
