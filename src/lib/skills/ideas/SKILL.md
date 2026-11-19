---
name: ideas
description: "Daily idea scout for the Ad Creator that reads competitor research, existing creatives, campaign health, alerts, and suggestions, then ranks a fresh backlog of 8-10 evidence-backed ad ideas."
---

## Rules

- **Every idea is an ad.** When the idea comes from a competitor or one of our winning ads, save that ad's media with the card (`mediaUrl`: the ad's own https URL, or an `/api/attachments/…` URL when a tool produced one; plus `aspectRatio` and `sourceUrl`). A card without its ad renders as plain text.
- **Read before thinking:** use `fetchDetailBar` before writing any idea. Read competitor research, existing creatives, campaign health, alerts, and suggestions. Do not invent context the lists can supply.
- **Page the backlog:** read `ideas` with `fetchDetailBar`; if `hasMore` is true, page older entries until the list is exhausted. Never repeat an idea already in the backlog by title, hook, or core angle.
- **8-10 ranked cards:** output a full day's backlog only when the inputs support it. Rank strongest first by expected impact and fit with the current campaign.
- **Evidence on every card:** name where the idea came from. A competitor winner, our winner, an insight from research, an alert, a suggestion, or a variant of a known winner.
- **Remake structure, never assets:** borrow angle, hook, pacing, and proof device. Never copy a competitor's script, visual, logo, or claim.
- **Daily cadence:** runs as a daily backlog refresh. A second run on the same day adds only genuinely new ideas.
- **Not this skill:** finished assets are `creatives`; daily reporting is `reports`; account diagnostics are `alerts`.

## Clarifications

- If the requested format is unspecified, mix video and image cards and let the ranking decide the split.
- If the user asks for a single theme (for example "retargeting ideas"), still read the full context and rank within that theme.
- If brand profile or campaign data is missing, say so in one line and build ideas only from the lists that are available.
- If the request is vague, ask one focused question with a multi-select UI block: video-first, image-first, or balanced.

## Guardrails

- **No fabricated evidence:** never claim a competitor result, CTR, ROAS, or spend number that was not read from a list or a verified source.
- **No duplicate titles or hooks:** near-duplicates count as duplicates. Rewrite the angle or drop the card.
- **No competitor asset copying:** never name a competitor as the creative to reuse; describe the structure to remake.
- **No tool talk:** never mention tool names, cursors, projections, or storage in user-facing text.
- **At most 10 per call:** hold extra ideas for the next daily refresh instead of trimming their evidence.
- **No performance promises:** describe why an idea should work, never a guaranteed uplift.

## Execution Workflow

### Step 1: Load the context

Use `fetchDetailBar` with a small limit, paging only where the decision needs older rows:

1. `competitorResearches` — angles and offers rivals are running.
2. `creatives` — what we already made, so ideas do not repeat assets.
3. `campaigns` — what is running and where the budget goes.
4. `alerts` and `suggestions` — known problems and growth openings.
5. `ideas` — the current backlog, paged to avoid repeats.

### Step 2: Find five kinds of signal

- A competitor angle that keeps running and is absent from our backlog.
- One of our winners whose winning element can become a new variant.
- An alert that points to fatigue, audience saturation, or a landing-page mismatch.
- A suggestion with a clear growth or efficiency opening.
- A research insight about audience, offer, or proof that we have not used.

### Step 3: Turn each signal into a card

Every card carries exactly these fields:

- **Source chip:** `COMPETITOR WINNER`, `OUR WINNER`, `FROM INSIGHTS`, `VARIANT`, `ALERT`, or `SUGGESTION`.
- **Format chip:** video or image.
- **Hook:** the opening line or first three seconds.
- **What we make:** one line naming the asset and the core beat.
- **Who it is for:** the audience or funnel stage.
- **Why it works:** one line tied to the evidence, not a promise.

Use a title of eight words or fewer and a description of 20-40 words.

### Step 4: Rank and save

- Rank by expected impact, fit with live campaigns, and how cheaply the idea can be produced.
- Save the batch with `updateIdeas`. Omit `id` for new cards; pass an existing `id` only when deliberately updating a backlog item.
- The tool writes the Ideas tab. Never write idea JSON in the chat reply.

### Step 5: Reply

Reply with a two-line summary: how many ideas were saved, and the single strongest idea and why it ranks first.

---

## Deliverables

- 8-10 ranked idea cards in the Ideas tab, each with source chip, format chip, hook, what we make, who it is for, and why it works.
- A two-line chat summary. No long Markdown report.
