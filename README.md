# Decentralized Key Management framework
A NodeJS framework for HotPocket clusters to manage their XRPL account signer keys in order to use the XRP Ledger in a decentralized manner. The `Decentralized Key Management` framework or the `DKM` framework facilitates the management of a dApp's XRPL multi-sig account.

`DKM` is available for installation on npm:
```
npm install decentralized-key-management
```

Since the HotPocket Consensus Engine facilitates the transfer of arbitrary data from and to nodes, nodes could distribute addresses, proposals and signatures. `DKM` leverages the HotPocket Consensus Engine to facilitate key management in a decentralized manner as each node would own and manage its own signer key. When signing a transaction, nodes that are participating signers will sign the transaction and distribute their signature via NPL.

DKM provides the foundational functionalities to sign, distribute and collect transaction signatures. DKM does **not** manage a cluster's consensus protocol or a node's UNL. Please ensure that the cluster's nodes have high and stable connectivity amongst each other in order for the participating signers to distribute and collect sufficient amounts of signatures. DKM may not work due to low node connectivity.

## Terms
We may use these terms in `DKM` but without context, its term may be different:
- `participating signer`, as in, an address on the dApp's SignerList which has the ability to sign transactions on behalf of the dApp's XRPL account
- `active participating signer`, as in, a participating signer that is active and stable enough to distribute data reliably (data: XRPL address, signatures and proposals).
- `inactive participating signer`, as in, a participating signer that is not active or stable enough to distribute data reliably. This HotPocket node is deemed unreliable to become a participating signer until it is active or stable enough, this will result in its removal from the dApp's SignerList

# Understanding Decentralized Key Management

## How it works
HotPocket nodes would locally generate and store their very own unique `Ed25519` seed (ie. `sEdVrdVqAVXYGX8ZizUkzwpWY2dXFzA`). Each node would represent a participating signer, and each signer would be apart of dApp's XRPL account's SignerList, if approved by consensus.

Every 64th ledgers (configurable), nodes would perform a `node-key-checkup` NPL round to analyze and audit the liveliness of participating signers. If a node is stable and active, they would distribute their XRPL address (ie. `rLnoAQgC9wEnSfLpnFpFgu8hz6V27aAAdL`) to its peers. If an address apart of the dApp's SignerList is not present during the NPL round, it is deemed inactive and their address would be removed from the SignerList.

The `DKM` protocol hasn't been *entirely* tested out yet. Since each HotPocket cluster may use a different consensus protocol, we have to test them out and see which consensus mechanism works best for `DKM` to function efficiently. If you would like to contribute to this effort, feel free to test it out for yourself and post your analysis in an issue post!

## Cluster UNL Management
`DKM` only manages the dApp's XRPL account signer keys by using HotPocket's Node Party Line feature. However, it does **not** manage a node's UNL or the dApp's config rules, you must define and configure it accordingly. Please ensure that the consensus protocol & UNL management used in your application is reliable, safe and byzantine fault tolerant. Without the cluster's UNLs being managed efficiently, `DKM` may face problems to work efficiently.

## Supported Chains
Currently, `DKM` only supports the XRPL. Additional support for other chains or cryptographic schemes may be met if demand is there, but right now it's best to focus on sharpening the current code/protocol to ensure that it's stable & secure for production use.