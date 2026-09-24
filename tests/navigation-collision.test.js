const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const CustomSlots = require('../src/common/custom-slots.js')
const Physics = require('../src/common/physics.js')
const MazeCore = require('../src/common/maze-core.js')

function readUx(path, globals) {
  const script = fs.readFileSync(path, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '').replace('export default', 'module.exports =')
  const context = Object.assign({ module: { exports: {} }, CustomSlots, console, Promise }, globals)
  vm.runInNewContext(script, context)
  return context.module.exports
}

// 以全部合并墙段作为独立全量碰撞对照，验证按 cell 索引没有漏墙。
let frames = 0
for (const difficulty of Object.keys(MazeCore.PRESETS)) {
  const preset = MazeCore.PRESETS[difficulty]
  for (const seed of [1, 90221, 99502]) {
    const level = MazeCore.buildLevel(preset.cols, preset.rows, seed, difficulty)
    const decoded = MazeCore.decodeCells(level.cells)
    const cached = Physics.createState(level)
    const uncached = Physics.createState(level)
    const local = Physics.buildCollisionIndex(level)
    const all = []
    const { h, v } = level.render
    for (let j = 0; j < h.length; j += 3) all.push([h[j], h[j + 1], h[j] + h[j + 2], h[j + 1]])
    for (let j = 0; j < v.length; j += 3) all.push([v[j], v[j + 1], v[j], v[j + 1] + v[j + 2]])
    const full = new Array(level.cols * level.rows).fill(all)
    for (const bucket of local) assert.equal(new Set(bucket).size, bucket.length)
    for (let i = 0; i < 3000; i++) {
      const tx = Math.sin(i / 61)
      const ty = Math.cos(i / 89)
      Physics.step(cached, local, level.cols, level.rows, tx, ty, Physics.CONST.DT)
      Physics.step(uncached, full, level.cols, level.rows, tx, ty, Physics.CONST.DT)
      assert.deepStrictEqual(cached, uncached)
      assert.ok(Physics.minWallDistance(cached, decoded, level.cols, level.rows) >= Physics.CONST.R - 0.001)
      frames++
    }
  }
}
console.log(`✓ ${frames} 帧 cell 索引与全量合并墙段结果一致，无穿墙`)

async function navigationTest() {
  const calls = []
  let pages = [{ name: 'pages/home' }, { name: 'pages/levels' }, { name: 'pages/complete' }]
  const router = {
    getPages: () => pages,
    back: (args) => calls.push(['back', args.path]),
    replace: (args) => calls.push(['replace', args.uri]),
    push: (args) => calls.push(['push', args.uri])
  }
  const context = { router }
  vm.runInNewContext(fs.readFileSync('src/common/navigation.js', 'utf8')
    .replace(/^import .*$/gm, '').replace('export function', 'function'), context)
  const returnToPage = context.returnToPage
  const complete = readUx('src/pages/complete/complete.ux', { router, returnToPage, OFFICIAL: new Array(6) })
  complete.onShow()
  complete.onBack()
  complete.onBackPress()
  assert.deepStrictEqual(calls, [['back', '/pages/levels']])
  pages = [{ name: 'pages/complete' }]
  complete.onShow()
  complete.onBackPress()
  assert.deepStrictEqual(calls[1], ['replace', '/pages/levels'])

  const slotCache = { a: null, b: null }
  const store = { get: (slot) => slotCache[slot], ready: Promise.resolve(), subscribe: () => () => {} }
  const levels = readUx('src/pages/levels/levels.ux', {
    router, returnToPage, OFFICIAL: new Array(6).fill({ difficulty: 'easy' }), DIFFICULTY_LABEL: {},

  })
  const page = Object.assign({}, levels, JSON.parse(JSON.stringify(levels.private)), {
    $valid: true, $app: { $def: { progress: 2, progressReady: Promise.resolve(), slotStore: store } }
  })
  page.onInit()
  page.onShow()
  const cards = page.officialCards
  page.onHide()
  page.onShow()
  assert.strictEqual(page.officialCards, cards, '进度未变时复用卡片')
  assert.ok(!('visible' in page), '页面显示不能再控制整树销毁')
  await Promise.resolve()
  assert.equal(page.officialCards.length, 6)
  const before = calls.length
  page.pageIndex = 1
  page.onTouchStart({ touches: [{ clientX: 20, clientY: 100 }] })
  page.onTouchEnd({ changedTouches: [{ clientX: 100, clientY: 105 }] })
  assert.equal(calls.length, before, 'Custom 滑回 Official 不得退出')
  assert.equal(page.pageIndex, 0)
  pages = [{ name: 'pages/home' }, { name: 'pages/levels' }]
  page.onTouchStart({ touches: [{ clientX: 20, clientY: 100 }] })
  page.onTouchEnd({ changedTouches: [{ clientX: 90, clientY: 105 }] })
  page.onBackPress()
  assert.equal(calls.length, before + 1, '手势与返回事件同时到达只能导航一次')
  assert.deepStrictEqual(calls[calls.length - 1], ['back', '/pages/home'])

  let subscribes = 0
  let unsubscribes = 0
  let clears = 0
  const timers = new Map()
  let timerId = 0
  let sensorCallback
  const game = readUx('src/pages/game/game.ux', {
    Physics, returnToPage, gameDisplay: { start() {}, stop() {} },
    sensor: { subscribeAccelerometer(o) { subscribes++; sensorCallback = o.callback }, unsubscribeAccelerometer() { unsubscribes++ } },
    setInterval: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id },
    clearInterval: (id) => { assert.ok(timers.delete(id)); clears++ }
  })
  game.$app = { $def: { brightnessReady: Promise.resolve(), getBrightness: () => 50 } }
  game.onShow()
  game.onShow()
  assert.deepStrictEqual(Array.from(timers.values()).map(t => t.ms), [20, 40])
  game.setupLevel(MazeCore.buildLevel(7, 13, 7, 'easy'))
  const wallNodes = game.walls
  const collisionIndex = game.collisionIndex
  const activeTimers = Array.from(timers.keys())
  game.onRestart()
  assert.strictEqual(game.walls, wallNodes, '重来不重建静态墙节点')
  assert.strictEqual(game.collisionIndex, collisionIndex)
  assert.deepStrictEqual(Array.from(timers.keys()), activeTimers, '重来不重建物理与显示定时器')
  const ballStyle = game.ballStyle
  game.onHide()
  game.onDestroy()
  game.renderFrame()
  assert.strictEqual(game.ballStyle, ballStyle, '退出后迟到显示回调不能改动视图')
  game.ax = game.ay = 0
  sensorCallback({ x: 9.8, y: 9.8 })
  assert.equal(game.ax, 0)
  assert.equal(subscribes, 1)
  assert.equal(unsubscribes, 1)
  assert.equal(clears, 2)
  assert.equal(timers.size, 0)
  console.log('✓ 返回目标存在/缺失、重复返回、单页条件渲染、卡片复用、Official 右滑、传感器幂等清理通过')
}
navigationTest().catch((error) => { console.error(error); process.exitCode = 1 })
