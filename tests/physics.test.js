/**
 * 物理测试：node tests/physics.test.js
 * 随机 seed 迷宫下模拟固定倾斜 N 步，断言球从不进入墙内、无 NaN
 */
const assert = require('assert')
const MazeCore = require('../src/common/maze-core.js')
const Physics = require('../src/common/physics.js')

const R = Physics.CONST.R
const TOL = 1e-3
const STEPS = 3000
const tilts = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7, 0.7], [-0.7, 0.7], [0.3, -1], [-1, 0.5], [0.05, 0.05]
]
let checks = 0

for (const name of Object.keys(MazeCore.PRESETS)) {
  const p = MazeCore.PRESETS[name]
  for (let s = 0; s < 6; s++) {
    const seed = (s * 7919 + name.length * 131) >>> 0
    const level = MazeCore.buildLevel(p.cols, p.rows, seed, name)
    const cells = MazeCore.decodeCells(level.cells)
    for (const [tx, ty] of tilts) {
      const st = Physics.createState(level)
      for (let i = 0; i < STEPS; i++) {
        // 每 300 步换一次方向，避免球一直贴死角
        const k = Math.floor(i / 300) % 2 === 0 ? 1 : -1
        Physics.step(st, cells, p.cols, p.rows, tx * k, ty * k)
        assert.ok(Number.isFinite(st.x) && Number.isFinite(st.y) && Number.isFinite(st.vx) && Number.isFinite(st.vy), 'NaN/Infinity')
        const d = Physics.minWallDistance(st, cells, p.cols, p.rows)
        assert.ok(d >= R - TOL, `${name} seed=${seed} tilt=(${tx},${ty}) step=${i}: 球进入墙内 dist=${d.toFixed(4)} at (${st.x.toFixed(3)},${st.y.toFixed(3)})`)
        assert.ok(st.x >= R - TOL && st.x <= p.cols - R + TOL && st.y >= R - TOL && st.y <= p.rows - R + TOL, '越出外框')
        checks++
      }
    }
  }
}
console.log(`✓ ${checks} 次帧检查：无穿墙、无 NaN`)

// 通关判定
const lv = MazeCore.buildLevel(7, 13, 1, 'easy')
const st = Physics.createState(lv)
assert.ok(!Physics.reachedGoal(st, lv))
st.x = (lv.goal % 7) + 0.5
st.y = Math.floor(lv.goal / 7) + 0.5 + 0.3
assert.ok(Physics.reachedGoal(st, lv))
st.y += 0.1
assert.ok(!Physics.reachedGoal(st, lv))
console.log('✓ 通关判定正确')
console.log('physics.test 全部通过')
