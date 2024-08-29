#!/usr/bin/env bun

import fs from "node:fs";
import readline from "node:readline/promises";
import process from "node:process";
import Revolut, { type T_Config, type T_ConfigFn } from './lib/RevolutInternalAPI';

const CONFIG_FILE_PATH = "./revolut.json"
let config: { phoneNumber?: string, cardId?: string, tokens?: T_Config } =
    fs.existsSync(CONFIG_FILE_PATH) ? JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf8")) : {};
let saveConfig = (conf: typeof config) => fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(conf, null, 4));

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
    if (!config.phoneNumber) {
        console.log("The phone number will be stored at `" + CONFIG_FILE_PATH + "`.");
        config.phoneNumber = (await rl.question("Phone number: ")).replace(" ", "");
        saveConfig(config);
    }

    let pin = await promptMasked("PIN: ");
    rl.close();

    let revolut = new Revolut(config.phoneNumber!, pin, <T_ConfigFn>((tokenConf?: T_Config) => {
        if (tokenConf == null) {
            return config.tokens;
        } else {
            config.tokens = tokenConf;
            saveConfig(config);
        }
    }));

    await revolut.signin();

    if (!config.cardId) {
        let cards = await revolut.getCards();
        let disposableCards = cards.filter(c => c.disposable).map(c => c.id);
        if (disposableCards.length === 0) {
            throw new Error("No disposable cards are registered. Create a new disposable card in the Revolut mobile app.");
        }

        config.cardId = disposableCards[0];
        saveConfig(config);
    }

    let details = await revolut.getCardSecrets(config.cardId)

    // format card number as "xxxx xxxx xxxx xxxx"
    let panArr = []
    for (let i = 0; i < 16; i += 4) {
        panArr.push(details.pan.slice(i, i + 4))
    }

    console.log("")
    console.log(panArr.join(" "))
    console.log(details.expiry!.month.toString().padStart(2, "0") + "/" + (details.expiry!.year - 2000).toString().padStart(2, "0"))
    console.log(details.cvv)
})()
