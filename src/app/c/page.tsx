import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getDefaultSessionView } from "@/lib/services";
import { getSessionFromCookies } from "@/lib/auth/session.server";

export const instant = false;

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ searchParams }: PageProps) {
  await connection();
  const user = await getSessionFromCookies();
  if (!user) {
    redirect("/");
  }

  const sp = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  for (const [key, val] of Object.entries(sp)) {
    if (typeof val === "string") {
      query.set(key, val);
    }
  }
  const qs = query.toString() ? `?${query.toString()}` : "";

  const sessionRes = await getDefaultSessionView(user.id);
  const firstSession = sessionRes?.data;

  if (firstSession) {
    redirect(`/c/${firstSession.id}${qs}`);
  }

  return null;
}
