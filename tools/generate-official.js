/** 离线生成固定六关：node tools/generate-official.js */
const fs = require('fs')
const path = require('path')
const MazeCore = require('../src/common/maze-core.js')
const definitions = [
  ['easy', 90221], ['easy', 90222], ['normal', 55011],
  ['normal', 55012], ['hard', 99501], ['hard', 99502]
]
const levels = definitions.map(([difficulty, seed], index) => {
  const preset = MazeCore.PRESETS[difficulty]
  return Object.assign(MazeCore.buildLevel(preset.cols, preset.rows, seed, difficulty), { name: 'LV ' + (index + 1) })
})
fs.writeFileSync(path.join(__dirname, '../src/common/official-levels.json'), JSON.stringify(levels) + '\n')
console.log('已生成 Official 六关静态数据')
