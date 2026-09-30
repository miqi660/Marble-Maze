const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const crypto = require('crypto')
const Physics = require('../src/common/physics.js')
const CustomLevels = require('../src/common/custom-levels.js')
const OFFICIAL = require('../src/common/official-levels.json')

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
}

const game = load('src/pages/game/game.ux')
for (const level of [...OFFICIAL, ...require('./fixtures/band-levels.json')]) {
  const page = instance(game, { pack: 'official', index: 0,
    resetRuntime() {}, stopPreparation() {}, startLoop() {} })
  page.setupLevel(level)
  const cell = Math.min(269 / level.cols, 290 / level.rows)
  assert.equal(page.cellPx, cell)
  assert.equal(page.boardWidth, level.cols * cell)
  assert.equal(page.boardHeight, level.rows * cell)
  assert.equal(page.boardLeft, 32 + (269 - page.boardWidth) / 2)
  assert.equal(page.boardTop, 93 + (290 - page.boardHeight) / 2)
  assert.equal(page.goalLeft, (level.goal % level.cols) * cell)
  assert.equal(page.goalTop, Math.floor(level.goal / level.cols) * cell)
  assert.equal(page.ballSize, Math.round(0.56 * cell))
  assert.ok(page.ballBorderWidth >= 2 && page.ballBorderWidth <= 3)
  assert.ok(page.boardTop + page.boardHeight + 8 < 397, '阴影不能覆盖重来按钮')
  const walls = page.walls
  page.state = Physics.createState(level)
  page.syncBall()
  assert.strictEqual(page.walls, walls, '球刷新不重建静态墙体')
}
assert.ok(Math.round(0.56 * Math.min(269 / OFFICIAL[0].cols, 290 / OFFICIAL[0].rows)) > 12)

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
