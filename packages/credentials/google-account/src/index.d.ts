/**
 * Google Native Authentication & Multi-Tenant UUIDv7 Workspace Provider.
 *
 * Implements the DeepSeekAccount service interface so all web UI account controllers,
 * session managers, and client dialogs seamlessly authenticate via Google OAuth 2.0.
 *
 * @module @deepseek-ai/dsh-google-account
 */
import { Context, Service } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { AccountBonusBatch, AccountBonusOrderId, AccountClientMetadata, AccountDetails, AccountUserId, AccountView, SignInAttemptId, SignInAttemptView } from './types.ts';
export type { AccountBonusBatch, AccountBonusNotification, AccountBonusOrderId, AccountClientMetadata, AccountDetails, AccountProfile, AccountUserId, AccountWallet, AccountLinks, AccountView, SignInAttemptId, SignInAttemptView, SignInErrorCode, } from './types.ts';
export { isRunningAccountTask, installAccountTaskCancellation } from './account-tasks.ts';
declare module '@deepseek-ai/cordis' {
    interface Events {
        /** Local grant removal has completed.
         * @mode emit
         */
        'deepseek-account/signed-out'(): void;
    }
    interface Context {
        deepseekAccount: DeepSeekAccount;
        userAccount: DeepSeekAccount;
    }
}
/** Host-only credentials for an embedded Platform document; never expose through account RPC. */
export interface PlatformSession {
    readonly origin: string;
    readonly token: string;
    readonly userId: AccountUserId | null;
    readonly embeddedPageDist?: string;
    readonly requestHeaders?: Readonly<Record<string, string>>;
}
/** Account operations; only Host consumers can obtain a request credential. */
export declare abstract class DeepSeekAccount extends Service {
    constructor(ctx: Context);
    abstract getState(): Promise<AccountView>;
    abstract getProfile(client: AccountClientMetadata): Promise<AccountDetails['profile'] | null>;
    abstract getBalance(client: AccountClientMetadata): Promise<AccountDetails['balance'] | null>;
    abstract getUnnotifiedBonuses(client: AccountClientMetadata): Promise<AccountBonusBatch | null>;
    abstract recordBonusNotified(accountId: AccountUserId, orderId: AccountBonusOrderId): Promise<void>;
    abstract startSignIn(client: AccountClientMetadata): Promise<SignInAttemptView>;
    abstract completeSignIn(id: SignInAttemptId): Promise<AccountView>;
    abstract cancelSignIn(id: SignInAttemptId): Promise<void>;
    abstract signOut(): Promise<void>;
    abstract getPlatformSession(): Promise<PlatformSession | null>;
}
/** UserAccount alias for DeepSeekAccount service. */
export type UserAccount = DeepSeekAccount;
export declare const UserAccount: typeof DeepSeekAccount;
export interface Config {
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    callbackUrl?: string | undefined;
}
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    clientId: Schema<string, string, "defined">;
    clientSecret: Schema<string, string, "defined">;
    callbackUrl: Schema<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    clientId: Schema<string, string, "defined">;
    clientSecret: Schema<string, string, "defined">;
    callbackUrl: Schema<string, string, "defined">;
}>>, "plain">;
/**
 * Google Native Account Provider.
 */
export declare class GoogleAccount extends DeepSeekAccount {
    static Config: Schema<Schemastery.ObjectS<NoInfer<{
        clientId: Schema<string, string, "defined">;
        clientSecret: Schema<string, string, "defined">;
        callbackUrl: Schema<string, string, "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        clientId: Schema<string, string, "defined">;
        clientSecret: Schema<string, string, "defined">;
        callbackUrl: Schema<string, string, "defined">;
    }>>, "plain">;
    private readonly userStore;
    private readonly clientId;
    private readonly clientSecret;
    private readonly callbackUrl;
    private attempt;
    private readonly listeners;
    constructor(ctx: Context, config: Config);
    private registerWebRoutes;
    private handleGoogleCallback;
    getState(): Promise<AccountView>;
    getProfile(_client: AccountClientMetadata): Promise<AccountDetails['profile'] | null>;
    getBalance(_client: AccountClientMetadata): Promise<AccountDetails['balance'] | null>;
    getUnnotifiedBonuses(_client: AccountClientMetadata): Promise<AccountBonusBatch | null>;
    ackBonusNotified(_accountId: AccountUserId, _orderId: AccountBonusOrderId, _client: AccountClientMetadata): Promise<boolean>;
    startSignIn(client: AccountClientMetadata, _callbackOrigin: string, _loginSource: 'web' | 'desktop'): Promise<AccountView>;
    cancelSignIn(id: SignInAttemptId): Promise<AccountView>;
    signOut(_client: AccountClientMetadata): Promise<AccountView>;
    watch(signal: AbortSignal, _includeIdentityChanges?: boolean): AsyncIterable<AccountView>;
    resolveToken(_url: string): Promise<string | undefined>;
    rejectToken(_token: string): Promise<void>;
    getPlatformSession(): Promise<PlatformSession | null>;
    getDeviceIdentity(): Promise<{
        deviceId?: string;
        userId?: AccountUserId;
        osVersion: string;
    }>;
    private changed;
}
export default GoogleAccount;
//# sourceMappingURL=index.d.ts.map