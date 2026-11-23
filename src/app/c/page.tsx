import { connection } from "next/server";
import { getDefaultSession } from "@/lib/services";
import { getSessionFromCookies } from "@/lib/auth";
import { ClientRedirect } from "@/components/client.redirect";

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Proxy sends `/c` straight to the default session; this is the fallback for
 * a request that skips it.
 */
export default async function Page({ searchParams }: PageProps) {
  await connection();
  const user = await getSessionFromCookies();
  if (!user) return <ClientRedirect href="/" />;

  const sp = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  for (const [key, val] of Object.entries(sp)) {
    if (typeof val === "string") {
      query.set(key, val);
    }
  }
  const qs = query.toString() ? `?${query.toString()}` : "";

  const sessionRes = await getDefaultSession(user.id);
  const firstSession = sessionRes?.data;

  if (!firstSession) return null;

  return <ClientRedirect href={`/c/${firstSession.id}${qs}`} />;
}
