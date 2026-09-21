# 进入关卡整机重启：P0 隔离候选

状态：DEVICE_NOT_VERIFIED。不能作为已确认修复版本。

用户报告：进入关卡时手环重启；具体机型、固件、关卡和重启时刻待补充。
报告后读取到的上一版构建 SHA256：7E976AC169FE0A1415380CCF8222B5925B8FDC2CECF4B344DABBE33E5A275601。设备实际安装包哈希未核对。

本候选仅回退 Game 球的动态 transform 为 left/top；保留 25Hz 绘制节流。碰撞索引、全局缓存、同步、传感器时序和物理参数均不作新的调整，以便隔离变量。

候选 SHA256：5903B4ECCFC54369B884B9D9BBF626F79C5856B6166D7C420FACB12EA101EB8B。

已执行：performance-lifecycle.test.js、review-regression.test.js、npm run build、git diff --check；编译产物无 ballTransform/translate 绑定。
当前 ADB 仅连接 emulator-5554（NuttX 模拟器），没有该手环的崩溃、看门狗或内存日志；未部署或触发设备复现。

transform 是本轮优先排除的新增原生绘制路径，不是已证实根因。需要结合原有重启时刻及设备日志判断下一步；不要反复使用原故障包重现。
