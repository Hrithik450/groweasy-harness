import { getDb, users, type UserRecord, type NewUserRecord } from "@/lib/db";
import { eq, or, sql } from "drizzle-orm";
import { uuidv7 } from "@/lib/utils/uuid";

export function createUser(data: NewUserRecord): {
  user: UserRecord;
  created: boolean;
} {
  const db = getDb();

  const now = new Date().toISOString();
  const email = data.email ? data.email.trim() : null;
  const googleId = (data.googleId || "").trim();

  return db.transaction((tx) => {
    let existing = googleId
      ? tx.select().from(users).where(eq(users.googleId, googleId)).get()
      : undefined;

    if (!existing && email) {
      existing = tx
        .select()
        .from(users)
        .where(sql`LOWER(${users.email}) = LOWER(${email})`)
        .get();
    }

    if (existing) {
      const updated = tx
        .update(users)
        .set({
          name: data.name || existing.name,
          googleId: googleId || existing.googleId,
          picture: data.picture ?? existing.picture,
          emailVerified: data.emailVerified ?? existing.emailVerified,
          updatedAt: now,
        })
        .where(eq(users.id, existing.id))
        .returning()
        .get()!;

      return {
        user: updated,
        created: false,
      };
    }

    const created = tx
      .insert(users)
      .values({
        ...data,
        email: email,
        id: data.id || uuidv7(),
        googleId: googleId || null,
        picture: data.picture || null,
        name: data.name || (email ? email.split("@")[0] : "Anonymous"),
        emailVerified: data.emailVerified ?? (email ? true : false),
        createdAt: data.createdAt || now,
        updatedAt: data.updatedAt || now,
      })
      .returning()
      .get();

    return {
      user: created,
      created: true,
    };
  });
}

/**
 * Creates or retrieves an anonymous guest user.
 */
export function createAnonymousUser(): UserRecord {
  const db = getDb();

  const id = uuidv7();
  const now = new Date().toISOString();

  return db
    .insert(users)
    .values({
      id: id,
      googleId: null,
      email: null,
      name: "Anonymous",
      picture: null,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

/**
 * Rebinds an existing user row (e.g. anonymous user) with Google OAuth identity.
 * This updates the existing user row in-place so all existing sessions,
 * chat history, and connectors remain preserved.
 */
export function rebindUserWithGoogle(data: NewUserRecord): UserRecord {
  const db = getDb();

  const now = new Date().toISOString();
  const googleId = (data.googleId || "").trim();
  const email = (data.email || "").trim();
  const userId = data.id?.trim();

  if (!userId) {
    // No anonymous row to rebind: resolve the Google account or create it.
    return createUser(data).user;
  }

  return db.transaction((tx) => {
    // 1. Verify the existing user row exists
    const existingUser = tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!existingUser) {
      throw new Error("User record not found to link Google account.");
    }

    // 2. Check if another user with this googleId or email already exists
    let existingGoogleUser = googleId
      ? tx.select().from(users).where(eq(users.googleId, googleId)).get()
      : undefined;

    if (!existingGoogleUser && email) {
      existingGoogleUser = tx
        .select()
        .from(users)
        .where(sql`LOWER(${users.email}) = LOWER(${email})`)
        .get();
    }

    if (existingGoogleUser) {
      // If the Google account is already linked to this exact user row: update profile
      if (existingGoogleUser.id === userId) {
        return tx
          .update(users)
          .set({
            name: data.name || existingGoogleUser.name,
            googleId: googleId,
            picture: data.picture ?? existingGoogleUser.picture,
            emailVerified:
              data.emailVerified ?? existingGoogleUser.emailVerified,
            updatedAt: now,
          })
          .where(eq(users.id, existingGoogleUser.id))
          .returning()
          .get()!;
      }

      // The Google account already owns a user row. Log into that row
      // instead of failing when an anonymous session initiated the flow.
      if (googleId && existingGoogleUser.googleId === googleId) {
        return tx
          .update(users)
          .set({
            name: data.name || existingGoogleUser.name,
            picture: data.picture ?? existingGoogleUser.picture,
            emailVerified:
              data.emailVerified ?? existingGoogleUser.emailVerified,
            updatedAt: now,
          })
          .where(eq(users.id, existingGoogleUser.id))
          .returning()
          .get()!;
      }

      // A different Google identity already owns this email address.
      throw new Error(
        "This email is already linked to another Google account.",
      );
    }

    // 3. No other user has this Google account: rebind the existing row in-place!
    return tx
      .update(users)
      .set({
        email: email,
        googleId: googleId,
        name: data.name || existingUser.name || "User",
        picture: data.picture ?? existingUser.picture,
        emailVerified: data.emailVerified ?? true,
        updatedAt: now,
      })
      .where(eq(users.id, userId))
      .returning()
      .get()!;
  });
}

export function getUserByUserId(id: string): UserRecord | null {
  const db = getDb();
  return (
    db
      .select()
      .from(users)
      .where(or(eq(users.id, id), eq(users.googleId, id)))
      .get() ?? null
  );
}

export function getUserByEmail(email: string): UserRecord | null {
  const db = getDb();
  return (
    db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = LOWER(${email.trim()})`)
      .get() ?? null
  );
}

export function getUsers(): UserRecord[] {
  const db = getDb();
  return db
    .select()
    .from(users)
    .orderBy(sql`${users.createdAt} DESC`)
    .all();
}
