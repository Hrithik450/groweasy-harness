import { NextResponse } from "next/server";
import { updateSession, deleteSession } from "@/lib/services";
import { getOwnedSessionById } from "@/lib/repositories/sessions.repo";
import { getSessionFromRequest } from "@/lib/auth/session";
import type { Session } from "@/lib/db";
import { toSessionView } from "@/lib/core/session/view";
import type { DetailBarState } from "@/lib/detail.bar/state";
import { readBarState } from "@/lib/bar/snapshot";

/**
 * GET /api/sessions/[sessionId]
 * Fetches session metadata.
 */
export async function GET(
  req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await props.params;
  const user = await getSessionFromRequest(req);
  if (!user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const session = await getOwnedSessionById(user.id, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Bar data travels as its own projection; `extra` keeps only metadata.
  const view = {
    ...toSessionView(session),
  };
  let detailBar: DetailBarState = {};
  try {
    detailBar = await readBarState(session.id);
  } catch {
    // The live journal fold still supplies the bar to the client.
  }

  return NextResponse.json({ session: view, thread: view, detailBar });
}

/**
 * PATCH /api/sessions/[sessionId]
 * Updates session metadata or schedule config.
 */
export async function PATCH(
  req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await props.params;
    const user = await getSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const body = (await req.json()) as Partial<Session>;
    // Bar slices belong to the projection, not to client-written `extra`.

    const res = await updateSession(user.id, sessionId, body);
    const updated = res.data;
    if (!updated) {
      return NextResponse.json(
        { error: res.error ?? "Session not found" },
        { status: 404 },
      );
    }

    const view = {
      ...toSessionView(updated),
    };
    let detailBar: DetailBarState = {};
    try {
      detailBar = await readBarState(updated.id);
    } catch {
      // The live journal fold still supplies the bar to the client.
    }

    return NextResponse.json({ data: view, detailBar });
  } catch (error) {
    console.error("Error updating session:", error);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/sessions/[sessionId]
 * Deletes a session.
 */
export async function DELETE(
  req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await props.params;
  const user = await getSessionFromRequest(req);
  if (!user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const res = await deleteSession(user.id, sessionId);
  if (!res.success || !res.data) {
    return NextResponse.json(
      { error: res.error || "Session not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
