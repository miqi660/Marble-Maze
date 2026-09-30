const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const CustomLevels = require('../src/common/custom-levels.js')
const MazeValidate = require('../src/common/maze-validate.js')
const Physics = require('../src/common/physics.js')
const OFFICIAL = require('../src/common/official-levels.json')
// 同步协议仍接受 Band 格式；使用固定夹具，避免借用 Pro Official。
const BAND = require('./fixtures/band-levels.json')

function load(path, globals) {
  let code = fs.readFileSync(path, 'utf8')
  if (path.endsWith('.ux')) code = code.match(/<script>([\s\S]*?)<\/script>/)[1]
  const scope = Object.assign({ module: { exports: {} }, console, Promise, CustomLevels,
    MazeValidate, Physics, OFFICIAL, DIFFICULTY_LABEL: {} }, globals)
  vm.runInNewContext(code.replace(/^import .*$/gm, '').replace('export default', 'module.exports ='), scope)
  return scope.module.exports
}

function clock() {
  let now = 0
  let id = 0
  const tasks = new Map()
  return {
    tasks,
    Date: { now: () => now },
    setTimeout(fn, ms) { const key = ++id; tasks.set(key, { fn, at: now + ms }); return key },
    clearTimeout(key) { tasks.delete(key) },
    elapse(ms) { now += ms },
    next() {
      const task = Array.from(tasks).sort((a, b) => a[1].at - b[1].at)[0]
      assert.ok(task, '存在待执行任务')
      tasks.delete(task[0])
      now = Math.max(now, task[1].at)
      task[1].fn()
    },
    drain() { let steps = 0; while (tasks.size) { assert.ok(++steps < 50); this.next() } }
  }
}
async function microtasks() { for (let i = 0; i < 30; i++) await Promise.resolve() }

async function storageTests() {
  let requests = []
  let writes = 0
  const disk = { custom_storage_version: '2' }
  for (let i = 0; i < 12; i++) disk[CustomLevels.storageKey(i)] = JSON.stringify({ ...MazeValidate.stripCrc(BAND[i % 6]), name: String(i) })
  const Store = load('src/common/slot-store.js', { storage: {
    get(o) { if (o.key === 'custom_storage_version') o.success('2'); else requests.push(o) },
    set(o) { writes++; disk[o.key] = o.value; o.success() },
    delete(o) { writes++; delete disk[o.key]; o.success() }
  } })
  const store = new Store()
  const ready = store.init()
  for (let batch = 0; batch < 4; batch++) {
    await microtasks()
    assert.equal(requests.length, 3, '每批三个并发读取')
    const current = requests.splice(0)
    current.reverse().forEach(o => o.success(disk[o.key]))
  }
  assert.equal(await ready, true)
  assert.deepStrictEqual(Array.from(store.list(), x => x.name), Array.from({ length: 12 }, (_, i) => String(i)), '乱序回调不改变连续索引')
  assert.equal(writes, 0, '正常读取不写盘')
  const first = store.getLevel(0)
  const collision = Physics.getCollisionIndex(first)
  assert.strictEqual(store.getLevel(0), first)
  assert.strictEqual(Physics.getCollisionIndex(first), collision)
  assert.deepStrictEqual(collision, Physics.buildCollisionIndex(first))
  assert.equal(await store.replace(0, MazeValidate.stripCrc(BAND[1])).then(r => r.ok), true)
  const replacement = store.getLevel(0)
  assert.notStrictEqual(replacement, first)
  assert.notStrictEqual(Physics.getCollisionIndex(replacement), collision, '替换不能复用旧碰撞缓存')
  const shifted = store.getLevel(1)
  const shiftedCollision = Physics.getCollisionIndex(shifted)
  assert.equal((await store.remove(0)).ok, true)
  assert.strictEqual(store.getLevel(0), shifted)
  assert.strictEqual(Physics.getCollisionIndex(store.getLevel(0)), shiftedCollision, '删除压缩保留同一关卡缓存')
  for (const key of Object.keys(disk).filter(k => /^custom_\d/.test(k))) {
    assert.equal(JSON.parse(disk[key]).render, undefined, '运行时数据不写盘')
  }

  writes = 0
  const failed = new Store()
  const failedReady = failed.init()
  await microtasks()
  const current = requests.splice(0)
  current[1].fail('读取失败', 5)
  current[2].success(disk[current[2].key])
  current[0].success(disk[current[0].key])
  assert.equal(await failedReady, false)
  assert.equal(failed.count(), 0)
  assert.equal(writes, 0, '任何读取失败不得压缩或持久化半份数据')
  assert.equal(requests.length, 0, '失败后不启动下一批')

  const sparse = { custom_01: disk.custom_01, custom_02: '{损坏', custom_04: disk.custom_02 }
  const repaired = new Store()
  repaired.getValue = async key => ({ ok: true, value: key === 'custom_storage_version' ? '2' : sparse[key] || '' })
  const persist = repaired.persistEntries.bind(repaired)
  let repairs = 0
  repaired.persistEntries = (entries, raw) => {
    repairs++
    assert.equal(raw[1], '{损坏')
    assert.equal(entries.length, 2)
    return persist(entries, raw)
  }
  assert.equal(await repaired.init(), true)
  assert.equal(repairs, 1, '损坏和空洞仍触发原有持久化修复')
  assert.equal(repaired.get(1).name, JSON.parse(sparse.custom_04).name)
  const repairFailed = new Store()
  repairFailed.getValue = repaired.getValue
  repairFailed.persistEntries = async () => false
  assert.equal(await repairFailed.init(), false)
  assert.equal(repairFailed.count(), 0, '修复失败不发布列表')
}

function warmupTests() {
  const timers = clock()
  let count = 12
  const prepared = []
  const definition = load('src/pages/levels/levels.ux', timers)
  const page = Object.assign({}, definition, definition.private, {
    active: true, pageIndex: 1, customCount: count,
    $app: { $def: { slotStore: {
      get: i => i < count ? {} : null,
      getLevel: i => prepared.push(i)
    } } }
  })
  page.startWarmup()
  assert.equal(prepared.length, 0, '不在调用栈同步预热')
  timers.next()
  assert.deepStrictEqual(prepared, [0], '每个任务只准备一关')
  timers.drain()
  assert.deepStrictEqual(prepared, [0, 1, 2, 3, 4, 5])
  prepared.length = 0
  page.hasSecondCustomPage = true
  page.switchPage(2)
  assert.equal(prepared.length, 0)
  timers.next()
  assert.equal(prepared.length, 0, '翻页动画结束才调度预热')
  timers.drain()
  assert.deepStrictEqual(prepared, [6, 7, 8, 9, 10, 11])
  prepared.length = 0
  page.startWarmup()
  const stale = Array.from(timers.tasks.values())[0].fn
  page.onHide()
  stale()
  assert.equal(timers.tasks.size, 0)
  assert.equal(prepared.length, 0, '隐藏后迟到回调失效')
  page.active = true
  page.customCount = count = 8
  page.startWarmup()
  timers.drain()
  assert.deepStrictEqual(prepared, [6, 7], '不预热空槽')
  page.startWarmup()
  page.onDestroy()
  assert.equal(timers.tasks.size, 0)
}

async function gameTests() {
  function make(ready, prepareCost = 0) {
    const timers = clock()
    const level = MazeValidate.prepareLevel(MazeValidate.stripCrc(BAND[0]))
    let reads = 0
    const returns = []
    const def = load('src/pages/game/game.ux', { ...timers, returnToPage: path => returns.push(path) })
    const game = Object.assign({}, def, def.private, {
      pack: 'custom', index: 0,
      $app: { $def: { slotStore: { ready, init() { return this.ready }, getLevel() { reads++; timers.elapse(prepareCost); return level } } } }
    })
    game.onInit()
    return { game, timers, returns, reads: () => reads }
  }
  const fast = make(Promise.resolve(true))
  await microtasks()
  fast.timers.drain()
  assert.equal(fast.game.ready, true)
  assert.equal(fast.game.loading, false)
  assert.equal(fast.timers.Date.now(), 0, '快路径没有固定等待')
  const cached = fast.game.collisionIndex
  fast.game.setupLevel(fast.game.level)
  assert.strictEqual(fast.game.collisionIndex, cached)
  let renderReads = 0
  const probe = { ...fast.game.level, get render() { renderReads++; return fast.game.level.render } }
  const probeIndex = Physics.getCollisionIndex(probe)
  const afterBuild = renderReads
  assert.ok(afterBuild > 0)
  assert.strictEqual(Physics.getCollisionIndex(probe), probeIndex)
  assert.equal(renderReads, afterBuild, '命中缓存不再次读取墙段构建索引')

  const underThreshold = make(Promise.resolve(true), 79)
  await microtasks()
  underThreshold.timers.drain()
  assert.equal(underThreshold.timers.Date.now(), 79)
  assert.equal(underThreshold.game.loading, false, '79ms 完成仍不显示 loading')

  let resolve
  const slow = make(new Promise(r => { resolve = r }))
  slow.timers.elapse(79)
  assert.equal(slow.game.loading, false)
  slow.timers.next()
  assert.equal(slow.game.loading, true, '80ms 未完成显示提示')
  resolve(true)
  await microtasks()
  slow.timers.drain()
  assert.equal(slow.game.ready, true)
  assert.equal(slow.game.loading, false, 'setupLevel 完成立即移除')

  const cpuSlow = make(Promise.resolve(true), 90)
  await microtasks()
  cpuSlow.timers.next()
  assert.equal(cpuSlow.game.loading, true, '同步准备超过阈值后在阶段间显示提示')
  cpuSlow.timers.drain()
  assert.equal(cpuSlow.game.loading, false)

  let resume
  const hidden = make(new Promise(r => { resume = r }))
  hidden.game.onHide()
  resume(true)
  await microtasks()
  assert.equal(hidden.reads(), 0)
  assert.equal(hidden.timers.tasks.size, 0)
  hidden.game.startPreparation()
  await microtasks()
  hidden.timers.drain()
  assert.equal(hidden.game.ready, true, '重新显示可恢复准备')

  const disposed = make(Promise.resolve(true))
  await microtasks()
  const stale = Array.from(disposed.timers.tasks.values()).find(t => t.at === 0).fn
  disposed.game.onBackPress()
  stale()
  assert.equal(disposed.reads(), 0)
  assert.equal(disposed.timers.tasks.size, 0)
  assert.deepStrictEqual(disposed.returns, ['/pages/levels'])
  const failed = make(Promise.resolve(false))
  await microtasks()
  assert.equal(failed.timers.tasks.size, 0)
  assert.deepStrictEqual(failed.returns, ['/pages/levels'])
}

;(async () => {
  await storageTests()
  warmupTests()
  await gameTests()
  console.log('✓ 三路读取、乱序/失败保护、分页逐关预热、退出取消、碰撞缓存失效和慢加载阈值通过')
})().catch(error => { console.error(error); process.exitCode = 1 })
