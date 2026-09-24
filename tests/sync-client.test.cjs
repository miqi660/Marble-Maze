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
  const connect = (levels = []) => {
    client.ready(1);
    receive({ tag: '__hs__', count: 1 });
    receive({ tag: 'maze', type: 'list', levels });
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

test('握手只接受数值 0..2，自动查询关卡，重复握手不重启业务', () => {
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

const maze = seed => core.buildPreset('normal', seed).maze;
const summary = (level, index) => ({ index, id: level.id, name: level.name || '', cols: level.cols, rows: level.rows });
const levels = count => Array.from({ length: count }, (_, index) => summary(maze(index), index));
function complete(h, kind, index, result) {
  h.receive({ tag: 'maze', type: 'ack', stat: kind, index, ok: true });
  assert.equal(h.client.pending.kind, 'list');
  assert.doesNotMatch(h.states.at(-1).message, /成功/);
  h.receive({ tag: 'maze', type: 'list', levels: result });
  assert.match(h.states.at(-1).message, /成功/);
  assert.deepEqual(h.client.levels, result);
}

test('空列表；连续添加 0→6→7→12，满额禁止发送第十三次', () => {
  const h = harness(); h.connect();
  assert.deepEqual(h.client.levels, []);
  for (let i = 0; i < 12; i++) {
    h.client.request('add', undefined, maze(i));
    assert.deepEqual(Object.keys(h.sent.at(-1).message), ['tag', 'stat', 'level']);
    assert.throws(() => h.client.request('list'));
    assert.doesNotMatch(h.states.at(-1).message, /成功/);
    complete(h, 'add', i, levels(i + 1));
  }
  const count = h.sent.length;
  assert.throws(() => h.client.request('add', undefined, maze(13)), /已满/);
  assert.equal(h.sent.length, count);
});

for (const index of [0, 5, 6, 11]) test('替换 index=' + index + '，其他摘要保持不变', () => {
  const h = harness(); const before = levels(12); h.connect(before);
  h.client.request('replace', index, maze(100));
  assert.equal(h.sent.at(-1).message.index, index);
  const after = before.slice(); after[index] = summary(maze(100), index);
  complete(h, 'replace', index, after);
});

for (const index of [2, 4]) test('删除 index=' + index + ' 后按连续编号确认', () => {
  const h = harness(); const before = levels(5); h.connect(before);
  h.client.request('remove', index);
  assert.deepEqual(h.sent.at(-1).message, { tag: 'maze', stat: 'remove', index });
  const after = before.filter(item => item.index !== index).map(summary);
  complete(h, 'remove', index, after);
});

test('错误 index 在发送前拒绝', () => {
  const h = harness(); h.connect(levels(7));
  const count = h.sent.length;
  for (const kind of ['replace', 'remove']) for (const index of [-1, 7, 12, 0.5, '0', null, undefined]) {
    assert.throws(() => h.client.request(kind, index, maze(1)), /无效/);
  }
  assert.equal(h.sent.length, count);
});

test('忽略错误 stat/index/type/ok、旧连接及无效 JSON', () => {
  for (const kind of ['add', 'replace', 'remove']) {
    const h = harness(); h.connect(levels(1));
    const index = kind === 'add' ? 1 : 0;
    h.client.request(kind, index, maze(2));
    const ack = { tag: 'maze', type: 'ack', stat: kind, index, ok: true };
    h.receive(ack, 2);
    for (const patch of [{ stat: 'wrong' }, { index: index + 1 }, { index: String(index) }, { type: 'list' }, { ok: 'true' }]) h.receive({ ...ack, ...patch });
    for (const text of ['{', 'null', '[]', '1', '"x"', 'x'.repeat(20000)]) h.client.receive(1, text);
    assert.equal(h.client.pending.kind, kind);
  }
});

test('非法列表：跳号、重复、超过十二项、错误尺寸或结构均不能解锁操作', () => {
  const h = harness(); h.client.ready(1); h.receive({ tag: '__hs__', count: 2 });
  const base = levels(3);
  for (const value of [null, {}, [null], [base[0], base[1], { ...base[2], index: 3 }],
    [base[0], base[0]], levels(13), [{ ...base[0], cols: '8' }], [{ ...base[0], rows: '15' }],
    [{ ...base[0], cols: 6 }], [{ ...base[0], rows: 21 }], [{ ...base[0], id: null }]]) {
    h.receive({ tag: 'maze', type: 'list', levels: value });
    assert.equal(h.client.pending.kind, 'list');
    assert.equal(h.client.levels, null);
  }
  h.receive({ tag: 'maze', type: 'list', levels: [] });
  assert.deepEqual(h.client.levels, []);
});

test('存储初始化失败的 list 不能当空列表；add 失败无需 index', () => {
  const h = harness(); h.client.ready(1); h.receive({ tag: '__hs__', count: 2 });
  h.receive({ tag: 'maze', type: 'list', levels: [], ok: false });
  assert.equal(h.client.connected, false);
  h.connect(); h.client.request('add', undefined, maze(2));
  h.receive({ tag: 'maze', type: 'ack', stat: 'add', ok: false, message: 'custom levels full' });
  assert.match(h.states.at(-1).message, /custom levels full/);
  assert.equal(h.client.levels, null);
});

test('三类写操作 8 秒超时结果未知，不重发；ACK 后查询超时也不能成功', () => {
  for (const kind of ['add', 'replace', 'remove']) for (const ackFirst of [false, true]) {
    const h = harness(); h.connect(levels(1));
    h.client.request(kind, 0, maze(2));
    if (ackFirst) h.receive({ tag: 'maze', type: 'ack', stat: kind, index: kind === 'add' ? 1 : 0, ok: true });
    h.advance(7999); assert.equal(h.client.connected, true);
    h.advance(1);
    assert.equal(h.client.connected, false);
    assert.match(h.states.at(-1).message, /结果未知/);
    assert.equal(h.sent.filter(item => item.message.stat === kind).length, 1);
    assert.equal(h.timers.size, 0);
  }
});

test('握手三次超时、连接轮次与迟到发送错误隔离', () => {
  const h = harness(); h.client.ready(1); h.advance(9000);
  assert.equal(h.sent.length, 3); assert.equal(h.client.connected, false);
  h.client.ready(2); h.receive({ tag: '__hs__', count: 1 });
  assert.equal(h.client.connected, false);
  h.receive({ tag: '__hs__', count: 1 }, 2); h.advance(8000);
  assert.match(h.states.at(-1).message, /查询超时/);
  h.connect(); const old = h.sent.at(-1);
  h.client.request('add', undefined, maze(2));
  h.client.failed(old.token, old.id, '迟到错误'); assert.equal(h.client.connected, true);
  const active = h.sent.at(-1); h.client.failed(active.token, active.id, '服务断开');
  assert.equal(h.client.connected, false);
});

test('ACK 后长度、目标摘要或其他关卡不匹配都禁止成功并清除状态', () => {
  for (const kind of ['add', 'replace', 'remove']) for (const damage of ['length', 'id', 'name', 'cols']) {
    const h = harness(); const before = levels(4); h.connect(before);
    h.client.request(kind, 2, maze(50));
    h.receive({ tag: 'maze', type: 'ack', stat: kind, index: kind === 'add' ? 4 : 2, ok: true });
    let after = before.slice();
    if (kind === 'add') after.push(summary(maze(50), 4));
    if (kind === 'replace') after[2] = summary(maze(50), 2);
    if (kind === 'remove') after = after.filter(item => item.index !== 2).map(summary);
    if (damage === 'length') after.pop();
    else after[0] = { ...after[0], [damage]: damage === 'cols' ? 9 : '被修改' };
    h.receive({ tag: 'maze', type: 'list', levels: after });
    assert.equal(h.client.connected, false); assert.equal(h.client.levels, null);
    assert.match(h.states.at(-1).message, /不一致/);
    assert.doesNotMatch(h.states.at(-1).message, /成功/);
  }
});

test('当前真实 MazeSync 与 SlotStore fixture 完成添加、替换、删除及回读', async () => {
  const h = harness(); const data = new Map([['custom_storage_version', '2']]);
  let rejectWrite = false;
  const context = { MazeValidate: validate, CustomLevels: require('./fixtures/band/custom-levels.js'),
    interconnModule: class {}, setTimeout, clearTimeout, console,
    storage: {
      get({ key, success }) { success(data.get(key) || ''); },
      set({ key, value, success, fail }) { if (rejectWrite) fail(); else { data.set(key, value); success(); } },
      delete({ key, success }) { data.delete(key); success(); }
    }
  };
  vm.createContext(context);
  for (const [file, name] of [['slot-store.js', 'SlotStore'], ['maze-sync.js', 'MazeSync']]) {
    const source = fs.readFileSync(path.join(__dirname, 'fixtures/band', file), 'utf8')
      .replace(/^import .*$/gm, '').replace('export default class', 'class');
    vm.runInContext(source + '\nthis.' + name + ' = ' + name + ';', context);
  }
  const store = new context.SlotStore(); context.MazeSync.store = store;
  const receiver = new context.MazeSync({ send: payload => h.receive({ ...payload, tag: 'maze' }), addListener() {}, removeListener() {} });
  let cursor = 0;
  async function flush() {
    while (cursor < h.sent.length) {
      const { message } = h.sent[cursor++];
      if (message.tag === '__hs__' && message.count < 2) h.receive({ tag: '__hs__', count: message.count + 1 });
      if (message.tag === 'maze') await receiver.onMessage(message);
    }
  }
  h.client.ready(1); await flush(); assert.deepEqual(h.client.levels, []);
  for (let index = 0; index < 12; index++) {
    h.client.request('add', undefined, maze(index)); await flush();
    assert.equal(h.client.levels.length, index + 1); assert.equal(store.get(index).id, maze(index).id);
    assert.match(h.states.at(-1).message, /同步成功/);
  }
  for (const index of [0, 5, 6, 11]) {
    h.client.request('replace', index, maze(50 + index)); await flush();
    assert.equal(h.client.levels[index].id, maze(50 + index).id);
    assert.match(h.states.at(-1).message, /替换成功/);
  }
  const nextId = store.get(3).id;
  h.client.request('remove', 2); await flush(); assert.equal(h.client.levels[2].id, nextId);
  h.client.request('remove', 10); await flush(); assert.equal(h.client.levels.length, 10);
  assert.match(h.states.at(-1).message, /删除成功/);
  rejectWrite = true;
  h.client.request('replace', 0, maze(100)); await flush();
  assert.match(h.states.at(-1).message, /storage write failed/);
  assert.equal(store.get(0).id, maze(50).id); assert.equal(h.timers.size, 0);
  receiver.destroy();
});
