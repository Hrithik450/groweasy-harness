---
name: campaign-health
description: "Classifies every ad in the Ad Manager Campaigns tab as winner, scaler, potential, loser, or untested, from the metrics already derived from Meta. Ads only: campaign rows and their numbers come from the app's Meta sync."
---

## Rules

- **Ads only:** campaign rows, spend, results, CPA, ROAS, impressions, clicks, CTR and frequency are synced from Meta by the app. Never restate or recompute them; never write campaign fields. This skill writes one verdict per ad.
- **Read first:** `fetchMetaAdAccounts` → `fetchMetaCampaigns` → `fetchMetaAds` with `insights` fields; use the returned ids, ad sets, and metrics.
- **One write per run:** call `upsertAdsClassified` once with every ad you judged. A run ends when that call returns.
- **Grounded in the read:** classify only from the numbers the Meta fetch tools returned. A signal the read does not carry leaves the ad `untested`, never guessed.
- **Not this skill:** delivery and billing problems are `alerts`; growth ideas are `suggestions`; a written narrative is `daily-report`; changing a live campaign is `updateMetaCampaign` / `deleteMetaCampaign`.

## Guardrails

- **No fabrication:** never invent an ad, id, metric, or verdict.
- **No technical details:** never mention tool names, Graph endpoints, or query strings in user-facing text.
- **No raw dumps:** never print the tool payload.
- **If nothing is synced:** say "No campaigns are synced yet — open the Ad Manager Campaigns tab once." and stop.

---

## Classify

Compare each ad with the **other ads in its ad set** first, then the campaign, then the account's other campaigns. Fair share = `1 ÷ ads in the ad set`.

| Label | Rule |
|---|---|
| **Winner** | ≥ 10 results, ≥ 3 days live, cost per result ≤ 0.75× the other ads in the set, ROAS ≥ the campaign's ROAS |
| **Scaler** | a Winner whose spend ≥ 90% of its ad set's spend, frequency < 2.5 |
| **Potential** | ≤ 7 days live, ≥ 3,000 impressions, ≥ 1.5× its fair share of impressions, CTR ≥ 1.3× the other ads |
| **Loser** | had its fair share of impressions **and** either (spend ≥ 2× the set's cost per result with 0 results) or (cost per result ≥ 2× the others with ≥ 5 results) |
| **Untested** | too little data to judge, or strong CTR on < 10% of the set's impressions |

Order matters: Winner, then Scaler (a Winner subset), then Potential, then Loser, then Untested.

## Answer

Two lines, no tables:

1. Ads classified and how many winners / losers.
2. The one ad whose verdict costs the most money, and why.
