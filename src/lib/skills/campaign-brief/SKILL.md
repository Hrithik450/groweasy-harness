---
name: campaign-brief
description: "On-demand 9-section campaign brief that turns business profile, live campaigns, competitor research, ideas, creatives, and alerts into a buildable plan where every choice is evidence-backed or labelled an assumption."
---

## Rules

- **Ground the numbers:** budget, targets, and baselines come from verified account data. Never invent a benchmark or a target that was not supplied.
- **One brief per request:** a brief is a decision document, not a brainstorm. Keep it tight and buildable.
- **Save the brief:** `updateCampaignBriefs` stores the title plus a two-line gist (under 240 characters). The full brief stays in your chat message, and the saved row jumps back to it.

## Clarifications

- If the objective is ambiguous, ask one focused question before writing: leads, purchases, installs, or awareness.
- If the user names a budget, use it. If not, propose a range grounded in current spend and label it `assumption`.
- If a competitor is named, read `competitorResearches` first and cite only verified findings.
- If the request is for a single channel, keep the plan to that channel and say so in the Objective.

## Guardrails

- **No fabricated evidence:** never claim a competitor result, audience size, or platform benchmark that was not read from a tool.
- **No invented proof:** testimonials, ratings, customer counts, and guarantees must come from the business profile; otherwise label the gap.
- **No competitor asset copying:** reference the angle or structure to remake, never the asset to reuse.
- **No contradictory plan:** the message, offer, proof, and CTA must agree with each other and with the audience.
- **No tool talk:** never mention tool names or queries in the brief or reply.
- **No unsaved briefs:** if `updateCampaignBriefs` fails, say so; never present a saved state that did not happen.

## Execution Workflow

### Step 1: Gather the facts

Read these sources before writing anything. Use `fetchDetailBar` for sources 2-5 and the business profile tool for source 1, with small limits. Pull only the fields listed here. Don't dump whole records.

**1. Business profile** (the base for the whole brief)

- Pull: product or offer and its page link, price, countries and languages, proof devices (reviews, certifications, real footage), brand constraints (banned words, claims to avoid, tone).
- Feeds: Product, Offer, Proof, Audience (geography and language), Avoid.
- If proof is missing, record it as a gap. Don't invent it.

**2. `campaigns`** (latest 5, newest first)

- Pull: objective and optimisation event, audiences, daily spend and dates, and results (CPA, ROAS, purchases), and which ads and audiences won or lost.
- Feeds: Objective, Audience (the winning audience and what it achieved), Budget (the real daily spend), How we judge it (baseline CPA and ROAS from the account's own results), Avoid (angles that failed, with their numbers), Creative plan (our winners to make variants of).
- If there are no campaigns or too little data, say there is no baseline yet and set the check-in as "first read". Don't make up a baseline. Treat a thin account's results as relative, not absolute.

**3. `competitorResearches`** (latest 2-3 reports)

- Pull: verified winning ads with their angle, hook, offer and days live, plus the gaps and what competitors never show.
- Feeds: Message (angles with a gap or a competitor win), Creative plan (competitor winners as the source), Competitors (who owns which angle and our answer).
- Use only verified ads. Do not cite links to competitor ads. If there is no research, say the competitor section is based on the profile only.

**3b. Study the competitor ads** (do this right after reading `competitorResearches`)

Saved research text is not enough. Before planning the campaign, look at the winning ads and learn how they are built.

- **Pick the ads:** up to 5 verified winners from the latest research, long-running first, then potential. Prefer ads for the same product, category or objective as this brief. Mix formats if the winners include both video and static.
- **Inspect each one:** view every video and image before using it. Don't build on a pattern from an ad you did not inspect. If an ad can't be opened, leave it out and say so in one line.
- **Note for each ad:**
  - Hook: the first 3 seconds, or the headline.
  - Angle: problem to solution, proof, us vs them, or offer and urgency.
  - Structure: the order of beats (for example hook, demo, proof, offer, CTA).
  - Proof device: what makes it believable (real person, footage, numbers, reviews).
  - Offer framing and CTA.
  - Format, length, language and visual style.
- **Find the patterns:** a pattern is something that appears in **2 or more** inspected ads. Something in only 1 ad is a single signal, so label it that way. Also note what **none** of them show, because that is our gap.
- **Use the patterns in the brief:**
  - Message: the angles that repeat, or the gap no one covers.
  - Creative plan: each competitor-based asset names the pattern it remakes (for example "question hook + real founder, seen in 3 of 5 ads").
  - Copy: write original wording that follows the structure. Never reuse their words, images or footage.
  - Competitors: the angle each rival owns, backed by the ads you inspected.
- **Fallbacks:**
  - No research exists: say competitor patterns are not available, and don't guess them.
  - Fewer than 3 ads inspected: call them signals, not patterns.
- **Don't expose this work:** the brief shows the patterns and counts, never links to the ads or any mention of tools.

**4. `ideas` and `creatives`** (latest 10 each)

- Pull: ideas already queued, assets already made, their format, language and status.
- Feeds: Creative plan and Copy. Build the plan from queued ideas first. Don't plan something that has already been made. Mark anything reused as "made".
- If both are empty, create the plan from sources 1-3.

**5. `alerts` and `suggestions`** (active ones only)

- Pull: problems the campaign must avoid (fatigue, policy, budget, tracking) and open recommendations.
- Feeds: Avoid, Budget, Proof gap. Turn each relevant alert into a specific rule in the brief. Include a suggestion only if the evidence supports it.

**Before writing, check:**

- Each of the 9 sections has a source. A section with no source gets a one-line gap, not guessed content.
- Every number in the brief (spend, CPA, ROAS, days, counts) comes from a tool result. Say which source.
- If sources disagree, prefer campaigns (our real results) over research (competitor signals) over profile claims.

### Step 2: Build the campaign brief

Build from scratch in the structure below. Use only `<ui-block>` components, never a long text report. Respect component word limits and use variants, sizes and levels only.

The reference example is the required output bar, not inspiration. Match its section order, component mapping, variants and density exactly. You may only omit a section the data cannot support, or add a section built from the same patterns. Never replace it with a simpler, shorter or more compact brief.

**Rules**

1. **Page rhythm.** An `h1` title and one-row scope Table come first. Every section after is its own Card stacked vertically; sections never sit side by side except inside a section's own Grid.
2. **One section header pattern.** Accent Eyebrow number + `h1` Heading on the left, uppercase `xs` meta Text on the right, then a Separator. Never skip the Separator.
3. **Color roles.** `dark` for emphasis and proof, `accent` for the single most important item in a section, `light` as the default surface, `muted` for caveats and the Don't-say panel.
4. **Type hierarchy.** `h1` for the title, section titles, the idea and the say-this promise; `h2` for concept names and milestones; `h6` for Don't-say claims; Eyebrow `xl` for big numbers and `sm` for labels; Text `lg` for findings, `sm` for body, `xs` for meta and evidence.
5. **Label-then-value pairs.** Every fact is a muted Eyebrow label over a `sm` Text value. Evidence goes last and small.
6. **Layout grids.** 3 columns for concepts and findings; 4 for stat tiles; 2 for the message, budget and launch panels; use `spans` for asymmetric rows.
7. **Data components.** ProgressBar for budget share (values total 100), Table for audiences, deliverables and tests, Badge for roles and launch statuses.
8. **Copy is original.** Quoted hooks are the only other people's words. No invented numbers, proof or benchmarks.
9. **No fallback.** If validation fails, correct the UI block and render again. Never switch to Markdown, plain text or a Markdown table.

**Sections, in this order:**

- **Title & scope:** `h1` naming the product and angle, then a one-row Table (Product, Objective, Market, Budget, Flight, Based on).
- **01 The brief in one screen:** dark Card with header + Separator, an accent Card holding the idea, then a 3-column Grid of dark cards (Buy this, For whom, Run) each ending in an `xs` evidence line.
- **02 Goal & targets:** light Card with 4 stat cards; each has a muted label, an `xl` Eyebrow value and an `xs` note.
- **03 Who we're talking to:** light Card with a 6-column Table (Audience, Who they are, Targeting, What they need to hear, Budget, Role); Role uses `{ text, badge }` with CORE `accent`, SCOPE `dark`, TEST `muted`.
- **04 The message:** light Card with a 2-column Grid. Left: a light Card with Say-this heading, a 3-column Grid of dark proof cards, and Tone / Languages / Must show. Right: a muted Card listing Don't-say claims, each `h6` + `xs` reason, separated by rules.
- **05 Creative concepts:** light Card with a 3-column Grid of concept cards. Concept 01 is `accent`; the rest are `light`. Each has status, name, hook label + quote, body, Format / Length / CTA, and a `xs` Built-on line.
- **06 Deliverables:** light Card with a Table (Asset, Concept, Ratio, Length, Placements, Count).
- **07 Budget & setup:** light Card with a 2-column Grid: budget ProgressBars on the left, setup facts on the right (Campaign, Objective, Bid, Placements, Landing page, Attribution).
- **08 What we're testing:** light Card with a Table (Test, A, B, Wins if, Read on).
- **09 Launch plan:** light Card with a 2-column Grid: pre-launch checklist with status Badges on the left; Day 0 / 3 / 7 / 14 milestones on the right, each an `md` accent Eyebrow, `h2` name and `sm` detail, separated by rules.

**Never include:** bylines, workflow status, character counters, links to competitor ads, action buttons inside sections, or a Markdown fallback.

### Reference example

Below is the required campaign brief output standard, not inspiration. Your brief must match its section order, component mapping, variants, spacing and density exactly. Only omit a section the data cannot support, or add a section built from the same patterns. Never produce a simpler, shorter or more compact version. Do not copy its content. All names, numbers and URLs are illustrative.
<ui-block>
{
  "root": "root",
  "elements": {
    "root": {"type":"Stack","props":{"direction":"vertical","gap":"md","align":"stretch","justify":"start"},"children":["title","scope","s1","s2","s3","s4","s5","s6","s7","s8","s9"]},
    "title": {"type":"Heading","props":{"text":"Groundnut oil in Bangalore: sell freshness, not purity.","level":"h1"}},
    "scope": {"type":"Table","props":{"variant":"light","headerVariant":"light","columns":["Product","Objective","Market","Budget","Flight","Based on"],"rows":[["Groundnut oil 1 L · ₹349","Website sales","Bangalore","₹1,500 / day","28 days · from 1 Dec","Competitor report · 22 Nov"]]}},
    "s1": {"type":"Card","props":{"variant":"dark"},"children":["s1-header","s1-div","s1-idea","s1-findings"]},
    "s1-header": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["s1-eyebrow","s1-heading"]},
    "s1-eyebrow": {"type":"Eyebrow","props":{"text":"01","size":"sm","variant":"accent"}},
    "s1-heading": {"type":"Heading","props":{"text":"The brief in one screen","level":"h1"}},
    "s1-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s1-idea": {"type":"Card","props":{"variant":"accent"},"children":["s1-idea-stack"]},
    "s1-idea-stack": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s1-idea-eyebrow","s1-idea-heading"]},
    "s1-idea-eyebrow": {"type":"Eyebrow","props":{"text":"The idea","size":"sm"}},
    "s1-idea-heading": {"type":"Heading","props":{"text":"“Pressed Monday. At your door Wednesday.”","level":"h1"}},
    "s1-findings": {"type":"Grid","props":{"columns":3},"children":["s1-f1","s1-f2","s1-f3"]},
    "s1-f1": {"type":"Card","props":{"variant":"dark"},"children":["s1-f1-s"]},
    "s1-f1-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s1-f1-h","s1-f1-t","s1-f1-e"]},
    "s1-f1-h": {"type":"Eyebrow","props":{"text":"Buy this","size":"sm","variant":"accent"}},
    "s1-f1-t": {"type":"Text","props":{"text":"Every rival says “pure”. Nobody shows when the oil was pressed.","size":"sm","variant":"light"}},
    "s1-f1-e": {"type":"Text","props":{"text":"GAP 01 · 0 OF 148 RIVAL ADS","size":"xs","variant":"light"}},
    "s1-f2": {"type":"Card","props":{"variant":"dark"},"children":["s1-f2-s"]},
    "s1-f2-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s1-f2-h","s1-f2-t","s1-f2-e"]},
    "s1-f2-h": {"type":"Eyebrow","props":{"text":"For whom","size":"sm","variant":"accent"}},
    "s1-f2-t": {"type":"Text","props":{"text":"Home cooks in Bangalore who already buy cold-pressed oil.","size":"sm","variant":"light"}},
    "s1-f2-e": {"type":"Text","props":{"text":"60% OF BUDGET","size":"xs","variant":"light"}},
    "s1-f3": {"type":"Card","props":{"variant":"dark"},"children":["s1-f3-s"]},
    "s1-f3-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s1-f3-h","s1-f3-t","s1-f3-e"]},
    "s1-f3-h": {"type":"Eyebrow","props":{"text":"Run","size":"sm","variant":"accent"}},
    "s1-f3-t": {"type":"Text","props":{"text":"UGC video that shows the press date, backed by a dated price static.","size":"sm","variant":"light"}},
    "s1-f3-e": {"type":"Text","props":{"text":"3 CONCEPTS · 9 ASSETS","size":"xs","variant":"light"}},
    "s2": {"type":"Card","props":{"variant":"light"},"children":["s2-header","s2-div","s2-stats"]},
    "s2-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["s2-title","s2-meta"]},
    "s2-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["s2-eyebrow","s2-heading"]},
    "s2-eyebrow": {"type":"Eyebrow","props":{"text":"02","size":"sm","variant":"accent"}},
    "s2-heading": {"type":"Heading","props":{"text":"Goal & targets","level":"h1"}},
    "s2-meta": {"type":"Text","props":{"text":"WHAT SUCCESS LOOKS LIKE AT DAY 28","size":"xs"}},
    "s2-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s2-stats": {"type":"Grid","props":{"columns":4},"children":["s2-1","s2-2","s2-3","s2-4"]},
    "s2-1": {"type":"Card","props":{"variant":"light"},"children":["s2-1-s"]},
    "s2-1-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s2-1-l","s2-1-v","s2-1-n"]},
    "s2-1-l": {"type":"Eyebrow","props":{"text":"Target CPA","size":"sm","variant":"muted"}},
    "s2-1-v": {"type":"Eyebrow","props":{"text":"₹380","size":"xl","variant":"foreground"}},
    "s2-1-n": {"type":"Text","props":{"text":"Account now ₹410 · best ad ₹298","size":"xs"}},
    "s2-2": {"type":"Card","props":{"variant":"light"},"children":["s2-2-s"]},
    "s2-2-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s2-2-l","s2-2-v","s2-2-n"]},
    "s2-2-l": {"type":"Eyebrow","props":{"text":"Target ROAS","size":"sm","variant":"muted"}},
    "s2-2-v": {"type":"Eyebrow","props":{"text":"2.8","size":"xl","variant":"foreground"}},
    "s2-2-n": {"type":"Text","props":{"text":"Account now 2.6","size":"xs"}},
    "s2-3": {"type":"Card","props":{"variant":"light"},"children":["s2-3-s"]},
    "s2-3-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s2-3-l","s2-3-v","s2-3-n"]},
    "s2-3-l": {"type":"Eyebrow","props":{"text":"Purchases","size":"sm","variant":"muted"}},
    "s2-3-v": {"type":"Eyebrow","props":{"text":"110","size":"xl","variant":"foreground"}},
    "s2-3-n": {"type":"Text","props":{"text":"In 28 days at target CPA","size":"xs"}},
    "s2-4": {"type":"Card","props":{"variant":"light"},"children":["s2-4-s"]},
    "s2-4-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s2-4-l","s2-4-v","s2-4-n"]},
    "s2-4-l": {"type":"Eyebrow","props":{"text":"Total spend","size":"sm","variant":"muted"}},
    "s2-4-v": {"type":"Eyebrow","props":{"text":"₹42K","size":"xl","variant":"foreground"}},
    "s2-4-n": {"type":"Text","props":{"text":"₹1,500 a day for 28 days","size":"xs"}},
    "s3": {"type":"Card","props":{"variant":"light"},"children":["s3-header","s3-div","s3-table"]},
    "s3-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["s3-title","s3-meta"]},
    "s3-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["s3-eyebrow","s3-heading"]},
    "s3-eyebrow": {"type":"Eyebrow","props":{"text":"03","size":"sm","variant":"accent"}},
    "s3-heading": {"type":"Heading","props":{"text":"Who we're talking to","level":"h1"}},
    "s3-meta": {"type":"Text","props":{"text":"BANGALORE · 15 KM AROUND DELIVERY ZONES","size":"xs"}},
    "s3-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s3-table": {"type":"Table","props":{"variant":"light","headerVariant":"dark","columns":["Audience","Who they are","Targeting","What they need to hear","Budget","Role"],"rows":[["Home cooks","28–50, cook daily, buy premium staples","Cooking, healthy eating, organic food","It’s fresher than what’s in my kitchen","₹750",{"text":"CORE","badge":"accent"}],["Broad","Let Meta find buyers","Advantage+ audience, no interests","The press date and the price","₹650",{"text":"SCOPE","badge":"dark"}],["New parents","26–38, first child under 3","Baby food, parenting, clean ingredients","Clean, fresh oil for the family","₹300",{"text":"TEST","badge":"muted"}]]}},
    "s4": {"type":"Card","props":{"variant":"light"},"children":["s4-header","s4-div","s4-body"]},
    "s4-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["s4-title","s4-meta"]},
    "s4-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["s4-eyebrow","s4-heading"]},
    "s4-eyebrow": {"type":"Eyebrow","props":{"text":"04","size":"sm","variant":"accent"}},
    "s4-heading": {"type":"Heading","props":{"text":"The message","level":"h1"}},
    "s4-meta": {"type":"Text","props":{"text":"ONE PROMISE · THREE PROOFS","size":"xs"}},
    "s4-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s4-body": {"type":"Grid","props":{"columns":2},"children":["s4-say","s4-dont"]},
    "s4-say": {"type":"Card","props":{"variant":"light"},"children":["s4-say-stack"]},
    "s4-say-stack": {"type":"Stack","props":{"direction":"vertical","gap":"md","align":"stretch","justify":"start"},"children":["s4-say-eyebrow","s4-say-heading","s4-proofs","s4-say-div","s4-say-meta"]},
    "s4-say-eyebrow": {"type":"Eyebrow","props":{"text":"Say this","size":"sm","variant":"muted"}},
    "s4-say-heading": {"type":"Heading","props":{"text":"The freshest groundnut oil in Bangalore, and we can prove it.","level":"h1"}},
    "s4-proofs": {"type":"Grid","props":{"columns":3},"children":["s4-p1","s4-p2","s4-p3"]},
    "s4-p1": {"type":"Card","props":{"variant":"dark"},"children":["s4-p1-s"]},
    "s4-p1-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s4-p1-h","s4-p1-t"]},
    "s4-p1-h": {"type":"Eyebrow","props":{"text":"Proof 01","size":"sm","variant":"accent"}},
    "s4-p1-t": {"type":"Text","props":{"text":"Press date printed on every bottle.","size":"sm","variant":"light"}},
    "s4-p2": {"type":"Card","props":{"variant":"dark"},"children":["s4-p2-s"]},
    "s4-p2-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s4-p2-h","s4-p2-t"]},
    "s4-p2-h": {"type":"Eyebrow","props":{"text":"Proof 02","size":"sm","variant":"accent"}},
    "s4-p2-t": {"type":"Text","props":{"text":"Mill to door in 48 hours.","size":"sm","variant":"light"}},
    "s4-p3": {"type":"Card","props":{"variant":"dark"},"children":["s4-p3-s"]},
    "s4-p3-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s4-p3-h","s4-p3-t"]},
    "s4-p3-h": {"type":"Eyebrow","props":{"text":"Proof 03","size":"sm","variant":"accent"}},
    "s4-p3-t": {"type":"Text","props":{"text":"Pressed in Mysuru, 140 km away.","size":"sm","variant":"light"}},
    "s4-say-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s4-say-meta": {"type":"Grid","props":{"columns":3},"children":["s4-tone","s4-language","s4-must"]},
    "s4-tone": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s4-tone-h","s4-tone-t"]},
    "s4-tone-h": {"type":"Eyebrow","props":{"text":"Tone","size":"sm","variant":"muted"}},
    "s4-tone-t": {"type":"Text","props":{"text":"Warm, local, matter-of-fact","size":"sm"}},
    "s4-language": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s4-language-h","s4-language-t"]},
    "s4-language-h": {"type":"Eyebrow","props":{"text":"Languages","size":"sm","variant":"muted"}},
    "s4-language-t": {"type":"Text","props":{"text":"English + Kannada","size":"sm"}},
    "s4-must": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s4-must-h","s4-must-t"]},
    "s4-must-h": {"type":"Eyebrow","props":{"text":"Must show","size":"sm","variant":"muted"}},
    "s4-must-t": {"type":"Text","props":{"text":"Press date · ₹349 · free delivery","size":"sm"}},
    "s4-dont": {"type":"Card","props":{"variant":"muted"},"children":["s4-dont-stack"]},
    "s4-dont-stack": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s4-dont-eyebrow","s4-dont-1","s4-dont-d1","s4-dont-d2","s4-dont-2","s4-dont-d3","s4-dont-d4","s4-dont-3","s4-dont-d5","s4-dont-d6","s4-dont-4","s4-dont-d7","s4-dont-d8","s4-dont-foot"]},
    "s4-dont-eyebrow": {"type":"Eyebrow","props":{"text":"Don't say","size":"sm","variant":"muted"}},
    "s4-dont-1": {"type":"Heading","props":{"text":"“Purest” or “100% pure”","level":"h6"}},
    "s4-dont-d1": {"type":"Text","props":{"text":"9 of 12 rivals already own it.","size":"xs"}},
    "s4-dont-d2": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s4-dont-2": {"type":"Heading","props":{"text":"Health or cure claims","level":"h6"}},
    "s4-dont-d3": {"type":"Text","props":{"text":"Meta review risk; no proof on hand.","size":"xs"}},
    "s4-dont-d4": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s4-dont-3": {"type":"Heading","props":{"text":"Rival brand names","level":"h6"}},
    "s4-dont-d5": {"type":"Text","props":{"text":"Compare on proof, never by name.","size":"xs"}},
    "s4-dont-d6": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s4-dont-4": {"type":"Heading","props":{"text":"Discounts above 15%","level":"h6"}},
    "s4-dont-d7": {"type":"Text","props":{"text":"Freshness is the reason to pay ₹349.","size":"xs"}},
    "s4-dont-d8": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s4-dont-foot": {"type":"Text","props":{"text":"Freshness is the reason to pay ₹349.","size":"xs"}},
    "s5": {"type":"Card","props":{"variant":"light"},"children":["s5-header","s5-div","s5-grid"]},
    "s5-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["s5-title","s5-meta"]},
    "s5-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["s5-eyebrow","s5-heading"]},
    "s5-eyebrow": {"type":"Eyebrow","props":{"text":"05","size":"sm","variant":"accent"}},
    "s5-heading": {"type":"Heading","props":{"text":"Creative concepts","level":"h1"}},
    "s5-meta": {"type":"Text","props":{"text":"FOR AD CREATOR · EACH BUILT ON A RESEARCH GAP","size":"xs"}},
    "s5-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s5-grid": {"type":"Grid","props":{"columns":3},"children":["s5-c1","s5-c2","s5-c3"]},
    "s5-c1": {"type":"Card","props":{"variant":"accent"},"children":["s5-c1-s"]},
    "s5-c1-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c1-top","s5-c1-name","s5-c1-hook","s5-c1-body","s5-c1-meta","s5-c1-div","s5-c1-foot"]},
    "s5-c1-top": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["s5-c1-kicker","s5-c1-status"]},
    "s5-c1-kicker": {"type":"Eyebrow","props":{"text":"Concept 01","size":"sm"}},
    "s5-c1-status": {"type":"Text","props":{"text":"LIGHT","size":"xs"}},
    "s5-c1-name": {"type":"Heading","props":{"text":"Pressed Monday","level":"h2"}},
    "s5-c1-hook": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c1-hook-h","s5-c1-hook-t"]},
    "s5-c1-hook-h": {"type":"Eyebrow","props":{"text":"Hook · first 3 seconds","size":"sm","variant":"muted"}},
    "s5-c1-hook-t": {"type":"Text","props":{"text":"“Look at the date on my oil bottle.”","size":"sm"}},
    "s5-c1-body": {"type":"Text","props":{"text":"A home cook turns the bottle to camera, shows the press date, then cooks with it. Ends on the 48-hour delivery promise.","size":"sm"}},
    "s5-c1-meta": {"type":"Grid","props":{"columns":3},"children":["s5-c1-format","s5-c1-length","s5-c1-cta"]},
    "s5-c1-format": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c1-format-h","s5-c1-format-t"]},
    "s5-c1-format-h": {"type":"Eyebrow","props":{"text":"Format","size":"sm","variant":"muted"}},
    "s5-c1-format-t": {"type":"Text","props":{"text":"UGC video","size":"sm"}},
    "s5-c1-length": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c1-length-h","s5-c1-length-t"]},
    "s5-c1-length-h": {"type":"Eyebrow","props":{"text":"Length","size":"sm","variant":"muted"}},
    "s5-c1-length-t": {"type":"Text","props":{"text":"20–30 s","size":"sm"}},
    "s5-c1-cta": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c1-cta-h","s5-c1-cta-t"]},
    "s5-c1-cta-h": {"type":"Eyebrow","props":{"text":"CTA","size":"sm","variant":"muted"}},
    "s5-c1-cta-t": {"type":"Text","props":{"text":"Shop now","size":"sm"}},
    "s5-c1-div": {"type":"Separator","props":{"orientation":"horizontal","variant":"dark"}},
    "s5-c1-foot": {"type":"Text","props":{"text":"BUILT ON · GAP 01 · FRESHNESS","size":"xs"}},
    "s5-c2": {"type":"Card","props":{"variant":"light"},"children":["s5-c2-s"]},
    "s5-c2-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c2-top","s5-c2-name","s5-c2-hook","s5-c2-body","s5-c2-meta","s5-c2-div","s5-c2-foot"]},
    "s5-c2-top": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["s5-c2-kicker","s5-c2-status"]},
    "s5-c2-kicker": {"type":"Eyebrow","props":{"text":"Concept 02","size":"sm","variant":"muted"}},
    "s5-c2-status": {"type":"Text","props":{"text":"SUPPORT","size":"xs"}},
    "s5-c2-name": {"type":"Heading","props":{"text":"Dated price card","level":"h2"}},
    "s5-c2-hook": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c2-hook-h","s5-c2-hook-t"]},
    "s5-c2-hook-h": {"type":"Eyebrow","props":{"text":"Hook · first 3 seconds","size":"sm","variant":"muted"}},
    "s5-c2-hook-t": {"type":"Text","props":{"text":"“Pressed 19 Nov. ₹349.”","size":"sm"}},
    "s5-c2-body": {"type":"Text","props":{"text":"A clean static: bottle, the press date as the headline, price and free Bangalore delivery underneath.","size":"sm"}},
    "s5-c2-meta": {"type":"Grid","props":{"columns":3},"children":["s5-c2-format","s5-c2-length","s5-c2-cta"]},
    "s5-c2-format": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c2-format-h","s5-c2-format-t"]},
    "s5-c2-format-h": {"type":"Eyebrow","props":{"text":"Format","size":"sm","variant":"muted"}},
    "s5-c2-format-t": {"type":"Text","props":{"text":"Static image","size":"sm"}},
    "s5-c2-length": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c2-length-h","s5-c2-length-t"]},
    "s5-c2-length-h": {"type":"Eyebrow","props":{"text":"Length","size":"sm","variant":"muted"}},
    "s5-c2-length-t": {"type":"Text","props":{"text":"1 frame","size":"sm"}},
    "s5-c2-cta": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c2-cta-h","s5-c2-cta-t"]},
    "s5-c2-cta-h": {"type":"Eyebrow","props":{"text":"CTA","size":"sm","variant":"muted"}},
    "s5-c2-cta-t": {"type":"Text","props":{"text":"Shop now","size":"sm"}},
    "s5-c2-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s5-c2-foot": {"type":"Text","props":{"text":"BUILT ON · GAP 02 · PROOF IN VALUE","size":"xs"}},
    "s5-c3": {"type":"Card","props":{"variant":"light"},"children":["s5-c3-s"]},
    "s5-c3-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c3-top","s5-c3-name","s5-c3-hook","s5-c3-body","s5-c3-meta","s5-c3-div","s5-c3-foot"]},
    "s5-c3-top": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["s5-c3-kicker","s5-c3-status"]},
    "s5-c3-kicker": {"type":"Eyebrow","props":{"text":"Concept 03","size":"sm","variant":"muted"}},
    "s5-c3-status": {"type":"Text","props":{"text":"TEST","size":"xs"}},
    "s5-c3-name": {"type":"Heading","props":{"text":"Kadai in 30 s","level":"h2"}},
    "s5-c3-hook": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c3-hook-h","s5-c3-hook-t"]},
    "s5-c3-hook-h": {"type":"Eyebrow","props":{"text":"Hook · first 3 seconds","size":"sm","variant":"muted"}},
    "s5-c3-hook-t": {"type":"Text","props":{"text":"“This is what fresh oil does to a dosa.”","size":"sm"}},
    "s5-c3-body": {"type":"Text","props":{"text":"A quick recipe reel. The food does the selling; the press date appears once at the end.","size":"sm"}},
    "s5-c3-meta": {"type":"Grid","props":{"columns":3},"children":["s5-c3-format","s5-c3-length","s5-c3-cta"]},
    "s5-c3-format": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c3-format-h","s5-c3-format-t"]},
    "s5-c3-format-h": {"type":"Eyebrow","props":{"text":"Format","size":"sm","variant":"muted"}},
    "s5-c3-format-t": {"type":"Text","props":{"text":"Reel","size":"sm"}},
    "s5-c3-length": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c3-length-h","s5-c3-length-t"]},
    "s5-c3-length-h": {"type":"Eyebrow","props":{"text":"Length","size":"sm","variant":"muted"}},
    "s5-c3-length-t": {"type":"Text","props":{"text":"15–30 s","size":"sm"}},
    "s5-c3-cta": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s5-c3-cta-h","s5-c3-cta-t"]},
    "s5-c3-cta-h": {"type":"Eyebrow","props":{"text":"CTA","size":"sm","variant":"muted"}},
    "s5-c3-cta-t": {"type":"Text","props":{"text":"Order now","size":"sm"}},
    "s5-c3-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s5-c3-foot": {"type":"Text","props":{"text":"BUILT ON · GAP 03 · COOKING","size":"xs"}},
    "s6": {"type":"Card","props":{"variant":"light"},"children":["s6-header","s6-div","s6-table"]},
    "s6-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["s6-title","s6-meta"]},
    "s6-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["s6-eyebrow","s6-heading"]},
    "s6-eyebrow": {"type":"Eyebrow","props":{"text":"06","size":"sm","variant":"accent"}},
    "s6-heading": {"type":"Heading","props":{"text":"Deliverables","level":"h1"}},
    "s6-meta": {"type":"Text","props":{"text":"9 ASSETS · FACEBOOK + INSTAGRAM","size":"xs"}},
    "s6-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s6-table": {"type":"Table","props":{"variant":"light","headerVariant":"dark","columns":["Asset","Concept","Ratio","Length","Placements","Count"],"rows":[["UGC video","01 Pressed Monday","9:16","20–30 s","Reels, Stories","2"],["UGC video cut-down","01 Pressed Monday","4:5","15 s","Feed","1"],["Static","02 Dated price card","1:1","—","Feed","2"],["Static","02 Dated price card","9:16","—","Stories","2"],["Recipe reel","03 Kadai in 30 s","9:16","15–30 s","Reels","2"]]}},
    "s7": {"type":"Card","props":{"variant":"light"},"children":["s7-header","s7-div","s7-body"]},
    "s7-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["s7-title","s7-meta"]},
    "s7-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["s7-eyebrow","s7-heading"]},
    "s7-eyebrow": {"type":"Eyebrow","props":{"text":"07","size":"sm","variant":"accent"}},
    "s7-heading": {"type":"Heading","props":{"text":"Budget & setup","level":"h1"}},
    "s7-meta": {"type":"Text","props":{"text":"₹1,500 / DAY · ₹42,000 OVER 28 DAYS","size":"xs"}},
    "s7-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s7-body": {"type":"Grid","props":{"columns":2},"children":["s7-budget","s7-setup"]},
    "s7-budget": {"type":"Card","props":{"variant":"light"},"children":["s7-budget-s"]},
    "s7-budget-s": {"type":"Stack","props":{"direction":"vertical","gap":"md","align":"stretch","justify":"start"},"children":["s7-budget-h","s7-b1","s7-b2","s7-b3"]},
    "s7-budget-h": {"type":"Eyebrow","props":{"text":"Daily budget split","size":"sm","variant":"muted"}},
    "s7-b1": {"type":"ProgressBar","props":{"label":"Home cooks · core · ₹750","value":44,"color":"accent"}},
    "s7-b2": {"type":"ProgressBar","props":{"label":"Broad · Advantage+ · ₹650","value":38,"color":"dark"}},
    "s7-b3": {"type":"ProgressBar","props":{"label":"New parents · test · ₹300","value":18,"color":"grey"}},
    "s7-setup": {"type":"Card","props":{"variant":"light"},"children":["s7-setup-s"]},
    "s7-setup-s": {"type":"Stack","props":{"direction":"vertical","gap":"md","align":"stretch","justify":"start"},"children":["s7-setup-grid"]},
    "s7-setup-grid": {"type":"Grid","props":{"columns":2},"children":["s7-col1","s7-col2"]},
    "s7-col1": {"type":"Stack","props":{"direction":"vertical","gap":"md","align":"stretch","justify":"start"},"children":["s7-campaign","s7-bid","s7-landing"]},
    "s7-campaign": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s7-campaign-h","s7-campaign-t"]},
    "s7-campaign-h": {"type":"Eyebrow","props":{"text":"Campaign","size":"sm","variant":"muted"}},
    "s7-campaign-t": {"type":"Text","props":{"text":"Sales · Advantage+ off","size":"sm"}},
    "s7-bid": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s7-bid-h","s7-bid-t"]},
    "s7-bid-h": {"type":"Eyebrow","props":{"text":"Bid","size":"sm","variant":"muted"}},
    "s7-bid-t": {"type":"Text","props":{"text":"Highest volume","size":"sm"}},
    "s7-landing": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s7-landing-h","s7-landing-t"]},
    "s7-landing-h": {"type":"Eyebrow","props":{"text":"Landing page","size":"sm","variant":"muted"}},
    "s7-landing-t": {"type":"Text","props":{"text":"Groundnut oil 1 L product page","size":"sm"}},
    "s7-col2": {"type":"Stack","props":{"direction":"vertical","gap":"md","align":"stretch","justify":"start"},"children":["s7-objective","s7-placements","s7-attribution"]},
    "s7-objective": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s7-objective-h","s7-objective-t"]},
    "s7-objective-h": {"type":"Eyebrow","props":{"text":"Objective","size":"sm","variant":"muted"}},
    "s7-objective-t": {"type":"Text","props":{"text":"Purchase","size":"sm"}},
    "s7-placements": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s7-placements-h","s7-placements-t"]},
    "s7-placements-h": {"type":"Eyebrow","props":{"text":"Placements","size":"sm","variant":"muted"}},
    "s7-placements-t": {"type":"Text","props":{"text":"Advantage+ placements","size":"sm"}},
    "s7-attribution": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s7-attribution-h","s7-attribution-t"]},
    "s7-attribution-h": {"type":"Eyebrow","props":{"text":"Attribution","size":"sm","variant":"muted"}},
    "s7-attribution-t": {"type":"Text","props":{"text":"7-day click, 1-day view","size":"sm"}},
    "s8": {"type":"Card","props":{"variant":"light"},"children":["s8-header","s8-div","s8-table"]},
    "s8-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["s8-title","s8-meta"]},
    "s8-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["s8-eyebrow","s8-heading"]},
    "s8-eyebrow": {"type":"Eyebrow","props":{"text":"08","size":"sm","variant":"accent"}},
    "s8-heading": {"type":"Heading","props":{"text":"What we're testing","level":"h1"}},
    "s8-meta": {"type":"Text","props":{"text":"ONE VARIABLE PER TEST","size":"xs"}},
    "s8-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s8-table": {"type":"Table","props":{"variant":"light","headerVariant":"dark","columns":["Test","A","B","Wins if","Read on"],"rows":[["Hook","Press date first","Price first","Lower CPA at equal spend","Day 7"],["Format","UGC video","Dated static","Lower CPA, 20%+ purchases each","Day 10"],["Audience","Home cooks","New parents","CPA under ₹380","Day 14"]]}},
    "s9": {"type":"Card","props":{"variant":"light"},"children":["s9-header","s9-div","s9-body"]},
    "s9-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["s9-title","s9-meta"]},
    "s9-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["s9-eyebrow","s9-heading"]},
    "s9-eyebrow": {"type":"Eyebrow","props":{"text":"09","size":"sm","variant":"accent"}},
    "s9-heading": {"type":"Heading","props":{"text":"Launch plan","level":"h1"}},
    "s9-meta": {"type":"Text","props":{"text":"CHECK FIRST, THEN 4 MILESTONES","size":"xs"}},
    "s9-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s9-body": {"type":"Grid","props":{"columns":2},"children":["s9-pre","s9-timeline"]},
    "s9-pre": {"type":"Card","props":{"variant":"light"},"children":["s9-pre-s"]},
    "s9-pre-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s9-pre-h","s9-pre-1","s9-pre-d1","s9-pre-2","s9-pre-d2","s9-pre-3","s9-pre-d3","s9-pre-4"]},
    "s9-pre-h": {"type":"Eyebrow","props":{"text":"Before launch","size":"sm","variant":"muted"}},
    "s9-pre-1": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["s9-pre-1-t","s9-pre-1-b"]},
    "s9-pre-1-t": {"type":"Text","props":{"text":"Meta Pixel · purchases","size":"sm"}},
    "s9-pre-1-b": {"type":"Badge","props":{"text":"READY","variant":"dark"}},
    "s9-pre-d1": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s9-pre-2": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["s9-pre-2-t","s9-pre-2-b"]},
    "s9-pre-2-t": {"type":"Text","props":{"text":"Conversions API","size":"sm"}},
    "s9-pre-2-b": {"type":"Badge","props":{"text":"ACTION","variant":"accent"}},
    "s9-pre-d2": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s9-pre-3": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["s9-pre-3-t","s9-pre-3-b"]},
    "s9-pre-3-t": {"type":"Text","props":{"text":"Press date on product page","size":"sm"}},
    "s9-pre-3-b": {"type":"Badge","props":{"text":"TEST","variant":"muted"}},
    "s9-pre-d3": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s9-pre-4": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["s9-pre-4-t","s9-pre-4-b"]},
    "s9-pre-4-t": {"type":"Text","props":{"text":"Bangalore delivery zones","size":"sm"}},
    "s9-pre-4-b": {"type":"Badge","props":{"text":"READY","variant":"dark"}},
    "s9-timeline": {"type":"Card","props":{"variant":"light"},"children":["s9-timeline-s"]},
    "s9-timeline-s": {"type":"Stack","props":{"direction":"vertical","gap":"md","align":"stretch","justify":"start"},"children":["s9-m1","s9-s1","s9-m2","s9-s2","s9-m3","s9-s3","s9-m4"]},
    "s9-m1": {"type":"Grid","props":{"columns":4,"spans":[{"colSpan":1},{"colSpan":3}]},"children":["s9-m1-day","s9-m1-c"]},
    "s9-m1-day": {"type":"Eyebrow","props":{"text":"Day 0","size":"md","variant":"accent"}},
    "s9-m1-c": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s9-m1-h","s9-m1-t"]},
    "s9-m1-h": {"type":"Heading","props":{"text":"Launch","level":"h2"}},
    "s9-m1-t": {"type":"Text","props":{"text":"All 3 concepts live, budget split as above.","size":"sm"}},
    "s9-s1": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s9-m2": {"type":"Grid","props":{"columns":4,"spans":[{"colSpan":1},{"colSpan":3}]},"children":["s9-m2-day","s9-m2-c"]},
    "s9-m2-day": {"type":"Eyebrow","props":{"text":"Day 3","size":"md","variant":"accent"}},
    "s9-m2-c": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s9-m2-h","s9-m2-t"]},
    "s9-m2-h": {"type":"Heading","props":{"text":"First read","level":"h2"}},
    "s9-m2-t": {"type":"Text","props":{"text":"Pause anything over ₹750 CPA with spend above ₹1,500.","size":"sm"}},
    "s9-s2": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s9-m3": {"type":"Grid","props":{"columns":4,"spans":[{"colSpan":1},{"colSpan":3}]},"children":["s9-m3-day","s9-m3-c"]},
    "s9-m3-day": {"type":"Eyebrow","props":{"text":"Day 7","size":"md","variant":"accent"}},
    "s9-m3-c": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s9-m3-h","s9-m3-t"]},
    "s9-m3-h": {"type":"Heading","props":{"text":"Pick the hook","level":"h2"}},
    "s9-m3-t": {"type":"Text","props":{"text":"Move budget to the winning hook; brief 2 new variants.","size":"sm"}},
    "s9-s3": {"type":"Separator","props":{"orientation":"horizontal"}},
    "s9-m4": {"type":"Grid","props":{"columns":4,"spans":[{"colSpan":1},{"colSpan":3}]},"children":["s9-m4-day","s9-m4-c"]},
    "s9-m4-day": {"type":"Eyebrow","props":{"text":"Day 14","size":"md","variant":"accent"}},
    "s9-m4-c": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["s9-m4-h","s9-m4-t"]},
    "s9-m4-h": {"type":"Heading","props":{"text":"Scale","level":"h2"}},
    "s9-m4-t": {"type":"Text","props":{"text":"Raise winner 20% every 2 days while CPA holds under ₹380.","size":"sm"}}
  }
}
</ui-block>

### Step 4: Save

- Render the brief in session as one UI block with `renderUIBlock`, using the 9-section reference structure.
- Never write a Markdown version, and never fall back to Markdown if block validation fails; correct the block.
- Keep the gist to two lines: objective and the one decision that matters.
- Save with `updateCampaignBriefs`. The tool stores the current assistant message id and session so the saved brief can jump back to this message.
- A brief saved in this session jumps to the message here. A brief whose source message belongs to another session opens as a document instead.
- After saving, if the block does not already end in an interactive question, render a small single-select Chips + SubmitBar: "What's next?" with up to 4 relevant options (create the campaign, generate the ads, edit the brief, schedule a review). If it already asks, keep it and make its options equally relevant.
- Keep this as a short follow-up block; never force a question into the brief's reference layout.
