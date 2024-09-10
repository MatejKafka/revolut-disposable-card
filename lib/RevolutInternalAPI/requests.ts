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

export interface T_IssueDisposable {
    design: 'ORIGINAL_DISPOSABLE';
    disposable: boolean;
};

export interface T_UpdateToken {
    refreshCode: string;
    userId: string;
};
