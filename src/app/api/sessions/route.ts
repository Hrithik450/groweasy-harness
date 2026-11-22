import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getSessionsByUserId, createSession } from "@/lib/services";

/**
 * GET /api/sessions
 * Returns all sessions for the authenticated user.
 */
export async function GET(req: Request) {
  const user = await getSessionFromRequest(req);
  const res = user?.id ? await getSessionsByUserId(user.id) : null;
  // The list only needs session rows; bar data is read from the projection.
  const sessions = res?.data || [];
  return NextResponse.json({ sessions, threads: sessions });
}

/**
 * POST /api/sessions
 * Creates a new session for the authenticated user.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    const body = await req.json();
    const { title, config, extra } = body;

    if (!title) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }

    const res = await createSession({
      title,
      extra: extra || config || null,
      userId: user.id,
    });

    if (!res.success || !res.data) {
      return NextResponse.json(
        { error: res.error || "Failed to create session" },
        { status: 500 },
      );
    }

    const session = res.data;
    return NextResponse.json(
      { session, thread: session },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create session:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
