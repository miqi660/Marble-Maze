const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const MazeCore = require('../src/common/maze-core.js')
const MazeValidate = require('../src/common/maze-validate.js')
const Physics = require('../src/common/physics.js')
const OFFICIAL = require('../src/common/official-levels.json')

function load(path, globals) {
  let code = fs.readFileSync(path, 'utf8')
  if (path.endsWith('.ux')) code = code.match(/<script>([\s\S]*?)<\/script>/)[1]
  code = code.replace(/^import .*$/gm, '').replace('export default', 'module.exports =')
  const scope = Object.assign({ module: { exports: {} }, console, Promise, setTimeout, clearTimeout }, globals)
  vm.runInNewContext(code, scope)
  return scope.module.exports
}
async function drain() { for (let i = 0; i < 20; i++) await Promise.resolve() }

// 静态六关与原有 seed 的生成结果完全相同。
assert.equal(OFFICIAL.length, 6)
for (const level of OFFICIAL) {
  const expected = MazeCore.buildLevel(level.cols, level.rows, level.seed, level.difficulty)
  assert.deepStrictEqual(level, { ...expected, name: level.name })
}

async function cacheAndSync() {
  const pendingReads = []
  const writes = []
  const disk = {}
  let failWrite = false
  const storage = {
    get: (options) => pendingReads.push(options),
    set(options) {
      writes.push(options.value)
      if (failWrite) options.fail()
      else { disk[options.key] = options.value; options.success() }
    },
    delete(options) {
      if (failWrite) options.fail()
      else { delete disk[options.key]; options.success() }
    }
  }
  let prepares = 0
  const validate = Object.assign({}, MazeValidate, { prepareLevel(slim) { prepares++; return MazeValidate.prepareLevel(slim) } })
  const SlotStore = load('src/common/slot-store.js', { storage, MazeValidate: validate })
  const store = new SlotStore()
  const ready = store.init()
  assert.strictEqual(store.init(), ready)
  assert.equal(pendingReads.length, 2)
  const first = MazeValidate.stripCrc(OFFICIAL[0])
  const second = { ...MazeValidate.stripCrc(OFFICIAL[1]), name: '同步关卡' }
  // 启动读取未结束时收到同步，旧读取不能覆盖新写入。
  const saving = store.saveValidated('a', MazeValidate.validateStoredLevel(second, false))
  await drain()
  assert.equal(writes.length, 0)
  pendingReads[0].success(JSON.stringify(first))
  pendingReads[1].success('{损坏内容')
  assert.equal(await saving, true)
  assert.equal(store.get('a').name, '同步关卡')
  assert.equal(store.get('b'), null)
  assert.equal(prepares, 0)
  const runningLevel = store.getLevel('a')
  assert.strictEqual(store.getLevel('a'), runningLevel)
  assert.equal(prepares, 1)
  failWrite = true
  assert.equal(await store.save('a', OFFICIAL[2]), false)
  assert.strictEqual(store.getLevel('a'), runningLevel)
  failWrite = false
  await Promise.all([store.save('a', OFFICIAL[2]), store.save('a', OFFICIAL[3])])
  assert.strictEqual(store.getLevel('a'), OFFICIAL[3])
  assert.equal(prepares, 1, '本地已生成的 render 不应重复构建')
  assert.equal(runningLevel.name, '同步关卡', '同步不能改变进行中的关卡')
  assert.equal(JSON.parse(disk.custom_a).name, OFFICIAL[3].name)

  const messages = []
  let listener
  let removed = 0
  const MazeSync = load('src/common/maze-sync.js', { MazeValidate, interconnModule: class {} })
  MazeSync.store = store
  const sync = new MazeSync({
    send: (message) => { messages.push(message); return Promise.resolve() },
    addListener: (callback) => { listener = callback }, removeListener: () => removed++
  })
  // 不创建 Levels 页面，模拟在 Home/Game/Complete 下同步。
  for (const pageName of ['Home', 'Game', 'Complete']) {
    const slim = { ...second, name: pageName }
    listener({ stat: 'put', slot: 'b', level: { ...slim, crc: MazeValidate.computeCrc(slim) } })
    await drain()
    assert.equal(store.get('b').name, pageName)
    assert.equal(messages[messages.length - 1].ok, true)
  }
  listener({ stat: 'list' })
  await drain()
  assert.equal(messages[messages.length - 1].slots.length, 2)
  assert.equal(pendingReads.length, 2, 'list 和同步不得重复读取 storage')
  listener({ stat: 'clear', slot: 'b' })
  await drain()
  assert.equal(store.get('b'), null)
  assert.equal(disk.custom_b, undefined)

  const definition = load('src/pages/levels/levels.ux', { OFFICIAL, DIFFICULTY_LABEL: {} })
  const page = Object.assign({}, definition, JSON.parse(JSON.stringify(definition.private)), {
    $app: { $def: { slotStore: store, progress: 1, progressReady: Promise.resolve() } }
  })
  page.onInit()
  for (let i = 0; i < 20; i++) { page.onShow(); await drain(); page.onHide() }
  assert.equal(pendingReads.length, 2)
  assert.equal(prepares, 1, '关卡卡片不能生成渲染数据')
  assert.equal(store.listeners.length, 0)
  page.onShow()
  await store.save('b', OFFICIAL[5])
  assert.equal(page.slots[1].level.name, 'LV 6')
  page.onHide()
  sync.destroy()
  assert.equal(removed, 1)

  let registrations = 0
  let destructions = 0
  const app = load('src/app.ux', {
    OFFICIAL, SlotStore, MazeSync: {}, vibrator: {},
    storage: { get: (o) => o.fail() },
    Handshake: class { register() { registrations++; return { destroy() { destructions++ } } } }
  })
  app.onCreate()
  assert.equal(registrations, 1)
  app.onDestroy()
  assert.equal(destructions, 1)
  console.log('✓ 缓存只读两次、启动读写竞争、写失败、写入顺序、全局同步、20 次页面返回零 IO/零 prepare')
}

function gameBudget() {
  let now = 0
  let steps = 0
  const countedPhysics = Object.assign({}, Physics, { step(...args) { steps++; return Physics.step(...args) } })
  const definition = load('src/pages/game/game.ux', { Physics: countedPhysics, Date: { now: () => now } })
  const level = { cols: 100, rows: 100, start: 5050, goal: 9999, render: { h: [], v: [] } }
  const page = Object.assign({}, definition, {
    level, collisionIndex: Physics.buildCollisionIndex(level), running: true, ready: true,
    state: Physics.createState(level), ax: -4.9, ay: 0, elapsed: 0, accumulator: 0,
    lastTick: 0, lastBallDraw: 0, lastHudDraw: 0, cellPx: 20, ballSize: 11, offX: 0, offY: 0
  })
  let ballWrites = 0
  let topWrites = 0
  let hudWrites = 0
  let ballValue
  let topValue
  let hudValue
  Object.defineProperty(page, 'ballLeft', { get: () => ballValue, set: (v) => { ballValue = v; ballWrites++ } })
  Object.defineProperty(page, 'ballTop', { get: () => topValue, set: (v) => { topValue = v; topWrites++ } })
  Object.defineProperty(page, 'timeText', { get: () => hudValue, set: (v) => { hudValue = v; hudWrites++ } })
  for (let i = 1; i <= 50; i++) { now = i * 20; page.tick() }
  assert.equal(steps, 50)
  assert.equal(ballWrites, 25)
  assert.equal(hudWrites, 5)
  assert.equal(page.timeText, '01.0')
  assert.equal(topWrites, 1, '未改变的纵坐标不得重复写入')
  assert.ok(Number.isFinite(page.ballLeft) && Number.isFinite(page.ballTop))
  const gameSource = fs.readFileSync('src/pages/game/game.ux', 'utf8')
  assert.ok(!gameSource.includes('ballTransform') && !/transform\s*:/.test(gameSource), '隔离包不得保留动态 transform 绑定')
  now += 1000
  page.tick()
  assert.equal(steps, 53, '长卡顿一次最多补算三步')
  assert.ok(page.accumulator < 20)
  assert.equal(page.timeText, '02.0')
  now += 20
  page.tick()
  assert.equal(steps, 54, '不得在下一 tick 继续追赶旧积压')
  // 重来立即归零并重绘，但保留已经构建的索引和会话资源。
  const index = page.collisionIndex
  page.resetRuntime()
  assert.strictEqual(page.collisionIndex, index)
  assert.equal(page.timeText, '00.0')
  assert.equal(page.elapsed, 0)
  console.log('✓ 1 秒内物理 50 步、球 25 次位置更新、HUD 5 次更新；长卡顿最多三步；无 transform 绑定')
}

cacheAndSync().then(gameBudget).catch((error) => { console.error(error); process.exitCode = 1 })
