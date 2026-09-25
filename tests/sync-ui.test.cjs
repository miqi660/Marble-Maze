'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page() {
  const root = path.join(__dirname, '../app/src/main/assets/generator');
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/legacy-ui/index.html'), 'utf8');
  const elements = {};
  const drawing = new Proxy({}, { get: (obj, key) => obj[key] || (() => {}) });
  function element() {
    return { value: '', checked: true, disabled: false, width: 360, height: 560,
      handlers: {}, children: [],
      addEventListener(event, handler) { this.handlers[event] = handler; },
      getContext: () => drawing,
      replaceChildren() { this.children = []; this.value = ''; },
      appendChild(child) { this.children.push(child); if (!this.value) this.value = child.value; }
    };
  }
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements[id] = element();
  for (const [id, value] of Object.entries({ cols: '8', rows: '15', seed: '1', preset: 'normal' })) {
    elements[id].value = value;
  }
  const sent = [], calls = [], timers = new Set();
  let confirm = false; const prompts = [];
  const sandbox = {
    document: { getElementById: id => elements[id], querySelectorAll: () => [], createElement: element },
    AndroidGenerator: {
      scanDevices: () => calls.push('scan'), connectWear: id => calls.push(id),
      sendWear: (token, id, text) => sent.push({ token, id, message: JSON.parse(text) }),
      disconnectWear: (token, reason) => calls.push({ token, reason })
    }, TextEncoder, Uint8Array,
    confirm: prompt => { prompts.push(prompt); return confirm; },
    setTimeout: callback => { timers.add(callback); return callback; },
    clearTimeout: callback => timers.delete(callback)
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  // 保留旧页面交互作为回归基线；正式 APK 使用 native-runtime，另有独立状态测试。
  for (const script of html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)) {
    vm.runInContext(script[1] ? fs.readFileSync(path.basename(script[1]) === 'sync-ui.js' ? path.join(__dirname, 'fixtures/legacy-ui/sync-ui.js') : path.join(root, script[1]), 'utf8') : script[2], sandbox);
  }
  const click = id => {
    assert.equal(elements[id].disabled, false, id + ' 应可点击');
    elements[id].handlers.click();
  };
  const event = value => sandbox.MazeSyncUI.onNativeEvent(value);
  const message = value => event({ type: 'message', token: 2, text: JSON.stringify(value) });
  function connected(levels = []) {
    click('scanWear');
    event({ type: 'devices', nodes: [{ id: 'band-1', name: '测试手环' }], message: '请选择设备' });
    click('connectWear');
    event({ type: 'disconnected', token: 1, message: '正在切换连接' });
    event({ type: 'status', token: 2, message: '正在检查互联授权' });
    event({ type: 'ready', token: 2, name: '测试手环' });
    message({ tag: '__hs__', count: 1 });
    message({ tag: 'maze', type: 'list', levels });
  }
  return { elements, sent, calls, click, event, message, connected, prompts,
    accept: () => { confirm = true; }, maze: () => sandbox.getCurrentMaze() };
}

const summaries = (count, maze) => Array.from({ length: count }, (_, index) =>
  ({ index, id: maze.id + index, name: '<b>关卡名</b>', cols: maze.cols, rows: maze.rows }));
const cards = p => p.elements.customLevelList.children;
function action(p, index, kind) {
  const button = cards(p)[index].children[3].children[kind === 'replace' ? 0 : 1];
  assert.equal(button.disabled, false);
  button.handlers.click();
}
for (const count of [0, 1, 6, 7, 12]) test('动态渲染 ' + count + ' / 12 与操作可用性', () => {
  const p = page(); p.connected(summaries(count, p.maze()));
  assert.equal(p.elements.customLevelCount.textContent, '自定义关卡 ' + count + ' / 12');
  assert.equal(p.elements.addLevel.disabled, count === 12);
  if (!count) assert.equal(cards(p)[0].textContent, '暂无自定义关卡');
  else {
    assert.equal(cards(p).length, count);
    for (let index = 0; index < count; index++) {
      assert.equal(cards(p)[index].children[0].textContent, String(index + 1).padStart(2, '0'));
      assert.equal(cards(p)[index].children[1].textContent, '<b>关卡名</b>');
      for (const button of cards(p)[index].children[3].children) assert.equal(button.disabled, false);
    }
  }
});

test('添加成功必须等待 ACK 后重新 list；非法生成关卡不能添加', () => {
  const p = page(); assert.equal(p.elements.addLevel.disabled, true); p.connected();
  p.click('addLevel'); const sent = p.sent.at(-1).message;
  assert.equal(sent.stat, 'add'); assert.equal(Object.hasOwn(sent, 'index'), false);
  assert.equal(p.elements.addLevel.disabled, true);
  p.message({ tag: 'maze', type: 'ack', stat: 'add', index: 0, ok: true });
  assert.equal(p.sent.at(-1).message.stat, 'list');
  assert.doesNotMatch(p.elements.wearStatus.textContent, /成功/);
  const level = sent.level;
  p.message({ tag: 'maze', type: 'list', levels: [{ index: 0, id: level.id, name: level.name || '', cols: level.cols, rows: level.rows }] });
  assert.match(p.elements.wearStatus.textContent, /同步成功/);
  p.elements.seed.value = '-1'; p.click('generate');
  assert.equal(p.elements.addLevel.disabled, true);
  assert.equal(cards(p)[0].children[3].children[0].disabled, true);
  assert.equal(cards(p)[0].children[3].children[1].disabled, false);
});

for (const kind of ['replace', 'remove']) test(kind + ' 必须确认；取消不发送，确认后按 index 发送', () => {
  const p = page(); const before = summaries(12, p.maze()); p.connected(before);
  const count = p.sent.length; action(p, 2, kind);
  assert.equal(p.sent.length, count); assert.match(p.prompts.at(-1), /自定义 03/);
  if (kind === 'remove') assert.match(p.prompts.at(-1), /自动前移/);
  p.accept(); action(p, 2, kind);
  const sent = p.sent.at(-1).message;
  assert.equal(sent.stat, kind); assert.equal(sent.index, 2);
  assert.doesNotMatch(p.elements.wearStatus.textContent, /成功/);
  p.message({ tag: 'maze', type: 'ack', stat: kind, index: 2, ok: true });
  assert.equal(p.sent.at(-1).message.stat, 'list');
  assert.doesNotMatch(p.elements.wearStatus.textContent, /成功/);
  let after = before.slice();
  if (kind === 'remove') after = after.filter(item => item.index !== 2).map((item, index) => ({ ...item, index }));
  else after[2] = { index: 2, id: sent.level.id, name: sent.level.name || '', cols: sent.level.cols, rows: sent.level.rows };
  p.message({ tag: 'maze', type: 'list', levels: after });
  assert.match(p.elements.wearStatus.textContent, kind === 'remove' ? /删除成功/ : /替换成功/);
  assert.equal(p.elements.addLevel.disabled, kind !== 'remove');
});

test('SDK 失败恢复入口；断开清除旧列表，重连必须重新查询', () => {
  const p = page(); p.click('scanWear'); p.event({ type: 'unavailable', message: '穿戴 SDK 无法加载' });
  assert.equal(p.elements.scanWear.disabled, false);
  p.connected(summaries(7, p.maze()));
  p.event({ type: 'disconnected', token: 2, message: '服务已断开' });
  assert.equal(p.elements.addLevel.disabled, true);
  assert.equal(cards(p)[0].textContent, '尚未读取');
  assert.equal(p.elements.customLevelCount.textContent, '自定义关卡 — / 12');
  p.click('connectWear');
  p.event({ type: 'disconnected', token: 3, message: '未获得设备管理授权' });
  assert.equal(p.elements.connectWear.disabled, false);
  p.click('connectWear'); p.event({ type: 'ready', token: 3 });
  p.event({ type: 'message', token: 2, text: JSON.stringify({ tag: 'maze', type: 'list', levels: summaries(7, p.maze()) }) });
  assert.equal(cards(p)[0].textContent, '尚未读取');
  p.event({ type: 'message', token: 3, text: JSON.stringify({ tag: '__hs__', count: 1 }) });
  assert.equal(p.sent.at(-1).message.stat, 'list'); assert.equal(p.elements.addLevel.disabled, true);
  p.event({ type: 'message', token: 3, text: JSON.stringify({ tag: 'maze', type: 'list', levels: [] }) });
  assert.equal(p.elements.addLevel.disabled, false);
});
