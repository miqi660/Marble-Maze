const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

function load(path, globals) {
  const source = fs.readFileSync(path, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '').replace('export default', 'module.exports =')
  const context = { module: { exports: {} }, Promise, console, setTimeout, clearTimeout, ...globals }
  vm.runInNewContext(source, context)
  const definition = context.module.exports
  return Object.assign({}, definition, definition.data, definition.private)
}

async function drain() { for (let i = 0; i < 20; i++) await Promise.resolve() }

async function main() {
  const disk = { settings_vibrate: '0' }
  let read
  const pendingWrites = []
  let vibrations = 0
  const globals = {
    OFFICIAL: new Array(6), MazeSync: {},
    gameDisplay: { start() { return {} }, stop() {}, update() {} },
    SlotStore: class { init() {} },
    Handshake: class { register() { return { destroy() {} } } },
    vibrator: { vibrate() { vibrations++ } },
    storage: {
      get(options) {
        if (options.key === 'settings_vibrate') read = options
        else options.fail()
      },
      set(options) { pendingWrites.push(options) }
    }
  }
  const app = load('src/app.ux', globals)
  app.onCreate()
  app.feedback()
  assert.equal(vibrations, 0, '偏好加载前不应错误触发默认震动')
  const settings = load('src/pages/settings/settings.ux', { router: {}, gameDisplay: { start() {}, stop() {} } })
  settings.$app = { $def: app }
  settings.onInit()
  settings.onShow()
  read.success(disk.settings_vibrate)
  await drain()
  assert.equal(settings.vibrateOn, false, '设置页必须跟随异步读取结果')
  app.feedback()
  assert.equal(vibrations, 0)
  settings.onToggle({ checked: true })
  settings.onToggle({ checked: false })
  await drain()
  assert.equal(pendingWrites.length, 1, '不能并发写入同一设置')
  assert.equal(pendingWrites[0].value, '1')
  disk.settings_vibrate = pendingWrites[0].value
  pendingWrites.shift().success()
  await drain()
  assert.equal(pendingWrites.length, 1)
  assert.equal(pendingWrites[0].value, '0')
  disk.settings_vibrate = pendingWrites[0].value
  pendingWrites.shift().success()
  await app.vibrateWrites
  settings.onHide()
  app.onDestroy()
  const reopened = load('src/app.ux', globals)
  reopened.onCreate()
  read.success(disk.settings_vibrate)
  await reopened.vibrateReady
  assert.equal(reopened.vibrateOn, false, '退出重开后保持关闭')

  const racing = load('src/app.ux', globals)
  racing.onCreate()
  racing.setVibrate(true)
  read.success('0')
  await drain()
  assert.equal(racing.vibrateOn, true, '迟到的启动旧值不能覆盖用户新选择')
  pendingWrites.shift().success()
  await racing.vibrateWrites
  settings.$app.$def = racing
  settings.onShow()
  await drain()
  assert.equal(settings.vibrateOn, true)
  settings.onToggle({ checked: true })
  await drain()
  assert.equal(pendingWrites.length, 0, '绑定同步不能重复保存')
  console.log('✓ 震动设置异步加载、快速切换顺序保存、退出重开、迟到读取与绑定去重通过')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
