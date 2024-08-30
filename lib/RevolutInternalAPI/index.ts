import Axios, { AxiosError, type AxiosInstance } from 'axios';
import crypto from "node:crypto";

import * as Responses from './responses';
import * as Requests from './requests';
import URLs from './urls';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36';

export interface T_Config {
    data: Responses.T_Token;
    credentials: string;
    refreshToken: string;
    deviceId: string;
}

export type T_ConfigFn = (() => T_Config) & ((conf: T_Config) => T_Config | undefined);

export default class Revolut {
    private axios: AxiosInstance;

    private tokenId: string;
    private tokenData: Responses.T_Token;
    private credentials: string;
    private refreshToken: string;
    private deviceId: string;

    constructor(private phoneNumber: string, private password: string, private configFn: T_ConfigFn, private userAgent: string = DEFAULT_USER_AGENT) {
        this.tokenId = '';
        this.credentials = '';
        this.refreshToken = '';
        this.deviceId = crypto.randomUUID();
        this.tokenData = {};

        //Needed to set this.axios first otherwise typescript won't realize that its assigned in the `initAxios` function
        this.axios = Axios;
        this.initAxios();
    }

    private initAxios() {
        this.axios = Axios.create({
            headers: {
                'X-Browser-Application': 'BROWSER_EXTENSION',
                'X-Client-Version': '100.0',
                'X-Device-Id': this.deviceId,
                'X-Device-Model': this.userAgent,
                'X-Verify-Password': this.password,
                'User-Agent': this.userAgent,
            },
            withCredentials: true,
        });
    }

    private setToken(): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            let signinPayload: Requests.T_SignIn = {
                phone: this.phoneNumber,
                password: this.password,
                channel: 'APP',
            };

            try {
                let res = await this.axios.post(URLs.signin, signinPayload);
                let data: Responses.T_SignIn = res.data;
                this.tokenId = data.tokenId;

                resolve(true);
            } catch (ex) {
                if (ex instanceof AxiosError) {
                    console.log(ex.response?.data);
                    reject(ex.response?.data);
                }
            }
        });
    }

    private getPublicToken(): Promise<Responses.T_Token> {
        return new Promise(async (resolve) => {
            try {
                let payload: Requests.T_Token = {
                    phone: this.phoneNumber,
                    password: this.password,
                    tokenId: this.tokenId,
                };

                let res = await this.axios.post(URLs.token, payload);
                let data: Responses.T_Token = res.data;

                let credentials = (res.headers['set-cookie'] || ['.=;.'])[0].split(';')[0].split('=')[1] + '=';
                let refreshToken = (res.headers['set-cookie'] || ['.=;.'])[1].split(';')[0].split('=')[1] + '=';

                this.credentials = credentials;
                this.refreshToken = refreshToken;

                if (credentials == '' || refreshToken == '') {
                    throw new Error('Missing credentials or refresh token');
                    return;
                }

                this.configFn({
                    credentials,
                    refreshToken,
                    deviceId: this.deviceId,
                    data,
                });

                resolve(data);
            } catch (ex) {
                if (ex instanceof AxiosError) {
                    let data: Responses.T_Token = ex.response?.data;
                    resolve(data);
                }
            }
        });
    }

    private waitForPublicToken(): Promise<Responses.T_Token> {
        return new Promise(async (resolve, reject) => {
            try {
                let interval = setInterval(async () => {
                    let data = await this.getPublicToken();
                    console.log(data);
                    if (data.tokenExpiryDate) {
                        clearInterval(interval);

                        resolve(data);
                        return;
                    }
                    if (data.code != Responses.E_ErrorCodes.USER_HASNT_PROVIDED_CONSENT) {
                        clearInterval(interval);
                        reject(data);
                        return;
                    }
                }, 1000);
            } catch (ex) {
                reject(ex);
            }
        });
    }

    private getDecryptionKey() {
        let token = Buffer.from(this.credentials, 'base64').toString('utf-8').split(':')[1];
        return token.slice(0, 32);
    }

    private decrypt(data: string): string {
        let cipher = crypto.createDecipheriv("aes-256-ecb", this.getDecryptionKey(), null);
        return Buffer.concat([cipher.update(Buffer.from(data, "base64")), cipher.final()]).toString();
    }

    private getAxiosOptions() {
        let creds = this.credentials;
        let refreshToken = this.refreshToken;

        if (this.tokenData && this.tokenData.user) {
            creds = Buffer.from(`${this.tokenData.user?.id}:${this.tokenData.accessToken}`, 'utf-8').toString('base64');
            if (this.tokenData.refreshCode)
                refreshToken = Buffer.from(this.tokenData.refreshCode, 'utf-8').toString('base64');
        }

        this.credentials = creds;
        this.refreshToken = refreshToken;

        this.configFn({
            ...this.configFn(),
            credentials: creds,
            refreshToken: refreshToken,
        });
        return {
            headers: {
                'X-Api-Authorization': creds,
                'X-Device-Id': this.deviceId,
                Cookie: `credentials=${creds};refresh-token=${refreshToken}`,
            },
        };
    }

    public updateToken(force: boolean = false): Promise<boolean> {
        if (!force && this.tokenData.tokenExpiryDate && this.tokenData.tokenExpiryDate > Date.now()) {
            return Promise.resolve(true);
        }
        return new Promise(async (resolve, reject) => {
            try {
                let payload: Requests.T_UpdateToken = {
                    userId: this.tokenData.user?.id || '',
                    refreshCode: this.tokenData.refreshCode || '',
                };
                let res = await this.axios.put(URLs.token, payload, this.getAxiosOptions());
                let data: Responses.T_Token = res.data;
                if (!data.refreshCode || !data.accessToken) {
                    throw new Error('Unexpected Response. ');
                    return;
                }

                this.refreshToken = data.refreshCode;
                this.tokenData.accessToken = data.accessToken;
                this.tokenData.refreshCode = data.refreshCode;
                this.tokenData.tokenExpiryDate = data.tokenExpiryDate;

                this.configFn({
                    ...this.configFn(),
                    data: this.tokenData,
                });

                resolve(true);
            } catch (ex) {
                reject(ex);
            }
        });
    }

    /**
     * Sign in to the application and resolve with a boolean indicating success.
     * If no configuration is present, sets a new token and waits for a public token.
     * Otherwise, sets the token data, credentials, refresh token, and device ID from the configuration.
     * @returns Promise that resolves with a boolean indicating success or rejects with an error object.
     */
    public signin(): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            try {
                let conf = this.configFn();
                if (conf == null) {
                    await this.setToken();
                    let tokenData = await this.waitForPublicToken();
                    this.tokenData = tokenData;
                } else {
                    this.tokenData = conf.data;
                    this.credentials = conf.credentials;
                    this.refreshToken = conf.refreshToken;
                    this.deviceId = conf.deviceId;
                    await this.updateToken();
                }
                resolve(true);
            } catch (ex) {
                console.log(ex);
                reject(ex);
            }
        });
    }

    /**
     * Retrieve all cards from the current revolut account, return a Promise that resolves to an object containing the data.
     */
    public getCards(): Promise<Responses.T_All> {
        return new Promise(async (resolve, reject) => {
            await this.updateToken();
            try {
                let res = await this.axios(URLs.all, this.getAxiosOptions());
                let data: Responses.T_All = res.data;
                resolve(data);
            } catch (ex) {
                reject(ex);
            }
        });
    }

    /**
     * Retrieves card details for the given UUID.
     * @param uuid The UUID of the card to retrieve details for.
     * @returns A Promise that resolves with the card details.
     * @throws An error if the card with the given UUID is not found.
     */
    public getCard(uuid: string): Promise<Responses.T_FullCardDetails> {
        return new Promise(async (resolve, reject) => {
            await this.updateToken();
            try {
                let res = await this.axios.get(URLs.getCardDetailsURL(uuid), this.getAxiosOptions());
                let data: Responses.T_FullCardDetails = res.data;

                resolve(data);
            } catch (ex) {
                reject(ex);
            }
        });
    }

    /**
     * Retrieve the decrypted card secrets for a given UUID.
     * @param uuid - The UUID of the card to retrieve secrets for.
     * @returns A Promise that resolves with the decrypted card secrets.
     * @throws An error if the card is not found.
     */
    public getCardSecrets(uuid: string): Promise<Responses.T_Details> {
        return new Promise(async (resolve, reject) => {
            await this.updateToken();
            try {
                let res = await this.axios.get(URLs.getCardDetailsURL(uuid), this.getAxiosOptions());
                let data: Responses.T_Details = res.data;
                if (!data.cvv || !data.pan) throw new Error("Card wasn't found");
                data.cvv = this.decrypt(data.cvv);
                data.pan = this.decrypt(data.pan);
                resolve(data);
            } catch (ex) {
                reject(ex);
            }
        });
    }

    /**
     * Deletes a card with the specified uuid and returns the card details.
     * @param uuid - The uuid of the card to delete.
     * @returns A Promise containing the card details of the deleted card.
     * @throws An error if the card details are not found.
     */

    public deleteCard(uuid: string): Promise<Responses.T_FullCardDetails> {
        return new Promise(async (resolve, reject) => {
            await this.updateToken();
            try {
                let res = await this.axios.delete(URLs.getCardDeleteURL(uuid), this.getAxiosOptions());
                let data: Responses.T_FullCardDetails = res.data;
                resolve(data);
            } catch (ex) {
                reject(ex);
            }
        });
    }

    /**
     * Creates a new virtual card with the given name.
     * @todo - Add Support for custom designs
     * @param {string} name - The label to assign to the new virtual card.
     * @returns {Promise<T_Responses['Details']>} - A Promise that resolves to the newly created virtual card details.
     * @throws {Error} - If the card details (CVV or PAN) are not found.
     */
    public newVirtualCard(name: string): Promise<Responses.T_FullCardDetails> {
        return new Promise(async (resolve, reject) => {
            await this.updateToken();
            try {
                let payload: Requests.T_Issue = {
                    label: name,
                    design: 'LIGHT_GREEN_VIRTUAL',
                    disposable: false,
                };

                let res = await this.axios.post(URLs.issue_virtual, payload, this.getAxiosOptions());
                let data: Responses.T_FullCardDetails = res.data;

                resolve(data);
            } catch (ex) {
                reject(ex);
            }
        });
    }
}
