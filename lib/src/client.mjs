import {PackMe, PackMeMessage} from 'packme';

function Query(type, completer) {
	return {
		completer: completer,
		time: Date.now()
	}
}

class ConnectMeClient {
	#packMe;
	url;
	#autoReconnect;
	#applyReconnect = true;
	queryTimeout;
	#handlers = new Map();
	socket;
	protocols;
	#queries = new Map();
	#queriesTimer;

	#onLog;
	#onError;
	onConnect;
	onDisconnect;

	constructor(
		/** string */ url,
		/** string[] */ protocols,
		/** boolean */ autoReconnect,
		/** int */ queryTimeout,
		/** function */ onLog,
		/** function */ onError,
		/** function */ onConnect,
		/** function */ onDisconnect
	) {
		this.#onLog = (message) => { if (onLog != null) onLog(message); };
		this.#onError = (err, stack) => { if (onError != null) onError(err, stack); };
		this.#packMe = new PackMe(onError);
		this.onConnect = onConnect;
		this.onDisconnect = onDisconnect;
	}

	/** @return {Promise} */
	async connect() {
		this.#applyReconnect = true;
		if (this.#queriesTimer == null) this.#queriesTimer = setInterval(this.#checkQueriesTimeout, 1000);
		this.#onLog(`Connecting to ${this.url}...`);
		await new Promise((resolve, reject) => {
			try {
				let socket = this.socket = new WebSocket(this.url, this.protocols);
				socket.onopen = () => {
					resolve();
					this.#onLog('Connection established');
					this.#listenSocket();
					if (this.onConnect != null) this.onConnect();
				};
				socket.onclose = () => {
					this.#checkQueriesTimeout(true);
					if (this.#autoReconnect && this.#applyReconnect) {
						this.#onError(`Connection to ${this.url} was closed, reconnect in 3 second...`);
						setTimeout(this.connect, 3000);
					}
					else this.#onLog(`Disconnected from ${this.url}`);
					if (this.onDisconnect != null) this.onDisconnect();
				};
				socket.onerror = this.#onError;
			}
			catch (err) {
				this.#onError(err.message, err.stack);
				reject();
			}
		});
	}

	/** @return {undefined} */
	#checkQueriesTimeout(cancelDueToClose = false) {
		let now = Date.now();
		for (let [transactionId, query] of this.#queries) {
			if (now - query.time >= this.queryTimeout * 1000 || cancelDueToClose) {
				this.#queries.delete(transactionId);
				query.completer.reject(`ConnectMe client.query() ${cancelDueToClose ? 'cancelled due to socket close' : 'response timed out'}`);
			}
		}
	}

	/** @return {Promise} */
	async #processHandler(/** function */ handler, /** string|Uint8Array|PackMeMessage */ data) {
		try {
			await handler(data);
		}
		catch (err) {
			this.#onError(`ConnectMe message handler execution error: ${err.message}`, err.stack);
		}
	}

	/** @return {undefined} */
	#listenSocket() {
		this.socket.onmessage = (data) => {
			if (data instanceof Uint8Array) {
				let message = this.#packMe.unpack(data);
				if (message != null) {
					let queries = this.#queries;
					let transactionId = message.$transactionId;
					let query = queries.get(transactionId);
					if (query != null) {
						queries.delete(transactionId);
						query.completer.resolve(message);
						return;
					}
					data = message;
				}
			}
			let type = typeof data === 'string' ? String : data instanceof Uint8Array ? Uint8Array : data.constructor;
			let handlers = this.#handlers.get(type);
			if (handlers != null) {
				for (let handler of handlers) this.#processHandler(handler, data);
			}
		};
	}

	/** @return {undefined} */
	register(/** Object */ messageFactory) {
		this.#packMe.register(messageFactory);
	}

	/** @return {undefined} */
	send(/** string|Uint8Array|PackMeMessage */ data) {
		if (data instanceof PackMeMessage) data = this.#packMe.pack(data);
		else if (!(data instanceof Uint8Array) && typeof data !== 'string') {
			this.#onError('Unsupported data type for Client.send(), only PackMeMessage, Uint8Array and String are supported');
			return;
		}
		if (data != null && this.socket != null && this.socket.readyState === WebSocket.OPEN) this.socket.send(data);
	}

	/** @return {Promise} */
	async query(/** type */ T, /** PackMeMessage */ message) {
		let completer = {};
		let promise = new Promise((resolve, reject) => {
			completer.resolve = resolve;
			completer.reject = reject;
		});
		let data = this.#packMe.pack(message);
		if (data != null && this.socket != null && this.socket.readyState === WebSocket.OPEN) {
			this.#queries.set(message.$transactionId, Query(T, completer));
			this.socket.send(data);
		}
		else {
			this.#onError("ConnectMe client.query() failed to pack message, future won't be resolved");
		}
		return promise;
	}

	/** @return {undefined} */
	listen(/** type */ T, /** function */ handler) {
		let handlers = this.#handlers;
		if (!handlers.has(T)) handlers.set(T, []);
		handlers.get(T).push(handler);
	}

	/** @return {undefined} */
	cancel(/** type */ T, /** function */ handler) {
		let handlers = this.#handlers.get(T);
		if (handlers != null) handlers.splice(handlers.indexOf(handler), 1);
	}

	/** @return {Promise} */
	async close() {
		let timer = this.#queriesTimer;
		if (timer != null) {
			clearInterval(timer);
			timer = null;
		}
		this.#handlers.clear();
		this.#applyReconnect = false;
		let socket = this.socket;
		await new Promise((resolve) => {
			if (socket.readyState !== WebSocket.CLOSED) {
				socket.addEventListener('close', resolve);
				socket.close();
			}
			else resolve();
		});
	}
}

export default ConnectMeClient;