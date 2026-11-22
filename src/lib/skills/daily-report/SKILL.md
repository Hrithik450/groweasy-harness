---
name: daily-report
description: "Daily report that reads the latest campaigns, research, briefs, ideas, creatives, alerts, and suggestions, then saves one compact UI-block report per day covering what changed and everything created yesterday."
---

## Rules

- **Lead with the biggest change:** a `critical` alert takes the headline. Otherwise rank by money impact, then by size of the period-over-period change.
- **Compare equal periods:** the day against the previous day, and against the account's 28-day average for the same objective. Never compare a partial period with a full one.
- **Today's moves:** up to 3 informational moves. No buttons or per-item actions; the reader applies them manually.
- **Quiet day:** if nothing meaningful changed, write a one-line report and skip the table and charts. Don't manufacture a story.
- **Never invent numbers:** every figure comes from a tool result. Missing data is "n/a". A projection is allowed only when labelled "estimate" and built from tool numbers.
- **Not this skill:** alert cards are `alerts`; growth ideas are `suggestions`; a campaign plan is `campaign-brief`.

## Clarifications

- If the user names a day, report that day. Otherwise report the latest completed day with data.
- If the account is disconnected or has no data, save a one-line report saying so.

## Guardrails

- No raw payloads, no tool talk, no self-referential filler ("this report was generated").
- No chart point without a tool result. Omit the chart rather than fill gaps.
- Use only catalog components and respect their word limits.
- Never include links to ads, tracking or status flags, per-item buttons, or a task list.

## Execution Workflow

### Step 1: Read the latest inputs

Use `fetchDetailBar` for both current context and the report day. It accepts optional `startDate`/`endDate`; when present, the response includes `count` and the rows created inside that inclusive range. Skip a list that is empty.

1. `campaigns`: yesterday vs the day before and the 28-day average (spend, purchases, CPA, revenue, ROAS, AOV, conversion rate), plus which ads won or stopped.
2. For `ideas`, `creatives`, `competitorResearches`, `campaignBriefs`, `alerts`, and `suggestions`, call `fetchDetailBar` once per field with `startDate` and `endDate` both set to the report day (`YYYY-MM-DD`). Use each response's `count` as the work-generated number and its `items` for titles/details. If the report covers a different day, use that day instead.
3. `competitorResearches`, `alerts`, and `suggestions`: newest rows only for the latest context (limit 4-6).
4. `campaignBriefs`, `ideas`, `creatives`: only what shipped, was queued or was changed since the last report.

### Step 2: Choose the headline

- Write it as the finding itself, 8 words or fewer, with the real numbers (for example "Purchases up 18% on the Diwali gift box. One new winner.").
- Write the summary as one sentence of 30 words or fewer.

### Step 3: Build the blocks spec

Store one flat spec under `blocks`, shaped `{ root, elements }`. Root is an unstyled `Stack`. Everything is visible: no Accordions, no collapsed content. Keep it scannable on a phone.

The reference example is the required output bar, not inspiration. Match its section order, component mapping, variants and density exactly. You may only omit a section the data cannot support, or add a section built from the same patterns. Never replace it with a simpler, shorter or more compact report.

**Rules**

1. **Page rhythm.** An `h1` headline and one-row scope Table (Date, Account, Spend, Results, Avg CPP) come first. Every section after is its own Card stacked vertically.
2. **Section header.** Accent Eyebrow number + `h1` Heading on the left, uppercase `xs` meta Text on the right, then a Separator.
3. **Color roles.** `dark` for the short version and proof, `accent` for the single biggest move, `light` as default, `muted` for quiet caveats.
4. **Type hierarchy.** `h1` for titles; `h2` for campaigns, ads and moves; `h6` for idea and alert names; Eyebrow `xl` for big numbers and `sm` for labels; Text `lg` for findings, `sm` for body, `xs` for meta and evidence.
5. **Layout grids.** 3 columns for findings, 4 for stats, 2 for paired panels; use `spans` for asymmetric rows.
6. **Data components.** ProgressBar for weekly pace, Table for campaigns, market and work, Badge for winner / waste.
7. **No actionables.** Never include buttons, per-item actions or a task list. Today's moves are informational rows the reader applies manually.
8. **No fallback.** If validation fails, correct the block and render again. Never switch to Markdown.

**Sections, in this order (omit any the data can't support):**

- **Headline & scope:** the finding as `h1`, then a one-row Table (Date, Account, Spend, Results, Avg CPP).
- **01 The short version:** dark Card with 3 dark finding cards (number, finding, evidence) and an accent The-move Card.
- **02 Yesterday in numbers:** 4 stat cards (label, `xl` value, `xs` comparison).
- **03 Work generated:** light Card with an explicit count line in the meta (research, briefs, creatives, ideas, alerts) and a Table (Created, Item, Detail). Include every competitor research, brief, creative, idea and alert created yesterday.
- **04 Campaigns:** 6-column Table (Campaign, Spend, Results, Avg CPP, vs prior 7d, Why).
- **05 Ads that moved:** one winner and one waste Card, each `Grid columns: 3` with media + body. Video for video, Image for static. Body has name + Badge, 3 stats, one line of reasoning, and an accent The-move Card.
- **06 Market overnight:** Table (Market, Move, Why), verified research only.
- **07 Week so far:** ProgressBar rows for budget pace, purchases, CPP and new creatives.
- **08 Today's moves:** up to 3 informational rows, `Grid columns: 6` with spans `[1,2,3]`: number, name + line, Format / Why. No buttons.

**Never include:** buttons, per-item actions, a task list, links to ads, accordions, or a Markdown fallback.

## Reference example

Below is the required daily report output standard, not inspiration. Your report must match its section order, component mapping, variants, spacing and density exactly. Only omit a section the data cannot support, or add a section built from the same patterns. Never produce a simpler, shorter or more compact version. Do not copy its content. All names and numbers are illustrative.

<ui-block>
{
  "root": "root",
  "elements": {
    "root": {"type":"Stack","props":{"direction":"vertical","gap":"md","align":"stretch","justify":"start"},"children":["title","scope","d1","d2","d3w","d3","d4","d5","d6","d7"]},
    "title": {"type":"Heading","props":{"text":"Yesterday beat your week. One ad is wasting money.","level":"h1"}},
    "scope": {"type":"Table","props":{"variant":"light","headerVariant":"light","columns":["Date","Account","Spend","Results","Avg CPP"],"rows":[["Yesterday","Telesales account","₹4,820","14","₹344"]]}},
    "d1": {"type":"Card","props":{"variant":"dark"},"children":["d1-header","d1-div","d1-findings","d1-move"]},
    "d1-header": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["d1-eyebrow","d1-heading"]},
    "d1-eyebrow": {"type":"Eyebrow","props":{"text":"01","size":"sm","variant":"accent"}},
    "d1-heading": {"type":"Heading","props":{"text":"The short version","level":"h1"}},
    "d1-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "d1-findings": {"type":"Grid","props":{"columns":3},"children":["d1-f1","d1-f2","d1-f3"]},
    "d1-f1": {"type":"Card","props":{"variant":"dark"},"children":["d1-f1-s"]},
    "d1-f1-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d1-f1-h","d1-f1-t","d1-f1-e"]},
    "d1-f1-h": {"type":"Eyebrow","props":{"text":"01","size":"xl","variant":"accent"}},
    "d1-f1-t": {"type":"Text","props":{"text":"Best day this week: 14 purchases at ₹344.","size":"lg","variant":"light"}},
    "d1-f1-e": {"type":"Text","props":{"text":"EVIDENCE · 14 PURCHASES · ₹4,820 SPEND","size":"xs","variant":"light"}},
    "d1-f2": {"type":"Card","props":{"variant":"dark"},"children":["d1-f2-s"]},
    "d1-f2-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d1-f2-h","d1-f2-t","d1-f2-e"]},
    "d1-f2-h": {"type":"Eyebrow","props":{"text":"02","size":"xl","variant":"accent"}},
    "d1-f2-t": {"type":"Text","props":{"text":"UGC_unboxing_v3 did 8 of 14 purchases in its first day.","size":"lg","variant":"light"}},
    "d1-f2-e": {"type":"Text","props":{"text":"EVIDENCE · 8 OF 14 · ₹298 AVG CPP","size":"xs","variant":"light"}},
    "d1-f3": {"type":"Card","props":{"variant":"dark"},"children":["d1-f3-s"]},
    "d1-f3-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d1-f3-h","d1-f3-t","d1-f3-e"]},
    "d1-f3-h": {"type":"Eyebrow","props":{"text":"03","size":"xl","variant":"accent"}},
    "d1-f3-t": {"type":"Text","props":{"text":"Kachi Roots started testing freshness — the angle we planned to own.","size":"lg","variant":"light"}},
    "d1-f3-e": {"type":"Text","props":{"text":"EVIDENCE · 2 NEW ADS · MARKET OVERNIGHT","size":"xs","variant":"light"}},
    "d1-move": {"type":"Card","props":{"variant":"accent"},"children":["d1-move-s"]},
    "d1-move-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d1-move-e","d1-move-h"]},
    "d1-move-e": {"type":"Eyebrow","props":{"text":"The move","size":"sm"}},
    "d1-move-h": {"type":"Heading","props":{"text":"Stop static_shelf_v1 and move its ₹400/day to UGC_unboxing_v3.","level":"h1"}},
    "d2": {"type":"Card","props":{"variant":"light"},"children":["d2-header","d2-div","d2-grid"]},
    "d2-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["d2-title","d2-meta"]},
    "d2-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["d2-eyebrow","d2-heading"]},
    "d2-eyebrow": {"type":"Eyebrow","props":{"text":"02","size":"sm","variant":"accent"}},
    "d2-heading": {"type":"Heading","props":{"text":"Yesterday in numbers","level":"h1"}},
    "d2-meta": {"type":"Text","props":{"text":"VS 7-DAY AVERAGE","size":"xs"}},
    "d2-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "d2-grid": {"type":"Grid","props":{"columns":4},"children":["d2-1","d2-2","d2-3","d2-4"]},
    "d2-1": {"type":"Card","props":{"variant":"light"},"children":["d2-1-s"]},
    "d2-1-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d2-1-l","d2-1-v","d2-1-n"]},
    "d2-1-l": {"type":"Eyebrow","props":{"text":"Spend","size":"sm","variant":"muted"}},
    "d2-1-v": {"type":"Eyebrow","props":{"text":"₹4,820","size":"xl","variant":"foreground"}},
    "d2-1-n": {"type":"Text","props":{"text":"14% vs 7-day avg","size":"xs"}},
    "d2-2": {"type":"Card","props":{"variant":"light"},"children":["d2-2-s"]},
    "d2-2-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d2-2-l","d2-2-v","d2-2-n"]},
    "d2-2-l": {"type":"Eyebrow","props":{"text":"Results","size":"sm","variant":"muted"}},
    "d2-2-v": {"type":"Eyebrow","props":{"text":"14","size":"xl","variant":"foreground"}},
    "d2-2-n": {"type":"Text","props":{"text":"8 purchases · 6 first-timers","size":"xs"}},
    "d2-3": {"type":"Card","props":{"variant":"light"},"children":["d2-3-s"]},
    "d2-3-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d2-3-l","d2-3-v","d2-3-n"]},
    "d2-3-l": {"type":"Eyebrow","props":{"text":"Avg CPP","size":"sm","variant":"muted"}},
    "d2-3-v": {"type":"Eyebrow","props":{"text":"₹344","size":"xl","variant":"foreground"}},
    "d2-3-n": {"type":"Text","props":{"text":"vs ₹433 avg","size":"xs"}},
    "d2-4": {"type":"Card","props":{"variant":"light"},"children":["d2-4-s"]},
    "d2-4-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d2-4-l","d2-4-v","d2-4-n"]},
    "d2-4-l": {"type":"Eyebrow","props":{"text":"CTR","size":"sm","variant":"muted"}},
    "d2-4-v": {"type":"Eyebrow","props":{"text":"2.9%","size":"xl","variant":"foreground"}},
    "d2-4-n": {"type":"Text","props":{"text":"vs 2.4% avg","size":"xs"}},
    "d3w": {"type":"Card","props":{"variant":"light"},"children":["d3w-header","d3w-div","d3w-table"]},
    "d3w-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["d3w-title","d3w-meta"]},
    "d3w-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["d3w-eyebrow","d3w-heading"]},
    "d3w-eyebrow": {"type":"Eyebrow","props":{"text":"03","size":"sm","variant":"accent"}},
    "d3w-heading": {"type":"Heading","props":{"text":"Work generated","level":"h1"}},
    "d3w-meta": {"type":"Text","props":{"text":"2 RESEARCH · 1 BRIEF · 3 CREATIVES · 5 IDEAS · 2 ALERTS","size":"xs"}},
    "d3w-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "d3w-table": {"type":"Table","props":{"variant":"light","headerVariant":"light","columns":["Created","Item","Detail"],"rows":[["Competitor research","Cold-pressed oil · Bangalore","4 competitors · 148 ads"],["Competitor research","Snacks · India","6 competitors · 92 ads"],["Campaign brief","Diwali gift box","₹999 · 28 days"],["Creative","UGC_unboxing_v3","Video · 9:16"],["Creative","static_shelf_v1","Image · 1:1"],["Creative","dated_price_card_v1","Image · 1:1"],["Idea","Pressed Monday","From Gap 01"],["Idea","Dated price card","From Gap 02"],["Idea","Kadai in 30 s","From Gap 03"],["Idea","Founder proof","Competitor winner"],["Idea","Gift bundle","From insights"],["Alert","static_shelf_v1 waste","₹2,100 spent · 0 purchases"],["Alert","Frequency rising","3.4 on UGC_unboxing_v3"]]}},
    "d3": {"type":"Card","props":{"variant":"light"},"children":["d3-header","d3-div","d3-table"]},
    "d3-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["d3-title","d3-meta"]},
    "d3-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["d3-eyebrow","d3-heading"]},
    "d3-eyebrow": {"type":"Eyebrow","props":{"text":"04","size":"sm","variant":"accent"}},
    "d3-heading": {"type":"Heading","props":{"text":"Campaigns","level":"h1"}},
    "d3-meta": {"type":"Text","props":{"text":"7 DAY · ACTIVE ONLY","size":"xs"}},
    "d3-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "d3-table": {"type":"Table","props":{"variant":"light","headerVariant":"dark","columns":["Campaign","Spend","Results","Avg CPP","vs prior 7d","Why"],"rows":[["Broad telesales trial","₹1,850","1","₹344","1 new last week","New campaign · still learning"],["Broad remarketing","₹1,800","5","₹285","+12%","CRM audience warming"],["Broad telesales v2","₹1,140","4","₹285","+6%","Best day: 3 purchases"]]}},
    "d4": {"type":"Card","props":{"variant":"light"},"children":["d4-header","d4-div","d4-list"]},
    "d4-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["d4-title","d4-meta"]},
    "d4-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["d4-eyebrow","d4-heading"]},
    "d4-eyebrow": {"type":"Eyebrow","props":{"text":"05","size":"sm","variant":"accent"}},
    "d4-heading": {"type":"Heading","props":{"text":"Ads that moved","level":"h1"}},
    "d4-meta": {"type":"Text","props":{"text":"YESTERDAY · WINNER AND WASTE","size":"xs"}},
    "d4-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "d4-list": {"type":"Stack","props":{"direction":"vertical","gap":"md","align":"stretch","justify":"start"},"children":["d4-a1","d4-a2"]},
    "d4-a1": {"type":"Card","props":{"variant":"light"},"children":["d4-a1-grid"]},
    "d4-a1-grid": {"type":"Grid","props":{"columns":3,"spans":[{"colSpan":1},{"colSpan":2}]},"children":["d4-a1-media","d4-a1-body"]},
    "d4-a1-media": {"type":"Video","props":{"src":"http://localhost:3000/samples/vertical-ad-01.mp4","title":"UGC unboxing v3","aspectRatio":"9/16"}},
    "d4-a1-body": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d4-a1-top","d4-a1-stats","d4-a1-t","d4-a1-move"]},
    "d4-a1-top": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["d4-a1-name","d4-a1-badge"]},
    "d4-a1-name": {"type":"Heading","props":{"text":"UGC_unboxing_v3","level":"h2"}},
    "d4-a1-badge": {"type":"Badge","props":{"text":"WINNER","variant":"accent"}},
    "d4-a1-stats": {"type":"Grid","props":{"columns":3},"children":["d4-a1-s1","d4-a1-s2","d4-a1-s3"]},
    "d4-a1-s1": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d4-a1-s1-h","d4-a1-s1-t"]},
    "d4-a1-s1-h": {"type":"Eyebrow","props":{"text":"First-timers","size":"sm","variant":"muted"}},
    "d4-a1-s1-t": {"type":"Text","props":{"text":"6","size":"sm"}},
    "d4-a1-s2": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d4-a1-s2-h","d4-a1-s2-t"]},
    "d4-a1-s2-h": {"type":"Eyebrow","props":{"text":"Avg CPP","size":"sm","variant":"muted"}},
    "d4-a1-s2-t": {"type":"Text","props":{"text":"₹298","size":"sm"}},
    "d4-a1-s3": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d4-a1-s3-h","d4-a1-s3-t"]},
    "d4-a1-s3-h": {"type":"Eyebrow","props":{"text":"ROAS","size":"sm","variant":"muted"}},
    "d4-a1-s3-t": {"type":"Text","props":{"text":"1.9","size":"sm"}},
    "d4-a1-t": {"type":"Text","props":{"text":"Still your strongest ad and still fresh. Getting 2 refreshes in the next 7 days should protect its success.","size":"sm"}},
    "d4-a1-move": {"type":"Card","props":{"variant":"accent"},"children":["d4-a1-move-s"]},
    "d4-a1-move-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d4-a1-move-h","d4-a1-move-t"]},
    "d4-a1-move-h": {"type":"Eyebrow","props":{"text":"The move","size":"sm"}},
    "d4-a1-move-t": {"type":"Text","props":{"text":"Keep running at ₹1,200/day for 3 more days.","size":"sm"}},
    "d4-a2": {"type":"Card","props":{"variant":"light"},"children":["d4-a2-grid"]},
    "d4-a2-grid": {"type":"Grid","props":{"columns":3,"spans":[{"colSpan":2},{"colSpan":1}]},"children":["d4-a2-body","d4-a2-media"]},
    "d4-a2-media": {"type":"Image","props":{"src":"https://picsum.photos/seed/shelfv1/900/900","alt":"Static shelf ad","aspectRatio":"1/1","fit":"cover"}},
    "d4-a2-body": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d4-a2-top","d4-a2-stats","d4-a2-t","d4-a2-move"]},
    "d4-a2-top": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["d4-a2-name","d4-a2-badge"]},
    "d4-a2-name": {"type":"Heading","props":{"text":"static_shelf_v1","level":"h2"}},
    "d4-a2-badge": {"type":"Badge","props":{"text":"WASTE","variant":"destructive"}},
    "d4-a2-stats": {"type":"Grid","props":{"columns":3},"children":["d4-a2-s1","d4-a2-s2","d4-a2-s3"]},
    "d4-a2-s1": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d4-a2-s1-h","d4-a2-s1-t"]},
    "d4-a2-s1-h": {"type":"Eyebrow","props":{"text":"Avg CPP","size":"sm","variant":"muted"}},
    "d4-a2-s1-t": {"type":"Text","props":{"text":"₹690","size":"sm"}},
    "d4-a2-s2": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d4-a2-s2-h","d4-a2-s2-t"]},
    "d4-a2-s2-h": {"type":"Eyebrow","props":{"text":"Purchases","size":"sm","variant":"muted"}},
    "d4-a2-s2-t": {"type":"Text","props":{"text":"0","size":"sm"}},
    "d4-a2-s3": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d4-a2-s3-h","d4-a2-s3-t"]},
    "d4-a2-s3-h": {"type":"Eyebrow","props":{"text":"Spent","size":"sm","variant":"muted"}},
    "d4-a2-s3-t": {"type":"Text","props":{"text":"₹2,100","size":"sm"}},
    "d4-a2-t": {"type":"Text","props":{"text":"Third day without a purchase while getting 1.3% of impressions. It had its chance and did not earn 2 more.","size":"sm"}},
    "d4-a2-move": {"type":"Card","props":{"variant":"accent"},"children":["d4-a2-move-s"]},
    "d4-a2-move-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d4-a2-move-h","d4-a2-move-t"]},
    "d4-a2-move-h": {"type":"Eyebrow","props":{"text":"The move","size":"sm"}},
    "d4-a2-move-t": {"type":"Text","props":{"text":"Stop today and move budget to the winner.","size":"sm"}},
    "d5": {"type":"Card","props":{"variant":"light"},"children":["d5-header","d5-div","d5-table"]},
    "d5-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["d5-title","d5-meta"]},
    "d5-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["d5-eyebrow","d5-heading"]},
    "d5-eyebrow": {"type":"Eyebrow","props":{"text":"06","size":"sm","variant":"accent"}},
    "d5-heading": {"type":"Heading","props":{"text":"Market overnight","level":"h1"}},
    "d5-meta": {"type":"Text","props":{"text":"META ADS LIBRARY · 18–19 NOV","size":"xs"}},
    "d5-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "d5-table": {"type":"Table","props":{"variant":"light","headerVariant":"dark","columns":["Market","Move","Why"],"rows":[["Kachi Roots","Started testing freshness","The angle we planned to own"],["Mill & Mortar","Founder video gone","Lowest CPRMs; founder video still running"],["Local brands","Three new freshness ads","New angle from a big spender"]]}},
    "d6": {"type":"Card","props":{"variant":"light"},"children":["d6-header","d6-div","d6-bars"]},
    "d6-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["d6-title","d6-meta"]},
    "d6-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["d6-eyebrow","d6-heading"]},
    "d6-eyebrow": {"type":"Eyebrow","props":{"text":"07","size":"sm","variant":"accent"}},
    "d6-heading": {"type":"Heading","props":{"text":"Week so far","level":"h1"}},
    "d6-meta": {"type":"Text","props":{"text":"MON–YESTERDAY","size":"xs"}},
    "d6-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "d6-bars": {"type":"Stack","props":{"direction":"vertical","gap":"md","align":"stretch","justify":"start"},"children":["d6-b1","d6-b2","d6-b3","d6-b4"]},
    "d6-b1": {"type":"ProgressBar","props":{"label":"Budget pace · ₹13,480 of ₹24,000","value":56,"color":"dark"}},
    "d6-b2": {"type":"ProgressBar","props":{"label":"Purchases · 42 of 72","value":58,"color":"accent"}},
    "d6-b3": {"type":"ProgressBar","props":{"label":"CPP · ₹344 vs ₹350 target","value":98,"color":"grey"}},
    "d6-b4": {"type":"ProgressBar","props":{"label":"New creatives · 2 of 6","value":33,"color":"muted"}},
    "d7": {"type":"Card","props":{"variant":"light"},"children":["d7-header","d7-div","d7-list"]},
    "d7-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["d7-title","d7-meta"]},
    "d7-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["d7-eyebrow","d7-heading"]},
    "d7-eyebrow": {"type":"Eyebrow","props":{"text":"08","size":"sm","variant":"accent"}},
    "d7-heading": {"type":"Heading","props":{"text":"Today's moves","level":"h1"}},
    "d7-meta": {"type":"Text","props":{"text":"APPLY IN 20 MINUTES","size":"xs"}},
    "d7-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "d7-list": {"type":"Stack","props":{"direction":"vertical","gap":"md","align":"stretch","justify":"start"},"children":["d7-m1","d7-sep1","d7-m2","d7-sep2","d7-m3"]},
    "d7-m1": {"type":"Grid","props":{"columns":6,"spans":[{"colSpan":1},{"colSpan":2},{"colSpan":3}]},"children":["d7-m1-n","d7-m1-c","d7-m1-f"]},
    "d7-m1-n": {"type":"Eyebrow","props":{"text":"01","size":"md","variant":"accent"}},
    "d7-m1-c": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d7-m1-h","d7-m1-t"]},
    "d7-m1-h": {"type":"Heading","props":{"text":"Stop the waste","level":"h2"}},
    "d7-m1-t": {"type":"Text","props":{"text":"Move ₹400/day from static_shelf_v1 to UGC_unboxing_v3.","size":"sm"}},
    "d7-m1-f": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d7-m1-f1","d7-m1-f2"]},
    "d7-m1-f1": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"between"},"children":["d7-m1-f1-h","d7-m1-f1-t"]},
    "d7-m1-f1-h": {"type":"Eyebrow","props":{"text":"Format","size":"sm","variant":"muted"}},
    "d7-m1-f1-t": {"type":"Text","props":{"text":"Static","size":"sm"}},
    "d7-m1-f2": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"between"},"children":["d7-m1-f2-h","d7-m1-f2-t"]},
    "d7-m1-f2-h": {"type":"Eyebrow","props":{"text":"Why","size":"sm","variant":"muted"}},
    "d7-m1-f2-t": {"type":"Text","props":{"text":"0 purchases","size":"sm"}},
    "d7-sep1": {"type":"Separator","props":{"orientation":"horizontal"}},
    "d7-m2": {"type":"Grid","props":{"columns":6,"spans":[{"colSpan":1},{"colSpan":2},{"colSpan":3}]},"children":["d7-m2-n","d7-m2-c","d7-m2-f"]},
    "d7-m2-n": {"type":"Eyebrow","props":{"text":"02","size":"md","variant":"accent"}},
    "d7-m2-c": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d7-m2-h","d7-m2-t"]},
    "d7-m2-h": {"type":"Heading","props":{"text":"Multiply the winner","level":"h2"}},
    "d7-m2-t": {"type":"Text","props":{"text":"Brief 2 variants of UGC_unboxing_v3 for the home-cook audience.","size":"sm"}},
    "d7-m2-f": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d7-m2-f1","d7-m2-f2"]},
    "d7-m2-f1": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"between"},"children":["d7-m2-f1-h","d7-m2-f1-t"]},
    "d7-m2-f1-h": {"type":"Eyebrow","props":{"text":"Format","size":"sm","variant":"muted"}},
    "d7-m2-f1-t": {"type":"Text","props":{"text":"Video","size":"sm"}},
    "d7-m2-f2": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"between"},"children":["d7-m2-f2-h","d7-m2-f2-t"]},
    "d7-m2-f2-h": {"type":"Eyebrow","props":{"text":"Audience","size":"sm","variant":"muted"}},
    "d7-m2-f2-t": {"type":"Text","props":{"text":"Home cooks","size":"sm"}},
    "d7-sep2": {"type":"Separator","props":{"orientation":"horizontal"}},
    "d7-m3": {"type":"Grid","props":{"columns":6,"spans":[{"colSpan":1},{"colSpan":2},{"colSpan":3}]},"children":["d7-m3-n","d7-m3-c","d7-m3-f"]},
    "d7-m3-n": {"type":"Eyebrow","props":{"text":"03","size":"md","variant":"accent"}},
    "d7-m3-c": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d7-m3-h","d7-m3-t"]},
    "d7-m3-h": {"type":"Heading","props":{"text":"Claim freshness first","level":"h2"}},
    "d7-m3-t": {"type":"Text","props":{"text":"Move freshness to the first line of every new ad.","size":"sm"}},
    "d7-m3-f": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["d7-m3-f1","d7-m3-f2"]},
    "d7-m3-f1": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"between"},"children":["d7-m3-f1-h","d7-m3-f1-t"]},
    "d7-m3-f1-h": {"type":"Eyebrow","props":{"text":"Format","size":"sm","variant":"muted"}},
    "d7-m3-f1-t": {"type":"Text","props":{"text":"Video + static","size":"sm"}},
    "d7-m3-f2": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"between"},"children":["d7-m3-f2-h","d7-m3-f2-t"]},
    "d7-m3-f2-h": {"type":"Eyebrow","props":{"text":"Why","size":"sm","variant":"muted"}},
    "d7-m3-f2-t": {"type":"Text","props":{"text":"Competitors testing it","size":"sm"}}
  }
}
</ui-block>

### Step 4: Save with `updateDailyReport`

- Render the complete report with `renderUIBlock` first. Only after it passes, save the same `blocks`; on to the daily report, via `updateDailyReport`.
- If validation fails, fix the spec and retry.
- Quote the exact report URL the tool returns. Never build one yourself.
