import { NextRequest, NextResponse } from "next/server";
import {
  hashPassword,
  toPublicUser,
  attachSessionCookie,
  findUserCredentialsByEmail,
} from "@/lib/auth";
import { createUser, setUserPasswordHash } from "@/lib/repositories";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      password?: string;
    };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const existing = await findUserCredentialsByEmail(email);
    if (existing?.googleId) {
      return NextResponse.json(
        { error: "This email uses Google sign-in. Continue with Google." },
        { status: 409 },
      );
    }

    if (existing?.passwordHash) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const passwordHash = hashPassword(password);
    const user = existing
      ? setUserPasswordHash(existing.id, passwordHash)
      : createUser({
          email,
          name: body.name?.trim() || email.split("@")[0],
          emailVerified: true,
          passwordHash,
        }).user;

    if (!user) {
      return NextResponse.json(
        { error: "Could not create the account." },
        { status: 500 },
      );
    }

    return attachSessionCookie(
      NextResponse.json({ success: true, user: toPublicUser(user) }),
      user,
    );
  } catch (error) {
    console.error("[Email Auth] Register failed:", error);
    return NextResponse.json(
      { error: "Could not create the account." },
      { status: 500 },
    );
  }
}
