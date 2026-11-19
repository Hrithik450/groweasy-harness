---
name: reports
description: "Daily strategist report that reads the latest research, campaigns, briefs, ideas, creatives, alerts, and suggestions, then saves one UI-block report per day with a single clear action."
---

## Rules

- **One report per day:** the stored id is today's date, so re-running the same day updates that report instead of adding a second one.
- **Lead with the biggest change:** the first thing the reader sees is what moved most, not an account overview.
- **A critical alert takes the headline:** if a `critical` alert exists, it is the story. Performance commentary follows it.
- **Compare equal periods:** week against week, or day against the same weekday. Never compare a partial period with a full one.
- **One main action:** end with exactly one recommended action the reader can take today. Secondary observations stay supporting text.
- **A quiet day is one line:** when nothing meaningful changed, say so plainly and skip the charts. Do not manufacture a narrative.
- **Never invent numbers:** every metric comes from a tool result. Missing data becomes "not available", never an estimate.
- **Not this skill:** alert cards are `alerts`; growth ideas are `suggestions`; a campaign plan is `campaign-brief`.

## Clarifications

- Dates are not arguments: the report is stored with its write time and every label the UI shows is derived from it.
- If the user names a day explicitly, report that day. Otherwise report the latest completed day with data.
- If the account is disconnected or has no data, state that in the summary and save a one-line report rather than a fabricated one.

## Guardrails

- **No raw dumps:** never paste API payloads or unparsed JSON into the report.
- **No charts without data:** every chart point must trace to a tool result. Omit a chart rather than fill gaps.
- **Respect component limits:** use only catalog components; keep headings, labels, and table cells within their word limits.
- **No tool talk:** never mention tool names, queries, projections, or retries in the report or reply.
- **One action only:** do not turn the report into a task list. If many fixes exist, name the one with the largest money or learning impact.
- **No self-referential filler:** do not describe the report, the data pipeline, or the fact that a report was generated.

## Execution Workflow

### Step 1: Read the latest inputs

Use `fetchDetailBar` with a small limit for each list:

1. `competitorResearches` — newest findings only (limit 1-2).
2. `campaigns` — current delivery and spend.
3. `campaignBriefs` — what the team set out to do.
4. `ideas` and `creatives` — what is queued and what shipped.
5. `alerts` and `suggestions` — problems and openings, with critical alerts first.

Skip a list when it has no rows; do not page history unless the day's story depends on it.

### Step 2: Choose the headline

- A `critical` alert outranks every performance change.
- Otherwise rank by money impact, then by size of the period-over-period change.
- Write the title as the headline itself, eight words or fewer.
- Write the summary as one sentence of 30 words or fewer.

### Step 3: Build the blocks spec

Store one flat UI-block spec under `blocks`, shaped `{ root, elements }`:

- Root is an unstyled `Stack`.
- Use `Heading` for sections, `Text` for one or two lines of context.
- Use `Metric` for the two or three numbers that carry the day; pair every change with its trend.
- Use `Table` for a compact period comparison when more than two rows changed.
- Use `LineChart`, `BarChart`, or `AreaChart` only when the trend is the point.
- Keep each section short enough to scan on a phone.

### Step 4: Save with `updateReports`

- Pass `title`, `summary`, and `blocks`. Nothing else.
- The tool validates the spec and returns the validation error verbatim; fix the spec and retry.
- The tool returns the report page URL (`/c/<ad-strategist-session>/reports/report-<isoDate>`); quote that exact URL, never one you build yourself.

### Step 5: Reply

Reply with two lines: the report headline and its URL. Do not repeat the full report in chat.

---

## Deliverables

- Exactly one saved daily report in the Reports tab, rendered from its `blocks` spec at `/c/<sessionId>/reports/report-<isoDate>`.
- A two-line chat reply with the headline and the report URL.
