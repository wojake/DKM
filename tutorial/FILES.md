# DKM's files

For DKM to function, dApps needs to set a folder under `dist` dedicated to store DKM's files.

To set it up, ensure that the directory `DKM/dApp` exist under the `dist` directory during development and add 2 files under `DKM/dApp`, which are:
1. `config.json`
2. `XRPL_account.json`

`config.json` is a configuration file for DKM & `XRPL_account.json` will contain the dApp's XRPL account, `XRPL_account.json` is intended to stay empty as it will be set up in Ledger #1.

This is an example of `config.json`:

```json
{
    "node": {
        "testnet": [
            "wss://s.altnet.rippletest.net:51233",
            "wss://testnet.xrpl-labs.com/"
        ],
        "devnet": [
            "wss://s.devnet.rippletest.net:51233/"
        ]
    },
    "account": {
        "seed": "sanQKMFhTLwmxxkCWCGpffxDomRwU",
        "signerlist_quorum": 0.8
    },
    "signer": {
        "scheme": [
            "ed25519",
            "secp256k1"
        ],
       "default_fee_per_signer": 15
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
- node
- account
- signer
- NPL_round_timeout


## node

> This section contains the list of XRPL-powered networks that the HP dApp may connect with.

|     Field      |                  Description                  |
| :------------: | :-------------------------------------------: |
| {network-name} | Array of network endpoints or XRPL node URL's |

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