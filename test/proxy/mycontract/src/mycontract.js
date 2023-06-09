const HotPocket = require("hotpocket-nodejs-contract");
const DKM = require("decentralized-key-management");
const xrpl = require("xrpl");

const mycontract = async (ctx) => {
    const ClientURL = DKM.getClient(network="testnet");
    console.log(`Connected XRPL node: ${ClientURL}`);
    var client = new xrpl.Client(ClientURL);
    await client.connect();

    const DKMObject = new DKM.DecentralizedKeyManagement(ctx, client);
    await DKMObject.init();

	// Periodically, we go through the dApp's signers keys and update the dApp's SignerList, if needed.
    // Since this is a test: We do this every 10 ledgers. You could set this with any ledger interval with your cluster.
	if (ctx.lclSeqNo % 10 === 0) {
        const cluster_state = await DKMObject.checkupClusterSigners();
        console.log("Cluster State: ");
        console.log(`Online: ${cluster_state.online.length}`);
        console.log(`Offline: ${cluster_state.offline.length}`);
	}

    // If there were transactions being made from/to the dApp's XRPL account, go through them and check them out.
	if (DKMObject.transactions.length >= 1) {
	    // Practically, you could read the tx's memo field and process it, it's your decision to either ignore it or process it.
        console.log(`DKM: XRPL Account ${DKMObject.account_address} has received ${DKMObject.transactions.length} new transaction(s) !!!`);
        var x = 1;
        DKMObject.transactions.forEach(tx => {
            console.log(` - Transaction ${x}:`);
            console.log(` Transaction Type: ${tx.tx.TransactionType}`);
            console.log(`         inLedger: ${tx.tx.inLedger}`);
            console.log(`          Account: ${tx.tx.Account}`);
            console.log(`      Destination: ${tx.tx.Destination}`);
            console.log(`           Amount: ${tx.tx.Amount / 1000000} XRP`);
            console.log(`              Fee: ${tx.tx.Fee} drops`);
            x += 1;
        });
	}
    
    if (ctx.lclSeqNo > 1) {
        if (ctx.users.count() >= 1) {
            for (const user of ctx.users.list()) {
                console.log(`Connected users: ${ctx.users.count()}`);

                for (const input of user.inputs) {
                    const request = await ctx.users.read(input);
                    const user_request = JSON.parse(request);

                    if (user_request.TransactionType === "Payment" && user_request.Amount >= 1 && user_request.Amount < 1000000) {
                        try {
                                var tx = DKMObject.packageTxAPI({
                                    destination: user_request.Destination,
                                    amount: user_request.Amount,
                                    MEMO: {
                                        memo_data: `This transaction was signed using DKM on a HotPocket cluster in Ledger ${ctx.lclSeqNo} !`,
                                        memo_type: "LEDGER",
                                        memo_format: "text/csv"
                                    }
                                });

                                const tx_filled = await DKMObject.autofillTx({tx: tx, multisig: true});
                                const tx_sig = await DKMObject.signTx({tx: tx_filled});
                                const tx_result = await DKMObject.submitTx({tx: tx_sig});
                        } catch (err) {
                            console.log(`ERROR: ${err}`);
                        }
                    }
                }
            }
        }
    }

    await client.disconnect();
};

const hpc = new HotPocket.Contract();
hpc.init(mycontract);