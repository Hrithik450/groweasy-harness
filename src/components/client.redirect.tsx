"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Redirect from a page that already started streaming.
 *
 * With cache components the shell is flushed before the page's data resolves,
 * so a server `redirect()` can no longer set the HTTP status and the browser
 * gets an error document instead. Navigating from the client always works.
 */
export function ClientRedirect({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [href, router]);

  return null;
}
