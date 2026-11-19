import { NextResponse } from "next/server";
import { getSessionJournal } from "@/lib/services";
import { getAuthSessionFromRequest } from "@/lib/auth/session";
import { getOwnedSessionById } from "@/lib/repositories/sessions.repo";

export async function GET(
  req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await props.params;
  const user = await getAuthSessionFromRequest(req);

  const session = user?.id
    ? await getOwnedSessionById(user.id, sessionId)
    : undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const result = await getSessionJournal(sessionId, cursor);

  if (!result.success || !result.data) {
    return NextResponse.json(
      { error: result.error ?? "Failed to read session journal" },
      { status: 400 },
    );
  }

  return NextResponse.json(result.data);
}
