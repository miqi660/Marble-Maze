/**
 * 迷宫核心（生成器 generator-core.js 精简移植）
 * 只保留运行时需要的：mulberry32 / generateCells / decodeCells / compileRuns /
 * bfs / selectStartGoal / PRESETS / cellsToHex / crc32IsoHdlc（同步校验用）。
 * UMD 写法：Vela 打包器（module.exports）与 node 测试均可加载。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MazeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WALL_N = 1;
  var WALL_E = 2;
  var WALL_S = 4;
  var WALL_W = 8;

  // 方向顺序必须与生成器一致（N/E/S/W），否则同 seed 结果不同
  var DIRS = [
    [-1, 0, WALL_N, WALL_S],
    [0, 1, WALL_E, WALL_W],
    [1, 0, WALL_S, WALL_N],
    [0, -1, WALL_W, WALL_E]
  ];

  var PRESETS = {
    easy: { cols: 7, rows: 13 },
    normal: { cols: 8, rows: 15 },
    hard: { cols: 9, rows: 17 },
    expert: { cols: 10, rows: 19 }
  };

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** DFS 生成，返回 Uint8Array，每格 4 位墙标志 */
  function generateCells(cols, rows, seed) {
    var random = mulberry32(seed >>> 0);
    var cells = new Uint8Array(cols * rows);
    cells.fill(15);
    var seen = new Uint8Array(cells.length);
    var stack = [0];
    seen[0] = 1;

    while (stack.length) {
      var current = stack[stack.length - 1];
      var row = Math.floor(current / cols);
      var col = current % cols;
      var options = [];
      for (var i = 0; i < DIRS.length; i++) {
        var d = DIRS[i];
        var rr = row + d[0];
        var cc = col + d[1];
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
        var neighbor = rr * cols + cc;
        if (!seen[neighbor]) options.push([neighbor, d[2], d[3]]);
      }
      if (!options.length) {
        stack.pop();
        continue;
      }
      var picked = options[Math.floor(random() * options.length)];
      cells[current] &= ~picked[1];
      cells[picked[0]] &= ~picked[2];
      seen[picked[0]] = 1;
      stack.push(picked[0]);
    }
    return cells;
  }

  function getNeighbors(cells, cols, rows, cellIndex) {
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    var out = [];
    if (!(cells[cellIndex] & WALL_N) && row > 0) out.push(cellIndex - cols);
    if (!(cells[cellIndex] & WALL_E) && col + 1 < cols) out.push(cellIndex + 1);
    if (!(cells[cellIndex] & WALL_S) && row + 1 < rows) out.push(cellIndex + cols);
    if (!(cells[cellIndex] & WALL_W) && col > 0) out.push(cellIndex - 1);
    return out;
  }

  function bfs(cells, cols, rows, start) {
    var distance = new Int32Array(cells.length);
    var previous = new Int32Array(cells.length);
    distance.fill(-1);
    previous.fill(-1);
    var queue = new Int32Array(cells.length);
    var head = 0;
    var tail = 0;
    queue[tail++] = start;
    distance[start] = 0;
    while (head < tail) {
      var current = queue[head++];
      var nb = getNeighbors(cells, cols, rows, current);
      for (var i = 0; i < nb.length; i++) {
        var next = nb[i];
        if (distance[next] !== -1) continue;
        distance[next] = distance[current] + 1;
        previous[next] = current;
        queue[tail++] = next;
      }
    }
    return { distance: distance, previous: previous };
  }

  /** 顶行起点 × 底行终点，取最远对；平局取小 start/goal */
  function selectStartGoal(cells, cols, rows) {
    var best = null;
    for (var start = 0; start < cols; start++) {
      var r = bfs(cells, cols, rows, start);
      for (var goalCol = 0; goalCol < cols; goalCol++) {
        var goal = (rows - 1) * cols + goalCol;
        var dist = r.distance[goal];
        if (dist < 0) continue;
        if (
          !best ||
          dist > best.distance ||
          (dist === best.distance && (start < best.start || (start === best.start && goal < best.goal)))
        ) {
          best = { start: start, goal: goal, distance: dist };
        }
      }
    }
    return best;
  }

  function cellsToHex(cells) {
    var s = '';
    for (var i = 0; i < cells.length; i++) s += cells[i].toString(16).toUpperCase();
    return s;
  }

  function decodeCells(hex) {
    var out = new Uint8Array(hex.length);
    for (var i = 0; i < hex.length; i++) out[i] = parseInt(hex.charAt(i), 16);
    return out;
  }

  /** 合并墙段：h 三元组 (x,y,len) 逐行；v 三元组 (x,y,len) 逐列，单位 cell */
  function compileRuns(cells, cols, rows) {
    var h = [];
    var v = [];
    var x, y, startX, startY;

    function hWall(x, y) {
      if (y === 0) return !!(cells[x] & WALL_N);
      if (y === rows) return !!(cells[(rows - 1) * cols + x] & WALL_S);
      return !!(cells[y * cols + x] & WALL_N);
    }
    function vWall(x, y) {
      if (x === 0) return !!(cells[y * cols] & WALL_W);
      if (x === cols) return !!(cells[y * cols + cols - 1] & WALL_E);
      return !!(cells[y * cols + x] & WALL_W);
    }

    for (y = 0; y <= rows; y++) {
      x = 0;
      while (x < cols) {
        if (!hWall(x, y)) {
          x++;
          continue;
        }
        startX = x;
        x++;
        while (x < cols && hWall(x, y)) x++;
        h.push(startX, y, x - startX);
      }
    }
    for (x = 0; x <= cols; x++) {
      y = 0;
      while (y < rows) {
        if (!vWall(x, y)) {
          y++;
          continue;
        }
        startY = y;
        y++;
        while (y < rows && vWall(x, y)) y++;
        v.push(x, startY, y - startY);
      }
    }
    return { h: h, v: v };
  }

  /** CRC-32/ISO-HDLC（与生成器 payloadInfo 一致），bytes 为 Uint8Array/数组 */
  function crc32IsoHdlc(bytes) {
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (var bit = 0; bit < 8; bit++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** 字符串 → UTF-8 字节数组（Vela 无 TextEncoder 时的兜底） */
  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        c = 0x10000 + ((c - 0xd800) << 10) + (str.charCodeAt(++i) - 0xdc00);
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  /** 由 seed 生成一关完整定义（含 render） */
  function buildLevel(cols, rows, seed, difficulty) {
    var cells = generateCells(cols, rows, seed);
    var sg = selectStartGoal(cells, cols, rows);
    return {
      v: 1,
      profile: 'band',
      cols: cols,
      rows: rows,
      start: sg.start,
      goal: sg.goal,
      cells: cellsToHex(cells),
      seed: seed >>> 0,
      difficulty: difficulty || 'custom',
      pathLength: sg.distance,
      render: compileRuns(cells, cols, rows)
    };
  }

  return {
    WALL_N: WALL_N,
    WALL_E: WALL_E,
    WALL_S: WALL_S,
    WALL_W: WALL_W,
    PRESETS: PRESETS,
    mulberry32: mulberry32,
    generateCells: generateCells,
    bfs: bfs,
    selectStartGoal: selectStartGoal,
    cellsToHex: cellsToHex,
    decodeCells: decodeCells,
    compileRuns: compileRuns,
    crc32IsoHdlc: crc32IsoHdlc,
    utf8Bytes: utf8Bytes,
    buildLevel: buildLevel
  };
});
