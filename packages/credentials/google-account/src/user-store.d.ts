/** Persistent store for anonymous and Google-authenticated user identities with UUIDv7. @module @deepseek-ai/dsh-google-account/user-store */
import type { GoogleUserProfile } from './oauth.ts';
export interface StoredUser {
    id: string;
    googleSub?: string | undefined;
    email?: string | undefined;
    name?: string | undefined;
    picture?: string | undefined;
    createdAt: string;
    updatedAt: string;
}
export interface GoogleAccountState {
    currentUser?: StoredUser | undefined;
    users: Record<string, StoredUser>;
    googleSubIndex: Record<string, string>;
}
/**
 * Manage durable identity mapping for anonymous and Google-authenticated users.
 */
export declare class UserStore {
    private readonly dshHome;
    private readonly storePath;
    private readonly anonymousPath;
    private state;
    constructor(customDshHome?: string);
    /**
     * Get or create the one-time persistent anonymous UUIDv7.
     */
    getOrCreateAnonymousId(): string;
    /**
     * Link a Google login to the active anonymous UUIDv7 or load an existing user.
     *
     * @param profile - Google profile returned by OAuth userinfo
     * @param preferredUserId - Optional client-supplied anonymous UUIDv7 to bind
     */
    loginWithGoogle(profile: GoogleUserProfile, preferredUserId?: string): StoredUser;
    /**
     * Read the currently active authenticated user, or undefined if signed out.
     */
    getCurrentUser(): StoredUser | undefined;
    /**
     * Clear the active user session (sign out).
     */
    signOut(): void;
    private loadState;
    private saveState;
}
//# sourceMappingURL=user-store.d.ts.map