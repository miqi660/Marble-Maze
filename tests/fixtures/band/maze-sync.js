/** 手环端连续自定义关卡协议：list / add / replace / remove。 */
import { interconnModule } from '../utils/interconn.js'
import MazeValidate from './maze-validate.js'
import CustomLevels from './custom-levels.js'

const ACK_TIMEOUT = 8000

function validIndex(index) {
  return typeof index === 'number' && index % 1 === 0 && index >= 0 && index < CustomLevels.MAX_CUSTOM_LEVELS
}

export default class MazeSync extends interconnModule {
  static name = 'maze'
  static store = null

  constructor({ send, addListener, removeListener }) {
    super()
    this.store = MazeSync.store
    this._send = send
    this._removeListener = removeListener
    addListener((payload) => this.onMessage(payload))
  }

  /** interconn.send 会补上 tag=maze；保留现有 8 秒通信超时。 */
  reply(payload) {
    if (this.destroyed) return
    let done = false
    const timer = setTimeout(() => {
      done = true
    }, ACK_TIMEOUT)
    try {
      Promise.resolve(this._send(payload))
        .then(() => {
          if (!done) clearTimeout(timer)
        })
        .catch(() => {
          if (!done) clearTimeout(timer)
        })
    } catch (e) {
      clearTimeout(timer)
    }
  }

  onMessage(payload) {
    if (!payload || !this.store) return
    if (payload.stat === 'list') return this.handleList()
    if (payload.stat === 'add') return this.handleAdd(payload)
    if (payload.stat === 'replace') return this.handleReplace(payload)
    if (payload.stat === 'remove') return this.handleRemove(payload)
  }

  handleAdd(payload) {
    const result = MazeValidate.validateLevel(payload.level, false)
    if (!result.ok) {
      this.reply({ type: 'ack', stat: 'add', ok: false, message: result.message })
      return Promise.resolve({ ok: false, message: result.message })
    }
    return this.store.appendValidated(result).then((saved) => {
      const response = { type: 'ack', stat: 'add', ok: saved.ok, message: saved.message || '' }
      if (saved.ok) response.index = saved.index
      this.reply(response)
      return saved
    })
  }

  handleReplace(payload) {
    if (!validIndex(payload.index)) {
      const response = { ok: false, message: 'bad index' }
      this.reply({ type: 'ack', stat: 'replace', index: payload.index, ok: false, message: response.message })
      return Promise.resolve(response)
    }
    const result = MazeValidate.validateLevel(payload.level, false)
    if (!result.ok) {
      this.reply({ type: 'ack', stat: 'replace', index: payload.index, ok: false, message: result.message })
      return Promise.resolve({ ok: false, message: result.message })
    }
    return this.store.replaceValidated(payload.index, result).then((saved) => {
      this.reply({ type: 'ack', stat: 'replace', index: payload.index, ok: saved.ok, message: saved.message || '' })
      return saved
    })
  }

  handleRemove(payload) {
    if (!validIndex(payload.index)) {
      this.reply({ type: 'ack', stat: 'remove', index: payload.index, ok: false, message: 'bad index' })
      return Promise.resolve({ ok: false, message: 'bad index' })
    }
    return this.store.remove(payload.index).then((removed) => {
      this.reply({ type: 'ack', stat: 'remove', index: payload.index, ok: removed.ok, message: removed.message || '' })
      return removed
    })
  }

  handleList() {
    return this.store.init().then((ready) => {
      const levels = ready ? this.store.list().map((level, index) => ({
        index,
        id: level.id || '',
        name: level.name || '',
        cols: level.cols,
        rows: level.rows
      })) : []
      const response = { type: 'list', levels }
      if (!ready) {
        response.ok = false
        response.message = this.store.lastError || 'storage initialization failed'
      }
      this.reply(response)
      return response
    })
  }

  destroy() {
    this.destroyed = true
    this._removeListener && this._removeListener()
  }
}
