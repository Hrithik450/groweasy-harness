import { NextRequest, NextResponse } from "next/server";
import {
  cancelAgent,
  enqueuePrompt,
  isAgentRunning,
  whenAgentIdle,
} from "@/lib/core/agent/registry";
import { ensureAgentForSession } from "@/lib/session/agent.host";
import { MessageId } from "@/lib/llm/llm/brand";
import { randomUUID } from "@/lib/utils/uuid";
import { getAuthSessionFromRequest } from "@/lib/auth/session";
import { activateCronJobsForConnector } from "@/lib/cron/activation";
import {
  resolveSession,
  upsertConnector,
  ensureDefaultCronJobs,
  getConnectorByUserIdAndSlug,
  normalizeInstanceKey,
  DEFAULT_BUSINESS_PROFILE_CRON_JOBS,
} from "@/lib/services";

const SCAN_TIMEOUT_MS = 6 * 60 * 1000;

/** One in-flight connect per analyzer session, across overlapping requests. */
const activeScans = new Set<string>();

/**
 * POST /api/connectors/business.profile/connect
 * Receives brand URL, resolves a dedicated analyzer session, and runs its turn.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthSessionFromRequest(req);
  let instance: string | null = null;
  let lockedSession: string | null = null;

  try {
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { url, input } = body;

    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json(
        { error: "Valid website URL is required" },
        { status: 400 },
      );
    }

    const sessionRes = await resolveSession({
      userId: user.id,
      slug: "businessProfile",
      title: "Brand Brain Analyzer",
      reuse: true,
      // The analyzer is background machinery, not a chat the user owns.
      hidden: true,
    });

    if (!sessionRes.success || !sessionRes.data) {
      return NextResponse.json(
        { error: sessionRes.error || "Failed to resolve analyzer session" },
        { status: 500 },
      );
    }

    const session = sessionRes.data;
    const cleanUrl = url.trim();

    // The brand domain selects the instance: reconnecting the same brand
    // resumes that profile, a different brand gets its own row.
    instance = normalizeInstanceKey(cleanUrl);
    if (!instance) {
      return NextResponse.json(
        { error: "Valid website URL is required" },
        { status: 400 },
      );
    }

    // One analyzer turn at a time: a second brand would otherwise redirect the
    // running turn's save to a different instance.
    await ensureAgentForSession(session);
    if (activeScans.has(session.id) || isAgentRunning(session.id)) {
      return NextResponse.json(
        {
          error:
            "A brand analysis is already running. Please wait for it to finish.",
        },
        { status: 409 },
      );
    }
    activeScans.add(session.id);
    lockedSession = session.id;

    const existingConnector = await getConnectorByUserIdAndSlug(
      user.id,
      "businessProfile",
      instance,
    );
    const metadata: Record<string, unknown> = {
      ...(existingConnector.data?.metadata ?? {}),
      url: cleanUrl,
    };
    delete metadata.error;

    await upsertConnector({
      userId: user.id,
      slug: "businessProfile",
      providerSlug: "adsEasy",
      instance,
      isPrimary: true,
      status: "running",
      metadata,
    });

    const deadline = AbortSignal.timeout(SCAN_TIMEOUT_MS);
    const inputText =
      typeof input === "string" && input.trim()
        ? input.trim()
        : "Analyze this brand website and save the complete business profile.";

    enqueuePrompt(
      session.id,
      [
        {
          id: MessageId(randomUUID()),
          role: "user",
          content: [{ type: "text", text: inputText }],
          // The build is background work; its turn must not render as input.
          source: { kind: "system" },
        },
      ],
      "queue",
    );

    // The scan is bounded: a timeout interrupts the agent, exactly as Stop does.
    const abort = (): void => {
      cancelAgent(session.id);
    };
    deadline.addEventListener("abort", abort, { once: true });

    try {
      await whenAgentIdle(session.id);
    } finally {
      deadline.removeEventListener("abort", abort);
    }

    if (deadline.aborted) {
      await upsertConnector({
        userId: user.id,
        slug: "businessProfile",
        providerSlug: "adsEasy",
        instance,
        status: "error",
        metadata: {
          ...metadata,
          error:
            "The analysis did not finish within 6 minutes. Please try again.",
        },
      });
      return NextResponse.json(
        { error: "The analysis did not finish within 6 minutes." },
        { status: 504 },
      );
    }

    const settled = await getConnectorByUserIdAndSlug(
      user.id,
      "businessProfile",
      instance,
    );
    if (settled.data?.status !== "connected") {
      const error =
        settled.data?.status === "running"
          ? "The analysis finished without saving a profile. Please try again."
          : "The analysis did not complete. Please try again.";
      await upsertConnector({
        userId: user.id,
        slug: "businessProfile",
        providerSlug: "adsEasy",
        instance,
        status: "error",
        metadata: {
          ...((settled.data?.metadata as Record<string, unknown> | null) ?? {}),
          error,
        },
      });
      return NextResponse.json({ error }, { status: 502 });
    }

    await ensureDefaultCronJobs(user.id, DEFAULT_BUSINESS_PROFILE_CRON_JOBS);
    activateCronJobsForConnector(user.id, "businessProfile", false);

    return NextResponse.json({
      success: true,
    });
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Failed to connect business profile";

    if (user?.id) {
      try {
        const current = instance
          ? await getConnectorByUserIdAndSlug(
              user.id,
              "businessProfile",
              instance,
            )
          : null;
        if (instance) {
          await upsertConnector({
            userId: user.id,
            slug: "businessProfile",
            providerSlug: "adsEasy",
            instance,
            status: "error",
            metadata: {
              ...(current?.data?.metadata ?? {}),
              url: current?.data?.metadata?.url ?? instance,
              error: errorMsg,
            },
          });
        }
      } catch (dbErr) {
        console.error("Failed to reset connector status:", dbErr);
      }
    }

    return NextResponse.json({ error: errorMsg }, { status: 500 });
  } finally {
    if (lockedSession) activeScans.delete(lockedSession);
  }
}
