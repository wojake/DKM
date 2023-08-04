# Decentralized Key Management (DKM)

A NodeJS library for HotPocket clusters to manage their XRPL account in a decentralized manner. The `DKM` library facilitates the management of a dApp's XRPL multi-sig account.

`DKM` is available for installation on [npm](https://www.npmjs.com/package/decentralized-key-management):
```
npm install decentralized-key-management
```

# Understanding DKM

## How it works

Since the HotPocket Consensus Engine facilitates the transfer of data from and to nodes, nodes could distribute addresses, proposals and signatures. `DKM` leverages the HotPocket Consensus Engine to facilitate key management in a decentralized manner as each node would own and manage its own signer key. When signing a transaction, nodes that are participating signers will sign the transaction and distribute their signature via NPL.

DKM provides the foundational functionalities to sign, distribute and collect transaction signatures. DKM does **not** manage a cluster's consensus protocol or a node's UNL. Please ensure that the cluster's nodes have high and stable connectivity amongst each other in order for the participating signers to distribute and collect sufficient amounts of signatures. DKM may not work due to low node connectivity.

HotPocket nodes would locally generate and store their own unique cryptographic keypair (`ed25519` or `secp256k1`).

In ledger intervals, nodes would perform a `signer-status-checkup` NPL round to analyze and audit the liveliness of participating signers. If a node is active and stable, it would distribute its signer address (ie. `rLnoAQgC9wEnSfLpnFpFgu8hz6V27aAAdL`) to its peers. If a signer address apart of the dApp's SignerList is not present during the NPL round, it is deemed inactive during that round and its removal from the signer list is advisable if it persist.

# Testing

`/test` includes some general HP dApps that showcases `DKM`.

```md
1. sudo npm link
2. cd test/(TEST-NAME)/mycontract/src
3. node ../generate-account.js
4. sudo npm link decentralized-key-management
5. sudo HP_CLUSTER_SIZE=10 npm start
```
