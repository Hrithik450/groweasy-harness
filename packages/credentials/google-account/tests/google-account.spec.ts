import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { UserStore } from '../src/user-store.ts'
import { provisionUserWorkspace } from '../src/workspace-provisioner.ts'
import { GoogleAccount } from '../src/index.ts'

const V7_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('GoogleAccount & UUIDv7 Multi-Tenant Provisioning', () => {
  let tempHome: string

  beforeEach(() => {
    tempHome = join(tmpdir(), `dsh-google-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    process.env.DSH_HOME = tempHome
    process.env.DSH_WORKSPACES_ROOT = join(tempHome, 'workspaces')
  })

  afterEach(() => {
    delete process.env.DSH_HOME
    delete process.env.DSH_WORKSPACES_ROOT
    if (existsSync(tempHome)) {
      rmSync(tempHome, { recursive: true, force: true })
    }
  })

  describe('UserStore', () => {
    it('generates a valid UUIDv7 for anonymous guests and preserves preferred ID', () => {
      const store = new UserStore()
      const anonymousId = store.getOrCreateAnonymousId()

      expect(anonymousId).toMatch(V7_SHAPE)

      // Preserves valid preferred ID from client request context
      const preferred = store.getOrCreateAnonymousId(anonymousId)
      expect(preferred).toBe(anonymousId)
    })

    it('links Google profile to the active anonymous UUIDv7 on first login', () => {
      const store = new UserStore()
      const anonymousId = store.getOrCreateAnonymousId()

      const user = store.loginWithGoogle({
        sub: 'google_123456789',
        email: 'developer@example.com',
        name: 'Test Developer',
        picture: 'https://example.com/avatar.jpg',
      }, anonymousId)

      // Must be linked to the anonymous UUIDv7!
      expect(user.id).toBe(anonymousId)
      expect(user.id).toMatch(V7_SHAPE)
      expect(user.email).toBe('developer@example.com')
      expect(user.name).toBe('Test Developer')
      expect(user.googleSub).toBe('google_123456789')
      expect(store.getCurrentUser(anonymousId)?.id).toBe(anonymousId)
    })

    it('reuses existing UUIDv7 for returning Google user', () => {
      const store = new UserStore()
      const firstUser = store.loginWithGoogle({
        sub: 'google_999999',
        email: 'returning@example.com',
        name: 'Original Name',
      })
      const originalId = firstUser.id

      // Simulate app restart with a fresh store instance
      const freshStore = new UserStore()
      const returningUser = freshStore.loginWithGoogle({
        sub: 'google_999999',
        email: 'returning@example.com',
        name: 'Updated Name',
      })

      expect(returningUser.id).toBe(originalId)
      expect(returningUser.name).toBe('Updated Name')
    })
  })

  describe('Multi-Tenant Workspace Provisioning', () => {
    it('provisions the exact folder hierarchy with UUIDv7', () => {
      const store = new UserStore()
      const userId = store.getOrCreateAnonymousId()

      const provisioned = provisionUserWorkspace(userId)

      expect(provisioned.userId).toBe(userId)
      expect(provisioned.workspaceId).toMatch(V7_SHAPE)
      expect(provisioned.defaultSessionId).toMatch(V7_SHAPE)

      // Verify physical directories exist on disk
      expect(existsSync(provisioned.userRoot)).toBe(true)
      expect(existsSync(provisioned.userTmp)).toBe(true)
      expect(existsSync(provisioned.workspacePath)).toBe(true)
      expect(existsSync(provisioned.sessionsPath)).toBe(true)
      expect(existsSync(provisioned.attachmentsPath)).toBe(true)
      expect(existsSync(provisioned.defaultSessionPath)).toBe(true)
      // Workspace root remains pristine without stray tmp symlinks
      expect(existsSync(join(provisioned.workspacePath, 'tmp'))).toBe(false)
    })
  })

  describe('GoogleAccount Cordis Service', () => {
    it('manages sign-in attempt state and profile', async () => {
      const ctx = new Context()
      const account = new GoogleAccount(ctx, {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        callbackUrl: 'http://localhost:3000/auth/google/callback',
      })

      // Initial state is signed-out
      const initialState = await account.getState()
      expect(initialState.status).toBe('signed-out')

      // Start sign in
      const started = await account.startSignIn(
        { version: '1.0.0', locale: 'en_US', timezoneOffsetSeconds: 0 },
        'http://localhost:3000',
        'web',
      )
      expect(started.attempt?.phase).toBe('waiting-browser')
      expect(started.attempt?.authorizeUrl).toContain('accounts.google.com/o/oauth2/v2/auth')
      expect(started.attempt?.authorizeUrl).toContain('client_id=test-client-id')

      // Cancel sign in
      if (started.attempt) {
        const cancelled = await account.cancelSignIn(started.attempt.id)
        expect(cancelled.attempt?.phase).toBe('cancelled')
      }
    })
  })
})
