import type { Session } from "@openai-harness/session";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";
import { validateAndNormalizeUI } from "@openai-harness/generative-ui";
import { mutateDetailBarState } from "@openai-harness/session-persistence";

type ReportPeriod = "thisWeek" | "lastWeek";

/**
 * One persisted report card in `detailBar.data.reports`.
 *
 * `blocks` stores the normalized flat json-render spec (`root`/`elements`)
 * produced by `validateAndNormalizeUI`, not the nested authoring shape the
 * model emits.
 */
export interface StoredAdStrategistReport {
  id: string;
  period: ReportPeriod;
  day: string;
  date: string;
  isoDate: string;
  title: string;
  summary: string;
  blocks: Record<string, unknown>;
  isNew?: boolean;
  createdAt: number;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_WEEK_MS = 7 * DAY_MS;

/** Calendar day the product treats as "today" (matches the prompt clock). */
const PRODUCT_TIME_ZONE = "Asia/Kolkata";

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: "UTC",
});

const DAY_OF_MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  timeZone: "UTC",
});

const TODAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: PRODUCT_TIME_ZONE,
});

/** Today's `YYYY-MM-DD` in the product timezone. */
function todayIsoDate(): string {
  const parts = TODAY_FORMAT.formatToParts(new Date());
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/**
 * Validate the model-supplied calendar date and resolve it to a UTC midnight.
 *
 * The date is a calendar day, so validation and all weekday math use UTC to
 * avoid shifting it across a timezone boundary.
 */
function resolveCalendarDate(input?: string): {
  isoDate: string;
  instant: number;
} {
  const isoDate = input?.trim() || todayIsoDate();
  if (!ISO_DATE_PATTERN.test(isoDate)) {
    throw new Error(
      `Invalid 'date' argument "${isoDate}": expected an ISO calendar date (YYYY-MM-DD).`,
    );
  }
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== isoDate
  ) {
    throw new Error(
      `Invalid 'date' argument "${isoDate}": the date does not exist.`,
    );
  }
  return { isoDate, instant: parsed.getTime() };
}

/** UTC midnight of the Monday that starts the ISO week containing `instant`. */
function startOfIsoWeek(instant: number): number {
  const daysSinceMonday = (new Date(instant).getUTCDay() + 6) % 7;
  return instant - daysSinceMonday * DAY_MS;
}

/** `thisWeek` inside the current Monday–Sunday ISO week, else `lastWeek`. */
function resolvePeriod(instant: number, now: number = Date.now()): ReportPeriod {
  const start = startOfIsoWeek(now);
  return instant >= start && instant < start + ISO_WEEK_MS
    ? "thisWeek"
    : "lastWeek";
}

/** Weekday short name ("Tue") and day of month ("20") from Intl. */
function describeCalendarDate(instant: number): { day: string; date: string } {
  const date = new Date(instant);
  return {
    day: WEEKDAY_FORMAT.format(date),
    date: DAY_OF_MONTH_FORMAT.format(date),
  };
}

export const saveReportTool = defineTool({
  name: "saveReport",
  description:
    "Saves one complete report for the Ad Strategist `Daily reports` tab. " +
    "Pass the entire report as a single Generative UI block spec; the tool derives the ISO date, weekday, day of month, and this/last week period, replaces any existing report for the same date, and keeps the newest 20.",
  timeoutMs: 15000,
  isConcurrencySafe: () => false,
  parameters: {
    title: {
      type: "string",
      required: true,
      description:
        "Concise report title, 3-6 words (e.g. 'Weekly Account Performance Audit').",
    },
    summary: {
      type: "string",
      required: true,
      description:
        "1-2 sentence card summary of the report's headline finding.",
    },
    blocks: {
      type: "object",
      required: true,
      additionalProperties: true,
      description:
        "json-render UI block spec whose root is a Stack containing Heading/Text/Metric/Grid/Table/chart blocks. One spec carries the whole report.",
    },
    date: {
      type: "string",
      description:
        "ISO calendar date (YYYY-MM-DD) the report covers. Defaults to today.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", required: true },
        title: { type: "string", required: true },
        count: { type: "number", required: true },
        summary: { type: "string", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => value,
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "edit",
    title: `Save report: "${args.title}"`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "edit",
    title: "Report saved",
    content: result.content,
  }),
  async execute(args, exec) {
    const session = toolSession<Session>(exec);
    const sessionId = session.id;

    if (!sessionId) {
      throw new Error(
        "Session context is required to save a report.",
      );
    }

    const title = (args.title ?? "").trim();
    if (!title) {
      throw new Error("Missing required argument 'title'.");
    }

    const summary = (args.summary ?? "").trim();
    if (!summary) {
      throw new Error("Missing required argument 'summary'.");
    }

    if (
      !args.blocks ||
      typeof args.blocks !== "object" ||
      Array.isArray(args.blocks)
    ) {
      throw new Error(
        "Missing required argument 'blocks': pass one Generative UI block spec rooted at a Stack.",
      );
    }

    const normalizedBlocks = validateAndNormalizeUI(args.blocks);
    if (!normalizedBlocks) {
      throw new Error(
        "The 'blocks' argument did not produce a renderable UI spec.",
      );
    }

    const { isoDate, instant } = resolveCalendarDate(args.date);
    const { day, date } = describeCalendarDate(instant);
    const createdAt = Date.now();
    const report: StoredAdStrategistReport = {
      id: `report-${isoDate}-${createdAt}`,
      period: resolvePeriod(instant),
      day,
      date,
      isoDate,
      title,
      summary,
      blocks: normalizedBlocks as unknown as Record<string, unknown>,
      createdAt,
    };

    let count = 0;
    await mutateDetailBarState(sessionId, "adStrategist", (current) => {
      const existing = Array.isArray(current.data.reports)
        ? (current.data.reports as StoredAdStrategistReport[])
        : [];

      // One report per calendar date: the newest save replaces the old one.
      const reports = [report, ...existing.filter((item) => item?.isoDate !== isoDate)]
        .slice(0, 20)
        .map((item, index) => ({ ...item, isNew: index === 0 }));

      count = reports.length;

      return {
        ...current,
        type: "adStrategist",
        data: {
          ...current.data,
          reports,
        },
      };
    });

    return {
      id: report.id,
      title,
      count,
      summary: `Saved report "${title}" for ${day} ${date} (${count} report${count === 1 ? "" : "s"} in the Ad Strategist DetailBar).`,
    };
  },
});
