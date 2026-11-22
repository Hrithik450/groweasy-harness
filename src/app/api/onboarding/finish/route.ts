import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { markUserOnboarded } from "@/lib/repositories";
import { resolveSession } from "@/lib/services";

export async function POST(req: NextRequest) {
  const user = await getSessionFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  markUserOnboarded(user.id);

  const session = await resolveSession({
    userId: user.id,
    slug: "adManager",
    title: "Ad Manager",
    reuse: true,
  });

  if (!session.success || !session.data) {
    return NextResponse.json(
      { error: session.error ?? "Could not open Ad Manager" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { sessionId: session.data.id },
  });
}
