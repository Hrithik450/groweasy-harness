/**
 * Google Native Authentication & Multi-Tenant UUIDv7 Workspace Provider.
 *
 * Implements the DeepSeekAccount service interface so all web UI account controllers,
 * session managers, and client dialogs seamlessly authenticate via Google OAuth 2.0.
 *
 * @module @deepseek-ai/dsh-google-account
 */

import { randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context, Service } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type WebServer from '@deepseek-ai/dsh-host-webserver'
import type {
  AccountBonusBatch,
  AccountBonusOrderId,
  AccountClientMetadata,
  AccountDetails,
  AccountUserId,
  AccountView,
  SignInAttemptId,
  SignInAttemptView,
} from './types.ts'
import { exchangeCodeForTokens, fetchGoogleUserProfile, getGoogleAuthUrl } from './oauth.ts'
import { UserStore } from './user-store.ts'
import { provisionUserWorkspace } from './workspace-provisioner.ts'

export type {
  AccountBonusBatch,
  AccountBonusNotification,
  AccountBonusOrderId,
  AccountClientMetadata,
  AccountDetails,
  AccountProfile,
  AccountUserId,
  AccountWallet,
  AccountLinks,
  AccountView,
  SignInAttemptId,
  SignInAttemptView,
  SignInErrorCode,
} from './types.ts'
export { isRunningAccountTask, installAccountTaskCancellation } from './account-tasks.ts'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** Local grant removal has completed.
     * @mode emit
     */
    'deepseek-account/signed-out'(): void
  }
  interface Context {
    deepseekAccount: DeepSeekAccount
    userAccount: DeepSeekAccount
  }
}

/** Host-only credentials for an embedded Platform document; never expose through account RPC. */
export interface PlatformSession {
  readonly origin: string
  readonly token: string
  /** Stable issuer account ID from the last successful profile read; null requires disposable browser storage. */
  readonly userId: AccountUserId | null
  /** Optional dist query value selecting the embedded frontend deployment. */
  readonly embeddedPageDist?: string
  /** Host-only deployment request headers; the consuming client adds its own dynamic identity, and neither reaches renderer bootstrap. */
  readonly requestHeaders?: Readonly<Record<string, string>>
}

/** Account operations; only Host consumers can obtain a request credential. */
export abstract class DeepSeekAccount extends Service {
  /** @param ctx - context owning this account implementation. */
  constructor(ctx: Context) { super(ctx, 'deepseekAccount') }
  /**
   * Read stored-account presence and the latest login attempt.
   * @returns a snapshot without credentials or PKCE secrets.
   */
  abstract getState(): Promise<AccountView>
  /**
   * Query Platform profile independently of wallet balances.
   * A ready result whose stable profile ID first becomes available or changes notifies identity-enabled watch
   * consumers, so they re-read getPlatformSession; repeated IDs stay silent.
   * @param client - identity of the requesting UI for this call.
   * @returns profile outcome, or null if signed out or the grant changed during the query.
   */
  abstract getProfile(client: AccountClientMetadata): Promise<AccountDetails['profile'] | null>
  /**
   * Query Platform recharge and bonus wallet balances independently of profile data.
   * @param client - identity of the requesting UI for this call.
   * @returns balance outcome, or null if signed out or the grant changed during the query.
   */
  abstract getBalance(client: AccountClientMetadata): Promise<AccountDetails['balance'] | null>
  /**
   * Query the granted bonuses Platform has not yet recorded as displayed.
   * @param client - identity of the requesting UI for this call; its language selects the server-authored message.
   * @returns bonuses with their account, or null if signed out or the grant changed during the query.
   */
  abstract getUnnotifiedBonuses(client: AccountClientMetadata): Promise<AccountBonusBatch | null>
  /**
   * Record one displayed bonus as notified for the account it belongs to.
   * @param accountId - account the notification was read for; a different current account is never acknowledged.
   * @param orderId - granted bonus order the user saw.
   * @param client - identity of the requesting UI for this call.
   * @returns true once Platform records the acknowledgement; false if signed out or the account changed.
   */
  abstract ackBonusNotified(accountId: AccountUserId, orderId: AccountBonusOrderId, client: AccountClientMetadata): Promise<boolean>
  /**
   * Join an active attempt or start browser authorization.
   * @param client - identity of the requesting UI; a new attempt captures it, and joining retains the original attempt's identity.
   * @param callbackOrigin - browser-accessible loopback HTTP origin, including any SSH local port.
   * @param loginSource - initiating UI, used to return from a failed exchange.
   * @returns the initial snapshot without waiting for browser approval.
   */
  abstract startSignIn(client: AccountClientMetadata, callbackOrigin: string, loginSource: 'web' | 'desktop'): Promise<AccountView>
  /**
   * Cancel only the named attempt; committing attempts settle before returning.
   * @param id - attempt identity from this Host.
   * @returns state after cancellation or an already-started commit.
   */
  abstract cancelSignIn(id: SignInAttemptId): Promise<AccountView>
  /**
   * Remove the local grant while retaining API keys; the provider revokes it in the background.
   * @param client - identity of the requesting UI, captured for the background revocation retries.
   * @returns the signed-out state after local removal; remote failures never restore the grant.
   */
  abstract signOut(client: AccountClientMetadata): Promise<AccountView>
  /**
   * Subscribe to snapshots including a complete initial state.
   * @param signal - subscription lifetime; ending it never cancels login.
   * @param includeIdentityChanges - also notify when cached Platform identity changes; defaults to false.
   * @returns complete snapshots as account state changes.
   */
  abstract watch(signal: AbortSignal, includeIdentityChanges?: boolean): AsyncIterable<AccountView>
  /**
   * Resolve a credential only for the inference origin allowed by the provider.
   * @param url - actual request destination or API base URL.
   * @returns stored token, or undefined for other origins or a signed-out account.
   */
  abstract resolveToken(url: string): Promise<string | undefined>
  /**
   * Remove an inference-rejected token only while it still matches the stored login.
   * @param token - token captured by the rejected inference request.
   * @returns after matching credentials are removed and the expiry notification is emitted.
   */
  abstract rejectToken(token: string): Promise<void>
  /**
   * Read credentials for the configured Platform origin, bound to their issuing environment, and
   * pair them with the account ID from the last successful profile read; no profile request is made.
   * @returns a Host-only snapshot, or null while signed out or when the credential changed during the read.
   */
  abstract getPlatformSession(): Promise<PlatformSession | null>
  /**
   * Read existing login identity without creating a device or returning credentials.
   * @returns optional device/account identifiers and the provider's OS version string.
   */
  abstract getDeviceIdentity(): Promise<{ deviceId?: string; userId?: AccountUserId; osVersion: string }>
}

/** UserAccount alias for DeepSeekAccount service. */
export type UserAccount = DeepSeekAccount
export const UserAccount = DeepSeekAccount

/** Merge Cookie header pairs by case-sensitive name, retaining unrelated cookies.
 * @param base - existing request cookies.
 * @param override - deployment cookies whose values take precedence.
 * @returns one Cookie header with at most one pair per name.
 */
export function mergePlatformCookies(base: string, override: string): string {
  const cookies = new Map<string, string>()
  for (const header of [base, override]) {
    for (const pair of header.split(';')) {
      const separator = pair.indexOf('=')
      if (separator < 1) continue
      cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim())
    }
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

/**
 * Identify native desktop API requests; null leaves non-desktop requests unchanged.
 * @param platform - Operating system supplied by the desktop composition.
 * @returns Platform request headers shared by account and update-policy clients.
 */
export function desktopClientHeaders(platform: 'darwin' | 'win32' | null): Record<string, string> {
  if (platform === null) return {}
  return { 'x-client-platform': platform === 'win32' ? 'desktop-win' : 'desktop-mac' }
}

/**
 * Build the Platform client identity headers for one call.
 * @param platform - Operating system supplied by the desktop composition; null identifies the client as web.
 * @param client - identity of the requesting UI for this call.
 * @returns the five client headers; the bundle ID is intentionally empty.
 */
export function platformClientHeaders(platform: 'darwin' | 'win32' | null, client: AccountClientMetadata): Record<string, string> {
  return {
    'x-client-bundle-id': '',
    'x-client-platform': 'web',
    ...desktopClientHeaders(platform),
    'x-client-version': client.version,
    'x-client-locale': platformWireLocale(client.locale),
    'x-client-timezone-offset': String(client.timezoneOffsetSeconds),
  }
}

/**
 * Reduce a caller's UI language to the region-tagged Platform locale.
 * Shares one normalization with the header and with request body locale fields.
 * @param locale - active UI language such as `zh-CN`, `zh_TW`, or `en-US`.
 * @returns the region-tagged Platform locale for that language, `zh_CN` or `en_US`.
 */
export function platformWireLocale(locale: string): 'zh_CN' | 'en_US' {
  return locale.toLowerCase().split(/[-_]/)[0] === 'zh' ? 'zh_CN' : 'en_US'
}

export interface Config {
  clientId?: string | undefined
  clientSecret?: string | undefined
  callbackUrl?: string | undefined
}

export const Config = Schema.object({
  clientId: Schema.string().default(''),
  clientSecret: Schema.string().role('secret').default(''),
  callbackUrl: Schema.string().default('http://localhost:3000/auth/google/callback'),
})

interface PendingAttempt {
  id: SignInAttemptId
  state: string
  view: SignInAttemptView
  createdAt: number
  clientAnonymousUserId?: string | undefined
}

/**
 * Google Native Account Provider.
 */
export class GoogleAccount extends DeepSeekAccount {
  static Config = Config

  private readonly userStore: UserStore
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly callbackUrl: string
  private attempt: PendingAttempt | undefined = undefined
  private readonly listeners = new Set<(identityOnly: boolean) => void>()

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.userStore = new UserStore()

    // Prefer process.env if set, otherwise config
    this.clientId = process.env.GOOGLE_CLIENT_ID || config.clientId || ''
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || config.clientSecret || ''
    this.callbackUrl = process.env.GOOGLE_CALLBACK_URL || config.callbackUrl || 'http://localhost:3000/auth/google/callback'

    // Initialize anonymous workspace for immediate out-of-the-box readiness
    const initialAnonymousId = this.userStore.getOrCreateAnonymousId()
    provisionUserWorkspace(initialAnonymousId)

    // Register Webserver HTTP routes when webServer is mounted
    ctx.inject(['webServer'], (webCtx: Context & { webServer: WebServer }) => {
      this.registerWebRoutes(webCtx)
    })
  }

  private registerWebRoutes(webCtx: Context & { webServer: WebServer }): void {
    const callbackPaths = new Set<string>([
      '/auth/google/callback',
      '/api/auth/callback/google',
    ])
    try {
      const parsedPath = new URL(this.callbackUrl).pathname
      if (parsedPath) callbackPaths.add(parsedPath)
    } catch {}

    const initiatePaths = new Set<string>([
      '/auth/google',
      '/api/auth/google',
    ])

    const handleInitiate = (req: IncomingMessage, res: ServerResponse) => {
      const state = randomBytes(16).toString('hex')
      const attemptId = randomUUID() as SignInAttemptId
      const authUrl = getGoogleAuthUrl(this.clientId, this.callbackUrl, state)

      const rawCookies = req.headers.cookie || ''
      const cookieMatch = /dsh-user-id=([0-9a-fA-F-]+)/.exec(rawCookies)
      const host = req.headers.host || 'localhost:3000'
      const reqUrl = new URL(req.url || '', `http://${host}`)
      const queryUserId = reqUrl.searchParams.get('anonymousUserId')
      const clientAnonymousUserId = queryUserId || cookieMatch?.[1] || undefined

      this.attempt = {
        id: attemptId,
        state,
        view: { id: attemptId, phase: 'waiting-browser', authorizeUrl: authUrl },
        createdAt: Date.now(),
        clientAnonymousUserId,
      }
      this.changed()

      res.writeHead(302, { Location: authUrl })
      res.end()
    }

    const handleCallback = async (req: IncomingMessage, res: ServerResponse) => {
      await this.handleGoogleCallback(req, res)
    }

    for (const path of initiatePaths) {
      webCtx.webServer.register({
        kind: 'exact',
        path,
        handler: handleInitiate,
      })
    }

    for (const path of callbackPaths) {
      webCtx.webServer.register({
        kind: 'exact',
        path,
        handler: handleCallback,
      })
    }
  }

  private async handleGoogleCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const host = req.headers.host || 'localhost:3000'
      const reqUrl = new URL(req.url || '', `http://${host}`)
      const code = reqUrl.searchParams.get('code')
      const error = reqUrl.searchParams.get('error')

      if (error || !code) {
        if (this.attempt) {
          this.attempt.view = { id: this.attempt.id, phase: 'failed', errorCode: 'protocol' }
          this.changed()
        }
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Authentication Cancelled</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0c0d0f; color: #f3f4f6;">
  <div style="max-width: 360px; width: 90%; background: #141518; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); padding: 24px; text-align: center;">
    <h3 style="font-size: 15px; font-weight: 600; color: #f3f4f6; margin: 0 0 6px;">Authentication Cancelled</h3>
    <p style="font-size: 12.5px; color: #8a8f98; margin: 0 0 16px;">The login request was cancelled or incomplete.</p>
    <button onclick="window.close()" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); color: #f3f4f6; border-radius: 6px; padding: 6px 14px; font-size: 12px; cursor: pointer;">Close</button>
  </div>
  <script>setTimeout(() => window.close(), 1800);</script>
</body>
</html>`)
        return
      }

      // Mark attempt as exchanging
      if (this.attempt) {
        this.attempt.view = { id: this.attempt.id, phase: 'exchanging' }
        this.changed()
      }

      // 1. Exchange code for Google tokens
      let tokens
      try {
        tokens = await exchangeCodeForTokens(this.clientId, this.clientSecret, this.callbackUrl, code)
      } catch (err) {
        const reqRedirectUri = `http://${host}${reqUrl.pathname}`
        if (reqRedirectUri !== this.callbackUrl) {
          tokens = await exchangeCodeForTokens(this.clientId, this.clientSecret, reqRedirectUri, code)
        } else {
          throw err
        }
      }

      // 2. Fetch Google user profile
      const googleProfile = await fetchGoogleUserProfile(tokens.accessToken)

      // 3. Link Google account to current UUIDv7
      const rawCookies = req.headers.cookie || ''
      const cookieMatch = /dsh-user-id=([0-9a-fA-F-]+)/.exec(rawCookies)
      const preferredUserId = this.attempt?.clientAnonymousUserId || cookieMatch?.[1]
      const user = this.userStore.loginWithGoogle(googleProfile, preferredUserId)

      // 4. Provision their multi-tenant filesystem hierarchy
      provisionUserWorkspace(user.id)

      // 5. Update attempt state to succeeded
      if (this.attempt) {
        this.attempt.view = { id: this.attempt.id, phase: 'succeeded' }
      }
      this.changed()

      // 6. Return auto-closing HTML response to popup
      const avatarHtml = googleProfile.picture
        ? `<div style="position: relative; width: 56px; height: 56px; margin: 0 auto 16px;">
             <img src="${googleProfile.picture}" alt="" style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255, 255, 255, 0.12);" />
             <div style="position: absolute; bottom: -2px; right: -2px; width: 18px; height: 18px; background: #10b981; border: 2.5px solid #141518; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
               <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
             </div>
           </div>`
        : `<div style="width: 48px; height: 48px; margin: 0 auto 16px; border-radius: 50%; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center;">
             <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
           </div>`

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signed In</title>
  <style>
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  </style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'SF Pro Text', Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0c0d0f; color: #f3f4f6; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 380px; width: 90%; background: #141518; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); padding: 28px 24px 22px; text-align: center; position: relative; overflow: hidden; box-sizing: border-box;">
    ${avatarHtml}
    <h2 style="font-size: 16px; font-weight: 600; color: #f3f4f6; margin: 0 0 4px; letter-spacing: -0.01em;">${googleProfile.name}</h2>
    <p style="font-size: 13px; color: #8a8f98; margin: 0 0 18px;">${googleProfile.email || 'Authenticated'}</p>
    
    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 10px 12px; margin-bottom: 18px; text-align: left;">
      <div style="font-size: 11px; font-weight: 500; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Workspace Identity</div>
      <code style="display: block; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11.5px; color: #cbd5e1; word-break: break-all;">${user.id}</code>
    </div>

    <div style="font-size: 12px; color: #6b7280; display: flex; align-items: center; justify-content: center; gap: 6px;">
      <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #3b82f6; animation: pulse 1.5s infinite;"></span>
      <span>Closing window...</span>
    </div>

    <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: rgba(255, 255, 255, 0.05);">
      <div id="bar" style="height: 100%; width: 0%; background: #3b82f6; transition: width 1.2s cubic-bezier(0.4, 0, 0.2, 1);"></div>
    </div>
  </div>
  <script>
    try {
      localStorage.setItem('dsh.user.id.v7', '${user.id}');
      document.cookie = 'dsh-user-id=${user.id}; Path=/; Max-Age=315360000; SameSite=Lax';
    } catch (e) {}
    requestAnimationFrame(() => {
      setTimeout(() => {
        const bar = document.getElementById('bar');
        if (bar) bar.style.width = '100%';
      }, 50);
    });
    if (window.opener) {
      setTimeout(() => window.close(), 1250);
    } else {
      setTimeout(() => { window.location.href = '/'; }, 1400);
    }
  </script>
</body>
</html>`)
    } catch (err) {
      if (this.attempt) {
        this.attempt.view = { id: this.attempt.id, phase: 'failed', errorCode: 'network' }
        this.changed()
      }
      res.writeHead(500, { 'Content-Type': 'text/html' })
      res.end(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Login Error</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0c0d0f; color: #f3f4f6;">
  <div style="max-width: 380px; width: 90%; background: #141518; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); padding: 24px; text-align: center;">
    <h3 style="font-size: 15px; color: #ef4444; margin: 0 0 8px;">Authentication Error</h3>
    <p style="font-size: 12.5px; color: #8a8f98; margin: 0 0 16px;">${String(err)}</p>
    <button onclick="window.close()" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); color: #f3f4f6; border-radius: 6px; padding: 6px 14px; font-size: 12px; cursor: pointer;">Close</button>
  </div>
</body>
</html>`)
    }
  }

  override async getState(): Promise<AccountView> {
    const user = this.userStore.getCurrentUser()
    const attempt = this.attempt?.view ?? null
    return {
      status: user ? 'credential-stored' : 'signed-out',
      attempt: user && attempt?.phase === 'succeeded' ? null : attempt,
      links: { usageUrl: '', topUpUrl: '' },
    }
  }

  override async getProfile(client: AccountClientMetadata): Promise<AccountDetails['profile'] | null> {
    const user = this.userStore.getCurrentUser(client.anonymousUserId)
    if (!user) return null
    return {
      status: 'ready',
      value: {
        id: user.id as unknown as AccountUserId,
        name: user.name ?? 'Google User',
        contact: user.email ?? null,
        avatarUrl: user.picture ?? null,
      },
    }
  }

  override async getBalance(_client: AccountClientMetadata): Promise<AccountDetails['balance'] | null> {
    return { status: 'ready', value: [], bonusWallets: [] }
  }

  override async getUnnotifiedBonuses(_client: AccountClientMetadata): Promise<AccountBonusBatch | null> {
    return null
  }

  override async ackBonusNotified(_accountId: AccountUserId, _orderId: AccountBonusOrderId, _client: AccountClientMetadata): Promise<boolean> {
    return false
  }

  override async startSignIn(client: AccountClientMetadata, _callbackOrigin: string, _loginSource: 'web' | 'desktop'): Promise<AccountView> {
    const state = randomBytes(16).toString('hex')
    const attemptId = randomUUID() as SignInAttemptId
    const authUrl = getGoogleAuthUrl(this.clientId, this.callbackUrl, state)

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
    }
    this.changed()
    return this.getState()
  }

  override async cancelSignIn(id: SignInAttemptId): Promise<AccountView> {
    if (this.attempt?.id === id) {
      this.attempt.view = { id, phase: 'cancelled' }
      this.changed()
    }
    return this.getState()
  }

  override async signOut(client: AccountClientMetadata): Promise<AccountView> {
    this.userStore.signOut(client.anonymousUserId)
    this.attempt = undefined
    this.ctx.emit('deepseek-account/signed-out')
    this.changed()
    return this.getState()
  }

  override async *watch(signal: AbortSignal, _includeIdentityChanges = false): AsyncIterable<AccountView> {
    let dirty = true
    let wake: (() => void) | undefined
    const wakeUp = (): void => { dirty = true; wake?.() }
    const changed = (): void => { wakeUp() }
    this.listeners.add(changed)
    signal.addEventListener('abort', wakeUp, { once: true })
    try {
      while (!signal.aborted) {
        if (dirty) { dirty = false; yield await this.getState(); continue }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      this.listeners.delete(changed)
      signal.removeEventListener('abort', wakeUp)
    }
  }

  override async resolveToken(_url: string): Promise<string | undefined> {
    return undefined
  }

  override async rejectToken(_token: string): Promise<void> {}

  override async getPlatformSession(): Promise<PlatformSession | null> {
    return null
  }

  override async getDeviceIdentity(): Promise<{ deviceId?: string; userId?: AccountUserId; osVersion: string }> {
    const anonymousId = this.userStore.getOrCreateAnonymousId()
    return {
      deviceId: anonymousId,
      userId: (this.userStore.getCurrentUser()?.id ?? anonymousId) as unknown as AccountUserId,
      osVersion: process.version,
    }
  }

  private changed(): void {
    for (const listener of this.listeners) listener(false)
  }
}

export default GoogleAccount
