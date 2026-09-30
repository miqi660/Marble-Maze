const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const crypto = require('crypto')
const Physics = require('../src/common/physics.js')
const CustomLevels = require('../src/common/custom-levels.js')
const OFFICIAL = require('../src/common/official-levels.json')
const MazeCore = require('../src/common/maze-core.js')

function load(filename, globals) {
  const source = fs.readFileSync(filename, 'utf8')
  const code = source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '').replace('export default', 'module.exports =')
  const scope = Object.assign({ module: { exports: {} }, OFFICIAL, Physics, CustomLevels }, globals)
  vm.runInNewContext(code, scope)
  return scope.module.exports
}
function instance(definition, extra) {
  return Object.assign({}, definition, JSON.parse(JSON.stringify(definition.private)), extra)
}

// 源 pro-levels.json 的六个 maze 逐字段比对后记录的规范 JSON 哈希。
assert.equal(crypto.createHash('sha256').update(JSON.stringify(OFFICIAL)).digest('hex'),
  '2c0b382ae576d90aa6587460567bbcdcbad47fa4fe01965c6b6a32edb919ab68', '不得改变已准备的 Pro maze')
assert.equal(JSON.parse(fs.readFileSync('src/manifest.json')).config.designWidth, 336)
for (const name of ['home', 'settings', 'levels', 'game', 'complete']) {
  const source = fs.readFileSync(`src/pages/${name}/${name}.ux`, 'utf8')
  assert.ok(!/192px|490px|0\.96110897|@media/.test(source), name + ' 不得沿用 Band 舞台')
  assert.ok(/\.page\s*\{[^}]*background-color: #FAF8F3;/.test(source), name + ' 页面边缘必须是浅色')
  assert.ok(!/\.paper\s*\{[^}]*left: 16px;[^}]*width: 304px;/.test(source), name + ' 不得残留黑边 Paper')
}

const game = load('src/pages/game/game.ux')
// 自定义样本只在测试中生成，不修改或重生成产品关卡数据。
const custom = MazeCore.buildLevel(13, 17, 42, 'custom')
for (const level of [...OFFICIAL, ...require('./fixtures/band-levels.json'), custom]) {
  const page = instance(game, { pack: level === custom ? 'custom' : 'official', index: 0,
    resetRuntime() {}, stopPreparation() {}, startLoop() {} })
  page.setupLevel(level)
  const cell = Math.min(296 / level.cols, 294 / level.rows)
  assert.equal(page.cellPx, cell)
  assert.equal(page.boardWidth, level.cols * cell)
  assert.equal(page.boardHeight, level.rows * cell)
  assert.equal(page.boardLeft, 16 + (296 - page.boardWidth) / 2)
  assert.equal(page.boardTop, 89 + (294 - page.boardHeight) / 2)
  assert.equal(page.goalLeft, (level.goal % level.cols) * cell)
  assert.equal(page.goalTop, Math.floor(level.goal / level.cols) * cell)
  assert.equal(page.ballSize, Math.round(0.56 * cell))
  assert.ok(page.ballBorderWidth >= 2 && page.ballBorderWidth <= 3)
  assert.ok(page.boardLeft >= 16 && page.boardLeft + page.boardWidth + 7 <= 336 - 16, '本体与阴影左右至少留 16px')
  assert.ok(page.boardTop >= 79 + 10, '棋盘与放大后的 HUD 阴影至少间隔 10px')
  assert.ok(page.boardTop + page.boardHeight + 8 <= 401 - 10, '阴影与上移后的重来按钮至少间隔 10px')
  const walls = page.walls
  page.state = Physics.createState(level)
  page.syncBall()
  const ballPosition = JSON.parse(page.ballStyle.transform)
  assert.equal(parseFloat(ballPosition.translateX), Math.round(page.state.x * cell - page.ballSize / 2))
  assert.equal(parseFloat(ballPosition.translateY), Math.round(page.state.y * cell - page.ballSize / 2))
  assert.strictEqual(page.walls, walls, '球刷新不重建静态墙体')
}
assert.ok(Math.round(0.56 * Math.min(296 / OFFICIAL[0].cols, 294 / OFFICIAL[0].rows)) > 12)

const definition = load('src/pages/levels/levels.ux', { DIFFICULTY_LABEL: {} })
for (let progress = 0; progress <= OFFICIAL.length; progress++) {
  const page = instance(definition, { $app: { $def: { progress } } })
  page.buildCards()
  assert.equal(page.progressWidth, 248 * progress / OFFICIAL.length)
  page.officialCards.forEach((card, index) => {
    assert.equal(card.left, 16 + index % 3 * 93)
    assert.equal(card.top, 137 + Math.floor(index / 3) * 108)
    assert.equal(card.locked, index > progress)
    assert.equal(card.cleared, index < progress)
    assert.equal(card.selected, index === Math.min(progress, OFFICIAL.length - 1))
  })
}
console.log('✓ Pro 数据哈希、336 舞台、3×2 网格、动态进度、Official/Custom 等比棋盘与大球尺寸通过')
