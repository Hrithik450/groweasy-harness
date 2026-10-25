/**
 * Google Native Authentication & Multi-Tenant UUIDv7 Workspace Provider.
 *
 * Implements the DeepSeekAccount service interface so all web UI account controllers,
 * session managers, and client dialogs seamlessly authenticate via Google OAuth 2.0.
 *
 * @module @deepseek-ai/dsh-google-account
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { Service } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { exchangeCodeForTokens, fetchGoogleUserProfile, getGoogleAuthUrl } from "./oauth.js";
import { UserStore } from "./user-store.js";
import { provisionUserWorkspace } from "./workspace-provisioner.js";
export { isRunningAccountTask, installAccountTaskCancellation } from "./account-tasks.js";
/** Account operations; only Host consumers can obtain a request credential. */
export class DeepSeekAccount extends Service {
    constructor(ctx) {
        super(ctx, 'deepseekAccount');
    }
}
export const UserAccount = DeepSeekAccount;
export const Config = Schema.object({
    clientId: Schema.string().default(''),
    clientSecret: Schema.string().role('secret').default(''),
    callbackUrl: Schema.string().default('http://localhost:3000/auth/google/callback'),
});
/**
 * Google Native Account Provider.
 */
export class GoogleAccount extends DeepSeekAccount {
    static Config = Config;
    userStore;
    clientId;
    clientSecret;
    callbackUrl;
    attempt = undefined;
    listeners = new Set();
    constructor(ctx, config) {
        super(ctx);
        this.userStore = new UserStore();
        // Prefer process.env if set, otherwise config
        this.clientId = process.env.GOOGLE_CLIENT_ID || config.clientId || '';
        this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || config.clientSecret || '';
        this.callbackUrl = process.env.GOOGLE_CALLBACK_URL || config.callbackUrl || 'http://localhost:3000/auth/google/callback';
        // Initialize anonymous workspace for immediate out-of-the-box readiness
        const initialAnonymousId = this.userStore.getOrCreateAnonymousId();
        provisionUserWorkspace(initialAnonymousId);
        // Register Webserver HTTP routes when webServer is mounted
        ctx.inject(['webServer'], (webCtx) => {
            this.registerWebRoutes(webCtx);
        });
    }
    registerWebRoutes(webCtx) {
        // 1. Direct initiate route: /auth/google
        webCtx.webServer.register({
            kind: 'exact',
            path: '/auth/google',
            handler: (req, res) => {
                const state = randomBytes(16).toString('hex');
                const attemptId = randomUUID();
                const authUrl = getGoogleAuthUrl(this.clientId, this.callbackUrl, state);
                const rawCookies = req.headers.cookie || '';
                const cookieMatch = /dsh-user-id=([0-9a-fA-F-]+)/.exec(rawCookies);
                const host = req.headers.host || 'localhost:3000';
                const reqUrl = new URL(req.url || '', `http://${host}`);
                const queryUserId = reqUrl.searchParams.get('anonymousUserId');
                const clientAnonymousUserId = queryUserId || cookieMatch?.[1] || undefined;
                this.attempt = {
                    id: attemptId,
                    state,
                    view: { id: attemptId, phase: 'waiting-browser', authorizeUrl: authUrl },
                    createdAt: Date.now(),
                    clientAnonymousUserId,
                };
                this.changed();
                res.writeHead(302, { Location: authUrl });
                res.end();
            },
        });
        // 2. Callback exchange route: /auth/google/callback
        webCtx.webServer.register({
            kind: 'exact',
            path: '/auth/google/callback',
            handler: async (req, res) => {
                await this.handleGoogleCallback(req, res);
            },
        });
    }
    async handleGoogleCallback(req, res) {
        try {
            const host = req.headers.host || 'localhost:3000';
            const reqUrl = new URL(req.url || '', `http://${host}`);
            const code = reqUrl.searchParams.get('code');
            const error = reqUrl.searchParams.get('error');
            if (error || !code) {
                if (this.attempt) {
                    this.attempt.view = { id: this.attempt.id, phase: 'failed', errorCode: 'protocol' };
                    this.changed();
                }
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end('<h3>Authentication failed or cancelled by user.</h3><script>setTimeout(() => window.close(), 2000);</script>');
                return;
            }
            // Mark attempt as exchanging
            if (this.attempt) {
                this.attempt.view = { id: this.attempt.id, phase: 'exchanging' };
                this.changed();
            }
            // 1. Exchange code for Google tokens
            const tokens = await exchangeCodeForTokens(this.clientId, this.clientSecret, this.callbackUrl, code);
            // 2. Fetch Google user profile
            const googleProfile = await fetchGoogleUserProfile(tokens.accessToken);
            // 3. Link Google account to current UUIDv7
            const rawCookies = req.headers.cookie || '';
            const cookieMatch = /dsh-user-id=([0-9a-fA-F-]+)/.exec(rawCookies);
            const preferredUserId = this.attempt?.clientAnonymousUserId || cookieMatch?.[1];
            const user = this.userStore.loginWithGoogle(googleProfile, preferredUserId);
            // 4. Provision their multi-tenant filesystem hierarchy
            provisionUserWorkspace(user.id);
            // 5. Update attempt state to succeeded
            if (this.attempt) {
                this.attempt.view = { id: this.attempt.id, phase: 'succeeded' };
            }
            this.changed();
            // 6. Return auto-closing HTML response to popup
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<!DOCTYPE html>
<html>
<head><title>Authentication Successful</title></head>
<body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;">
  <div style="text-align: center; padding: 2rem; border-radius: 12px; background: #1e293b; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
    <h2 style="color: #22c55e; margin-bottom: 0.5rem;">Signed in as ${googleProfile.name}</h2>
    <p style="color: #94a3b8;">User ID: <code style="color: #38bdf8;">${user.id}</code></p>
    <p style="color: #94a3b8;">Welcome back! This window will close automatically...</p>
  </div>
  <script>
    try {
      localStorage.setItem('dsh.user.id.v7', '${user.id}');
      document.cookie = 'dsh-user-id=${user.id}; Path=/; Max-Age=315360000; SameSite=Lax';
    } catch (e) {}
    if (window.opener) {
      setTimeout(() => window.close(), 1200);
    } else {
      setTimeout(() => { window.location.href = '/'; }, 1500);
    }
  </script>
</body>
</html>`);
        }
        catch (err) {
            if (this.attempt) {
                this.attempt.view = { id: this.attempt.id, phase: 'failed', errorCode: 'network' };
                this.changed();
            }
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h3>Login error: ${String(err)}</h3>`);
        }
    }
    async getState() {
        const user = this.userStore.getCurrentUser();
        const attempt = this.attempt?.view ?? null;
        return {
            status: user ? 'credential-stored' : 'signed-out',
            attempt: user && attempt?.phase === 'succeeded' ? null : attempt,
            links: { usageUrl: '', topUpUrl: '' },
        };
    }
    async getProfile(_client) {
        const user = this.userStore.getCurrentUser();
        if (!user)
            return null;
        return {
            status: 'ready',
            value: {
                id: user.id,
                name: user.name ?? 'Google User',
                contact: user.email ?? null,
                avatarUrl: user.picture ?? null,
            },
        };
    }
    async getBalance(_client) {
        return { status: 'ready', value: [], bonusWallets: [] };
    }
    async getUnnotifiedBonuses(_client) {
        return null;
    }
    async ackBonusNotified(_accountId, _orderId, _client) {
        return false;
    }
    async startSignIn(client, _callbackOrigin, _loginSource) {
        const state = randomBytes(16).toString('hex');
        const attemptId = randomUUID();
        const authUrl = getGoogleAuthUrl(this.clientId, this.callbackUrl, state);
        this.attempt = {
            id: attemptId,
            state,
            view: {
                id: attemptId,
                phase: 'waiting-browser',
                authorizeUrl: authUrl,
            },
            createdAt: Date.now(),
            clientAnonymousUserId: client.anonymousUserId,
        };
        this.changed();
        return this.getState();
    }
    async cancelSignIn(id) {
        if (this.attempt?.id === id) {
            this.attempt.view = { id, phase: 'cancelled' };
            this.changed();
        }
        return this.getState();
    }
    async signOut(_client) {
        this.userStore.signOut();
        this.attempt = undefined;
        this.ctx.emit('deepseek-account/signed-out');
        this.changed();
        return this.getState();
    }
    async *watch(signal, _includeIdentityChanges = false) {
        let dirty = true;
        let wake;
        const wakeUp = () => { dirty = true; wake?.(); };
        const changed = () => { wakeUp(); };
        this.listeners.add(changed);
        signal.addEventListener('abort', wakeUp, { once: true });
        try {
            while (!signal.aborted) {
                if (dirty) {
                    dirty = false;
                    yield await this.getState();
                    continue;
                }
                await new Promise((resolve) => { wake = resolve; });
            }
        }
        finally {
            this.listeners.delete(changed);
            signal.removeEventListener('abort', wakeUp);
        }
    }
    async resolveToken(_url) {
        return undefined;
    }
    async rejectToken(_token) { }
    async getPlatformSession() {
        return null;
    }
    async getDeviceIdentity() {
        const anonymousId = this.userStore.getOrCreateAnonymousId();
        return {
            deviceId: anonymousId,
            userId: (this.userStore.getCurrentUser()?.id ?? anonymousId),
            osVersion: process.version,
        };
    }
    changed() {
        for (const listener of this.listeners)
            listener(false);
    }
}
export default GoogleAccount;
//# sourceMappingURL=index.js.map