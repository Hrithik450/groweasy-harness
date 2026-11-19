---
name: campaign-brief
description: "On-demand campaign brief that turns business profile, live campaigns, competitor research, ideas, creatives, and alerts into a compact 12-section plan where every choice is evidence-backed or labelled an assumption."
---

## Rules

- **Twelve sections, in order:** Objective, Product, Audience, Message, Offer, Proof, Creative plan, CTA, Budget, How we judge it, Avoid, Competitors.
- **Every choice needs a reason:** attach either a data or research reason to each decision, or label the line `assumption`.
- **Ground the numbers:** budget, targets, and baselines come from verified account data. Never invent a benchmark or a target that was not supplied.
- **One brief per request:** a brief is a decision document, not a brainstorm. Keep it tight and buildable.
- **Save a pointer, not the brief:** `updateCampaignBriefs` stores the title plus a two-line gist (under 240 characters). The full brief stays in your chat message, and the saved row jumps back to it.
- **Not this skill:** a daily performance summary is `reports`; raw idea cards are `ideas`; finished assets are `creatives`.

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
- **No tool talk:** never mention tool names, queries, or storage in the brief or reply.
- **No unsaved briefs:** if `updateCampaignBriefs` fails, say so; never present a saved state that did not happen.

## Execution Workflow

### Step 1: Load the inputs

Use `fetchDetailBar` and the profile tool with small limits:

1. Business profile — product, offer, proof, and brand constraints.
2. `campaigns` — what is running, at what spend, and with what results.
3. `competitorResearches` — verified rival angles and offers.
4. `ideas` and `creatives` — what is already queued or made.
5. `alerts` and `suggestions` — problems the campaign must avoid or solve.

### Step 2: Decide the spine

- Write the Objective as one measurable outcome with a timeframe.
- Name the Product and the single job it does for the buyer.
- Define the Audience by problem and buying stage, not by demographics alone.
- State the Message in one sentence the buyer would repeat.

### Step 3: Build the other sections

- **Offer:** the exact deal and the reason to act now, grounded in the profile.
- **Proof:** only verified proof devices; note any missing proof as a gap.
- **Creative plan:** formats, hooks, and the number of assets, tied to the ideas and creative list.
- **CTA:** one action, matching the funnel stage.
- **Budget:** daily or total spend, split by campaign or format, with the source.
- **How we judge it:** the primary metric, baseline, and check-in date.
- **Avoid:** the specific failure modes from alerts, research, or past learning.
- **Competitors:** the rivals that matter here and the angle each one owns.

Mark every unsupported decision `assumption` on its own line.

### Step 4: Save

- Render the brief in chat as one UI block with `renderUIBlock` (a Stack of Heading + Text sections), so the reader gets the plan, not a wall of prose.
- Write the same brief as compact markdown with the twelve section headings.
- Keep the gist to two lines: objective and the one decision that matters.
- Save with `updateCampaignBriefs`. The tool stores the current assistant message id and session so the saved brief can jump back to this message.
- A brief saved in this session jumps to the message here. A brief whose source message belongs to another session opens as a document instead.

### Step 5: Reply

Reply with two lines: the brief title and the one decision that matters most. Do not paste the full brief into chat.

---

## Deliverables

- One saved campaign brief in the Briefs tab with all 12 sections, every choice evidence-backed or labelled `assumption`.
- A two-line chat reply naming the brief and its most important decision.
