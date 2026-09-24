'use strict';
const assert = require('assert');
const crypto = require('crypto');
const C = require('../app/src/main/assets/generator/tools/maze/generator-core.js');

function nodeSha256(text){ return crypto.createHash('sha256').update(text, 'utf8').digest('hex'); }
function nodeCrc32(bytes){
  let crc=0xFFFFFFFF;
  for(const byte of bytes){ crc ^= byte; for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xEDB88320:0); }
  return (crc^0xFFFFFFFF)>>>0;
}

assert.deepStrictEqual(C.PRESETS.easy, [7,13]);
assert.deepStrictEqual(C.PRESETS.normal, [8,15]);
assert.deepStrictEqual(C.PRESETS.hard, [9,17]);
assert.deepStrictEqual(C.PRESETS.expert, [10,19]);
assert.strictEqual(C.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.strictEqual(C.crc32IsoHdlc(Buffer.from('123456789','ascii')).toString(16).toUpperCase().padStart(8,'0'), 'CBF43926');
assert.strictEqual(C.performanceGate(190,200), 'GREEN');
assert.strictEqual(C.performanceGate(191,200), 'YELLOW');
assert.strictEqual(C.performanceGate(220,256), 'YELLOW');
assert.strictEqual(C.performanceGate(221,100), 'REJECT');
assert.strictEqual(C.performanceGate(100,257), 'REJECT');

for (const [name,[cols,rows]] of Object.entries(C.PRESETS)) {
  for (const seed of [0,1,2,123456789,0xFFFFFFFF]) {
    const a=C.build(cols,rows,seed,name), b=C.build(cols,rows,seed,name);
    assert.deepStrictEqual(a.maze,b.maze, `${name}/${seed} deterministic`);
    assert.strictEqual(a.validation.ok,true);
    assert.notStrictEqual(a.validation.performance,'REJECT');
    assert.strictEqual(Math.floor(a.maze.start/a.maze.cols),0);
    assert.strictEqual(Math.floor(a.maze.goal/a.maze.cols),a.maze.rows-1);
    assert.strictEqual(a.maze.id, `m-b-${nodeSha256(C.canonical(a.maze)).slice(0,12)}`);
    const bytes=Buffer.from(a.payload.text,'utf8');
    assert.strictEqual(a.payload.payloadBytes,bytes.length);
    assert.strictEqual(a.payload.checksum,nodeCrc32(bytes).toString(16).toUpperCase().padStart(8,'0'));
    assert.ok(a.payload.payloadBytes <= 16384);
    C.validateFull(JSON.parse(a.payload.text));
  }
}

const base=C.buildPreset('normal',42);
const changed=JSON.parse(base.payload.text); changed.cells = '0'+changed.cells.slice(1);
assert.throws(()=>C.validateFull(changed));
assert.throws(()=>C.build(6,13,1));
assert.throws(()=>C.build(11,13,1));
assert.throws(()=>C.build(8,15,-1));
assert.throws(()=>C.build(8,15,4294967296));

console.log('PASS generator-core tests');
