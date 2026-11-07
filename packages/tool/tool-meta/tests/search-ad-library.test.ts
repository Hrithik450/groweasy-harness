import test from "node:test";
import assert from "node:assert/strict";

import type { SessionEvent } from "@openai-harness/session";
import type { ScoredScrapedAd } from "@openai-harness/scraper";

import { deliveredAdIds, pickUniqueAds } from "../src/search-ad-library/delivered";
import { resolveCrawlAbortMs } from "@openai-harness/tool-web";

import {
  AD_LIBRARY_PROBE_SCROLL_STEPS,
  SEARCH_AD_LIBRARY_TIMEOUT_MS,
  buildAdLibraryTelemetry,
  countAdsInWindow,
  hasLiveMedia,
  resolveCrawlDepth,
  resolveProbeDepth,
} from "../src/search-ad-library/tool";

function toolCall(
  callId: string,
  name = "searchAdLibrary",
  seq = 1,
): SessionEvent {
  return {
    type: "tool/call",
    seq,
    time: 0,
    data: { turn: 1, step: 1, callId, name, arguments: "{}" },
  } as SessionEvent;
}

function toolResult(
  callId: string,
  text: string,
  options: { seq?: number; error?: boolean } = {},
): SessionEvent {
  return {
    type: "tool/result",
    seq: options.seq ?? 2,
    time: 0,
    data: {
      turn: 1,
      step: 1,
      message: {
        role: "tool",
        toolCallId: callId,
        content: [{ type: "text", text }],
      },
      ...(options.error
        ? { error: { name: "ToolExecutionError", code: "failed" } }
        : {}),
    },
  } as SessionEvent;
}

function ad(libraryId: string, contentHash: string): ScoredScrapedAd {
  return {
    libraryId,
    adUrl: `https://www.facebook.com/ads/library/?id=${libraryId}`,
    content: `Library ID: ${libraryId}`,
    contentHash,
    embedding: null,
    embeddingModel: null,
    embeddingHash: null,
    startDate: null,
    status: "active",
    firstSeenAt: 0,
    lastSeenAt: 0,
    relevanceScore: 1,
  };
}

test("validation requests get a shallow crawl", () => {
  const expected = {
    maxScrollSteps: 3,
    scrollDelay: 1.2,
    delayBeforeSnapshot: 1.2,
    pageTimeout: 45000,
  };

  assert.deepEqual(
    resolveCrawlDepth({ targetCount: 1, query: "WhatsApp automation" }),
    expected,
  );
  // A capitalized brand-looking phrase is still validation at this count.
  assert.deepEqual(resolveCrawlDepth({ targetCount: 2, query: "Pabbly" }), expected);
});

test("collection requests keep the full crawl for broad queries", () => {
  assert.deepEqual(
    resolveCrawlDepth({ targetCount: 10, query: "whatsapp automation" }),
    {
      maxScrollSteps: 15,
      scrollDelay: 2.5,
      delayBeforeSnapshot: 3.5,
      // One deep crawl's abort budget (~161s) must fit inside the search's
      // 180s ceiling.
      pageTimeout: 90000,
    },
  );
});

test("collection requests use fewer scroll steps for specific brands", () => {
  assert.deepEqual(resolveCrawlDepth({ targetCount: 10, query: "Pabbly" }), {
    maxScrollSteps: 10,
    scrollDelay: 2.5,
    delayBeforeSnapshot: 3.5,
    pageTimeout: 90000,
  });
});

test("a missing targetCount defaults to collection depth", () => {
  assert.deepEqual(resolveCrawlDepth({ query: "whatsapp automation" }), {
    maxScrollSteps: 15,
    scrollDelay: 2.5,
    delayBeforeSnapshot: 3.5,
    pageTimeout: 90000,
  });
});

test("one deep crawl plus ingest fits inside the search ceiling", () => {
  const deep = resolveCrawlDepth({
    targetCount: 10,
    query: "whatsapp automation",
  });

  // The per-crawl abort budget is what the tool must outlive; if a single
  // crawl could outlast the search's ceiling, the search would die mid-crawl.
  assert.ok(
    resolveCrawlAbortMs({
      pageTimeout: deep.pageTimeout,
      maxScrollSteps: deep.maxScrollSteps,
      scrollDelay: deep.scrollDelay,
      delayBeforeSnapshot: deep.delayBeforeSnapshot,
    }) <= SEARCH_AD_LIBRARY_TIMEOUT_MS,
  );
  // And three minutes is what the model is promised.
  assert.equal(SEARCH_AD_LIBRARY_TIMEOUT_MS, 180000);
});

test("collection crawls start with a shallow probe pass", () => {
  const broad = resolveCrawlDepth({ targetCount: 10, query: "whatsapp automation" });
  assert.deepEqual(resolveProbeDepth(broad), {
    ...broad,
    maxScrollSteps: AD_LIBRARY_PROBE_SCROLL_STEPS,
  });

  const brand = resolveCrawlDepth({ targetCount: 10, query: "Pabbly" });
  assert.equal(
    resolveProbeDepth(brand).maxScrollSteps,
    AD_LIBRARY_PROBE_SCROLL_STEPS,
  );
});

test("validation crawls are already shallow and are not probed again", () => {
  const validation = resolveCrawlDepth({
    targetCount: 1,
    query: "WhatsApp automation",
  });

  const probe = resolveProbeDepth(validation);
  assert.deepEqual(probe, validation);
  assert.equal(probe.maxScrollSteps, 3);
});

const WINDOW = { startDate: "2026-11-01", endDate: "2026-11-30" };

const WINDOWED_MARKDOWN = `~900 results
These results include ads that match your **keyword search.**

Active
Library ID: 1111111111111
Started running on Nov 7, 2026 · Total active time 5 hrs
Platforms

Active
Library ID: 2222222222222
Started running on Oct 1, 2026 · Total active time 2 hrs
Platforms

Inactive
Library ID: 3333333333333
Started running on Nov 30, 2026
Platforms

Active
Library ID: 1111111111111
Started running on Nov 7, 2026
Platforms
`;

test("window counting keeps in-range cards and deduplicates library ids", () => {
  // 1111111111111 (Nov 7) and 3333333333333 (Nov 30); 2222222222222 is outside.
  assert.equal(countAdsInWindow(WINDOWED_MARKDOWN, WINDOW), 2);
});

test("window counting skips excluded ids and counts unknown dates", () => {
  const withUnknownDate = `${WINDOWED_MARKDOWN}
Active
Library ID: 4444444444444
Platforms
`;
  assert.equal(countAdsInWindow(withUnknownDate, WINDOW), 3);

  assert.equal(
    countAdsInWindow(withUnknownDate, WINDOW, new Set(["1111111111111"])),
    2,
  );
});

test("window counting ignores text without ad cards", () => {
  assert.equal(countAdsInWindow("No ads matched this search.", WINDOW), 0);
  assert.equal(countAdsInWindow("", WINDOW), 0);
});

test("delivered ad ids come from this tool's committed results only", () => {
  const events: SessionEvent[] = [
    toolCall("call-1"),
    toolResult("call-1", "#### Ad 1, Library ID: 1111111111111\n...", { seq: 2 }),
    toolCall("call-other", "saveCompetitorResearch", 3),
    toolResult("call-other", "Library ID: 9999999999999", { seq: 4 }),
    toolCall("call-2", "searchAdLibrary", 5),
    toolResult("call-2", "#### Ad 1, Library ID: 2222222222222\n...", { seq: 6 }),
  ];

  assert.deepEqual(
    [...deliveredAdIds(events)].sort(),
    ["1111111111111", "2222222222222"],
  );
});

test("a failed search delivered nothing and does not block those ads", () => {
  const events: SessionEvent[] = [
    toolCall("call-1"),
    toolResult("call-1", "Library ID: 1111111111111", { seq: 2, error: true }),
  ];

  assert.equal(deliveredAdIds(events).size, 0);
});

test("selection skips delivered ids, collapses duplicate creatives, keeps order", () => {
  const pool = [
    ad("1", "hash-a"),
    ad("2", "hash-a"),
    ad("3", "hash-b"),
    ad("4", "hash-c"),
  ];

  const picked = pickUniqueAds(pool, new Set(["2"]), 2);

  assert.deepEqual(
    picked.map((item) => item.libraryId),
    ["1", "3"],
  );
});

test("selection stops at the requested count", () => {
  const pool = [ad("1", "h1"), ad("2", "h2"), ad("3", "h3")];

  assert.deepEqual(
    pickUniqueAds(pool, new Set(), 2).map((item) => item.libraryId),
    ["1", "2"],
  );
});

test("telemetry labels semantic-cache matches and preserves notices", () => {
  const summary = buildAdLibraryTelemetry({
    query: "WhatsApp chatbot",
    country: "IN",
    dateRange: { startDate: "2026-11-01", endDate: "2026-11-30" },
    ads: [ad("1", "h1")],
    semanticCount: 1,
    notices: [
      "Only 1 new ad matched this query. Widen the date range or use a different keyword.",
    ],
  });

  assert.match(
    summary,
    /Matched from related cached searches \(semantic cache\)\*\*: 1/,
  );
  assert.match(summary, /reused from related cached searches/);
  assert.match(summary, /Only 1 new ad matched this query/);
});

test("a cached card is stale only when every signed link has expired", () => {
  const expired = "https://cdn.example/v.mp4?oe=6553f100&oh=a";
  const fresh = "https://cdn.example/v.mp4?oe=f4865700&oh=b";
  const now = 1700000001 * 1000;
  const card = (...lines: string[]): string =>
    ["Library ID: 1", "Copy.", ...lines].join("\n");

  assert.equal(hasLiveMedia(card(`Video: ${expired}`), now), false);
  assert.equal(hasLiveMedia(card(`Video: ${expired}`, `Video: ${fresh}`), now), true);
  // Text-only ads have nothing to expire.
  assert.equal(hasLiveMedia(card(), now), true);
});

test("telemetry caps per-ad media and keeps the copy ahead of the URLs", () => {
  const urls = Array.from(
    { length: 30 },
    (_, i) => `https://cdn.example/img-${i}.jpg?sig=${i}`,
  );
  const carousel: ScoredScrapedAd = {
    ...ad("1", "h1"),
    content: [
      "Library ID: 1",
      "Real creative copy.",
      // Carousels repeat a slide URL; the payload should say it once.
      ...urls.map((url) => `![](url)`.replace("url", url)),
      `![](url)`.replace("url", urls[0]!),
    ].join("\n"),
  };

  const summary = buildAdLibraryTelemetry({
    query: "sneakers",
    country: "IN",
    dateRange: { startDate: "2026-11-01", endDate: "2026-11-30" },
    ads: [carousel],
  });

  // Only the first eight creatives are rendered, and the rest is summarized.
  assert.equal(summary.split(/\nImage: /).length - 1, 8);
  assert.match(summary, /…and 22 more creative URLs/);
  // The hook is read before the media block, not after dozens of URLs.
  assert.ok(
    summary.indexOf("Real creative copy.") < summary.indexOf("Image: https://"),
  );
  // A carousel's duplicate slide URL is listed once.
  assert.equal(summary.split(urls[0]!).length - 1, 1);
});

test("telemetry truncates an unusually long card at a line boundary", () => {
  const longLine = "x".repeat(120);
  const body = Array.from({ length: 60 }, () => longLine).join("\n");
  const summary = buildAdLibraryTelemetry({
    query: "sneakers",
    country: "IN",
    dateRange: { startDate: "2026-11-01", endDate: "2026-11-30" },
    ads: [{ ...ad("1", "h1"), content: `Library ID: 1\n${body}` }],
  });

  assert.ok(summary.length < body.length);
  assert.match(summary, /…\(card text truncated\)/);
  // The cut lands on a line boundary, never mid-token.
  assert.match(summary, new RegExp(`${longLine}\n…\\(card text truncated\\)`));
});

test("telemetry omits the semantic line when nothing came from the cache", () => {
  const summary = buildAdLibraryTelemetry({
    query: "WhatsApp chatbot",
    country: "IN",
    dateRange: { startDate: "2026-11-01", endDate: "2026-11-30" },
    ads: [ad("1", "h1")],
  });

  assert.doesNotMatch(summary, /semantic cache\)\*\*/i);
});
