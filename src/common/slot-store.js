import storage from '@system.storage'
import MazeValidate from './maze-validate.js'

import CustomSlots from './custom-slots.js'

const SLOT_KEYS = {}
CustomSlots.keys.forEach((slot) => { SLOT_KEYS[slot] = 'custom_' + slot })

/** App 持有的唯一槽位缓存；页面只读，所有写入串行提交到存储和缓存。 */
export default class SlotStore {
  constructor() {
    this.entries = {}
    this.listeners = []
    this.ready = null
    this.queues = {}
    CustomSlots.keys.forEach((slot) => {
      this.entries[slot] = null
      this.queues[slot] = Promise.resolve()
    })
  }

  init() {
    if (this.ready) return this.ready
    this.ready = Promise.all(CustomSlots.keys.map((slot) => new Promise((resolve) => {
      storage.get({
        key: SLOT_KEYS[slot],
        success: (value) => {
          try {
            const result = MazeValidate.validateStoredLevel(value ? JSON.parse(value) : null, false)
            if (result.ok) this.entries[slot] = { slim: result.slim, level: null }
          } catch (e) {}
          resolve()
        },
        fail: () => resolve()
      })
    }).catch(() => {})))
    return this.ready
  }

  get(slot) {
    const entry = this.entries[slot]
    return entry ? entry.slim : null
  }

  getLevel(slot) {
    const entry = this.entries[slot]
    if (!entry) return null
    if (!entry.level) entry.level = MazeValidate.prepareLevel(entry.slim)
    return entry.level
  }

  subscribe(listener) {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index >= 0) this.listeners.splice(index, 1)
    }
  }

  save(slot, level) {
    const result = MazeValidate.validateStoredLevel(level, false)
    // 本地生成器已生成 render，直接复用，不再 decode/compileRuns。
    if (result.ok && level.render) result.level = level
    return this.saveValidated(slot, result)
  }

  saveValidated(slot, result) {
    if (CustomSlots.keys.indexOf(slot) < 0 || !result.ok) return Promise.resolve(false)
    return this.enqueue(slot, { slim: result.slim, level: result.level })
  }

  clear(slot) {
    if (CustomSlots.keys.indexOf(slot) < 0) return Promise.resolve(false)
    return this.enqueue(slot, null)
  }

  enqueue(slot, entry) {
    const operation = this.queues[slot].then(() => this.init()).then(() => new Promise((resolve) => {
      const options = {
        key: SLOT_KEYS[slot],
        success: () => {
          this.entries[slot] = entry
          // 先完成写入，再通知可见页面；单个页面回调异常不影响持久化结果。
          resolve(true)
          this.listeners.slice().forEach((listener) => {
            try { listener(slot, this.get(slot)) } catch (e) { console.log('[maze] 槽位刷新失败: ' + e) }
          })
        },
        fail: () => resolve(false)
      }
      if (entry) {
        options.value = JSON.stringify(entry.slim)
        storage.set(options)
      } else storage.delete(options)
    })).catch(() => false)
    this.queues[slot] = operation
    return operation
  }
}
