/* eslint-disable no-prototype-builtins */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
/* eslint-disable indent */
const HotPocket = require("hotpocket-nodejs-contract");
const DecentralizedKeyManagement = require("decentralized-key-management");
const NPLBroker = require("npl-broker");

const mycontract = async (ctx) => {
    const npl = NPLBroker.init(ctx);

    // --- TEST 1: INIT DKM ---
    console.log("\n - TEST 1: Initializing DKM. UTILIZES: constructor(), init()");

    const DKM = new DecentralizedKeyManagement.Manager(ctx, npl, "hooks");

    try{
        var initResult = await DKM.init();
    } catch (err) {
        console.log(err);
    }

    // --- TEST 2: PAYMENT TRANSACTION ---
    console.log("\n - TEST 2: Minting & Selling URIToken (NFT)");
    
    const NFTokenURI = Buffer.from("wojake", "utf8").toString("hex").toUpperCase();

    const uriTokenMintTx = {
        "TransactionType": "URITokenMint",
        "Account": DKM.dAppXrplAccountClassicAddress,
        "URI": NFTokenURI,
        "Flags": 1,
        "NetworkID": DKM.xrplNetworkID,
    };

    const uriTokenMintTxFilled = await DKM.autofillTx({tx: uriTokenMintTx, multisig: true});
    const uriTokenMintTxSigned = await DKM.signTx(uriTokenMintTxFilled);

    var uriTokenID = undefined;

    if (uriTokenMintTxSigned !== undefined) {
        try {
            var uriTokenMintTxResult = await DKM.submitTxAndWait(uriTokenMintTxSigned);
        } catch (err) {
            console.log(err);
        }

        if (uriTokenMintTxResult !== undefined) {
            uriTokenMintTxResult.result.meta.AffectedNodes.forEach(node => {
                console.log(node);
                if (node.hasOwnProperty("CreatedNode") && node.CreatedNode.LedgerEntryType === "URIToken") {
                    uriTokenID = node.CreatedNode.LedgerIndex;
                }
            });
        
            console.log(`URIToken ID: ${uriTokenID}`);
        }
    }

    if (uriTokenID !== undefined) {
        // doesn't work, going to focus on other stuff for now. @transia/xrpl.js definitions.
        const uriTokenCreateSellOfferTx = {
            "TransactionType": "URITokenCreateSellOffer",
            "Account": DKM.dAppXrplAccountClassicAddress,
            "Destination": "rMtRk5FwQL9vtqVN8vRQ4PziY9dcQT2ArP",
            "Amount": "0",
            "URITokenID": uriTokenID 
        };

        const uriTokenCreateSellOfferTxFilled = await DKM.autofillTx(uriTokenCreateSellOfferTx);
        const uriTokenCreateSellOfferTxSigned = await DKM.signTx({tx: uriTokenCreateSellOfferTxFilled, multisig: true});

        if (uriTokenMintTxSigned) var uriTokenCreateSellOfferTxResult = await DKM.submitTx(uriTokenCreateSellOfferTxSigned);

        console.log(uriTokenCreateSellOfferTxResult);
    }

    await DKM.close();
};

const hpc = new HotPocket.Contract();
hpc.init(mycontract);