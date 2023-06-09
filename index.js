const fs = require('fs');
const crypto = require('crypto');
const xrpl = require("xrpl");
const compare = require('underscore');
const EventEmitter = require("events");
const VerifySignature = require("verify-xrpl-signature").verifySignature;

/**
 * The 'Decentralized Key Management' framework for HotPocket applications.
 * @author Wo Jake
 * @version 0.2.0
 * @description A NodeJS framework for HotPocket clusters to manage their Decentralized Application's signer keys in a decentralized manner (XRPL).
 * 
 * See https://github.com/wojake/DKM to learn more and contribute to the codebase, any type of contribution is truly appreciated.
 */

// PUBLIC FUNCTIONS
// API Request   : getClient, getSignerList, getTransactions
// Setup         : init, setSignerList, addSignerKey, removeSignerKey
// Transaction   : packageTxAPI, autofillTx, submitTx, signTx
// NPL           : NPLResponse

/** @type {object} - EventEmitter Object for HotPocket NPL round management (NPL -> Node Party Line) */
const datasetEmitter = new EventEmitter(); 

/**
 * Get a XRPL node's URL. By default, it will return a random node's URL based on the choosen `network`
 * 
 * @param {string} network - The network (testnet, devnet, hooks)
 * @param {number} index - The index number, if it isn't provided: a random node's URL will be chosen
 * @returns {string} The node's URL
 */
function getClient(network, index) {
	const config = JSON.parse(fs.readFileSync(__dirname+'/DKM/dApp/config.json').toString());
	if (typeof index === "undefined") {
		var index = Math.abs(Math.floor(Math.random() * config.node[network].length));
	}
	return config.node[network][index];
}

class DecentralizedKeyManagement {
	constructor(ctx, client) {
		this.ctx = ctx;
		this.client = client;

		this._config = JSON.parse(fs.readFileSync(__dirname+'/DKM/dApp/config.json').toString());

		this._signerlist_state = false;
		
		this.#setupNPL();
	}

	get config() {
		return this._config;
	}

	// signer
	get signer_credential() {
		return this._signer_credential;
	}
	get signer_address() {
		return this._signer_credential.classicAddress;
	}
	get signer_seed() {
		return this._signer_credential.seed;
	}
	
	// dApp's account
	get account_credential() {
		return this._account_credential;
	}
	get account_address() {
		return this._account_credential.classicAddress;
	}
	get account_seed() {
		return this._account_credential.seed;
	}
	get account_sequence() {
		return this._account_credential.sequence;
	}

	get signers() {
		return this._signers;
	}
	get signers_location() {
		return this._signers_location;
	}
	get signers_weight() {
		return this._signers_weight;
	}
	get signerlist_quorum() {
		return this._signerlist_quorum;
	}
	get transactions() {
		return this._transactions;
	}

	/**
	 * Internal use to delay code execution
	 * @param {number} ms unit of time measurement: *millisecond*
	 */
	async #Delay(ms) {
		return await new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Log messages to DKM's log files, used internally.
	 * 
	 * @param {string} type - The log message's type (FTL: Fatal, ERR: Error, WRN: Warn, INF: Info, DBG: Debug) 
	 * @param {string} message - The log message
	 */
	#Log(type, message) {
		message = `DKM ${type} @ HP Ledger #${this.ctx.lclSeqNo}: ${message}`;
		console.log(message);

		fs.appendFileSync(`../GENERAL-logs.txt`, message);
		switch (type) {
			case "FTL":
				fs.appendFileSync(`../${type}-logs.txt`, message);
				break;
			case "ERR":
				fs.appendFileSync(`../${type}-logs.txt`, message);
				break;
			case "WRN":
				fs.appendFileSync(`../${type}-logs.txt`, message);
				break;
			case "INF":
				fs.appendFileSync(`../${type}-logs.txt`, message);
				break;
			case "DBG":
				fs.appendFileSync(`../${type}-logs.txt`, message);
				break;
		}
	}

	/**
	 * Start listening to NPL messages.
	 * If this is initialized, there is no need for the app to reinitiliaze it again outside of this function. 
	 */
	#setupNPL() {
		// NPL Rules on DKM:
		// 1. If a node has sent its response/message in a certain NPL round, it can't send more messages otherwise, the message would be ignored. 1 NPL Round = 1 message per node.
		// 2. Each NPL round could NOT share the same round name during a single code execution to avoid collision, each NPL round should have its own unique round name. If the same round name is being used, node messages won't pass through the filter.
			
		const rounds = {};
		this.ctx.unl.onMessage((node, msg) => {
			const { roundName, data } = JSON.parse(msg.toString());
			if (!(roundName in rounds)) {
				rounds[roundName] = [node.publicKey];
				datasetEmitter.emit(roundName, {node :node.publicKey ,data: data});
			} else {
				if (!(rounds[roundName].includes(node.publicKey))) {
					rounds[roundName].push(node.publicKey);
					datasetEmitter.emit(roundName, {node: node.publicKey, data: data});
				} else {
					Log("WRN", `NPL: Warning - ${node.publicKey} sent more than 1 message in NPL round ${roundName}!`);
				}
			}
		});
	}

	/**
	 * Query the XRP Ledger for data
	 * 
	 * @async
	 * @param {object} request - The request
	 * @param {object} client - Client object
	 * @returns {Promise<object>} rippled node's response to the request
	 */
	async #requestRippled({request}) {
		try {
			this.#Log("INF", `${this.#requestRippled.name}: Requesting ${request.command} data from ${this.client.url}`);
			var response = await this.client.request(request);
			return response;
		} catch (err) {
			return err;
		}
	}

	#generateSignerCredentials() {
		const key_file = `../${this.ctx.publicKey}-signerKey.json`;

		if (!fs.existsSync(key_file)) {
			var scheme = this._config.signer.scheme;

			if (scheme.length > 0) {
				var index = Math.abs(Math.floor(Math.random() * scheme.length));
				scheme = scheme[index];
			} else {
				throw new Error(`DKM: config.signer.scheme[] is not defined in config.json file`);
			}

 			const signer_wallet = xrpl.Wallet.generate(scheme);
		
			fs.writeFileSync(key_file, JSON.stringify({
				"seed": signer_wallet.seed,
				"classicAddress": signer_wallet.classicAddress
			}));
		}
	}

	/**
	 * Construct an *unfilled* Payment transaction with a MEMO field attached
	 * 
	 * DKM leverages the MEMO field on XRPL transaction so that the dApp could transmit data temporarily to its users on the XRPL
	 * 
	 * @param {string} destination - The recipient's XRPL account address
	 * @param {string} amount - (Optional) The amount of XRP that will be sent
	 * @param {object} MEMO - The MEMO field { memo_type, memo_data, memo_format }
	 * @returns {object} The transaction with a MEMO field attached
	 */
	packageTxAPI({destination, amount, MEMO}) {
		if (typeof amount !== "string") {
			throw new Error(`${this.packageTxAPI.name}: amount field is a ${typeof amount} instead of a string`);
		}
		if (typeof amount === "undefined") {
			amount = "1"; // default amount is set to 1 drop or 0.000001 XRP
		}

		return {
			TransactionType: "Payment",
			Account: this._account_credential.classicAddress,
			Destination: destination,
			Amount: amount,
			Memos: [{
					Memo: {
						MemoType: Buffer.from(MEMO.memo_type, 'utf8').toString('hex'),
						MemoData: Buffer.from(MEMO.memo_data, 'utf8').toString('hex'),
						MemoFormat: Buffer.from(MEMO.memo_format, 'utf8').toString('hex') // Common ones are "application/json" or "text/csv"
					}
			}]
		};
	}

	/**
	 * Autofill an unfileld XRPL transaction
	 * 
	 * @async
	 * @param {object} tx - The constructed transaction
	 * @param {boolean} multisig - The transaction's type (single signature or multi signature)
	 * @param {number} fee - The fee set for each signer
	 * @returns {Promise<object>} The autofilled transaction, ready for signing and submission
	 */
	async autofillTx({tx, multisig, fee}) {
		this.#Log("INF", `${this.autofillTx.name}: Autofilling ${tx.TransactionType} transaction`);

		if (multisig) {
			if (!this._signerlist_state) {
				const signerlist = await this.getSignerList();
				if (signerlist.state === false || signerlist.state === undefined) {
					throw new Error(`${this.autofillTx.name}: signer list does not exist`);
				}
			}
			if (!this._signerlist_quorum > 0) {
				throw new Error(`${this.autofillTx.name}: signerlist_quorum is less than 0, value: ${this._signerlist_quorum}`);
			}

			if (typeof tx.Fee === "number") {
				throw new Error(message=`${this.autofillTx.name}: tx.Fee is a number instead of a string`);
			}
			if (typeof tx.Fee === "undefined") {
				const fee_set = fee ?? this._config.signer.default_fee_per_signer;
				tx.Fee = ((this._signerlist_quorum + 1) * fee_set).toString();
			}
						
			try {
				var prepared_tx = await this.client.autofill(tx, this._signerlist_quorum);
			} catch (err) {
				return err;
			}
		} else {
			var prepared_tx = await this.client.autofill(tx);
		}

		return prepared_tx;
	}

	/**
	 * Submit a signed transaction to a rippled node (XRPLP powered network)
	 * 
	 * @async
	 * @param {string} tx - The signed transaction blob
	 */
	async submitTx({tx}) {
		// Inputted transaction must be a signed_tx_blob (Signed-Transaction-Object.tx_blob)
		if (typeof tx === "number" || tx === undefined) {
			this.#Log("INF", `${this.submitTx.name}: No signed transaction blob was provided`);
			return false;
		} else {
			var tx_type = xrpl.decode(tx).TransactionType;
		}

		try {
			this.#Log("INF", `${this.submitTx.name}: Submitting ${tx_type} transaction to rippled node`);
			return await this.client.submit(tx);
		} catch (err) {
			this.#Log("ERR", `${this.submitTx.name}: Error submitting ${tx_type} transaction to rippled node. Error: ${err}`);
		}
	}

	/**
		 * Submit a signed transaction to a rippled node (XRPLP powered network)
		 * 
		 * @async
		 * @param {string} tx - The signed transaction blob
		 */
	async submitTxAndWait({tx}) {
		// Inputted transaction must be a signed_tx_blob (Signed-Transaction-Object.tx_blob)
		if (typeof tx === "number" || tx === undefined) {
			this.#Log("INF", `${this.submitTxAndWait.name}: No signed transaction blob was provided`);
			return false;
		} else {
			var tx_type = xrpl.decode(tx).TransactionType;
		}

		try {
			this.#Log("INF", `${this.submitTxAndWait.name}: Submitting ${tx_type} transaction to rippled node`);
			return await this.client.submitAndWait(tx);
		} catch (err) {
			this.#Log("ERR", `${this.submitTxAndWait.name}: Error submitting ${tx_type} transaction to rippled node. Error: ${err}`);
		}
	}

	/**
	 * Perform a NPL round on the HotPocket Consensus Engine
	 * 
	 * @async
	 * @param {string} content - The content that the node wants to distribute to its peers, this field must be in the form of a string
	 * @param {number} desired_count - The desired amount of responses that the NPL round needs
	 * @param {number} timeout - NPL round timeout
	 * @param {boolean} strict - If strict is true, we need the *precise* number of responses before the timeout is reached. If not, any number of responses is fine
	 * @returns {Promise<array>} NPL round result (responses from UNL peers). If this array contains 0 objects, it means that @param strict is true and we weren't able to meet threshold
	 */
	async NPLResponse({content, desired_count, timeout, strict}) {
		const NPL = (roundName, desired_count, timeout) => {
			return new Promise((resolve) => {
				const start = performance.now();

				const record = [];
				const collected_data = [];
				const participants = [];
				var finish = undefined;

				const response = {
					roundName: roundName,
					record: record,
					data: collected_data,
					participants: participants,
					desired_count: desired_count,
					timeout: timeout,
					time_taken: undefined,
				};

				const timer = setTimeout((finish = performance.now()) => {
					response.time_taken = finish - start;

					this.#Log("INF", `${this.NPLResponse.name}: ${roundName} took ${response.time_taken}ms to finish`);

					// Fire up the timeout if we didn't receive enough messages.
					if (collected_data.length < desired_count && strict === true) {
						response.record = [],
						response.data = [];
						resolve(response);
					} else if (collected_data.length < desired_count && strict === false) {
						resolve(response);
					}
				}, timeout);

				datasetEmitter.on(roundName, (data) => {
					record.push({
						"node": data.node, // hotpocket node's public key
						"data": data.data, // the NPL packet's data
						"time": performance.now() - start // the time taken for us to receive data from `data.node`
					}),
					collected_data.push(data.data),
					participants.push(data.node);
		
					// Resolve immediately if we have the required no. of messages.
					if (collected_data.length === desired_count) {
						clearTimeout(timer);

						finish = performance.now();

						response.time_taken = finish - start;

						this.#Log("INF", `${this.NPLResponse.name}: [FILLED] ${roundName} took ${response.time_taken}ms to finish`);
						
						resolve(response);
					}
				});
			});
		};

		const { roundName, _data } = JSON.parse(content);
		await this.ctx.unl.send(content);
		return await NPL(roundName, desired_count, timeout);
	}


	/**
	 * Get the dApp's XRPL account signer list.
	 * 
	 * By default, it'll request the dApp's signer list but in the case that the `address` parameter is filled, it'll search for that XRPL account's signer list.
	 * 
	 * @async
	 * @param {string} address - (Optional) The account to look up
	 * @returns {object} { exist: Boolean, signers: Array[], signers_weight: Array[], quorum: number }
	 */
	async getSignerList(address) {
		if (typeof address === "undefined") {
			if (typeof this._account_credential === "undefined") {
				const account_wallet = xrpl.Wallet.fromSeed(this._config.account.seed);
			
				address = account_wallet.classicAddress;
			} else {
				address = this._account_credential.classicAddress;
			}
		}

		const request = await this.#requestRippled({
			request: {
				"command": "account_objects",
				"account": address,
				"ledger_index": "validated",
				"type": "signer_list"
		}});

		if (request.hasOwnProperty("result")) {
			for (let i = 0; i < request.result.account_objects.length; i++) {
				if (request.result.account_objects[i].hasOwnProperty("SignerEntries")) {
					const signer_list = request.result.account_objects[i].SignerEntries;
					const dApp_signers = [],
					signers_weight = [],
					signers_location = [];
	
					signer_list.forEach(signer => {
						dApp_signers.push(signer.SignerEntry.Account),
						signers_location.push({
							signing_key: signer.SignerEntry.Account,
							public_key: signer.SignerEntry.WalletLocator
						}),
						signers_weight.push({
							account: signer.SignerEntry.Account,
							weight: signer.SignerEntry.SignerWeight
						});
					});
			
					this._signerlist_state = true,
					this._signers = dApp_signers,
					this._signers_location = signers_location,
					this._signers_weight = signers_weight,
					this._signerlist_quorum = request.result.account_objects[0].SignerQuorum;

					return {
						state: this._signerlist_state,
						signers: this._signers,
						signers_weight: this._signers_weight,
						quorum: this._signerlist_quorum
					};
				}
			}
		}

		this._signerlist_state = false,
		this._signers = [],
		this._signers_location = [],
		this._signers_weight = [],
		this._signerlist_quorum = 0;

		return {
			exist: this._signerlist_state,
			signers: this._signers,
			signers_weight: this._signers_weight,
			quorum: this._signerlist_quorum
		};
	}

	/**
	 * Sign an XRPL transaction with all the participating signers' signature
	 * 
	 * All active participating signers will sign the transaction and distribute their signatures via NPL
	 * 
	 * @async
	 * @param {object} tx - The transaction
	 * @returns {Promise<object>} The multi-signed transaction
	 */
	async signTx({tx}) {
		const signer_wallet = xrpl.Wallet.fromSecret(this._signer_credential.seed);

		// Signers that are apart of the dApp's signer list get to be apart of the multisig transaction, other signer's tx blob are ignored
		if (this._signers.includes(signer_wallet.classicAddress)) {
			const signed_tx_blob = signer_wallet.sign(tx, true).tx_blob;

			this.#Log("INF", `${this.signTx.name}: Multi-signing ${tx.TransactionType} transaction`);

			// Hash the unsigned tx's object as a checksum for the NPL roundname
			const roundname = crypto.createHash('sha256').update(JSON.stringify(tx)).digest('hex').toUpperCase();

			const signatures = await this.NPLResponse({
				content: JSON.stringify({
					roundName: `signature-collection-${roundname}`,
					data: JSON.stringify({
						account: signer_wallet.classicAddress,
						tx: signed_tx_blob
					})
				}),
				desired_count: this._signerlist_quorum,
				timeout: this._config.NPL_round_timeout["signing"],
				strict: true
				// ``strict` should be true because if we have enough signers to pass quorum, the tx is valid.
				// Any more signatures would be a waste of tx fee and time spent on collecting signatures. 
				// If you'd like to object this, post an issue on the package's github repository and let's talk. 
			});
		
			const valid_signatures = [];
			var collected_quorum = 0;

			signatures.data.forEach(signature => {
				signature = JSON.parse(signature);
				// Check if we have enough signers && check if the signature's signer key is on the signer list
				if (collected_quorum < this._signerlist_quorum && this._signers.includes(signature.account)) {
					const verification = VerifySignature(signature.tx, signature.account);
					if (verification.signedBy === signature.account && verification.signatureValid === true && verification.signatureMultiSign === true) {
						valid_signatures.push(signature.tx),
						collected_quorum += this._signers_weight.find(({ account }) => account === signature.account).weight;
						} else {
							if (verification.signedBy !== signature.account) {
								var reason = "Transaction was not signed by the specified signer key";
							}
							if (verification.signatureValid !== true) {
								var reason = "Transaction's signature was not valid";
							}
							if (verification.signatureMultiSign !== true) {
								var reason = "Transaction was not a multi-sig transaction";
							}
							this.#Log("WRN", `${this.signTx.name}: Signer ${signature.account} did not provide a valid signature. Reason: ${reason}`);
						}
				}
			});

				if (valid_signatures.length > 0) {
					return xrpl.multisign(valid_signatures);
				} else {
					return undefined;
				}
		} else {
			return undefined;
		}
	}

	/**
	 * Construct a Signer List for the dApp's account
	 * 
	 * @async
	 * @param {array<object>} signers - The dApp's SignerList {signing_key: string, public_key: string} (HP node's public key, signer's address)
	 * @param {number} fee - The fee for each participating signer or the fee for the transaction during setup
	 * @param {boolean} setup - Indication on whether or not this function is being called to setup the dApp's signer list
	 * @returns {Promise<boolean>} The state of the dApp's signer list ("SUCCESSFUL" or "FAILED")
	 */
	async setSignerList({signers, fee}) {
		if (typeof signers === "undefined") {
			throw new Error(`${this.setSignerList.name}: proposed signer list has 0 signers`);
		}
		if (signers.length > 32) {
			throw new Error(`${this.setSignerList.name}: proposed signer list has over 32 signers. The max amount of signers on a signer list is 32`);
		}

		const account_wallet = xrpl.Wallet.fromSecret(this._account_credential.seed);
		const signer_quorum = this._config.account.signerlist_quorum;

		var signer_keys = [];
		signers.forEach(signer => {
			signer_keys.push(signer.signing_key);
		});

		signer_keys.sort();

		var sorted_signers = [];
		signer_keys.forEach(signing_key => {
			signers.forEach(signer => {
				if (signer.signing_key === signing_key) {
					sorted_signers.push(signer);
				}
				signers = signers.filter((signer) => signer.signing_key !== signing_key);
			});
		});

		// regex for SHA256 hash
		const regexExp = /^[a-f0-9]{64}$/gi;
		const new_dApp_signerlist = [];
		sorted_signers.forEach(signer => {
			if (regexExp.test(signer.public_key)) {
				var walletlocator = signer.public_key;
			} else {
				var walletlocator = crypto.createHash('sha256').update(signer.public_key).digest('hex').toUpperCase();
			}

			new_dApp_signerlist.push({
				"SignerEntry": {
					"Account": signer.signing_key,
					"SignerWeight": 1,
					"WalletLocator": walletlocator
				}
			});
		});

		if (this._signerlist_state === false) {
			var SetSignerList_tx = await this.autofillTx({
				tx: {
					TransactionType: "SignerListSet",
					Account: account_wallet.classicAddress,
					Fee: fee,
					SignerEntries: new_dApp_signerlist,
					SignerQuorum: Math.round(new_dApp_signerlist.length * signer_quorum),
					Memos: [{
						Memo: {
							MemoType: Buffer.from("Evernode", 'utf8').toString('hex'),
							MemoData: Buffer.from("DKM: HotPocket dApp's SignerList", 'utf8').toString('hex'),
							MemoType: Buffer.from("text/plain", 'utf8').toString('hex')
						}
					}]
				},
				multisig: false
			});
		} else {
			var SetSignerList_tx = await this.autofillTx({
				tx: {
					TransactionType: "SignerListSet",
					Account: account_wallet.classicAddress,
					SignerEntries: new_dApp_signerlist,
					SignerQuorum: Math.round(new_dApp_signerlist.length * signer_quorum),
					Memos: [{
						Memo: {
							MemoType: Buffer.from("Evernode", 'utf8').toString('hex'),
							MemoData: Buffer.from("DKM: HotPocket dApp's SignerList", 'utf8').toString('hex'),
							MemoType: Buffer.from("text/plain", 'utf8').toString('hex')
						}
					}]
				},
				multisig: true,
				fee: fee,
			});	
		}

		if (this._signerlist_state === false) {
			var SetSignerList_tx_signed = account_wallet.sign(SetSignerList_tx).tx_blob;
		} else {
			var SetSignerList_tx_signed = await this.signTx({tx: SetSignerList_tx});
		}

		await this.submitTx({
			tx: SetSignerList_tx_signed
		});

		var retries = 0;
		while (retries < 2) {
			await this.#Delay(4000);

			await this.getSignerList();

			if (this._signerlist_state === true) {
				return "SUCCESSFUL";
			} else {
				if (retries === 2) { 
					return "FAILED";
				} else {
					retries += 1;
				}
			}
		}
	}

	/**
	 * Disable the dApp's XRPL account Master Key
	 * 
	 * @async
	 * @returns {Promise<boolean>} The state of lsfDisableMaster on the dApp's XRPL account ("SUCCESSFUL" or "FAILED")
	 */
	async #disableMasterKey() {
		const account_wallet = xrpl.Wallet.fromSecret(this._account_credential.seed);

		const DisableMasterKey_tx = await this.autofillTx({
			tx: {
				TransactionType: "AccountSet",
				Account: account_wallet.classicAddress,
				SetFlag: xrpl.AccountSetAsfFlags.asfDisableMaster,
				Memos: [{Memo:{
					MemoType: Buffer.from("Evernode", 'utf8').toString('hex'),
					MemoData: Buffer.from("DKM: This XRPL account is now fully controlled by its signers", 'utf8').toString('hex'),
					MemoType: Buffer.from("text/plain", 'utf8').toString('hex')
				}}]
			},
			multisig: false,
		});

		const DisableMasterKey_tx_signed = account_wallet.sign(DisableMasterKey_tx).tx_blob;

		await this.submitTx({
			tx: DisableMasterKey_tx_signed,
		});

		var retries = 0;
		while (retries < 2) {
			await this.#Delay(4000);

			const lsfDisableMaster = await this.#requestRippled({
				request: {
					"command": "account_info",
					"account": account_wallet.classicAddress,
					"ledger_index": "validated"
				}
			});

			if ((0x00100000 & lsfDisableMaster.result.account_data.Flags)) {
				return "SUCCESSFUL";
			} else {
				if (retries === 2) { 
					return "FAILED";
				} else {
					retries += 1;
				}
			}
		}
	}

	async #setupDAppAccount() {
		// Setup dApp's XRPL account
		// Do not use GetIncomingTx(), it doesn't work until we've created the '/DKM/dApp/XRPL_account.json' file
		// Past transactions before this step (SetupAccount()) will be ignored, they will not be processed as we're setting the dApp's XRPL account up

		var SignerListSet = "FAILED",
			MasterKey = "FAILED",
			signerlist_record = undefined; 
		
		// 2 tries
		var retries = 0;
		while (retries < 2) {
			if (retries === 0) {
				var cluster_signer_keys = await this.NPLResponse({
					content: JSON.stringify({
						roundName: `signerlist-setup-${this._account_credential.classicAddress}-${retries}`,
						data: this._signer_credential.classicAddress
					}),
					desired_count: this.ctx.unl.count(),
					timeout: this._config.NPL_round_timeout["signerlist_setup"],
					strict: false
				});

				signerlist_record = cluster_signer_keys.record;
			} else {
				const unfilled_cluster_keys = cluster_signer_keys.data;

				var cluster_signer_keys = await this.NPLResponse({
					content: JSON.stringify({
						roundName: `signerlist-setup-${this._account_credential.classicAddress}-${retries}`,
						data: signerlist_record
					}),
					desired_count: this.ctx.unl.count(),
					timeout: this._config.NPL_round_timeout["signerlist_setup"] / 2,
					strict: false
				});

				cluster_signer_keys.data.forEach(record => {
					if (signerlist_record.length < this.ctx.unl.count()) {
						record.forEach(node => {
							if (signerlist_record.length < this.ctx.unl.count()) {
								unfilled_cluster_keys.forEach(key => {
									if (!key === node.data) {
										signerlist_record.push(node);
									}
								});
							}
						});
					}
				});
			}
			var signerlist = [];
			if (typeof signerlist_record !== "undefined") {
				signerlist_record.forEach(record => {
					const signer_data = {
						"signing_key": record.data,
						"public_key": record.node
					};
					if (!signerlist.includes(signer_data)) {
						signerlist.push(signer_data);
					}
				});
			}

			if (signerlist.length === this.ctx.unl.count()) {
				const SignerList = await this.setSignerList({
					signers: signerlist
				});
	
				if (SignerList === "SUCCESSFUL") {
					retries = 2,
					SignerListSet = "SUCCESSFUL";
				} else {
					retries += 1;
				}
			} else {
				retries += 1;
			}
		}
	
		// 2 tries
		while (retries < 4) {
			const DisableMaster = await this.#disableMasterKey();
	
			if (DisableMaster === "SUCCESSFUL") {
				retries = 4;
				MasterKey = "SUCCESSFUL";
			} else {
				retries += 1;
			}
		}
	
		const txs_result = {
			SignerListSet: SignerListSet,
			DisableMasterKey: MasterKey
		};
	
		if (SignerListSet === "SUCCESSFUL" && MasterKey === "SUCCESSFUL") {
			this.#Log("INF", `${this.#setupDAppAccount.name}: dApp's XRPL account is now setup @ ${this._account_credential.classicAddress}`);
			return {
				result: "SUCCESSFUL",
				transactions: txs_result
			};
		} else {
			this.#Log("INF", `${this.#setupDAppAccount.name}: dApp's XRPL account has failed to setup @ ${this._account_credential.classicAddress}`);
			return {
				result: "FAILED",
				transactions: txs_result
			};
		}
	}

	/**
	 * Retrieve a new set of outgoing/incoming transactions that have not been 'processed'
	 * 
	 * @async
	 * @returns {Promise<string>} Array of 'unprocessed' transactions
	 */	
	async getTransactions() {
		const request = await this.#requestRippled({
			request: {
				command: 'account_tx',
				account: this._account_credential.classicAddress,
				ledger_index_min: this._account_credential.sequence + 1,
				ledger_index_max: -1,
				binary: false,
				forward: true
			}
		});
		
		if (request.hasOwnProperty("result") ) {
			if (request.result.transactions.length > 0) {

				this._account_credential.sequence = request.result.transactions[request.result.transactions.length - 1].tx.ledger_index;
				fs.writeFileSync(__dirname+"/DKM/dApp/XRPL_account.json", JSON.stringify(this._account_credential));

				this._transactions = request.result.transactions;
			} else {
				this._transactions = [];
			}
		}
	}


	/**
	 * Check up on the cluster's status, particularly signers that are on the signer list
	 * 
	 * @async
	 * @returns {Promise<object>} The status of the node's UNL (singers) 
	 */
	async checkupClusterSigners() {
		if (this._signerlist_state === false) {
			throw new Error(`${this.checkupClusterSigners.name}: signer list does not exist`);
		}

		const cluster_signers_1 = await this.NPLResponse({
			content: JSON.stringify({
				roundName: `signer-status-checkup-${this._account_credential.classicAddress}`,
				data: this._signer_credential.classicAddress
			}),
			desired_count: this.ctx.unl.count(),
			ctx: this.ctx,
			timeout: this._config.NPL_round_timeout["signer_status_checkup"],
			strict: false
		});

		// i'm sorry, this is a mess. if you have a better alternative, please suggest one !

		var online_signers = [];
		cluster_signers_1.record.forEach(record => {
				const signer_data = {
					"signing_key": record.data,
					"public_key": crypto.createHash('sha256').update(record.node).digest('hex').toUpperCase()
				};
				this._signers_location.forEach(signer => {
					if (JSON.stringify(signer) === JSON.stringify(signer_data)) {
						online_signers.push(signer_data);
					}
				});
		});

		var offline_signers = this._signers_location;
		online_signers.forEach(signer0 => {
			offline_signers.forEach(signer1 => {
				if (JSON.stringify(signer0) === JSON.stringify(signer1)) {
					offline_signers = offline_signers.filter((signer0) => signer0.signing_key !== signer1.signing_key);
				}
			});
		});

		return {
			online: online_signers,
			offline: offline_signers,
			record: cluster_signers_1.record,
			timeout: cluster_signers_1.timeout,
			time_taken: cluster_signers_1.time_taken
		};
	}

	/**
	 * Add a set of signer keys to the dApp's XRPL account SignerList
	 * 
	 * @async
     * @param {array<string>} signers - Signer keys to add to the signer list { signing_key: string, public_key: string }
	 * @param {number} fee - The fee per each participating signer
	 * @returns {string} The state of the transaction ("SUCCESSFUL" or "FAILED")
	 */
	async addSignerKey({signers, fee}) {			
		if (this._signerlist_state === false) {
			throw new Error(`${this.addSignerKey.name}: signer list does not exist`);
		}
		if (this._signers.length + signers.length > 32) {
			throw new Error(`${this.addSignerKey.name}: cannot append new signer keys as it exceeds the 32 signer slot limit on the XRP Ledger`);	
		}

		signers.forEach(key => {
			if (!xrpl.isValidAddress(key.signing_key)) {
				throw new Error(`${this.addSignerKey.name}: "${key}" is not a valid XRPL address, cannot append to dApp's Ssigner list`);
			}
		});

		const new_signerlist = [];
		this._signers_location.forEach(key => {
			new_signerlist.push(key);
		}),
		signers.forEach(signer0 => {
			var duplicate = false;
			new_signerlist.forEach(signer1 => {
				if (signer0.signing_key === signer1.signing_key) {
					signers = signers.filter((signer0) => signer0.signing_key !== signer1.signing_key);
					duplicate = true;
				}
			});
			if (!duplicate) {
				new_signerlist.push(signer0);
			}
		});

		const different_keys = compare.difference(new_signerlist, this._signers_location);

		if (different_keys.length > 0) {
			return await this.setSignerList({
				signers: new_signerlist,
				fee: fee
			});
		}
	}


	/**
	 * Remove signer keys from the dApp's XRPL account SignerList
	 * 
	 * @async
	 * @param {array<string>} signers - Signer keys to remove from the signer list
	 * @param {number} fee - The fee per each participating signer
	 * @returns {string} The state of the transaction ("SUCCESSFUL" or "FAILED")
	 */
	async removeSignerKey({signers, fee}) {
		if (this._signerlist_state === false) {
			throw new Error(`${this.addSignerKey.name}: signer list does not exist`);
		}
		if (this._signers.length - signers.length === 0) {
			throw new Error(`${this.addSignerKey.name}: cannot remove given signer keys as it will result in the dApp's signer list having 0 signers`);	
		}

		var new_signers = this._signers_location;
		// filter out the signer keys that are instructed to be removed
		signers.forEach(key => {
			new_signers.forEach(signer => {
				if (signer.signing_key === key) {
					new_signers = new_signers.filter((signer) => signer.signing_key !== key);
				}
			});
		});

		if (new_signers.length < this._signers_location.length) {
			return await this.setSignerList({
				signers: new_signers,
				fee: fee
			});
		}
	}

	async init() {
		this.#generateSignerCredentials();
		this._signer_credential = JSON.parse(fs.readFileSync(`../${this.ctx.publicKey}-signerKey.json`).toString());

		if (this.ctx.lclSeqNo > 1 ) {
			this._account_credential = JSON.parse(fs.readFileSync(__dirname+"/DKM/dApp/XRPL_account.json").toString());
		} else {
			// temporary data during setup @ ledger 1. this is a bad hack, please fix future self
			var wallet = xrpl.Wallet.fromSeed(this._config.account.seed);
			this._account_credential = {
				classicAddress: wallet.classicAddress,
				seed: wallet.seed
			};
		}

		await this.getSignerList();
	
		if (!this._signerlist_state) {
			await this.#setupDAppAccount();
		}
		
		await this.getTransactions();
	}
}

module.exports = { 
	getClient,
	DecentralizedKeyManagement
};

// e3c2064ece7e8bbbebb2a06be96607bb560a2ab8314e3ae64a43aaf3d2954830c760ad7ed923ca2ce3303a1bbc9a2e4d26bf177bae5416af0cc157a60dcc82e4