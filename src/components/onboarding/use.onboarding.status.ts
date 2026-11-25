"use client";

import { useCallback, useEffect, useState } from "react";
import type { OnboardingStatus } from "@/lib/onboarding/status";

/** Fetch the derived onboarding state from the server. */
export async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  const res = await fetch("/api/onboarding/status", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    // A hung server must not leave the gate waiting forever.
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json()) as {
    success: boolean;
    data?: OnboardingStatus;
  };
  if (!json.success || !json.data) throw new Error("Could not load setup.");
  return json.data;
}

/** Shared onboarding state: one fetch path for the gate and the wizard. */
export function useOnboardingStatus() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  const refresh = useCallback(async () => {
    const next = await fetchOnboardingStatus();
    setStatus(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    let alive = true;
    fetchOnboardingStatus()
      .then((next) => {
        if (alive) setStatus(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { status, setStatus, loading, refresh };
}
