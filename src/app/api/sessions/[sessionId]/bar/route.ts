import { NextResponse } from "next/server";
import { getAuthSessionFromRequest } from "@/lib/auth/session";
import { getOwnedSessionById } from "@/lib/repositories/sessions.repo";
import { barOwner, isBarField, rootKind } from "@/lib/detail.bar/fields";
import {
  patchBarItem,
  readBarPageFor,
  BAR_PAGE_SIZE,
} from "@/lib/bar/service";
import { syncCampaignsBar } from "@/lib/bar/sync/campaigns";

/**
 * GET one page of a detail-bar list.
 *
 * `?field=` names the list, `?cursor=` the last row of the page already shown.
 * The owner slug decides the session, so a page request is independent of the
 * session the reader happens to be viewing.
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
  const session = getOwnedSessionById(user.id, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const field = url.searchParams.get("field");
  if (!isBarField(field)) {
    return NextResponse.json({ error: "Unknown bar field" }, { status: 400 });
  }
  if (barOwner(field) !== session.slug) {
    return NextResponse.json(
      { error: "This list belongs to another surface" },
      { status: 409 },
    );
  }

  // Campaigns are Meta's: refresh the snapshot before reading it.
  if (field === "campaigns") {
    await syncCampaignsBar(user.id, {
      force: url.searchParams.get("refresh") === "1",
    }).catch((err) =>
      console.error("[bar] Campaign sync failed:", err),
    );
  }

  const rawLimit = Number(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor");
  const parentId = url.searchParams.get("parentId");
  const kind = url.searchParams.get("kind");
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 100)
      : BAR_PAGE_SIZE;

  const page = readBarPageFor(session.id, field, {
    limit,
    ...(cursor ? { cursor } : {}),
    ...(parentId ? { parentId } : {}),
    ...(kind ? { kind } : {}),
  });

  return NextResponse.json({ field, ...page });
}

/**
 * POST one user patch onto a stored row.
 *
 * The patch is merged, never replaced, so the fields the agent owns survive.
 * The row is the durable state; the write publishes that field to open clients.
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
  const session = getOwnedSessionById(user.id, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, kind, patch } = (body ?? {}) as {
    kind?: unknown;
    id?: unknown;
    patch?: unknown;
  };

  if (kind !== undefined && !isBarField(kind)) {
    return NextResponse.json({ error: "Unknown bar kind" }, { status: 400 });
  }
  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ error: "Missing row id" }, { status: 400 });
  }
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return NextResponse.json(
      { error: "Patch must be an object" },
      { status: 400 },
    );
  }

  const patchData = patch as Record<string, unknown>;
  const written = patchBarItem(session, id.trim(), patchData);
  if (!written) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }
  // `kind` names the tab (a top-level field); the row's kind is its full path.
  if (kind !== undefined && rootKind(written.kind) !== kind) {
    return NextResponse.json(
      { error: "Kind does not match the row" },
      { status: 409 },
    );
  }

  return NextResponse.json({ kind: written.kind, item: written });
}
