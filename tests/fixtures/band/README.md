# 手环协议测试快照

五个 JavaScript 文件原样复制自 `C:/Users/Administrator/Desktop/表盘/重置/弹珠迷宫/src/common/`，复制日期：2026-09-24。唯一协议真相源是该本地手环源码，本轮获授权修改手环存储初始化后，重新同步接收器和存储实现。

- maze-sync.js：list/add/replace/remove 接收端。
- slot-store.js：实际连续列表存储、追加、替换与删除前移；其中旧键仅供手环历史存储迁移，手机不使用。
- custom-levels.js：12 个关卡上限及连续存储键。
- maze-validate.js、maze-core.js：实际精简体校验、CRC 和渲染准备。

Node 测试直接加载上述接收器和存储实现，仅替换平台通信基类及 @system.storage 接口。这不是蓝牙、穿戴 SDK 或真机验证。生产 APK 不打包此目录。
