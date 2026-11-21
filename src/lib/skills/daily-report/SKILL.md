---
name: daily-report
description: "Daily strategist report that reads the latest campaigns, research, briefs, ideas, creatives, alerts, and suggestions, then saves one UI-block report per day that leads with the biggest change and ends with a single action."
---

## Rules

- **One report per day:** the stored id is today's date, so re-running the same day updates that report.
- **Lead with the biggest change:** a `critical` alert takes the headline. Otherwise rank by money impact, then by size of the period-over-period change.
- **Compare equal periods:** the day against the previous day, and against the account's 28-day average for the same objective. Never compare a partial period with a full one.
- **One action:** end with exactly one thing to do today. Everything else is supporting text.
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

Use `fetchDetailBar` with small limits. Skip a list that is empty.

1. `campaigns`: yesterday vs the day before and the 28-day average (spend, purchases, CPA, revenue, ROAS, AOV, conversion rate), plus which ads won or stopped.
2. `competitorResearches`: newest findings only (limit 1-2).
3. `alerts` and `suggestions`: critical alerts first.
4. `campaignBriefs`, `ideas`, `creatives`: only what shipped, was queued or was changed since the last report.

### Step 2: Choose the headline

- Write it as the finding itself, 8 words or fewer, with the real numbers (for example "Purchases up 18% on the Diwali gift box. One new winner.").
- Write the summary as one sentence of 30 words or fewer.

### Step 3: Build the blocks spec

Store one flat spec under `blocks`, shaped `{ root, elements }`. Root is an unstyled `Stack`. Everything is visible: no Accordions, no collapsed content. Keep it scannable on a phone.

**Sections, in this order (omit any the data can't support):**

1. **Headline:** an h1 with the finding, then a caption: date covered, brand, objective.
2. **01 Numbers:** a Table with columns Metric, Yesterday, vs Prior Day, vs 28-Day Avg. Rows: spend, purchases, CPA, revenue, ROAS, AOV, conversion rate. Use the account's objective metrics. Write "n/a" where there is no baseline.
3. **02 Winners & Stops:** a Table with columns Signal, Ad, Evidence. Signals: `New winner`, `Stopped`. Evidence is the numbers (for example "CPA ₹298 vs ₹690 in set").
4. **03 Competitor moves:** a Table with columns Signal, Advertiser, Move. Signals: `Potential winner`, `Price cut`, `New launch`. Use only verified findings from the newest research.
5. **04 Actions applied:** a Table with columns Change, Ad, Result so far. Include only changes visible in campaign data. Omit if none.
6. **05 Do today:** one dark Card: eyebrow is the action type, title is the action (4 words or fewer), description is the reason with its estimate and basis. No button.
7. **Basis caption:** one Text caption stating what each comparison used.

### Step 4: Save with `updateDailyReport`

- If validation fails, fix the spec and retry.
- Quote the exact report URL the tool returns. Never build one yourself.

## Reference example

One-shot example of a high-quality `blocks` spec. Borrow the structure, density and brevity, and adapt the rows to the data. Don't copy its content. All names and numbers are illustrative.

```json
{
  "root": "page",
  "elements": {
    "page": {
      "type": "Stack",
      "props": {},
      "children": [
        "title",
        "scope",
        "n_h",
        "n_table",
        "w_h",
        "w_table",
        "c_h",
        "c_table",
        "a_h",
        "a_table",
        "d_h",
        "d_card",
        "basis"
      ]
    },

    "title": {
      "type": "Heading",
      "props": { "text": "Purchases Up 18% On Gift Box", "level": "h1" }
    },
    "scope": {
      "type": "Text",
      "props": {
        "text": "Daily report · Covers Tue 18 Nov · Oil & Co. · Sales",
        "variant": "caption"
      }
    },

    "n_h": {
      "type": "Heading",
      "props": { "text": "01 · Numbers", "level": "h2" }
    },
    "n_table": {
      "type": "Table",
      "props": {
        "columns": ["Metric", "Tue 18", "Vs Mon 17", "Vs 28-Day"],
        "rows": [
          ["Spend", "₹21,400", "+6%", "n/a"],
          ["Purchases", "52", "+18%", "n/a"],
          ["CPA", "₹412", "-10%", "₹610 · better"],
          ["Revenue", "₹66,300", "+21%", "n/a"],
          ["ROAS", "3.1", "2.7 → 3.1", "2.4 · better"],
          ["AOV", "₹1,275", "+2%", "₹1,190"],
          ["Conv. rate", "2.4%", "+0.3 pts", "2.1%"]
        ]
      }
    },

    "w_h": {
      "type": "Heading",
      "props": { "text": "02 · Winners & Stops", "level": "h2" }
    },
    "w_table": {
      "type": "Table",
      "props": {
        "columns": ["Signal", "Ad", "Evidence"],
        "rows": [
          ["New winner", "UGC_unboxing_v3", "CPA ₹298 vs ₹690; 21 of 52"],
          ["Stopped", "static_shelf_v1", "₹2,100 spent, 0 purchases"]
        ]
      }
    },

    "c_h": {
      "type": "Heading",
      "props": { "text": "03 · Competitor Moves", "level": "h2" }
    },
    "c_table": {
      "type": "Table",
      "props": {
        "columns": ["Signal", "Advertiser", "Move"],
        "rows": [
          ["Potential winner", "Mill & Mortar", "Founder video, day 5, #3"],
          ["Price cut", "Kolhu Fresh", "A2 ghee ₹1,149, was ₹1,299"],
          ["New launch", "Ghani Gold", "3 freshness videos launched"]
        ]
      }
    },

    "a_h": {
      "type": "Heading",
      "props": { "text": "04 · Actions Applied", "level": "h2" }
    },
    "a_table": {
      "type": "Table",
      "props": {
        "columns": ["Change", "Ad", "Result so far"],
        "rows": [["+20% budget", "price_reveal_v2", "+6 purchases at ₹388"]]
      }
    },

    "d_h": {
      "type": "Heading",
      "props": { "text": "05 · Do Today", "level": "h2" }
    },
    "d_card": {
      "type": "Card",
      "props": {
        "variant": "dark",
        "eyebrow": "Multiply Variants",
        "title": "Make 4 Unboxing Variants",
        "description": "Estimate ≈145 purchases a week; videos usually tire in 2–3 weeks."
      }
    },

    "basis": {
      "type": "Text",
      "props": {
        "text": "Vs Mon 17 and 28-day Sales average. Competitor signals are days live and rank.",
        "variant": "caption"
      }
    }
  }
}
```

## Before saving

- Every number traces to a tool result; every estimate is labelled with its basis.
- Headline is the biggest change (or the critical alert), 8 words or fewer.
- Exactly one action; no buttons, links, accordions or task list.
- Quiet day: one line, no table.
- JSON valid, element IDs unique, child references resolve.
