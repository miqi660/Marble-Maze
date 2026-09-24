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

  function validSlots(slots) {
    if (!Array.isArray(slots) || slots.length > 2) return false;
    const seen = new Set();
    return slots.every(item => {
      if (!item || !['a', 'b'].includes(item.slot) || seen.has(item.slot)) return false;
      seen.add(item.slot);
      return typeof item.id === 'string' && typeof item.name === 'string' &&
        Number.isInteger(item.cols) && item.cols >= 7 && item.cols <= 11 &&
        Number.isInteger(item.rows) && item.rows >= 13 && item.rows <= 20;
    });
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
      this.slots = null;
    }

    publish(message) {
      this.changed({ message, connected: this.connected, busy: !!this.pending, slots: this.slots });
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
      this.slots = null;
      this.publish(reason);
      if (closeTransport && oldToken !== null) this.disconnectTransport(oldToken, reason);
    }

    ready(token) {
      this.clearTimer();
      this.token = token;
      this.connected = false;
      this.slots = null;
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
      this.stop('通信失败，操作结果可能未知，请重连查询槽位：' + message);
    }

    request(kind, slot, maze, confirmation) {
      if (!this.connected || this.pending) throw new Error('请先连接并等待当前操作完成');
      if (!['list', 'put', 'clear'].includes(kind)) throw new Error('未知操作');
      if (kind !== 'list' && (!['a', 'b'].includes(slot) || this.slots === null)) {
        throw new Error('请先读取手环槽位');
      }
      const message = { tag: 'maze', stat: kind };
      if (kind !== 'list') message.slot = slot;
      if (kind === 'put') message.level = levelForSync(maze);
      const operation = { id: ++this.sequence, kind, slot, confirmation,
        expectedId: message.level && message.level.id };
      this.pending = operation;
      this.publish(kind === 'list' ? '正在读取手环槽位…' : '正在等待手环保存确认…');
      this.cancelTimer = this.schedule(8000, () => {
        if (this.pending !== operation) return;
        this.stop(kind === 'list' ? '槽位查询超时，请重新连接' :
          '确认超时，操作结果未知。请重连并查询槽位，不要直接重复覆盖');
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
        if (message.type !== 'list' || !validSlots(message.slots)) return;
        this.clearTimer();
        this.pending = null;
        this.slots = message.slots;
        const confirmation = operation.confirmation;
        if (confirmation) {
          const item = this.slots.find(value => value.slot === confirmation.slot);
          if (confirmation.kind === 'put' ? !item || item.id !== confirmation.expectedId : !!item) {
            this.stop('已收到操作确认，但槽位列表与预期不一致，请重连核对');
            return;
          }
        }
        this.publish(!confirmation ? '手环已连接，槽位已更新' :
          confirmation.kind === 'put' ? '同步成功，手环槽位已刷新' : '清空成功，手环槽位已刷新');
      } else {
        if (message.type !== 'ack' || message.slot !== operation.slot || typeof message.ok !== 'boolean') return;
        this.clearTimer();
        this.pending = null;
        if (!message.ok) {
          this.publish('手环拒绝操作：' + (typeof message.message === 'string' ? message.message : '未知原因'));
          return;
        }
        // ACK 才代表手环持久化完成；随后刷新列表，不由发送成功推断写入成功。
        this.slots = null;
        this.request('list', null, null, operation);
      }
    }
  }

  return { Client, levelForSync };
});
