const fs = require('fs');
const xrpl = require("xrpl");

async function main() {
    const network = "wss://testnet.xrpl-labs.com/"
    // const network = "wss://s.altnet.rippletest.net:51233";

    console.log(`> Running ${__filename}`);

    const client = new xrpl.Client(network);
    await client.connect();

    console.log(`> Requesting XRP from ${network}...`);
    
    const {wallet, _balance} = await client.fundWallet();
    await client.disconnect();

    console.log(`> XRPL account address: ${wallet.classicAddress}`);
    
    fs.writeFileSync(
        path=`${__dirname}/dist/DKM/dApp/config.json`,
        data= JSON.stringify({
            "_comment": "https://xrpl.org/xrp-testnet-faucet.html",
            "node": {
                "testnet": [
                    network,
                    // "wss://s.altnet.rippletest.net:51233",
                    // "wss://testnet.xrpl-labs.com/"
                ]
            },
            "account": {
                "seed": wallet.seed,
                "signerlist_quorum": 0.8
            },
            "signer": {
                "scheme": [
                    "ed25519",
                    "secp256k1"
                ],
                "default_fee_per_signer": 15,
            },
            "NPL_round_timeout": {
                "signerlist_setup": 6000,
                "signing": 5000,
                "signer_status_checkup": 8000
            }
        })
    );
};

main();