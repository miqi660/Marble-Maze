const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const CustomLevels = require('../src/common/custom-levels.js')
const Physics = require('../src/common/physics.js')
const MazeCore = require('../src/common/maze-core.js')
const Validate = require('../src/common/maze-validate.js')
function readUx(path, globals) {
  const script = fs.readFileSync(path, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '').replace('export default', 'module.exports =')
  const context = Object.assign({ module: { exports: {} }, CustomLevels, console, Promise }, globals)
  vm.runInNewContext(script, context)
  return context.module.exports
}
let now = 0
const game = readUx('src/pages/game/game.ux', { Physics, OFFICIAL: new Array(6), Date: { now: () => now } })
function simulate(hz) {
  now = 0
  const page = Object.assign({}, game, {
    running: true, ready: true, disposed: false, finished: false, elapsed: 0, accumulator: 0, lastTick: 0, lastBallDraw: 0, lastHudDraw: 0,
    level: { cols: 100, rows: 100, goal: 9999 }, collisionIndex: new Array(10000).fill([]),
    state: { x: 50, y: 50, vx: 0, vy: 0 }, ax: -4.9, ay: 0, syncBall() {}
  })
  for (let i = 1; i <= hz; i++) { now = Math.round(i * 1000 / hz); page.tick() }
  page.renderFrame()
  assert.equal(page.timeText, '01.0')
  return page
}
const reference = simulate(50)
for (const hz of [25, 60]) assert.deepStrictEqual(simulate(hz).state, reference.state)
const stalled = simulate(50)
now += 2000
stalled.tick()
stalled.renderFrame()
assert.equal(stalled.timeText, '03.0')
assert.ok(stalled.accumulator < 20)
assert.equal(Physics.AXIS_SIGN.y, 1)
const level = MazeCore.buildLevel(7, 13, 123, 'easy')
assert.ok(Validate.validateStoredLevel(Validate.stripCrc(level)).ok)
for (const bad of [null, {}, { ...level, cols: 0 }, { ...level, cells: 'XYZ' }, { ...level, goal: -1 }]) {
  assert.equal(Validate.validateStoredLevel(bad).ok, false)
}
async function progressTest() {
  let read
  const writes = []
  const app = readUx('src/app.ux', {
    gameDisplay: { start() { return {} }, stop() {}, update() {} },
    OFFICIAL: new Array(6), storage: { get(o) { if (o.key === 'progress') read = o }, set(o) { writes.push(o) } },
    Handshake: class { register() { return { destroy() {} } } }, vibrator: {}, MazeSync: {}, SlotStore: class { init() {} }
  })
  app.progress = 0
  app.onCreate()
  app.markCleared(1)
  read.success('8')
  await app.progressReady
  await Promise.resolve()
  assert.equal(app.progress, 6)
  assert.equal(writes[0].value, '6')
  const pages = readUx('src/pages/levels/levels.ux', { OFFICIAL: new Array(6).fill({ difficulty: 'easy' }) })
  const page = Object.assign({}, pages, { $valid: true, $app: { $def: Object.assign(app, { slotStore: { list: () => [] } }) }, customCards: [], officialCards: [] })
  page.onInit()
  await Promise.resolve()
  assert.equal(page.officialCards.length, 6)
  assert.equal(page.officialCards[5].selected, true)
  console.log('审查回归通过：25/50/60Hz 一致、卡顿计时、存储校验、旧进度迁移和异步卡片刷新')
}
progressTest().catch(e => { console.error(e); process.exitCode = 1 })
