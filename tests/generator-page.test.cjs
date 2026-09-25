'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '../app/src/main/assets/generator');
const html = fs.readFileSync(path.join(__dirname, 'fixtures/legacy-ui/index.html'), 'utf8');
const elements = {};
const drawing = new Proxy({}, { get: (obj, key) => obj[key] || (() => {}) });
for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
  elements[id] = { value: '', checked: false, width: 360, height: 560,
    handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; },
    getContext: () => drawing };
}
Object.assign(elements.cols, {value: '8'});
Object.assign(elements.rows, {value: '15'});
Object.assign(elements.seed, {value: '1'});
Object.assign(elements.preset, {value: 'normal'});
let exported, copied;
const sandbox = {document: {getElementById: id => elements[id], querySelectorAll: () => []},
  AndroidGenerator: {exportJson: (name, text) => { exported = {name, text}; },
    copyText: text => { copied = text; }}, TextEncoder, Uint8Array};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'tools/maze/generator-core.js'), 'utf8'), sandbox);
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], sandbox);
const click = id => elements[id].handlers.click();
assert.match(elements.status.textContent, /^PASS/);
click('downloadMaze');
assert.equal(exported.text, JSON.stringify(JSON.parse(elements.code.value)));
assert.equal(exported.text.endsWith('\n'), false);
assert.equal(exported.name, JSON.parse(exported.text).id + '.json');
click('copy');
assert.equal(copied, elements.code.value);
const validText = exported.text;
elements.seed.value = '-1';
click('generate');
assert.match(elements.status.textContent, /^REJECT/);
assert.equal(elements.downloadMaze.disabled, true);
exported = null;
click('downloadMaze');
assert.equal(exported, null);
elements.importText.value = validText;
click('validateImport');
assert.match(elements.status.textContent, /^PASS/);
click('downloadMaze');
assert.equal(exported.text, validText);
elements.importText.value = '{}';
click('validateImport');
assert.match(elements.status.textContent, /^REJECT/);
console.log('PASS 页面生成、复制、导出、导入与拒绝流程（模拟 DOM，非设备测试）');
