# NodeJS Decentralized Key Management framework
This is a framework for HotPocket clusters to manage keys and use the XRP Ledger in a decentralized manner. The `Decentralized Key Management` framework or the `DKM` framework facilitates the management of a dApp's XRPL multi-sig account.

Since HotPocket enables the transfer of data from and to nodes, nodes could distribute addresses, keys and signatures. `DKM` leverages the HotPocket consensus engine for this specifice reason. The XRP Ledger facilitates multi-sig enabled account and with the combination of an account with a disabled master key, we're able to delegate our dApp's XRPL account(s) to our nodes efficiently.


## How it works
HotPocket nodes would locally generate and store their very own unique `Ed25519` seed (ie. `sEdVrdVqAVXYGX8ZizUkzwpWY2dXFzA`). Each node would represent a participating signer, and each signer would be apart of dApp's XRPL account's SignerList, if approved by consensus.

For every 64 ledgers (configurable), nodes would perform a `node-key-checkup` NPL round to analyze and audit the liveliness of participating signers. If a node is stable and active, they would distribute their XRPL address (ie. `rLnoAQgC9wEnSfLpnFpFgu8hz6V27aAAdL`) to its peers. If an address apart of the dApp's SignerList is not present during the NPL round, it is deemed inactive and their address would be removed from the SignerList.

## Terms
- `signer`, as in, an address on the dApp's SignerList which has the ability to sign transactions on behalf of the dApp's XRPL account
- `participating signer`, as in, a HotPocket node's XRPL address that is apart of the dApp's XRPL account's SignerList.
- `active participating signer`, as in, a HotPocket node that is active and stable enough to distribute data reliably.
- `inactive participating signer`, as in, a HotPocket node that is not active or stable enough to distribute data reliably. This HotPocket node is deemed unreliable to become a participating signer until it is active or stable enough.
- `inactive node`, as in, a HotPocket node that isn't participating in consensus or a NPL round. It may be due to the fact that is has temporarily lost connected, low connectivity between >80% of all nodes or vice versa.