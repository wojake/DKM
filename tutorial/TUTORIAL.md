# Dev tutorial @ DKM 

> Note: This section assumes that you have a basic understanding of how the XRP Ledger and HotPocket works.

**Decentralized Key Management** or DKM is a NodeJS library meant to be used atop of HotPocket smart contracts to manage their XRPL account and interact with an XRPL-powered network in a decentralized manner.

`DKM` allows HotPocket dApps to submit multi-sig transactions over to the XRP Ledger in an efficient manner. We'll show you how it works under the hood and how you should use them in your dApp!

Go through this code sample and an explanation of each function is laid out below!

```js
const HotPocket = require("hotpocket-nodejs-contract");
const DecentralizedKeyManagement = require("decentralized-key-management");
const xrpl = require("xrpl");

const mycontract = async (ctx) => {
    const ClientURL = DecentralizedKeyManagement.getNetwork("hooks");

    var client = new xrpl.Client(ClientURL.wss);
    var networkID = ClientURL.network_id;

    await client.connect();

    console.log(`Connected XRPL node: ${ClientURL.wss}`);

    // --- TEST 1: INIT DKM ---
    console.log("\n - TEST 1: Initializing DKM. UTILIZES: constructor(), init()");

    const DKM = new DecentralizedKeyManagement.Manager(ctx, client, networkID);

    try{
        var initResult = await DKM.init();
    } catch (err) {
        console.log(err);
    }
   
    // --- TEST 2: PAYMENT TRANSACTION ---
    console.log("\n - TEST 2: Sending Payment Transaction. UTILIZES: packageTxAPI(), autofillTx(), signTx(), submitTx()");

    const tx = await DKM.packageTxAPI({
        destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
        amount: ctx.lclSeqNo.toString(),
        memo: {
            data: "You seem smart to lurk here, here's some general alpha: Hooks & Evernode will change the entire game. Do R&D and network well.",
            type: "21337",
            format: "text/csv"
        }
    });

    const tx_filled = await DKM.autofillTx({
        tx: tx,
        multisig: true
    });
    const tx_sig = await DKM.signTx(tx_filled);
    try {
        var tx_result = await DKM.submitTx(tx_sig);
    } catch (err) {
        console.log(err);
    }

    // --- TEST 3: CLUSTER MANAGEMENT ---
    console.log("\n - TEST 3: Managing the cluster. UTILIZES: checkupClusterSigners(), addSignerKey(), removeSignerKey()");

    const cluster_state = await DKM.checkupClusterSigners();

    console.log(`      Online peers: ${cluster_state.OnlineSigners.length}`);
    console.log(`     Offline peers: ${cluster_state.OfflineSigners.length}`);
    console.log(` NPL Time duration: ${cluster_state.TimeTaken}ms / ${cluster_state.Timeout}ms`);

    await client.disconnect();
};

const hpc = new HotPocket.Contract();
hpc.init(mycontract);
```

### DKM.getNetwork()

```js
// Get XRPL network data from DKM's config file
const ClientURL = DecentralizedKeyManagement.getNetwork("hooks");

var client = new xrpl.Client(ClientURL.wss);
var networkID = ClientURL.network_id;

await client.connect();

console.log(`Connected XRPL node: ${ClientURL.wss}`);
```

```json
"network": {
    "hooks": {
        "wss": "wss://hooks-testnet-v3.xrpl-labs.com",
        "network_id": 21338
    },
    "testnet": {
        "wss": "wss://testnet.xrpl-labs.com/",
        "network_id": 1
    }
}
```

`DKM.getNetwork("hooks")` would return an object which contains a node's URL and the network's ID.

### DKM.init()

DKM uses an OOP-based code design. So with this in mind, variables and functions need to be called to set it up before use in every new ledger.

```js
// Initialize DKM
const DKM = new DecentralizedKeyManagement.Manager("HP contract contex", "XRPL client node URL", "XRPL network ID");
var initResult = await DKM.init();
```

`DKM.init()` initializes fundamental variables and functions like `#generateSignerCredentials(), #setupDAppAccount(), getTransactions(), getSignerList()` to sync with the XRPL in terms of the dApp's signer list, new transactions affecting/interacting with the account, and setting up the dApp's account in `Ledger #1`.

### DKM.checkupClusterSigners()

In order to stay updated with the cluster's state, mainly signers, we perform a NPL round with all peers; distributing and collecting their respective signer keys. This gives us a map of the cluster's nodes status & their reliability.

```js
// Check up on cluster's state (signers)
const cluster_state = await DKMObject.checkupClusterSigners();
```

This is the NPL round being performed when `DKM.checkupClusterSigners()` is called:

```js
const hpClusterSignerAddresses = await this.npl.performNplRound({
	roundName: `signer-status-checkup-${this.dAppAccountClassicAddress}`,
	content: this.hpSignerAddress,
	desiredCount: this.ctx.unl.count(),
	timeout: this.dkmConfig.NPL_round_timeout["signer_status_checkup"]
});
```

### Transaction: DKM.packageTxAPI(), DKM.autofillTx(), DKM.signTx(), DKM.submitTx()

`DKM` provides HP dApps the ability to construct, autofill and submit *multi-signature* transactions over to the XRP Ledger.

```js
// Construct an unfilled transaction with a MEMO field attached
const tx = await DKM.packageTxAPI({
    destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    amount: ctx.lclSeqNo.toString(),
    MEMO: {
        data: `This transaction was signed using DKM on a HotPocket cluster in Ledger ${ctx.lclSeqNo} !`,
        type: "LEDGER",
        format: "text/csv"
    }
});

// Autofill, multi-sign and relay transaction to rippled node
const tx_filled = await DKM.autofillTx({tx: tx, multisig: true});
const tx_sig = await DKM.signTx({tx: tx_filled});
const tx_result = await DKM.submitTx({tx: tx_sig});
```

`DKM.packageTxAPI` essentially acts as a simple wrapper for transactions that are meant to relay pieces of information on an XRPL transaction to a recipient.

`DKM.autofillTx` automatically fills unfilled common fields on the transaction, requesting necessary fills from the XRPL node. Nothing special compared to `xrpl-js`'s autofill function.

In a decentralized setting, where the dApp's XRPL signerlist exist, `DKM.signTx` performs an NPL round to distribute and collect valid signatures for a multi-sig transaction. Here's a snippet of the code, which is the NPL round:

```js
const signatures = await this.npl.performNplRound({
	roundName: `signature-collection-${roundName}`,
	content: JSON.stringify({
		account: signerWallet.classicAddress,
		tx: signedTxBlob
	}),
	desiredCount: this.signerlistQuorum,
	timeout: this.dkmConfig.NPL_round_timeout["signing"]
});
```

And finally, you'd have to disconnect from the XRPL node to start a new round/ledger on your HotPocket cluster!

```js
await client.disconnect();
```