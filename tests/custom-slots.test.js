const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const CustomSlots = require('../src/common/custom-slots.js')
const MazeValidate = require('../src/common/maze-validate.js')
const OFFICIAL = require('../src/common/official-levels.json')

function load(path, globals) {
  let code = fs.readFileSync(path, 'utf8')
  if (path.endsWith('.ux')) code = code.match(/<script>([\s\S]*?)<\/script>/)[1]
  code = code.replace(/^import .*$/gm, '').replace('export default', 'module.exports =')
  const scope = Object.assign({ module: { exports: {} }, CustomSlots, MazeValidate, OFFICIAL,
    DIFFICULTY_LABEL: {}, console, Promise, setTimeout, clearTimeout }, globals)
  vm.runInNewContext(code, scope)
  return scope.module.exports
}

async function run() {
  const disk = { custom_a: JSON.stringify(OFFICIAL[0]), custom_b: JSON.stringify(OFFICIAL[1]) }
  const storage = {
    get(o) { o.success(disk[o.key] || '') },
    set(o) { disk[o.key] = o.value; o.success() },
    delete(o) { delete disk[o.key]; o.success() }
  }
  const SlotStore = load('src/common/slot-store.js', { storage })
  const store = new SlotStore()
  await store.init()
  assert.equal(store.get('a').name, OFFICIAL[0].name, '保留旧 A 槽')
  assert.equal(store.get('b').name, OFFICIAL[1].name, '保留旧 B 槽')
  const messages = []
  const MazeSync = load('src/common/maze-sync.js', { interconnModule: class {} })
  MazeSync.store = store
  const sync = new MazeSync({ send(message) { messages.push(message); return Promise.resolve() }, addListener() {} })
  const slim = MazeValidate.stripCrc(OFFICIAL[2])
  for (const slot of CustomSlots.keys) {
    const level = Object.assign({}, slim, { name: '自定义 ' + slot })
    sync.handlePut({ slot, level: Object.assign({}, level, { crc: MazeValidate.computeCrc(level) }) })
    await store.queues[slot]
    assert.equal(messages[messages.length - 1].ok, true)
  }
  sync.handleList()
  await Promise.resolve()
  assert.equal(messages[messages.length - 1].slots.length, 12)
  for (const slot of ['m', '', '__proto__']) {
    sync.handlePut({ slot, level: slim })
    assert.equal(messages[messages.length - 1].ok, false)
    assert.equal(await store.clear(slot), false)
  }
  const restored = new SlotStore()
  await restored.init()
  for (const slot of CustomSlots.keys) assert.equal(restored.get(slot).name, '自定义 ' + slot)

  const routes = []
  const definition = load('src/pages/levels/levels.ux', { router: { push(o) { routes.push(o) } } })
  const page = Object.assign({}, definition, JSON.parse(JSON.stringify(definition.private)), {
    $app: { $def: { slotStore: store, progress: 0, feedback() {} } }
  })
  page.onInit()
  assert.equal(page.slots.filter(s => !!s.level).length, 12)
  assert.equal(page.slots.filter(s => s.page === 1).length, 6)
  assert.equal(page.slots.filter(s => s.page === 2).length, 6)
  for (const expected of [1, 2, 2]) {
    page.onTouchStart({ touches: [{ clientX: 150, clientY: 200 }] })
    page.onTouchEnd({ changedTouches: [{ clientX: 40, clientY: 200 }] })
    assert.equal(page.pageIndex, expected)
  }
  page.playCustom('l')
  assert.equal(routes[0].params.pack, 'custom_l')
  const game = load('src/pages/game/game.ux', {})
  const playing = Object.assign({}, game, { pack: 'custom_l', index: '0', $app: page.$app,
    setupLevel(level) { this.loaded = level } })
  playing.onInit()
  await Promise.resolve()
  assert.equal(playing.loaded.name, '自定义 l', '第 12 关路由必须读取对应槽位')
  sync.handleClear({ slot: 'l' })
  await store.queues.l
  assert.equal(messages[messages.length - 1].ok, true)
  assert.equal(disk.custom_l, undefined)
  page.leaving = false
  page.refreshSlots()
  page.playCustom('l')
  assert.equal(routes.length, 1, '空槽不能启动或生成关卡')
  assert.equal(page.slots.filter(s => !!s.level).length, 11)
  for (const slot of CustomSlots.keys) await store.clear(slot)
  page.refreshSlots()
  assert.ok(page.slots.every(s => !s.level), '空库保留 12 个占位')
  sync.destroy()
  console.log('✓ 12 槽同步/恢复/清空、旧 A/B 保留、分页边界、第 12 关加载与空槽占位通过')
}

run().catch(error => { console.error(error); process.exitCode = 1 })
