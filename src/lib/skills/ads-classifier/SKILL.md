---
name: ads-classifier
description: "Classifies every ad in every ad account campaign as winner, scaler, potential, loser, or untested for marketing."
---

## Rules

- **Grounded in Meta data:** Read every ad from Meta before judging. Never fabricate an ad, id, metric, or result. If the read does not carry the signal, the ad stays `untested` — never guessed.
- **Read first:** use the Meta Graph tools (`fetchMetaAdAccounts` → `fetchMetaCampaigns` → `fetchMetaAds`) and keep querying until every attribute group the card stores has come back.
- **One write per run:** call `upsertAdsClassified` once with every ad you judged, including its name, ad set, format, media, computed metrics, comparison lines, and recommended action. A run ends when that call returns.

## Guardrails

- **No fabrication:** never invent an ad, id, metric, or verdict.
- **No technical details:** never mention tool names, Graph endpoints, or query strings in user-facing text.
- **No raw dumps:** never print the tool payload.

---

## Classify

The Classify table below was built for **mature Meta ad accounts**: many ads per ad set, steady daily spend, enough history that the data is reliable. Each number has a job:

- **≥ 10 results**: a single lucky purchase or lead can't make an ad look good.
- **≥ 3 days live**: Meta's delivery has settled and early volatility is gone.
- **≥ 3,000 impressions**: CTR is readable and not noise.
- **Cost per result ≤ 0.75× the other ads**: the ad is clearly cheaper than its siblings.
- **Fair share of impressions**: an ad that Meta barely served can't be called a Loser.

In a **new or small account** these numbers can be impossible to reach. Example: an account with 4 ads, 6 days old, and 14 results in total. No ad can reach 10 results, so the strict rule would label everything Untested. That would be wrong. The account does have a best ad and a worst ad. They are just small.

The goal is to find the **best ads relative to this account**, while never calling something a winner on pure luck.

### Step 1: Check how mature the account is

Look at the data and decide which case applies:

- **Mature**: 10+ ads in the account, at least one ad set with 3+ ads, campaigns older than ~14 days, and at least one ad with 10+ results. → Use the Classify table exactly as written.
- **Thin**: any of these is true: ≤ 5 ads in the account, ad sets with only 1-2 ads, campaigns younger than ~14 days, no ad has reached 10 results, or no ad has reached 3,000 impressions. → Use the relative method below.
- **Empty**: the whole account has fewer than 3 results in total, or only 1 ad. → Label everything **Untested**. Say the account needs more data. Do not force a winner.

### Step 2: If thin, judge relatively

1. **Widen the comparison group.** An ad set with only 1-2 ads has nothing to compare against. Compare with the whole campaign instead. If the campaign is also small, compare with every ad in the account.
2. **Rank the ads** by cost per result (lower is better). Use ROAS as a tiebreaker if the account has purchase value.
3. **Apply a minimum floor.** An ad is only eligible to be a Winner if it has **at least 3 results and at least 2 days live**. Below that, it is Untested, however good the numbers look.
4. **Pick relative winners.** An eligible ad in the **top ~25% of the account** by cost per result, and no worse than the account average on ROAS, is a **Winner (relative)**. A 4-ad account can have 1 relative winner.
5. **Pick relative losers.** An ad is a Loser only if it has had its fair share of impressions AND is in the bottom ~25% on cost per result, or has spent ≥ 2× the account's average cost per result with 0 results.
6. **Keep the other rules.** Scaler (spend share, frequency), Potential (CTR and impression share) and Untested keep their normal logic. Only the result and cost cutoffs are relaxed.

### Step 3: Always disclose

Never present a relative label as if it passed the full benchmarks. Write `Winner`, `Potential` or `Loser`, and add one line of reason with the actual numbers, for example:

> Winner: account has 4 ads and 14 results total. This ad has 5 results at $8.20 per result, the lowest in the account (average $14.10).

### Worked examples

**Example A: new account, 4 ads, day 6.** Results: Ad 1 has 5 at $8, Ad 2 has 4 at $11, Ad 3 has 3 at $19, Ad 4 has 2 at $30. No ad has 10 results, so the strict rule fires on nothing. → Ad 1 is Winner. Ad 2 is Untested or Potential. Ad 4 is Loser only if it had its fair share of impressions. Ad 3 is Untested.

**Example B: new account, 4 ads, day 2.** One ad has 1 result at $5. → It fails the floor (3 results). All ads are Untested. Say: "Too early, no ad has 3 results yet."

**Example C: mature account, 25 ads.** → Skip this section. Use the Classify table as written.

| Label         | Rule                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Winner**    | ≥ 10 results, ≥ 3 days live, cost per result ≤ 0.75× the other ads in the set, ROAS ≥ the campaign's ROAS                                                    |
| **Scaler**    | a Winner whose spend ≥ 90% of its ad set's spend, frequency < 2.5                                                                                            |
| **Potential** | ≤ 7 days live, ≥ 3,000 impressions, ≥ 1.5× its fair share of impressions, CTR ≥ 1.3× the other ads                                                           |
| **Loser**     | had its fair share of impressions **and** either (spend ≥ 2× the set's cost per result with 0 results) or (cost per result ≥ 2× the others with ≥ 5 results) |
| **Untested**  | too little data to judge, or strong CTR on < 10% of the set's impressions                                                                                    |

## Save

use `upsertAdsClassified` to save, and it must stand on complete reads. Before calling it, make sure the Meta queries have returned every attributes:

- **Identity and placement:** the ad, its ad set, and the campaign it belongs to.
- **Creative:** the media the card previews.
- **Metrics:** the full performance group for the comparison window — every number the classification compares, not a subset.
- **Peer values:** the same groups for the other ads in the ad set, since every rule is relative.

If any group is missing or partial, query it with the Meta Graph tools (`fetchMetaAdAccounts`, `fetchMetaCampaigns`, `fetchMetaAds`) until the reads are complete.
This is a prerequisite: never call `upsertAdsClassified` on partial data — an incomplete read is how a verdict goes wrong.

Then call `upsertAdsClassified` once for every analysed ad: its attribute groups plus the verdict and the computed metrics. The call is the deliverable — a run with no write is incomplete.
