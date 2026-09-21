/**
 * 物理与碰撞（纯函数，cell 单位；node 下可直接 require 测试）
 * 坐标：左上 (0,0)，+x 右，+y 下，1.0 = 一格。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MazePhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WALL_N = 1;
  var WALL_E = 2;
  var WALL_S = 4;
  var WALL_W = 8;

  var CONST = {
    R: 0.28, // 球半径（cell）
    DT: 1 / 50, // 固定步长
    G: 40, // cell/s²
    DAMPING: 0.985,
    MAX_SPEED: 12,
    RESTITUTION: 0.2, // 法向速度 × -0.2
    GOAL_DIST: 0.35,
    SUB_STEP: 0.14 // 每子步最大位移 = R/2
  };

  // 传感器轴向映射，真机实测后校正
  var AXIS_SIGN = { x: -1, y: 1 };

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** 传感器原始值归一化到 ±1 */
  function normalizeTilt(raw) {
    return clamp(raw / 9.8, -1, 1);
  }

  /** 创建球状态：位于 start 格中心，速度为零 */
  function createState(level) {
    var cols = level.cols;
    return {
      x: (level.start % cols) + 0.5,
      y: Math.floor(level.start / cols) + 0.5,
      vx: 0,
      vy: 0
    };
  }

  /**
   * 收集球所在格及 8 邻域的墙段（每段 [x1,y1,x2,y2]）
   * cells 为 Uint8Array（decodeCells 结果）
   */
  function collectSegments(cells, cols, rows, x, y) {
    var cx = clamp(Math.floor(x), 0, cols - 1);
    var cy = clamp(Math.floor(y), 0, rows - 1);
    var segs = [];
    for (var r = cy - 1; r <= cy + 1; r++) {
      if (r < 0 || r >= rows) continue;
      for (var c = cx - 1; c <= cx + 1; c++) {
        if (c < 0 || c >= cols) continue;
        var w = cells[r * cols + c];
        if (w & WALL_N) segs.push([c, r, c + 1, r]);
        if (w & WALL_E) segs.push([c + 1, r, c + 1, r + 1]);
        if (w & WALL_S) segs.push([c, r + 1, c + 1, r + 1]);
        if (w & WALL_W) segs.push([c, r, c, r + 1]);
      }
    }
    return segs;
  }

  /** 圆-线段最近点碰撞，原地修正 state；返回是否发生碰撞 */
  function resolveSegment(state, seg, R) {
    var ax = seg[0];
    var ay = seg[1];
    var bx = seg[2];
    var by = seg[3];
    var dx = bx - ax;
    var dy = by - ay;
    var len2 = dx * dx + dy * dy;
    var t = ((state.x - ax) * dx + (state.y - ay) * dy) / len2;
    t = clamp(t, 0, 1);
    var px = ax + dx * t;
    var py = ay + dy * t;
    var nx = state.x - px;
    var ny = state.y - py;
    var dist = Math.sqrt(nx * nx + ny * ny);
    if (dist >= R) return false;

    if (dist < 1e-6) {
      // 球心正好在线段上：取线段法线，方向按速度反向
      nx = -dy;
      ny = dx;
      var nl = Math.sqrt(nx * nx + ny * ny);
      nx /= nl;
      ny /= nl;
      if (nx * state.vx + ny * state.vy > 0) {
        nx = -nx;
        ny = -ny;
      }
    } else {
      nx /= dist;
      ny /= dist;
    }
    var push = R - dist + 1e-4;
    state.x += nx * push;
    state.y += ny * push;
    var vn = state.vx * nx + state.vy * ny;
    if (vn < 0) {
      state.vx -= vn * nx * (1 + CONST.RESTITUTION);
      state.vy -= vn * ny * (1 + CONST.RESTITUTION);
    }
    return true;
  }

  /** 角点作为额外圆碰撞（线段端点），补足端点处的推出 */
  function resolveCorner(state, cx, cy, R) {
    var nx = state.x - cx;
    var ny = state.y - cy;
    var dist = Math.sqrt(nx * nx + ny * ny);
    if (dist >= R || dist < 1e-6) return false;
    nx /= dist;
    ny /= dist;
    var push = R - dist + 1e-4;
    state.x += nx * push;
    state.y += ny * push;
    var vn = state.vx * nx + state.vy * ny;
    if (vn < 0) {
      state.vx -= vn * nx * (1 + CONST.RESTITUTION);
      state.vy -= vn * ny * (1 + CONST.RESTITUTION);
    }
    return true;
  }

  function resolveCollisions(state, cells, cols, rows) {
    var R = CONST.R;
    for (var pass = 0; pass < 4; pass++) {
      var segs = collectSegments(cells, cols, rows, state.x, state.y);
      var hit = false;
      for (var i = 0; i < segs.length; i++) {
        if (resolveSegment(state, segs[i], R)) hit = true;
      }
      for (var j = 0; j < segs.length; j++) {
        var s = segs[j];
        if (resolveCorner(state, s[0], s[1], R)) hit = true;
        if (resolveCorner(state, s[2], s[3], R)) hit = true;
      }
      if (!hit) break;
    }
    // 兜底：始终保持在迷宫外框内
    state.x = clamp(state.x, R, cols - R);
    state.y = clamp(state.y, R, rows - R);
  }

  /**
   * 推进一帧。tiltX/tiltY 为已归一化 (±1) 且已应用 AXIS_SIGN 的倾斜值
   * cells：Uint8Array
   */
  function step(state, cells, cols, rows, tiltX, tiltY, dt) {
    dt = dt || CONST.DT;
    state.vx += CONST.G * tiltX * dt;
    state.vy += CONST.G * tiltY * dt;
    state.vx *= CONST.DAMPING;
    state.vy *= CONST.DAMPING;
    var speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy);
    if (speed > CONST.MAX_SPEED) {
      var k = CONST.MAX_SPEED / speed;
      state.vx *= k;
      state.vy *= k;
      speed = CONST.MAX_SPEED;
    }
    var disp = speed * dt;
    var n = Math.max(1, Math.ceil(disp / CONST.SUB_STEP));
    var sdt = dt / n;
    for (var i = 0; i < n; i++) {
      state.x += state.vx * sdt;
      state.y += state.vy * sdt;
      resolveCollisions(state, cells, cols, rows);
    }
    return state;
  }

  /** 球心与 goal 格中心距离 < GOAL_DIST */
  function reachedGoal(state, level) {
    var gx = (level.goal % level.cols) + 0.5;
    var gy = Math.floor(level.goal / level.cols) + 0.5;
    var dx = state.x - gx;
    var dy = state.y - gy;
    return dx * dx + dy * dy < CONST.GOAL_DIST * CONST.GOAL_DIST;
  }

  /** 球心到最近墙段的距离（测试用） */
  function minWallDistance(state, cells, cols, rows) {
    var segs = collectSegments(cells, cols, rows, state.x, state.y);
    var best = Infinity;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var dx = s[2] - s[0];
      var dy = s[3] - s[1];
      var t = clamp(((state.x - s[0]) * dx + (state.y - s[1]) * dy) / (dx * dx + dy * dy), 0, 1);
      var px = s[0] + dx * t;
      var py = s[1] + dy * t;
      var d = Math.sqrt((state.x - px) * (state.x - px) + (state.y - py) * (state.y - py));
      if (d < best) best = d;
    }
    return best;
  }

  return {
    CONST: CONST,
    AXIS_SIGN: AXIS_SIGN,
    clamp: clamp,
    normalizeTilt: normalizeTilt,
    createState: createState,
    collectSegments: collectSegments,
    step: step,
    reachedGoal: reachedGoal,
    minWallDistance: minWallDistance
  };
});
