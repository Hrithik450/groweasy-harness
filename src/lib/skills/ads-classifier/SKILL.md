---
name: ads-classifier
description: "Sorts every live ad into winner, scaler, potential, loser, or untested; saves each verdict and its CTA with upsertAdsClassified."
---

## Rules

- **Grounded in Meta data:** Read every ad from Meta before judging. Never fabricate an ad, id, metric, or result. If the read does not carry the signal, the ad stays `untested` — never guessed.
- **niches:** app-install campaigns (result = install, cost = CPI) and website-sales / D2C campaigns (result = purchase, cost = CPA, money = revenue and ROAS).
- **Read first:** use `fetchMetaAdAccounts` → `fetchMetaCampaigns` → `fetchMetaAds` and keep querying until every attribute group the card stores has come back.

## Guardrails

- **No fabrication:** never invent an ad, id, metric, or verdict.
- **No technical details:** never mention tool names, Graph endpoints, or query strings in user-facing text.
- **No raw dumps:** never print the tool payload.
- **Do not oversimplify:** count every active ad. A label may only be left out when the ad has no saved verdict.

---

## Classify

Compare each ad with the **other ads in its ad set** first, then the campaign's last 7 days, then the account benchmark. Fair share = `1 ÷ active ads in the ad set`.

| Label         | Rule                                                                                                                                                           | CTA                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Winner**    | ≥ 10 results and ≥ 3 days live; cost per result ≤ 0.75× the other ads in the set **and** ≤ the account benchmark; D2C ROAS ≥ benchmark; held for 3+ days       | **Multiply variants**                                                               |
| **Scaler**    | A Winner spending ≥ 90% of what its ad set gives it, frequency < 2.5, CPM steady, cost per result steady as spend rises                                        | **Increase budget: +20%**, or move it to its own ad set with more budget            |
| **Potential** | ≤ 7 days live, ≥ 3,000 impressions, ≥ 1.5× its fair share of impressions, and CTR (plus install rate or add-to-cart rate) ≥ 1.3× the other ads                 | Protect: never stopped or cut while it proves itself. Ad Creator prepares variants. |
| **Loser**     | Had ≥ its fair share of impressions **and** either spent ≥ 2× the set's cost per result with 0 results, or cost per result ≥ 2× the other ads with ≥ 5 results | **Stop ad**, and move its budget to the set's winner                                |
| **Untested**  | Too little data to judge, or strong CTR on < 10% of the set's impressions                                                                                      | Small test budget, or leave it                                                      |

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

## What each saved ad carries

`upsertAdsClassified` is the whole deliverable. For every ad, save:

- **Verdict:** one of `winner`, `scaler`, `fading`, `potential`, `loser`, `untested`.
- **Identity and media:** `meta` (`adAccountId`, `campaignId`, `adSetId`, `adId`, `creativeId`), the ad `id` and `name`, format (`video` or `image`), and the creative URL.
- **Metrics:** days active, impressions, clicks, CTR, spend, purchases, frequency, CPA, ROAS — every number the comparison used.
- **`siblingComparison`:** one line against the other ads, max 5–6 words, e.g. "CPA 57% below set average".
- **`resultShare`:** this ad's share of the results, e.g. "41% of ad set purchases".
- **`whyItWorks`:** one crisp line, max 10 words.
- **`value`:** the expected gain from the action, in one metric.
- **`action`:** the CTA in one sentence (`fix`), plus what is true now (`before`) and what the move changes (`after`).

## Multiply variants

The main action for a Winner: 3–5 new ads that change one thing each, so the result shows what worked. Variants launch **beside** the winner; the winner is never paused to make room. If the winner already takes > 70% of impressions, use a new test ad set.

| Direction                             | What changes                                                   | Example                                             |
| ------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| **Same product, new hooks / visuals** | Opening line or first 3 seconds; image or scene                | "Pressed on Monday" → "Older than your vegetables?" |
| **Other products**                    | The winning idea for another product from the business profile | Groundnut-oil winner → sesame oil, A2 ghee          |
| **Other features / USPs**             | Same format and structure, a different benefit                 | "Track expenses" → "Split bills", "Monthly budget"  |
| **Other audiences**                   | Same ad, adapted to a proven segment or language               | Women 35–44; a Hindi version for UP                 |
| **Other formats**                     | Image → 9:16 video, video → image, or a short cut              | Static winner → 15-second Reel                      |

After 7 days or 10 results per variant: a variant beating the winner by ≥ 15% becomes the new winner; within ±15% stays; ≥ 30% worse gets a **Stop ad** card. Hand the build to `static-ad` or `video-ad`.

## Money value

| CTA               | Value                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stop ad           | ₹/week saved, plus the extra results it buys when moved to the winner                                                                               |
| Increase budget   | Extra installs or purchases per week at the scaler's cost × 0.85; D2C also revenue                                                                  |
| Multiply variants | Results the winner brings each week that would be lost when it fades (about 2–3 weeks for images, 2 for video), plus the chance of a cheaper winner |

## Save

`upsertAdsClassified` must stand on complete reads. Before calling it, make sure the Meta queries returned every attribute group:

- **Identity and placement:** the ad, its ad set, and the campaign it belongs to.
- **Creative:** the media the card previews.
- **Metrics:** the full performance group for the comparison window — every number the classification compares, not a subset.
- **Peer values:** the same groups for the other ads in the ad set, since every rule is relative.

If any group is missing or partial, query it again with `fetchMetaAdAccounts`, `fetchMetaCampaigns` and `fetchMetaAds` until the reads are complete. Never call `upsertAdsClassified` on partial data.

Then call `upsertAdsClassified` once for every analysed ad.
