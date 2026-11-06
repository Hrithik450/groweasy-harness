import test from "node:test";
import assert from "node:assert/strict";

import { scrapeWebPageTool } from "../src/scrape/tool";

test("scrapeWebPage refuses Meta Ad Library URLs and names the right tool", async () => {
  await assert.rejects(
    scrapeWebPageTool.execute(
      { url: "https://www.facebook.com/ads/library/?q=pabbly" },
      {} as never,
    ),
    (error: unknown) =>
      error instanceof Error &&
      /not scraped by scrapeWebPage/.test(error.message) &&
      /searchAdLibrary/.test(error.message) &&
      /alternateWebSearch/.test(error.message),
  );
});

test("the page-level Ad Library route is refused before any API call", async () => {
  const previous = process.env.FIRECRAWL_API_KEY;
  delete process.env.FIRECRAWL_API_KEY;
  try {
    // Without a key the tool would otherwise fail on configuration; the
    // routing error must win, proving the check runs first.
    await assert.rejects(
      scrapeWebPageTool.execute(
        { url: "https://web.facebook.com/ads/library/?id=123" },
        {} as never,
      ),
      /not scraped by scrapeWebPage/,
    );
  } finally {
    if (previous !== undefined) process.env.FIRECRAWL_API_KEY = previous;
  }
});
