const HotPocket = require("hotpocket-nodejs-contract");
const DKM = require("decentralized-key-management");
const xrpl = require("xrpl");

const mycontract = async (ctx) => {
    const ClientURL = DKM.GetClient(network="testnet");
    var client = new xrpl.Client(ClientURL);
    await client.connect();

    // If this is a newly joined node, *locally* generate a Ed25519 keypair and store it on a file which won't be apart of state consensus
    var signer_credentials = DKM.GetSignerCredentials(ctx);

    // Setup the node's NPL communication, this allows it to receive data from its peers
    DKM.SetupNPL({ctx: ctx});

    // Setup the cluster's XRPL dApp account in Ledger 1
    if (ctx.lclSeqNo === 1) {
        await DKM.SetupAccount({
            ctx: ctx,
            node_address: signer_credentials.address,
            client: client
        });
	}

    // Get the dApp's XRPL account credentials
    var account_credentials = DKM.GetAccountCredentials();

    // Check if any XRPL transactions were made from/to the dApp's XRPL account
	var XRPL_payments = await DKM.CheckTxPayment({
        account_credentials: account_credentials,
        client: client
    });

    // Get the dApp's XRPL account SignerList
	var signer_list = await DKM.GetSignerList({
        account_address: account_credentials.address,
        client: client
    });

	// Periodically, we go through the dApp's signers keys and update the dApp's SignerList, if needed.
    // Since this is a test: We do this for every 10 ledgers. You could set this to any number with your dApp.
	if (ctx.lclSeqNo % 10 === 0) {
	    const key_checkup = await DKM.ClusterKeyCheckup({
            ctx: ctx,
            account_address: account_credentials.address,
            node_address: signer_credentials.address,
            signer_list: signer_list
        });
        console.log(key_checkup);

	}

    // If there were transactions being made from/to the dApp's XRPL account, go through them and check them out.
	if (XRPL_payments.length >= 1) {
	    // Practically, you could read the tx's memo field and process it, it's your decision to either ignore it or process it.
        console.log(`DKM: XRPL Account ${account_credentials.address} has received ${XRPL_payments.length} new transaction(s) !!!`)
        var x = 1;
        XRPL_payments.forEach(tx => {
            console.log(` - Transaction ${x}:`);
            console.log(` Transaction Type: ${tx.tx.TransactionType}`);
            console.log(`         inLedger: ${tx.tx.inLedger}`);
            console.log(`          Account: ${tx.tx.Account}`);
            console.log(`      Destination: ${tx.tx.Destination}`);
            console.log(`           Amount: ${tx.tx.Amount / 1000000} XRP`);
            console.log(`              Fee: ${tx.tx.Fee} drops`)
            x += 1;
        });
	}
    
    if (ctx.lclSeqNo > 1) {
        // Everytime a ledger passes, the dApp signs and submits a transaction to the rippled node.
        // Each transaction's amount is determined by the ledger it was in during signing phase ( ctx.lclSeqNo.toString() )
        tx = DKM.PackageTxAPI({
                account: account_credentials.address,
                destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
                amount: ctx.lclSeqNo.toString(),
                signer_list_quorum: signer_list.quorum,
                MEMO: {
                    memo_data: `This transaction was signed using DKM on a HotPocket cluster in Ledger ${ctx.lclSeqNo} !`,
                    memo_type: "LEDGER",
                    memo_format: "text/csv"
                }
        })

        // Automatically fill any common fields that weren't filled in
        const filled_tx = await DKM.AutofillTx({
            tx: tx,
            signer_count: signer_list.quorum,
            fee: 11,
            client: client
        });

        // Sign the transaction and distribute & collect signatures from our peers.
        const signed_tx = await DKM.SignTx({
            ctx: ctx,
            tx: filled_tx,
            node_seed: signer_credentials.seed,
            signer_list: signer_list
        });

         //If enough signatures are met, we submit it to a rippled node.
        await DKM.SubmitTx({tx: signed_tx, client: client});
    }
    await client.disconnect();
}

const hpc = new HotPocket.Contract();
hpc.init(mycontract);