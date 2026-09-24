(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const bridge = window.AndroidGenerator;
  let scanning = false;
  let preparing = false;
  let state = { connected: false, busy: false, levels: null, message: '尚未连接手环' };
  const client = new window.MazeSync.Client({
    send: (token, id, text) => bridge.sendWear(token, id, text),
    disconnect: (token, reason) => bridge.disconnectWear(token, reason),
    changed: value => { state = value; render(); }
  });

  function render() {
    const supported = bridge && typeof bridge.scanDevices === 'function';
    const busy = scanning || preparing || state.busy;
    $('wearStatus').textContent = supported ? state.message : '请在 Android 应用中连接手环';
    $('scanWear').disabled = !supported || busy || state.connected;
    $('connectWear').disabled = !supported || busy || state.connected || !$('wearDevice').value;
    $('wearDevice').disabled = busy || state.connected;
    $('disconnectWear').disabled = !state.connected || state.busy;
    $('refreshLevels').disabled = !state.connected || busy;
    const available = state.connected && !busy && state.levels !== null;
    let validMaze = false;
    try { window.MazeSync.levelForSync(window.getCurrentMaze()); validMaze = true; } catch (_) {}
    $('addLevel').disabled = !available || !validMaze || state.levels.length >= 12;
    $('customLevelCount').textContent = '自定义关卡 ' + (state.levels === null ? '—' : state.levels.length) + ' / 12';
    const list = $('customLevelList');
    list.replaceChildren();
    if (state.levels === null || !state.levels.length) {
      const empty = document.createElement('p');
      empty.textContent = state.levels === null ? '尚未读取' : '暂无自定义关卡';
      list.appendChild(empty);
    }
    for (const item of state.levels || []) {
      const number = String(item.index + 1).padStart(2, '0');
      const card = document.createElement('div');
      card.className = 'custom-level';
      const title = document.createElement('strong');
      title.textContent = number;
      const name = document.createElement('p');
      name.textContent = item.name || item.id || '未命名关卡';
      const size = document.createElement('p');
      size.textContent = item.cols + ' × ' + item.rows;
      card.appendChild(title);
      card.appendChild(name);
      card.appendChild(size);
      const buttons = document.createElement('div');
      buttons.className = 'buttons';
      for (const kind of ['replace', 'remove']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = kind === 'replace' ? '替换' : '删除';
        button.disabled = !available || (kind === 'replace' && !validMaze);
        button.addEventListener('click', () => perform(() => {
          const prompt = kind === 'replace' ? '确定使用当前生成的关卡替换「自定义 ' + number + '」？' :
            '删除自定义 ' + number + '？\n删除后，后面的自定义关卡编号会自动前移。';
          if (window.confirm(prompt)) client.request(kind, item.index, window.getCurrentMaze());
        }));
        buttons.appendChild(button);
      }
      card.appendChild(buttons);
      list.appendChild(card);
    }
  }

  function perform(action) {
    try { action(); } catch (error) {
      scanning = false;
      preparing = false;
      state.message = error.message || String(error);
      render();
    }
  }

  $('scanWear').addEventListener('click', () => perform(() => {
    scanning = true;
    state.message = '正在查询小米运动健康中已连接的设备…';
    render();
    bridge.scanDevices();
  }));
  $('wearDevice').addEventListener('change', render);
  $('connectWear').addEventListener('click', () => perform(() => {
    preparing = true;
    state.levels = null;
    state.message = '正在准备连接…';
    render();
    bridge.connectWear($('wearDevice').value);
  }));
  $('disconnectWear').addEventListener('click', () => client.stop('已断开连接'));
  $('refreshLevels').addEventListener('click', () => perform(() => client.request('list')));
  $('addLevel').addEventListener('click', () => perform(() =>
    client.request('add', undefined, window.getCurrentMaze())));

  window.MazeSyncUI = {
    refresh: render,
    onNativeEvent(event) {
      if (event.type === 'devices') {
        scanning = false;
        $('wearDevice').replaceChildren();
        for (const node of event.nodes) {
          const option = document.createElement('option');
          option.value = node.id;
          option.textContent = (node.name || '穿戴设备') + ' · ' + node.id;
          $('wearDevice').appendChild(option);
        }
        state.message = event.message;
      } else if (event.type === 'status') {
        state.message = event.message;
      } else if (event.type === 'ready') {
        preparing = false;
        client.ready(event.token);
      } else if (event.type === 'message') {
        client.receive(event.token, event.text);
      } else if (event.type === 'sendError') {
        client.failed(event.token, event.id, event.message);
      } else if (event.type === 'disconnected') {
        if (client.token === event.token) {
          preparing = false;
          client.stop(event.message, false);
        } else if (client.token === null && !preparing) {
          state.message = event.message;
        }
        // 切换设备会先关闭旧通道；准备阶段的失败通过后续状态事件处理。
        if (preparing && event.message !== '正在切换连接') {
          preparing = false;
          client.stop(event.message, false);
        }
      } else if (event.type === 'unavailable') {
        scanning = false;
        preparing = false;
        client.stop(event.message);
      }
      render();
    }
  };
  render();
})();
