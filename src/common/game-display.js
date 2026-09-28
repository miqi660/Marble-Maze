import brightness from '@system.brightness'

/** 由 App 持有亮度会话，串行处理前后台切换与设置更新。 */
class GameDisplay {
  constructor() {
    this.queue = Promise.resolve()
  }

  call(method, args) {
    return new Promise((resolve) => {
      try {
        brightness[method](Object.assign({}, args, {
          success(data) { resolve({ ok: true, data }) },
          fail(data, code) {
            console.error('[maze] 屏幕接口 ' + method + ' 失败 ' + code)
            resolve({ ok: false })
          }
        }))
      } catch (error) {
        console.error('[maze] 屏幕接口 ' + method + ' 不可用: ' + error)
        resolve({ ok: false })
      }
    })
  }

  start(requestedValue) {
    const session = { active: true, snapshot: null, target: null, applied: null }
    this.queue = this.queue.then(async () => {
      const selected = await requestedValue
      if (session.target === null && typeof selected === 'number' && isFinite(selected)) session.target = Math.max(0, Math.min(255, Math.round(selected)))
      if (!session.active) return
      const results = await Promise.all([this.call('getValue'), this.call('getMode')])
      if (!session.active || !results[0].ok || !results[1].ok) return
      const value = results[0].data && results[0].data.value
      const mode = results[1].data && results[1].data.mode
      if (typeof value !== 'number' || value % 1 !== 0 || value < 0 || value > 255 || (mode !== 0 && mode !== 1)) return
      session.snapshot = { value, mode }
      const result = await this.call('setMode', { mode: 0 })
      if (!session.active || !result.ok) return
      session.locked = true
      const target = session.target === null ? value : session.target
      const applied = await this.call('setValue', { value: target })
      if (applied.ok) session.applied = target
    })
    return session
  }

  update(session, value) {
    if (!session || !session.active || typeof value !== 'number' || !isFinite(value)) return
    session.target = Math.max(0, Math.min(255, Math.round(value)))
    this.queue = this.queue.then(async () => {
      if (!session.active || !session.locked || session.target === session.applied) return
      const target = session.target
      const result = await this.call('setValue', { value: target })
      if (result.ok) session.applied = target
    })
  }

  stop(session) {
    if (!session || !session.active) return
    session.active = false
    this.queue = this.queue.then(async () => {
      if (!session.snapshot) return
      const snapshot = session.snapshot
      session.snapshot = null
      await this.call('setValue', { value: snapshot.value })
      await this.call('setMode', { mode: snapshot.mode })
    })
  }
}

export default new GameDisplay()
