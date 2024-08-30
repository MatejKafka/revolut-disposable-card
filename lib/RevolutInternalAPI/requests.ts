export interface T_SignIn {
    phone: string;
    password: string;
    channel: 'APP';
};

export interface T_Token {
    phone: string;
    password: string;
    tokenId: string;
};

export interface T_Issue {
    design: 'LIGHT_GREEN_VIRTUAL' | 'LIGHT_BLUE_VIRTUAL';
    disposable: boolean;
    label: string;
};

export interface T_UpdateToken {
    refreshCode: string;
    userId: string;
};
