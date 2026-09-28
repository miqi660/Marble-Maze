const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const subscriptions = []
const timers = []
const source = fs.readFileSync('src/pages/game/game.ux', 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace(/^import .*$/gm, '').replace('export default', 'module.exports =')
const scope = {
  module: { exports: {} }, console,
  sensor: {
    subscribeAccelerometer(options) { subscriptions.push(options.callback) },
    unsubscribeAccelerometer() {}
  },
  setInterval(callback) { timers.push(callback); return timers.length },
  clearInterval() {}
}
vm.runInNewContext(source, scope)
const page = scope.module.exports
let ticks = 0
let renders = 0
page.tick = () => ticks++
page.renderFrame = () => renders++
page.onShow()
assert.equal(subscriptions.length, 0, '关卡未就绪不得订阅传感器')
assert.equal(timers.length, 0, '关卡未就绪不得启动循环')
page.onHide()
page.ready = true
page.startLoop()
assert.equal(subscriptions.length, 0, '隐藏后准备完成不得启动循环')
page.onShow()
page.startLoop()
assert.equal(subscriptions.length, 1, '重复启动不得重复订阅')
const first = subscriptions[0]
first({ x: 2, y: -2 })
assert.equal(page.ax, 0.7)
assert.equal(page.ay, -0.7)
for (const sample of [null, {}, { x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: '2', y: 1 }]) {
  first(sample)
  assert.equal(page.ax, 0.7, '无效样本不能污染滤波状态')
  assert.equal(page.ay, -0.7)
}
page.onHide()
page.onShow()
assert.equal(page.ax, 0, '恢复后不沿用隐藏前的倾斜输入')
assert.equal(page.ay, 0)
first({ x: 9.8, y: 9.8 })
assert.equal(page.ax, 0, '旧订阅在新会话中不得生效')
timers[0]()
timers[1]()
assert.equal(ticks, 0)
assert.equal(renders, 0)
subscriptions[1]({ x: 2, y: -2 })
assert.equal(page.ax, 0.7)
timers[2]()
timers[3]()
assert.equal(ticks, 1)
assert.equal(renders, 1)
page.onDestroy()
subscriptions[1]({ x: 9.8, y: 9.8 })
timers[2]()
timers[3]()
assert.equal(page.ax, 0.7)
assert.equal(ticks, 1)
assert.equal(renders, 1)
console.log('✓ 异常传感器样本、前后台会话隔离、旧定时器回调及销毁保护通过')
