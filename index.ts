#!/usr/bin/env bun

import fs from "node:fs";
import readline from "node:readline/promises";
import process from "node:process";
import path from "node:path";
import Revolut, { type T_Config, type T_ConfigFn, NeedsReauthenticationError } from './lib/RevolutInternalAPI';

const CONFIG_FILE_PATH = "./revolut.json"
let config: { tokens?: T_Config } = fs.existsSync(CONFIG_FILE_PATH) ? JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf8")) : {};
let saveConfig = (conf: typeof config) => fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(conf, null, 4));

let debugLogs = process.argv.length > 2 ? process.argv[2] === "DEBUG" : false

const rl = <any>readline.createInterface({ input: process.stdin, output: process.stdout });
const promptMasked = async (prompt: string) => {
    const maskFn = () => {
        let len = rl.line.length;
        rl.output.moveCursor(-len, 0);
        rl.output.clearLine(1);
        rl.output.write("*".repeat(len));
    };

    rl.input.on("keypress", maskFn);
    let response = await rl.question(prompt)
    rl.input.off("keypress", maskFn);
    return response;
}

(async () => {
    let phoneNumber: string | null = null;
    if (!config.tokens) {
        // no active session, sign in
        console.log("Authentication tokens will be stored at `" + path.resolve(CONFIG_FILE_PATH) + "`.")
        console.log("Phone number and PIN are not stored.")
        console.log("")
        console.log("No previous session found. Signing in...");
        phoneNumber = (await rl.question("Phone number: ")).replace(" ", "");
    }

    let pin = await promptMasked("PIN: ");
    rl.close();

    let revolut = new Revolut(phoneNumber, pin, <T_ConfigFn>((tokenConf?: T_Config) => {
        if (tokenConf == null) {
            return config.tokens;
        } else {
            config.tokens = tokenConf;
            saveConfig(config);
        }
    }), undefined, debugLogs);


    if (!config.tokens) {
        console.log("")
        console.log("Please confirm the sign-in in your Revolut mobile app...")
    }

    try {
        // ensure that we're logged in
        await revolut.signin();
    } catch (NeedsReauthenticationError) {
        // reset config
        config.tokens = undefined;
        saveConfig(config);

        console.error("Seems like the login session expired. This tends to happen when you did not use the client for ~1 month.")
        console.error("I haven't found any way to work around it yet. Please re-run the client and re-authenticate.")
        process.exit(1);
    }

    // find the card ID of a disposable card, or create a new one; Revolut represents each new disposable card separately,
    //  and after it is used, it disappears; the Revolut extension automatically requests a new card on click
    let cards = await revolut.getCards();
    let disposableCard = cards.find(c => c.disposable);
    if (disposableCard == null) {
        disposableCard = await revolut.createDisposableCard();
    }

    let details = await revolut.getCardSecrets(disposableCard.id);

    console.log("")
    // looks better with spaces between every 4 digits, but harder to copy from the terminal
    console.log(details.pan)
    console.log(details.expiry!.month.toString().padStart(2, "0") + "/" + (details.expiry!.year - 2000).toString().padStart(2, "0"))
    console.log(details.cvv)
})()
