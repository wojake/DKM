const fs = require('fs');
const crypto = require('crypto');
const xrpl = require("xrpl");
const compare = require('underscore');
const EventEmitter = require("events");
const VerifySignature = require("verify-xrpl-signature").verifySignature;

/**
 * The 'Decentralized Key Management' framework for HotPocket applications.
 * @author Wo Jake
 * @version 0.1.0
 * @description A NodeJS framework for HotPocket clusters to manage their dApp's signer keys in a decentralized manner.
 * 
 * See https://github.com/wojake/DKM to learn more and contribute to the codebase, any type of contribution is truly appreciated.
 */

/** @type {object} - EventEmitter Object */
const datasetEmitter = new EventEmitter(); 

/**
 * Get a node's URL
 * 
 * @param {string} network - The network (testnet, devnet, hooks)
 * @param {number} index - The index number, if it isn't provided: a random node's URL will be chosen (recommended)
 * @returns {string} The node's URL
 */
function GetClient(network, index) {
	const ClientURL = JSON.parse(fs.readFileSync(__dirname+'/DKM/setup/bootstrap_state.json').toString());
	if (index === undefined) {var index = Math.abs(Math.floor(Math.random() * ClientURL.node[network].length - 1)); }
	const node_URL = ClientURL.node[network][index];
	return node_URL;
}

/**
 * Get the node's signer key. If the node is a fresh instance, the node will generate and store its signer credentials *locally*
 * 
 * @param {object} ctx - The contract's context
 * @returns {string} The signer's credentials (json format [seed, address])
 */
function GetSignerCredentials(ctx) {
	const KeyFile = `../${ctx.publicKey}-signerKey.json`;

	if (!fs.existsSync(KeyFile)) {
        const node_wallet = xrpl.Wallet.generate(),
			  file_data = {
				"seed": node_wallet.seed,
            	"address": node_wallet.classicAddress
			  };

        fs.writeFileSync(path=KeyFile, data=JSON.stringify(file_data));
    }

	const signer_credentials = JSON.parse(fs.readFileSync(KeyFile).toString());
	return signer_credentials;
}

/**
 * Get the dApp's XRPL account
 * 
 * @returns {string} The dApp's account credentials (json format: [seed, address, sequence])
 */
function GetAccountCredentials() {
	const account_credentials = JSON.parse(fs.readFileSync(__dirname+"/DKM/dApp/XRPL_account.json").toString());
	return account_credentials;
}

/**
 * Get the timeout value for a NPL round
 * 
 * @param {string} type - The NPL Timeout variable
 * @returns {number} The timeout value
 */
function GetNPLTimeoutValue(type) {
	return JSON.parse(fs.readFileSync(__dirname+'/DKM/setup/bootstrap_state.json').toString()).config.NPL_round_timeout[type];
}

/**
 * Log messages to DKM's log files, used internally.
 * 
 * @param {string} type - The log message's type (FTL: Fatal, ERR: Error, WRN: Warn, INF: Info, DBG: Debug) 
 * @param {string} message - The log message
 */
function Log(type, message) {
	message = `DKM ${type}: ${message}`;
	console.log(message);

	fs.appendFileSync(path=`../GENERAL-logs.txt`, data=message);
	if (type === "FTL") { fs.appendFileSync(path=`../${type}-logs.txt`, data=message); } // FATAL
	if (type === "ERR") { fs.appendFileSync(path=`../${type}-logs.txt`, data=message); } // ERROR
	if (type === "WRN") { fs.appendFileSync(path=`../${type}-logs.txt`, data=message); } // WARN
	if (type === "INF") { fs.appendFileSync(path=`../${type}-logs.txt`, data=message); } // INFO
	if (type === "DBG") { fs.appendFileSync(path=`../${type}-logs.txt`, data=message); } // DEBUG
}

/**
 * `GetVoteCount()` is used in {@link ClusterKeyCheckup()} to return addresses that are present on at least (quorum*100) of all proposals (votes).
 * 
 * For example, if address `rXYZ` is present on 3 out of 4 proposals (votes) and the set threshold is 0.7 (70%),
 * `rXYZ` passed the set threshold and would be returned by the function
 * 
 * @param {Array<string>} votes - The nodes' proposal during a NPL round
 * @param {number} unl_size - The UNL size used to compare and filter votes
 * @returns {Array<string>} Array of keys that is present on at least`(votes.length * quorum) proposals (votes)`
 */
function GetVoteCount({votes, unl_size}) {
	// If the amount of proposals (votes) is less than (unl_size * quorum), we return an empty array since there isn't enough proposal
    // We do this to ensure that at least (quorum*100) of the nodes in the UNL has participated in consensus since we need healthy network consensus/participation

	const quorum = JSON.parse(fs.readFileSync(__dirname+'/DKM/setup/bootstrap_state.json').toString()).config.quorum.voting_quorum;

	if (votes.length >= Math.ceil(unl_size * quorum)) {
		const key_votes = {};
		// Go through each proposal
		votes.forEach(proposal => {
			const indexed_keys = [];
			proposal.forEach(key => {
				if (!indexed_keys.includes(key)) {
					if (key in key_votes) {
						key_votes[key] += 1;
					} else {
						key_votes[key] = 1;
					}
					indexed_keys.push(key);
				}
			});
		});

		const valid_key = [];
        // For each key that has a vote count, we check whether its vote count has passed the set quorum
		Object.keys(key_votes).forEach(key => {
			if (key_votes[key] >= Math.ceil(votes.length * quorum)) {
				valid_key.push(key);
			}
		});

		return valid_key;
	} else {
		Log(type="INF", message="GetVoteCount(): Low proposals, unable to return keys with enough votes");
		return [];
	}
}

/**
 * Construct a Payment transaction with a MEMO field attached, DKM leverages the MEMO field to transmit data to its users
 * 
 * 
 * @param {string} account - The dApp's XRPL account address
 * @param {string} destination - The user's XRPL account address
 * @param {string} amount - The amount of XRP that will be sent
 * @param {string} signer_list_quorum - The quorum needed to pass a valid transaction, 1 voting weight (quorum) = 1 signer
 * @param {string} MEMO - The MEMO field { memo_type, memo_data, memo_format }
 * @returns {object} The transaction with a MEMO field attached
 */
 function PackageTxAPI({account, destination, amount, signer_list_quorum, MEMO}) {
	if (amount === undefined || typeof amount != "string" || typeof Number(amount) != "number") {
		amount = "1"; // default amount if set to 1 drop or 0.000001 XRP
	}

	return {
        TransactionType: "Payment",
		Account: account,
		Destination: destination,
		Amount: amount,
		Fee: ((signer_list_quorum + 1) * 11).toString(),
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
 * Autofill an XRP Ledger transaction
 * 
 * @async
 * @param {object} tx - The constructed transaction with unfilled common fields
 * @param {number} signer_count - The minimum amount of signers needed to sign the transaction
 * @param {number} fee - The fee for each signer
 * @param {object} client - Client object
 * @returns {Promise<object>} The autofilled transaction, ready for signing and submission
 */
async function AutofillTx({tx, signer_count, fee, client}) {
	try {
		if (signer_count >= 1) {
			if (tx.Fee === undefined) {
				if (fee === undefined) {
					fee = 11;
				}
				tx.Fee = ((signer_count + 1) * fee).toString();
			}
			var prepared_tx = await client.autofill(tx, signer_count);
		} else {
			var prepared_tx = await client.autofill(tx);
		}
	} catch (err) {
		return err;
	}
	return prepared_tx;
}

/**
 * Submit a signed transaction to a rippled node (XRPLP powered network)
 * 
 * @async
 * @param {string} tx - The signed transaction blob
 * @param {object} client - Client object
 */
async function SubmitTx({tx, client}) {
	// Inputted transaction must be a signed_tx_blob (Signed-Transaction-Object.tx_blob)
	if (typeof tx == "number") {
		Log(type="INF", message="SubmitTx(): No signed transaction blob was provided");
	} else {
		try {
			await client.submit(tx);
		} catch (err) {
			Log(type="ERR", message=`SubmitTx(): Error submitting transaction to rippled node. Error: ${err}`);
		}
	}
}

/**
 * Query the XRP Ledger for data
 * 
 * @async
 * @param {object} request - The request
 * @param {object} client - Client object
 * @returns {Promise<object>} rippled node's response to the request
 */
async function RequestRippled({request, client}) {
	try {
	  	var response = await client.request(request);
	} catch (err) {
		return err;
	}
    return response;
}

/**
 * Get the dApp's XRPL account SignerList
 * 
 * @async
 * @param {string} account_address - The dApp's account address
 * @param {string} client - Client object
 * @returns {object} { signers: Array[], signer_weight: Array[], quorum: number }
 */
async function GetSignerList({account_address, client}) {
	const dApp_signer_list = await RequestRippled({
		request: {
			"command": "account_objects",
			"account": account_address,
			"ledger_index": "validated",
			"type": "signer_list"
		},
		client: client
	});

	try {
		const signer_list = dApp_signer_list.result.account_objects[0].SignerEntries;
		const dApp_signers = [],
			signer_weight = [];
		signer_list.forEach(signer => {
			dApp_signers.push(signer.SignerEntry.Account);
			signer_weight.push({account: signer.SignerEntry.Account, weight: signer.SignerEntry.SignerWeight});
		});

		return {
			signers: dApp_signers,
			signer_weight: signer_weight,
			quorum: dApp_signer_list.result.account_objects[0].SignerQuorum
		};
	} catch(err) {
		// In some cases in Ledger #1, the dApp's XRPL account SignerList may be absent since we just sent the `SignerListSet` transactions a few seconds ago.
		// So we return an empty array. Please note that in Ledger #1, the service is not open for service as it's being setup. So this is tolerable, for now.
		Log(type="WRN", message=`GetSignerList(): dApp's account ${account_address} does not have a SignerList`);
		return [];
	}
}

/**
 * Check for any unprocessed/queued transactions on the dApp's XRPL account, any transaction sent to/by the dApp's account will be processed
 * 
 * @async
 * @param {object} account_credentials - The dApp's XRPL account credentials (seed, address, sequence)
 * @param {object} client - Client object
 * @returns {Promise<string>} Array of 'unprocessed' transactions
 */
async function CheckTxPayment({account_credentials, client}) {
	const request = await RequestRippled({
		request: {
			command: 'account_tx',
			account: account_credentials.address,
			ledger_index_min: account_credentials.sequence+1,
			ledger_index_max: -1,
			binary: false,
			forward: true
		},
		client: client
	});

	if (request.result.transactions.length >= 1) {
		account_credentials.sequence = request.result.transactions[request.result.transactions.length-1].tx.ledger_index;
        fs.writeFileSync(path=__dirname+"/DKM/dApp/XRPL_account.json", data=JSON.stringify(account_credentials));
		return request.result.transactions;
	} else {
		return [];
	}
}

/**
 * Start listening to NPL messages.
 * If this is initialized, there is no need for the app to reinitiliaze it again outside of this function.
 * 
 * @param {object} ctx - The contract's context 
 * @param {boolean} debug - If this is true, we display nodes that are participating in NPL rounds on the terminal. You can use this for development/debugging purposes.
 */
function SetupNPL({ctx, debug}) {
	// NPL Rules on DKM:
    // 1. If a node has sent its response/message in a certain NPL round, it can't send more messages otherwise, the message would be ignored. 1 NPL Round = 1 message per node.
	// 2. Each NPL round could NOT share the same round name during a code execution to avoid collision, each NPL round should have its own unique round name. If the same round name is being used, node messages won't pass through the filter.
	
	// This is a filter. Any HotPocket node that has sent a particular message in a certain NPL Round can no longer send an additional message in the same NPL Round
	// Why? This is to safe guard against HotPocket accidently sending a message twice unintentionally, this is *very* unlikely to occur but we can't afford the consequances if such event occurs.
	
	const rounds = {};
	ctx.unl.onMessage((node, msg) => {
        const { roundName, data } = JSON.parse(msg.toString()); 
		if (!(roundName in rounds)) {
			rounds[roundName] = [node.publicKey];
			datasetEmitter.emit(roundName, data);
		} else {
			if (!(node in rounds[roundName])) {
				rounds[roundName].push(node.publicKey);
				datasetEmitter.emit(roundName, data);
			} else {
				// Very unlikely to occur, so we log
				Log(type="WRN", message=`NPL: Warning - ${node.publicKey} sent more than 1 message in a NPL round!`);
			}
		}

		if (debug) {
			// If you're developing/debugging something or just want to learn the in's and out's of DKM, you could set debug to true
			console.log("NPL: Rounds' participants -", rounds);
		}
	});
}

/**
 * Perform a NPL round on the HotPocket Consensus Engine
 * 
 * @async
 * @param {string} content - The content that the node wants to distribute to its peers, this field must be in the form of a string
 * @param {number} desired_count - The desired amount of responses that the NPL round needs
 * @param {object} ctx - The contract's context
 * @param {number} timeout - NPL round timeout
 * @param {boolean} strict - If strict is true, we need the *precise* number of responses before the timeout is reached. If not, any number of responses is fine
 * @returns {Promise<array>} NPL round result (responses from UNL peers). If this array contains 0 objects, it means that @param strict is true and we weren't able to meet threshold
 */
async function NPLResponse({content, desired_count, ctx, timeout, strict, debug}) {
	const NPL = (roundName, desired_count, timeout) => {
		return new Promise((resolve) => {
			const collected = [];

			const timer = setTimeout(() => {
				// Fire up the timeout if we didn't receive enough messages.
				if (debug === true) {
                    Log(type="INF", message=`NPL: TIMEOUT ROUND @ Round Name -> ${roundName} in Ledger ${ctx.lclSeqNo}`);
					console.log(`Content: ${collected}`);
                    console.log(`Messages received: ${collected.length}`);
                    console.log(`Desired msg count: ${desired_count}`);
                }
				if (collected.length < desired_count && strict === true) {
					resolve([]);
				} else if (collected.length < desired_count && strict === false) {
					resolve(collected);
				}
			}, timeout);
	
			datasetEmitter.on(roundName, (data) => {
				collected.push(data);
	
				// Resolve immediately if we have the required no. of messages.
				if (collected.length === desired_count) {
					clearTimeout(timer);
                    if (debug === true) {
    					Log(type="INF", message=`NPL: FULL ROUND @ Round Name -> ${roundName} in Ledger ${ctx.lclSeqNo}`);
						console.log(`Content: ${collected}`);
                    }
                    resolve(collected);
				}
			});
		});
	};

	const { roundName, data } = JSON.parse(content);
	await ctx.unl.send(content);
    return await NPL(roundName, desired_count, timeout);
}

/**
 * Construct a SignerList for the dApp's account
 * 
 * @async
 * @param {object} ctx - The contract's context
 * @param {string} account_seed - The dApp's XRPL account seed
 * @param {string} node_seed - The HotPocket node's XRPL account seed
 * @param {array<string>} new_dApp_signers - The dApp's new SignerList (this will be the new SignerList)
 * @param {string} client - Client object
 */
 async function SetSignerList({ctx, account_seed, new_dApp_signers, client}) {	
	const account_wallet = xrpl.Wallet.fromSecret(account_seed);

	if (new_dApp_signers.length >= 1) {
		if (new_dApp_signers.length >= 33) {
			// The max amount of signers on a SignerList is 32
			new_dApp_signers.length = 32;
		}

		const Signers = [];
		new_dApp_signers.forEach(key => {
			Signers.push({
				"SignerEntry": {
					"Account": key,
					"SignerWeight": 1
				}
			});
		});

		const signer_quorum = JSON.parse(fs.readFileSync(__dirname+'/DKM/setup/bootstrap_state.json').toString()).config.quorum.signer_quorum;

		const SetSignerList_tx = await AutofillTx({
			tx: {
				TransactionType: "SignerListSet",
				Account: account_wallet.classicAddress,
				SignerEntries: Signers,
				SignerQuorum: Math.round(Signers.length * signer_quorum),
				Memos: [{
					Memo: {
						MemoType: Buffer.from("Evernode", 'utf8').toString('hex'),
						MemoData: Buffer.from("DKM: HotPocket Cluster Setup", 'utf8').toString('hex'),
						MemoType: Buffer.from("text/plain", 'utf8').toString('hex')
				}
			}]
			},
			client: client
		});
		const SetSignerList_tx_signed = account_wallet.sign(SetSignerList_tx);

		await SubmitTx({
			tx: SetSignerList_tx_signed.tx_blob, 
			client: client
		});

		// We'll use this tx to disable the dApp's masterkey, this'll turn the HotPocket App's XRPL account into a decentralized account
		const DisableMasterKey_tx = await AutofillTx({
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
			client: client
		});
		const DisableMasterKey_tx_signed = account_wallet.sign(DisableMasterKey_tx);

		await SubmitTx({
			tx: DisableMasterKey_tx_signed.tx_blob,
			client: client
		});

		Log(type="INF", message="SetSignerList(): dApp's XRPL account is now controlled by its HotPocket nodes, the master key has been disabled");
	} else {
		Log(type="INF", message=`SetSignerList(): This node failed to receive all ${ctx.unl.count()} nodes' keys, it will not partake in setting up the dApp's XRPL Account @ ${account_wallet.classicAddress}...`);
	}
}

/**
 * Setup the dApp's XRPL account (setsignerlist and disable master key)
 * 
 * @async
 * @param {object} ctx - The contract's context 
 * @param {string} node_seed - The HotPocket node's XRPL account seed
 * @param {object} client - Client object
 */
 async function SetupAccount({ctx, node_address, client}) {
	// Setup dApp's XRPL account

    const bootstrap_state = JSON.parse(fs.readFileSync(__dirname+"/DKM/setup/bootstrap_state.json"));

	const dApp_account_seed = bootstrap_state.config.account_seed;
	const dApp_account_address = xrpl.Wallet.fromSecret(dApp_account_seed).classicAddress;

	const cluster_signer_keys = await NPLResponse({
		content: JSON.stringify({
			roundName: `node-key-setup-${dApp_account_address}`,
			data: node_address
		}),
		desired_count: ctx.unl.count(),
		ctx: ctx,
		timeout: GetNPLTimeoutValue(type="signerlist_setup"),
		strict: true
		// strict *must* be true, because if this node does not get *all* the nodes' signer address, it may submit a SignerListSet tx that isn't full
	});
	
	const request = await RequestRippled({
		request: {
			command: 'account_tx',
			account: dApp_account_address,
			ledger_index_min: -1,
			ledger_index_max: -1,
			binary: false,
			forward: true
		},
		client: client
	});

	// Past transactions during setup will be ignored, they will not be processed
    const account_creds = {
        seed: dApp_account_seed,
        address: dApp_account_address,
        sequence: request.result.transactions[0].tx.ledger_index
    };

    fs.writeFileSync(path=__dirname+"/DKM/dApp/XRPL_account.json", data=JSON.stringify(account_creds));

	await SetSignerList({
		ctx: ctx,
		account_seed: dApp_account_seed,
		new_dApp_signers: cluster_signer_keys,
		client: client
	});

	Log(type= "INF", message=`SetupAccount(): dApp's XRPL account is now setup @ ${dApp_account_address}`);
}

/**
 * Sign a XRPL transaction with all the participating signers' signature
 * 
 * All active participating signers will sign the transaction and distribute their signatures via NPL
 * 
 * @async
 * @param {object} ctx - The contract's context
 * @param {object} tx - The transaction
 * @param {string} node_seed - The HotPocket node's XRPL account seed
 * @param {object} signer_list - The dApp's XRPL account SignerList (json format: {Array} signers, {number} quorum, {Array} signer_weight)
 * @returns {Promise<object>} The multi-signed transaction
 */
async function SignTx({ctx, tx, node_seed, signer_list}) {
	const node_wallet = xrpl.Wallet.fromSecret(node_seed);

	if (signer_list.signers.includes(node_wallet.classicAddress)) {
		const { tx_blob: signed_tx_blob } = node_wallet.sign(tx, multisign=true);
		// Hash the tx's object as a checksum for the NPL roundname
		const roundname = crypto.createHash('sha256').update(JSON.stringify(tx)).digest('hex');

		const signatures = await NPLResponse({
			content: JSON.stringify({
				roundName: `signature-${roundname}`,
				data: JSON.stringify({
					account: node_wallet.classicAddress,
					tx: signed_tx_blob
				})
			}),
			desired_count: signer_list.quorum,
			ctx: ctx,
			timeout: GetNPLTimeoutValue(type="signing"),
			strict: true 
			// This should be true since if we have enough signers to pass quorum, then the tx is valid.
			// Any more signature would be a waste of tx fee and time. 
			// If you'd like to object this, post an issue on the package's github repository and let's talk. 
		});
		
		// Signers that are apart of the dApp's signer list get to be apart of the multisig transaction, other signer's tx blob are ignored
		const dApp_signers_signature = [];
		var collected_quorum = 0;
		signatures.forEach(signature => {
			signature = JSON.parse(signature);
			if (signer_list.signers.includes(signature.account)) {
				const verification = VerifySignature(signature.tx, signature.account);
				if (verification.signedBy === signature.account
					&& verification.signatureValid === true 
					&& verification.signatureMultiSign === true
					) {
						if (collected_quorum < signer_list.quorum) {
							dApp_signers_signature.push(signature.tx);
							signer_list.signer_weight.forEach(signer => {
								if (signer.account === signature.account) {
									collected_quorum += signer.weight;
								}
							});
						}
				} else {
					if (verification.signedBy != signature.account) { var reason = "Transaction was not signed by the specified signer key"; }
					if (verification.signatureValid !== true)       { var reason = "Transaction's signature was not valid"; }
					if (verification.signatureMultiSign !== true)   { var reason = "Transaction was not a multi-sig transaction"; }
					Log(type="WRN", message=`SignTx(): Signer ${signature.account} did not provide a valid signature. Reason: ${reason}`);
				}
			}
		});

		if (dApp_signers_signature.length >= 1) {
			return xrpl.multisign(dApp_signers_signature);
		} else {
			return NaN;
		}
	}
}

/**
 * Query the XRPL for the dApp's current SignerList and compare it to the cluster's participating signer
 * 
 * @async
 * @param {*} ctx - The contract's context
 * @param {*} account_address - The dApp's XRPL account address 
 * @param {string} node_address - The HotPocket node's XRPL account address
 * @param {Array<string>} signer_list - The dApp's *current* SignerList on the XRPL
 * @returns {Promise<array>} The dApp's XRPL account *current* SignerList
 */
 async function ClusterKeyCheckup({ctx, account_address, node_address, signer_list}) {
	// NPL Round 1 (Nodes distribute their XRPL address)
	// Nodes share their XRPL address with their peers, if nodes didn't receive a XRPL address that is a participating signer
	// nodes will proposes its removal from the dApp's SignerLst in the next NPL Round (round 2).
	// We use this to indicate whether or not a node is active, we need participating signers to be active 24/7
	// to ensure that they'll be able to sign transactions and provide validation

	// NPL Round 2 (Validate previous NPL round's result)
	// Nodes validate their previous NPL round result to ensure that all the nodes are in-sync.
	// If a participating signer's address is not apart of NPL Round 1's result, its address will be present on NPL Round 2's result,
	// this will result in its removal from the dApp's SignerList after NPL Round 3.

	// During a NPL round for cluster key check up (Round 1 & 2), nodes may receive different results as compared to their peers.
	// For nodes to be on the same page with each other, nodes perform another NPL round to dictate which keys they're about to add/remove:
	// If an address is present on 80% of all nodes' proposed set in NPL Round 3, nodes will add/remove them on/from the dApp's signer list
	
	const cluster_signers_1 = await NPLResponse({
		content: JSON.stringify({
			roundName: `node-key-checkup-${account_address}`,
			data: node_address
		}),
		desired_count: ctx.unl.count(),
		ctx: ctx,
		timeout: GetNPLTimeoutValue(type="key_checkup"),
		strict: false
    });

	// add: If an address is present on `add`, we propose its addition to the signer list
	// remove: If an add is present on `remove`, we propose its removal on the signer list

	const add = compare.difference(cluster_signers_1, signer_list),
		  remove = compare.difference(signer_list, cluster_signers_1);

	// NPL Round 2
	const cluster_signers_2 = await NPLResponse({
		content: JSON.stringify({
			roundName: `node-key-validation-${account_address}`,
			data: JSON.stringify([add, remove])
		}),
		desired_count: ctx.unl.count(),
		ctx: ctx,
		timeout: GetNPLTimeoutValue(type="key_checkup_validation"),
		strict: false
    });

	const add_signers_proposals = [],
		  remove_signers_proposals = [];

	cluster_signers_2.forEach(validation => {
		validation = JSON.parse(validation);
		add_signers_proposals.push(validation[0]);
		remove_signers_proposals.push(validation[1]);
	});

	// We go through each proposal, and if a key is present on 80% of all proposals, we either add/remove it from the signer list
	const add_signers = GetVoteCount({
        votes: add_signers_proposals,
        unl_size: ctx.unl.count()
    });

	const remove_signers = GetVoteCount({
        votes: remove_signers_proposals,
        unl_size: ctx.unl.count()
    });

	return {
		addition_proposal: add_signers,
		removal_proposal: remove_signers
	};
}

/**
 * Add signer keys to the dApp's XRPL account SignerList
 * 
 * @async
 * @param {object} ctx - The contract's context
 * @param {string} account_seed - The dApp's XRPL account seed
 * @param {string} node_seed - The HotPocket node's XRPL account seed
 * @param {array<string>} signers - Signers to add to the SignerList
 * @param {number} fee - The fee per each participating signer
 * @param {string} client - Client object
 */
async function AddSignerKey({ctx, account_address, node_seed, signers, fee, client}) {
	const current_signer_list = await GetSignerList({account_address: account_address, client: client});

	const add = compare.difference(signers, current_signer_list);

	if (add.length >= 1) {
		const new_signer_list = [];
		current_signer_list.signers.forEach(key => {
			new_signer_list.push({
				"SignerEntry": {
					"Account": key,
					"SignerWeight": 1
				}
			});
		});
		add_signers.forEach(key => {
			new_signer_list.push({
				"SignerEntry": {
					"Account": key,
					"SignerWeight": 1
				}
			});
		});

		const tx = {
			TransactionType: "SignerListSet",
			Account: account_address,
			SignerEntries: new_signer_list,
			Memos: [{
				Memo: {
					MemoType: Buffer.from("Evernode", 'utf8').toString('hex'),
					MemoData: Buffer.from("DKM: HotPocket Cluster SignerList Update (Addition)", 'utf8').toString('hex'),
					MemoFormat: Buffer.from("text/plain", "utf8").toString('hex')
				}
			}]
		};

		// We'll use the transaction's tx blob's hash as the NPL round name
		const SetSignerList_tx_signed = await SignTx({
			ctx: ctx,
			tx: await AutofillTx({
				tx: tx,
				signer_count: current_signer_list.quorum,
				fee: fee,
				client: client
			}),
			node_seed: node_seed,
			client: client
		});

		await SubmitTx({
			tx: SetSignerList_tx_signed,
			client: client
		});
	}
}


/**
 * Remove signer keys from the dApp's XRPL account SignerList
 * 
 * @async
 * @param {object} ctx - The contract's context
 * @param {string} account_seed - The dApp's XRPL account seed
 * @param {string} node_seed - The HotPocket node's XRPL account seed
 * @param {array<string>} signers - Signers to remove from the SignerList
 * @param {number} fee - The fee per each participating signer
 * @param {string} client - Client object
 */
async function RemoveSignerKey({ctx, account_seed, node_seed, signers, fee, client}) {
	const account_wallet = xrpl.Wallet.fromSecret(account_seed);
    const node_wallet = xrpl.Wallet.fromSecret(node_seed);

	const current_signer_list = await GetSignerList({
		account_address: account_wallet.classicAddress,
		client: client
	});

	const new_dApp_signers = [];
	signers.forEach(key => {
		if (!current_signer_list.includes(key)) {
			new_dApp_signers.push(key);
		}
	});

	if (new_dApp_signers != current_signer_list) {
		const NewSignerEntires = [];
		new_dApp_signers.forEach(key => {
			NewSignerEntires.push({
				"SignerEntry": {
					"Account": key,
					"SignerWeight": 1
				}
			});
		});

		const tx = {
			TransactionType: "SignerListSet",
			Account: account_wallet.classicAddress,
			SignerEntries: NewSignerEntires,
			Memos: [{
				Memo: {
					MemoType: Buffer.from("Evernode", 'utf8').toString('hex'),
					MemoData: Buffer.from("DKM: HotPocket Cluster SignerList Update (Removal)", 'utf8').toString('hex'),
					MemoFormat: Buffer.from("text/plain", "utf8").toString('hex')
				}
			}]
		};

		//  Use the transaction's tx blob's hash as the NPL round name
		const SetSignerList_tx_signed = await SignTx({
			ctx: ctx,
			tx: await AutofillTx({
				tx: tx,
				signer_count: current_signer_list.quorum,
				fee: fee,
				client: client
			}),
            node_seed: node_wallet.seed,
			client: client
		});

		await SubmitTx({
			tx: SetSignerList_tx_signed,
			client: client
		});
	}
}

module.exports = {
	GetClient, GetSignerCredentials, GetAccountCredentials, GetNPLTimeoutValue, GetVoteCount, PackageTxAPI, // Miscellaneous
	AutofillTx, SubmitTx, RequestRippled, GetSignerList, CheckTxPayment, // API Requests
	SetupNPL, NPLResponse, SetSignerList, SetupAccount, // Setup
	SignTx, // Transaction
	ClusterKeyCheckup, AddSignerKey, RemoveSignerKey // Cluster SignerList Management
};