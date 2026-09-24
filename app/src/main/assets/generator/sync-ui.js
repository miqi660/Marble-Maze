(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const bridge = window.AndroidGenerator;
  let scanning = false;
  let preparing = false;
  let state = { connected: false, busy: false, slots: null, message: '尚未连接手环' };
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
    $('refreshSlots').disabled = !state.connected || busy;
    for (const slot of ['a', 'b']) {
      const item = state.slots && state.slots.find(value => value.slot === slot);
      $('slot' + slot).textContent = state.slots === null ? '尚未读取' :
        item ? (item.name || item.id || '未命名关卡') + ' · ' + item.cols + '×' + item.rows : '空槽位';
      $('put' + slot).disabled = !state.connected || busy || state.slots === null || !window.getCurrentMaze();
      $('clear' + slot).disabled = !state.connected || busy || !item;
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
    state.slots = null;
    state.message = '正在准备连接…';
    render();
    bridge.connectWear($('wearDevice').value);
  }));
  $('disconnectWear').addEventListener('click', () => client.stop('已断开连接'));
  $('refreshSlots').addEventListener('click', () => perform(() => client.request('list')));
  for (const slot of ['a', 'b']) {
    $('put' + slot).addEventListener('click', () => perform(() => {
      const existing = state.slots && state.slots.find(value => value.slot === slot);
      if (existing && !window.confirm('覆盖自定义 ' + slot.toUpperCase() + ' 中的现有关卡？')) return;
      client.request('put', slot, window.getCurrentMaze());
    }));
    $('clear' + slot).addEventListener('click', () => perform(() => {
      if (window.confirm('清空手环自定义 ' + slot.toUpperCase() + ' 槽位？')) client.request('clear', slot);
    }));
  }

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
