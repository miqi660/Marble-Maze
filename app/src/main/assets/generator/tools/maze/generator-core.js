(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MazeGeneratorCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WALL_N = 1;
  const WALL_E = 2;
  const WALL_S = 4;
  const WALL_W = 8;

  const DIRS = [
    [-1, 0, WALL_N, WALL_S],
    [0, 1, WALL_E, WALL_W],
    [1, 0, WALL_S, WALL_N],
    [0, -1, WALL_W, WALL_E]
  ];

  const GENERATOR_VERSION = 1;
  const PROFILE = 'band';
  const ALGORITHM = 'dfs';

  const BAND_MAZE_LIMITS = Object.freeze({
    minCols: 7,
    maxCols: 11,
    minRows: 13,
    maxRows: 20,
    maxCells: 220,
    maxRenderRuns: 256,
    minAspectRatio: 0.50,
    maxAspectRatio: 0.57
  });

  const PERFORMANCE_BUDGET = Object.freeze({
    recommendedCells: 190,
    maxCells: 220,
    recommendedRenderRuns: 200,
    maxRenderRuns: 256
  });

  const PRESETS = Object.freeze({
    easy: Object.freeze([7, 13]),
    normal: Object.freeze([8, 15]),
    hard: Object.freeze([9, 17]),
    expert: Object.freeze([10, 19])
  });

  function assert(condition, code) {
    if (!condition) {
      const error = new Error(code);
      error.code = code;
      throw error;
    }
  }

  function isPlainJsonObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.values(descriptors).every((d) => !d.get && !d.set && 'value' in d);
  }

  function strictKeys(obj, keys, code) {
    assert(isPlainJsonObject(obj), code || 'NOT_PLAIN_OBJECT');
    const got = Object.keys(obj).sort().join(',');
    const expected = [...keys].sort().join(',');
    assert(got === expected, code || 'STRICT_FIELDS');
  }

  function validateSeed(seed) {
    assert(Number.isInteger(seed), 'SEED_INTEGER');
    assert(seed >= 0 && seed <= 0xFFFFFFFF, 'SEED_RANGE');
    return seed >>> 0;
  }

  function validateSpec(cols, rows) {
    const L = BAND_MAZE_LIMITS;
    assert(Number.isInteger(cols) && Number.isInteger(rows), 'SIZE_INTEGER');
    assert(cols >= L.minCols && cols <= L.maxCols, 'COLS_RANGE');
    assert(rows >= L.minRows && rows <= L.maxRows, 'ROWS_RANGE');
    assert(cols * rows <= L.maxCells, 'MAX_CELLS');
    const ratio = cols / rows;
    assert(ratio >= L.minAspectRatio && ratio <= L.maxAspectRatio, 'ASPECT_RATIO');
  }

  function validateGenerationSpec(spec) {
    strictKeys(spec, ['generatorVersion', 'profile', 'cols', 'rows', 'algorithm', 'difficulty', 'seed'], 'GENERATION_SPEC_FIELDS');
    assert(spec.generatorVersion === GENERATOR_VERSION, 'GENERATOR_VERSION');
    assert(spec.profile === PROFILE, 'PROFILE_NOT_ENABLED');
    assert(spec.algorithm === ALGORITHM, 'ALGORITHM_NOT_SUPPORTED');
    assert(typeof spec.difficulty === 'string' && spec.difficulty.length > 0 && spec.difficulty.length <= 32, 'DIFFICULTY_LABEL');
    validateSpec(spec.cols, spec.rows);
    validateSeed(spec.seed);
    return true;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function indexOf(row, col, cols) {
    return row * cols + col;
  }

  function generateCells(cols, rows, seed) {
    validateSpec(cols, rows);
    seed = validateSeed(seed);
    const random = mulberry32(seed);
    const cells = new Uint8Array(cols * rows);
    cells.fill(15);

    const seen = new Uint8Array(cells.length);
    const stack = [0];
    seen[0] = 1;

    while (stack.length) {
      const current = stack[stack.length - 1];
      const row = Math.floor(current / cols);
      const col = current % cols;
      const options = [];

      for (const [dr, dc, bit, opposite] of DIRS) {
        const rr = row + dr;
        const cc = col + dc;
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
        const neighbor = indexOf(rr, cc, cols);
        if (!seen[neighbor]) options.push([neighbor, bit, opposite]);
      }

      if (!options.length) {
        stack.pop();
        continue;
      }

      const picked = options[Math.floor(random() * options.length)];
      const [neighbor, bit, opposite] = picked;
      cells[current] &= ~bit;
      cells[neighbor] &= ~opposite;
      seen[neighbor] = 1;
      stack.push(neighbor);
    }

    return cells;
  }

  function getNeighbors(cells, cols, rows, cellIndex) {
    const row = Math.floor(cellIndex / cols);
    const col = cellIndex % cols;
    const out = [];
    if (!(cells[cellIndex] & WALL_N) && row > 0) out.push(cellIndex - cols);
    if (!(cells[cellIndex] & WALL_E) && col + 1 < cols) out.push(cellIndex + 1);
    if (!(cells[cellIndex] & WALL_S) && row + 1 < rows) out.push(cellIndex + cols);
    if (!(cells[cellIndex] & WALL_W) && col > 0) out.push(cellIndex - 1);
    return out;
  }

  function bfs(cells, cols, rows, start) {
    const distance = new Int32Array(cells.length);
    const previous = new Int32Array(cells.length);
    distance.fill(-1);
    previous.fill(-1);

    const queue = new Int32Array(cells.length);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    distance[start] = 0;

    while (head < tail) {
      const current = queue[head++];
      for (const next of getNeighbors(cells, cols, rows, current)) {
        if (distance[next] !== -1) continue;
        distance[next] = distance[current] + 1;
        previous[next] = current;
        queue[tail++] = next;
      }
    }

    return { distance, previous };
  }

  function reconstructPath(previous, start, goal) {
    const path = [];
    let current = goal;
    while (current !== -1) {
      path.push(current);
      if (current === start) break;
      current = previous[current];
    }
    path.reverse();
    assert(path.length > 0 && path[0] === start && path[path.length - 1] === goal, 'PATH_RECONSTRUCT');
    return path;
  }

  function selectStartGoal(cells, cols, rows) {
    let best = null;
    for (let start = 0; start < cols; start++) {
      const { distance, previous } = bfs(cells, cols, rows, start);
      for (let goalCol = 0; goalCol < cols; goalCol++) {
        const goal = (rows - 1) * cols + goalCol;
        const dist = distance[goal];
        if (dist < 0) continue;
        if (
          !best ||
          dist > best.distance ||
          (dist === best.distance && (start < best.start || (start === best.start && goal < best.goal)))
        ) {
          best = { start, goal, distance: dist, previous };
        }
      }
    }
    assert(best, 'NO_START_GOAL');
    best.path = reconstructPath(best.previous, best.start, best.goal);
    return best;
  }

  function cellsToHex(cells) {
    return Array.from(cells, (value) => value.toString(16).toUpperCase()).join('');
  }

  function decodeCells(hex) {
    assert(typeof hex === 'string' && /^[0-9A-F]+$/.test(hex), 'BAD_CELLS');
    return Uint8Array.from(hex, (ch) => parseInt(ch, 16));
  }

  function compileRuns(cells, cols, rows) {
    const h = [];
    const v = [];

    for (let y = 0; y <= rows; y++) {
      let x = 0;
      while (x < cols) {
        let hasWall;
        if (y === 0) hasWall = !!(cells[x] & WALL_N);
        else if (y === rows) hasWall = !!(cells[(rows - 1) * cols + x] & WALL_S);
        else hasWall = !!(cells[y * cols + x] & WALL_N);

        if (!hasWall) {
          x++;
          continue;
        }

        const startX = x;
        x++;
        while (x < cols) {
          let nextWall;
          if (y === 0) nextWall = !!(cells[x] & WALL_N);
          else if (y === rows) nextWall = !!(cells[(rows - 1) * cols + x] & WALL_S);
          else nextWall = !!(cells[y * cols + x] & WALL_N);
          if (!nextWall) break;
          x++;
        }
        h.push(startX, y, x - startX);
      }
    }

    for (let x = 0; x <= cols; x++) {
      let y = 0;
      while (y < rows) {
        let hasWall;
        if (x === 0) hasWall = !!(cells[y * cols] & WALL_W);
        else if (x === cols) hasWall = !!(cells[y * cols + cols - 1] & WALL_E);
        else hasWall = !!(cells[y * cols + x] & WALL_W);

        if (!hasWall) {
          y++;
          continue;
        }

        const startY = y;
        y++;
        while (y < rows) {
          let nextWall;
          if (x === 0) nextWall = !!(cells[y * cols] & WALL_W);
          else if (x === cols) nextWall = !!(cells[y * cols + cols - 1] & WALL_E);
          else nextWall = !!(cells[y * cols + x] & WALL_W);
          if (!nextWall) break;
          y++;
        }
        v.push(x, startY, y - startY);
      }
    }

    return { h, v };
  }

  function canonicalPayload(maze) {
    return `${maze.v}|${maze.profile}|${maze.cols}|${maze.rows}|${maze.start}|${maze.goal}|${maze.cells}`;
  }

  function sha256Hex(text) {
    function rotr(n, x) {
      return (x >>> n) | (x << (32 - n));
    }

    const K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];

    const bytes = Array.from(new TextEncoder().encode(text));
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);

    const hi = Math.floor(bitLength / 0x100000000);
    const lo = bitLength >>> 0;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
    bytes.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

    let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

    for (let offset = 0; offset < bytes.length; offset += 64) {
      const w = new Uint32Array(64);
      for (let i = 0; i < 16; i++) {
        const p = offset + i * 4;
        w[i] = ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
      }
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15];
        const b = w[i - 2];
        const s0 = rotr(7, a) ^ rotr(18, a) ^ (a >>> 3);
        const s1 = rotr(17, b) ^ rotr(19, b) ^ (b >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }

      let [a,b,c,d,e,f,g,h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }

      const next = [a,b,c,d,e,f,g,h];
      H = H.map((value, i) => (value + next[i]) >>> 0);
    }

    return H.map((value) => value.toString(16).padStart(8, '0')).join('');
  }

  function mazeId(maze) {
    return `m-b-${sha256Hex(canonicalPayload(maze)).slice(0, 12)}`;
  }

  function crc32IsoHdlc(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function performanceGate(cellCount, renderRunCount) {
    if (cellCount > PERFORMANCE_BUDGET.maxCells || renderRunCount > PERFORMANCE_BUDGET.maxRenderRuns) return 'REJECT';
    if (cellCount <= PERFORMANCE_BUDGET.recommendedCells && renderRunCount <= PERFORMANCE_BUDGET.recommendedRenderRuns) return 'GREEN';
    return 'YELLOW';
  }

  function analyzeQuality(cells, cols, rows, start, goal) {
    const { distance, previous } = bfs(cells, cols, rows, start);
    assert(distance[goal] >= 0, 'REACHABILITY');
    const path = reconstructPath(previous, start, goal);

    let turns = 0;
    let previousDirection = null;
    for (let i = 1; i < path.length; i++) {
      const delta = path[i] - path[i - 1];
      const direction = delta === 1 ? 'E' : delta === -1 ? 'W' : delta === cols ? 'S' : 'N';
      if (previousDirection !== null && direction !== previousDirection) turns++;
      previousDirection = direction;
    }

    let deadEnds = 0;
    let branches = 0;
    let maxDegree = 0;
    for (let i = 0; i < cells.length; i++) {
      const degree = getNeighbors(cells, cols, rows, i).length;
      if (degree === 1) deadEnds++;
      if (degree >= 3) branches++;
      if (degree > maxDegree) maxDegree = degree;
    }

    return {
      shortestPath: distance[goal],
      turns,
      deadEnds,
      branches,
      maxDegree,
      path
    };
  }

  function validateRenderTriplets(render, cols, rows) {
    assert(Array.isArray(render.h) && Array.isArray(render.v), 'RENDER_ARRAY');
    assert(render.h.length % 3 === 0 && render.v.length % 3 === 0, 'RENDER_SHAPE');

    const runCount = render.h.length / 3 + render.v.length / 3;
    assert(runCount <= BAND_MAZE_LIMITS.maxRenderRuns, 'RENDER_RUNS');

    for (let i = 0; i < render.h.length; i += 3) {
      const x = render.h[i], y = render.h[i + 1], length = render.h[i + 2];
      assert(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(length), 'RENDER_INTEGER');
      assert(length >= 1, 'RENDER_LENGTH');
      assert(x >= 0 && y >= 0 && x + length <= cols && y <= rows, 'RENDER_H_BOUNDS');
    }

    for (let i = 0; i < render.v.length; i += 3) {
      const x = render.v[i], y = render.v[i + 1], length = render.v[i + 2];
      assert(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(length), 'RENDER_INTEGER');
      assert(length >= 1, 'RENDER_LENGTH');
      assert(x >= 0 && y >= 0 && x <= cols && y + length <= rows, 'RENDER_V_BOUNDS');
    }

    return runCount;
  }

  function validateFull(maze) {
    strictKeys(maze, ['v', 'id', 'profile', 'cols', 'rows', 'start', 'goal', 'cells', 'render'], 'MAZE_FIELDS');
    strictKeys(maze.render, ['h', 'v'], 'RENDER_FIELDS');

    assert(maze.v === 1, 'VERSION');
    assert(maze.profile === 'band', 'PROFILE_NOT_ENABLED');
    validateSpec(maze.cols, maze.rows);

    const cellCount = maze.cols * maze.rows;
    assert(typeof maze.cells === 'string' && maze.cells.length === cellCount && /^[0-9A-F]+$/.test(maze.cells), 'CELLS');
    assert(Number.isInteger(maze.start) && Number.isInteger(maze.goal), 'START_GOAL_INTEGER');
    assert(maze.start >= 0 && maze.start < cellCount && maze.goal >= 0 && maze.goal < cellCount && maze.start !== maze.goal, 'START_GOAL');
    assert(Math.floor(maze.start / maze.cols) === 0, 'START_ROW');
    assert(Math.floor(maze.goal / maze.cols) === maze.rows - 1, 'GOAL_ROW');

    assert(/^m-b-[0-9a-f]{12}$/.test(maze.id), 'ID_FORMAT');
    assert(maze.id === mazeId(maze), 'ID_HASH_MISMATCH');

    const renderRunCount = validateRenderTriplets(maze.render, maze.cols, maze.rows);
    const cells = decodeCells(maze.cells);
    let openingEdges = 0;

    for (let row = 0; row < maze.rows; row++) {
      for (let col = 0; col < maze.cols; col++) {
        const i = indexOf(row, col, maze.cols);
        const value = cells[i];

        if (row === 0) assert(value & WALL_N, 'PERIMETER');
        if (row === maze.rows - 1) assert(value & WALL_S, 'PERIMETER');
        if (col === 0) assert(value & WALL_W, 'PERIMETER');
        if (col === maze.cols - 1) assert(value & WALL_E, 'PERIMETER');

        if (col + 1 < maze.cols) {
          assert(!!(value & WALL_E) === !!(cells[i + 1] & WALL_W), 'WALL_SYMMETRY');
          if (!(value & WALL_E)) openingEdges++;
        }
        if (row + 1 < maze.rows) {
          assert(!!(value & WALL_S) === !!(cells[i + maze.cols] & WALL_N), 'WALL_SYMMETRY');
          if (!(value & WALL_S)) openingEdges++;
        }
      }
    }

    const { distance } = bfs(cells, maze.cols, maze.rows, maze.start);
    assert(Array.from(distance).every((value) => value >= 0), 'CONNECTIVITY');
    assert(openingEdges === cellCount - 1, 'PERFECT_MAZE');
    assert(distance[maze.goal] >= 0, 'REACHABILITY');

    const compiled = compileRuns(cells, maze.cols, maze.rows);
    assert(JSON.stringify(compiled) === JSON.stringify(maze.render), 'RENDER_TOPOLOGY');

    const quality = analyzeQuality(cells, maze.cols, maze.rows, maze.start, maze.goal);
    const performance = performanceGate(cellCount, renderRunCount);
    assert(performance !== 'REJECT', 'PERFORMANCE_REJECT');

    return {
      ok: true,
      cellCount,
      renderRunCount,
      performance,
      pathLength: quality.shortestPath,
      shortestPath: quality.shortestPath,
      turns: quality.turns,
      deadEnds: quality.deadEnds,
      branches: quality.branches,
      maxDegree: quality.maxDegree,
      path: quality.path
    };
  }

  function normalizeMazeDefinition(maze) {
    return {
      v: maze.v,
      id: maze.id,
      profile: maze.profile,
      cols: maze.cols,
      rows: maze.rows,
      start: maze.start,
      goal: maze.goal,
      cells: maze.cells,
      render: {
        h: maze.render.h.slice(),
        v: maze.render.v.slice()
      }
    };
  }

  function exactPayload(maze) {
    const normalized = normalizeMazeDefinition(maze);
    return JSON.stringify(normalized);
  }

  function payloadInfo(maze) {
    const text = exactPayload(maze);
    const bytes = new TextEncoder().encode(text);
    const crc = crc32IsoHdlc(bytes).toString(16).toUpperCase().padStart(8, '0');
    return {
      text,
      payloadBytes: bytes.length,
      checksum: crc,
      checksumAlgorithm: 'crc32-iso-hdlc',
      withinSyncPayloadLimit: bytes.length <= 16384
    };
  }

  function buildFromSpec(spec) {
    validateGenerationSpec(spec);
    const startTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const cells = generateCells(spec.cols, spec.rows, spec.seed);
    const startGoal = selectStartGoal(cells, spec.cols, spec.rows);

    const maze = {
      v: 1,
      id: '',
      profile: 'band',
      cols: spec.cols,
      rows: spec.rows,
      start: startGoal.start,
      goal: startGoal.goal,
      cells: cellsToHex(cells),
      render: compileRuns(cells, spec.cols, spec.rows)
    };
    maze.id = mazeId(maze);

    const validation = validateFull(maze);
    const endTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const payload = payloadInfo(maze);

    const report = {
      generatorVersion: GENERATOR_VERSION,
      profile: PROFILE,
      algorithm: ALGORITHM,
      difficulty: spec.difficulty,
      seed: spec.seed >>> 0,
      cols: spec.cols,
      rows: spec.rows,
      aspectRatio: spec.cols / spec.rows,
      cellCount: validation.cellCount,
      renderRunCount: validation.renderRunCount,
      performance: validation.performance,
      shortestPath: validation.shortestPath,
      turns: validation.turns,
      deadEnds: validation.deadEnds,
      branches: validation.branches,
      generationTimeMs: Math.max(0, endTime - startTime),
      payloadBytes: payload.payloadBytes,
      syncChecksum: payload.checksum,
      syncPayloadWithin16KiB: payload.withinSyncPayloadLimit
    };

    return { maze, validation, report, payload };
  }

  function build(cols, rows, seed, difficulty) {
    return buildFromSpec({
      generatorVersion: GENERATOR_VERSION,
      profile: PROFILE,
      cols,
      rows,
      algorithm: ALGORITHM,
      difficulty: difficulty || 'custom',
      seed: validateSeed(seed)
    });
  }

  function buildPreset(name, seed) {
    assert(Object.prototype.hasOwnProperty.call(PRESETS, name), 'PRESET');
    const [cols, rows] = PRESETS[name];
    return build(cols, rows, seed, name);
  }

  return Object.freeze({
    GENERATOR_VERSION,
    PROFILE,
    ALGORITHM,
    WALL_N,
    WALL_E,
    WALL_S,
    WALL_W,
    BAND_MAZE_LIMITS,
    PERFORMANCE_BUDGET,
    PRESETS,
    validateSeed,
    validateSpec,
    validateGenerationSpec,
    generateCells,
    decodeCells,
    getNeighbors,
    bfs,
    selectStartGoal,
    compileRuns,
    canonical: canonicalPayload,
    canonicalPayload,
    sha256hex: sha256Hex,
    sha256Hex,
    mazeId,
    crc32IsoHdlc,
    analyzeQuality,
    performanceGate,
    validateFull,
    normalizeMazeDefinition,
    exactPayload,
    payloadInfo,
    build,
    buildFromSpec,
    buildPreset
  });
});
