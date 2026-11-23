---
name: ideas
description: "Daily idea scout for the Ad Creation: reads the profile, competitor research, classified winners, creatives and briefs, self-searches Ad Library when thin, and always saves 1-2+ ranked ideas."
---

## Rules

- **Never end with zero ideas.** Every run saves at least 1-2 new ideas, up to 10. When the evidence is thin they are starting ideas built from the Business Profile and live campaigns; that is a complete run, not an empty one.
- **Every new card has its reference ad.** A new card (no `id`) must carry `mediaUrl` and its `aspectRatio`; without a reference ad the idea cannot be formed or saved. An update may omit them and keeps the stored reference.
- **Inspect before ideating.** View the winning ads (videos and images) before turning them into ideas. Never build an idea on a pattern from an ad you did not view.
- **Patterns over one-offs.** A pattern appears in 2 or more inspected ads. A single ad is a signal, and the card says so.
- **Evidence on every card.** Name where the idea came from.
- **Remake structure, never assets.** Borrow the angle, hook, pacing, and proof device. Never copy a competitor's script, visuals, logo, or claims.
- **Daily cadence.** A second run on the same day adds only genuinely new ideas.

## Clarifications

- Missing profile, research, or campaign data: keep going with what exists. Starting ideas still ship.
- Research has no ads or winners: run your own Meta Ad Library search (Step 3) before falling back to starting ideas.
- Format unspecified: mix video and image and let the ranking decide the split. If the user asks for static or video, use only that format.
- Single theme requested (for example "retargeting"): still read all the context, then rank within that theme.

## Guardrails

- No fabricated evidence. Never state a competitor result, CTR, ROAS, or spend that was not read from a list or a verified source.
- No performance promises. Say why an idea should work, never a guaranteed uplift.
- No Ad Library links and no links to competitor ads in any field or text.
- No tool talk: no tool names or cursors in user-facing text.
- At most 10 per call. Hold extras for the next refresh.

## Execution Workflow

### Step 1: Load the full context

Pull everything before writing. Small limits are for the extra rows, never for the inputs the ideas depend on:

1. `fetchBusinessProfile` — products, USPs, audience, offers, and brand voice. This is the source for starting ideas when no ads exist.
2. `fetchDetailBar` `competitorResearches` (latest 3–4, page if the latest has no ads): every saved ad, with its angle, hook, offer, format and days live.
3. `fetchDetailBar` `campaigns` (roots, limit 25) and `campaigns.ads` (limit 50, page as needed): our classified ads, including each ad's `category`, metrics and action. Winners are here.
4. `fetchDetailBar` `creatives` (latest 20): what we already made, so ideas don't repeat assets.
5. `fetchDetailBar` `alerts` and `suggestions`: fatigue, saturation, landing-page mismatch, and growth openings.
6. `fetchDetailBar` `campaignBriefs` (latest 5): planned angles and offers.
7. `fetchDetailBar` `ideas` (all, paged): the current backlog.

### Step 2: Pull the winners

- **Ours:** ads in `campaigns.ads` with `category` `winner`; add `fading` (a winner that is slipping) and `scaler` when present. Read their metrics, action, and media.
- **Theirs:** verified winners from the competitor research, long-running first, then potential. Prefer ads for the same product, category, or objective as our live campaigns.
- View every video and image before using it.
- For each ad note: the hook (first 3 seconds or headline), the angle, the structure (order of beats), the proof device, the offer framing and CTA, and the format, length, and language.
- Find the patterns: what repeats in 2 or more ads, and what none of them show (our gap).
- Keep each ad's media URL exactly as returned, and verify its aspect ratio (9/16, 4/5, 1/1, 16/9, or 3/2).

### Step 3: Research when the inputs are thin

Do this before ideating when any of these is true:

- no `competitorResearches` rows, or the latest research has no ads or no winners;
- the saved research is older than 14 days;
- the profile lists products or offers that the research never covers.

Then:

- Use `searchAdLibrary` with the brand's products, broad category phrases, and offer phrases from the Business Profile. Find creative ideas in the best-performing ads from competitors and other advertisers.
- Rank the sample by long-running and top-impression ads; view the strongest with `readImages` and `readVideos`.
- Use `webSearch` and `scrapeWebPage` for category angles, seasonal offers, and claims the library does not show.
- If the library returns nothing usable too, move straight to starting ideas. Never stop with no ideas.

### Step 4: Find the four kinds of signal

- A competitor pattern or winner that is absent from our backlog (`COMPETITOR WINNER`).
- One of our winners whose winning element can become a new idea (`OUR WINNER`).
- A variant of an existing creative, with the change named (`VARIANT`).
- A gap in the research about audience, offer, or proof, or an alert / suggestion opening (`FROM INSIGHTS`).

### Step 5: Fill the floor with starting ideas

When the evidence would leave fewer than 1-2 cards, top the run up from the Business Profile and live campaigns. These are `FROM INSIGHTS` and must still be specific to the brand, never generic filler. They also need a reference ad: use one from the self-search or our own ads. No `mediaUrl` means no card.

- **Hero product proof:** the main product, its strongest USP, and the objection it answers.
- **Objection / FAQ:** the question buyers ask before ordering, answered in the hook.
- **Offer framing:** the live offer, bundle, or festive angle in one clear promise.
- **Category education:** why our category matters, shown with the product in use.
- **Proof device:** founder, sourcing, process, reviews, or before/after — whichever the profile supports.
- **Live campaign fit:** a new angle for the campaign already spending the most, named with its objective.

Write them like any other card: concrete hook, one asset, one audience. Never invent numbers or claim results. If the profile is empty too, use the website content already saved for the brand and say the idea is a starting point.

### Step 6: Rank and save

- Always save at least 1-2+ cards, at most 10. Rank by expected impact, fit with live campaigns, and production cost.
- Save with `updateIdeas`. Omit `id` for new cards. Pass an existing `id` only to update a backlog item deliberately.
- If saving fails, say so. Never present a saved state that did not happen.

## Reference example

One saved card, as an illustration. Borrow the density and wording style. Don't copy the content. All names, numbers and URLs are illustrative.

```json
{
  "title": "Do You Know When Your Oil Was Pressed?",
  "description": "Question hooks that make buyers doubt their current product run in 3 of 5 inspected winners, and none show a press date. Our press date fills that gap.",
  "source": "COMPETITOR WINNER",
  "format": "video",
  "hook": "Do you know when your oil was pressed?",
  "why": "A 15s UGC video: the question, the bottle's press date, then the Diwali gift box.",
  "makeFor": "Women 30-50, Karnataka and Tamil Nadu, cold audience",
  "mediaUrl": "https://cdn.example.com/competitor-winner.mp4",
  "aspectRatio": "9/16"
}
```

An update passes the existing `id`; it may omit the media fields and keeps the stored reference:

```json
{
  "id": "01a2b3c4-existing-idea",
  "title": "Fresh Hook For Tiring Unboxing Video",
  "description": "Frequency on the unboxing winner passed 2.5 and CTR is falling. A new first 3 seconds keeps the proven structure.",
  "source": "FROM INSIGHTS",
  "format": "video",
  "hook": "Day 1 of Diwali: three oils, one box.",
  "why": "Re-cut the unboxing winner with a new opening shot and the same offer.",
  "makeFor": "Existing winning audience, retargeting"
}
```

A starting idea still cites a reference ad from the self-search or our own ads:

```json
{
  "title": "Cold-Pressed In 24 Hours, Not Months",
  "description": "The profile's strongest USP is pressing to order; no saved ad uses the time gap. A starting idea from the product story.",
  "source": "FROM INSIGHTS",
  "format": "video",
  "hook": "Most oil sits in a warehouse. Ours is pressed the day you order.",
  "why": "A 12s product-in-use video: the press, the pour, the delivery box.",
  "makeFor": "New buyers, category cold audience",
  "mediaUrl": "https://cdn.example.com/category-reference.mp4",
  "aspectRatio": "9/16"
}
```

## Before saving

- Every card is a new idea, not in the backlog by title, hook, or angle.
- Every new card carries `mediaUrl` and `aspectRatio`, exactly as returned; an update without them keeps the stored reference.
- No competitor words, assets, or links anywhere.
- No invented numbers. No guaranteed results.
- Ranked strongest first, 10 or fewer.
