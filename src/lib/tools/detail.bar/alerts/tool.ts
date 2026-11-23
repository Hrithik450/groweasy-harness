import { uuidv7 } from "@/lib/utils/uuid";
import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import {
  readBarItemFor,
  resolveDetailBarSession,
  upsertDetailBarItems,
} from "@/lib/detail.bar/service";
import { type BarItemInput } from "@/lib/detail.bar/service";
import { validateAndNormalizeUI } from "@/lib/generative.ui";
import type {
  Alert,
  AlertStatus,
  AlertMeta,
  AlertAction,
  BarCard,
} from "@/lib/detail.bar";

const MAX_ALERTS_PER_CALL = 5;

export const updateAlertToolDefinition = {
  type: "function" as const,
  name: "updateAlert",
  preSkills: "alerts",
  description:
    "Writes the Ad Manager Alerts list. Pass `alerts` to create or update one or more alerts keyed by `id` (omit it to create a new alert; pass it with a new `status` to resolve an existing one). Returns only the rows that changed.",
  parameters: {
    type: "object",
    properties: {
      alerts: {
        type: "array",
        maxItems: MAX_ALERTS_PER_CALL,
        description:
          "1 to 5 alerts to create or update. Existing entries are matched by `id`.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "Existing alert ID to update. Omit to create a new alert.",
            },
            title: {
              type: "string",
              description:
                "Short headline of the issue (e.g. 'Ad Fatigue · Retargeting Top Funnel').",
            },
            severity: {
              type: "string",
              enum: ["critical", "warning", "info"],
              description:
                "'critical' for delivery blockers, 'warning' for degrading performance, 'info' for a neutral note.",
            },
            status: {
              type: "string",
              enum: ["pending", "completed", "error"],
              description: "Resolution status (default 'pending').",
            },
            description: {
              type: "string",
              description:
                "Plain-English cause from Meta telemetry, 1-2 lines.",
            },
            meta: {
              type: "object",
              description: "Meta identifiers the alert applies to.",
              properties: {
                adAccountId: {
                  type: "string",
                  description: "e.g. 'act_1202159847230100'.",
                },
                campaignId: { type: "string", description: "Campaign ID." },
                adSetId: {
                  type: "string",
                  description: "Ad set ID, if relevant.",
                },
                adId: { type: "string", description: "Ad ID, if relevant." },
              },
            },
            action: {
              type: "object",
              description:
                "Single-tap remediation with a before/after preview.",
              properties: {
                fix: {
                  type: "string",
                  description:
                    "Action plus money impact (e.g. 'Refresh creative: 3 new versions of top ad · Save ~₹14,500/mo').",
                },
                before: {
                  type: "string",
                  description:
                    "Current state (e.g. 'Hook: Running shoe · Frequency 4.2 · CTR 0.9%').",
                },
                after: {
                  type: "string",
                  description:
                    "State after the fix is applied, as data, not predicted results.",
                },
              },
              required: ["fix"],
            },
            chart: {
              type: "object",
              description: "Optional line, bar, or area chart ui block.",
            },
          },
          required: ["title", "severity", "description"],
        },
      },
    },
    required: ["alerts"],
  },
};

/**
 * One alert as the tool accepts it: the stored shape, partially filled, minus
 * timestamps the store records.
 */
export type AlertItemInput = Partial<
  Omit<Alert, "createdAt" | "meta" | "action" | "note">
> & {
  status?: AlertStatus;
  meta?: Partial<AlertMeta>;
  action?: Partial<AlertAction>;
};

export interface UpdateAlertArgs {
  alerts?: AlertItemInput[];
}

function mergeAlert(
  item: AlertItemInput,
  existing: BarCard<Alert> | undefined,
): { status: AlertStatus; data: Alert } {
  const rawMeta = item.meta ?? {};
  const adAccountId =
    rawMeta.adAccountId?.trim() || existing?.meta.adAccountId || "";
  const campaignId =
    rawMeta.campaignId?.trim() || existing?.meta.campaignId || "";
  const adSetId = rawMeta.adSetId?.trim() || existing?.meta.adSetId;
  const adId = rawMeta.adId?.trim() || existing?.meta.adId;

  const rawAction =
    typeof item.action === "object" && item.action !== null ? item.action : {};
  const fix = rawAction.fix?.trim() || existing?.action.fix || "";
  const before =
    rawAction.before !== undefined
      ? rawAction.before?.trim()
      : existing?.action.before;
  const after =
    rawAction.after !== undefined
      ? rawAction.after?.trim()
      : existing?.action.after;

  const chart = item.chart ?? existing?.chart;
  // The note belongs to the user; a re-emitted alert keeps it as-is.
  const note = existing?.note;

  const status = item.status || existing?.status || "pending";
  const data = {
    id: item.id?.trim() || existing?.id || uuidv7(),
    title: item.title?.trim() || existing?.title || "Account Alert",
    description: item.description?.trim() || existing?.description || "",
    severity: item.severity || existing?.severity || "warning",
    meta: {
      adAccountId,
      campaignId,
      ...(adSetId ? { adSetId } : {}),
      ...(adId ? { adId } : {}),
    },
    action: {
      fix,
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    },
    ...(chart ? { chart } : {}),
    ...(note ? { note } : {}),
  };

  return { status, data };
}

/** Normalise one submitted chart; returns an error string when invalid. */
function normaliseChart(chart: Record<string, unknown> | undefined): {
  chart?: Record<string, unknown>;
  error?: string;
} {
  if (chart === undefined) return {};
  try {
    return { chart: validateAndNormalizeUI(chart) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function executeUpdateAlertTool(
  input: ToolInput<UpdateAlertArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;

  if (!userId) {
    return failure("User authentication context is required to update alerts.");
  }

  const rawAlerts = input.args?.alerts;

  // Case 1: create or update alerts from the submitted array.
  if (Array.isArray(rawAlerts) && rawAlerts.length > 0) {
    const items: BarItemInput[] = [];
    // A re-emitted alert keeps the user's note as-is.
    const owner = resolveDetailBarSession(userId, "alerts");
    if (!owner) {
      return failure(
        "Ad Manager session not found for this user; alerts were not saved.",
      );
    }

    for (const item of rawAlerts.slice(0, MAX_ALERTS_PER_CALL)) {
      const normalized = normaliseChart(item.chart);
      if (normalized.error !== undefined) {
        return failure(normalized.error);
      }

      const existing =
        owner && typeof item.id === "string" && item.id.trim()
          ? (readBarItemFor(
              userId,
              "alerts",
              item.id.trim(),
            ) as BarCard<Alert> | null)
          : null;

      const alert = mergeAlert(
        normalized.chart ? { ...item, chart: normalized.chart } : item,
        existing ?? undefined,
      );
      items.push({ id: alert.data.id, status: alert.status, data: alert.data });
    }

    try {
      const written = upsertDetailBarItems(owner, "alerts", items);

      const summaries = written
        .map((a) => `- ID: ${a.id} ("${String(a.title ?? "")}")`)
        .join("\n");

      return {
        success: true,
        data: {
          contentParts: [
            {
              type: "input_text",
              text: `Saved ${written.length} alert(s):\n${summaries}`,
            },
          ],
        },
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return failure(`Saving alerts failed: ${errorMsg}`);
    }
  }

  return failure("The 'alerts' array parameter is required.");
}
