import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { Context } from "@deepseek-ai/cordis";
import Storage from "@openai-harness/storage";
import { DomainFacility } from "@openai-harness/storage-domain";
import type { Domain } from "@openai-harness/storage-domain";

import type { EmbeddingProvider } from "../src/ad.relevance.service";
import { ingestScrapedAds } from "../src/ingestion.service";
import {
  configureScraperRepository,
  ScraperRepository,
} from "../src/repository";
import { scraperDomain } from "../src/spec";
import {
  canonicalizeAdText,
  computeContentHash,
  computeEmbeddingHash,
  sha256Hex,
} from "../src/utils";
import { MemoryStorageBackend } from "./memory-backend";

let backend: MemoryStorageBackend;
let domain: Domain<typeof scraperDomain>;
let repo: ScraperRepository;

class FakeEmbedder implements EmbeddingProvider {
  readonly model = "fake-embed";
  readonly calls: string[][] = [];

  constructor(
    private readonly mapText: (text: string) => Float32Array = defaultVector,
  ) {}

  async embed(texts: string[]): Promise<Float32Array[]> {
    this.calls.push([...texts]);
    return texts.map((text) => this.mapText(text));
  }
}

const FAILING_EMBEDDER: EmbeddingProvider = {
  model: "fake-embed",
  async embed() {
    throw new Error("provider down");
  },
};

/** Unit-length vectors with predictable cosine similarity to [1, 0]. */
function defaultVector(text: string): Float32Array {
  if (text.includes("query-a") || text.includes("creative-a")) {
    return new Float32Array([1, 0]);
  }
  if (text.includes("creative-b")) {
    return new Float32Array([0.8, 0.6]);
  }
  if (text.includes("creative-low")) {
    return new Float32Array([0.3, Math.sqrt(1 - 0.3 * 0.3)]);
  }
  return new Float32Array([0, 1]);
}

function adMarkdown(libraryId: string, body: string): string {
  return `Active
Library ID: ${libraryId}
Started running on Nov 11, 2026 · Total active time 5 hrs
Platforms
See ad details
**Sponsored**
${body}
`;
}

before(async () => {
  const ctx = new Context();
  await ctx.plugin(Storage);
  backend = new MemoryStorageBackend();
  ctx.storage.backend.register("memory", backend);
  const facility = new DomainFacility(ctx, { backend: "memory", routes: {} });
  domain = await facility.open(scraperDomain);
  repo = new ScraperRepository(domain);
  configureScraperRepository(repo);
});

after(async () => {
  await domain.close();
  await backend.close();
});

/** Read the durable `(query, ad)` relation rows straight off the domain. */
function rawRelations(libraryId: string): Array<{
  search_query: string;
  relevance_score: number;
}> {
  const rows = [...domain.table("ad_query_relevance").entries()]
    .map(([, relation]) => relation)
    .filter((relation) => relation.libraryId === libraryId)
    .map((relation) => ({
      search_query: relation.searchQuery,
      relevance_score: relation.relevanceScore,
    }));
  rows.sort((a, b) => a.search_query.localeCompare(b.search_query));
  return rows;
}

test("canonicalization is stable across volatile scrape noise", () => {
  const first = `Active
Library ID: 1234567890123
Started running on Nov 11, 2026 · Total active time 5 hrs
Impressions: 1,204
**3 ads** use this creative and text
![avatar](https://cdn.example.com/a.jpg?sig=one)
Book a demo at https://example.com/?utm_source=meta
Real creative copy.`;
  const second = `​ActiveLow impression count
Library ID: 1234567890123
Started running on Nov 11, 2026 · Total active time 11 hrs
Impressions: 8,900
**12 ads** use this creative and text
![avatar](https://cdn.example.com/b.jpg?sig=two)
Book a demo at    https://example.com/?utm_source=meta&sig=two
   Real creative copy.   `;

  assert.equal(canonicalizeAdText(first), canonicalizeAdText(second));
  assert.equal(computeContentHash(first), computeContentHash(second));
  assert.equal(
    computeEmbeddingHash("fake-embed", canonicalizeAdText(first)),
    sha256Hex(`fake-embed\n${canonicalizeAdText(second)}`),
  );

  // Actual creative change is a new ad version.
  const changed = first.replace("Real creative copy.", "Different offer.");
  assert.notEqual(computeContentHash(first), computeContentHash(changed));

  // A counter phrase inside creative copy is not stripped.
  const creativeCopy = canonicalizeAdText(
    "Active\nLibrary ID: 1\nLow impression count is a real concern for buyers.",
  );
  assert.match(creativeCopy, /Low impression count is a real concern/);
});

test("embeddings are reused across queries for the same ad", async () => {
  const libraryId = "1000000000000002";
  const markdown = adMarkdown(libraryId, "Creative copy creative-a");

  const firstEmbedder = new FakeEmbedder();
  await ingestScrapedAds({
    rawMarkdown: markdown,
    searchQuery: "query-a",
    embedder: firstEmbedder,
  });

  const secondEmbedder = new FakeEmbedder();
  await ingestScrapedAds({
    rawMarkdown: markdown,
    searchQuery: "query-b",
    embedder: secondEmbedder,
  });

  // First call embeds the ad; the second call only embeds the new query.
  assert.equal(firstEmbedder.calls.length, 2);
  assert.equal(secondEmbedder.calls.length, 1);
  assert.deepEqual(secondEmbedder.calls[0], ["query-b"]);

  const rows = repo.getScrapedAdsByIds([libraryId]).get(libraryId) ?? [];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].embeddingModel, "fake-embed");
  assert.equal(
    rows[0].embeddingHash,
    computeEmbeddingHash("fake-embed", canonicalizeAdText(markdown)),
  );
});

test("relevance belongs to (query, ad), not to the ad row", async () => {
  const libraryId = "1000000000000003";
  const markdown = adMarkdown(libraryId, "Creative copy creative-a");

  await ingestScrapedAds({
    rawMarkdown: markdown,
    searchQuery: "query-a",
    embedder: new FakeEmbedder(),
  });
  await ingestScrapedAds({
    rawMarkdown: markdown,
    searchQuery: "query-b",
    embedder: new FakeEmbedder(),
  });

  // One durable ad row...
  const ads = repo.getScrapedAdsByIds([libraryId]).get(libraryId) ?? [];
  assert.equal(ads.length, 1);

  // ...two derived relations, each with its own score.
  assert.deepEqual(rawRelations(libraryId), [
    { search_query: "query-a", relevance_score: 1 },
    { search_query: "query-b", relevance_score: 0 },
  ]);

  assert.equal(
    repo
      .getAdsByQuery("query-a")
      .some((ad) => ad.libraryId === libraryId),
    true,
  );
  assert.equal(
    repo.getAdsByQuery("query-b").some((ad) => ad.libraryId === libraryId),
    false,
  );
});

test("getAdsByQuery serves every Meta-matched relation", async () => {
  await ingestScrapedAds({
    rawMarkdown: adMarkdown("1000000000000004", "Creative copy creative-b"),
    searchQuery: "query-a",
    embedder: new FakeEmbedder(),
  });
  await ingestScrapedAds({
    rawMarkdown: adMarkdown("1000000000000005", "Creative copy creative-low"),
    searchQuery: "query-a",
    embedder: new FakeEmbedder(),
  });

  // Meta's search matched both ads; a low cosine only orders them lower. The
  // old 0.5 gate hid nearly every real cached match.
  const results = repo.getAdsByQuery("query-a");
  const ids = results.map((ad) => ad.libraryId);

  assert.ok(ids.includes("1000000000000004"));
  assert.ok(ids.includes("1000000000000005"));
  // Higher relevance ranks first regardless of insertion order.
  assert.ok(
    results.findIndex((ad) => ad.libraryId === "1000000000000004") <
      results.findIndex((ad) => ad.libraryId === "1000000000000005"),
  );
  assert.equal(results.every((ad) => ad.relevanceScore >= 0.05), true);
});

test("inactive ads are never served from the cache", async () => {
  const libraryId = "1000000000000007";
  const markdown = adMarkdown(libraryId, "Creative copy creative-a").replace(
    /^Active/m,
    "Inactive",
  );

  await ingestScrapedAds({
    rawMarkdown: markdown,
    searchQuery: "query-inactive",
    embedder: new FakeEmbedder(),
  });

  assert.deepEqual(repo.getAdsByQuery("query-inactive"), []);
});

test("parseMetaAdCards falls back to Library ID anchors without a status line", async () => {
  const { parseMetaAdCards } = await import("../src/ingestion.service");

  const cards = parseMetaAdCards(`Library ID: 9000000000000001
Started running on Nov 11, 2026
Real creative copy.

Library ID: 9000000000000002
Inactive
Another card.`);

  assert.equal(cards.length, 2);
  assert.equal(cards[0].status, "active");
  assert.equal(cards[0].startDate, "2026-11-11");
  assert.equal(cards[1].libraryId, "9000000000000002");
});

test("an embedding-provider failure aborts before persisting", async () => {
  const libraryId = "1000000000000006";

  await assert.rejects(
    ingestScrapedAds({
      rawMarkdown: adMarkdown(libraryId, "Creative copy creative-a"),
      searchQuery: "query-a",
      embedder: FAILING_EMBEDDER,
    }),
    (error: unknown) =>
      error instanceof Error && error.name === "EmbeddingProviderError",
  );

  const ads = repo.getScrapedAdsByIds([libraryId]).get(libraryId) ?? [];
  assert.equal(ads.length, 0);
  assert.deepEqual(rawRelations(libraryId), []);
});
