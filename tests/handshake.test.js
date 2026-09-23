const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

function harness() {
  let nextTimer = 0
  const timers = new Map()
  const sends = []
  const transport = { send(options) { sends.push(options) } }
  const scope = {
    module: { exports: {} }, Promise,
    interconnect: { instance: () => transport },
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer },
    clearTimeout(id) { timers.delete(id) }
  }
  const base = fs.readFileSync('src/utils/interconn.js', 'utf8')
    .replace(/^import .*$/gm, '').replace('export default class', 'class').replace('export class', 'class')
  const handshake = fs.readFileSync('src/utils/handshake.js', 'utf8')
    .replace(/^import .*$/gm, '').replace('export default class', 'class')
  vm.runInNewContext(base + '\n' + handshake + '\nmodule.exports = InterHandshake', scope)
  const conn = new scope.module.exports()
  return {
    conn, transport, sends, timers,
    receive(count) { transport.onmessage({ data: JSON.stringify({ tag: '__hs__', count }) }) },
    counts() { return sends.filter(o => o.data.tag === '__hs__').map(o => o.data.count) }
  }
}

async function drain() { for (let i = 0; i < 10; i++) await Promise.resolve() }

async function run() {
  // 并发业务请求共享握手，握手完成之前不发送业务数据。
  const h = harness()
  let completed = 0
  h.conn.setHandshakeListener(() => completed++)
  const first = h.conn.send('maze', { stat: 'list' })
  const second = h.conn.send('maze', { stat: 'clear', slot: 'a' })
  assert.equal(h.conn.connected, false)
  assert.deepStrictEqual(h.counts(), [0])
  h.receive(1)
  await drain()
  assert.equal(h.conn.connected, true)
  assert.deepStrictEqual(h.counts(), [0, 2])
  const business = h.sends.filter(o => o.data.tag === 'maze')
  assert.equal(business.length, 2)
  business.forEach(o => o.success())
  await Promise.all([first, second])
  for (const count of [1, 2, 2, 0, 2]) h.receive(count)
  assert.equal(completed, 1)
  assert.equal(h.conn.connected, true)
  assert.equal(h.timers.size, 0, '完成握手后不因静默超时断开')

  // 对端主动握手，重复完成包保持幂等；非法 count 不产生响应。
  const passive = harness()
  for (const count of [-1, 3, '1', null]) passive.receive(count)
  assert.equal(passive.conn.promise, null)
  passive.receive(0)
  assert.equal(passive.conn.connected, false)
  passive.receive(2)
  passive.receive(2)
  assert.equal(passive.conn.connected, true)
  assert.deepStrictEqual(passive.counts(), [1])
  assert.equal(passive.timers.size, 0)

  // 断线立即拒绝等待者；即使旧超时或旧发送失败迟到，也不得污染新轮次。
  const reconnect = harness()
  const oldSend = reconnect.conn.send('maze', {})
  const rejected = assert.rejects(oldSend, /connection closed/)
  const oldTimeout = [...reconnect.timers.values()][0]
  const oldPacket = reconnect.sends[0]
  reconnect.transport.onclose()
  await rejected
  assert.equal(reconnect.timers.size, 0)
  reconnect.transport.onopen()
  const newPromise = reconnect.conn.promise
  oldTimeout()
  oldPacket.fail(new Error('旧发送失败'))
  await drain()
  assert.strictEqual(reconnect.conn.promise, newPromise)
  assert.equal(reconnect.timers.size, 1)
  reconnect.receive(1)
  await newPromise
  assert.equal(reconnect.conn.connected, true)

  // 超时与底层发送失败均清理状态，随后可重新发起握手。
  for (const failure of ['timeout', 'send']) {
    const failed = harness()
    const pending = failed.conn.send('maze', {})
    const check = assert.rejects(pending, failure === 'timeout' ? /timeout/ : /发送失败/)
    if (failure === 'timeout') [...failed.timers.values()][0]()
    else failed.sends[0].fail(new Error('发送失败'))
    await check
    assert.equal(failed.conn.promise, null)
    assert.equal(failed.conn.connected, false)
    assert.equal(failed.timers.size, 0)
    failed.transport.onopen()
    failed.receive(1)
    await failed.conn.promise
    assert.equal(failed.conn.connected, true)
  }

  // 握手完成后、业务 await 恢复前断线，不得把旧业务发到新连接。
  const race = harness()
  const pending = race.conn.send('maze', {})
  const rejectedRace = assert.rejects(pending, /connection closed/)
  race.receive(1)
  race.transport.onclose()
  race.transport.onopen()
  race.receive(1)
  await rejectedRace
  assert.equal(race.sends.filter(o => o.data.tag === 'maze').length, 0)

  // 无业务等待者时的 open/error、被动握手超时不得产生未处理拒绝。
  const unattended = harness()
  unattended.transport.onopen()
  unattended.transport.onerror()
  unattended.receive(0)
  const passiveTimeout = [...unattended.timers.values()][0]
  passiveTimeout()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(unattended.conn.promise, null)
  assert.equal(unattended.timers.size, 0)
  console.log('✓ 握手并发、主动/被动完成、重复消息、断线重连、旧回调隔离、超时/发送失败恢复和等待竞态通过')
}

run().catch(error => { console.error(error); process.exitCode = 1 })
