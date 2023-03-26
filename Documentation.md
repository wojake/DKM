# Documentation
### WIP
This file includes all of DKM's functions, its functionality & use, and the respective values.

## Functions
- **Miscellaneous**: GetClient, GetSignerCredentials, GetAccountCredentials, GetNPLTimeoutValue, GetVoteCount, PackageTxAPI
- **API Requests**: AutofillTx, SubmitTx, RequestRippled, GetSignerList, CheckTxPayment
- **Setup**: SetupNPL, NPLResponse, SetSignerList, SetupAccount
- **Transaction**: SignTx
- **Cluster SignerList Management**: ClusterKeyCheckup, AddSignerKey, RemoveSignerKey

### GetClient(network, index)
Get a rippled node's URL on `dist/DKM/setup/bootstrap_state.json`.

If `index` is not specified, a random URL from the specified network will be returned.

#### Values
| Parameters | Description                                                          | Type   | Required | Example             |
|:-----------|:---------------------------------------------------------------------|:-------|:---------|:--------------------|
| `network`  | The XRPL-protocol powered network that your dApp wants to connect to | string | Yes      | "testnet", "devnet" |
| `index`    | The array index on `bootstrap_state.json`.node.network               | number | No       | 0, 1, 2             |

#### Returns
| Returns    | Description    | Type   | Example                        |
|:-----------|:---------------|:-------|:-------------------------------|
| `node_URL` | The node's URL | string | "wss://testnet.xrpl-labs.com/" |

### GetSignerCredentials(ctx)
Get the HotPocket node's signer key. If the node is a fresh instance, the node will generate and store its signer credentials *locally*

#### Values
| Parameters | Description            | Type   | Required | Example                                     |
|:-----------|:-----------------------|:-------|:---------|:--------------------------------------------|
| `ctx`      | The contract's context | object | Yes      | const mycontract = async (**ctx**) => {...} |

#### Returns
| Returns              | Description    | Type   | Example                        |
|:---------------------|:---------------|:-------|:-------------------------------|
| `signer_credentials` | The node's URL | string | "wss://testnet.xrpl-labs.com/" |

### GetAccountCredentials()
Get the dApp's XRPL account

#### Values
| Returns              | Description    | Type   | Example                        |
|:---------------------|:---------------|:-------|:-------------------------------|
| `signer_credentials` | The node's URL | string | "wss://testnet.xrpl-labs.com/" |
