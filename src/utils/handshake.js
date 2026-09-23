import interconn from './interconn.js';

const type = "__hs__";
const TIMEOUT = 3000;

export default class InterHandshake extends interconn {
    promise = null;
    round = null;
    callback = () => { };

    constructor() {
        super();
        this.addListener(type, ({ count }) => {
            if (count !== 0 && count !== 1 && count !== 2) return;
            const round = this.round || this._createRound();
            if (count > 0 && !round.connected) {
                round.connected = true;
                clearTimeout(round.timeout);
                round.timeout = null;
                round.resolve();
                this.callback();
            }
            // 重复消息只补发协议响应，不重复完成握手或调用监听器。
            if (count < 2) this._sendHandshake(round, count + 1);
        });
        this.addEventListener((event) => {
            if (event === "open") {
                this._reset(new Error("connection reopened"));
                this._newPromise();
            } else if (event === "close" || event === "error") {
                this._reset(new Error("connection closed"));
            }
        });
    }

    async send(...args) {
        if (!this.round) this._newPromise();
        const round = this.round;
        await round.promise;
        // Promise 完成到恢复执行之间也可能断线，禁止旧请求借用新连接。
        if (this.round !== round || !round.connected) throw new Error("connection closed");
        return await super.send(...args);
    }

    setHandshakeListener(callback) {
        this.callback = callback;
    }

    get connected() { return !!(this.round && this.round.connected); }

    _reset(error, round = this.round) {
        if (!round || this.round !== round) return;
        clearTimeout(round.timeout);
        round.timeout = null;
        round.connected = false;
        this.round = null;
        this.promise = null;
        round.reject(error);
    }

    _createRound() {
        const round = { connected: false, timeout: null };
        round.promise = new Promise((resolve, reject) => {
            round.resolve = resolve;
            round.reject = reject;
        });
        // 被动握手或 open 事件可能没有业务等待者；原 Promise 仍向 send 传递失败。
        round.promise.catch(() => {});
        this.round = round;
        this.promise = round.promise;
        round.timeout = setTimeout(() => {
            if (!round.connected) this._reset(new Error("timeout"), round);
        }, TIMEOUT);
        return round;
    }

    _sendHandshake(round, count) {
        if (this.round !== round) return;
        super.send(type, { count }).catch((error) => this._reset(error, round));
    }

    _newPromise() {
        const round = this._createRound();
        this._sendHandshake(round, 0);
        return round.promise;
    }
}
