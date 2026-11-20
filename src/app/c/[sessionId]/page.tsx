import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  getSessionJournal,
  getSessionViewByUserIdAndSessionId,
} from "@/lib/services";
import { Chat } from "@/components/chat/chat";
import type { SessionView } from "@/lib/core/session/view";
import type { SessionJournalChange } from "@/lib/session/journal";
import { getSessionFromCookies } from "@/lib/auth/session.server";
import type { DetailBarState } from "@/lib/detail.bar/state";
import { getDetailBarState } from "@/lib/detail.bar/snapshot";
import { repairSessionTail } from "@/lib/session/agent.host";
import { ChatSkeleton } from "./page.skeleton";

export const instant = false;

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function Page({ params }: PageProps) {
  await connection();
  const { sessionId } = await params;
  const user = await getSessionFromCookies();
  if (!user) {
    redirect("/");
  }

  const sessionRes = await getSessionViewByUserIdAndSessionId(
    user.id,
    sessionId,
  );
  const session = sessionRes?.data;

  if (!session) {
    redirect("/c");
  }

  if (session.id !== sessionId) {
    redirect(`/c/${session.id}`);
  }

  // Opening a session resumes it: close any interrupted tail before the
  // transcript is read. The live stream only observes.
  await repairSessionTail(session);

  return (
    <Suspense fallback={<ChatSkeleton />}>
      <PageComponent session={session} />
    </Suspense>
  );
}

async function PageComponent({ session }: { session: SessionView }) {
  let initialDetailBar: DetailBarState = {};
  try {
    initialDetailBar = await getDetailBarState(session.id);
  } catch {}

  let initialJournal: SessionJournalChange = {
    type: "replace",
    page: { entries: [], cursor: null },
    hasMore: false,
  };

  try {
    const res = await getSessionJournal(session.id);
    if (res.success && res.data?.type === "replace") {
      initialJournal = res.data;
    }
  } catch {}

  return (
    <Chat
      key={session.id}
      initialSession={session}
      initialJournal={initialJournal}
      initialDetailBar={initialDetailBar}
    />
  );
}
