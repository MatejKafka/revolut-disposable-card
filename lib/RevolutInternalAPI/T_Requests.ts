export default interface T_Requests {
    SignIn: {
        phone: string;
        password: string;
        channel: 'APP';
    };
    Token: {
        phone: string;
        password: string;
        tokenId: string;
    };
    Issue: {
        design: 'LIGHT_GREEN_VIRTUAL' | 'LIGHT_BLUE_VIRTUAL';
        disposable: boolean;
        label: string;
    };
    UpdateToken: {
        refreshCode: string;
        userId: string;
    };
};
