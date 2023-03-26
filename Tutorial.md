> Note: This document presumes that you have a basic understanding of how the XRP Ledger and HotPocket operates

## Installation
If you haven't installed DKM yet, it's available on npm:
```
npm install decentralized-key-management
```

If you want to test out DKM's functionality, head over to `/test/basic/mycontract` and initialize the packages in `packages.json`.

Ensure that a new seed is provided in `/dist/DKM/setup/bootstrap_state.json` under `config.account_seed` using https://xrpl.org/xrp-testnet-faucet.html.

Run `sudo HP_CLUSTER_SIZE=5 npm start` in `/test/basic/mycontract` and check the dApp's XRPL account activity on a blockchain explorer (https://testnet.xrpl.org/).