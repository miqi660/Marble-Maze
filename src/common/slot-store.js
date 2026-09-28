import storage from '@system.storage'
import MazeValidate from './maze-validate.js'
import CustomLevels from './custom-levels.js'

const VERSION_KEY = 'custom_storage_version'
const STORAGE_VERSION = '2'
// LEGACY MIGRATION ONLY: 一次性读取旧版 custom_a..custom_l 数据。
const LEGACY_CUSTOM_LEVEL_KEYS = [
  'custom_a', 'custom_b', 'custom_c', 'custom_d', 'custom_e', 'custom_f',
  'custom_g', 'custom_h', 'custom_i', 'custom_j', 'custom_k', 'custom_l'
]

function isIndex(index) {
  return typeof index === 'number' && index % 1 === 0 && index >= 0 && index < CustomLevels.MAX_CUSTOM_LEVELS
}

function getValue(key, report) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    try {
      storage.get({
        key, default: '',
        success(value) { finish({ ok: true, value }) },
        fail(data, code) { report('get', key, data, code); finish({ ok: false, value: null }) }
      })
    } catch (e) {
      report('get', key, e.message || String(e), 'exception')
      finish({ ok: false, value: null })
    }
  })
}

function setValue(key, value, report) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    try {
      storage.set({ key, value, success() { finish(true) }, fail(data, code) { report('set', key, data, code); finish(false) } })
    } catch (e) {
      report('set', key, e.message || String(e), 'exception')
      finish(false)
    }
  })
}

function deleteValue(key, report) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    try {
      storage.delete({ key, success() { finish(true) }, fail(data, code) { report('delete', key, data, code); finish(false) } })
    } catch (e) {
      report('delete', key, e.message || String(e), 'exception')
      finish(false)
    }
  })
}

function parseStored(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null
  try {
    const raw = typeof value === 'string' ? JSON.parse(value) : value
    const result = MazeValidate.validateStoredLevel(raw, false)
    return result.ok ? { slim: result.slim, level: null } : null
  } catch (e) {
    return null
  }
}

function rawValue(value) {
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

/** App 持有的唯一连续关卡缓存；所有结构写入共享同一个队列。 */
export default class SlotStore {
  constructor() {
    this.entries = []
    this.listeners = []
    this.ready = null
    this.writeQueue = Promise.resolve()
    this.initialized = false
    this.initFailed = false
    this.lastError = ''
    this.stage = '初始化'
  }

  enqueueStructure(operation) {
    const result = this.writeQueue.then(operation, operation)
    this.writeQueue = result.then(() => undefined, () => undefined)
    return result
  }

  report(operation, key, data, code) {
    const detail = typeof data === 'string' ? data : data && data.message ? data.message : ''
    const message = this.stage + ': ' + operation + ' ' + key + ' code=' + String(code) + (detail ? ' ' + detail.slice(0, 120) : '')
    if (!this.lastError) this.lastError = message
    console.error('[maze] ' + message)
  }

  getValue(key) { return getValue(key, (op, k, data, code) => this.report(op, k, data, code)) }
  setValue(key, value) { return setValue(key, value, (op, k, data, code) => this.report(op, k, data, code)) }
  deleteValue(key) { return deleteValue(key, (op, k, data, code) => this.report(op, k, data, code)) }

  init() {
    // 保留 ready Promise 供页面等待；只有失败后的新调用才重新排队。
    if (this.ready && !this.initFailed) return this.ready
    this.initFailed = false
    this.ready = this.enqueueStructure(() => {
      this.lastError = ''
      this.stage = '读取版本'
      return this.initialize()
    }).catch((error) => {
      this.report('init', VERSION_KEY, error.message || String(error), 'exception')
      return false
    }).then((ready) => {
      this.initFailed = !ready
      return ready
    })
    return this.ready
  }

  async initialize() {
    const version = await this.getValue(VERSION_KEY)
    if (!version.ok) return false
    const loaded = String(version.value || '') === STORAGE_VERSION
      ? await this.loadCurrent()
      : await this.migrateLegacy()
    this.initialized = loaded
    return loaded
  }

  async loadCurrent() {
    this.stage = '读取连续关卡'
    const raw = []
    // 每批最多三个请求；按槽序消费结果，整批失败时不修复或发布缓存。
    for (let index = 0; index < CustomLevels.MAX_CUSTOM_LEVELS; index += 3) {
      const pending = []
      for (let offset = index; offset < Math.min(index + 3, CustomLevels.MAX_CUSTOM_LEVELS); offset++) {
        pending.push(this.getValue(CustomLevels.storageKey(offset)))
      }
      const results = await Promise.all(pending)
      for (let offset = 0; offset < results.length; offset++) {
        if (!results[offset].ok) return false
        raw.push(results[offset].value)
      }
    }

    const compacted = []
    let needsRepair = false
    for (let index = 0; index < raw.length; index++) {
      const entry = parseStored(raw[index])
      if (!entry) {
        if (raw[index] !== '' && raw[index] !== null && typeof raw[index] !== 'undefined') needsRepair = true
        continue
      }
      if (index !== compacted.length) needsRepair = true
      compacted.push(entry)
    }

    if (needsRepair && !(await this.persistEntries(compacted, raw))) return false
    this.entries = compacted
    return true
  }

  async migrateLegacy() {
    this.stage = '读取旧关卡'
    const legacy = []
    const migrated = []
    // 按旧槽原顺序读取，并把有效记录压成连续列表。
    for (let index = 0; index < LEGACY_CUSTOM_LEVEL_KEYS.length; index++) {
      const result = await this.getValue(LEGACY_CUSTOM_LEVEL_KEYS[index])
      if (!result.ok) return false
      legacy.push(result.value)
      const entry = parseStored(result.value)
      if (entry) migrated.push(entry)
    }

    this.stage = '读取迁移目标'
    const current = []
    for (let index = 0; index < CustomLevels.MAX_CUSTOM_LEVELS; index++) {
      const result = await this.getValue(CustomLevels.storageKey(index))
      if (!result.ok) return false
      current.push(result.value)
    }

    // 先完成全部新键写入；失败时旧键仍未触碰，可安全重试。
    this.stage = '写入迁移数据'
    if (!(await this.persistEntries(migrated, current))) return false

    this.stage = '清理旧关卡'
    for (let index = 0; index < LEGACY_CUSTOM_LEVEL_KEYS.length; index++) {
      if (legacy[index] === '' || legacy[index] === null || typeof legacy[index] === 'undefined') continue
      if (!(await this.deleteValue(LEGACY_CUSTOM_LEVEL_KEYS[index]))) {
        await this.restoreLegacy(legacy)
        return false
      }
    }
    this.stage = '写入存储版本'
    if (!(await this.setValue(VERSION_KEY, STORAGE_VERSION))) {
      await this.restoreLegacy(legacy)
      return false
    }

    this.entries = migrated
    return true
  }

  async persistEntries(entries, previousValues) {
    for (let index = 0; index < CustomLevels.MAX_CUSTOM_LEVELS; index++) {
      const key = CustomLevels.storageKey(index)
      let ok = true
      if (index < entries.length) ok = await this.setValue(key, JSON.stringify(entries[index].slim))
      else if (previousValues && previousValues[index] !== '' && previousValues[index] !== null && typeof previousValues[index] !== 'undefined') {
        ok = await this.deleteValue(key)
      }
      if (!ok) return false
    }
    return true
  }

  async restoreLegacy(values) {
    for (let index = 0; index < LEGACY_CUSTOM_LEVEL_KEYS.length; index++) {
      const key = LEGACY_CUSTOM_LEVEL_KEYS[index]
      const value = values[index]
      // 迁移只删除原本存在的键，恢复时无需触碰原本为空的键。
      if (value !== '' && value !== null && typeof value !== 'undefined') await this.setValue(key, rawValue(value))
    }
  }

  count() {
    return this.entries.length
  }

  get(index) {
    if (!isIndex(index)) return null
    const entry = this.entries[index]
    return entry ? entry.slim : null
  }

  getLevel(index) {
    if (!isIndex(index)) return null
    const entry = this.entries[index]
    if (!entry) return null
    if (!entry.level) entry.level = MazeValidate.prepareLevel(entry.slim)
    return entry.level
  }

  list() {
    return this.entries.map((entry) => entry.slim)
  }

  subscribe(listener) {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index >= 0) this.listeners.splice(index, 1)
    }
  }

  notify(change) {
    this.listeners.slice().forEach((listener) => {
      try { listener(change, this.list()) } catch (e) { console.error('[maze] 自定义关卡刷新失败: ' + e) }
    })
  }

  makeEntry(result) {
    if (!result || !result.ok || !result.slim) return null
    const checked = MazeValidate.validateStoredLevel(result.slim, false)
    if (!checked.ok) return null
    const level = result.level && result.level.render ? result.level : null
    return { slim: checked.slim, level }
  }

  append(level) {
    const result = MazeValidate.validateStoredLevel(level, false)
    if (result.ok && level && level.render) result.level = level
    return this.appendValidated(result)
  }

  appendValidated(result) {
    const entry = this.makeEntry(result)
    if (!entry) return Promise.resolve({ ok: false, message: 'invalid level' })
    return this.init().then((ready) => {
      if (!ready) return { ok: false, message: 'storage initialization failed' }
      return this.enqueueStructure(async () => {
        if (!this.initialized) return { ok: false, message: 'storage initialization failed' }
        this.stage = '添加关卡'
        this.lastError = ''
        if (this.entries.length >= CustomLevels.MAX_CUSTOM_LEVELS) return { ok: false, message: 'custom levels full' }
        const index = this.entries.length
        if (!(await this.setValue(CustomLevels.storageKey(index), JSON.stringify(entry.slim)))) return { ok: false, message: 'storage write failed' }
        this.entries.push(entry)
        this.notify({ type: 'add', index })
        return { ok: true, index, message: '' }
      })
    }).catch(() => ({ ok: false, message: 'storage write failed' }))
  }

  replace(index, level) {
    const result = MazeValidate.validateStoredLevel(level, false)
    if (result.ok && level && level.render) result.level = level
    return this.replaceValidated(index, result)
  }

  replaceValidated(index, result) {
    const entry = this.makeEntry(result)
    if (!isIndex(index) || !entry) return Promise.resolve({ ok: false, message: 'bad index' })
    return this.init().then((ready) => {
      if (!ready) return { ok: false, message: 'storage initialization failed' }
      return this.enqueueStructure(async () => {
        if (!this.initialized) return { ok: false, message: 'storage initialization failed' }
        this.stage = '更新关卡'
        this.lastError = ''
        if (index >= this.entries.length) return { ok: false, message: 'bad index' }
        if (!(await this.setValue(CustomLevels.storageKey(index), JSON.stringify(entry.slim)))) return { ok: false, message: 'storage write failed' }
        this.entries[index] = entry
        this.notify({ type: 'replace', index })
        return { ok: true, index, message: '' }
      })
    }).catch(() => ({ ok: false, message: 'storage write failed' }))
  }

  remove(index) {
    if (!isIndex(index)) return Promise.resolve({ ok: false, message: 'bad index' })
    return this.init().then((ready) => {
      if (!ready) return { ok: false, message: 'storage initialization failed' }
      return this.enqueueStructure(async () => {
        if (!this.initialized) return { ok: false, message: 'storage initialization failed' }
        this.stage = '更新关卡'
        this.lastError = ''
        if (index >= this.entries.length) return { ok: false, message: 'bad index' }
        const snapshot = this.entries.slice()
        let ok = true
        for (let current = index; current < snapshot.length - 1; current++) {
          if (!(await this.setValue(CustomLevels.storageKey(current), JSON.stringify(snapshot[current + 1].slim)))) {
            ok = false
            break
          }
        }
        if (ok) ok = await this.deleteValue(CustomLevels.storageKey(snapshot.length - 1))
        if (!ok) {
          // storage 没有多键事务；失败时尽力恢复原列表，并保留原缓存。
          for (let current = index; current < snapshot.length; current++) {
            await this.setValue(CustomLevels.storageKey(current), JSON.stringify(snapshot[current].slim))
          }
          return { ok: false, message: 'storage write failed' }
        }
        this.entries.splice(index, 1)
        this.notify({ type: 'remove', index })
        return { ok: true, index, message: '' }
      })
    }).catch(() => ({ ok: false, message: 'storage write failed' }))
  }
}
