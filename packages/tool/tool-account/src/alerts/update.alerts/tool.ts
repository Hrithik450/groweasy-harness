import type { Session } from "@openai-harness/session";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";
import { mutateDetailBarState } from "@openai-harness/session-persistence";
import { formatAlertTimestamp } from "@openai-harness/date";
import { validateAndNormalizeUI } from "@openai-harness/generative-ui";

type AlertSeverity = "critical" | "warning" | "info";
type AlertStatus = "pending" | "completed" | "error";

interface AlertMeta {
  adAccountId: string;
  campaignId: string;
  adSetId?: string;
  adId?: string;
}

interface AlertAction {
  fix: string;
  before?: string;
  after?: string;
}

interface AlertItem {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  timestamp: string;
  meta: AlertMeta;
  action: AlertAction;
  chart?: Record<string, unknown>;
}

export const updateAlertsTool = defineTool({
  name: "updateAlerts",
  description:
    "Creates or updates account diagnostic alerts, risks, and delivery blockers in the Ad Manager DetailBar for the `alerts` skill. " +
    "Supports actionable fix execution metadata, resolution tracking (pending, completed, error), severity classification, and optional interactive UI charts.",
  timeoutMs: 15000,
  isConcurrencySafe: () => false,
  parameters: {
    alerts: {
      type: "array",
      required: true,
      description:
        "Array of 1 to 5 alert objects to create, merge, or update in the session DetailBar.",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          severity: {
            type: "string",
            enum: ["critical", "warning", "info"],
          },
          status: {
            type: "string",
            enum: ["pending", "completed", "error"],
          },
          description: { type: "string" },
        },
      },
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: true,
      properties: {
        count: { type: "number", required: true },
        summary: { type: "string", required: true },
        items: {
          type: "array",
          required: true,
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: (value as any).summary,
      },
    ],
    presentationMeta: (_args, value) => value,
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "edit",
    title: `Update alerts (${args.alerts?.length ?? 0} items)`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "edit",
    title: "Alerts updated",
    content: result.content,
  }),
  async execute(args, exec) {
    const session = toolSession<Session>(exec);
    const userId = session.userId;
    const sessionId = session.id;

    if (!userId || !sessionId) {
      throw new Error(
        "Authentication and session context are required to update alerts.",
      );
    }

    const rawItems = args.alerts;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new Error("The 'alerts' array parameter is required.");
    }

    const currentFormattedTime = formatAlertTimestamp(new Date());

    let formattedItems: AlertItem[] = [];

    await mutateDetailBarState(sessionId, "adManager", (current) => {
      const existingItems: AlertItem[] = Array.isArray(current.data.alerts)
        ? (current.data.alerts as AlertItem[])
        : [];
      const existingMap = new Map<string, AlertItem>();
      for (const ea of existingItems) {
        existingMap.set(ea.id, ea);
      }

      const nextItems: AlertItem[] = [];
      for (const a of rawItems.slice(0, 5)) {
        const existing = a.id ? existingMap.get(a.id) : undefined;
        const timestamp = existing?.timestamp
          ? formatAlertTimestamp(existing.timestamp)
          : currentFormattedTime;

        let normalizedChart: Record<string, unknown> | undefined = undefined;
        if (a.chart !== undefined) {
          normalizedChart = validateAndNormalizeUI(a.chart);
        } else if (existing?.chart !== undefined) {
          normalizedChart = existing.chart;
        }

        const rawMeta = (a.meta || {}) as Record<string, any>;
        const meta: AlertMeta = {
          adAccountId: (rawMeta.adAccountId as string) || existing?.meta?.adAccountId || "",
          campaignId: (rawMeta.campaignId as string) || existing?.meta?.campaignId || "",
          adSetId: (rawMeta.adSetId as string) || existing?.meta?.adSetId,
          adId: (rawMeta.adId as string) || existing?.meta?.adId,
        };

        const rawAction = (typeof a.action === "object" && a.action !== null ? a.action : {}) as Record<string, any>;
        const action: AlertAction = {
          fix: String(rawAction.fix || existing?.action?.fix || "Inspect diagnostics"),
          before: rawAction.before as string | undefined,
          after: rawAction.after as string | undefined,
        };

        const item: AlertItem = {
          id: a.id || existing?.id || `alert-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          title: a.title || existing?.title || "Alert",
          description: a.description || existing?.description || "",
          severity: (a.severity as AlertSeverity) || existing?.severity || "info",
          status: (a.status as AlertStatus) || existing?.status || "pending",
          timestamp,
          meta,
          action,
          ...(normalizedChart ? { chart: normalizedChart } : {}),
        };

        nextItems.push(item);
      }

      const mergedItems = [...existingItems];
      for (const fi of nextItems) {
        const idx = mergedItems.findIndex((it) => it.id === fi.id);
        if (idx >= 0) {
          mergedItems[idx] = fi;
        } else {
          mergedItems.unshift(fi);
        }
      }

      formattedItems = nextItems;

      return {
        ...current,
        type: "adManager",
        data: {
          ...current.data,
          alerts: mergedItems,
        },
      };
    });

    const summary = `Successfully updated ${formattedItems.length} alert(s) in the Ad Manager DetailBar.`;

    return {
      count: formattedItems.length,
      items: formattedItems as any,
      summary,
    };
  },
});
