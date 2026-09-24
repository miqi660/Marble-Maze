const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const CustomLevels = require('../src/common/custom-levels.js')
const MazeCore = require('../src/common/maze-core.js')
const MazeValidate = require('../src/common/maze-validate.js')
const Physics = require('../src/common/physics.js')
const OFFICIAL = require('../src/common/official-levels.json')

function load(path, globals) {
  let code = fs.readFileSync(path, 'utf8')
  if (path.endsWith('.ux')) code = code.match(/<script>([\s\S]*?)<\/script>/)[1]
  code = code.replace(/^import .*$/gm, '').replace('export default', 'module.exports =')
  const scope = Object.assign({ module: { exports: {} }, CustomLevels, console, Promise, setTimeout, clearTimeout }, globals)
  vm.runInNewContext(code, scope)
  return scope.module.exports
}
async function drain() { for (let i = 0; i < 20; i++) await Promise.resolve() }

// 静态六关可直接加载，且预编译渲染数据与 cells 一致。
assert.equal(OFFICIAL.length, 6)
for (const level of OFFICIAL) {
  const result = MazeValidate.validateStoredLevel(level, false)
  assert.equal(result.ok, true, result.message)
  assert.deepStrictEqual(level.render, MazeCore.compileRuns(
    MazeCore.decodeCells(level.cells), level.cols, level.rows
  ))
}

async function cacheAndSync() {
  const disk = { custom_storage_version: '2', custom_01: JSON.stringify(MazeValidate.stripCrc(OFFICIAL[0])) }
  let reads = 0
  const writes = []
  let failWrite = false
  const storage = {
    get(options) { reads++; options.success(Object.prototype.hasOwnProperty.call(disk, options.key) ? disk[options.key] : '') },
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
  assert.strictEqual(await ready, true)
  assert.equal(reads, 13, '版本标记和 12 个数字键各读取一次')
  assert.equal(store.count(), 1)
  const second = { ...MazeValidate.stripCrc(OFFICIAL[1]), name: '同步关卡' }
  const appended = await store.append(second)
  assert.strictEqual(appended.ok, true)
  assert.strictEqual(appended.index, 1)
  assert.equal(store.get(1).name, '同步关卡')
  assert.equal(prepares, 0)
  const runningLevel = store.getLevel(1)
  assert.strictEqual(store.getLevel(1), runningLevel)
  assert.equal(prepares, 1)
  failWrite = true
  assert.strictEqual((await store.replace(1, OFFICIAL[2])).ok, false)
  assert.strictEqual(store.getLevel(1), runningLevel)
  failWrite = false
  await Promise.all([store.replace(1, OFFICIAL[2]), store.replace(1, OFFICIAL[3])])
  assert.strictEqual(store.getLevel(1), OFFICIAL[3])
  assert.equal(prepares, 1, '本地已生成的 render 不应重复构建')
  assert.equal(runningLevel.name, '同步关卡', '同步不能改变进行中的关卡')
  assert.equal(JSON.parse(disk.custom_02).name, OFFICIAL[3].name)

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
  const pageNames = ['Home', 'Game', 'Complete']
  for (let i = 0; i < pageNames.length; i++) {
    const pageName = pageNames[i]
    const slim = { ...second, name: pageName }
    const level = { ...slim, crc: MazeValidate.computeCrc(slim) }
    await listener({ stat: 'replace', index: 1, level })
    assert.equal(store.get(1).name, pageName)
    assert.equal(messages[messages.length - 1].ok, true)
  }
  await listener({ stat: 'list' })
  assert.equal(messages[messages.length - 1].levels.length, 2)
  assert.equal(reads, 13, 'list 和同步不得重复读取 storage')
  await listener({ stat: 'remove', index: 1 })
  assert.equal(store.count(), 1)
  assert.equal(disk.custom_02, undefined)

  const definition = load('src/pages/levels/levels.ux', { OFFICIAL, DIFFICULTY_LABEL: {} })
  const page = Object.assign({}, definition, JSON.parse(JSON.stringify(definition.private)), {
    $app: { $def: { slotStore: store, progress: 1, progressReady: Promise.resolve() } }
  })
  page.onInit()
  for (let i = 0; i < 20; i++) { page.onShow(); await drain(); page.onHide() }
  assert.equal(reads, 13)
  assert.equal(prepares, 1, '关卡卡片不能生成渲染数据')
  assert.equal(store.listeners.length, 0)
  page.onShow()
  await store.append(OFFICIAL[5])
  assert.equal(page.customCards[1].level.name, 'LV 6')
  page.onHide()
  sync.destroy()
  assert.equal(removed, 1)

  let registrations = 0
  let destructions = 0
  const app = load('src/app.ux', {
    OFFICIAL, SlotStore, MazeSync: {}, vibrator: {},
    gameDisplay: { start() { return {} }, stop() {}, update() {} },
    storage: { get: (o) => o.fail() },
    Handshake: class { register() { registrations++; return { destroy() { destructions++ } } } }
  })
  app.onCreate()
  assert.equal(registrations, 1)
  app.onDestroy()
  assert.equal(destructions, 1)
  console.log('✓ 版本与连续列表启动读取、写失败保护、结构队列、全局同步、20 次页面返回零额外 IO/零 prepare')
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
  let positionWrites = 0
  let positionValue
  Object.defineProperty(page, 'ballStyle', { get: () => positionValue, set: (value) => { positionValue = value; positionWrites++ } })
  let ballDraws = 0
  const syncBall = page.syncBall
  page.syncBall = function () { ballDraws++; syncBall.call(this) }
  let topWrites = 0
  let hudWrites = 0
  let ballValue
  let topValue
  let hudValue
  Object.defineProperty(page, 'ballLeft', { get: () => ballValue, set: (v) => { ballValue = v; ballWrites++ } })
  Object.defineProperty(page, 'ballTop', { get: () => topValue, set: (v) => { topValue = v; topWrites++ } })
  Object.defineProperty(page, 'timeText', { get: () => hudValue, set: (v) => { hudValue = v; hudWrites++ } })
  for (let i = 1; i <= 50; i++) {
    now = i * 20
    const before = positionWrites
    page.tick()
    assert.equal(positionWrites, before, '普通物理 tick 不得写入球 UI')
    if (i % 2 === 0) page.renderFrame()
  }
  assert.equal(steps, 50)
  assert.equal(ballDraws, 25, '小球由独立 40ms 定时器绘制')
  assert.ok(ballWrites > 0 && ballWrites <= 25, '整数坐标变化时才写入位置')
  assert.equal(hudWrites, 5)
  assert.equal(page.timeText, '01.0')
  assert.equal(topWrites, 1, '未改变的纵坐标不得重复写入')
  assert.equal(positionWrites, ballWrites, '每次位移只提交一次绑定样式')
  const beforePositionWrites = positionWrites
  page.syncBall()
  assert.equal(positionWrites, beforePositionWrites, '位置未改变时不重复提交样式')
  assert.ok(Number.isFinite(page.ballLeft) && Number.isFinite(page.ballTop))
  const gameSource = fs.readFileSync('src/pages/game/game.ux', 'utf8')
  assert.deepStrictEqual(Object.keys(positionValue), ['transform'])
  assert.deepStrictEqual(JSON.parse(positionValue.transform), { translateX: page.ballLeft + 'px', translateY: page.ballTop + 'px' })
  assert.ok(!gameSource.includes('ballPosition'), '动态绑定不再包含 left/top CSS')
  assert.match(gameSource, /\.ball\s*\{\s*left: 0px;\s*top: 0px;/)
  for (let cols = 7; cols <= 11; cols++) {
    for (let rows = 13; rows <= 20; rows++) {
      const size = Math.round(0.56 * Math.min(184 / cols, 286 / rows))
      const rule = gameSource.match(new RegExp('\\.ball-size-' + size + '\\s*\\{([^}]+)\\}'))
      assert.ok(rule, '每种允许的关卡尺寸都应有静态球样式')
      assert.ok(rule[1].includes('width: ' + size + 'px'))
      assert.ok(rule[1].includes('height: ' + size + 'px'))
      assert.ok(rule[1].includes('border-radius: ' + Math.ceil(size / 2) + 'px'))
      assert.ok(rule[1].includes('border-width: ' + (size >= 10 ? 3 : 2) + 'px'))
    }
  }
  now += 1000
  page.tick()
  page.renderFrame()
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
  // 两个定时器都存在抖动，显示仍只按自己的回调刷新，没有第二道限流。
  ballDraws = 0
  const drawnAt = []
  page.syncBall = function () { ballDraws++; drawnAt.push(now); syncBall.call(this) }
  const baselineSteps = steps
  for (let i = 0; i < 50; i++) {
    now += i % 2 === 0 ? 21 : 19
    page.tick()
    if (i % 2 === 1) page.renderFrame()
  }
  assert.equal(steps - baselineSteps, 50)
  assert.equal(ballDraws, 25, '物理 21/19ms 抖动不应改变 UI 25Hz 预算')
  const beforeJitterDraws = ballDraws
  for (let i = 0; i < 25; i++) { now += i % 2 === 0 ? 41 : 39; page.renderFrame() }
  assert.equal(ballDraws - beforeJitterDraws, 25, 'UI 41/39ms 抖动不能额外丢帧')
  assert.ok(drawnAt.slice(1).every((time, i) => time - drawnAt[i] <= 41))
  const beforeHidden = ballDraws
  page.running = false
  page.renderFrame()
  assert.equal(ballDraws, beforeHidden, '隐藏后迟到显示回调不得刷新')
  console.log('✓ 物理 50Hz / 球变换 25Hz / HUD 5Hz 分离；抖动不额外丢帧；长卡顿补算有界')
}

cacheAndSync().then(gameBudget).catch((error) => { console.error(error); process.exitCode = 1 })
