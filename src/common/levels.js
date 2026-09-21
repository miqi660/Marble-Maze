/** Official 使用离线静态数据；Custom 数据由 App 的 SlotStore 管理。 */
import MazeCore from './maze-core.js'
import MazeValidate from './maze-validate.js'
import officialLevels from './official-levels.json'

export const OFFICIAL = officialLevels
export const DIFFICULTY_LABEL = { easy: '简单', normal: '普通', hard: '困难', expert: '专家', custom: '自定义' }

/** 静态关卡只读；球状态与碰撞索引由 Game 单独持有。 */
export function buildOfficial(index) {
  return OFFICIAL[index]
}

/** 一次校验生成的完整结果直接复用。 */
export function inflate(slim) {
  const result = MazeValidate.validateStoredLevel(slim)
  return result.ok ? result.level : null
}

/** 手环端本地随机生成一关（interconnect 不可用时的退化路径） */
export function randomCustom(difficulty, slot) {
  const p = MazeCore.PRESETS[difficulty] || MazeCore.PRESETS.normal
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
  const level = MazeCore.buildLevel(p.cols, p.rows, seed, difficulty)
  level.id = 'local-' + seed.toString(16)
  level.name = '随机 ' + slot.toUpperCase()
  return level
}
