(function () {
  'use strict';
  const core = window.MazeGeneratorCore;
  const bridge = window.AndroidGenerator;
  let current = null;
  let editor = { profile: 'band', cols: 8, rows: 15, preset: 'normal', seed: 38291627, generating: false };
  let device = { connected: false, busy: false, levels: null, nodes: [], message: '', scanning: false, preparing: false, unknown: false };
  const publish = () => bridge.publish(JSON.stringify({ editor, device }));
  const client = new window.MazeSync.Client({
    send: (token, id, text) => bridge.sendWear(token, id, text),
    disconnect: (token, reason) => bridge.disconnectWear(token, reason),
    changed: state => {
      const uncertain = /未知|不一致|核对/.test(state.message);
      device = Object.assign({}, device, state, { unknown: device.unknown || uncertain });
      // 只有重新建立连接并成功读取列表，才能解除结果未知锁定。
      if (state.connected && !state.busy && state.levels !== null) device.unknown = false;
      const pending = client.pending;
      const kind = pending && (pending.confirmation ? pending.confirmation.kind : pending.kind);
      device.operationKind = device.preparing || kind === 'handshake' ? 'connecting' :
        ({ list: 'refreshing', add: 'adding', replace: 'replacing', remove: 'removing' }[kind] || (state.busy ? 'syncing' : 'idle'));
      publish();
    }
  });
  const presetFor = (cols, rows, profile) => Object.keys(core.PROFILES[profile].presets).find(key =>
    core.PROFILES[profile].presets[key][0] === cols && core.PROFILES[profile].presets[key][1] === rows) || 'custom';
  function accept(maze, validation, seed, imported) {
    const payload = window.MazeSync.levelForSync(maze);
    current = maze;
    const slim = Object.assign({}, payload);
    delete slim.crc;
    editor = { profile: maze.profile, cols: maze.cols, rows: maze.rows, preset: presetFor(maze.cols, maze.rows, maze.profile), seed,
      maze, path: validation.path, shortestPath: validation.shortestPath,
      runs: validation.renderRunCount, bytes: new TextEncoder().encode(JSON.stringify(slim)).length,
      crc: payload.crc, generating: false, imported, error: null, detail: null };
    publish();
    editor.imported = false;
  }
  function generate(cols, rows, seed, profile = 'band', imported = false) {
    editor = Object.assign({}, editor, { generating: true, error: null, detail: null, imported: false });
    publish();
    const result = core.build(cols, rows, seed, presetFor(cols, rows, profile), profile);
    accept(result.maze, result.validation, seed, imported);
  }
  function editorError(error) {
    const detail = error.code || error.message || String(error);
    const messages = { IMPORT_SPEC_FORMAT: '请输入 列数x行数@Seed 格式的关卡参数。', COLS_RANGE: '列数超出当前 Profile 范围。', ROWS_RANGE: '行数超出当前 Profile 范围。',
      SEED_RANGE: 'Seed 超出可用范围，请重新输入。', SEED_INTEGER: '请输入完整的数字 Seed。', ASPECT_RATIO: '当前行列比例不适合迷宫，请调整尺寸。' };
    editor = Object.assign({}, editor, { generating: false, error: messages[detail] || '关卡数据不完整或不合法，请检查后重试。', detail });
    publish();
  }
  window.NativeRuntime = {
    command(command) {
      const { action } = command;
      try {
        if (action === 'resume') { device.unknown = !!command.unknown; }
        else if (action === 'generate') generate(command.cols, command.rows, command.seed, command.profile);
        else if (action === 'import') {
          editor.imported = false;
          const spec = core.parseSpec(command.text, command.profile || editor.profile);
          generate(spec.cols, spec.rows, spec.seed, spec.profile, true);
        } else if (action === 'scan') {
          if (device.busy || device.preparing || device.scanning) return;
          device.scanning = true; device.nodes = []; device.message = '正在查询设备…'; publish(); bridge.scanDevices();
        } else if (action === 'connect') {
          if (device.busy || device.preparing || device.scanning) return;
          device.preparing = true; device.operationKind = 'connecting'; device.levels = null; device.name = command.name;
          device.message = '正在连接设备…'; publish(); bridge.connectWear(command.id);
        } else if (action === 'disconnect') {
          if (!device.busy) client.stop('已断开连接');
        } else if (['list', 'add', 'replace', 'remove'].includes(action)) {
          if (device.unknown && action !== 'list') return;
          client.request(action, command.index, current);
        }
      } catch (error) {
        if (action === 'generate' || action === 'import') editorError(error);
        else { device.scanning = false; device.preparing = false; device.message = error.message || String(error); publish(); }
      }
    },
    onNativeEvent(event) {
      if (event.type === 'devices') {
        device.scanning = false; device.nodes = event.nodes; device.message = event.message;
      } else if (event.type === 'status') {
        device.message = event.message.includes('授权') ? '正在检查授权…' : '正在建立通信…';
      } else if (event.type === 'ready') {
        device.preparing = false; device.name = event.name; client.ready(event.token);
      } else if (event.type === 'message') client.receive(event.token, event.text);
      else if (event.type === 'sendError') client.failed(event.token, event.id, event.message);
      else if (event.type === 'disconnected') {
        if (event.token === client.token && client.pending && (client.pending.kind !== 'handshake' && client.pending.kind !== 'list' || client.pending.confirmation)) device.unknown = true;
        if (client.token === event.token) { device.preparing = false; client.stop(event.message, false); }
        else if (client.token === null && !device.preparing) device.message = event.message;
        if (device.preparing && event.message !== '正在切换连接') { device.preparing = false; client.stop(event.message, false); }
      } else if (event.type === 'unavailable') {
        if (client.pending && (['add', 'replace', 'remove'].includes(client.pending.kind) || client.pending.confirmation)) device.unknown = true;
        device.scanning = false; device.preparing = false; client.stop(event.message);
      }
      publish();
    }
  };
})();
