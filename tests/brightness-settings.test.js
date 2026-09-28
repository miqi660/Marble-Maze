const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

function load(path, globals) {
  const code = fs.readFileSync(path, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '').replace('export default', 'module.exports =')
  const context = { module: { exports: {} }, Promise, console, setTimeout, clearTimeout, ...globals }
  vm.runInNewContext(code, context)
  const definition = context.module.exports
  return Object.assign({}, definition, definition.data, definition.private)
}
async function drain() { for (let i = 0; i < 20; i++) await Promise.resolve() }
async function main() {
  let read
  let disk = '70'
  const pending = []
  const preview = []
  let starts = 0
  let stops = 0
  const globals = {
    OFFICIAL: new Array(6), MazeSync: {}, vibrator: { vibrate() {} },
    gameDisplay: { start() { starts++; return {} }, stop(session) { if (session) stops++ }, update(s, value) { preview.push(value) } },
    SlotStore: class { init() {} }, Handshake: class { register() { return { destroy() {} } } },
    storage: {
      get(o) { if (o.key === 'settings_brightness') read = o; else o.fail() },
      set(o) { pending.push(o) }
    }
  }
  const app = load('src/app.ux', globals)
  // 应用 $def 不能依赖测试装载器把 data 默认值合并到顶层。
  delete app.brightnessPercent
  app.onCreate()
  assert.equal(app.brightnessPercent, 50, '首次启动或读取失败前必须显式初始化亮度')
  const settings = load('src/pages/settings/settings.ux', {
    router: {}
  })
  settings.$app = { $def: app }
  settings.onInit()
  settings.onShow()
  assert.equal(settings.brightnessPercent, 50, '读取完成前页面也应显示有效百分比')
  read.success(disk)
  await drain()
  assert.equal(settings.brightnessPercent, 70)
  settings.brighten()
  settings.brighten()
  await drain()
  assert.equal(pending.length, 1)
  assert.equal(pending[0].value, '80')
  pending.shift().success()
  await drain()
  disk = pending[0].value
  assert.equal(disk, '90')
  pending.shift().success()
  await app.brightnessWrites
  assert.equal(preview[preview.length - 1], 230)
  settings.onHide()
  assert.equal(starts, 1, '进入设置页不应新建亮度会话')
  assert.equal(stops, 0, '离开设置页不能恢复系统亮度')
  app.onShow()
  assert.equal(starts, 1, '重复前台通知不重复申请')
  app.onHide()
  assert.equal(stops, 1, '应用退后台才释放亮度')
  app.onShow()
  assert.equal(starts, 2, '应用回前台重新应用亮度')
  app.onDestroy()
  assert.equal(stops, 2)
  const reopened = load('src/app.ux', globals)
  reopened.onCreate()
  read.success(disk)
  await reopened.brightnessReady
  assert.equal(reopened.brightnessPercent, 90)
  const raced = load('src/app.ux', globals)
  raced.onCreate()
  raced.setBrightness(1000)
  read.success('20')
  await drain()
  assert.equal(raced.brightnessPercent, 100)
  pending.shift().success()
  await raced.brightnessWrites
  for (const bad of [undefined, NaN, Infinity, null, '', 'NaN']) {
    raced.brightnessPercent = bad
    assert.equal(raced.getBrightness(), 50)
    settings.$app.$def = raced
    settings.onShow()
    await drain()
    assert.equal(settings.brightnessPercent, 50)
    settings.dim()
    await drain()
    assert.equal(settings.brightnessPercent, 40, '异常旧值仍可通过按键恢复调节')
    assert.equal(pending[0].value, '40')
    pending.shift().success()
    await raced.brightnessWrites
    settings.onHide()
  }
  raced.brightnessPercent = '70'
  assert.equal(raced.getBrightness(), 70, '数字字符串应转换为数字而非拼接')
  raced.setBrightness(-1)
  await drain()
  assert.equal(raced.brightnessPercent, 10)
  pending.shift().success()
  await raced.brightnessWrites
  console.log('✓ 亮度读取、设置页调节预览、顺序保存、退出重开、上下限与读取竞争通过')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
