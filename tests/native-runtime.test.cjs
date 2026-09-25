'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../app/src/main/assets/generator');
function setup() {
  let state;
  const sent = [], timers = [];
  const context = { TextEncoder, Uint8Array, setTimeout(fn) { timers.push(fn); return fn; }, clearTimeout(fn) { const i = timers.indexOf(fn); if(i >= 0) timers.splice(i, 1); },
    AndroidGenerator: { publish: text => state = JSON.parse(text), sendWear: (token, id, text) => sent.push(JSON.parse(text)), disconnectWear() {}, scanDevices() {}, connectWear() {} } };
  context.window = context;
  vm.createContext(context);
  for (const name of ['tools/maze/generator-core.js', 'sync-client.js', 'native-runtime.js']) vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context);
  const command = action => context.NativeRuntime.command(action);
  const event = value => context.NativeRuntime.onNativeEvent(value);
  const message = value => event({ type: 'message', token: 1, text: JSON.stringify(value) });
  command({ action: 'generate', cols: 8, rows: 15, seed: 1 });
  const connect = () => { event({ type: 'ready', token: 1, name: 'Band' }); message({ tag: '__hs__', count: 1 }); message({ tag: 'maze', type: 'list', levels: [] }); };
  return { command, event, message, connect, sent, timers, get state() { return state; } };
}
test('原生兼容层生成、Seed、预设与导入仍经过完整校验', () => {
  const r = setup(), first = r.state.editor.maze;
  assert.equal(r.state.editor.preset, 'normal');
  r.command({ action: 'generate', cols: 8, rows: 15, seed: 1 });
  assert.deepEqual(r.state.editor.maze, first);
  r.command({ action: 'generate', cols: 11, rows: 20, seed: 4294967295 });
  assert.equal(r.state.editor.preset, 'custom');
  r.command({ action: 'import', text: JSON.stringify(first) });
  assert.equal(r.state.editor.seed, null);
  assert.equal(r.state.editor.imported, true);
  assert.deepEqual(r.state.editor.maze, first);
  r.command({ action: 'import', text: JSON.stringify({ ...first, cols: 6 }) });
  assert.match(r.state.editor.error, /列数必须在/);
  assert.deepEqual(r.state.editor.maze, first);
});
test('添加只有 ACK 后完整列表核对成功才报告成功', () => {
  const r = setup(); r.connect();
  r.command({ action: 'add' });
  const level = r.sent.at(-1).level;
  assert.equal(r.state.device.busy, true);
  r.message({ tag: 'maze', type: 'ack', stat: 'add', index: 0, ok: true });
  assert.equal(r.sent.at(-1).stat, 'list');
  assert.equal(r.state.device.busy, true);
  assert.doesNotMatch(r.state.device.message, /成功/);
  r.message({ tag: 'maze', type: 'list', levels: [{ index: 0, id: level.id, name: '', cols: 8, rows: 15 }] });
  assert.match(r.state.device.message, /同步成功/);
  assert.equal(r.state.device.levels.length, 1);
});
test('写入超时锁住添加；重新连接并回读后才能解锁', () => {
  const r = setup(); r.connect(); r.command({ action: 'add' });
  r.timers.at(-1)();
  assert.equal(r.state.device.unknown, true);
  const count = r.sent.length;
  r.command({ action: 'add' });
  assert.equal(r.sent.length, count);
  r.event({ type: 'devices', nodes: [], message: '请选择设备' });
  assert.equal(r.state.device.unknown, true);
  r.connect();
  assert.equal(r.state.device.unknown, false);
});
test('写入期间掉线与 ACK 后回读不匹配均保留结果未知', () => {
  const r = setup(); r.connect(); r.command({ action: 'add' });
  r.event({ type: 'disconnected', token: 1, message: '服务断开' });
  assert.equal(r.state.device.unknown, true);
  r.connect(); r.command({ action: 'add' });
  r.message({ tag: 'maze', type: 'ack', stat: 'add', index: 0, ok: true });
  r.message({ tag: 'maze', type: 'list', levels: [] });
  assert.equal(r.state.device.unknown, true);
  assert.equal(r.state.device.connected, false);
});
test('恢复期间不丢失未知锁定，非法 JSON 不替换有效预览', () => {
  const r = setup();
  r.command({ action: 'resume', unknown: true });
  r.command({ action: 'import', text: '{' });
  assert.equal(r.state.device.unknown, true);
  assert.ok(r.state.editor.maze);
  assert.ok(r.state.editor.detail);
});
