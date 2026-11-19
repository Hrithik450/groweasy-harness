import { NextResponse } from "next/server";
import { getAuthSessionFromRequest } from "@/lib/auth/session";
import { getOwnedSessionById } from "@/lib/repositories/sessions.repo";
import { SessionStreamWriter } from "@/lib/session/channel";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/**
 * GET /api/sessions/[sessionId]/stream
 *
 * Long-lived SSE carrying live journal changes, bar snapshots, connector
 * updates, and transport failures. The client fetches `/journal` itself, so
 * this never sends a page on connect.
 */
export async function GET(
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

  // Observing a session never creates or warms an agent; opening it does
  // (`repairSessionTail` on the page) and prompting does.
  const channel = new SessionStreamWriter(
    sessionId,
    session.userId,
    req.signal,
  );
  return new Response(channel.stream, { headers: SSE_HEADERS });
}
