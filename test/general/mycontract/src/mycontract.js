const HotPocket = require("hotpocket-nodejs-contract");
const DKM = require("decentralized-key-management");
const xrpl = require("xrpl");

const mycontract = async (ctx) => {
    const ClientURL = DKM.getClient(network="testnet");
    console.log(`Connected XRPL node: ${ClientURL}`);
    var client = new xrpl.Client(ClientURL);
    await client.connect();

    // --- TEST 1: INIT DKM ---
    console.log("\n - TEST 1: Initializing DKM. UTILIZES: constructor(), init()");

    const DKMObject = new DKM.DecentralizedKeyManagement(ctx, client);
    await DKMObject.init();

    // --- TEST 2 NPL Round ---
    console.log("\n - TEST 2: NPL Round. UTILIZES: NPLResponse()");

    const test_npl_result = await DKMObject.NPLResponse({
        content: JSON.stringify({
            roundName: `TEST 123 !@# ${ctx.lclSeqNo}`,
            data: Math.floor(Math.random() * 100)
        }),
        desired_count: 4,
        timeout: 1000,
        strict: false
    });

    console.log(`\n -- (#2) NPL Round Result -- : 
                      ROUND NAME : ${test_npl_result.roundName} 
                PARTICIPANTS (#) : ${test_npl_result.participants.length} 
                      TIME TAKEN : ${test_npl_result.time_taken} 
                  DATA COLLECTED : ${test_npl_result.data}
                `);

    // --- TEST 3: PAYMENT TRANSACTION ---
    console.log("\n - TEST 3: Sending Payment Transaction. UTILIZES: packageTxAPI(), autofillTx(), signTx(), submitTx()");

    const tx = await DKMObject.packageTxAPI({
        destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
        amount: ctx.lclSeqNo.toString(),
        MEMO: {
            memo_data: `This transaction was signed using DKM on a HotPocket cluster in Ledger ${ctx.lclSeqNo} !`,
            memo_type: "LEDGER",
            memo_format: "text/csv"
        }
    });

    const tx_filled = await DKMObject.autofillTx({tx: tx, multisig: true});
    const tx_sig = await DKMObject.signTx({tx: tx_filled});
    const tx_result = await DKMObject.submitTx({tx: tx_sig});

    // --- TEST 4: CLUSTER MANAGEMENT ---
    console.log("\n - TEST 4: Managing the cluster. UTILIZES: checkupClusterSigners(), addSignerKey(), removeSignerKey()");

    const cluster_state = await DKMObject.checkupClusterSigners();

    console.log(`      Online peers: ${cluster_state.online.length}`);
    console.log(`     Offline peers: ${cluster_state.offline.length}`);
    console.log(` NPL Time duration: ${cluster_state.time_taken}ms / ${cluster_state.timeout}ms`);

    await DKMObject.addSignerKey({
        signers: [
            {
                signing_key: 'rw1wjKwDEjUdYajL6MV9VbH2CbLtVxg6o2',
                public_key: '013AF430D53E2FFBD785FB8914A4E8B86C0AEACF3924A10ED46836F5C44E54AC'
            }
        ]
    });

    if (ctx.lclSeqNo % 2 === 0) {
        await DKMObject.removeSignerKey({signers: ["rw1wjKwDEjUdYajL6MV9VbH2CbLtVxg6o2"]});
    }

    await client.disconnect();
};

const hpc = new HotPocket.Contract();
hpc.init(mycontract);