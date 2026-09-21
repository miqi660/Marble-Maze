/**
 * 关卡表：Official 6 关固定 seed + Custom A/B 槽位读写
 * 存储 key custom_a / custom_b 只存精简体（不含 render、不含 crc）
 */
import storage from '@system.storage'
import MazeCore from './maze-core.js'
import MazeValidate from './maze-validate.js'

/** Official 关卡 seed 表（运行时确定性生成） */
export const OFFICIAL = [
  { name: 'LV 1', difficulty: 'easy', seed: 90221 },
  { name: 'LV 2', difficulty: 'easy', seed: 90222 },
  { name: 'LV 3', difficulty: 'normal', seed: 55011 },
  { name: 'LV 4', difficulty: 'normal', seed: 55012 },
  { name: 'LV 5', difficulty: 'hard', seed: 99501 },
  { name: 'LV 6', difficulty: 'hard', seed: 99502 }
]

export const SLOT_KEYS = { a: 'custom_a', b: 'custom_b' }
export const DIFFICULTY_LABEL = { easy: '简单', normal: '普通', hard: '困难', expert: '专家', custom: '自定义' }

/** 生成 Official 第 index 关（含 render） */
export function buildOfficial(index) {
  const def = OFFICIAL[index]
  const p = MazeCore.PRESETS[def.difficulty]
  const level = MazeCore.buildLevel(p.cols, p.rows, def.seed, def.difficulty)
  level.name = def.name
  return level
}

/** 精简体 → 带 render 的完整关卡 */
export function inflate(slim) {
  if (!MazeValidate.validateStoredLevel(slim).ok) return null
  const cells = MazeCore.decodeCells(slim.cells)
  return Object.assign({}, slim, { render: MazeCore.compileRuns(cells, slim.cols, slim.rows) })
}

/** 读取槽位精简体，回调 (slim|null) */
export function loadSlot(slot, cb) {
  storage.get({
    key: SLOT_KEYS[slot],
    success(v) {
      let slim = null
      try {
        const parsed = v ? JSON.parse(v) : null
        if (MazeValidate.validateStoredLevel(parsed).ok) slim = parsed
      } catch (e) {}
      cb(slim)
    },
    fail() {
      cb(null)
    }
  })
}

/** 写入槽位精简体（自动剥离 render / crc），回调 (ok) */
export function saveSlot(slot, level, cb) {
  const slim = Object.assign({}, level)
  delete slim.render
  delete slim.crc
  storage.set({
    key: SLOT_KEYS[slot],
    value: JSON.stringify(slim),
    success() {
      cb && cb(true)
    },
    fail() {
      cb && cb(false)
    }
  })
}

export function clearSlot(slot, cb) {
  storage.delete({
    key: SLOT_KEYS[slot],
    success() {
      cb && cb(true)
    },
    fail() {
      cb && cb(false)
    }
  })
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
