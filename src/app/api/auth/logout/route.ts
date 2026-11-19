import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session.server";

export async function POST() {
  try {
    await clearSessionCookie();
    return NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to logout";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
