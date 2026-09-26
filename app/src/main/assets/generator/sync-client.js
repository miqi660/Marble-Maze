(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports
    ? require('./tools/maze/generator-core.js') : root.MazeGeneratorCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MazeSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';

  // CRC 的对象字段顺序与手环 stripCrc 一致；不发送预览用 render。
  function levelForSync(maze) {
    core.validateFull(maze);
    const full = core.normalizeMazeDefinition(maze);
    const slim = {};
    for (const key of Object.keys(full)) if (key !== 'render') slim[key] = full[key];
    const bytes = new TextEncoder().encode(JSON.stringify(slim));
    if (bytes.length > 1024) throw new Error('关卡超过手环 1024 字节上限');
    const crc = core.crc32IsoHdlc(bytes).toString(16).toUpperCase().padStart(8, '0');
    return Object.assign(slim, { crc });
  }

  function validLevels(levels) {
    if (!Array.isArray(levels) || levels.length > 12) return false;
    return levels.every((item, index) => item && item.index === index &&
      typeof item.id === 'string' && typeof item.name === 'string' &&
      Object.keys(core.PROFILE_LIMITS).some(profile => {
        try { core.validateSpec(item.cols, item.rows, profile); return true; }
        catch (_) { return false; }
      }));
  }

  function summary(level, index) {
    return { index, id: level.id, name: level.name || '', cols: level.cols, rows: level.rows };
  }

  function matches(levels, operation) {
    const expected = operation.before.map((item, index) => summary(item, index));
    if (operation.kind === 'add') expected.push(operation.expected);
    else if (operation.kind === 'replace') expected[operation.index] = operation.expected;
    else expected.splice(operation.index, 1);
    return expected.length === levels.length && expected.every((item, index) =>
      ['index', 'id', 'name', 'cols', 'rows'].every(key =>
        levels[index][key] === (key === 'index' ? index : item[key])));
  }

  class Client {
    constructor({ send, disconnect, changed, schedule }) {
      this.send = send;
      this.disconnectTransport = disconnect;
      this.changed = changed;
      this.schedule = schedule || ((delay, callback) => {
        const timer = setTimeout(callback, delay);
        return () => clearTimeout(timer);
      });
      this.token = null;
      this.sequence = 0;
      this.pending = null;
      this.cancelTimer = null;
      this.connected = false;
      this.levels = null;
    }

    publish(message) {
      this.changed({ message, connected: this.connected, busy: !!this.pending, levels: this.levels });
    }

    clearTimer() {
      if (this.cancelTimer) this.cancelTimer();
      this.cancelTimer = null;
    }

    stop(reason, closeTransport = true) {
      const oldToken = this.token;
      this.clearTimer();
      this.token = null;
      this.pending = null;
      this.connected = false;
      this.levels = null;
      this.publish(reason);
      if (closeTransport && oldToken !== null) this.disconnectTransport(oldToken, reason);
    }

    ready(token) {
      this.clearTimer();
      this.token = token;
      this.connected = false;
      this.levels = null;
      const operation = { id: ++this.sequence, kind: 'handshake', attempts: 0 };
      this.pending = operation;
      this.publish('正在与手环握手…');
      const attempt = () => {
        operation.attempts++;
        this.cancelTimer = this.schedule(3000, () => {
          if (this.pending !== operation) return;
          if (operation.attempts < 3) attempt();
          else this.stop('握手超时，请打开手环上的弹珠迷宫后重新连接');
        });
        this.transmit(operation, { tag: '__hs__', count: 0 });
      };
      attempt();
    }

    transmit(operation, message) {
      try { this.send(this.token, operation.id, JSON.stringify(message)); }
      catch (error) { this.failed(this.token, operation.id, error.message); }
    }

    failed(token, id, message) {
      if (token !== this.token || !this.pending || id !== this.pending.id) return;
      this.stop('通信失败，操作结果可能未知，请重连查询关卡：' + message);
    }

    request(kind, index, maze, confirmation) {
      if (!this.connected || this.pending) throw new Error('请先连接并等待当前操作完成');
      if (!['list', 'add', 'replace', 'remove'].includes(kind)) throw new Error('未知操作');
      if (kind !== 'list' && this.levels === null) throw new Error('请先读取手环自定义关卡');
      if (kind === 'add' && this.levels.length >= 12) throw new Error('自定义关卡已满（12 / 12）');
      if (['replace', 'remove'].includes(kind) &&
          (!Number.isInteger(index) || index < 0 || index >= this.levels.length)) throw new Error('无效关卡编号');
      const message = { tag: 'maze', stat: kind };
      if (kind === 'replace' || kind === 'remove') message.index = index;
      if (kind === 'add' || kind === 'replace') message.level = levelForSync(maze);
      const target = kind === 'add' ? this.levels.length : index;
      const operation = { id: ++this.sequence, kind, index: target, confirmation,
        before: this.levels && this.levels.map((item, i) => summary(item, i)),
        expected: message.level && summary(message.level, target) };
      this.pending = operation;
      this.publish(kind === 'list' ? '正在读取手环自定义关卡…' : '正在等待手环保存确认…');
      this.cancelTimer = this.schedule(8000, () => {
        if (this.pending !== operation) return;
        this.stop(kind === 'list' && !confirmation ? '关卡查询超时，请重新连接' :
          '确认超时，操作结果未知。请重连并查询关卡，不要直接重复操作');
      });
      this.transmit(operation, message);
    }

    receive(token, text) {
      if (this.token === null || token !== this.token || typeof text !== 'string' || text.length > 16384) return;
      let message;
      try { message = JSON.parse(text); } catch (_) { return; }
      if (!message || typeof message !== 'object') return;
      if (message.tag === '__hs__') {
        if (!Number.isInteger(message.count) || message.count < 0 || message.count > 2) return;
        const handshake = this.pending && this.pending.kind === 'handshake' ? this.pending : null;
        if (!handshake && !this.connected) return;
        if (message.count < 2) {
          this.transmit(handshake || { id: -1 }, { tag: '__hs__', count: message.count + 1 });
        }
        if (message.count > 0 && handshake && this.pending === handshake) {
          this.clearTimer();
          this.pending = null;
          this.connected = true;
          this.request('list');
        }
        return;
      }
      const operation = this.pending;
      if (message.tag !== 'maze' || !operation || operation.kind === 'handshake') return;
      if (operation.kind === 'list') {
        if (message.type !== 'list') return;
        if (message.ok === false) {
          const detail = typeof message.message === 'string' && message.message ? '：' + message.message : '';
          this.stop('手环关卡列表读取失败' + detail + '，请重新连接核对');
          return;
        }
        if (!validLevels(message.levels)) return;
        this.clearTimer();
        this.pending = null;
        const confirmation = operation.confirmation;
        if (confirmation && !matches(message.levels, confirmation)) {
          this.stop('操作确认后关卡列表与预期不一致，请重新连接核对');
          return;
        }
        this.levels = message.levels;
        this.publish(!confirmation ? '手环已连接，自定义关卡已更新' :
          { add: '同步成功，已添加关卡', replace: '替换成功', remove: '删除成功' }[confirmation.kind]);
      } else {
        if (message.type !== 'ack' || message.stat !== operation.kind || typeof message.ok !== 'boolean') return;
        // add 失败时手环不返回 index；成功及其他操作必须严格匹配。
        if ((operation.kind !== 'add' || message.ok) && message.index !== operation.index) return;
        this.clearTimer();
        this.pending = null;
        if (!message.ok) {
          this.stop('手环拒绝操作：' + (typeof message.message === 'string' ? message.message : '未知原因') + '，请重连查询关卡');
          return;
        }
        // 保存 ACK 后必须回读整个列表，最终匹配前不能宣称成功。
        this.levels = null;
        this.request('list', null, null, operation);
      }
    }
  }

  return { Client, levelForSync };
});
