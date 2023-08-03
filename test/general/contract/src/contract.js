/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
/* eslint-disable indent */
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