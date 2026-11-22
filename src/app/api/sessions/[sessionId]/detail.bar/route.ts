import { NextResponse } from "next/server";
import { getAuthSessionFromRequest } from "@/lib/auth";
import { getOwnedSessionById } from "@/lib/repositories";
import { barOwner, isDetailBarField } from "@/lib/detail.bar/fields";
import {
  updateDetailBarItem,
  getDetailBarPage,
} from "@/lib/detail.bar/service";

/**
 * GET one tab of a session's detail bar.
 *
 * The tab is one JSON document: its cards, nested as the UI renders them.
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

  if (!isDetailBarField(field)) {
    return NextResponse.json({ error: "Unknown bar field" }, { status: 400 });
  }
  if (barOwner(field) !== session.slug) {
    return NextResponse.json(
      { error: "This list belongs to another surface" },
      { status: 409 },
    );
  }

  const rawLimit = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 100)
      : undefined;
  const cursor = url.searchParams.get("cursor");
  const parentId = url.searchParams.get("parentId");

  const page = getDetailBarPage(session.id, field, {
    ...(limit ? { limit } : {}),
    ...(cursor ? { cursor } : {}),
    ...(parentId ? { parentId } : {}),
  });

  return NextResponse.json({
    field,
    parentId,
    items: page.items,
    nextCursor: page.nextCursor,
  });
}

/**
 * POST one user patch onto a stored card.
 *
 * Only the fields the user owns change; the card's tab is republished.
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
    id?: unknown;
    kind?: unknown;
    patch?: unknown;
  };

  if (kind !== undefined && !isDetailBarField(kind)) {
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

  const written = updateDetailBarItem(
    session,
    id.trim(),
    patch as Record<string, unknown>,
    isDetailBarField(kind) ? kind : undefined,
  );
  if (!written) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }

  return NextResponse.json({
    field: written.field,
    parentId: written.parentId,
    item: written,
  });
}
