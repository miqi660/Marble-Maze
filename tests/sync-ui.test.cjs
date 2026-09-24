'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page() {
  const root = path.join(__dirname, '../app/src/main/assets/generator');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
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
  let confirm = false;
  const sandbox = {
    document: { getElementById: id => elements[id], querySelectorAll: () => [], createElement: element },
    AndroidGenerator: {
      scanDevices: () => calls.push('scan'), connectWear: id => calls.push(id),
      sendWear: (token, id, text) => sent.push({ token, id, message: JSON.parse(text) }),
      disconnectWear: (token, reason) => calls.push({ token, reason })
    }, TextEncoder, Uint8Array,
    confirm: () => confirm,
    setTimeout: callback => { timers.add(callback); return callback; },
    clearTimeout: callback => timers.delete(callback)
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  // 按页面中的实际顺序加载所有脚本，覆盖资源路径和初始化顺序。
  for (const script of html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)) {
    vm.runInContext(script[1] ? fs.readFileSync(path.join(root, script[1]), 'utf8') : script[2], sandbox);
  }
  const click = id => {
    assert.equal(elements[id].disabled, false, id + ' 应可点击');
    elements[id].handlers.click();
  };
  const event = value => sandbox.MazeSyncUI.onNativeEvent(value);
  const message = value => event({ type: 'message', token: 2, text: JSON.stringify(value) });
  function connected(slots = []) {
    click('scanWear');
    event({ type: 'devices', nodes: [{ id: 'band-1', name: '测试手环' }], message: '请选择设备' });
    click('connectWear');
    event({ type: 'disconnected', token: 1, message: '正在切换连接' });
    event({ type: 'status', token: 2, message: '正在检查互联授权' });
    event({ type: 'ready', token: 2, name: '测试手环' });
    message({ tag: '__hs__', count: 1 });
    message({ tag: 'maze', type: 'list', slots });
  }
  return { elements, sent, calls, click, event, message, connected,
    accept: () => { confirm = true; }, maze: () => sandbox.getCurrentMaze() };
}

test('页面从查询设备到握手完成后解锁上传；存储确认及列表匹配才显示成功', () => {
  const p = page();
  assert.equal(p.elements.puta.disabled, true);
  p.connected();
  assert.equal(p.elements.puta.disabled, false);
  assert.equal(p.elements.cleara.disabled, true);
  p.click('puta');
  assert.equal(p.sent.at(-1).message.stat, 'put');
  assert.equal(p.elements.putb.disabled, true);
  assert.equal(p.elements.scanWear.disabled, true);
  p.message({ tag: 'maze', type: 'ack', slot: 'a', ok: true });
  assert.equal(p.sent.at(-1).message.stat, 'list');
  assert.doesNotMatch(p.elements.wearStatus.textContent, /同步成功/);
  const maze = p.maze();
  p.message({ tag: 'maze', type: 'list', slots: [{ slot: 'a', name: '', id: maze.id, cols: maze.cols, rows: maze.rows }] });
  assert.match(p.elements.wearStatus.textContent, /同步成功/);
  assert.equal(p.elements.cleara.disabled, false);
});

test('覆盖或清空需要确认；取消不会发送，失效关卡禁止上传', () => {
  const p = page();
  const maze = p.maze();
  p.connected([{ slot: 'a', name: '<b>关卡名</b>', id: maze.id, cols: maze.cols, rows: maze.rows }]);
  assert.match(p.elements.slota.textContent, /<b>关卡名<\/b>/);
  const count = p.sent.length;
  p.click('puta');
  p.click('cleara');
  assert.equal(p.sent.length, count);
  p.accept();
  p.click('cleara');
  assert.equal(p.sent.at(-1).message.stat, 'clear');
  p.message({ tag: 'maze', type: 'ack', slot: 'a', ok: true });
  p.message({ tag: 'maze', type: 'list', slots: [] });
  assert.match(p.elements.wearStatus.textContent, /清空成功/);
  p.elements.seed.value = '-1';
  p.click('generate');
  assert.equal(p.elements.puta.disabled, true);
  assert.equal(p.elements.putb.disabled, true);
});

test('授权失败或 SDK 不可用能恢复查询入口，断线后不能沿用旧槽位', () => {
  const p = page();
  p.click('scanWear');
  p.event({ type: 'unavailable', message: '穿戴 SDK 无法加载' });
  assert.equal(p.elements.scanWear.disabled, false);
  p.connected();
  p.event({ type: 'disconnected', token: 2, message: '服务已断开' });
  assert.equal(p.elements.puta.disabled, true);
  assert.equal(p.elements.slota.textContent, '尚未读取');
  assert.equal(p.elements.connectWear.disabled, false);
  p.click('connectWear');
  p.event({ type: 'disconnected', token: 3, message: '未获得设备管理授权' });
  assert.equal(p.elements.connectWear.disabled, false);
  assert.equal(p.elements.scanWear.disabled, false);
  assert.match(p.elements.wearStatus.textContent, /未获得设备管理授权/);
});
