'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../app/src/main/assets/generator/tools/maze/generator-core.js');
const { Client, levelForSync } = require('../app/src/main/assets/generator/sync-client.js');
const validate = require('./fixtures/band/maze-validate.js');

function harness() {
  let now = 0;
  const timers = new Set();
  const sent = [], states = [], disconnected = [];
  const client = new Client({
    send: (token, id, text) => sent.push({ token, id, text, message: JSON.parse(text) }),
    disconnect: (token, reason) => disconnected.push({ token, reason }),
    changed: state => states.push(state),
    schedule: (delay, callback) => {
      const timer = { at: now + delay, callback };
      timers.add(timer);
      return () => timers.delete(timer);
    }
  });
  const receive = (message, token = 1) => client.receive(token, JSON.stringify(message));
  const connect = () => {
    client.ready(1);
    receive({ tag: '__hs__', count: 1 });
    receive({ tag: 'maze', type: 'list', slots: [] });
  };
  const advance = milliseconds => {
    const target = now + milliseconds;
    while (true) {
      const next = [...timers].sort((a, b) => a.at - b.at)[0];
      if (!next || next.at > target) break;
      timers.delete(next);
      now = next.at;
      next.callback();
    }
    now = target;
  };
  return { client, sent, states, disconnected, timers, receive, connect, advance };
}

test('四档预设和边界种子的精简体通过真实手环校验，原始预览不变', () => {
  for (const preset of Object.keys(core.PRESETS)) {
    for (const seed of [0, 1, 42, 4294967295]) {
      const maze = core.buildPreset(preset, seed).maze;
      const original = JSON.stringify(maze);
      const level = levelForSync(maze);
      assert.equal(Object.hasOwn(level, 'render'), false);
      assert.match(level.crc, /^[A-F0-9]{8}$/);
      const result = validate.validateLevel(level, false);
      assert.equal(result.ok, true, result.message);
      assert.ok(result.payloadBytes <= 1024);
      assert.equal(level.crc, validate.computeCrc(result.slim));
      assert.equal(JSON.stringify(maze), original);
      assert.deepEqual(validate.prepareLevel(result.slim).render, maze.render);
    }
  }
});

test('损坏内容被 CRC 拒绝，损坏生成格式在发送前拒绝', () => {
  const maze = core.buildPreset('normal', 1).maze;
  const level = levelForSync(maze);
  level.id += '-tampered';
  assert.equal(validate.validateLevel(level, false).message, 'crc mismatch');
  assert.throws(() => levelForSync({ ...maze, cells: '0' }));
});

test('握手只接受数值 0..2，自动查询槽位，重复握手不重启业务', () => {
  const h = harness();
  h.client.ready(1);
  for (const count of [-1, 3, 1.5, '1', null]) h.receive({ tag: '__hs__', count });
  assert.equal(h.sent.length, 1);
  h.receive({ tag: '__hs__', count: 0 });
  assert.equal(h.sent.at(-1).message.count, 1);
  assert.equal(h.client.connected, false);
  h.receive({ tag: '__hs__', count: 1 });
  assert.deepEqual(h.sent.at(-1).message, { tag: 'maze', stat: 'list' });
  h.receive({ tag: '__hs__', count: 2 });
  assert.equal(h.sent.filter(item => item.message.stat === 'list').length, 1);
});

test('同一时刻只允许一个请求，发送本身不能标记同步成功', () => {
  const h = harness();
  assert.throws(() => h.client.request('list'));
  h.connect();
  h.client.request('put', 'a', core.buildPreset('easy', 1).maze);
  assert.throws(() => h.client.request('clear', 'b'));
  assert.equal(h.client.pending.kind, 'put');
  assert.ok(!h.states.some(state => state.message.includes('同步成功')));
});

test('忽略错误连接、错误槽位、错误 ACK 类型和无效 JSON', () => {
  const h = harness();
  h.connect();
  h.client.request('clear', 'a');
  h.receive({ tag: 'maze', type: 'ack', slot: 'a', ok: true }, 2);
  h.receive({ tag: 'maze', type: 'ack', slot: 'b', ok: true });
  h.receive({ tag: 'maze', type: 'ack', slot: 'a', ok: 'true' });
  h.receive({ tag: 'maze', type: 'list', slots: [] });
  for (const text of ['{', 'null', '[]', '1', '"x"', 'x'.repeat(20000)]) h.client.receive(1, text);
  assert.equal(h.client.pending.kind, 'clear');
  h.receive({ tag: 'maze', type: 'ack', slot: 'a', ok: false, message: 'storage delete failed' });
  assert.equal(h.client.pending, null);
  assert.match(h.states.at(-1).message, /storage delete failed/);
});

test('异常槽位列表不能解锁上传', () => {
  const h = harness();
  h.client.ready(1);
  h.receive({ tag: '__hs__', count: 2 });
  const a = { slot: 'a', id: 'maze', name: '', cols: 7, rows: 13 };
  for (const slots of [null, {}, [a, a], [{ ...a, cols: '7' }], [{ ...a, rows: 21 }], [null]]) {
    h.receive({ tag: 'maze', type: 'list', slots });
  }
  assert.equal(h.client.pending.kind, 'list');
  assert.equal(h.client.slots, null);
  h.receive({ tag: 'maze', type: 'list', slots: [a] });
  assert.equal(h.client.slots.length, 1);
});

test('上传和清空超时均断开，结果未知，不重发写操作', () => {
  for (const kind of ['put', 'clear']) {
    const h = harness();
    h.connect();
    h.client.request(kind, 'a', core.buildPreset('easy', 3).maze);
    h.advance(8000);
    assert.equal(h.client.connected, false);
    assert.match(h.states.at(-1).message, /结果未知/);
    assert.equal(h.sent.filter(item => item.message.stat === kind).length, 1);
    h.receive({ tag: 'maze', type: 'ack', slot: 'a', ok: true });
    assert.equal(h.client.pending, null);
    assert.equal(h.disconnected.length, 1);
    assert.equal(h.timers.size, 0);
  }
});

test('握手最多尝试三次；列表超时也不会重发变更', () => {
  const h = harness();
  h.client.ready(1);
  h.advance(9000);
  assert.equal(h.sent.length, 3);
  assert.equal(h.client.connected, false);
  h.client.ready(2);
  h.receive({ tag: '__hs__', count: 1 }, 1);
  assert.equal(h.client.connected, false);
  h.receive({ tag: '__hs__', count: 1 }, 2);
  h.advance(8000);
  assert.match(h.states.at(-1).message, /槽位查询超时/);
});

test('已完成请求的迟到发送错误不能中断后续请求', () => {
  const h = harness();
  h.connect();
  const old = h.sent.at(-1);
  h.client.request('clear', 'a');
  h.client.failed(old.token, old.id, '迟到错误');
  assert.equal(h.client.connected, true);
  const active = h.sent.at(-1);
  h.client.failed(active.token, active.id, '服务断开');
  assert.equal(h.client.connected, false);
  assert.match(h.states.at(-1).message, /服务断开/);
});

test('ACK 后列表内容不匹配时不报告同步成功', () => {
  const h = harness();
  h.connect();
  h.client.request('put', 'a', core.buildPreset('easy', 1).maze);
  h.receive({ tag: 'maze', type: 'ack', slot: 'a', ok: true });
  assert.equal(h.client.pending.kind, 'list');
  h.receive({ tag: 'maze', type: 'list', slots: [] });
  assert.match(h.states.at(-1).message, /不一致/);
  assert.equal(h.client.connected, false);
});

test('手机实际客户端与参考手环处理器完成 A/B 上传、查询及清空', async () => {
  const h = harness();
  const stored = {};
  let rejectWrite = false;
  const source = fs.readFileSync(path.join(__dirname, 'fixtures/band/maze-sync.js'), 'utf8')
    .replace(/^import .*$/gm, '').replace('export default class MazeSync', 'class MazeSync');
  const context = { MazeValidate: validate, interconnModule: class {}, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(source + '\nthis.Receiver = MazeSync;', context);
  context.Receiver.store = {
    async init() {}, get: slot => stored[slot],
    async saveValidated(slot, result) {
      if (rejectWrite) return false;
      stored[slot] = result.slim;
      return true;
    },
    async clear(slot) { delete stored[slot]; return true; }
  };
  const receiver = new context.Receiver({
    send: payload => h.receive({ ...payload, tag: 'maze' }),
    addListener() {}, removeListener() {}
  });
  let cursor = 0;
  async function flush() {
    while (cursor < h.sent.length) {
      const { message } = h.sent[cursor++];
      if (message.tag === '__hs__' && message.count < 2) h.receive({ tag: '__hs__', count: message.count + 1 });
      if (message.tag === 'maze') receiver.onMessage(message);
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  h.client.ready(1);
  await flush();
  assert.deepEqual(h.client.slots, []);
  for (const [slot, seed] of [['a', 1], ['b', 2]]) {
    const maze = core.buildPreset('normal', seed).maze;
    h.client.request('put', slot, maze);
    await flush();
    assert.equal(stored[slot].id, maze.id);
    assert.match(h.states.at(-1).message, /同步成功/);
    assert.equal(h.client.slots.find(item => item.slot === slot).id, maze.id);
  }
  rejectWrite = true;
  const originalId = stored.a.id;
  h.client.request('put', 'a', core.buildPreset('hard', 3).maze);
  await flush();
  assert.equal(stored.a.id, originalId);
  assert.match(h.states.at(-1).message, /storage write failed/);
  h.client.request('clear', 'a');
  await flush();
  assert.equal(stored.a, undefined);
  assert.equal(h.client.slots.length, 1);
  assert.equal(h.client.slots[0].slot, 'b');
  assert.match(h.states.at(-1).message, /清空成功/);
  assert.equal(h.timers.size, 0);
});
