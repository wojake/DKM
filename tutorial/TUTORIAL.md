# Dev tutorial @ DKM 

> Note: This section assumes that you have a basic understanding of how the XRP Ledger and HotPocket works.

**Decentralized Key Management** or DKM is a NodeJS library meant to be used atop of HotPocket smart contracts to manage their XRPL account and interact with an XRPL-powered network in a decentralized manner.

`DKM` allows HotPocket dApps to submit multi-sig transactions over to the XRP Ledger in an effiecient manner. We'll show you how it works under the hood and how you should use them in your dApp!

Go through this code sample and an explanation of each function is laid out below!

```js
const HotPocket = require("hotpocket-nodejs-contract");
const DKM = require("decentralized-key-management");
const xrpl = require("xrpl");

const mycontract = async (ctx) => {
    // Get node's URL
    const ClientURL = DKM.getClient(network="testnet");
    
    console.log(`Connected XRPL node: ${ClientURL}`);
    
    // Connect to node
    var client = new xrpl.Client(ClientURL);
    await client.connect();


    // Initialize DKM
    const DKMObject = new DKM.DecentralizedKeyManagement(ctx, client);
    await DKMObject.init();

    // Check up on cluster's state (signers)
    const cluster_state = await DKMObject.checkupClusterSigners();

    console.log(cluster_state);

    // Construct an unfilled transaction with a MEMO field attached
    const tx = await DKMObject.packageTxAPI({
        destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
        amount: ctx.lclSeqNo.toString(),
        MEMO: {
            memo_data: `This transaction was signed using DKM on a HotPocket cluster in Ledger ${ctx.lclSeqNo} !`,
            memo_type: "LEDGER",
            memo_format: "text/csv"
        }
    });

    // Autofill, multi-sign and relay transaction to rippled node
    const tx_filled = await DKMObject.autofillTx({tx: tx, multisig: true});
    const tx_sig = await DKMObject.signTx({tx: tx_filled});
    const tx_result = await DKMObject.submitTx({tx: tx_sig});

    await client.disconnect();
};

const hpc = new HotPocket.Contract();
hpc.init(mycontract);
```

### DKM.getClient()

```js
// Get node's URL
const ClientURL = DKM.getClient(network="testnet");
    
console.log(`Connected XRPL node: ${ClientURL}`);
    
// Connect to node
var client = new xrpl.Client(ClientURL);
await client.connect();
```

`DKM` provides a function to return a random node's URL from `DKM`'s config file:

```json
    "node": {
        "testnet": [
            "wss://s.altnet.rippletest.net:51233",
            "wss://testnet.xrpl-labs.com/"
        ]
    },
```

`DKM.getClient(network="testnet")` would return a random object (node's URL) from the array. This is to ensure that the entire HP cluster does not rely on one singular node and uses a range of rippled node to interact with the XRPL. This increases reliability and safety.

### DKM.init()

DKM uses an OOP-based code design. So with this in mind, variables and functions need to be called to set it up before use in every new ledger.

```js
// Initialize DKM
const DKMObject = new DKM.DecentralizedKeyManagement(ctx, client);
await DKMObject.init();
```

`DKMObject.init()` initializes fundamental variables and functions like `#generateSignerCredentials(), #setupDAppAccount(), getTransactions(), getSignerList()` to sync with the XRPL in terms of the dApp's signer list, new transactions affecting/interacting with the account, and setting up the dApp's account in `Ledger #1`.


### DKM.checkupClusterSigners()

In order to stay updated with the cluster's state, mainly signers, we perform a NPL round with all peers; distributing and collecting their respective signer keys. This gives us a map of the cluster's nodes status & their reliability.

```js
// Check up on cluster's state (signers)
const cluster_state = await DKMObject.checkupClusterSigners();
```

This is the NPL round being performed when `DKM.checkupClusterSigners()` is called:

```js
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
```

### Transaction: DKM.packageTxAPI(), DKM.autofillTx(), DKM.signTx(), DKM.submitTx()

`DKM` provides dApps the ability to construct, autofill and submit *multi-signature* transactions over to the XRP Ledger.

```js
// Construct an unfilled transaction with a MEMO field attached
const tx = await DKMObject.packageTxAPI({
    destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    amount: ctx.lclSeqNo.toString(),
    MEMO: {
        memo_data: `This transaction was signed using DKM on a HotPocket cluster in Ledger ${ctx.lclSeqNo} !`,
        memo_type: "LEDGER",
        memo_format: "text/csv"
    }
});

// Autofill, multi-sign and relay transaction to rippled node
const tx_filled = await DKMObject.autofillTx({tx: tx, multisig: true});
const tx_sig = await DKMObject.signTx({tx: tx_filled});
const tx_result = await DKMObject.submitTx({tx: tx_sig});
```

`DKM.packageTxAPI` essentially acts as a simple packager for transactions that are meant to relay pieces of information on an XRPL transaction to a reciepient.

`DKM.autofillTx` automatically fills unfilled fields on the transaction, requesting neccesary fills from the XRPL node. Nothing special compared to `xrpl-js`'s autofill function.

In a decentralized setting where the signer list is up, `DKM.signTx` performs a NPL round to distribute and collect valid signatures for a multi-sig transaction. Here's a small snippet of the code, which is the NPL round:

```js
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
	// This should be true since if we have enough signers to pass quorum, the tx is valid.
	// Any more signatures would be a waste of tx fee and time spent on collecting signatures. 
	// If you'd like to object this, post an issue on the package's github repository and let's talk. 
});
```

And finally, you'd have to disconnect from the XRPL node to start a new round/ledger on your HotPocket cluster!