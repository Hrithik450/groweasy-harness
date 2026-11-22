---
name: ads-classifier
description: "Sorts every live ad into winner, scaler, potential, loser, or untested; saves each verdict and its CTA with upsertAdsClassified; and shows winners, losers, and scalers in the Campaigns tab and in chat."
---

## Rules

- **Grounded in Meta data:** Read every ad from Meta before judging. Never fabricate an ad, id, metric, or result. If the read does not carry the signal, the ad stays `untested` — never guessed.
- **Two niches only:** app-install campaigns (result = install, cost = CPI) and website-sales / D2C campaigns (result = purchase, cost = CPA, money = revenue and ROAS). Do not classify lead-gen or other objectives.
- **Read first:** use `fetchMetaAdAccounts` → `fetchMetaCampaigns` → `fetchMetaAds` and keep querying until every attribute group the card stores has come back.
- **One write per run:** call `upsertAdsClassified` once with every ad you judged, including its name, ad set, format, media, computed metrics, comparison lines, verdict, and action. A run ends when that call returns.
- **The tab renders from saved rows:** the Campaigns tab groups ads by the saved `category` and prints the saved metrics and action. Never describe a verdict only in prose; save it.
- **Not this skill:** delivery and billing problems are `alerts`; growth ideas are `suggestions`; the written narrative is `daily-report`; a plan is `campaign-brief`; changing a live campaign is `upsertMetaCampaign`.

## Guardrails

- **No fabrication:** never invent an ad, id, metric, or verdict.
- **No technical details:** never mention tool names, Graph endpoints, or query strings in user-facing text.
- **No raw dumps:** never print the tool payload.
- **Do not oversimplify:** count every active ad. A label may only be left out when the ad has no saved verdict.

---

## Classify

Compare each ad with the **other ads in its ad set** first, then the campaign's last 7 days, then the account benchmark. Fair share = `1 ÷ active ads in the ad set`.

| Label | Rule | CTA |
|---|---|---|
| **Winner** | ≥ 10 results and ≥ 3 days live; cost per result ≤ 0.75× the other ads in the set **and** ≤ the account benchmark; D2C ROAS ≥ benchmark; held for 3+ days | **Multiply variants** |
| **Scaler** | A Winner spending ≥ 90% of what its ad set gives it, frequency < 2.5, CPM steady, cost per result steady as spend rises | **Increase budget: +20%**, or move it to its own ad set with more budget |
| **Potential** | ≤ 7 days live, ≥ 3,000 impressions, ≥ 1.5× its fair share of impressions, and CTR (plus install rate or add-to-cart rate) ≥ 1.3× the other ads | Protect: never stopped or cut while it proves itself. Ad Creator prepares variants. |
| **Loser** | Had ≥ its fair share of impressions **and** either spent ≥ 2× the set's cost per result with 0 results, or cost per result ≥ 2× the other ads with ≥ 5 results | **Stop ad**, and move its budget to the set's winner |
| **Untested** | Too little data to judge, or strong CTR on < 10% of the set's impressions | Small test budget, or leave it |

A Winner that slips — cost per result ≥ 1.3× its best week, or frequency ≥ 3 with CTR down 20% — is **Fading**. Its CTA becomes **Refresh creative**, and any variant beating it is promoted.

### Small or new accounts

The table was built for mature accounts: many ads per set, steady spend, enough history. In a new or thin account these cutoffs can be impossible, and labelling everything Untested would be wrong: the account still has a best and a worst ad.

- **Mature:** 10+ ads, at least one set with 3+ ads, campaigns older than ~14 days, at least one ad with 10+ results. Use the table exactly.
- **Thin:** ≤ 5 ads, sets with 1–2 ads, campaigns younger than ~14 days, no ad at 10 results, or no ad at 3,000 impressions. Judge relatively:
  1. Widen the comparison group: ad set → campaign → whole account.
  2. Rank ads by cost per result; use ROAS as the tiebreaker.
  3. Floor: an ad needs **≥ 3 results and ≥ 2 days live** to be a Winner, however good it looks.
  4. A Winner must be in the top ~25% of the account by cost per result and no worse than the account average on ROAS.
  5. A Loser must still have had its fair share of impressions, then be in the bottom ~25% on cost per result, or have spent ≥ 2× the account average with 0 results.
  6. Keep the usual Scaler, Potential and Untested logic; only relax the result and cost cutoffs.
- **Empty:** fewer than 3 results in total, or one ad. Label everything Untested and say the account needs more data.

Worked examples:

- **New account, 4 ads, day 6.** Ad 1 has 5 results at ₹8, Ad 2 has 4 at ₹11, Ad 3 has 3 at ₹19, Ad 4 has 2 at ₹30. No ad reaches 10 results, so the strict rule fires on nothing. Ad 1 is Winner. Ad 2 is Untested or Potential. Ad 4 is Loser only if it had its fair share of impressions. Ad 3 is Untested.
- **New account, 4 ads, day 2.** One ad has 1 result at ₹5. It fails the floor, so all ads are Untested. Say: "Too early, no ad has 3 results yet."
- **Mature account, 25 ads.** Skip the relative method and use the table as written.

Never present a relative label as if it passed the full benchmarks. Add one line with the real numbers, for example: "Winner: 4 ads and 14 results total. This ad has 5 results at ₹8.20, the lowest in the account (average ₹14.10)."

## What each saved ad carries

`upsertAdsClassified` is the whole deliverable. For every ad, save:

- **Verdict:** one of `winner`, `scaler`, `potential`, `loser`, `untested`.
- **Identity and media:** Meta ad id, campaign id, name, ad set, format (`video` or `image`), and the creative URL.
- **Metrics:** days active, impressions, clicks, CTR, spend, purchases, frequency, CPA, ROAS — every number the comparison used.
- **`siblingComparison`:** one line against the other ads, max 5–6 words, e.g. "CPA 57% below set average".
- **`resultShare`:** this ad's share of the results, e.g. "41% of ad set purchases".
- **`whyItWorks`:** one crisp line, max 10 words.
- **`value`:** the expected gain from the action, in one metric.
- **`action`:** the CTA in one sentence (`fix`), plus what is true now (`before`) and what the move changes (`after`).

## Multiply variants

The main action for a Winner: 3–5 new ads that change one thing each, so the result shows what worked. Variants launch **beside** the winner; the winner is never paused to make room. If the winner already takes > 70% of impressions, use a new test ad set.

| Direction | What changes | Example |
|---|---|---|
| **Same product, new hooks / visuals** | Opening line or first 3 seconds; image or scene | "Pressed on Monday" → "Older than your vegetables?" |
| **Other products** | The winning idea for another product from the business profile | Groundnut-oil winner → sesame oil, A2 ghee |
| **Other features / USPs** | Same format and structure, a different benefit | "Track expenses" → "Split bills", "Monthly budget" |
| **Other audiences** | Same ad, adapted to a proven segment or language | Women 35–44; a Hindi version for UP |
| **Other formats** | Image → 9:16 video, video → image, or a short cut | Static winner → 15-second Reel |

After 7 days or 10 results per variant: a variant beating the winner by ≥ 15% becomes the new winner; within ±15% stays; ≥ 30% worse gets a **Stop ad** card. Hand the build to `static-ad` or `video-ad`.

## Money value

| CTA | Value |
|---|---|
| Stop ad | ₹/week saved, plus the extra results it buys when moved to the winner |
| Increase budget | Extra installs or purchases per week at the scaler's cost × 0.85; D2C also revenue |
| Multiply variants | Results the winner brings each week that would be lost when it fades (about 2–3 weeks for images, 2 for video), plus the chance of a cheaper winner |

## How it shows

**Campaigns tab.** Winners, Scalers, Losers, Potential and Untested are labels on ads, and ads belong to campaigns. Each campaign card shows its numbers and summary chips (`1 winner`, `1 scaler`, `2 losers`, `2 potential`), then opens to ads grouped in that order. Empty groups are hidden. A campaign with no labelled ads shows no chips. The app renders this from the saved rows, so save every ad.

**Chat.** When the owner asks "what's working?" or "which ads should I stop?", answer with the campaign view in one `<ui-block>`, using the reference below. Put media inline as Video or Image. One short message when an ad becomes a Winner: "New winner: UGC_unboxing_v3. Purchases at ₹298 vs ₹690 for your other ads. Want 4 variants for your other products?"

**Suggestions tab.** Only the 1–2 biggest moves from this skill, and only when they rank in the account's top 5 by money value, e.g. "Stop 2 losers in Diwali gift box · saves ≈ ₹4,700/week". Suggestions stays a short to-do list, not an inventory.

**Reports.** The `daily-report` skill carries the daily changes: new winners, stopped losers, and the weekly winner table.

**Ideas.** Every Winner and Potential winner, with its numbers and makeup, is a source for Ad Creator ideas and for spreading to other products, features and audiences.

**Campaign brief and alerts.** Winners and their makeup are the first creatives a new `campaign-brief` plans around. Loser and Scaler moves follow the same action-card rules as `alerts`, and a Fading winner is a Refresh creative alert.

## Reference example

Below is the required campaign-view standard for chat, not inspiration. Match its group order, component mapping, variants and density exactly. Only hide an empty group, or add a group built from the same pattern. Do not copy its content; all names and numbers are illustrative.

<ui-block>
{
  "root": "root",
  "elements": {
    "root": {"type":"Stack","props":{"direction":"vertical","gap":"md","align":"stretch","justify":"start"},"children":["title","scope","winners","scalers","losers","potential"]},
    "title": {"type":"Heading","props":{"text":"One winner worth multiplying. Two ads wasting money.","level":"h1"}},
    "scope": {"type":"Table","props":{"variant":"light","headerVariant":"light","columns":["Campaign","Spend","Results","Cost per result","ROAS"],"rows":[["Diwali gift box · Sales","₹1,42,000","345","₹412","3.1"]]}},

    "winners": {"type":"Card","props":{"variant":"light"},"children":["winners-header","winners-div","winners-ad"]},
    "winners-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["winners-title","winners-meta"]},
    "winners-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["winners-eyebrow","winners-heading"]},
    "winners-eyebrow": {"type":"Eyebrow","props":{"text":"Winners","size":"sm","variant":"accent"}},
    "winners-heading": {"type":"Heading","props":{"text":"Multiply before they tire","level":"h2"}},
    "winners-meta": {"type":"Text","props":{"text":"1 AD · 41% OF PURCHASES","size":"xs"}},
    "winners-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "winners-ad": {"type":"Card","props":{"variant":"light"},"children":["winners-ad-grid"]},
    "winners-ad-grid": {"type":"Grid","props":{"columns":3,"spans":[{"colSpan":1},{"colSpan":2}]},"children":["winners-media","winners-body"]},
    "winners-media": {"type":"Video","props":{"src":"https://picsum.photos/seed/ugc-unboxing/900/1600","title":"UGC unboxing v3","aspectRatio":"9/16"}},
    "winners-body": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["winners-top","winners-stats","winners-compare","winners-move"]},
    "winners-top": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["winners-name","winners-badge"]},
    "winners-name": {"type":"Heading","props":{"text":"UGC_unboxing_v3","level":"h3"}},
    "winners-badge": {"type":"Badge","props":{"text":"WINNER","variant":"success"}},
    "winners-stats": {"type":"Grid","props":{"columns":3},"children":["winners-s1","winners-s2","winners-s3"]},
    "winners-s1": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["winners-s1-l","winners-s1-v"]},
    "winners-s1-l": {"type":"Eyebrow","props":{"text":"CPA","size":"sm","variant":"muted"}},
    "winners-s1-v": {"type":"Text","props":{"text":"₹298","size":"sm"}},
    "winners-s2": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["winners-s2-l","winners-s2-v"]},
    "winners-s2-l": {"type":"Eyebrow","props":{"text":"vs others","size":"sm","variant":"muted"}},
    "winners-s2-v": {"type":"Text","props":{"text":"₹690","size":"sm"}},
    "winners-s3": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["winners-s3-l","winners-s3-v"]},
    "winners-s3-l": {"type":"Eyebrow","props":{"text":"Purchases","size":"sm","variant":"muted"}},
    "winners-s3-v": {"type":"Text","props":{"text":"41%","size":"sm"}},
    "winners-compare": {"type":"Text","props":{"text":"CPA 57% below the other ads in its ad set.","size":"sm"}},
    "winners-move": {"type":"Card","props":{"variant":"accent"},"children":["winners-move-s"]},
    "winners-move-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["winners-move-l","winners-move-t"]},
    "winners-move-l": {"type":"Eyebrow","props":{"text":"Multiply variants","size":"sm"}},
    "winners-move-t": {"type":"Text","props":{"text":"Make 3–5 variants: new hooks, other products, audiences and formats.","size":"sm"}},

    "scalers": {"type":"Card","props":{"variant":"light"},"children":["scalers-header","scalers-div","scalers-ad"]},
    "scalers-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["scalers-title","scalers-meta"]},
    "scalers-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["scalers-eyebrow","scalers-heading"]},
    "scalers-eyebrow": {"type":"Eyebrow","props":{"text":"Scalers","size":"sm","variant":"accent"}},
    "scalers-heading": {"type":"Heading","props":{"text":"Room to spend more","level":"h2"}},
    "scalers-meta": {"type":"Text","props":{"text":"1 AD · PACE HOLDS AS SPEND RISES","size":"xs"}},
    "scalers-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "scalers-ad": {"type":"Card","props":{"variant":"light"},"children":["scalers-ad-grid"]},
    "scalers-ad-grid": {"type":"Grid","props":{"columns":3,"spans":[{"colSpan":1},{"colSpan":2}]},"children":["scalers-media","scalers-body"]},
    "scalers-media": {"type":"Image","props":{"src":"https://picsum.photos/seed/price-reveal/900/900","alt":"Price reveal ad","aspectRatio":"1/1","fit":"cover"}},
    "scalers-body": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["scalers-top","scalers-stats","scalers-compare","scalers-move"]},
    "scalers-top": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["scalers-name","scalers-badge"]},
    "scalers-name": {"type":"Heading","props":{"text":"price_reveal_v2","level":"h3"}},
    "scalers-badge": {"type":"Badge","props":{"text":"SCALER","variant":"dark"}},
    "scalers-stats": {"type":"Grid","props":{"columns":3},"children":["scalers-s1","scalers-s2","scalers-s3"]},
    "scalers-s1": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["scalers-s1-l","scalers-s1-v"]},
    "scalers-s1-l": {"type":"Eyebrow","props":{"text":"ROAS","size":"sm","variant":"muted"}},
    "scalers-s1-v": {"type":"Text","props":{"text":"3.8","size":"sm"}},
    "scalers-s2": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["scalers-s2-l","scalers-s2-v"]},
    "scalers-s2-l": {"type":"Eyebrow","props":{"text":"Budget used","size":"sm","variant":"muted"}},
    "scalers-s2-v": {"type":"Text","props":{"text":"96%","size":"sm"}},
    "scalers-s3": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["scalers-s3-l","scalers-s3-v"]},
    "scalers-s3-l": {"type":"Eyebrow","props":{"text":"Frequency","size":"sm","variant":"muted"}},
    "scalers-s3-v": {"type":"Text","props":{"text":"1.6","size":"sm"}},
    "scalers-compare": {"type":"Text","props":{"text":"ROAS 3.8 vs 3.1 for the campaign; cost per result steady.","size":"sm"}},
    "scalers-move": {"type":"Card","props":{"variant":"accent"},"children":["scalers-move-s"]},
    "scalers-move-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["scalers-move-l","scalers-move-t"]},
    "scalers-move-l": {"type":"Eyebrow","props":{"text":"Increase budget: +₹600/day","size":"sm"}},
    "scalers-move-t": {"type":"Text","props":{"text":"≈ +9 purchases per week at the same cost per result.","size":"sm"}},

    "losers": {"type":"Card","props":{"variant":"light"},"children":["losers-header","losers-div","losers-ad"]},
    "losers-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["losers-title","losers-meta"]},
    "losers-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["losers-eyebrow","losers-heading"]},
    "losers-eyebrow": {"type":"Eyebrow","props":{"text":"Losers","size":"sm","variant":"accent"}},
    "losers-heading": {"type":"Heading","props":{"text":"Got their fair share, didn't sell","level":"h2"}},
    "losers-meta": {"type":"Text","props":{"text":"1 AD · ₹2,100 SPENT · 0 SALES","size":"xs"}},
    "losers-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "losers-ad": {"type":"Card","props":{"variant":"light"},"children":["losers-ad-grid"]},
    "losers-ad-grid": {"type":"Grid","props":{"columns":3,"spans":[{"colSpan":1},{"colSpan":2}]},"children":["losers-media","losers-body"]},
    "losers-media": {"type":"Image","props":{"src":"https://picsum.photos/seed/static-shelf/900/900","alt":"Static shelf ad","aspectRatio":"1/1","fit":"cover"}},
    "losers-body": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["losers-top","losers-stats","losers-compare","losers-move"]},
    "losers-top": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["losers-name","losers-badge"]},
    "losers-name": {"type":"Heading","props":{"text":"static_shelf_v1","level":"h3"}},
    "losers-badge": {"type":"Badge","props":{"text":"LOSER","variant":"destructive"}},
    "losers-stats": {"type":"Grid","props":{"columns":3},"children":["losers-s1","losers-s2","losers-s3"]},
    "losers-s1": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["losers-s1-l","losers-s1-v"]},
    "losers-s1-l": {"type":"Eyebrow","props":{"text":"Spent","size":"sm","variant":"muted"}},
    "losers-s1-v": {"type":"Text","props":{"text":"₹2,100","size":"sm"}},
    "losers-s2": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["losers-s2-l","losers-s2-v"]},
    "losers-s2-l": {"type":"Eyebrow","props":{"text":"Purchases","size":"sm","variant":"muted"}},
    "losers-s2-v": {"type":"Text","props":{"text":"0","size":"sm"}},
    "losers-s3": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["losers-s3-l","losers-s3-v"]},
    "losers-s3-l": {"type":"Eyebrow","props":{"text":"Impressions","size":"sm","variant":"muted"}},
    "losers-s3-v": {"type":"Text","props":{"text":"Fair share","size":"sm"}},
    "losers-compare": {"type":"Text","props":{"text":"Had its fair share and spent 2× the set cost per result.","size":"sm"}},
    "losers-move": {"type":"Card","props":{"variant":"accent"},"children":["losers-move-s"]},
    "losers-move-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["losers-move-l","losers-move-t"]},
    "losers-move-l": {"type":"Eyebrow","props":{"text":"Stop ad · move ₹400/day","size":"sm"}},
    "losers-move-t": {"type":"Text","props":{"text":"Move the budget to UGC_unboxing_v3; saves ≈ ₹2,800 per week.","size":"sm"}},

    "potential": {"type":"Card","props":{"variant":"light"},"children":["potential-header","potential-div","potential-list"]},
    "potential-header": {"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"baseline","justify":"between"},"children":["potential-title","potential-meta"]},
    "potential-title": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"baseline","justify":"start"},"children":["potential-eyebrow","potential-heading"]},
    "potential-eyebrow": {"type":"Eyebrow","props":{"text":"Potential · not tested yet","size":"sm","variant":"accent"}},
    "potential-heading": {"type":"Heading","props":{"text":"Protected while they prove out","level":"h2"}},
    "potential-meta": {"type":"Text","props":{"text":"2 ADS · UNDER 7 DAYS","size":"xs"}},
    "potential-div": {"type":"Separator","props":{"orientation":"horizontal"}},
    "potential-list": {"type":"Stack","props":{"direction":"vertical","gap":"md","align":"stretch","justify":"start"},"children":["potential-a1","potential-sep","potential-a2"]},
    "potential-a1": {"type":"Grid","props":{"columns":6,"spans":[{"colSpan":1},{"colSpan":3},{"colSpan":2}]},"children":["potential-a1-media","potential-a1-body","potential-a1-note"]},
    "potential-a1-media": {"type":"Video","props":{"src":"https://picsum.photos/seed/founder-30s/900/1600","title":"Founder 30 seconds","aspectRatio":"9/16"}},
    "potential-a1-body": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["potential-a1-top","potential-a1-line"]},
    "potential-a1-top": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["potential-a1-name","potential-a1-badge"]},
    "potential-a1-name": {"type":"Heading","props":{"text":"founder_30s","level":"h3"}},
    "potential-a1-badge": {"type":"Badge","props":{"text":"POTENTIAL","variant":"muted"}},
    "potential-a1-line": {"type":"Text","props":{"text":"Day 3 · 38% of impressions · CTR 1.6× the others.","size":"sm"}},
    "potential-a1-note": {"type":"Card","props":{"variant":"muted"},"children":["potential-a1-note-t"]},
    "potential-a1-note-t": {"type":"Text","props":{"text":"Protected — no action while it proves out.","size":"sm"}},
    "potential-sep": {"type":"Separator","props":{"orientation":"horizontal"}},
    "potential-a2": {"type":"Grid","props":{"columns":6,"spans":[{"colSpan":1},{"colSpan":3},{"colSpan":2}]},"children":["potential-a2-media","potential-a2-body","potential-a2-move"]},
    "potential-a2-media": {"type":"Image","props":{"src":"https://picsum.photos/seed/offer-emi/900/900","alt":"Offers EMI ad","aspectRatio":"1/1","fit":"cover"}},
    "potential-a2-body": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["potential-a2-top","potential-a2-line"]},
    "potential-a2-top": {"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"center","justify":"between"},"children":["potential-a2-name","potential-a2-badge"]},
    "potential-a2-name": {"type":"Heading","props":{"text":"offer_emi_v1","level":"h3"}},
    "potential-a2-badge": {"type":"Badge","props":{"text":"POTENTIAL","variant":"muted"}},
    "potential-a2-line": {"type":"Text","props":{"text":"4% of impressions · CTR 1.4× the others.","size":"sm"}},
    "potential-a2-move": {"type":"Card","props":{"variant":"accent"},"children":["potential-a2-move-s"]},
    "potential-a2-move-s": {"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch","justify":"start"},"children":["potential-a2-move-l","potential-a2-move-t"]},
    "potential-a2-move-l": {"type":"Eyebrow","props":{"text":"Test budget","size":"sm"}},
    "potential-a2-move-t": {"type":"Text","props":{"text":"Give it ₹300/day in a small test ad set.","size":"sm"}}
  }
}
</ui-block>

## Save

`upsertAdsClassified` must stand on complete reads. Before calling it, make sure the Meta queries returned every attribute group:

- **Identity and placement:** the ad, its ad set, and the campaign it belongs to.
- **Creative:** the media the card previews.
- **Metrics:** the full performance group for the comparison window — every number the classification compares, not a subset.
- **Peer values:** the same groups for the other ads in the ad set, since every rule is relative.

If any group is missing or partial, query it again with `fetchMetaAdAccounts`, `fetchMetaCampaigns` and `fetchMetaAds` until the reads are complete. Never call `upsertAdsClassified` on partial data.

Then call `upsertAdsClassified` once for every analysed ad. If nothing is synced, say "No campaigns are synced yet — open the Ad Manager Campaigns tab once." and stop.

## Never

- Call a Winner below 10 results or 3 days, or a Loser that never got its fair share of impressions.
- Stop or cut a Potential winner while it is being proven.
- Pause a winner to make room for its variants.
- Raise a budget more than 20% in one step, or more than once in 72 hours.
- Present a relative label as if it passed the full benchmarks, or invent a metric to fill a card.
