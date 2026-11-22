import { NextResponse } from "next/server";
import { getAuthSessionFromRequest } from "@/lib/auth";
import { getOwnedSessionById } from "@/lib/repositories";
import { cancelAgent } from "@/lib/core/agent/registry";

/**
 * POST /api/sessions/[sessionId]/cancel
 *
 * Interrupts the warm agent's turn for this session, if one is running.
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const user = await getAuthSessionFromRequest(req);
  if (!user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { sessionId } = await props.params;
  const session = await getOwnedSessionById(user.id, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ cancelled: cancelAgent(sessionId) });
}
