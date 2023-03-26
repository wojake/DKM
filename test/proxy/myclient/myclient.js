const HotPocket = require('hotpocket-js-client');
const prompt = require('prompt-sync')();
const fs = require('fs');

// A simple client to interact with the "proxy" test dApp

async function clientApp() {
    async function GetKey(readable = false) {
		if (!fs.existsSync("user.key")) {
        	const newKeyPair = await HotPocket.generateKeys();
        	const saveData = Buffer.from(newKeyPair.privateKey).toString('hex');
        	fs.writeFileSync("user.key", saveData);
    	}
    	var savedPrivateKeyHex = fs.readFileSync("user.key").toString();
    	var userKeyPair = await HotPocket.generateKeys(savedPrivateKeyHex);

		if (!readable) {
			return userKeyPair;
		} else {
			return savedPrivateKeyHex;
		}
	}

    async function Connect() {
		const client = await HotPocket.createClient(['wss://localhost:8081'], await GetKey());
	
		if (!await client.connect()) {
				console.log('Connection failed.');
				return;
		}

		client.on(HotPocket.events.contractOutput, (result) => {
			result.outputs.forEach((o) => console.log(o));
		});
		return client;
	}

    async function RelayTx({TransactionType, Destination, Amount}) {
        const request = {
            TransactionType: TransactionType,
            Destination: Destination,
            Amount: Amount
        }

        var client = await Connect();
        client.submitContractInput(JSON.stringify(request));
    }
    console.log('HotPocket Connected...');
    
    console.log(`1. Relay transaction to dApp`);
    console.log(`2. Exit`);

    const code = prompt("ENTER CODE: ");

    if (code == 1) {
        console.log("\nYou will be relaying a Payment transaction to the dApp.\n");

        console.log("The max amount of XRP that you can use per each relay request is 1 XRP");
        console.log("If you submit a request larger than 1 XRP, the dApp will reject your request !!!\n");
        
        console.log("Also note that if the destination account is invalid or unfunded, the tx will fail as well.");

        // if you don't know an address to choose, use this address: rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe
        const destination = prompt("Destination: ");
        const amount = prompt("Amount: ");

        RelayTx({
            TransactionType: "Payment",
            Destination: destination,
            Amount: amount
        });

    } else {
        return;
    }
}

clientApp();