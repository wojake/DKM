/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
/* eslint-disable indent */
const HotPocket = require("hotpocket-nodejs-contract");
const DecentralizedKeyManagement = require("decentralized-key-management");
const xrpl = require("@transia/xrpl");

const mycontract = async (ctx) => {
    const ClientURL = DecentralizedKeyManagement.getNetwork("hooks");

    var client = new xrpl.Client(ClientURL.wss);
    var networkID = ClientURL.network_id;

    await client.connect();

    console.log(`Connected XRPL node: ${ClientURL.wss}`);

    // --- TEST 1: INIT DKM ---
    console.log("\n - TEST 1: Initializing DKM. UTILIZES: constructor(), init()");

    const DKM = new DecentralizedKeyManagement.Manager(ctx, xrpl, client, networkID);

    try{
        var initResult = await DKM.init();
    } catch (err) {
        console.log(err);
    }
   
	// Periodically, we go through the dApp's signers keys and update the dApp's SignerList, if needed.
    // Since this is a test: We do this every 10 ledgers. You could set this with any ledger interval with your cluster.
	if (ctx.lclSeqNo % 10 === 0) {
        const clusterState = await DKM.checkupClusterSigners();
        console.log("Cluster State: ");
        console.log(`Online: ${clusterState.OnlineSigners.length}`);
        console.log(`Offline: ${clusterState.OfflineSigners.length}`);
	}

    // If there were transactions being made from/to the dApp's XRPL account, go through them and check them out.
	if (DKM.dAppXrplTransactions.length >= 1) {
        // Practically, you could read the tx's memo field and process it, it's your decision to either ignore it or process it.
        console.log(`DKM: XRPL Account ${DKM.dAppXrplAccountClassicAddress} has received ${DKM.dAppXrplTransactions.length} new transaction(s) !!!`);
        var x = 1;
        DKM.dAppXrplTransactions.forEach(tx => {
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
                    const userRequest = JSON.parse(request);

                    if (userRequest.TransactionType === "Payment" && xrpl.isValidAddress(userRequest.Destination) && userRequest.Amount <= 1) {
                        try {
                            var tx = DKM.packageTxAPI({
                                destination: userRequest.Destination,
                                amount: xrpl.xrpToDrops(userRequest.Amount),
                                memo: {
                                    data: `This transaction was signed using DKM on a HotPocket cluster in Ledger ${ctx.lclSeqNo} !`,
                                    type: "LEDGER",
                                    format: "text/csv"
                                }
                            });

                            const tx_filled = await DKM.autofillTx({tx: tx, multisig: true});
                            const tx_sig = await DKM.signTx(tx_filled);
                            const tx_result = await DKM.submitTx(tx_sig);
                        } catch (err) {
                            throw new Error(`ERROR: ${err}`);
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