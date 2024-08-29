export enum E_ErrorCodes {
    USER_HASNT_PROVIDED_CONSENT = 9035,
    PHONE_OR_AND_PASSCODE_INVALID = 9001,
    ACCESS_CODE_EXPIRED = 9039,
    UNSUPPORTED_DEVICE = 2007,
}

interface T_CardSettings {
    locationSecurityEnabled: boolean;
    magstripeDisabled: boolean;
    atmWithdrawalsDisabled: boolean;
    ecommerceDisabled: boolean;
    contactlessDisabled: boolean;
    initial: boolean;
    pockets: any[];
}

interface T_Delivery {
    status: string;
    trackingChannel?: string;
    method?: string;
    address?: string;
    addressDetails?: T_AddressDetails;
    deliveryUpdateAllowed?: boolean;
    convertedOn?: string;
    ept?: string;
    edt?: string;
}

interface T_AddressDetails {
    city: string;
    country: string;
    postcode: string;
    region?: string;
    streetLine1: string;
    streetLine2?: string;
}

export interface T_FullCardDetails {
    id: string;
    walletId: string;
    state: string;
    virtual: boolean;
    disposable: boolean;
    credit: boolean;
    instalment: boolean;
    customised: boolean;
    brand: string;
    design: string;
    designGroup: string;
    lastFour: string;
    expiryDate: string;
    replaced: boolean;
    createdDate: number;
    replacedCardId?: string;
    productType: string;
    settings: T_CardSettings;
    delivery: T_Delivery;
    usage: number;
    preexpired: boolean;
    applePayEligible: boolean;
    googlePayEligible: boolean;
    cardClickActivationEligible: boolean;
    label?: string;
    lastUsedDate?: number;
    colour?: string;
}

export type T_All = T_FullCardDetails[];

export interface T_Details {
    cvv ?: string;
    pan: string;
    expiry ?: {
        month: number;
        year: number;
    };
};

export interface T_SignIn {
    tokenId: string;
};

export interface T_Token {
    //If error is present:
    code ?: E_ErrorCodes;
    message ?: string;

    //Otherwise:
    accessToken ?: string;
    refreshCode ?: string;
    tokenExpiryDate ?: number;

    user ?: {
        id: string;
        state: 'ACTIVE';
    };
};

export interface T_Current {
    user: {
        id: string;
        individualId: string;
        createdDate: number;
        address: T_AddressDetails;
        birthDate: number[];
        firstName: string;
        lastName: string;
        phone: string;
        email: string;
        emailVerified: boolean;
        state: string;
        referralCode: string;
        code: string;
        kyc: string;
        underReview: boolean;
        locale: string;
        riskAssessed: boolean;
        sof: {
            state: string;
        };
        username: string;
        identityDetails: {
            accountPurpose: string;
        };
        hasProfilePicture: boolean;
        appMode: string;
    };
    wallet: {
        baseCurrency: string;
    };
};