/* eslint-disable no-undef */
/* eslint-disable no-prototype-builtins */
/* eslint-disable no-redeclare */
const fs = require("fs");
const compare = require("underscore");
const crypto = require("crypto");
const VerifySignature = require("verify-xrpl-signature").verifySignature;
const NPLBroker = require("npl-broker");

/**
 * The 'Decentralized Key Management' framework for HotPocket applications.
 * @author Wo Jake
 * @version 0.4.0
 * @description A NodeJS framework for HotPocket clusters to manage their Decentralized Application's signer keys in a decentralized manner (XRPL).
 * 
 * See https://github.com/wojake/DKM to learn more and contribute to the codebase, any type of contribution is truly appreciated.
 */

// PUBLIC FUNCTIONS
// API Request   : getNetwork, getSignerList, getTransactions
// Setup         : init, setSignerList, addSignerKey, removeSignerKey
// Transaction   : packageTxAPI, autofillTx, submitTx, signTx

/**
 * Get a XRPL node's URL from DKM config file.
 * 
 * @param {string} network - The network (testnet, devnet, hooks)
 * @returns {object} The network {wss: string, network_id: string}
 */
function getNetwork(network) {
	const config = JSON.parse(fs.readFileSync(__dirname+"/DKM/dApp/config.json").toString());
	return config.network[network];
}

class Manager {
	constructor(ctx, xrpl, client, networkID) {
		this.ctx = ctx;
		this.xrpl = xrpl;
		this.client = client;
		this.networkID = networkID;

		this.dkmConfig = JSON.parse(fs.readFileSync(__dirname+"/DKM/dApp/config.json").toString());

		// false: 0 signerlist on account root 
		// true: 1 signerlist on account root
		this.signerlistCount = 0;
		
		this.npl = NPLBroker.init(ctx);
	}

	get config() {
		return this.dkmConfig;
	}

	// The HotPocket node's unique keypair, used for signing XRPL transactions.
	// Each HP node has its own unique keypair, stored & used privately.
	get hpNodeSignerAddress() {
		return this.hpSignerAddress;
	}
	get hpNodeSignerSeed() {
		return this.hpSignerSeed;
	}
	
	// The HP dApp's XRPL account, representing the dApp's balances and "web3" interface on the XRPL.
	// The account is controlled by the HP cluster in a decentralized manner via a signer list (multi-sig). 
	get dAppXrplAccountClassicAddress() {
		return this.dAppAccountClassicAddress;
	}
	get dAppXrplAccountSeed() {
		return this.dAppAccountSeed;
	}
	get dAppXrplAccountSequence() {
		return this.dAppAccountSeq;
	}

	// The HP dApp's signer list data.
	get dAppXrplsigners() {
		return this.signers;
	}
	get dAppXrplsignersLocation() {
		return this.signersLocation;
	}
	get dAppXrplsignersWeight() {
		return this.signersWeight;
	}
	get dAppXrplSignerListQuorum() {
		return this.signerlistQuorum;
	}
	get dAppXrplTransactions() {
		return this.transactions;
	}

	/**
	 * Internal use to delay code execution.
	 * 
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

		fs.appendFileSync("../gen-logs.txt", message);
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
	 * Query the XRP Ledger for data.
	 * 
	 * @async
	 * @param {object} request - The request
	 * @returns {Promise<object>} The request's result
	 */
	async #requestRippled(request) {
		try {
			this.#Log("INF", `${this.#requestRippled.name}: Requesting ${request.command} data from ${this.client.url}`);
			return await this.client.request(request);
		} catch (err) {
			return err;
		}
	}

	/**
	 * Generate a unique keypair for the HotPocket node.
	 */
	#generateSignerCredentials() {
		const keyFile = `../${this.ctx.publicKey}-signerKey.json`;

		if (!fs.existsSync(keyFile)) {
			var scheme = this.dkmConfig.signer.scheme;

			if (scheme.length > 0) {
				var index = Math.abs(Math.floor(Math.random() * scheme.length));
				scheme = scheme[index];
			} else {
				throw new Error(`${this.#generateSignerCredentials.name}: config.signer.scheme[] is not defined in config.json file`);
			}

			const signerKeypair = this.xrpl.Wallet.generate(scheme);
		
			fs.writeFileSync(keyFile, JSON.stringify({
				"seed": signerKeypair.seed,
				"classicAddress": signerKeypair.classicAddress
			}));
		}
	}

	/**
	 * Construct an *unfilled* Payment transaction with a memo field attached.
	 * 
	 * DKM leverages the memo field on an XRPL transaction so that the dApp could transmit data temporarily to its users on the XRPL.
	 * 
	 * @param {string} destination - The recipient's XRPL account address
	 * @param {string} amount - (Optional) The amount of XRP that will be sent. Default value: 1 drop.
	 * @param {object} memo - The memo field { type, data, format }
	 * @returns {object} The transaction with a memo field attached
	 */
	packageTxAPI({destination, amount, memo}) {
		if (typeof amount !== "undefined" && typeof amount !== "string") {
			throw new Error(`${this.packageTxAPI.name}: amount field is a ${typeof amount} instead of a string`);
		}

		return {
			TransactionType: "Payment",
			Account: this.dAppAccountClassicAddress,
			Destination: destination,
			Amount: amount ?? 1,
			Memos: [{
				Memo: {
					MemoType: Buffer.from(memo.type, "utf8").toString("hex"),
					MemoData: Buffer.from(memo.data, "utf8").toString("hex"),
					MemoFormat: Buffer.from(memo.format, "utf8").toString("hex") // Common ones are "application/json" or "text/csv"
				}
			}],
			NetworkID: this.networkID
		};
	}

	/**
	 * Autofill an unfilled XRPL transaction.
	 * 
	 * @async
	 * @param {object} tx - The constructed transaction
	 * @param {boolean} multisig - The transaction's type (single signature or multi signature)
	 * @param {number} fee - The fee set for each signer
	 * @returns {Promise<object>} The autofilled transaction
	 */
	async autofillTx({tx, multisig, fee}) {
		this.#Log("INF", `${this.autofillTx.name}: Autofilling ${tx.TransactionType} transaction`);

		if (multisig) {
			if (this.signerlistCount === 0) {
				const signerlist = await this.getSignerList();
				if (!signerlist.SignerListCount === 0) {
					throw new Error(`${this.autofillTx.name}: signerlist does not exist`);
				}
			}
			if (!this.signerlistQuorum > 0) {
				throw new Error(`${this.autofillTx.name}: signerlistQuorum is less than 0, value: ${this.signerlistQuorum}`);
			}

			if (typeof tx.Fee === "number") {
				throw new Error(`${this.autofillTx.name}: tx.Fee is a number instead of a string`);
			}
			if (typeof tx.Fee === "undefined") {
				tx.Fee = ((this.signerlistQuorum + 1) * (fee ?? this.dkmConfig.signer.default_fee_per_signer)).toString();
			}
						
			try {
				var preparedTx = await this.client.autofill(tx, this.signerlistQuorum);
			} catch (err) {
				return err;
			}
		} else {
			var preparedTx = await this.client.autofill(tx);
		}

		return preparedTx;
	}

	/**
	 * Submit a signed transaction to a rippled node (XRPLP powered network).
	 * 
	 * @async
	 * @param {string} tx - The signed transaction blob
	 * @returns {Promise<object>} The transaction's result
	 */
	async submitTx(tx) {
		// Inputted transaction must be a signedTxBlob (Signed-Transaction-Object.tx_blob)
		if (typeof tx === "number" || tx === undefined) {
			throw new Error(`${this.submitTx.name}: No signed transaction blob was provided`);
		} else {
			var tt = this.xrpl.decode(tx).TransactionType;
		}

		try {
			this.#Log("INF", `${this.submitTx.name}: Submitting ${tt} transaction to rippled node`);
			return await this.client.submit(tx);
		} catch (err) {
			throw new Error(`${this.submitTx.name}: Failed submitting ${tt} transaction to rippled node. Error: ${err}`);
		}
	}

	/**
	 * Submit a signed transaction to a rippled node.
	 * 
	 * @async
	 * @param {string} tx - The signed transaction blob
	 * @returns {Promise<object>} The transaction's result
	 */
	async submitTxAndWait(tx) {
		// Inputted transaction must be a signedTxBlob (Signed-Transaction-Object.tx_blob)
		if (typeof tx === "number" || tx === undefined) {
			throw new Error(`${this.submitTxAndWait.name}: No signed transaction blob was provided`);
		} else {
			var tt = this.xrpl.decode(tx).TransactionType;
		}

		try {
			this.#Log("INF", `${this.submitTxAndWait.name}: Submitting ${tt} transaction to rippled node`);
			return await this.client.submitAndWait(tx);
		} catch (err) {
			throw new Error(`${this.submitTxAndWait.name}: Error submitting ${tt} transaction to rippled node. Error: ${err}`);
		}
	}
	/**
	 * Get the dApp's XRPL account signer list.
	 * 
	 * By default, `getSignerList()` will request the dApp's signer list but in the case that the `address` parameter is filled, it'll search for that XRPL account's signer list instead.
	 * 
	 * @async
	 * @param {string} address - (Optional) The account to look up
	 * @returns {Promise<object>} The request's result
	 */
	async getSignerList(address) {
		const request = await this.#requestRippled({
			"command": "account_objects",
			"account": address ?? this.dAppAccountClassicAddress,
			"ledger_index": "validated",
			"type": "signer_list"
		});

		if (request.hasOwnProperty("result")) {
			for (let i = 0; i < request.result.account_objects.length; i++) {
				if (request.result.account_objects[i].hasOwnProperty("SignerEntries")) {
					const signerlist = request.result.account_objects[i].SignerEntries;

					const dAppSigners = [],
						signersWeight = [],
						signersLocation = [];
	
					signerlist.forEach(signer => {
						dAppSigners.push(signer.SignerEntry.Account),
						signersLocation.push({
							xrpl_signing_key: signer.SignerEntry.Account,
							hp_public_key: signer.SignerEntry.WalletLocator
						}),
						signersWeight.push({
							account: signer.SignerEntry.Account,
							weight: signer.SignerEntry.SignerWeight
						});
					});
			
					this.signerlistCount = 1,
					this.signers = dAppSigners,
					this.signersLocation = signersLocation,
					this.signersWeight = signersWeight,
					this.signerlistQuorum = request.result.account_objects[0].SignerQuorum;

					return {
						SignerListCount: this.signerlistCount,
						Signers: this.signers,
						SignersWeight: this.signersWeight,
						SignerlistQuorum: this.signerlistQuorum
					};
				}
			}
		}

		this.signerlistCount = 0,
		this.signers = [],
		this.signersLocation = [],
		this.signersWeight = [],
		this.signerlistQuorum = 0;

		return {
			SignerListCount: this.signerlistCount,
			Signers: this.signers,
			SignersWeight: this.signersWeight,
			SignerlistQuorum: this.signerlistQuorum
		};
	}
 
	/**
	 * Sign an XRPL transaction with all the participating signers' signature.
	 * 
	 * All active participating signers will sign the transaction and distribute their signatures via NPL.
	 * 
	 * @async
	 * @param {object} tx - The transaction
	 * @returns {Promise<object>} The multi-signed transaction
	 */
	async signTx(tx) {
		const signerWallet = this.xrpl.Wallet.fromSecret(this.hpSignerSeed);

		// Signers that are apart of the dApp's signer list get to be apart of the multisig transaction, other signer's tx blob are ignored
		if (this.signers.includes(signerWallet.classicAddress)) {		
			const signedTxBlob = signerWallet.sign(tx, true).tx_blob;

			this.#Log("INF", `${this.signTx.name}: Multi-signing ${tx.TransactionType} transaction`);

			// Hash the unsigned tx's object as a checksum for the NPL roundname
			const roundName = crypto.createHash("sha256").update(JSON.stringify(tx)).digest("hex").toUpperCase();

			const signatures = await this.npl.performNplRound({
				roundName: `signature-collection-${roundName}`,
				content: JSON.stringify({
					account: signerWallet.classicAddress,
					tx: signedTxBlob
				}),
				desiredCount: this.signerlistQuorum,
				timeout: this.dkmConfig.NPL_round_timeout["signing"]
			});
			
			const validSignatures = [];
			var collectedQuorum = 0;

			signatures.record.forEach(packet => {
				const signature = JSON.parse(packet.content);
				// Check if we have enough signers && check if the signature's signer key is on the signer list
				if (collectedQuorum < this.signerlistQuorum && this.signers.includes(signature.account)) {
					const verification = VerifySignature(signature.tx, signature.account);
					if (verification.signedBy === signature.account && verification.signatureValid && verification.signatureMultiSign) {
						validSignatures.push(signature.tx),
						collectedQuorum += this.signersWeight.find(({ account }) => account === signature.account).weight;
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
						throw new Error(`${this.signTx.name}: Signer ${signature.account} did not provide a valid signature. Reason: ${reason}`);
					}
				}
			});

			if (validSignatures.length > 0) {
				return this.xrpl.multisign(validSignatures);
			} else {
				return undefined;
			}
		} else {
			return undefined;
		}
	}

	/**
	 * Construct a Signer List for the dApp's account.
	 * 
	 * @async
	 * @param {array<object>} signers - The dApp's SignerList {xrpl_signing_key: string, hp_public_key: string} (HP node's public key, signer's address)
	 * @param {number} fee - The fee for each participating signer or the fee for the transaction during setup
	 * @returns {Promise<object>} The transaction's result
	 */
	async setSignerList({signers, fee}) {
		if (typeof signers === "undefined") {
			throw new Error(`${this.setSignerList.name}: proposed signer list has 0 signers`);
		}
		if (signers.length > 32) {
			throw new Error(`${this.setSignerList.name}: proposed signer list has over 32 signers. The max amount of signers on a signer list is 32`);
		}

		const dAppWallet = this.xrpl.Wallet.fromSecret(this.dAppAccountSeed);

		var signerKeys = [];
		signers.forEach(signer => {
			signerKeys.push(signer.xrpl_signing_key);
		});

		// the default sort order is according to string Unicode code points
		signerKeys.sort();

		var sortedSigners = [];
		// if there are no duplicate values (keys), we simply copy signerKeys.
		if ((new Set(signerKeys)).size !== signerKeys.length) {
			sortedSigners = signerKeys;
		} else {
			// filter duplicate values :p
			signerKeys.forEach(xrpl_signing_key => {
				signers.forEach(signer => {
					if (signer.xrpl_signing_key === xrpl_signing_key) sortedSigners.push(signer);
					signers = signers.filter((signer) => signer.xrpl_signing_key !== xrpl_signing_key);
				});
			});	
		}

		// regex for SHA256 hash
		const regexExp = /^[a-f0-9]{64}$/gi;
		const newSignerList = [];
		sortedSigners.forEach(signer => {
			// WalletLocator field is capped @ 256 bit or 32 byte
			if (regexExp.test(signer.hp_public_key)) {
				var walletLocatorHash = signer.hp_public_key;
			} else {
				var walletLocatorHash = crypto.createHash("sha256").update(signer.hp_public_key).digest("hex").toUpperCase();
			}

			newSignerList.push({
				"SignerEntry": {
					"Account": signer.xrpl_signing_key,
					"SignerWeight": 1,
					"WalletLocator": walletLocatorHash
				}
			});
		});

		if (this.signerlistCount === 0) {
			var SetSignerListTx = await this.autofillTx({
				tx: {
					TransactionType: "SignerListSet",
					Account: dAppWallet.classicAddress,
					Fee: fee,
					SignerEntries: newSignerList,
					SignerQuorum: Math.round(newSignerList.length * this.dkmConfig.account.signerlist_quorum),
					Memos: [{
						Memo: {
							MemoType: Buffer.from("Evernode", "utf8").toString("hex"),
							MemoData: Buffer.from("DKM: HotPocket dApp's SignerList", "utf8").toString("hex"),
							MemoFormat: Buffer.from("text/plain", "utf8").toString("hex")
						}
					}],
					NetworkID: this.networkID
				},
				multisig: false
			});

			var SetSignerListTxSigned = dAppWallet.sign(SetSignerListTx).tx_blob;
		} else {
			var SetSignerListTx = await this.autofillTx({
				tx: {
					TransactionType: "SignerListSet",
					Account: dAppWallet.classicAddress,
					SignerEntries: newSignerList,
					SignerQuorum: Math.round(newSignerList.length * this.dkmConfig.account.signerlist_quorum),
					Memos: [{
						Memo: {
							MemoType: Buffer.from("Evernode", "utf8").toString("hex"),
							MemoData: Buffer.from("DKM: HotPocket dApp's SignerList", "utf8").toString("hex"),
							MemoFormat: Buffer.from("text/plain", "utf8").toString("hex")
						}
					}],
					NetworkID: this.networkID
				},
				multisig: true,
				fee: fee,
			});

			var SetSignerListTxSigned = await this.signTx(SetSignerListTx);
		}

		const submittedTx = await this.submitTx(SetSignerListTxSigned);

		var retries = 0;
		while (retries < 2) {
			await this.#Delay(4000);

			await this.getSignerList();

			if (this.signerlistCount === 1) {
				return {
					Result: "success",
					TransactionResult: submittedTx
				};
			} else {
				if (retries === 1) { 
					return {
						Result: "failed",
						TransactionResult: submittedTx
					};
				} else {
					retries++;
				}
			}
		}
	}

	/**
	 * Disable the dApp's XRPL account Master Key.
	 * 
	 * @async
	 * @returns {Promise<object>} The transaction's result
	 */
	async #disableMasterKey() {
		const dAppWallet = this.xrpl.Wallet.fromSecret(this.dAppAccountSeed);

		const DisableMasterKeyTx = await this.autofillTx({
			tx: {
				TransactionType: "AccountSet",
				Account: dAppWallet.classicAddress,
				SetFlag: this.xrpl.AccountSetAsfFlags.asfDisableMaster,
				Memos: [{
					Memo:{
						MemoType: Buffer.from("Evernode", "utf8").toString("hex"),
						MemoData: Buffer.from("DKM: This XRPL account is now fully controlled by its signers", "utf8").toString("hex"),
						MemoFormat: Buffer.from("text/plain", "utf8").toString("hex")
					}
				}],
				NetworkID: this.networkID
			},
			multisig: false,
		});

		const DisableMasterKeyTxSigned = dAppWallet.sign(DisableMasterKeyTx).tx_blob;

		const submittedTx = await this.submitTx(DisableMasterKeyTxSigned);

		var retries = 0;
		while (retries < 2) {
			await this.#Delay(4000);

			const lsfDisableMaster = await this.#requestRippled({
				"command": "account_info",
				"account": dAppWallet.classicAddress,
				"ledger_index": "validated"
			});

			if ((0x00100000 & lsfDisableMaster.result.account_data.Flags)) {
				return {
					Result: "success",
					TransactionResult: submittedTx
				};
			} else {
				if (retries === 1) { 
					return {
						Result: "failed",
						TransactionResult: submittedTx
					};
				} else {
					retries++;
				}
			}
		}
	}

	/**
	 * Setup the HP dApp's XRPL account, this account will own a SignerList ledger object consisting of all the HP nodes' signer key and its account's master key will be disabled
	 * 
	 * @returns {Promise<object>} The transactions' result
	 */
	async #setupDAppAccount() {
		// Do not use getTransactions(), it doesn't work until we've created the '/DKM/dApp/dApp-xrplAccount.json' file
		// Past transactions before this step (#setupDAppAccount()) will be ignored, they will not be processed as we're setting the dApp's XRPL account up

		// SignerListSet and MasterKey is set to "failed" as default value. If not changed, the tx failed.
		var SignerListSet = "failed",
			MasterKeyDisabled = "failed",
			hpSignersRecord = undefined;

		// 2 tries
		var retries = 0;
		while (retries < 2) {
			if (retries === 0) {
				var hpClusterSignerAddresses = await this.npl.performNplRound({
					roundName:`signerlist-setup-${this.dAppAccountClassicAddress}-${retries}`,
					content: this.hpSignerAddress,
					desiredCount: this.ctx.unl.count(),
					timeout: this.dkmConfig.NPL_round_timeout["signerlist_setup"]
				});

				hpSignersRecord = hpClusterSignerAddresses.record;
			} else {
				// hp publickey address
				var unfilledHpSignersRecord = [];
				if (hpSignersRecord.responseCount > 0) {
					hpSignersRecord.record.forEach(packet => {
						unfilledHpSignersRecord.push(packet.content);
					});

					var hpClusterSignerAddresses = await this.npl.performNplRound({
						roundName:`signerlist-setup-${this.dAppAccountClassicAddress}-${retries}`,
						content: hpSignersRecord,
						desiredCount: this.ctx.unl.count(),
						timeout: this.dkmConfig.NPL_round_timeout["signerlist_setup"] / 2
					});

					hpClusterSignerAddresses.record.forEach(packet => {
						if (hpSignersRecord.length < this.ctx.unl.count()) {
							// go through the packets provided by the `publickey` hp node
							packet.content.forEach(packet => {
								if (hpSignersRecord.length < this.ctx.unl.count() && !(packet.content in unfilledHpSignersRecord)) {
									hpSignersRecord.push(packet);	
								}
							});
						}
					});
				}

				if (hpSignersRecord.length !== this.ctx.unl.count()) this.#Log("INF", `${this.#setupDAppAccount.name}: Failed to collect enough XRPL signer keys to construct XRPL signerlist`);
			}

			var signerlist = [];
			if (hpSignersRecord.length === this.ctx.unl.count()) {
				hpSignersRecord.forEach(record => {
					const signerRecord = {
						"xrpl_signing_key": record.content,
						"hp_public_key": record.node
					};
					if (!signerlist.includes(signerRecord)) signerlist.push(signerRecord);
				});
			}

			if (signerlist.length === this.ctx.unl.count()) {
				var signerListSetTx = await this.setSignerList({
					signers: signerlist
				});

				if (signerListSetTx.Result === "success") {
					retries = 2,
					SignerListSet = "success";
				} else {
					retries += 1;
				}	

				if (signerListSetTx.hasOwnProperty("TransactionResult")) var signerlistsetTR = signerListSetTx.TransactionResult;
			} else {
				retries++;
			}
		}
		
		// 2 tries
		// even if this node failed to collect enough NPL messages to setup the dApp's SignerList,
		// it will attempt to contribute by disabling the master key;
		// if it is successful, it will indicate that the dApp's XRPL account has been setup.
		while (retries < 4) {
			var disableMasterKeyTx = await this.#disableMasterKey();
	
			if (disableMasterKeyTx.Result === "success") {
				retries = 4;
				MasterKeyDisabled = "success";
			} else {
				retries++;
			}
		}

		if (MasterKeyDisabled === "success") this.#Log("INF", `${this.#setupDAppAccount.name}: dApp XRPL account setup successful`);

		return {
			result: MasterKeyDisabled, // if MasterKey was successful, that means the dApp xrpl account is setup (w/ signerlist)
			Transactions: {
				SignerListSet: {
					"Result": SignerListSet,
					"TransactionResult": signerlistsetTR
				},
				DisableMasterKey: {
					"Result": MasterKeyDisabled,
					"TransactionResult": disableMasterKeyTx.TransactionResult
				}
			}
		};
	}

	/**
	 * Retrieve a new set of outgoing/incoming transactions that have not been acknowledged or 'processed'.
	 * 
	 * @async
	 * @returns {Promise<array>} The transactions that have not been acknowledged 
	 */	
	async getTransactions() {
		const request = await this.#requestRippled({
			command: "account_tx",
			account: this.dAppAccountClassicAddress,
			ledger_index_min: this.dAppAccountSeq + 1,
			ledger_index_max: -1,
			binary: false,
			forward: true
		});
		
		if (request.hasOwnProperty("result") ) {
			if (request.result.transactions.length > 0) {
				this.dAppAccountSeq = request.result.transactions[request.result.transactions.length - 1].tx.ledger_index;
				const dAppXrplAccountCreds = {
					"classicAddress": this.dAppAccountClassicAddress,
					"seed": this.dAppAccountSeed,
					"sequence": this.dAppAccountSeq
				};
				fs.writeFileSync(__dirname+"/DKM/dApp/dApp-xrplAccount.json", JSON.stringify(dAppXrplAccountCreds));

				this.transactions = request.result.transactions;
				return this.transactions;
			} else {
				this.transactions = [];
				return this.transactions;
			}
		}
	}


	/**
	 * Check up on the cluster's status, particularly signers that are on the signer list.
	 * 
	 * @async
	 * @returns {Promise<object>} The status of the cluster's signers (limited to the node's UNL) 
	 */
	async checkupClusterSigners() {
		if (!this.signerlistCount) {
			throw new Error(`${this.checkupClusterSigners.name}: signerlist does not exist`);
		}

		const hpClusterSignerAddresses = await this.npl.performNplRound({
			roundName: `signer-status-checkup-${this.dAppAccountClassicAddress}`,
			content: this.hpSignerAddress,
			desiredCount: this.ctx.unl.count(),
			timeout: this.dkmConfig.NPL_round_timeout["signer_status_checkup"]
		});

		// this is a mess. if you have a better alternative, please suggest one !
		var onlineSigners = [];
		if (hpClusterSignerAddresses.responseCount > 0) {
			hpClusterSignerAddresses.record.forEach(record => {
				const signerRecord = {
					"xrpl_signing_key": record.content,
					"hp_public_key": crypto.createHash("sha256").update(record.node).digest("hex").toUpperCase()
				};

				if (this.signersLocation.some(record => record.xrpl_signing_key === signerRecord.xrpl_signing_key)) {
					onlineSigners.push(signerRecord);
				}
			});

			var offlineSigners = [];
			this.signersLocation.forEach(signer => {
				if (!onlineSigners.some(record => record.xrpl_signing_key === signer.xrpl_signing_key)) {
					offlineSigners.push(signer);
				}
			});
		}

		return {
			OnlineSigners: onlineSigners,
			OfflineSigners: offlineSigners,
			Record: hpClusterSignerAddresses.record,
			Timeout: hpClusterSignerAddresses.timeout,
			TimeTaken: hpClusterSignerAddresses.timeTaken
		};
	}

	/**
	 * Add a set of signer keys to the dApp's XRPL account SignerList.
	 * 
	 * @async
     * @param {array<string>} signers - Signer keys to add to the signer list { xrpl_signing_key: string, hp_public_key: string }
	 * @param {number} fee - The fee per each participating signer
	 * @returns {Promise<object>} The transaction's result
	 */
	async addSignerKey({signers, fee}) {			
		if (!this.signerlistCount) {
			throw new Error(`${this.addSignerKey.name}: signerlist does not exist`);
		}
		if (this.signers.length + signers.length > 32) {
			throw new Error(`${this.addSignerKey.name}: cannot append new signer keys as it exceeds the 32 signer slot limit on the XRP Ledger`);	
		}

		signers.forEach(key => {
			if (!this.xrpl.isValidAddress(key.xrpl_signing_key)) {
				throw new Error(`${this.addSignerKey.name}: "${key}" is not a valid XRPL address, cannot append to dApp's signerlist`);
			}
		});

		const newSignerList = [];
		// temporarily populate newSignerList w/ the current signerlist
		this.signersLocation.forEach(key => {
			newSignerList.push(key);
		}),
		signers.forEach(signer0 => {
			newSignerList.forEach(signer1 => {
				if (signer0.xrpl_signing_key === signer1.xrpl_signing_key) {
					signers = signers.filter((signer0) => signer0.xrpl_signing_key !== signer1.xrpl_signing_key);
					duplicate = true;
				}
			});
		});

		const differentKeys = compare.difference(newSignerList, this.signersLocation);

		if (differentKeys.length > 0) {
			return await this.setSignerList({
				signers: newSignerList,
				fee: fee
			});
		}
	}


	/**
	 * Remove signer keys from the dApp's XRPL account SignerList.
	 * 
	 * @async
	 * @param {array<string>} signers - Signer keys to remove from the signer list
	 * @param {number} fee - The fee per each participating signer
	 * @returns {Promise<object>} The transaction's result
	 */
	async removeSignerKey({signers, fee}) {
		if (!this.signerlistCount) {
			throw new Error(`${this.addSignerKey.name}: signerlist does not exist`);
		}
		if (this.signers.length - signers.length === 0) {
			throw new Error(`${this.addSignerKey.name}: cannot remove given signer keys as it will result in the dApp's signer list having 0 signers`);	
		}

		var newSigners = this.signersLocation;
		// filter out the signer keys that are instructed to be removed
		signers.forEach(key => {
			newSigners.forEach(signer => {
				if (signer.xrpl_signing_key === key) {
					newSigners = newSigners.filter((signer) => signer.xrpl_signing_key !== key);
				}
			});
		});

		if (newSigners.length < this.signersLocation.length) {
			return await this.setSignerList({
				signers: newSigners,
				fee: fee
			});
		}
	}

	async init() {
		this.#generateSignerCredentials();

		const hpSignerCredential = JSON.parse(fs.readFileSync(`../${this.ctx.publicKey}-signerKey.json`).toString());
		this.hpSignerSeed = hpSignerCredential.seed;
		this.hpSignerAddress = hpSignerCredential.classicAddress;
		
		if (this.ctx.lclSeqNo > 1 ) {
			const dAppXrplAccount = JSON.parse(fs.readFileSync(__dirname+"/DKM/dApp/dApp-xrplAccount.json").toString());
			this.dAppAccountClassicAddress = dAppXrplAccount.classicAddress,
			this.dAppAccountSeed = dAppXrplAccount.seed,
			this.dAppAccountSeq = dAppXrplAccount.sequence;
		} else {
			const dAppWallet = this.xrpl.Wallet.fromSecret(this.dkmConfig.account.seed);
			this.dAppAccountSeed = dAppWallet.seed,
			this.dAppAccountClassicAddress = dAppWallet.classicAddress;
		}

		await this.getSignerList();

		if (this.signerlistCount === 0) {
			try {
				var setupResult = await this.#setupDAppAccount();
			} catch (err) {
				var setupResult = {
					result: "failed"
				};
				throw new Error(`${this.init.name}: ${err}`);
			}
		} else {
			var setupResult = {
				result: "successful",
			};
		}
		await this.getTransactions();
		return setupResult;
	}
}

module.exports = { 
	getNetwork,
	Manager
};

// e3c2064ece7e8bbbebb2a06be96607bb560a2ab8314e3ae64a43aaf3d2954830c760ad7ed923ca2ce3303a1bbc9a2e4d26bf177bae5416af0cc157a60dcc82e4