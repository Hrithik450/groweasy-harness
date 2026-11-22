---
name: campaign-brief
description: "On-demand campaign brief that turns business profile, live campaigns, competitor research, ideas, creatives, and alerts into a compact 12-15 section plan where every choice is evidence-backed or labelled an assumption."
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

- Each of the 15 sections has a source. A section with no source gets a one-line gap, not guessed content.
- Every number in the brief (spend, CPA, ROAS, days, counts) comes from a tool result. Say which source.
- If sources disagree, prefer campaigns (our real results) over research (competitor signals) over profile claims.

### Step 2: Build the campaign brief

Build the brief from scratch in the structure below. Use only `<ui-block>` components, never a long text report, and respect the component word limits.

**Sections, in this order:**

1. **Title & scope:** a title naming the product and angle, plus the brief date.
2. **Objective:** the campaign goal and the optimisation event.
3. **Product:** the product or offer being sold, with its page link.
4. **Audience:** one card per audience (existing winning audience, broad), with the evidence behind each.
5. **Message:** the one headline idea, then three message pillars. For each pillar, say why it is a gap or has proven itself.
6. **Offer:** the exact deal and the reason to act now.
7. **Proof:** only verified proof devices. Note any missing proof as a gap in an Alert.
8. **Creative plan:** a table of the assets: type, format, idea, what it is based on (our winner, competitor winner, or insight), and language.
9. **Copy:** one card per asset in the plan, each with an Accordion of Hook, Primary text, Headline, Description, and CTA. Write the actual copy, not descriptions of it.
10. **CTA:** one action, matching the funnel stage.
11. **Budget:** a chart of the split by campaign or audience, plus daily spend, duration, dates, and the source of the number.
12. **How we judge it:** the primary metric, baseline, floor, and check-in date as Metrics. The baseline comes from the account's own data.
13. **Avoid:** banned words and claims, and angles that failed before, with the evidence.
14. **Competitors:** the rivals that matter here, the angle each one owns, and our answer.
15. **Next step:** one question, "What's next?", as a single-select Chips (`selectable: true`, `multiSelect: false`, no preselection) followed by one SubmitBar. Options are the actions available for a brief, for example: create the ads, edit the brief.

**Never include:** bylines, workflow or status flags, character counters, per-section action buttons, links to competitor ads, or an action list. The only action in the brief is the final next step.

### Reference example

This is a one-shot example of a high-quality campaign brief built as a `<ui-block>`. Borrow its structure, density, and brevity, but adapt the sections and counts to the evidence. Don't copy its content verbatim. All names, numbers, and URLs are illustrative.

<ui-block>
{
  "root": "page",
  "elements": {
    "page": { "type": "Stack", "props": {}, "children": ["title", "scope", "obj_h", "obj_text", "prod_h", "prod_card", "aud_h", "aud_grid", "msg_h", "msg_card", "msg_cols", "offer_h", "offer_card", "proof_h", "proof_cols", "proof_alert", "plan_h", "plan_table", "copy_h", "copy_grid", "cta_h", "cta_text", "bud_h", "bud_pie", "bud_text", "judge_h", "judge_grid", "avoid_h", "avoid_cols", "comp_h", "comp_grid", "next_h", "next_chips", "next_submit"] },

    "title": { "type": "Heading", "props": { "text": "Diwali Gift Box: Fresh-Pressed Oils", "level": "h1" } },
    "scope": { "type": "Text", "props": { "text": "Campaign brief · 21 Nov 2026", "variant": "caption" } },

    "obj_h": { "type": "Heading", "props": { "text": "Objective", "level": "h2" } },
    "obj_text": { "type": "Text", "props": { "text": "Website sales. Optimise for purchases.", "variant": "default" } },

    "prod_h": { "type": "Heading", "props": { "text": "Product", "level": "h2" } },
    "prod_card": { "type": "Card", "props": { "title": "Diwali Gift Box", "badge": "₹999", "description": "Three cold-pressed oils in one gift box." }, "children": ["prod_link"] },
    "prod_link": { "type": "Link", "props": { "label": "Product Page", "href": "https://example.com/diwali-gift-box" } },

    "aud_h": { "type": "Heading", "props": { "text": "Audience", "level": "h2" } },
    "aud_grid": { "type": "Grid", "props": { "columns": 2 }, "children": ["aud_1", "aud_2"] },
    "aud_1": { "type": "Card", "props": { "eyebrow": "Our Ads", "title": "Women 30–50", "description": "Karnataka, Tamil Nadu. Purchases at ₹590 versus ₹610 average." } },
    "aud_2": { "type": "Card", "props": { "eyebrow": "Broad", "title": "Advantage+ India", "description": "Lets Meta find new buyers beyond our winner." } },

    "msg_h": { "type": "Heading", "props": { "text": "Message", "level": "h2" } },
    "msg_card": { "type": "Card", "props": { "variant": "dark", "eyebrow": "Headline Idea", "title": "Fresh-Pressed, Gift-Boxed", "description": "Fresh-pressed oils, gift-boxed for Diwali." } },
    "msg_cols": { "type": "Grid", "props": { "columns": 3 }, "children": ["msg_c1", "msg_c2", "msg_c3"] },
    "msg_c1": { "type": "Card", "props": {}, "children": ["msg_c1_t"] },
    "msg_c1_t": { "type": "Text", "props": { "text": "Press Date · Printed on every bottle · Gap: no competitor ad shows it." } },
    "msg_c2": { "type": "Card", "props": {}, "children": ["msg_c2_t"] },
    "msg_c2_t": { "type": "Text", "props": { "text": "Wood-Pressed · No heat in the process · Wins in 2 of 7 competitor ads." } },
    "msg_c3": { "type": "Card", "props": {}, "children": ["msg_c3_t"] },
    "msg_c3_t": { "type": "Text", "props": { "text": "Our Mill · Made at our Mysuru mill · Proven in our own ads." } },

    "offer_h": { "type": "Heading", "props": { "text": "Offer", "level": "h2" } },
    "offer_card": { "type": "Card", "props": { "title": "₹999 For Three Oils", "badge": "Diwali", "description": "Framed as ₹333 a bottle; ships before Diwali." } },

    "proof_h": { "type": "Heading", "props": { "text": "Proof", "level": "h2" } },
    "proof_cols": { "type": "Grid", "props": { "columns": 1 }, "children": ["proof_c1"] },
    "proof_c1": { "type": "Card", "props": {}, "children": ["proof_c1_t"] },
    "proof_c1_t": { "type": "Text", "props": { "text": "Verified · Press date on every bottle · Mill footage in our unboxing video." } },
    "proof_alert": { "type": "Alert", "props": { "title": "Proof Gap", "message": "No customer reviews yet; add real ones before scaling spend.", "type": "warning" } },

    "plan_h": { "type": "Heading", "props": { "text": "Creative Plan", "level": "h2" } },
    "plan_table": { "type": "Table", "props": { "columns": ["Type", "Format", "Idea", "Based on", "Language"], "rows": [
      ["Video", "9:16 · 15s", "Unboxing gift box", "Our winner", "Kannada, Tamil"],
      ["Video", "9:16 · 15s", "When was it pressed?", "Competitor winner", "Hindi, English"],
      ["Image", "1:1", "₹333 a bottle reveal", "Insights", "English"]
    ] } },

    "copy_h": { "type": "Heading", "props": { "text": "Copy", "level": "h2" } },
    "copy_grid": { "type": "Grid", "props": { "columns": 2, "stretchLast": true }, "children": ["copy_1", "copy_2", "copy_3"] },
    "copy_1": { "type": "Card", "props": { "title": "Ad 1 · Unboxing", "badge": "Video 9:16", "description": "Kannada, Tamil. Variant of our winner." }, "children": ["copy_1_acc"] },
    "copy_1_acc": { "type": "Accordion", "props": { "type": "multiple", "items": [
      { "title": "Hook", "content": "Unboxing three oils pressed this week." },
      { "title": "Primary Text", "content": "Groundnut, sesame and coconut oil, pressed at our Mysuru mill. Press date on every bottle." },
      { "title": "Headline", "content": "Diwali gift box · ₹333 a bottle" },
      { "title": "Description", "content": "3 cold-pressed oils · ₹999" },
      { "title": "CTA", "content": "Shop Now" }
    ] } },
    "copy_2": { "type": "Card", "props": { "title": "Ad 2 · Press Date", "badge": "Video 9:16", "description": "Hindi, English. Based on a competitor winner." }, "children": ["copy_2_acc"] },
    "copy_2_acc": { "type": "Accordion", "props": { "type": "multiple", "items": [
      { "title": "Hook", "content": "Do you know when your oil was pressed?" },
      { "title": "Primary Text", "content": "Most shelf oil hides its press date. Ours prints it on every bottle." },
      { "title": "Headline", "content": "Pressed this week, not this year" },
      { "title": "Description", "content": "Diwali gift box · ₹999" },
      { "title": "CTA", "content": "Shop Now" }
    ] } },
    "copy_3": { "type": "Card", "props": { "title": "Ad 3 · Price Reveal", "badge": "Image 1:1", "description": "English. Based on insights." }, "children": ["copy_3_acc"] },
    "copy_3_acc": { "type": "Accordion", "props": { "type": "multiple", "items": [
      { "title": "Hook", "content": "On image: ₹333 a bottle, pressed fresh." },
      { "title": "Primary Text", "content": "Three cold-pressed oils in one Diwali gift box, pressed at our Mysuru mill." },
      { "title": "Headline", "content": "Three oils. One box." },
      { "title": "Description", "content": "Ships before Diwali" },
      { "title": "CTA", "content": "Shop Now" }
    ] } },

    "cta_h": { "type": "Heading", "props": { "text": "CTA", "level": "h2" } },
    "cta_text": { "type": "Text", "props": { "text": "Shop Now, linking to the gift box page.", "variant": "default" } },

    "bud_h": { "type": "Heading", "props": { "text": "Budget", "level": "h2" } },
    "bud_pie": { "type": "PieChart", "props": { "title": "Daily Budget Split", "donut": true, "height": 220, "data": [{ "name": "Broad", "value": 60 }, { "name": "Women 30–50", "value": 40 }] } },
    "bud_text": { "type": "Text", "props": { "text": "₹4,000/day · 14 days · 22 Nov–5 Dec · from account spend", "variant": "caption" } },

    "judge_h": { "type": "Heading", "props": { "text": "How We Judge It", "level": "h2" } },
    "judge_grid": { "type": "Grid", "props": { "columns": 2, "stretchLast": true }, "children": ["j_cpa", "j_roas", "j_day"] },
    "j_cpa": { "type": "Card", "props": { "variant": "dark" }, "children": ["j_cpa_h"] },
    "j_cpa_h": { "type": "Heading", "props": { "text": "CPA Baseline · ₹610", "level": "h2" } },
    "j_roas": { "type": "Card", "props": {}, "children": ["j_roas_h"] },
    "j_roas_h": { "type": "Heading", "props": { "text": "ROAS Floor · 2.4", "level": "h2" } },
    "j_day": { "type": "Card", "props": {}, "children": ["j_day_h"] },
    "j_day_h": { "type": "Heading", "props": { "text": "Check-In · Day 7 · 28 Nov", "level": "h2" } },

    "avoid_h": { "type": "Heading", "props": { "text": "Avoid", "level": "h2" } },
    "avoid_cols": { "type": "Grid", "props": { "columns": 2 }, "children": ["avoid_c1", "avoid_c2"] },
    "avoid_c1": { "type": "Card", "props": {}, "children": ["avoid_c1_t"] },
    "avoid_c1_t": { "type": "Text", "props": { "text": "Words · Chemical-free · Cures · Best in India." } },
    "avoid_c2": { "type": "Card", "props": {}, "children": ["avoid_c2_t"] },
    "avoid_c2_t": { "type": "Text", "props": { "text": "Failed Angle · Flat-discount statics, CPA ₹890 in September." } },

    "comp_h": { "type": "Heading", "props": { "text": "Competitors", "level": "h2" } },
    "comp_grid": { "type": "Grid", "props": { "columns": 2 }, "children": ["comp_1", "comp_2"] },
    "comp_1": { "type": "Card", "props": { "eyebrow": "Owns Freshness", "title": "Ghani Gold", "description": "UGC freshness video live 34 days. We answer with the press date." } },
    "comp_2": { "type": "Card", "props": { "eyebrow": "Owns Price", "title": "Kolhu Fresh", "description": "Diwali combo at ₹1,099. We answer with ₹333 a bottle." } },

    "next_h": { "type": "Heading", "props": { "text": "What's Next?", "level": "h2" } },
    "next_chips": { "type": "Chips", "props": { "name": "next_step", "label": "Next Step", "items": ["Create the ads", "Edit the brief"], "selectable": true, "multiSelect": false } },
    "next_submit": { "type": "SubmitBar", "props": { "label": "Continue", "statusText": "Pick one option" } }

}
}
</ui-block>

Mark every unsupported decision `assumption` on its own line.

### Step 4: Save

- Render the brief in chat as one UI block with `renderUIBlock` (a Stack of Heading + Text sections), so the reader gets the plan, not a wall of prose.
- Write the same brief as compact markdown with the twelve section headings.
- Keep the gist to two lines: objective and the one decision that matters.
- Save with `updateCampaignBriefs`. The tool stores the current assistant message id and session so the saved brief can jump back to this message.
- A brief saved in this session jumps to the message here. A brief whose source message belongs to another session opens as a document instead.
