import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app.shell";
import { getSessionsByUserId } from "@/lib/services";
import { getSessionFromCookies } from "@/lib/auth";

export const instant = false;

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const user = await getSessionFromCookies();
  if (!user) redirect("/");

  const sessionsRes = await getSessionsByUserId(user.id);
  const initialSessions = (sessionsRes?.data || []).map((session) => ({
    ...session,
  }));

  return (
    <AppShell initialSessions={initialSessions} initialUser={user}>
      {children}
    </AppShell>
  );
}
