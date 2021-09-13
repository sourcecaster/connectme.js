import ConnectMeClient from './src/client.mjs';

/** @return {Promise} */
async function connect(
	/** string */ url,
	/** string[] */ protocols = [],
	/** boolean */ autoReconnect = true,
	/** int */ queryTimeout = 30,
	/** function */ onLog,
	/** function */ onError,
	/** function */ onConnect,
	/** function */ onDisconnect
) {
	let client = new ConnectMeClient(url, protocols, autoReconnect, queryTimeout, onLog, onError, onConnect, onDisconnect);
	await client.connect();
	return client;
}

export {ConnectMeClient, connect}