const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const CustomLevels = require('../src/common/custom-levels.js')
const MazeValidate = require('../src/common/maze-validate.js')
const OFFICIAL = require('../src/common/official-levels.json')

function load(path, globals) {
  let code = fs.readFileSync(path, 'utf8')
  if (path.endsWith('.ux')) code = code.match(/<script>([\s\S]*?)<\/script>/)[1]
  const scope = { module: { exports: {} }, console, Promise, CustomLevels, MazeValidate, OFFICIAL, ...globals }
  vm.runInNewContext(code.replace(/^import .*$/gm, '').replace('export default', 'module.exports ='), scope)
  const definition = scope.module.exports
  return typeof definition === 'function' ? definition : Object.assign({}, definition, definition.data, definition.private)
}

async function main() {
  const reads = []
  const timers = new Map()
  let id = 0
  let connections = 0
  let destructions = 0
  let sync
  const storage = {
    get(o) {
      reads.push(o.key)
      o.success(o.key === 'custom_storage_version' ? '2' : '')
    },
    set(o) { o.success() }
  }
  const SlotStore = load('src/common/slot-store.js', { storage })
  const MazeSync = load('src/common/maze-sync.js', { interconnModule: class {}, setTimeout, clearTimeout })
  const globals = {
    storage, SlotStore, MazeSync,
    gameDisplay: { start() { return {} }, stop() {} },
    setTimeout(fn) { const key = id++; timers.set(key, fn); return key },
    clearTimeout(key) { timers.delete(key) },
    Handshake: class {
      constructor() { connections++ }
      register(Module) {
        sync = new Module({ send: () => Promise.resolve(), addListener() {}, removeListener() { destructions++ } })
        return sync
      }
    }
  }
  const app = load('src/app.ux', globals)
  app.onCreate()
  assert.deepStrictEqual(reads, ['settings_brightness', 'settings_vibrate', 'progress'], '首页启动只读取首屏和设置所需数据')
  assert.equal(connections, 0, 'onCreate 不创建互联实例')
  assert.equal(timers.size, 1)
  const stale = [...timers.values()][0]
  app.onHide()
  assert.equal(timers.size, 0, '隐藏可取消编号为零的启动任务')
  stale()
  assert.equal(connections, 0, '隐藏后迟到任务不启动连接')
  app.onShow()
  app.onShow()
  assert.equal(timers.size, 1, '重复显示只调度一个初始化任务')
  const task = [...timers.values()][0]
  timers.clear()
  task()
  assert.equal(connections, 1)
  assert.equal(reads.length, 3, '握手注册不触发关卡读取')

  const result = await sync.handleList()
  assert.equal(result.levels.length, 0)
  assert.equal(reads.length, 16, '首次手机同步按需读取版本和十二个槽')
  await app.slotStore.init()
  await sync.handleList()
  assert.equal(reads.length, 16, '进入关卡页和后续同步复用缓存')
  app.onHide()
  app.onShow()
  assert.equal(timers.size, 0)
  assert.equal(connections, 1, '前后台切换不重复注册同步模块')
  app.onDestroy()
  assert.equal(destructions, 1)

  const abandoned = load('src/app.ux', globals)
  abandoned.onCreate()
  const late = [...timers.values()][0]
  abandoned.onDestroy()
  late()
  abandoned.onShow()
  assert.equal(timers.size, 0)
  assert.equal(connections, 1, '销毁后不能由旧回调或 onShow 重新启动')
  console.log('✓ 启动分阶段、关卡按需读取、同步缓存复用、隐藏恢复和销毁取消通过')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
