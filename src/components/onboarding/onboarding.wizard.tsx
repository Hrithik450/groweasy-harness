"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Lock, Mail } from "lucide-react";
import { useOnboardingStatus } from "./use.onboarding.status";
import { useSessionStream } from "@/hooks/use.stream";
import { BusinessProfileProcess } from "@/components/business.profile/process.feed";
import { SESSION_ONBOARDING_EVENT } from "@/lib/session/journal";

const STEPS = ["login", "meta", "business", "sync"] as const;
type Step = (typeof STEPS)[number];

const STEP_COPY: Record<Step, { title: string; body: string }> = {
  login: {
    title: "Sign in to Uno",
    body: "Use Google or your email. You’ll come right back to this step.",
  },
  meta: {
    title: "Connect Meta Ads Manager",
    body: "Authorize your Meta account to allow the AI Agent to create, launch, and manage campaigns and read live advertising insights.",
  },
  business: {
    title: "Teach Uno your brand",
    body: "Enter your website. Uno reads it to build the brand profile.",
  },
  sync: {
    title: "Preparing your workspace",
    body: "Uno is pulling your first campaign data. This usually takes a moment.",
  },
};

const STEP_ICON: Record<Step, string> = {
  login: "/bot/face-amber.svg",
  meta: "/images/connectors/meta.svg",
  business: "/images/connectors/business-profile.svg",
  sync: "/bot/face-amber.svg",
};

export function OnboardingWizard({ sessionId }: { sessionId?: string }) {
  const router = useRouter();
  const { status, loading, refresh } = useOnboardingStatus();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  const [busy, setBusy] = useState(false);
  const [brandUrl, setBrandUrl] = useState("");
  const [done, setDone] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const syncFired = useRef(false);

  useEffect(() => {
    if (status?.business.url) setBrandUrl(status.business.url);
  }, [status?.business.url]);

  const refreshStatus = useCallback(async () => {
    try {
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load setup.");
    }
  }, [refresh]);

  // Status changes ride the same session stream as connectors and bar updates.
  useSessionStream(
    sessionId,
    (message) => {
      if (message.event === SESSION_ONBOARDING_EVENT) void refreshStatus();
    },
    () => void refreshStatus(),
  );

  // One place consumes the return query param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("onboarding")) return;
    void refreshStatus();
    params.delete("onboarding");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
  }, [refreshStatus]);

  // Meta data can sync while the user is still on the business-profile step.
  useEffect(() => {
    if (
      !status ||
      !status.authenticated ||
      !status.meta.connected ||
      status.sync.ready ||
      syncFired.current
    ) {
      return;
    }
    syncFired.current = true;
    void fetch("/api/onboarding/sync", {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
  }, [status?.authenticated, status?.meta.connected, status?.sync.ready]);

  if (loading || !status || status.onboardedAt || done) return null;

  const retrySync = async () => {
    syncFired.current = false;
    setError(null);
    try {
      await fetch("/api/onboarding/sync", {
        method: "POST",
        credentials: "include",
      });
      await refreshStatus();
    } catch {
      setError("Could not restart the sync. Try again.");
    }
  };

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/email/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not sign in.");
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  const connectBusiness = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connectors/business.profile/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: brandUrl.trim() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not start the import.");
      await refreshStatus();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start the import.",
      );
    } finally {
      setBusy(false);
    }
  };

  const returnTo = (step: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("onboarding", step);
    return encodeURIComponent(`${url.pathname}${url.search}`);
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/finish", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as {
        data?: { sessionId?: string };
        error?: string;
      };
      if (!res.ok || !json.data?.sessionId) {
        throw new Error(json.error ?? "Could not finish setup.");
      }
      setDone(true);
      router.push(`/c/${json.data.sessionId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish setup.");
      setBusy(false);
    }
  };

  const stepIndex = STEPS.indexOf(status.step);
  const copy = STEP_COPY[status.step];
  const hasRunningJob = status.sync.jobs.some(
    (job) => job.status === "running",
  );
  const hasFailedJob = status.sync.jobs.some((job) => job.status === "failed");
  const canFinish = status.sync.ready && !hasRunningJob && !hasFailedJob;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-2.5 sm:p-4">
      <div className="fixed inset-0 bg-foreground/50 backdrop-blur-xs" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Set up Uno"
        className="relative z-10 w-full max-w-4xl sm:max-w-[calc(20vw_+_710px)] h-[90dvh] sm:h-[calc(50dvh_+_320px)] max-h-[92dvh] bg-card border border-border rounded-none shadow-2xl flex flex-col overflow-hidden text-foreground"
      >
        <div className="h-14 px-5 sm:px-6 border-b border-border-subtle flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <img src="/bot/face-red.svg" alt="Uno" className="h-7 w-7" />
            <span className="text-sm font-semibold">Set up Uno</span>
          </div>
          <div className="flex items-center gap-1.5">
            {STEPS.map((step, index) => (
              <span
                key={step}
                className={`h-1.5 w-8 rounded-full ${
                  index <= stepIndex ? "bg-accent" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 sm:px-8 pt-5 pb-[4.75rem] flex flex-col justify-center">
          <div className="w-full max-w-xl mx-auto text-left space-y-4">
            <div className="space-y-3">
              <span className="flex h-12 w-12 items-center justify-center p-1.5">
                <img
                  src={STEP_ICON[status.step]}
                  alt=""
                  className="h-full w-full object-contain"
                />
              </span>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-accent">
                Step {stepIndex + 1} of {STEPS.length}
              </p>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                {copy.title}
              </h2>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {copy.body}
              </p>
            </div>

            {error ? (
              <p className="text-[12px] text-destructive bg-destructive-tint border border-destructive-border rounded-lg px-3 py-2">
                {error}
              </p>
            ) : null}

            {status.step === "login" ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = `/api/auth/google/login?returnTo=${returnTo("login")}`;
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 border border-border-strong bg-card px-4 py-2.5 text-[13px] font-semibold hover:bg-muted transition-colors cursor-pointer"
                >
                  Continue with Google
                </button>

                <div className="flex items-center gap-3 text-[10.5px] uppercase tracking-wider text-muted-2">
                  <span className="h-px flex-1 bg-border" />
                  or email
                  <span className="h-px flex-1 bg-border" />
                </div>

                <form onSubmit={submitEmail} className="space-y-2.5">
                  <label className="flex items-center gap-2 border border-border bg-card px-3 py-2">
                    <Mail className="w-4 h-4 text-muted-2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@brand.com"
                      className="w-full bg-transparent text-[13px] outline-none"
                      required
                    />
                  </label>
                  <label className="flex items-center gap-2 border border-border bg-card px-3 py-2">
                    <Lock className="w-4 h-4 text-muted-2" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password (8+ characters)"
                      className="w-full bg-transparent text-[13px] outline-none"
                      required
                      minLength={8}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full inline-flex items-center justify-center gap-2 bg-foreground text-background px-4 py-2.5 text-[13px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {mode === "login" ? "Sign in" : "Create account"}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() =>
                    setMode(mode === "login" ? "register" : "login")
                  }
                  className="w-full text-[12px] text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {mode === "login"
                    ? "New here? Create an account"
                    : "Already have an account? Sign in"}
                </button>
              </div>
            ) : null}

            {status.step === "meta" ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = `/api/auth/meta/login?returnTo=${returnTo("meta")}`;
                  }}
                  className="inline-flex items-center gap-2 bg-provider-meta-blue hover:bg-provider-meta-blue-dark text-primary-foreground px-4 py-2.5 text-[13px] font-semibold cursor-pointer"
                >
                  Log in with Meta
                  <ArrowRight className="w-4 h-4" />
                </button>
                {status.meta.status === "running" ? (
                  <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Connecting Meta…
                  </p>
                ) : null}
                {status.meta.error ? (
                  <p className="text-[12px] text-destructive">
                    {status.meta.error}
                  </p>
                ) : null}
              </div>
            ) : null}

            {status.step === "business" ? (
              <form onSubmit={connectBusiness} className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium">
                    Website address
                  </span>
                  <input
                    type="url"
                    value={brandUrl}
                    onChange={(e) => setBrandUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-foreground/40"
                    required
                    disabled={status.business.status === "running"}
                  />
                </label>
                {status.business.status === "running" ? (
                  <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin mt-0.5 shrink-0" />
                    <BusinessProfileProcess
                      compact
                      fallback="Reading your website and building the brand profile…"
                    />
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={busy || !brandUrl.trim()}
                    className="inline-flex items-center gap-2 bg-foreground text-background px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    Analyze website
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                {status.business.error ? (
                  <p className="text-[12px] text-destructive">
                    {status.business.error}
                  </p>
                ) : null}
              </form>
            ) : null}

            {status.step === "sync" ? (
              <div className="space-y-3">
                <div className="border border-border bg-muted/40 px-3 py-3 space-y-2">
                  {status.sync.jobs.length === 0 ? (
                    <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Setting up the first sync…
                    </p>
                  ) : (
                    status.sync.jobs.map((job) => (
                      <div
                        key={job.name}
                        className="flex items-center justify-between gap-3 text-[12px]"
                      >
                        <span className="min-w-0 truncate text-muted-foreground">
                          {job.name.replace(/[-_]/g, " ")}
                        </span>
                        <span className="shrink-0 flex items-center gap-1.5 font-medium">
                          {job.status === "failed" ? (
                            <span className="text-destructive">Failed</span>
                          ) : job.status === "synced" ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-brand" />
                              Synced
                            </>
                          ) : job.status === "running" ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Running
                            </>
                          ) : (
                            <span className="text-muted-2">Pending</span>
                          )}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {status.sync.error ? (
                  <p className="text-[12px] text-destructive">
                    {status.sync.error}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void finish()}
                    disabled={busy || !canFinish}
                    className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2.5 text-[13px] font-bold disabled:opacity-40 cursor-pointer"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Finish setup
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  {!hasRunningJob && (!status.sync.ready || hasFailedJob) ? (
                    <button
                      type="button"
                      onClick={() => void retrySync()}
                      className="inline-flex items-center gap-2 border border-border px-3 py-2.5 text-[12px] font-medium hover:bg-muted cursor-pointer"
                    >
                      Retry sync
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
