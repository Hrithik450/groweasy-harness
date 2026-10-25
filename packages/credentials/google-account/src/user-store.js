/** Persistent store for anonymous and Google-authenticated user identities with UUIDv7. @module @deepseek-ai/dsh-google-account/user-store */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { uuidv7 } from '@deepseek-ai/dsh-util-crypto';
const STORE_FILENAME = 'google-account.json';
const ANONYMOUS_FILENAME = '.anonymous-user-id';
/**
 * Manage durable identity mapping for anonymous and Google-authenticated users.
 */
export class UserStore {
    dshHome;
    storePath;
    anonymousPath;
    state;
    constructor(customDshHome) {
        this.dshHome = resolveDshHome(customDshHome);
        this.storePath = join(this.dshHome, STORE_FILENAME);
        this.anonymousPath = join(this.dshHome, ANONYMOUS_FILENAME);
        this.state = this.loadState();
    }
    /**
     * Get or create the one-time persistent anonymous UUIDv7.
     */
    getOrCreateAnonymousId() {
        if (existsSync(this.anonymousPath)) {
            try {
                const content = readFileSync(this.anonymousPath, 'utf8').trim();
                // If it is already a valid UUIDv7, reuse it
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(content)) {
                    return content;
                }
            }
            catch {
                // Fall through to recreate
            }
        }
        const newId = uuidv7();
        mkdirSync(this.dshHome, { recursive: true });
        writeFileSync(this.anonymousPath, newId, { encoding: 'utf8', mode: 0o600 });
        return newId;
    }
    /**
     * Link a Google login to the active anonymous UUIDv7 or load an existing user.
     *
     * @param profile - Google profile returned by OAuth userinfo
     * @param preferredUserId - Optional client-supplied anonymous UUIDv7 to bind
     */
    loginWithGoogle(profile, preferredUserId) {
        const existingUserId = this.state.googleSubIndex[profile.sub];
        const now = new Date().toISOString();
        if (existingUserId && this.state.users[existingUserId]) {
            // Returning user: maintain their established UUIDv7
            const user = this.state.users[existingUserId];
            user.name = profile.name;
            user.picture = profile.picture;
            user.email = profile.email;
            user.updatedAt = now;
            this.state.currentUser = user;
            this.saveState();
            return user;
        }
        // New Google user: Link to provided anonymous UUIDv7 (or active local anonymous ID)
        const validPreferred = preferredUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(preferredUserId);
        const userId = validPreferred ? preferredUserId : this.getOrCreateAnonymousId();
        const newUser = {
            id: userId,
            googleSub: profile.sub,
            email: profile.email,
            name: profile.name,
            picture: profile.picture,
            createdAt: now,
            updatedAt: now,
        };
        this.state.users[userId] = newUser;
        this.state.googleSubIndex[profile.sub] = userId;
        this.state.currentUser = newUser;
        this.saveState();
        return newUser;
    }
    /**
     * Read the currently active authenticated user, or undefined if signed out.
     */
    getCurrentUser() {
        return this.state.currentUser;
    }
    /**
     * Clear the active user session (sign out).
     */
    signOut() {
        delete this.state.currentUser;
        this.saveState();
    }
    loadState() {
        if (existsSync(this.storePath)) {
            try {
                const raw = readFileSync(this.storePath, 'utf8');
                return JSON.parse(raw);
            }
            catch {
                // Return blank state on parse failure
            }
        }
        return { users: {}, googleSubIndex: {} };
    }
    saveState() {
        mkdirSync(this.dshHome, { recursive: true });
        writeFileSync(this.storePath, JSON.stringify(this.state, null, 2), {
            encoding: 'utf8',
            mode: 0o600,
        });
    }
}
//# sourceMappingURL=user-store.js.map