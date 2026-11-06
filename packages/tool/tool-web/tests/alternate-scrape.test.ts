import test from "node:test";
import assert from "node:assert/strict";

import {
  AD_LIBRARY_MAX_SCROLL_STEPS,
  associateMediaByAnchor,
  buildCrawlerParams,
  isMetaAdLibraryUrl,
  normalizeWaitForSelector,
  resolveCrawlAbortMs,
} from "../src/alternate-scrape/tool";
import { createConcurrencyLimiter } from "../src/alternate-scrape/limiter";

const VIDEO_ONE = "https://video.example/one.mp4?a=1&b=2";
const VIDEO_TWO = "https://video.example/two.mp4";
const AVATAR = "https://img.example/avatar.jpg?stp=dst-jpg_s60x60_tt6";

test("crawl abort budget covers page timeout, scrolls, snapshot delay, and headroom", () => {
  // Validation crawl: 45s page budget, 3 scrolls x 1.2s, 1.2s snapshot, 30s.
  assert.equal(
    resolveCrawlAbortMs({
      pageTimeout: 45000,
      maxScrollSteps: 3,
      scrollDelay: 1.2,
      delayBeforeSnapshot: 1.2,
    }),
    79800,
  );
  // Collection crawl at 15 steps: 120s + 37.5s + 3.5s snapshot + 30s.
  assert.equal(
    resolveCrawlAbortMs({
      pageTimeout: 120000,
      maxScrollSteps: 15,
      scrollDelay: 2.5,
      delayBeforeSnapshot: 3.5,
    }),
    191000,
  );
});

test("crawl abort budget falls back to safe defaults without maxScrollSteps", () => {
  // 60s page budget, 10 scrolls x 2.0s, 1.5s snapshot, 30s headroom.
  assert.equal(resolveCrawlAbortMs(), 111500);
  // Absent maxScrollSteps assumes the 10-step default.
  assert.equal(
    resolveCrawlAbortMs({ pageTimeout: 45000, scrollDelay: 1.2 }),
    88500,
  );
});

test("associateMediaByAnchor attaches DOM media to the nearest preceding anchor", () => {
  const html = `
    <div>
      <span>Library ID: 111</span>
      <video src="https://video.example/one.mp4?a=1&amp;b=2"></video>
      <img src="${AVATAR}" />
    </div>
    <div>
      <span>Library ID: 222</span>
      <video src="${VIDEO_TWO}"></video>
      <video src="${VIDEO_TWO}"></video>
    </div>
  `;

  const groups = associateMediaByAnchor(
    html,
    "Library ID:\\s*(\\d+)",
    [VIDEO_ONE, VIDEO_TWO],
    [AVATAR],
  );

  assert.deepEqual(groups, [
    { anchor: "111", videos: [VIDEO_ONE], images: [AVATAR] },
    { anchor: "222", videos: [VIDEO_TWO], images: [] },
  ]);
});

test("only Meta Ad Library URLs get the feed crawl strategy", () => {
  assert.equal(
    isMetaAdLibraryUrl("https://www.facebook.com/ads/library/?q=pabbly"),
    true,
  );
  assert.equal(
    isMetaAdLibraryUrl("https://web.facebook.com/ads/library/?id=123"),
    true,
  );
  assert.equal(isMetaAdLibraryUrl("https://www.facebook.com/marketplace"), false);
  assert.equal(isMetaAdLibraryUrl("https://groweasy.ai/ads/library"), false);
  assert.equal(isMetaAdLibraryUrl("not a url"), false);
});

test("ad library params force a full-page scan and cap scroll steps", () => {
  const params = buildCrawlerParams({
    url: "https://www.facebook.com/ads/library/?q=pabbly",
    scanFullPage: false,
    maxScrollSteps: 99,
    pageTimeout: 20000,
  });

  assert.equal(params.scan_full_page, true);
  // 15 steps is the measured ceiling (~175 cards, ~50s): a caller asking for
  // more reads no deeper, and everything past the first page ranks below the
  // delivery pool.
  assert.equal(AD_LIBRARY_MAX_SCROLL_STEPS, 15);
  assert.equal(params.max_scroll_steps, 15);
  assert.equal(params.page_timeout, 45000);
  assert.equal(params.cache_mode, "bypass");
});

test("ordinary scrape params keep the caller's scroll settings", () => {
  const params = buildCrawlerParams({
    url: "https://groweasy.ai",
    scanFullPage: false,
    maxScrollSteps: 99,
  });

  assert.equal(params.scan_full_page, false);
  assert.equal(params.max_scroll_steps, 99);
  assert.equal(params.page_timeout, 60000);
  assert.equal("wait_for" in params, false);
});

test("non-CSS wait conditions are dropped before they reach the crawler", () => {
  assert.equal(normalizeWaitForSelector("js:() => true"), undefined);
  assert.equal(normalizeWaitForSelector("xpath://h1"), undefined);
  assert.equal(normalizeWaitForSelector("css:.ad-card"), "css:.ad-card");
  assert.equal(
    normalizeWaitForSelector("div[data-testid='ad-card']"),
    "div[data-testid='ad-card']",
  );

  const params = buildCrawlerParams({
    url: "https://groweasy.ai",
    waitForSelector: "js:() => true",
  });
  assert.equal("wait_for" in params, false);
});

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("concurrency limiter runs at most its limit and queues the rest", async () => {
  const limiter = createConcurrencyLimiter(6);
  const releases: Array<() => void> = [];
  let running = 0;
  let peak = 0;

  const tasks = Array.from({ length: 8 }, (_, index) =>
    limiter.run(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise<void>((resolve) => releases.push(resolve));
      running -= 1;
      return index;
    }),
  );

  assert.equal(limiter.active, 6);
  assert.equal(limiter.pending, 2);

  while (releases.length > 0) {
    releases.shift()?.();
    await nextTurn();
  }

  assert.deepEqual(await Promise.all(tasks), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(peak, 6);
  assert.equal(limiter.active, 0);
  assert.equal(limiter.pending, 0);
});

test("an aborted signal drops a queued task without starting it", async () => {
  const limiter = createConcurrencyLimiter(1);
  const controller = new AbortController();
  let release!: () => void;
  const running = limiter.run(
    () => new Promise<void>((resolve) => { release = resolve; }),
  );

  let queuedStarted = false;
  const queued = limiter.run(() => {
    queuedStarted = true;
    return Promise.resolve();
  }, controller.signal);

  assert.equal(limiter.pending, 1);
  controller.abort();
  await assert.rejects(queued);
  assert.equal(queuedStarted, false);
  assert.equal(limiter.pending, 0);

  release();
  await running;
  assert.equal(limiter.active, 0);
});

test("a pre-aborted signal never enters the queue", async () => {
  const limiter = createConcurrencyLimiter(1);
  const controller = new AbortController();
  controller.abort();

  let started = false;
  await assert.rejects(
    limiter.run(() => {
      started = true;
      return Promise.resolve();
    }, controller.signal),
  );
  assert.equal(started, false);
  assert.equal(limiter.active, 0);
  assert.equal(limiter.pending, 0);
});

test("associateMediaByAnchor ignores media outside any anchor and invalid patterns", () => {
  const html = `<video src="${VIDEO_ONE}"></video><span>Library ID: 111</span>`;

  assert.deepEqual(
    associateMediaByAnchor(html, "Library ID:\\s*(\\d+)", [VIDEO_ONE], []),
    [],
  );
  assert.deepEqual(
    associateMediaByAnchor(html, "([", [VIDEO_ONE], []),
    [],
  );
});
