const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

function createDisplay(brightness) {
  const code = fs.readFileSync('src/common/game-display.js', 'utf8')
    .replace(/^import .*$/gm, '').replace('export default', 'module.exports =')
  const context = { module: { exports: {} }, Promise, console, brightness }
  vm.runInNewContext(code, context)
  return context.module.exports
}

async function drain() { for (let i = 0; i < 20; i++) await Promise.resolve() }

async function main() {
  const writes = []
  let value = 126
  let mode = 1
  let delayedMode
  let deferMode = false
  const api = {
    getValue(o) { o.success({ value }) },
    getMode(o) { o.success({ mode }) },
    setValue(o) { value = o.value; writes.push(['value', value]); o.success() },
    setMode(o) {
      if (deferMode) { deferMode = false; delayedMode = o; return }
      mode = o.mode; writes.push(['mode', mode]); o.success()
    }
  }
  const display = createDisplay(api)
  const first = display.start()
  await display.queue
  assert.equal(value, 126)
  assert.equal(mode, 0, '游戏期间切到固定亮度')
  display.stop(first)
  display.stop(first)
  await display.queue
  assert.equal(mode, 1, '退出恢复原自动亮度模式')
  assert.equal(value, 126)
  assert.equal(writes.length, 4, '重复退出仅恢复一次')

  const selected = display.start(Promise.resolve(204))
  await display.queue
  assert.equal(value, 204, '游戏使用设置中选择的亮度')
  display.update(selected, 153)
  display.update(selected, 179)
  await display.queue
  assert.equal(value, 179, '设置页预览快速调节后的最终亮度')
  display.stop(selected)
  display.update(selected, 255)
  await display.queue
  assert.equal(value, 126, '结束预览恢复系统原值，忽略迟到调节')
  assert.equal(mode, 1)

  deferMode = true
  const second = display.start()
  await drain()
  assert.ok(delayedMode)
  display.stop(second)
  const third = display.start()
  mode = delayedMode.mode
  delayedMode.success()
  await display.queue
  assert.equal(mode, 0, '旧页面恢复必须先于新页面申请')
  display.stop(third)
  await display.queue
  assert.equal(mode, 1)

  const canceled = display.start()
  const before = writes.length
  display.stop(canceled)
  await display.queue
  assert.equal(writes.length, before, '读取前隐藏不应操作屏幕')

  const unsupported = createDisplay({ getMode(o) { o.fail('', 1000) }, getValue(o) { o.success({ value: 100 }) } })
  const session = unsupported.start()
  await unsupported.queue
  unsupported.stop(session)
  await unsupported.queue
  assert.equal(session.snapshot, null)
  console.log('✓ 亮度固定、退出恢复、异步切页竞争、重复释放与接口失败降级通过')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
