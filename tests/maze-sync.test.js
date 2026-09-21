/**
 * maze-sync 校验测试：node tests/maze-sync.test.js
 */
const fs = require('fs')
const path = require('path')
const assert = require('assert')
const MazeCore = require('../src/common/maze-core.js')
const MazeValidate = require('../src/common/maze-validate.js')

const SAMPLE_DIR = path.resolve(__dirname, '../../迷宫生成器/samples')
const files = fs.readdirSync(SAMPLE_DIR).filter((f) => /^(easy|normal|hard|expert)-.*\.json$/.test(f))
assert.strictEqual(files.length, 4, '应有四组 sample')

/** 模拟手机端：剥离 render，追加元数据，计算 crc */
function toPayload(maze, extra) {
  const slim = Object.assign({}, maze, extra || {})
  delete slim.render
  const crc = MazeValidate.computeCrc(slim)
  return Object.assign({}, slim, { crc })
}

for (const f of files) {
  const maze = JSON.parse(fs.readFileSync(path.join(SAMPLE_DIR, f), 'utf8'))
  const payload = toPayload(maze, { seed: 123456789, difficulty: f.split('-')[0], name: '我的关卡 1' })
  const slimText = JSON.stringify(MazeValidate.stripCrc(payload))
  const bytes = Buffer.byteLength(slimText, 'utf8')
  assert.ok(bytes < 512, `${f} 精简体 ${bytes}B 应 < 512B`)

  const r = MazeValidate.validateLevel(payload)
  assert.ok(r.ok, `${f} 校验应通过: ${r.message}`)
  assert.strictEqual(r.payloadBytes, bytes)
  assert.deepStrictEqual(r.level.render.h, maze.render.h, `${f} render.h 重建不一致`)
  assert.deepStrictEqual(r.level.render.v, maze.render.v, `${f} render.v 重建不一致`)
  assert.ok(!('crc' in r.slim) && !('render' in r.slim), '精简体不应含 crc/render')

  // 生成器同 seed 一致性（sample 无 seed，此处仅验证 decode→hex 往返）
  assert.strictEqual(MazeCore.cellsToHex(MazeCore.decodeCells(maze.cells)), maze.cells)

  console.log(`✓ ${f}: 精简体 ${bytes}B, crc ${payload.crc}, h=${maze.render.h.length / 3} v=${maze.render.v.length / 3}`)
}

// 非法用例
const base = JSON.parse(fs.readFileSync(path.join(SAMPLE_DIR, files[0]), 'utf8'))
function expectReject(mutate, label) {
  const p = toPayload(base)
  mutate(p)
  const r = MazeValidate.validateLevel(p)
  assert.ok(!r.ok, `${label} 应被拒`)
  console.log(`✓ 拒绝 ${label}: ${r.message}`)
}
expectReject((p) => { p.cells = p.cells.slice(0, -1); p.crc = MazeValidate.computeCrc(MazeValidate.stripCrc(p)) }, '非法 cells 长度')
expectReject((p) => { p.cells = p.cells.slice(0, -1) + 'g'; p.crc = MazeValidate.computeCrc(MazeValidate.stripCrc(p)) }, '非 hex cells')
expectReject((p) => { p.crc = '00000000' }, '错误 crc')
expectReject((p) => { p.start = p.cols; p.crc = MazeValidate.computeCrc(MazeValidate.stripCrc(p)) }, '越界 start（非顶行）')
expectReject((p) => { p.goal = (p.rows - 1) * p.cols - 1; p.crc = MazeValidate.computeCrc(MazeValidate.stripCrc(p)) }, '越界 goal（非底行）')
expectReject((p) => { p.goal = p.rows * p.cols; p.crc = MazeValidate.computeCrc(MazeValidate.stripCrc(p)) }, '越界 goal（超出网格）')
expectReject((p) => { p.profile = 'phone'; p.crc = MazeValidate.computeCrc(MazeValidate.stripCrc(p)) }, '错误 profile')
expectReject((p) => { p.cols = 12; p.crc = MazeValidate.computeCrc(MazeValidate.stripCrc(p)) }, 'cols 超限')
expectReject((p) => { p.name = 'x'.repeat(1100); p.crc = MazeValidate.computeCrc(MazeValidate.stripCrc(p)) }, 'payload > 1024B')

// 自生成关卡与 crc32 参考值
assert.strictEqual(MazeCore.crc32IsoHdlc(Buffer.from('123456789')), 0xcbf43926, 'crc32 参考值')
const lvl = MazeCore.buildLevel(9, 17, 42, 'hard')
assert.strictEqual(lvl.cells.length, 153)
assert.ok(lvl.start < 9 && lvl.goal >= 16 * 9)
console.log('✓ crc32 参考值与自生成关卡结构正确')
console.log('maze-sync.test 全部通过')
