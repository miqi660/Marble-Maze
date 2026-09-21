/**
 * MazeSync：手环端 maze 消息模块（put / list / clear）
 * 通过 globalThis.conn.register(MazeSync) 注册；tag 固定为 'maze'
 */
import storage from '@system.storage'
import { interconnModule } from '../utils/interconn.js'
import MazeValidate from './maze-validate.js'
import { SLOT_KEYS } from './levels.js'

const ACK_TIMEOUT = 8000

export default class MazeSync extends interconnModule {
  static name = 'maze'

  /** 收到 put 成功后的回调，由 levels 页设置：(slot, slim) => void */
  static onUpdate = null

  constructor({ send, addListener, removeListener }) {
    super()
    this._send = send
    this._removeListener = removeListener
    addListener((payload) => this.onMessage(payload))
  }

  /** 发送并在 ACK_TIMEOUT 内放弃等待 */
  reply(payload) {
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
    const slot = payload.slot === 'b' ? 'b' : payload.slot === 'a' ? 'a' : null
    if (!slot) {
      this.reply({ type: 'ack', slot: String(payload.slot || ''), ok: false, message: 'bad slot' })
      return
    }
    const r = MazeValidate.validateLevel(payload.level)
    if (!r.ok) {
      this.reply({ type: 'ack', slot, ok: false, message: r.message })
      return
    }
    // 只存精简体：不含 render、不含 crc
    storage.set({
      key: SLOT_KEYS[slot],
      value: JSON.stringify(r.slim),
      success: () => {
        this.reply({ type: 'ack', slot, ok: true, message: '' })
        if (typeof MazeSync.onUpdate === 'function') MazeSync.onUpdate(slot, r.slim)
      },
      fail: () => {
        this.reply({ type: 'ack', slot, ok: false, message: 'storage write failed' })
      }
    })
  }

  handleList() {
    const slots = []
    const keys = ['a', 'b']
    let pending = keys.length
    const finish = () => {
      if (--pending === 0) this.reply({ type: 'list', slots })
    }
    keys.forEach((slot) => {
      storage.get({
        key: SLOT_KEYS[slot],
        success: (v) => {
          try {
            if (v) {
              const s = JSON.parse(v)
              slots.push({ slot, id: s.id || '', name: s.name || '', cols: s.cols, rows: s.rows })
            }
          } catch (e) {}
          finish()
        },
        fail: finish
      })
    })
  }

  handleClear(payload) {
    const slot = payload.slot === 'b' ? 'b' : payload.slot === 'a' ? 'a' : null
    if (!slot) {
      this.reply({ type: 'ack', slot: '', ok: false, message: 'bad slot' })
      return
    }
    storage.delete({
      key: SLOT_KEYS[slot],
      success: () => {
        this.reply({ type: 'ack', slot, ok: true, message: 'cleared' })
        if (typeof MazeSync.onUpdate === 'function') MazeSync.onUpdate(slot, null)
      },
      fail: () => this.reply({ type: 'ack', slot, ok: false, message: 'storage delete failed' })
    })
  }

  destroy() {
    this._removeListener && this._removeListener()
  }
}
