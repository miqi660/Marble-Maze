/**
 * MazeSync：手环端 maze 消息模块（put / list / clear）
 * 通过 globalThis.conn.register(MazeSync) 注册；tag 固定为 'maze'
 */
import { interconnModule } from '../utils/interconn.js'
import MazeValidate from './maze-validate.js'

import CustomSlots from './custom-slots.js'

const ACK_TIMEOUT = 8000

export default class MazeSync extends interconnModule {
  static name = 'maze'

  /** 注册前由 App 注入唯一槽位缓存。 */
  static store = null

  constructor({ send, addListener, removeListener }) {
    super()
    this.store = MazeSync.store
    this._send = send
    this._removeListener = removeListener
    addListener((payload) => this.onMessage(payload))
  }

  /** 发送并在 ACK_TIMEOUT 内放弃等待 */
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
    if (!payload) return
    if (payload.stat === 'put') this.handlePut(payload)
    else if (payload.stat === 'list') this.handleList()
    else if (payload.stat === 'clear') this.handleClear(payload)
  }

  handlePut(payload) {
    const slot = CustomSlots.keys.indexOf(payload.slot) >= 0 ? payload.slot : null
    if (!slot) {
      this.reply({ type: 'ack', slot: String(payload.slot || ''), ok: false, message: 'bad slot' })
      return
    }
    const r = MazeValidate.validateLevel(payload.level, false)
    if (!r.ok) {
      this.reply({ type: 'ack', slot, ok: false, message: r.message })
      return
    }
    this.store.saveValidated(slot, r).then((ok) => {
      this.reply({ type: 'ack', slot, ok, message: ok ? '' : 'storage write failed' })
    })
  }

  handleList() {
    this.store.init().then(() => {
      const slots = []
      const keys = CustomSlots.keys
      keys.forEach((slot) => {
        const s = this.store.get(slot)
        if (s) slots.push({ slot, id: s.id || '', name: s.name || '', cols: s.cols, rows: s.rows })
      })
      this.reply({ type: 'list', slots })
    })
  }

  handleClear(payload) {
    const slot = CustomSlots.keys.indexOf(payload.slot) >= 0 ? payload.slot : null
    if (!slot) {
      this.reply({ type: 'ack', slot: '', ok: false, message: 'bad slot' })
      return
    }
    this.store.clear(slot).then((ok) => {
      this.reply({ type: 'ack', slot, ok, message: ok ? 'cleared' : 'storage delete failed' })
    })
  }

  destroy() {
    this.destroyed = true
    this._removeListener && this._removeListener()
  }
}
