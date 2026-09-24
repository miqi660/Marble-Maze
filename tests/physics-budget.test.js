const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const Core = require('../src/common/maze-core.js')
const levels = require('../src/common/official-levels.json')
let squareRoots = 0
const countedMath = Object.create(Math)
countedMath.sqrt = (value) => { squareRoots++; return Math.sqrt(value) }
const scope = { module: { exports: {} }, Math: countedMath }
vm.runInNewContext(fs.readFileSync('src/common/physics.js', 'utf8'), scope)
const Physics = scope.module.exports

// 直墙正面接触：仍反弹、仍保持球半径，整个物理步不需要开方。
const level = { cols: 3, rows: 3, render: { h: [0, 1, 3], v: [] } }
const index = Physics.buildCollisionIndex(level)
const state = { x: 1.5, y: 1.28, vx: 0, vy: -1 }
Physics.step(state, index, 3, 3, 0, 0)
assert.equal(squareRoots, 0)
assert.ok(state.y >= 1 + Physics.CONST.R)
assert.ok(state.vy > 0)

// 端点碰撞仍按圆形距离处理，不能替换成矩形墙角。
const endpoint = { cols: 3, rows: 3, render: { h: [1, 1, 1], v: [] } }
const cornerState = { x: 0.82, y: 0.80, vx: 0, vy: 0 }
Physics.step(cornerState, Physics.buildCollisionIndex(endpoint), 3, 3, 0, 0)
assert.ok(squareRoots > 0)
assert.ok(Math.hypot(cornerState.x - 1, cornerState.y - 1) >= Physics.CONST.R)

// 单步位移和修正遍数有界：过大的 dt 不突破调用方的固定步长契约。
let queries = 0
const buckets = new Proxy(index, { get(target, key) {
  if (/^\d+$/.test(String(key))) queries++
  return target[key]
} })
const fast = { x: 1.5, y: 2, vx: 12, vy: 12 }
const reference = { ...fast }
Physics.step(fast, buckets, 3, 3, 1, 1, 1000)
Physics.step(reference, index, 3, 3, 1, 1, Physics.CONST.DT)
assert.deepStrictEqual(fast, reference)
assert.ok(queries <= Physics.CONST.MAX_SUB_STEPS * Physics.CONST.MAX_COLLISION_PASSES)
assert.ok(Physics.CONST.MAX_SPEED * Physics.CONST.DT / Physics.CONST.MAX_SUB_STEPS <= Physics.CONST.SUB_STEP)

// 当前墙段已经最大化合并：同一行/列不能再出现相邻或重叠段。
const samples = levels.concat(Object.keys(Core.PRESETS).map((name) => {
  const p = Core.PRESETS[name]
  return Core.buildLevel(p.cols, p.rows, 42, name)
}))
for (const maze of samples) {
  for (const axis of ['h', 'v']) {
    const runs = maze.render[axis]
    for (let i = 3; i < runs.length; i += 3) {
      const line = axis === 'h' ? 1 : 0
      const along = axis === 'h' ? 0 : 1
      if (runs[i + line] === runs[i - 3 + line]) {
        assert.ok(runs[i + along] > runs[i - 3 + along] + runs[i - 1], '相邻墙段应已合并')
      }
    }
  }
}
console.log('✓ 直墙碰撞零开方、圆形端点保留、子步与修正上限、静态墙段最大合并通过')
