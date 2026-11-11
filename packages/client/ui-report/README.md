---
description: "Report screen for the browser client: a keyed main-slot route entry that renders one report document with the Generative UI renderer."
kind: "package-reference"
---

# @openai-harness/client-ui-report

## Summary

The report screen, addressed by `/c/<sessionId>/reports/<reportId>`. The
browser half is one Cordis client plugin: it registers `ReportPage` into the
shell's keyed `main` slot under the `report` key.

Registration uses `ctx.slots.inject("main", …)`, so the package may load
before or after the layout package that declares the `main` slot. The plugin
also merges the `main` contract into `SlotMap` (`keyed`, `root` scope) for
type checking.

## Public surface

- `apply(ctx)` — waits for `main` to be declared, then registers
  `ReportPage` under `REPORT_PANEL_ID`.
- `inject` — `['slots']`.
- `REPORT_PANEL_ID` — `"report"`.
- `ReportPage` — parses the path and renders the projection-bound report.
- `parseReportPath(pathname)` — pure route parser returning
  `{ sessionId, reportId }` or `null`.

## Data flow

The page adds no RPC. `useDetailBar(sessionId)` (from
`@openai-harness/client-ui-session`) seeds the session's `detailBar`
projection from `session.projection` and folds live `detailBar/update`
events; the page then finds the record by `id` in
`detailBar.data.reports`.

The record's `blocks` field is one normalized json-render spec (a root
`Stack`) and is drawn full-width with `GenerativeUIRenderer` from
`@openai-harness/client-ui-generative/client` — the same unit the chat blocks
and detail-bar charts use.

## Integration

The shell resolves `/c/<sessionId>/reports/<reportId>` before the plain
`/c/<sessionId>` route, composes the layout with `mainKey: "report"`, and
loads this plugin. The report route composes no chat package and no detail
bar.

The page's back link and the sidebar's session links are document
navigations: a report document has no chat fiber to reopen in place, so the
shell falls back to `window.location.assign` from this route.

## Boundaries

No `next/*`, `@/components`, `@/lib`, or `@/store` imports; all component
imports inside the package are relative.
