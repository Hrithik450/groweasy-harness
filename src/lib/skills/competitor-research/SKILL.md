---
name: competitor-research
description: "Senior competitive-intelligence strategist that researches tracked rivals and category/product phrases in Meta Ad Library and delivers a deterministic, evidence-backed competitor snapshot."
---

## Rules

- **Grounded in public ad data:** Use `searchAdLibrary` for every claim. Never fabricate competitor names, copy, impressions, or results. If something cannot be verified, omit it.
- **8–10 live ads is the sweet spot:** Never dump more. Curate the most relevant live ads in the requested format; if format is unspecified, mix video and image equally. Every curated ad must appear as its own card in Section 04 — all 8–10, never only few or top ones.
- **Remake structure, never assets:** Extract angle, opening hook, visual pacing, offer framing, and proof device so the brand can remake the concept with its own assets.
- **Impressions are pre-sorted:** Meta does not return impression counts. `searchAdLibrary` returns ads by top impressions descending; treat that order as the ranking signal.

## Clarifications

- If the user asks for static or video, curate strictly to that format. If unspecified, mix the best-performing formats.

## Research Objective

- In a research you need to do all the below objective's, do not ask for the user to do any spcific objective, unless they only say it. If not do all the below objective's.

1. **Find new keywords for our brand.**
   Goal: find keywords and search terms we should know about, using two sources:
   - Keywords our existing competitors are using.
   - Keywords used by other advertisers in our category, even if they are not on our competitor list. If competitors aren't using a keyword but someone else is, still include it and consider them as new competitor.

   Sort what you find into three groups so the user sees the whole picture, not only the good ones:
   - **Working / trending**: rising in use, ads running for a long time, being scaled.
   - **Not working**: advertisers tried it and dropped it, or the ads are short-lived. This tells us what to avoid.
   - **Gaps**: used by others, not by us or our known competitors.

   For each keyword give: the keyword, who is using it, the signal (trending, stable or dying) and a recommendation.
   Side effect: any advertiser who shows up and is not already a known competitor is a candidate for objective 2. Flag them.

2. **Find new competitors for our brand or existing keywords.**
   Goal: find advertisers we aren't tracking yet. Work in either direction:
   - **Keywords to competitors**: take the keywords from objective 1 (or the user's existing keywords), search them, and see who is advertising on them.
   - **Competitors to keywords**: when you find a new competitor, look at which keywords it uses and send those back to objective 1.

   For each new competitor give: the name, the keywords it overlaps with, how heavy its activity is, and whether it is a direct competitor (same product, same audience) or adjacent (different product, same audience or keywords).

3. **Find new creative ideas for our brand.**
   Goal: find creative ideas we could make for our own brand. Look at the hooks, angles, offers, formats and visual styles of the best-performing ads from competitors and other advertisers, then turn them into ideas that fit our brand.

   For each idea give: the idea, the reference ads it comes from, why it seems to work, and how to adapt it for our brand without copying it.

## Guardrails

- **Direct competitors only:** Same problem, or a related problem, for an offering a customer compares side-by-side.
- **No aggregators or directories:** Exclude G2, Capterra, Trustpilot, Yelp, Justdial, IndiaMART, Sulekha, blogs, and agencies.
- **No generic conglomerates:** Exclude Amazon, Google, Meta, Tata, Reliance unless a dedicated product line competes in this niche.
- **Zero technical exposition:** Never mention tool names, scraping limits, or retries in user-facing output.

## Execution Workflow

### Step 1: Load existing context

- `fetchBusinessProfile`: existing competitors with recent ad's and keywords phrases.
- `fetchDetailBar` with field `competitorResearches`: recent researches made, so the same ads are not surfaced twice.
- `fetchDetailBar` with field `ideas` (all, paged): the existing idea backlog, so new ideas do not repeat a title, hook, or core angle.
- Meta ad account/campaign/ad tools: the brand's existing creatives.
- Track existing competitor names and domains to prevent duplicates.

### Step 2: Search Meta Ad Library

- Use `searchAdLibrary` to find competitor ads. Date range defaults to the last 30 days; override only when the task calls for it.
- Good starting points:
  1. Tracked competitors by official name and domain combine with keywords phrases.
  2. `broadPhrases` for category rivals.
  3. `productOrServicePhrases` for specific active offers.
- These are starting points, not limits. Use your judgment: try any keywords, related brands, adjacent categories, or angles you think could surface competitors or their ads. Search the wider internet too if it helps. Keep exploring until you have a complete picture.

### Step 3: Categorize the sample

- `long_running_winner`: active ≥ 30 consecutive days and top-impression ranked. Proven evergreen; safe to adapt.
- `potential_winner`: launched within 14 days and already high in the impression-ranked sample. Early breakout.
- `scaling_creative`: ≥ 3 active variations for ≥ 14 days. A winning combination being scaled.
- Discard short-lived tests, inactive noise, and irrelevant ads. The ads that remain are the curated set (8–10); every one of them gets its own card in Section 04.

### Step 4: Build the UI report

Use only `<ui-block>` components, never a long text report. Root must be a Stack. Respect component word limits. Style only through variants, sizes and levels.

The reference example is the required output bar, not inspiration. Match its section order, component mapping, variants and density exactly. You may only omit a section the data cannot support, or add a section built from the same patterns. Never replace it with a simpler, shorter or more compact report.

---

#### 4a. Study the reference before you build

The reference example at the end of this step is the required bar. Before mapping any data, study how it is built and match its section order, component mapping, variants, spacing and density exactly. Do not substitute a simpler or more compact layout. Absorb these rules:

1. **Page rhythm.** An `h1` verdict and a one-row scope Table come first. After that, every section is its own Card stacked vertically. Sections never sit side by side.
2. **One section header pattern, always.** Each section Card starts with a horizontal Stack: on the left, an accent Eyebrow number (`01`, `02`… size `sm`) next to an `h1` Heading. Then a horizontal Separator. Never skip the Separator.
3. **Color roles are fixed.**
   - `dark` = emphasis and summary. Use it for the opening findings block, proof and quote blocks, and table headers that lead the data.
   - `accent` (orange) = the single most important thing in a section: the recommendation, the top gap, HIGH threat, an OPEN angle. Use one accent focal point per section at most. Never make a whole section orange.
   - `light` = the default surface for every section and most inner Cards.
   - `muted` = quiet supporting notes, such as weak spots, caveats and LOW threat.
4. **Badge meaning is fixed.** Threat: HIGH `accent`, MEDIUM `dark`, LOW `muted`. Space: OPEN `accent`, BUSY `muted`, CROWDED `dark`. Use the same mapping everywhere in the report.
5. **Type hierarchy uses components, not styling.**
   - `h1` for the page verdict, section titles, competitor names, gap titles and "The move".
   - `h2` for play names; `h3` for quoted ad hooks; `h6` for hook rows.
   - Eyebrow `xl` for big numbers (stats, finding and play numbers); Eyebrow `sm` for labels.
   - Text `lg` for findings; `sm` for body copy; `xs` uppercase for meta, evidence and footers.
6. **Label-then-value pairs.** Every fact is a muted Eyebrow label stacked over a `sm` Text value (Main angle / Offer, Format / Audience / Reads). Never write "Label: value" in one Text.
7. **Layout grids.**
   - 3 columns for groups of three (findings, gaps).
   - 4 columns for stat tiles.
   - 2 columns for paired facts or paired panels.
   - `spans` for asymmetric rows: media + body `[1,2]`, or `[2,1]` to put the media on the right.
   - An action Card wrapping a 6-column `[1,2,2,1]` grid for play rows, with one Button in the last column; never selectable.
8. **Alternate media sides.** In competitor rows, put the media left on odd rows and right on even rows. Use Video for video ads and Image for static ads, with their real aspect ratio. The media slot holds only the creative; all text goes in the body column. **`src` is the exact `Media:` URL the `searchAdLibrary` result listed for that ad (`/api/attachments/…`) — copy it verbatim. Never write facebook.com, fbcdn.net, or any other external media URL; if an ad has no Media URL, it has no renderable media — say so in the card body instead of inventing a source.**
9. **Tables carry comparisons.** Use a Table whenever three or more items share the same attributes. Use `{ text, badge }` cells for status, `{ mark: true/false }` for uses / doesn't use, and `highlightRows` for the user's own brand row.
10. **Share data uses ProgressBar rows.** Use one ProgressBar per bucket; the buckets add up to 100% and reconcile with the ads counted. Use `dark` for most bars, `accent` for the bucket that matters most, and `grey` for the smallest.
11. **Short copy, quoted hooks.** Competitor hooks are their exact words in curly quotes. Our proposals are original wording. Headings are short statements, not questions. No hype words, no emoji.
12. **Density.** Section meta lines in uppercase, one idea per Text, and no paragraphs longer than the Text word limit. If something needs more words, it needs another component.
13. **Cards are choices or actions, never both.** A compact choice card may set `selectable: true` and must contain no Button child. An action surface composes a Button child and must never set `selectable`. Cards submit directly, Pressing a card's Button sends that action immediately; selecting a compact card never submits by itself.
14. **Only Chips are selectable for multi-select.** Chips must sit first or last in their parent, with one SubmitBar beside them. If Chips would fall mid-content, place an inline Button instead.
15. **Every ad card shows its category.** Before the proof/hook Card, add a muted Eyebrow with the Step 3 category: `LONG-RUNNING WINNER`, `POTENTIAL WINNER`, or `SCALING CREATIVE`. If an ad fits none, write `SIGNAL`; never invent a winner.

---

#### 4b. Recommended sections (a menu, not a script)

These are the sections that make a strong competitor report. The reference order is the default and must be followed unless the user's question clearly requires a reorder. You may omit a section the data cannot support, rename it, or add a same-pattern section; you may not downgrade the structure, components or density:

- **Skip** any section the data can't support. An empty or padded section is worse than no section.
- **Reorder** sections to fit the question. For example, put Offers & pricing second if the user asked about pricing.
- **Rename** section titles to match the question. Keep the numbered header pattern.
- **Add** a section the query needs, if you build it with the same patterns from 4a.
- Never invent data to fill a section. If evidence is thin, say so in an `xs` Text or an Alert.

| Section               | Use when                                         | Built from                                                                                                                                                                  |
| --------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verdict + scope       | Always                                           | `h1` finding + one-row Table (Searched, Market, Sources, Window, Prepared)                                                                                                  |
| The short version     | Always                                           | Dark Card: 3 dark finding Cards (number, finding, evidence) + an accent "The move" Card                                                                                     |
| Market at a glance    | 5+ advertisers or 20+ ads                        | 4 stat Cards (label, big value, note)                                                                                                                                       |
| Who's advertising     | 2+ competitors                                   | Table sorted by threat, threat badges                                                                                                                                       |
| Competitors, up close | A proven ad exists for a competitor              | One Card for **every curated ad (all 8–10)**: media + body (meta + threat badge, name, category Eyebrow, dark proof Card with hook, angle/offer pair, muted weak-spot Card) |
| Angle map             | 3+ angles across 3+ brands                       | Table with mark cells + Space badge column                                                                                                                                  |
| Creative patterns     | Enough ads to show a split                       | ProgressBar format share + repeated hooks with counts + top CTA                                                                                                             |
| Offers & pricing      | Prices or offers are visible                     | Table with the user's row highlighted (placeholders if unknown)                                                                                                             |
| Gaps to own           | Always, when there is at least one evidenced gap | 3-column gap Cards; the strongest is `accent`                                                                                                                               |
| Recommended plays     | Always                                           | Action Cards (never selectable): number, name + line, Format / Audience / Reads, plus a Button in each card. No SubmitBar.                                                  |

**Adapt to the query type:**

- **Phrase or category search** (for example "cold-pressed oil"): the full flow above fits best.
- **One named competitor:** skip Who's advertising and the Angle map. Expand Competitors, up close to every curated ad (up to 8–10), then Gaps and Plays.
- **Us vs. a named rival:** lead with a comparison Table (Compare, Them, Us) after the short version, then Gaps and Plays.
- **Quick check or very few ads:** verdict, short version, one table, plays. Nothing more.

---

**Never include:** links to ads, a media gallery, class names, raw hex colors, or sections padded with guessed data.

**Before delivery:**

- Every ad ID is unique.
- Table counts and ProgressBar percentages reconcile with the records.
- Claims are attributed to the advertiser, and there are no unverified performance claims.
- The JSON is valid, with unique element IDs and correct child references.

### Reference example

Below is one high-quality competitor report built from a phrase search. It is the **required output standard**, not inspiration. Your report must match its section order, component mapping, variants, spacing and density exactly. Only omit a section the data cannot support, or add a section built from the same patterns. Never produce a simpler, shorter or more compact version. Do **not** copy its content. All names, numbers and URLs are illustrative. **The example shows two competitor cards only to keep the file readable: real output must include one card for every curated ad (8–10), never just the top few.**

<ui-block>
{
  "root": "root",
  "elements": {
    "root": {"type": "Stack", "props": {"direction": "vertical", "gap": "md", "align": "stretch", "justify": "start"}, "children": ["title", "scope", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"]},
    "title": {"type": "Heading", "props": {"text": "Freshness is the open angle in cold-pressed oil.", "level": "h1"}},
    "scope": {"type": "Table", "props": {"variant": "light", "headerVariant": "light", "columns": ["Searched", "Market", "Sources", "Window", "Prepared"], "rows": [["Phrase · 4 terms", "India · focus Bangalore", "Meta Ad Library + web", "Last 30 days", "22 Nov 2026 · Ad Strategist"]]}},
    "s1": {"type": "Card", "props": {"variant": "dark"}, "children": ["s1-header", "s1-div", "s1-findings", "s1-move"]},
    "s1-header": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "baseline", "justify": "start"}, "children": ["s1-eyebrow", "s1-heading"]},
    "s1-eyebrow": {"type": "Eyebrow", "props": {"text": "01", "size": "sm", "variant": "accent"}},
    "s1-heading": {"type": "Heading", "props": {"text": "The short version", "level": "h1"}},
    "s1-div": {"type": "Separator", "props": {"orientation": "horizontal"}},
    "s1-findings": {"type": "Grid", "props": {"columns": 3}, "children": ["s1-f1", "s1-f2", "s1-f3"]},
    "s1-f1": {"type": "Card", "props": {"variant": "dark"}, "children": ["s1-f1-s"]},
    "s1-f1-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["s1-f1-e", "s1-f1-t", "s1-f1-ev"]},
    "s1-f1-e": {"type": "Eyebrow", "props": {"text": "01", "size": "xl", "variant": "accent"}},
    "s1-f1-t": {"type": "Text", "props": {"text": "Purity is crowded: 9 of 12 advertisers lead with “no chemicals”.", "size": "lg", "variant": "light"}},
    "s1-f1-ev": {"type": "Text", "props": {"text": "EVIDENCE · 96 OF 148 ADS", "size": "xs", "variant": "light"}},
    "s1-f2": {"type": "Card", "props": {"variant": "dark"}, "children": ["s1-f2-s"]},
    "s1-f2-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["s1-f2-e", "s1-f2-t", "s1-f2-ev"]},
    "s1-f2-e": {"type": "Eyebrow", "props": {"text": "02", "size": "xl", "variant": "accent"}},
    "s1-f2-t": {"type": "Text", "props": {"text": "Ghani Gold’s UGC unboxing video has run 64 days — the clearest proven ad.", "size": "lg", "variant": "light"}},
    "s1-f2-ev": {"type": "Text", "props": {"text": "EVIDENCE · LONGEST ACTIVE AD", "size": "xs", "variant": "light"}},
    "s1-f3": {"type": "Card", "props": {"variant": "dark"}, "children": ["s1-f3-s"]},
    "s1-f3-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["s1-f3-e", "s1-f3-t", "s1-f3-ev"]},
    "s1-f3-e": {"type": "Eyebrow", "props": {"text": "03", "size": "xl", "variant": "accent"}},
    "s1-f3-t": {"type": "Text", "props": {"text": "Nobody shows freshness or targets Bangalore by area. Both are open.", "size": "lg", "variant": "light"}},
    "s1-f3-ev": {"type": "Text", "props": {"text": "EVIDENCE · 0 OF 148 ADS", "size": "xs", "variant": "light"}},
    "s1-move": {"type": "Card", "props": {"variant": "accent"}, "children": ["s1-move-s"]},
    "s1-move-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["s1-move-e", "s1-move-h"]},
    "s1-move-e": {"type": "Eyebrow", "props": {"text": "The move", "size": "sm"}},
    "s1-move-h": {"type": "Heading", "props": {"text": "Lead with freshness — “Pressed Monday, at your door Wednesday” — in UGC video, targeted to Bangalore by area.", "level": "h1"}},
    "s2": {"type": "Card", "props": {"variant": "light"}, "children": ["s2-header", "s2-div", "s2-grid"]},
    "s2-header": {"type": "Stack", "props": {"direction": "horizontal", "gap": "md", "align": "baseline", "justify": "between"}, "children": ["s2-title", "s2-meta"]},
    "s2-title": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "baseline", "justify": "start"}, "children": ["s2-eyebrow", "s2-heading"]},
    "s2-eyebrow": {"type": "Eyebrow", "props": {"text": "02", "size": "sm", "variant": "accent"}},
    "s2-heading": {"type": "Heading", "props": {"text": "Market at a glance", "level": "h1"}},
    "s2-meta": {"type": "Text", "props": {"text": "ACTIVE ON META · LAST 30 DAYS", "size": "xs"}},
    "s2-div": {"type": "Separator", "props": {"orientation": "horizontal"}},
    "s2-grid": {"type": "Grid", "props": {"columns": 4}, "children": ["s2-1", "s2-2", "s2-3", "s2-4"]},
    "s2-1": {"type": "Card", "props": {"variant": "light"}, "children": ["s2-1-s"]},
    "s2-1-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["s2-1-l", "s2-1-v", "s2-1-t"]},
    "s2-1-l": {"type": "Eyebrow", "props": {"text": "Advertisers", "size": "sm", "variant": "muted"}},
    "s2-1-v": {"type": "Eyebrow", "props": {"text": "12", "size": "xl", "variant": "foreground"}},
    "s2-1-t": {"type": "Text", "props": {"text": "5 with 9+ active ads", "size": "xs"}},
    "s2-2": {"type": "Card", "props": {"variant": "light"}, "children": ["s2-2-s"]},
    "s2-2-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["s2-2-l", "s2-2-v", "s2-2-t"]},
    "s2-2-l": {"type": "Eyebrow", "props": {"text": "Active ads", "size": "sm", "variant": "muted"}},
    "s2-2-v": {"type": "Eyebrow", "props": {"text": "148", "size": "xl", "variant": "foreground"}},
    "s2-2-t": {"type": "Text", "props": {"text": "Across Facebook and Instagram", "size": "xs"}},
    "s2-3": {"type": "Card", "props": {"variant": "light"}, "children": ["s2-3-s"]},
    "s2-3-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["s2-3-l", "s2-3-v", "s2-3-t"]},
    "s2-3-l": {"type": "Eyebrow", "props": {"text": "New this week", "size": "sm", "variant": "muted"}},
    "s2-3-v": {"type": "Eyebrow", "props": {"text": "31", "size": "xl", "variant": "foreground"}},
    "s2-3-t": {"type": "Text", "props": {"text": "Chekku House launched 11", "size": "xs"}},
    "s2-4": {"type": "Card", "props": {"variant": "light"}, "children": ["s2-4-s"]},
    "s2-4-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["s2-4-l", "s2-4-v", "s2-4-t"]},
    "s2-4-l": {"type": "Eyebrow", "props": {"text": "Video share", "size": "sm", "variant": "muted"}},
    "s2-4-v": {"type": "Eyebrow", "props": {"text": "58%", "size": "xl", "variant": "foreground"}},
    "s2-4-t": {"type": "Text", "props": {"text": "UGC and founder video lead", "size": "xs"}},
    "s3": {"type": "Card", "props": {"variant": "light"}, "children": ["s3-header", "s3-div", "s3-table"]},
    "s3-header": {"type": "Stack", "props": {"direction": "horizontal", "gap": "md", "align": "baseline", "justify": "between"}, "children": ["s3-title", "s3-meta"]},
    "s3-title": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "baseline", "justify": "start"}, "children": ["s3-eyebrow", "s3-heading"]},
    "s3-eyebrow": {"type": "Eyebrow", "props": {"text": "03", "size": "sm", "variant": "accent"}},
    "s3-heading": {"type": "Heading", "props": {"text": "Who's advertising", "level": "h1"}},
    "s3-meta": {"type": "Text", "props": {"text": "SORTED BY THREAT · THEN ACTIVE ADS", "size": "xs"}},
    "s3-div": {"type": "Separator", "props": {"orientation": "horizontal"}},
    "s3-table": {"type": "Table", "props": {"variant": "light", "headerVariant": "dark", "columns": ["Competitor", "Active ads", "New · 7d", "Longest run", "Main angle", "Top format", "Offer", "Threat"], "rows": [["Ghani Gold Oils", "42", "9", "64 d", "Purity, no chemicals", "UGC video", "20% off combos", {"text": "HIGH", "badge": "accent"}], ["PureDrop Naturals", "31", "6", "41 d", "Heart health", "Price-led static", "₹199 trial bottle", {"text": "HIGH", "badge": "accent"}], ["Chekku House", "24", "11", "22 d", "Traditional wooden press", "Process B-roll", "Festive combo ₹899", {"text": "MEDIUM", "badge": "dark"}]]}},
    "s4": {"type": "Card", "props": {"variant": "light"}, "children": ["s4-header", "s4-div", "s4-list"]},
    "s4-header": {"type": "Stack", "props": {"direction": "horizontal", "gap": "md", "align": "baseline", "justify": "between"}, "children": ["s4-title", "s4-meta"]},
    "s4-title": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "baseline", "justify": "start"}, "children": ["s4-eyebrow", "s4-heading"]},
    "s4-eyebrow": {"type": "Eyebrow", "props": {"text": "04", "size": "sm", "variant": "accent"}},
    "s4-heading": {"type": "Heading", "props": {"text": "Competitors, up close", "level": "h1"}},
    "s4-meta": {"type": "Text", "props": {"text": "ONE PER COMPETITOR · THEIR BEST AD · WHAT IT TELLS US", "size": "xs"}},
    "s4-div": {"type": "Separator", "props": {"orientation": "horizontal"}},
    "s4-list": {"type": "Stack", "props": {"direction": "vertical", "gap": "md", "align": "stretch", "justify": "start"}, "children": ["c1", "c2"]},
    "c1": {"type": "Card", "props": {"variant": "light"}, "children": ["c1-grid"]},
    "c1-grid": {"type": "Grid", "props": {"columns": 3, "spans": [{"colSpan": 1}, {"colSpan": 2}]}, "children": ["c1-media", "c1-body"]},
    "c1-media": {"type": "Video", "props": {"src": "https://ads.example.com/ghani-ugc.mp4", "title": "Ghani Gold UGC ad", "aspectRatio": "9/16"}},
    "c1-body": {"type": "Stack", "props": {"direction": "vertical", "gap": "md", "align": "stretch", "justify": "start"}, "children": ["c1-top", "c1-name", "c1-signal", "c1-proof", "c1-facts", "c1-weak"]},
    "c1-top": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "center", "justify": "between"}, "children": ["c1-meta", "c1-badge"]},
    "c1-meta": {"type": "Eyebrow", "props": {"text": "01 · 42 ACTIVE ADS · 9 NEW THIS WEEK", "size": "sm", "variant": "muted"}},
    "c1-badge": {"type": "Badge", "props": {"text": "HIGH", "variant": "accent"}},
    "c1-name": {"type": "Heading", "props": {"text": "Ghani Gold Oils", "level": "h1"}},
    "c1-signal": {"type": "Eyebrow", "props": {"text": "LONG-RUNNING WINNER", "size": "sm", "variant": "muted"}},
    "c1-proof": {"type": "Card", "props": {"variant": "dark"}, "children": ["c1-proof-s"]},
    "c1-proof-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["c1-proof-meta", "c1-proof-quote", "c1-proof-foot"]},
    "c1-proof-meta": {"type": "Eyebrow", "props": {"text": "PROVEN AD · RUNNING 64 DAYS", "size": "sm"}},
    "c1-proof-quote": {"type": "Heading", "props": {"text": "“I opened it and smelled the seeds — that’s how you know.”", "level": "h3"}},
    "c1-proof-foot": {"type": "Text", "props": {"text": "UGC VIDEO · 6:14 · 8:28", "size": "xs", "variant": "light"}},
    "c1-facts": {"type": "Grid", "props": {"columns": 2}, "children": ["c1-angle", "c1-offer"]},
    "c1-angle": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["c1-angle-h", "c1-angle-t"]},
    "c1-angle-h": {"type": "Eyebrow", "props": {"text": "Main angle", "size": "sm", "variant": "muted"}},
    "c1-angle-t": {"type": "Text", "props": {"text": "Purity, no chemicals", "size": "sm"}},
    "c1-offer": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["c1-offer-h", "c1-offer-t"]},
    "c1-offer-h": {"type": "Eyebrow", "props": {"text": "Offer", "size": "sm", "variant": "muted"}},
    "c1-offer-t": {"type": "Text", "props": {"text": "20% off 3-bottle combos", "size": "sm"}},
    "c1-weak": {"type": "Card", "props": {"variant": "muted"}, "children": ["c1-weak-s"]},
    "c1-weak-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["c1-weak-h", "c1-weak-t"]},
    "c1-weak-h": {"type": "Eyebrow", "props": {"text": "Weak spot · your opening", "size": "sm", "variant": "muted"}},
    "c1-weak-t": {"type": "Text", "props": {"text": "Never says when the oil was pressed.", "size": "sm"}},
    "c2": {"type": "Card", "props": {"variant": "light"}, "children": ["c2-grid"]},
    "c2-grid": {"type": "Grid", "props": {"columns": 3, "spans": [{"colSpan": 2}, {"colSpan": 1}]}, "children": ["c2-body", "c2-media"]},
    "c2-media": {"type": "Image", "props": {"src": "https://ads.example.com/puredrop-price.jpg", "aspectRatio": "9/16", "fit": "cover", "alt": "PureDrop price card"}},
    "c2-body": {"type": "Stack", "props": {"direction": "vertical", "gap": "md", "align": "stretch", "justify": "start"}, "children": ["c2-top", "c2-name", "c2-signal", "c2-proof", "c2-facts", "c2-weak"]},
    "c2-top": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "center", "justify": "between"}, "children": ["c2-meta", "c2-badge"]},
    "c2-meta": {"type": "Eyebrow", "props": {"text": "02 · 31 ACTIVE ADS · 6 NEW THIS WEEK", "size": "sm", "variant": "muted"}},
    "c2-badge": {"type": "Badge", "props": {"text": "HIGH", "variant": "accent"}},
    "c2-name": {"type": "Heading", "props": {"text": "PureDrop Naturals", "level": "h1"}},
    "c2-signal": {"type": "Eyebrow", "props": {"text": "LONG-RUNNING WINNER", "size": "sm", "variant": "muted"}},
    "c2-proof": {"type": "Card", "props": {"variant": "dark"}, "children": ["c2-proof-s"]},
    "c2-proof-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["c2-proof-meta", "c2-proof-quote", "c2-proof-foot"]},
    "c2-proof-meta": {"type": "Eyebrow", "props": {"text": "PROVEN AD · RUNNING 41 DAYS", "size": "sm"}},
    "c2-proof-quote": {"type": "Heading", "props": {"text": "“Try it for ₹199. If you don’t taste the difference, don’t reorder.”", "level": "h3"}},
    "c2-proof-foot": {"type": "Text", "props": {"text": "STATIC IMAGE · 1:1 · PRICE CARD", "size": "xs", "variant": "light"}},
    "c2-facts": {"type": "Grid", "props": {"columns": 2}, "children": ["c2-angle", "c2-offer"]},
    "c2-angle": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["c2-angle-h", "c2-angle-t"]},
    "c2-angle-h": {"type": "Eyebrow", "props": {"text": "Main angle", "size": "sm", "variant": "muted"}},
    "c2-angle-t": {"type": "Text", "props": {"text": "Heart health", "size": "sm"}},
    "c2-offer": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["c2-offer-h", "c2-offer-t"]},
    "c2-offer-h": {"type": "Eyebrow", "props": {"text": "Offer", "size": "sm", "variant": "muted"}},
    "c2-offer-t": {"type": "Text", "props": {"text": "₹199 trial bottle, 500 ml", "size": "sm"}},
    "c2-weak": {"type": "Card", "props": {"variant": "muted"}, "children": ["c2-weak-s"]},
    "c2-weak-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["c2-weak-h", "c2-weak-t"]},
    "c2-weak-h": {"type": "Eyebrow", "props": {"text": "Weak spot · your opening", "size": "sm", "variant": "muted"}},
    "c2-weak-t": {"type": "Text", "props": {"text": "Generic visuals; no story or origin.", "size": "sm"}},
    "s5": {"type": "Card", "props": {"variant": "light"}, "children": ["s5-header", "s5-div", "s5-table"]},
    "s5-header": {"type": "Stack", "props": {"direction": "horizontal", "gap": "md", "align": "baseline", "justify": "between"}, "children": ["s5-title", "s5-meta"]},
    "s5-title": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "baseline", "justify": "start"}, "children": ["s5-eyebrow", "s5-heading"]},
    "s5-eyebrow": {"type": "Eyebrow", "props": {"text": "05", "size": "sm", "variant": "accent"}},
    "s5-heading": {"type": "Heading", "props": {"text": "Angle map", "level": "h1"}},
    "s5-meta": {"type": "Text", "props": {"text": "■ USES IT · □ DOESN'T", "size": "xs"}},
    "s5-div": {"type": "Separator", "props": {"orientation": "horizontal"}},
    "s5-table": {"type": "Table", "props": {"variant": "light", "headerVariant": "light", "columns": ["Angle", "Ghani Gold", "PureDrop", "Chekku House", "Space"], "rows": [["Purity, no chemicals", {"mark": true}, {"mark": true}, {"mark": true}, {"text": "CROWDED", "badge": "dark"}], ["Traditional press", {"mark": true}, {"mark": false}, {"mark": true}, {"text": "BUSY", "badge": "muted"}], ["Freshness · press date", {"mark": false}, {"mark": false}, {"mark": false}, {"text": "OPEN", "badge": "accent"}]]}},
    "s6": {"type": "Card", "props": {"variant": "light"}, "children": ["s6-header", "s6-div", "s6-grid"]},
    "s6-header": {"type": "Stack", "props": {"direction": "horizontal", "gap": "md", "align": "baseline", "justify": "between"}, "children": ["s6-title", "s6-meta"]},
    "s6-title": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "baseline", "justify": "start"}, "children": ["s6-eyebrow", "s6-heading"]},
    "s6-eyebrow": {"type": "Eyebrow", "props": {"text": "06", "size": "sm", "variant": "accent"}},
    "s6-heading": {"type": "Heading", "props": {"text": "Creative patterns", "level": "h1"}},
    "s6-meta": {"type": "Text", "props": {"text": "ACROSS ALL 148 ACTIVE ADS", "size": "xs"}},
    "s6-div": {"type": "Separator", "props": {"orientation": "horizontal"}},
    "s6-grid": {"type": "Grid", "props": {"columns": 2}, "children": ["s6-format", "s6-hooks"]},
    "s6-format": {"type": "Card", "props": {"variant": "light"}, "children": ["s6-format-s"]},
    "s6-format-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "md", "align": "stretch", "justify": "start"}, "children": ["s6-format-l", "s6-b1", "s6-b2", "s6-b3", "s6-b4"]},
    "s6-format-l": {"type": "Eyebrow", "props": {"text": "Format share", "size": "sm", "variant": "muted"}},
    "s6-b1": {"type": "ProgressBar", "props": {"label": "UGC & founder video", "value": 38, "color": "dark"}},
    "s6-b2": {"type": "ProgressBar", "props": {"label": "Price-led static", "value": 27, "color": "accent"}},
    "s6-b3": {"type": "ProgressBar", "props": {"label": "Process B-roll", "value": 20, "color": "dark"}},
    "s6-b4": {"type": "ProgressBar", "props": {"label": "Carousel", "value": 15, "color": "grey"}},
    "s6-hooks": {"type": "Card", "props": {"variant": "light"}, "children": ["s6-hooks-s"]},
    "s6-hooks-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["s6-hooks-l", "s6-h1", "s6-h1d", "s6-h2", "s6-h2d", "s6-h3", "s6-h3d", "s6-hooks-cta"]},
    "s6-hooks-l": {"type": "Eyebrow", "props": {"text": "Hooks that repeat", "size": "sm", "variant": "muted"}},
    "s6-h1": {"type": "Heading", "props": {"text": "“Is your oil really pure?”", "level": "h6"}},
    "s6-h1d": {"type": "Text", "props": {"text": "23 ads", "size": "sm"}},
    "s6-h2": {"type": "Heading", "props": {"text": "“Watch how it’s pressed”", "level": "h6"}},
    "s6-h2d": {"type": "Text", "props": {"text": "17 ads", "size": "sm"}},
    "s6-h3": {"type": "Heading", "props": {"text": "“Just like grandma’s kitchen”", "level": "h6"}},
    "s6-h3d": {"type": "Text", "props": {"text": "12 ads", "size": "sm"}},
    "s6-hooks-cta": {"type": "Text", "props": {"text": "MOST-USED CTA · SHOP NOW (73%)", "size": "xs"}},
    "s7": {"type": "Card", "props": {"variant": "light"}, "children": ["s7-header", "s7-div", "s7-table"]},
    "s7-header": {"type": "Stack", "props": {"direction": "horizontal", "gap": "md", "align": "baseline", "justify": "between"}, "children": ["s7-title", "s7-meta"]},
    "s7-title": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "baseline", "justify": "start"}, "children": ["s7-eyebrow", "s7-heading"]},
    "s7-eyebrow": {"type": "Eyebrow", "props": {"text": "07", "size": "sm", "variant": "accent"}},
    "s7-heading": {"type": "Heading", "props": {"text": "Offers & pricing", "level": "h1"}},
    "s7-meta": {"type": "Text", "props": {"text": "FROM ADS AND LANDING PAGES", "size": "xs"}},
    "s7-div": {"type": "Separator", "props": {"orientation": "horizontal"}},
    "s7-table": {"type": "Table", "props": {"variant": "light", "headerVariant": "light", "columns": ["Brand", "Entry price", "Discount", "Bundle", "Delivery"], "rows": [["Ghani Gold Oils", "₹749 / 1 L", "20% off combos", "3-bottle pack", "Free over ₹999"], ["PureDrop Naturals", "₹199 / 500 ml", "Trial price", "2-pack", "₹49"], ["You · Oil & Co.", "[YOUR PRICE]", "[YOUR OFFER]", "[YOUR BUNDLE]", "[YOUR DELIVERY]"]], "highlightRows": [2]}},
    "s8": {"type": "Card", "props": {"variant": "light"}, "children": ["s8-header", "s8-div", "s8-grid"]},
    "s8-header": {"type": "Stack", "props": {"direction": "horizontal", "gap": "md", "align": "baseline", "justify": "between"}, "children": ["s8-title", "s8-meta"]},
    "s8-title": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "baseline", "justify": "start"}, "children": ["s8-eyebrow", "s8-heading"]},
    "s8-eyebrow": {"type": "Eyebrow", "props": {"text": "08", "size": "sm", "variant": "accent"}},
    "s8-heading": {"type": "Heading", "props": {"text": "Gaps to own", "level": "h1"}},
    "s8-meta": {"type": "Text", "props": {"text": "WHAT NOBODY IS SAYING YET", "size": "xs"}},
    "s8-div": {"type": "Separator", "props": {"orientation": "horizontal"}},
    "s8-grid": {"type": "Grid", "props": {"columns": 3}, "children": ["g1", "g2", "g3"]},
    "g1": {"type": "Card", "props": {"variant": "accent"}, "children": ["g1-s"]},
    "g1-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["g1-top", "g1-t", "g1-b", "g1-sep", "g1-ev"]},
    "g1-top": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "baseline", "justify": "between"}, "children": ["g1-l", "g1-c"]},
    "g1-l": {"type": "Eyebrow", "props": {"text": "Gap 01", "size": "sm"}},
    "g1-c": {"type": "Text", "props": {"text": "CONFIDENCE · HIGH", "size": "xs"}},
    "g1-t": {"type": "Heading", "props": {"text": "Freshness you can see", "level": "h1"}},
    "g1-b": {"type": "Text", "props": {"text": "Everyone claims purity; nobody proves it. A press date and mill-to-door time is proof no rival shows.", "size": "sm"}},
    "g1-sep": {"type": "Separator", "props": {"orientation": "horizontal", "variant": "dark"}},
    "g1-ev": {"type": "Text", "props": {"text": "EVIDENCE · 0 OF 148 ADS MENTION A PRESS DATE", "size": "xs"}},
    "g2": {"type": "Card", "props": {"variant": "light"}, "children": ["g2-s"]},
    "g2-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["g2-top", "g2-t", "g2-b", "g2-sep", "g2-ev"]},
    "g2-top": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "baseline", "justify": "between"}, "children": ["g2-l", "g2-c"]},
    "g2-l": {"type": "Eyebrow", "props": {"text": "Gap 02", "size": "sm"}},
    "g2-c": {"type": "Text", "props": {"text": "CONFIDENCE · MEDIUM", "size": "xs"}},
    "g2-t": {"type": "Heading", "props": {"text": "Bangalore, by area", "level": "h1"}},
    "g2-b": {"type": "Text", "props": {"text": "All advertisers run India-wide copy. Area names feel local and delivery-ready.", "size": "sm"}},
    "g2-sep": {"type": "Separator", "props": {"orientation": "horizontal"}},
    "g2-ev": {"type": "Text", "props": {"text": "EVIDENCE · 0 ADVERTISERS USE CITY OR AREA COPY", "size": "xs"}},
    "g3": {"type": "Card", "props": {"variant": "light"}, "children": ["g3-s"]},
    "g3-s": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["g3-top", "g3-t", "g3-b", "g3-sep", "g3-ev"]},
    "g3-top": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "baseline", "justify": "between"}, "children": ["g3-l", "g3-c"]},
    "g3-l": {"type": "Eyebrow", "props": {"text": "Gap 03", "size": "sm"}},
    "g3-c": {"type": "Text", "props": {"text": "CONFIDENCE · MEDIUM", "size": "xs"}},
    "g3-t": {"type": "Heading", "props": {"text": "Cooking, not claims", "level": "h1"}},
    "g3-b": {"type": "Text", "props": {"text": "Ads talk about the oil, rarely about the food. Recipe-led video gives a reason to buy beyond health.", "size": "sm"}},
    "g3-sep": {"type": "Separator", "props": {"orientation": "horizontal"}},
    "g3-ev": {"type": "Text", "props": {"text": "EVIDENCE · 4 OF 148 ADS SHOW COOKING", "size": "xs"}},
    "s9": {"type": "Card", "props": {"variant": "light"}, "children": ["s9-header", "s9-div", "s9-list"]},
    "s9-header": {"type": "Stack", "props": {"direction": "horizontal", "gap": "md", "align": "baseline", "justify": "between"}, "children": ["s9-title", "s9-meta"]},
    "s9-title": {"type": "Stack", "props": {"direction": "horizontal", "gap": "sm", "align": "baseline", "justify": "start"}, "children": ["s9-eyebrow", "s9-heading"]},
    "s9-eyebrow": {"type": "Eyebrow", "props": {"text": "09", "size": "sm", "variant": "accent"}},
    "s9-heading": {"type": "Heading", "props": {"text": "Recommended plays", "level": "h1"}},
    "s9-meta": {"type": "Text", "props": {"text": "READY FOR AD CREATOR", "size": "xs"}},
    "s9-div": {"type": "Separator", "props": {"orientation": "horizontal"}},
    "s9-list": {"type": "Stack", "props": {"direction": "vertical", "gap": "md", "align": "stretch", "justify": "start"}, "children": ["p1", "p1d", "p2", "p2d", "p3"]},
    "p1": {"type": "Card", "props": {"variant": "light"}, "children": ["p1-grid"]},
    "p1-num": {"type": "Eyebrow", "props": {"text": "01", "size": "xl", "variant": "accent"}},
    "p1-main": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["p1-name", "p1-desc"]},
    "p1-name": {"type": "Heading", "props": {"text": "Pressed Monday", "level": "h2"}},
    "p1-desc": {"type": "Text", "props": {"text": "Show the press date on the bottle and the 48-hour trip to the door.", "size": "sm"}},
    "p1-meta": {"type": "Grid", "props": {"columns": 3}, "children": ["p1-fmt", "p1-aud", "p1-reads"]},
    "p1-fmt": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["p1-fmt-h", "p1-fmt-t"]},
    "p1-fmt-h": {"type": "Eyebrow", "props": {"text": "Format", "size": "sm", "variant": "muted"}},
    "p1-fmt-t": {"type": "Text", "props": {"text": "UGC video + dated static", "size": "sm"}},
    "p1-aud": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["p1-aud-h", "p1-aud-t"]},
    "p1-aud-h": {"type": "Eyebrow", "props": {"text": "Audience", "size": "sm", "variant": "muted"}},
    "p1-aud-t": {"type": "Text", "props": {"text": "Home cooks 28–50 · Bangalore", "size": "sm"}},
    "p1-reads": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["p1-reads-h", "p1-reads-t"]},
    "p1-reads-h": {"type": "Eyebrow", "props": {"text": "Reads", "size": "sm", "variant": "muted"}},
    "p1-reads-t": {"type": "Text", "props": {"text": "Ghani Gold on proof", "size": "sm"}},
    "p1d": {"type": "Separator", "props": {"orientation": "horizontal"}},
    "p2": {"type": "Card", "props": {"variant": "light"}, "children": ["p2-grid"]},
    "p2-num": {"type": "Eyebrow", "props": {"text": "02", "size": "xl", "variant": "accent"}},
    "p2-main": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["p2-name", "p2-desc"]},
    "p2-name": {"type": "Heading", "props": {"text": "Better first bottle", "level": "h2"}},
    "p2-desc": {"type": "Text", "props": {"text": "A ₹200 ml starter with free Bangalore delivery to answer the ₹199 trial.", "size": "sm"}},
    "p2-meta": {"type": "Grid", "props": {"columns": 3}, "children": ["p2-fmt", "p2-aud", "p2-reads"]},
    "p2-fmt": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["p2-fmt-h", "p2-fmt-t"]},
    "p2-fmt-h": {"type": "Eyebrow", "props": {"text": "Format", "size": "sm", "variant": "muted"}},
    "p2-fmt-t": {"type": "Text", "props": {"text": "Price-led static", "size": "sm"}},
    "p2-aud": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["p2-aud-h", "p2-aud-t"]},
    "p2-aud-h": {"type": "Eyebrow", "props": {"text": "Audience", "size": "sm", "variant": "muted"}},
    "p2-aud-t": {"type": "Text", "props": {"text": "Broad · Advantage+", "size": "sm"}},
    "p2-reads": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["p2-reads-h", "p2-reads-t"]},
    "p2-reads-h": {"type": "Eyebrow", "props": {"text": "Reads", "size": "sm", "variant": "muted"}},
    "p2-reads-t": {"type": "Text", "props": {"text": "PureDrop on value", "size": "sm"}},
    "p2d": {"type": "Separator", "props": {"orientation": "horizontal"}},
    "p3": {"type": "Card", "props": {"variant": "light"}, "children": ["p3-grid"]},
    "p3-num": {"type": "Eyebrow", "props": {"text": "03", "size": "xl", "variant": "accent"}},
    "p3-main": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["p3-name", "p3-desc"]},
    "p3-name": {"type": "Heading", "props": {"text": "Kadai recipes", "level": "h2"}},
    "p3-desc": {"type": "Text", "props": {"text": "Short recipe reels using your oil; the food sells the oil.", "size": "sm"}},
    "p3-meta": {"type": "Grid", "props": {"columns": 3}, "children": ["p3-fmt", "p3-aud", "p3-reads"]},
    "p3-fmt": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["p3-fmt-h", "p3-fmt-t"]},
    "p3-fmt-h": {"type": "Eyebrow", "props": {"text": "Format", "size": "sm", "variant": "muted"}},
    "p3-fmt-t": {"type": "Text", "props": {"text": "Reels · B-roll", "size": "sm"}},
    "p3-aud": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["p3-aud-h", "p3-aud-t"]},
    "p3-aud-h": {"type": "Eyebrow", "props": {"text": "Audience", "size": "sm", "variant": "muted"}},
    "p3-aud-t": {"type": "Text", "props": {"text": "Healthy eating · new parents", "size": "sm"}},
    "p3-reads": {"type": "Stack", "props": {"direction": "vertical", "gap": "sm", "align": "stretch", "justify": "start"}, "children": ["p3-reads-h", "p3-reads-t"]},
    "p3-reads-h": {"type": "Eyebrow", "props": {"text": "Reads", "size": "sm", "variant": "muted"}},
    "p3-reads-t": {"type": "Text", "props": {"text": "Everyone on relevance", "size": "sm"}},
    "p1-grid": {"type": "Grid", "props": {"columns": 6, "spans": [{"colSpan": 1}, {"colSpan": 2}, {"colSpan": 2}, {"colSpan": 1}]}, "children": ["p1-num", "p1-main", "p1-meta", "p1-btn"]},
    "p2-grid": {"type": "Grid", "props": {"columns": 6, "spans": [{"colSpan": 1}, {"colSpan": 2}, {"colSpan": 2}, {"colSpan": 1}]}, "children": ["p2-num", "p2-main", "p2-meta", "p2-btn"]},
    "p3-grid": {"type": "Grid", "props": {"columns": 6, "spans": [{"colSpan": 1}, {"colSpan": 2}, {"colSpan": 2}, {"colSpan": 1}]}, "children": ["p3-num", "p3-main", "p3-meta", "p3-btn"]},
    "p1-btn": {"type": "Button", "props": {"label": "Make this ad", "variant": "dark", "value": "Pressed Monday"}},
    "p2-btn": {"type": "Button", "props": {"label": "Make this ad", "variant": "dark", "value": "Better first bottle"}},
    "p3-btn": {"type": "Button", "props": {"label": "Make this ad", "variant": "dark", "value": "Kadai recipes"}}
  }
}</ui-block>

### Step 5: Persist

- Save the complete report once with `saveCompetitorResearch`, passing `blocks` as the flat `{ root, elements }` spec. The tool validates it, saves it and displays it in chat; never render the report with `renderUIBlock`.
- If the tool reports review issues, fix them and call it again (up to three attempts).
- Fetch existing research first. Save only when new competitors, keywords, or ad IDs are found. Save with `saveCompetitorResearch`, passing `blocks` as the flat `{ root, elements }` spec so the finding opens on its own page.
- Quote the exact research URL the tool returns. Never build one yourself.
- If new direct competitors or phrases emerged, fetch the profile and persist only new entries (`updateBusinessProfile`).
- Turn the report's verified winners and open gaps into idea cards. Before writing them, compare against the `ideas` backlog loaded in Step 1: skip any title, hook, or core angle that already exists, including near-duplicates.
- Save only genuinely new ideas with `updateIdeas` (omit `id`; at most 10 per call). Use `COMPETITOR WINNER` for a pattern remade from a verified ad, `VARIANT` for a change to one of our existing creatives, and `FROM INSIGHTS` for an open gap.
- After saving, if the report does not already end in an interactive question, render a small single-select Chips + SubmitBar: "What's next?" with up to 4 relevant options (create a campaign brief, research more competitors, explore new keywords, refresh this report, or anything which would be a possible next step, There is no forcce that you should render these 4 only). If it already asks, keep that only and make its options equally relevant.
