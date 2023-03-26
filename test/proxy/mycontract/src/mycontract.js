const HotPocket = require("hotpocket-nodejs-contract");
const DKM = require("decentralized-key-management");
const xrpl = require("xrpl");

const mycontract = async (ctx) => {
    // If this is a newly joined node, *locally* generate a Ed25519 (XRPL) keypair and store it on a file which won't be apart of state consensus
    const ClientURL = DKM.GetClient(network="testnet");
    var client = new xrpl.Client(ClientURL);
    await client.connect();

    var signer_credentials = DKM.GetSignerCredentials(ctx);

    DKM.SetupNPL({ctx: ctx});

    // Setup the cluster's XRPL dApp account in Ledger 1
    if (ctx.lclSeqNo === 1) {
        await DKM.SetupAccount({
            ctx: ctx,
            node_address: signer_credentials.address,
            client: client
        });
	}

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
        if (ctx.users.count() >= 1) {
            for (const user of ctx.users.list()) {
                console.log(`Connected users: ${ctx.users.count()}`);

                for (const input of user.inputs) {
                    const request = await ctx.users.read(input);
                    const user_request = JSON.parse(request);

                    if (user_request.TransactionType === "Payment") {
                        if (user_request.Amount <= 1000000) {
                            var tx = DKM.PackageTxAPI({
                                account: account_credentials.address,
                                destination: user_request.Destination,
                                amount: user_request.Amount,
                                signer_list_quorum: signer_list.quorum,
                                MEMO: {
                                    memo_data: `This transaction was signed using DKM on a HotPocket cluster in Ledger ${ctx.lclSeqNo} !`,
                                    memo_type: "LEDGER",
                                    memo_format: "text/csv"
                                }
                            });

                            const filled_tx = await DKM.AutofillTx({
                                tx: tx,
                                signer_count: signer_list.quorum,
                                fee: 11,
                                client: client
                            })
                
                            const signed_tx = await DKM.SignTx({
                                ctx: ctx,
                                tx: filled_tx,
                                node_seed: signer_credentials.seed,
                                signer_list: signer_list
                            });
                
                            await DKM.SubmitTx({tx: signed_tx, client: client});
                        };
                    };
                };
            }
        }
    }

    await client.disconnect();
}

const hpc = new HotPocket.Contract();
hpc.init(mycontract);