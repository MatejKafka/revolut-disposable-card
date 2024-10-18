import Axios, { AxiosError, type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import crypto from "node:crypto";

import * as Responses from './responses';
import * as Requests from './requests';
import urls from './urls';

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

    constructor(private phoneNumber: string | null, private password: string, private configFn: T_ConfigFn, private userAgent: string = DEFAULT_USER_AGENT, debugNetwork: boolean = false) {
        this.tokenId = '';
        this.credentials = '';
        this.refreshToken = '';
        this.deviceId = crypto.randomUUID();
        this.tokenData = {};

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

        if (debugNetwork) {
            this.axios.interceptors.request.use((req: InternalAxiosRequestConfig) => {
                console.error(req.method + " " + req.url + (req.data ? (" " + JSON.stringify(req.data)) : ""));
                return req;
            })

            this.axios.interceptors.response.use((res: AxiosResponse) => {
                console.error(res.status + (res.data ? (" " + JSON.stringify(res.data)) : ""));
                return res;
            }, (err: AxiosError) => {
                console.error(err.status + (err.response && err.response.data ? (" " + JSON.stringify(err.response.data)) : ""));
                return Promise.reject(err);
            })
        }
    }

    private async setToken(): Promise<void> {
        let signinPayload: Requests.T_SignIn = {
            phone: this.phoneNumber!,
            password: this.password,
            channel: 'APP',
        };

        try {
            let res = await this.axios.post(urls.signin, signinPayload);
            let data: Responses.T_SignIn = res.data;
            this.tokenId = data.tokenId;
        } catch (ex) {
            if (ex instanceof Axios.AxiosError) {
                throw ex.response?.data;
            }
        }
    }

    private async getPublicToken(): Promise<Responses.T_Token> {
        try {
            let payload: Requests.T_Token = {
                phone: this.phoneNumber!,
                password: this.password,
                tokenId: this.tokenId,
            };

            let res = await this.axios.post(urls.token, payload);
            let data: Responses.T_Token = res.data;

            let credentials = (res.headers['set-cookie'] || ['.=;.'])[0].split(';')[0].split('=')[1] + '=';
            let refreshToken = (res.headers['set-cookie'] || ['.=;.'])[1].split(';')[0].split('=')[1] + '=';

            this.credentials = credentials;
            this.refreshToken = refreshToken;

            if (credentials == '' || refreshToken == '') {
                throw new Error('Missing credentials or refresh token');
            }

            this.configFn({
                credentials,
                refreshToken,
                deviceId: this.deviceId,
                data,
            });

            return data;
        } catch (ex) {
            if (ex instanceof Axios.AxiosError) {
                return <Responses.T_Token>ex.response?.data;
            }
            throw ex;
        }
    }

    private waitForPublicToken(): Promise<Responses.T_Token> {
        return new Promise(async (resolve, reject) => {
            let interval = setInterval(async () => {
                let data = await this.getPublicToken();
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

                // waiting for user consent, retry after 1000 ms
            }, 1000);
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
            if (this.tokenData.refreshCode) {
                refreshToken = Buffer.from(this.tokenData.refreshCode, 'utf-8').toString('base64');
            }
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

    public async updateToken(force: boolean = false): Promise<void> {
        if (!force && this.tokenData.tokenExpiryDate && this.tokenData.tokenExpiryDate > Date.now()) {
            return;
        }

        let payload: Requests.T_UpdateToken = {
            userId: this.tokenData.user?.id || '',
            refreshCode: this.tokenData.refreshCode || '',
        };
        let res = await this.axios.put(urls.token, payload, this.getAxiosOptions());
        let data: Responses.T_Token = res.data;
        if (!data.refreshCode || !data.accessToken) {
            throw new Error('Unexpected Response');
        }

        this.refreshToken = data.refreshCode;
        this.tokenData.accessToken = data.accessToken;
        this.tokenData.refreshCode = data.refreshCode;
        this.tokenData.tokenExpiryDate = data.tokenExpiryDate;

        this.configFn({
            ...this.configFn(),
            data: this.tokenData,
        });
    }

    /**
     * Sign in to the application and resolve with a boolean indicating success.
     * If no configuration is present, sets a new token and waits for a public token.
     * Otherwise, sets the token data, credentials, refresh token, and device ID from the configuration.
     * @returns Promise that resolves with a boolean indicating success or rejects with an error object.
     */
    public async signin(): Promise<void> {
        let conf = this.configFn();
        if (conf == null) {
            if (this.phoneNumber == null) {
                throw new Error("Phone number was not passed, but there is no logged-in session. " +
                    "Phone number is needed to sign in for the first time.");
            }
            await this.setToken();
            this.tokenData = await this.waitForPublicToken();
        } else {
            this.tokenData = conf.data;
            this.credentials = conf.credentials;
            this.refreshToken = conf.refreshToken;
            this.deviceId = conf.deviceId;
            await this.updateToken();
        }
    }

    /**
     * Retrieve all cards from the current revolut account, return a Promise that resolves to an object containing the data.
     */
    public async getCards(): Promise<Responses.T_All> {
        await this.updateToken();
        let res = await this.axios(urls.all, this.getAxiosOptions());
        return res.data;
    }

    /**
     * Retrieves card details for the given UUID.
     * @param uuid The UUID of the card to retrieve details for.
     * @returns A Promise that resolves with the card details.
     * @throws An error if the card with the given UUID is not found.
     */
    public async getCard(uuid: string): Promise<Responses.T_FullCardDetails> {
        await this.updateToken();
        let res = await this.axios.get(urls.getCardDetailsURL(uuid), this.getAxiosOptions());
        return res.data;
    }

    /**
     * Retrieve the decrypted card secrets for a given UUID.
     * @param uuid - The UUID of the card to retrieve secrets for.
     * @returns A Promise that resolves with the decrypted card secrets.
     * @throws An error if the card is not found.
     */
    public async getCardSecrets(uuid: string): Promise<Responses.T_Details> {
        await this.updateToken();
        let res = await this.axios.get(urls.getCardDetailsURL(uuid), this.getAxiosOptions());
        let data: Responses.T_Details = res.data;
        if (!data.cvv || !data.pan) {
            throw new Error("Card wasn't found");
        }

        data.cvv = this.decrypt(data.cvv);
        data.pan = this.decrypt(data.pan);
        return data;
    }

    /**
     * Deletes a card with the specified uuid and returns the card details.
     * @param uuid - The uuid of the card to delete.
     * @returns A Promise containing the card details of the deleted card.
     * @throws An error if the card details are not found.
     */

    public async deleteCard(uuid: string): Promise<Responses.T_FullCardDetails> {
        await this.updateToken();
        let res = await this.axios.delete(urls.getCardDeleteURL(uuid), this.getAxiosOptions());
        return res.data;
    }

    /**
     * Creates a new disposable virtual card.
     * @returns {Promise<T_Responses['Details']>} - A Promise that resolves to the newly created disposable card details.
     * @throws {Error} - If the card details (CVV or PAN) are not found.
     */
    public async createDisposableCard(): Promise<Responses.T_FullCardDetails> {
        await this.updateToken();

        let res = await this.axios.post(urls.issue_virtual, <Requests.T_IssueDisposable>{
            design: 'ORIGINAL_DISPOSABLE',
            disposable: true,
        }, this.getAxiosOptions());

        return res.data;
    }
}
