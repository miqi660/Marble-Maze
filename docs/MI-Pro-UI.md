# MI-Pro UI 移植记录

本次工作仅用于 MI-Pro，设计基准为 336×480。没有推送远端，也没有修改其他分支。

## 设计依据与坐标

Figma 文件：`lNT5YQYXWxYXixqRoGw3cq`。

关卡页 4:549 的 Design Context 读取成功。首页、设置、游戏的 MCP 请求被套餐额度限制拦截；经用户明确授权，改用已打开的 Figma 页面读取节点属性。附图只用于关卡卡片视觉，未采用附图的 2 列布局。

| 页面 / 节点 | 实际属性及实现 |
| --- | --- |
| 首页 4:495 / 4:496 | 336×480 外舞台；Paper x=16、304×480、直角。开始按钮 Paper 内 x=16、y=257、264×68；设置 x=31、y=354、234×65。 |
| 设置 4:517 / 4:518 | Paper 为 336×480、直角。震动卡 x=28、y=89、272×108；亮度卡 x=28、y=215、272×149；返回 x=28、y=392、272×55。 |
| 关卡 4:549 / 4:550 | Paper x=16、304×480、24px 圆角。Paper 内网格 x=16、y=137；卡 85×100、间隔 8、3列×2行。进度 x=16、y=371、272×53。 |
| 游戏 4:588 / 4:589 | Paper x=16、304×480、直角。HUD 全屏坐标 x=28 / 190、y=21、118×50。迷宫本体区域 x=32、y=93、269×290。重来 x=66、y=397、204×53。 |
| Complete | 沿用通关标题、成功图形、用时、下一关/重玩、返回关卡结构，按同一 Pro 设计系统迁移；没有对应 Figma 页面。 |

外层使用 100% 尺寸，内部 design-stage 直接采用 336×480，不进行 Band 舞台整体缩放。黄为 #FFD522，主要粉为 #FF2E78，关卡页使用其实际 #FF3E8A。字体使用平台字体与粗体，没有添加字体包或临时 Figma 资源 URL。

## 关卡及显示几何

开始时仓库 Official 实际仍为 Band。用户明确授权原样接入 `C:/Users/Administrator/Desktop/generated/pro-levels.json` 中已准备的 6 个 maze。

只提取 `levels.map(item => item.maze)` 写入 `src/common/official-levels.json`。六个 maze 的全部字段与源文件逐字段相等；未运行生成器，未修改 rows、cols、cells、start、goal、render 或拓扑。`src/common/levels.js` 未修改。

源文件 SHA256：`33aff1cdcc2ca0ece9d566bb530e1dce5bdaab8f4a9ec462c41b3b34f1490573`。

六个 maze 的规范 JSON SHA256：`2c0b382ae576d90aa6587460567bbcdcbad47fa4fe01965c6b6a32edb919ab68`，在 Pro 回归测试中固定，防止关卡内容意外变化。

```js
cellPx = Math.min(269 / cols, 290 / rows)
boardWidth = cols * cellPx
boardHeight = rows * cellPx
boardLeft = 32 + (269 - boardWidth) / 2
boardTop = 93 + (290 - boardHeight) / 2
goalLeft = (goal % cols) * cellPx
goalTop = Math.floor(goal / cols) * cellPx
ballSize = Math.round(0.56 * cellPx)
```

棋盘背景和描边与墙体层分离，描边不会改变逻辑原点。墙体及 Goal 初始化时计算，球只更新原来的 transform；物理网格、20ms tick、40ms render、200ms HUD 均保留。棋盘宽高比例随关卡变化，居中后可能留白，这是保持正方形单元格的结果。

Official 解锁继续使用 `i > progress`；已完成状态为 `i < progress`，当前卡保留粉阴影，所有可玩卡为黄色。未解锁卡为米灰背景、黑边黑硬阴影、大号灰数字，右上锁使用本地 div 绘制。进度条宽度为 `248 * clamp(progress, 0, officialCount) / officialCount`。

Custom 保留 SlotStore、实际难度、空卡、同步刷新、分页及 warmup；使用相同 3×2 坐标。同步协议仍接受原 Band 自定义格式，本次没有拓宽校验、改变 storage key 或修改手机协议。

## 文件变化

| 文件 | 主要变化 |
| --- | --- |
| src/manifest.json | designWidth 改为 336。 |
| src/pages/home/home.ux | Pro 腕上/迷宫组合、提示、双按钮及大三色方点。 |
| src/pages/settings/settings.ux | Pro 两张设置卡、自定义 Toggle、共用硬阴影亮度按钮；保留持久化处理。 |
| src/pages/levels/levels.ux | Official/Custom 3×2、参考图卡片、动态进度条及分页；保留滑动和 warmup。 |
| src/pages/game/game.ux | Pro 显示区域、动态 boardTop/球尺寸、重来位置；不改物理循环和导航。 |
| src/pages/game/components/hud.ux | 118×50 双 HUD，粉/黄硬阴影，长自定义名称适配。 |
| src/pages/game/components/maze-board.ux | 动态定位、浅灰棋盘、4px 黑边、7×8 粉硬阴影。 |
| src/pages/game/components/ball.ux | 动态 size / borderWidth，删除尺寸枚举。 |
| src/pages/game/components/loading.ux | 将既有慢加载提示迁移到 Pro 尺寸。 |
| src/pages/complete/complete.ux | 按统一 Pro 设计系统迁移，保留全部原导航与用时逻辑。 |
| src/common/ui/btn-hard.ux | 可配置阴影位移、边宽、圆角，复用按压逻辑；亮度按钮关闭组件额外 feedback，避免与原处理器重复震动。 |
| src/common/ui/dots.ux | 16px 三色方点、8px 间隔。 |
| src/common/ui/eyebrow.ux | 可配置字号、Pro 标签大小及颜色。 |
| src/common/official-levels.json | 经授权替换 Band 数据为准备好的六个 Pro maze，maze 内容不变。 |
| package.json / tools/lint.js | 修复原 formatter 缺失和 UX 解析失败；提取 script 执行 ESLint 正确性规则，不自动格式化业务文件。 |
| tests/fixtures/band-levels.json | 固定原有 Band 关卡作为同步回归夹具，避免使用 Pro Official 测试 Band 协议。 |
| tests/custom-levels.test.js | 同步夹具与新的网格坐标断言。 |
| tests/custom-loading.test.js | 使用固定 Band 自定义测试数据，原加载/缓存断言保留。 |
| tests/performance-lifecycle.test.js | Pro render 与 cells 一致性；动态球尺寸断言；同步部分使用 Band 夹具。 |
| tests/pro-layout.test.js | 关卡内容哈希、336 舞台、动态解锁/进度、Pro 和 Band 自定义等比棋盘检查。 |
| tests/vibration-settings.test.js | 快速切换使用新的 Toggle 点击入口，继续验证顺序保存和退出重开。 |

## 验证边界

依赖已经存在，跳过 npm install。npm run lint 检查 24 个脚本；AIoT build 校验 UX 模板/CSS 并生成 debug RPK。已有 14 个测试文件及新增 Pro 布局测试执行成功，覆盖物理、定时预算、同步、存储、亮度、震动和导航。

模拟器截图为 Vela 5.0 NuttX 的 336×480 输出，不能视为真实 Smart Band 9 Pro 验收。平台字体、字形宽度、屏幕颜色量化和真实设备边缘裁切可能与 Figma 不同。模拟器不提供项目所用屏幕亮度接口，亮度 UI / 存储可验证，实际屏幕亮度变化须在实机确认。手机互联与震动触感也须用实际设备配合验证。

模拟器已验证首页、设置、自定义 Toggle、亮度 50→60、Official 3×2、Custom 空卡、左右滑动、第一关棋盘/Goal/动态球、计时与重来。重来后计时截图为 02.2，球返回起点。

Complete 使用临时副本将入口设为该页面进行截图；生产 src / manifest 入口始终为 Home。临时包中点击下一关后正确进入 LV 2，第二关棋盘及球正常显示。该检查验证页面与导航，不代表在模拟器中实际完成了倾斜通关。

最终验收 debug RPK：`dist/com.MarbleMaze.watch.MI-Pro-UI.debug.rpk`，101736 字节，SHA256 为 `34d2bd73b07589a5c505f26a0ca7c5dc73c62a5eac9e3ffa7897189d8938cc90`。这是最后一次成功构建的独立副本，包内入口仍为 Home。

立即连续执行 am stop / am start 时，Vela 5.0 出现原生 Data abort；栈位于新进程 inspector doServer 启动期间。还记录到设置和关卡页原有 onDestroy 调用 this.onHide() 时的 TypeError。逐方法审计确认这些生命周期方法及 App、物理、存储、同步源码均与基线一致。本任务没有扩展为运行时或业务重写；停止重开稳定性需继续单独确认，不能将本次模拟器截图视为完整稳定性验收。
