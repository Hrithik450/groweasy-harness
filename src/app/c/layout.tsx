import { connection } from "next/server";
import { AppShell } from "@/components/app.shell";
import { ClientRedirect } from "@/components/client.redirect";
import { getSessionsByUserId } from "@/lib/services";
import { getSessionFromCookies } from "@/lib/auth";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const user = await getSessionFromCookies();
  if (!user) return <ClientRedirect href="/" />;

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
