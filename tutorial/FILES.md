# DKM's files

For DKM to function, dApps needs to set a folder under `dist` dedicated to store DKM's files.

To set it up, ensure that the `/DKM/dApp` directory exist under `dist` during development and add 2 files under `/DKM/dApp`, which are:
1. `config.json`
2. `dApp-xrplAccount.json`

`config.json` is a configuration file for DKM & `dApp-xrplAccount.json` will contain the dApp's XRPL account credentials, `dApp-xrplAccount.json` is intended to stay empty as it will be set up in HP Ledger #1.

This is an example of `config.json`:

```json
{
    "network": {
        "hooks": {
            "url": "wss://hooks-testnet-v3.xrpl-labs.com",
            "id": 21338
        },
        "testnet": {
            "url": "wss://testnet.xrpl-labs.com/",
            "id": 1
        }
    },
    "account": {
        "seed": "saEjV7KRCMHPhxERG6ho2NbrJ3p9U",
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
}
```

# Attributes

There are 4 core config parameters, which are:
- network
- account
- signer
- NPL_round_timeout

## network

> This section contains the list of all XRPL networks that the HP dApp may connect & interact with.

|     Field      |                Description               |
| :------------: | :--------------------------------------: |
| {network-name} | Contains a node's URL and the network ID |

## account

> This section contains the parameters of the HP dApp's main XRPL account. This account will be a multi-sig enabled account & a blackholed state

|       Field       |             Description               |
| :---------------: | :-----------------------------------: |
|       seed        |     The dApp's XRPL account seed      |
| signerlist_quorum | The quorum for the dApp's signer list |

## signer

> This section contains attributes of a HP node's signing key

|         Field          |                                       Description                                             |
| :--------------------: | :-------------------------------------------------------------------------------------------: |
|         scheme         | The list of cryptographic schemes that HP nodes will adopt to generate their XRPL signer keys |
| default_fee_per_signer |          The *default* amount of fee for each signer on a multi-sig XRPL transaction          |

## NPL_round_timeout

> This section contains attributes for NPL timeout control

|        Field          |                                                        Description                                                         |
| :-------------------: | :------------------------------------------------------------------------------------------------------------------------: |
|    signerlist_setup   |                            The timeout for the NPL round during the HP dApp's XRPL account setup                           |
|        signing        | The timeout for the NPL round during the distribution & collection of signatures to construct a multi-sig XRPL transaction |
| signer_status_checkup |                        The timeout for the NPL round during the checkup on the HP cluster's status                         |