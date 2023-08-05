/* eslint-disable no-undef */
/* eslint-disable indent */
const fs = require("fs");
const xrpl = require("@transia/xrpl");
const { program } = require("commander");

async function main() {
    // HookV3:
    // -seed: FAUCET -> https://hooks-testnet-v3.xrpl-labs.com/
    // -net: hooks
	// -node: wss://hooks-testnet-v3.xrpl-labs.com
    // -id: 21338

    console.log(`> Running ${__filename}`);
    
    program
        .option("-s, --seed <type>", "The XRPL account seed")
        .option("-net, --network <type>", "The network name")
        .option("-node, --node <type>", "The node to connect to")
        .option("-id, --network-id <type>", "The network ID");

    program.parse(process.argv);

    // If you're running from 'npm test', you'd have to fill this variable!
    const seed = "XRPL SEED";

    const options = program.opts();

    if (options.seed === undefined) {
        if (!seed) throw new Error("No provided XRPL account seed (--seed)");
        if (!xrpl.isValidSecret(seed)) throw new Error("Not valid XRPL account seed");
    }
    if (xrpl.isValidSecret(options.seed)) throw new Error("Not valid XRPL account seed");
    if (options.network === undefined) throw new Error("No provided network name (--network)");
    if (options.node === undefined) throw new Error("No provided node address / network endpoint (--node)");
    if (options.networkId === undefined) throw new Error("No provided NetworkID (--network-id)");
    if (!parseInt(options.networkId)) throw new Error("Provided NetworkID is not a number");
    
    const wallet = xrpl.Wallet.fromSeed(options.seed ?? seed);
    const networkName = options.network;

    console.log(`> XRPL account address: ${wallet.classicAddress}`);
    
    const data = JSON.stringify({
        "_comment": "https://xrpl.org/xrp-testnet-faucet.html",
        "network": {
            [networkName]: {
                "wss": options.node,
                "network_id": parseInt(options.networkId)
            },
            "testnet": {
                "wss": "wss://testnet.xrpl-labs.com/",
                "network_id": 1
            }
        },
        "account": {
            "seed": wallet.seed,
            "signerlist_quorum": 0.8
        },
        "signer": {
            "scheme": [
                "ed25519",
                "ecdsa-secp256k1"
            ],
            "default_fee_per_signer": 15,
        },
        "NPL_round_timeout": {
            "signerlist_setup": 6000,
            "signing": 5000,
            "signer_status_checkup": 8000
        }
    });

    fs.writeFileSync(`${__dirname}/dist/DKM/dApp/config.json`, data);
}

main();