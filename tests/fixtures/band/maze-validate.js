/**
 * 自定义关卡校验（纯函数，无平台依赖；maze-sync 与 node 测试共用）
 */
(function (root, factory) {
  var core = typeof require === 'function' ? require('./maze-core.js') : root.MazeCore;
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MazeValidate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (MazeCore) {
  'use strict';

  var LIMITS = { minCols: 7, maxCols: 11, minRows: 13, maxRows: 20, maxBytes: 1024 };

  /** 去掉 crc 字段后的精简体 JSON 文本（手机端计算 crc 的对象） */
  function stripCrc(level) {
    var out = {};
    for (var k in level) if (k !== 'crc' && k !== 'render') out[k] = level[k];
    return out;
  }

  /**
   * 校验存储精简体；prepare=false 只检查结构，不生成渲染数据。
   */
  function validateStoredLevel(level, prepare) {
    function fail(msg) {
      return { ok: false, message: msg, level: null };
    }
    if (!level || typeof level !== 'object') return fail('empty level');
    if (level.v !== 1) return fail('bad version');
    if (level.profile !== 'band') return fail('bad profile');
    var cols = level.cols;
    var rows = level.rows;
    if (typeof cols !== 'number' || cols % 1 !== 0 || cols < LIMITS.minCols || cols > LIMITS.maxCols) return fail('bad cols');
    if (typeof rows !== 'number' || rows % 1 !== 0 || rows < LIMITS.minRows || rows > LIMITS.maxRows) return fail('bad rows');
    var cells = level.cells;
    if (typeof cells !== 'string' || cells.length !== cols * rows) return fail('bad cells length');
    if (!/^[0-9A-F]+$/.test(cells)) return fail('bad cells hex');
    var start = level.start;
    var goal = level.goal;
    if (typeof start !== 'number' || start % 1 !== 0 || start < 0 || start >= cols) return fail('bad start');
    if (typeof goal !== 'number' || goal % 1 !== 0 || goal < (rows - 1) * cols || goal >= rows * cols) return fail('bad goal');

    var slim = stripCrc(level);
    var text = JSON.stringify(slim);
    var bytes = MazeCore.utf8Bytes(text);
    if (bytes.length > LIMITS.maxBytes) return fail('payload too large');

    return { ok: true, message: '', level: prepare === false ? null : prepareLevel(slim), slim: slim, payloadBytes: bytes.length };
  }

  /** 仅用于已经通过结构校验的精简体；每个缓存版本至多生成一次。 */
  function prepareLevel(slim) {
    var decoded = MazeCore.decodeCells(slim.cells);
    var full = {};
    for (var k in slim) full[k] = slim[k];
    full.render = MazeCore.compileRuns(decoded, slim.cols, slim.rows);
    return full;
  }

  /** 同步输入额外验证传输 CRC；本地精简体没有 CRC。 */
  function validateLevel(level, prepare) {
    var result = validateStoredLevel(level, false);
    if (!result.ok) return result;
    if (typeof level.crc !== 'string' || !/^[0-9a-fA-F]{8}$/.test(level.crc)) {
      return { ok: false, message: 'bad crc format', level: null };
    }
    if (computeCrc(result.slim) !== level.crc.toUpperCase()) {
      return { ok: false, message: 'crc mismatch', level: null };
    }
    if (prepare !== false) result.level = prepareLevel(result.slim);
    return result;
  }

  /** 计算精简体 crc（8 位大写 hex），供测试/手机端对照 */
  function computeCrc(slim) {
    var crc = MazeCore.crc32IsoHdlc(MazeCore.utf8Bytes(JSON.stringify(slim))).toString(16).toUpperCase();
    while (crc.length < 8) crc = '0' + crc;
    return crc;
  }

  return { LIMITS: LIMITS, stripCrc: stripCrc, validateLevel: validateLevel, validateStoredLevel: validateStoredLevel, prepareLevel: prepareLevel, computeCrc: computeCrc };
});
