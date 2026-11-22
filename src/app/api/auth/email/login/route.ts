import { NextRequest, NextResponse } from "next/server";
import {
  attachSessionCookie,
  findUserCredentialsByEmail,
  toPublicUser,
  verifyPassword,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
    };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    const user = email ? await findUserCredentialsByEmail(email) : null;

    if (!user) {
      return NextResponse.json(
        { error: "Email or password is incorrect." },
        { status: 401 },
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        {
          error: user.googleId
            ? "This account uses Google sign-in."
            : "This account has no password yet.",
        },
        { status: 401 },
      );
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: "Email or password is incorrect." },
        { status: 401 },
      );
    }

    return attachSessionCookie(
      NextResponse.json({ success: true, user: toPublicUser(user) }),
      user,
    );
  } catch (error) {
    console.error("[Email Auth] Login failed:", error);
    return NextResponse.json({ error: "Could not sign in." }, { status: 500 });
  }
}
