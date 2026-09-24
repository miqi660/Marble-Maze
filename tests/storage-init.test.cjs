'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../app/src/main/assets/generator/tools/maze/generator-core.js');
const validate = require('./fixtures/band/maze-validate.js');
const { levelForSync, Client } = require('../app/src/main/assets/generator/sync-client.js');
const level = seed => validate.stripCrc(levelForSync(core.buildPreset('normal', seed).maze));
function setup(initial = {}) {
  const data = new Map(Object.entries(initial)); const calls = []; let fault = null;
  function run(op, options, action) {
    calls.push([op, options.key]);
    if (fault && fault.op === op && fault.key === options.key) return options.fail('模拟存储故障', 300);
    action();
  }
  const context = { MazeValidate: validate, CustomLevels: require('./fixtures/band/custom-levels.js'), console: { log() {} },
    storage: {
      get(o) { run('get', o, () => o.success(data.has(o.key) ? data.get(o.key) : o.default || '')); },
      set(o) { run('set', o, () => { data.set(o.key, o.value); o.success(); }); },
      delete(o) { run('delete', o, () => { if (!data.has(o.key)) o.fail('不存在', 404); else { data.delete(o.key); o.success(); } }); }
    }
  };
  vm.createContext(context);
  const source = fs.readFileSync(__dirname + '/fixtures/band/slot-store.js', 'utf8').replace(/^import .*$/gm, '').replace('export default class', 'class');
  vm.runInContext(source + '\nthis.Store = SlotStore;', context);
  return { store: new context.Store(), data, calls, fault: value => { fault = value; } };
}
test('全新空存储无需删除不存在的旧键，即可完成初始化', async () => {
  const h = setup(); assert.equal(await h.store.init(), true);
  assert.equal(h.data.get('custom_storage_version'), '2'); assert.equal(h.store.count(), 0);
  assert.equal(h.calls.filter(([op]) => op === 'delete').length, 0);
});
test('仅部分旧键存在时保留顺序迁移，跳过其他空键', async () => {
  const h = setup({ custom_a: JSON.stringify(level(1)), custom_f: JSON.stringify(level(2)) });
  assert.equal(await h.store.init(), true); assert.equal(h.store.count(), 2);
  assert.equal(h.store.get(0).id, level(1).id); assert.equal(h.store.get(1).id, level(2).id);
  assert.deepEqual(h.calls.filter(([op]) => op === 'delete').map(([,key]) => key), ['custom_a', 'custom_f']);
});
test('已迁移连续关卡只读取，不迁移或删除', async () => {
  const h = setup({ custom_storage_version: '2', custom_01: JSON.stringify(level(1)) });
  assert.equal(await h.store.init(), true); assert.equal(h.store.count(), 1);
  assert.ok(h.calls.every(([op]) => op === 'get'));
});
for (const [op, key] of [['get', 'custom_storage_version'], ['get', 'custom_f'], ['get', 'custom_03'],
  ['set', 'custom_02'], ['delete', 'custom_f'], ['set', 'custom_storage_version']]) {
  test('失败保留诊断和旧记录，恢复后重试：' + op + ' ' + key, async () => {
    const oldA = JSON.stringify(level(1)), oldF = JSON.stringify(level(2));
    const h = setup({ custom_a: oldA, custom_f: oldF }); h.fault({ op, key });
    const first = h.store.init(); assert.equal(h.store.init(), first);
    assert.equal(await first, false); assert.equal(h.store.initialized, false);
    assert.match(h.store.lastError, new RegExp(op + ' ' + key + ' code=300'));
    assert.equal(h.data.get('custom_a'), oldA); assert.equal(h.data.get('custom_f'), oldF);
    h.fault(null); const retry = h.store.init(); assert.notEqual(retry, first);
    assert.equal(h.store.init(), retry); assert.equal(await retry, true);
    assert.equal(h.store.lastError, ''); assert.equal(h.store.count(), 2);
  });
}
test('手机显示 list 失败细节且不解锁写操作', () => {
  let state;
  const client = new Client({ send() {}, disconnect() {}, changed(s) { state = s; }, schedule() { return () => {}; } });
  client.ready(1); client.receive(1, JSON.stringify({ tag: '__hs__', count: 1 }));
  client.receive(1, JSON.stringify({ tag: 'maze', type: 'list', levels: [], ok: false, message: '读取版本: get custom_storage_version code=300' }));
  assert.match(state.message, /custom_storage_version code=300/);
  assert.equal(state.connected, false); assert.equal(state.levels, null);
});
