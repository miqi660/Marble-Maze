const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../app/src/main/assets/generator/tools/maze/generator-core');
const sync = require('../app/src/main/assets/generator/sync-client');
for (const profile of ['band', 'pro']) {
  test(`${profile} 四档预设、确定性、CRC 与完整校验`, () => {
    const expected = profile === 'band' ? [[7,13],[8,15],[9,17],[10,19]] : [[10,9],[12,10],[14,12],[16,13]];
    assert.deepEqual(Object.values(core.PROFILES[profile].presets), expected);
    for (const [cols, rows] of expected) for (const seed of [0, 1, 38291627, 4294967295]) {
      const a = core.build(cols, rows, seed, 'custom', profile);
      assert.deepEqual(a.maze, core.build(cols, rows, seed, 'custom', profile).maze);
      assert.equal(core.validateFull(a.maze).ok, true);
      assert.match(a.maze.id, profile === 'band' ? /^m-b-/ : /^m-p-/);
      assert.ok(sync.levelForSync(a.maze).crc);
      const baseline = core.buildFromSpec({ generatorVersion: 1, profile, cols, rows, seed, difficulty: 'custom', algorithm: 'dfs' });
      assert.ok(a.validation.renderRunCount <= baseline.validation.renderRunCount);
    }
  });
}
test('跨 Profile 同尺寸的拓扑与起终点一致，ID 分离', () => {
  for (const seed of [0, 38291627, 4294967295]) {
    const a = core.build(7,13,seed,'custom','band').maze;
    const b = core.build(7,13,seed,'custom','pro').maze;
    for (const field of ['cells','start','goal','render']) assert.deepEqual(a[field], b[field]);
    assert.notEqual(a.id, b.id);
  }
});
test('严格解析参数分享字符串及 Seed 边界', () => {
  assert.deepEqual(core.parseSpec('12x10@38291627', 'pro'), { profile:'pro', cols:12, rows:10, seed:38291627 });
  for (const text of ['12@123','12x10','ax10@123','12x10@-1','12x10@4294967296','12x10@1.2','12x10@1e3']) assert.throws(() => core.parseSpec(text,'pro'));
  assert.throws(() => core.parseSpec('12x10@123','band'));
  assert.equal(core.parseSpec('16x13@4294967295','pro').seed,4294967295);
});
test('Fit Center 只有一个缩放比例且居中，Pro 使用明确的最终参数', () => {
  assert.deepEqual(core.fitCanvas('band',192,490), { scale:1, offsetX:0, offsetY:0 });
  for (const [w,h] of [[212,520],[384,980],[400,400]]) {
    const fit = core.fitCanvas('band',w,h);
    assert.equal(fit.scale,Math.min(w/192,h/490));
    assert.equal(fit.offsetX * 2 + 192 * fit.scale,w);
    assert.equal(fit.offsetY * 2 + 490 * fit.scale,h);
  }
  assert.deepEqual(core.PROFILES.pro.canvas,{width:336,height:480,radius:42,screenRadius:40,mazeLeft:16,mazeTop:96,mazeW:304,mazeH:280});
});
test('旧 v1 的生成仍可复现，未知版本拒绝', () => {
  const spec = {generatorVersion:1,profile:'band',cols:8,rows:15,seed:123,algorithm:'dfs',difficulty:'normal'};
  const maze = core.buildFromSpec(spec).maze;
  assert.equal(maze.cells,Array.from(core.generateCells(8,15,123),v=>v.toString(16).toUpperCase()).join(''));
  assert.throws(()=>core.buildFromSpec({...spec,generatorVersion:999}));
});
