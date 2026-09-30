# MI-Pro 全屏背景、迷宫放大与字体修正

验收日期：2026-09-30（香港时间）。以本地 MI-Pro 工作区为基线，未 reset、checkout、restore、提交或推送。开始检查时工作区无 Git 已跟踪文件修改。本轮保留当前实现，只改显示层及受影响的布局测试。

## 设计文件与实际读取结果

- 使用 `C:\Users\Administrator\Desktop\新建文件夹\無題.fig`，81291 字节，导出时间 2026-09-30 19:29:51（香港时间）。
- 成功在本地解压 ZIP、解压 Kiwi schema / Zstd message 并解码 162 个节点，未调用 Figma MCP。解析器下载到系统临时目录，项目依赖与锁文件未修改。
- 可核查的布局提取保存在 [design-layout.json](design-layout.json)，元数据、哈希与验收结果保存在 [verification.json](verification.json)。
- 文件包含首页、设置、关卡选择、游戏关卡；没有通关页面。四个 Paper 都是 `(0, 0)`、`336×480`、`#FAF8F3`。
- 游戏 Maze board 节点 `4:599` 是 `(30, 90)`、`276×300`；其 Maze 本体 `4:600` 仍是 `269×290`。这些值是本轮重新读取的结果，与“明显放大”要求冲突。用户随后明确授权：在 HUD 与重来之间最大化 Maze，保持正方形 cell。
- 关卡 Paper 仍含 24px 圆角；应用根背景改成相同浅色，使圆角外不会再露出黑色。关卡卡片按用户要求保留当前实现，不采用设计文件中不同的编号和锁图标布局。

## 黑边修复

五个页面的黑色根背景全部改为 `#FAF8F3`。

| 页面 | 修改 |
| --- | --- |
| 首页 | Paper 从 left=16、width=304 改为 left=0、width=336；按设计修正标题、徽章、按钮及装饰点坐标，中文说明字号 24。 |
| 设置 | 保留既有 336×480 settings-paper，修正根背景，删除未使用的旧 304px Paper 样式；持久化和控件逻辑保留。 |
| 关卡选择 | Paper 铺满；内容层补偿原有 16px 偏移，卡片实际屏幕坐标和内部视觉保持不变。 |
| 游戏 | Paper 铺满，调整 HUD、扩大 Maze viewport、将重来移至 y=415。 |
| 通关 | Paper 铺满，直接子元素 x 补偿原 Paper 的 16px 偏移，保留原内容的屏幕位置和业务逻辑。 |

删除的是旧的 **Paper 背景结构**，不是所有数值 304 / 16：关卡标题、内容层等仍保留原有宽度和内边距，避免改变卡片。设置页 Toggle 的黑色圆形 thumb、文字、墙和按钮阴影属于控件，不是黑色侧边框。

## Maze、球和阴影

新的最大可用本体区域为 `(8, 83)`、`320×316`。HUD 按设计放在 `(24, 20)`，其阴影下缘为 y=75；重来按钮保持 `204×53`，x=61、y=415，阴影下缘 y=474。

```text
cellPx = min(320 / cols, 316 / rows)
boardWidth = cols * cellPx
boardHeight = rows * cellPx
boardLeft = 8 + (320 - boardWidth) / 2
boardTop = 83 + (316 - boardHeight) / 2
```

本体不扣除 7×8 阴影。最大阴影右缘为 x=335，最大下缘 y=407，与重来相隔 8px；Maze 顶部与 HUD 阴影至少相隔 8px。

- viewport 宽度增加 18.96%，高度增加 8.97%，面积增加约 29.63%。
- 六个 Official 关卡均由宽度限制，cell 与棋盘边长增加 18.96%，棋盘面积增加约 41.5%。第一关由 269×242.1 增至 320×288。
- 高型 8×15 样本与测试生成的 13×17 Custom 样本由高度限制，cell 增加 8.97%。详细 Official 数值见 [maze-sizing.json](maze-sizing.json)。
- Ball 保留 `round(cellPx × 0.56)` 与原边框比例；ball.ux 未修改，逻辑半径及碰撞规则未修改。球、墙、Goal 继续共用棋盘坐标原点。
- 静态墙仍只在 setupLevel 中生成；球绘制、HUD 节流、固定时间步、传感器订阅和重来逻辑未改动。

## 字体与保护范围

非卡片文字将数值字重 900 改为 `bold`，首页说明与 HUD 字号按本地设计调整。动态文字仍全部使用 text，未生成 PNG 字体资源。

为遵守“关卡卡片禁止修改”，卡片的 900 字重写法也逐字保留。Vela 官方 text 文档明确：数值不低于 550 映射到 bold，因此无需改变卡片才能获得平台支持的粗体效果。参考：[Vela text](https://iot.mi.com/vela/quickapp/zh/components/basic/text.html)。

**关卡选择按钮视觉未修改。** 模板、脚本和所有卡片/锁/选中/已通关/添加卡片样式与本轮开始时逐字比较一致；仅调整页面外层背景与内容层偏移。

**Official Pro 关卡数据未修改。** physics.js、official-levels.json、custom-levels.js、slot-store.js、maze-sync.js、utils/handshake.js、app.ux、manifest.json 和 ball.ux 均未修改。MI-Band 仍为 `1047b760b242e66030d41e6e031611df52990880`；没有切换或修改 App 分支。

## 已执行的检查

- `npm run lint`：24 个 JS / UX 脚本，0 错误。
- 全部 15 个 `tests/*.test.js`：通过；包含宽型、高型、不同 rows/cols、Custom 几何、球/Goal 投影、不重建墙体、碰撞、性能、持久化与同步回归。
- 物理回归包含 648000 次帧检查，无穿墙、无 NaN；另有 36000 帧碰撞索引与全量墙段比对。它们是自动化测试，不是真机传感器验证。
- `npm run build`：通过，AIoT Toolkit 2.0.5、Node v24.16.0；无编译或 CSS 错误。首次受仓库外临时目录权限限制，正常审批后构建成功。
- `git diff --check`：通过。
- 独立保存 [修正版 debug RPK](com.MarbleMaze.watch.mi-pro-correction.debug.rpk)，101704 字节，SHA256：`C7E7CBA0D298D0E33A8F77CEC8342490D0D5455508B0FE8A62E6597C0532B884`。独立文件避免正在运行的开发构建清理 dist 时覆盖交付包。
- 最终保存包安装到 Codex_MIPro_UI / emulator-5556，安装返回 `(success 0)`。

## 模拟器截图与验证限制

| 页面 | 证据 | 结论 |
| --- | --- | --- |
| 首页 | [home.png](home.png) | 左右浅色，无 16px 黑条，文字未见明显裁切。 |
| 设置 | [settings.png](settings.png) | 左右浅色，动态亮度及震动状态使用原生 text。 |
| 关卡 | [levels.png](levels.png) | 左右浅色；六张原有卡片及锁状态保留。 |
| 游戏 | [game.png](game.png) | 第一关棋盘明显放大，Ball / Goal 可见，阴影和按钮未超出屏幕或互相覆盖。 |
| 通关 | [complete.png](complete.png) | 独立视觉验收包成功显示，左右浅色；计时为样本默认值。 |

通关截图来自系统临时目录的独立验收工程：复制当前页面源码，使用不同包名、通关 entry 和最小应用状态。产品 app.ux 与页面业务逻辑未改动。它只证明页面视觉，未模拟真正通关流程。其他四页来自产品源码构建后的应用导航。

模拟器出现 system.brightness / system.interconnect 缺失、onCreate 错误，以及切换验收应用时的原生崩溃与 Activity 恢复超时；重启本次启动的模拟器后取得通关截图。日志保留在本目录。上述运行时问题未在本次 UI 范围内修改，不能声称完整生命周期、真实重来/真实通关/真机碰撞已验收通过。

## 当前仍存在的差异

- native bold 不能还原 Noto Sans SC Black 的字体轮廓和真实黑体字重；未图片化动态文字。
- 为保留已正常的按钮可读性，首页“设置”及游戏“重来”仍保留 28 / 26px，而设计文件相应标签为 20px。首页下划线仍保留已有实色表现。
- Maze 是用户后续授权的最大化布局，大于这份 .fig 的 Maze 本体；不能称为设计文件的精确尺寸。
- Complete 没有设计来源，保留当前内容位置，仅修全屏背景和字重。
- 高型 / Custom 本轮完成几何及自动化测试，没有对应真机截图；真机字体、物理圆角和完整交互仍需设备验收。
