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
import { getAdsBySemanticQuery } from "../src/scraper.service";
import { scraperDomain } from "../src/spec";
import { normalizeQueryKey } from "../src/utils";
import { MemoryStorageBackend } from "./memory-backend";

let backend: MemoryStorageBackend;
let domain: Domain<typeof scraperDomain>;
let repo: ScraperRepository;

/**
 * Deterministic unit vectors keyed by a marker in the text.
 *
 * - `whatsapp-crm-body` (an ad) and `whatsapp chatbot` (a paraphrase query)
 *   both point at [1, 0], so their cosine is 1.
 * - `unrelated query` points at [0.2, √(1 − 0.2²)], cosine 0.2 with the ad:
 *   below the 0.55 semantic floor.
 * - Anything else is orthogonal.
 */
class FakeEmbedder implements EmbeddingProvider {
  readonly model = "fake-embed";
  readonly calls: string[][] = [];

  async embed(texts: string[]): Promise<Float32Array[]> {
    this.calls.push([...texts]);
    return texts.map((text) => {
      const lower = text.toLowerCase();
      if (lower.includes("whatsapp-crm-body")) return new Float32Array([1, 0]);
      if (lower.includes("whatsapp chatbot")) return new Float32Array([1, 0]);
      if (lower.includes("whatsapp crm")) return new Float32Array([1, 0]);
      if (lower.includes("unrelated query")) {
        return new Float32Array([0.2, Math.sqrt(1 - 0.2 * 0.2)]);
      }
      return new Float32Array([0, 1]);
    });
  }
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

const DATE_RANGE = { startDate: "2026-11-01", endDate: "2026-11-30" };

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

test("normalizeQueryKey ignores casing, spacing, and surrounding punctuation", () => {
  assert.equal(normalizeQueryKey("  WhatsApp   CRM "), "whatsapp crm");
  assert.equal(normalizeQueryKey('"WhatsApp CRM."'), "whatsapp crm");
  assert.equal(normalizeQueryKey("whatsapp crm"), "whatsapp crm");
  // A punctuation-only query does not collapse into a shared empty key.
  assert.equal(normalizeQueryKey("!!!"), "!!!");
});

test("exact lookup matches casing, spacing, and punctuation variants", async () => {
  const libraryId = "2000000000000001";
  await ingestScrapedAds({
    rawMarkdown: adMarkdown(libraryId, "Creative copy whatsapp-crm-body"),
    searchQuery: "WhatsApp CRM",
    embedder: new FakeEmbedder(),
  });

  for (const variant of [
    "whatsapp crm",
    "  WhatsApp   CRM  ",
    '"WhatsApp CRM."',
  ]) {
    const ids = repo.getAdsByQuery(variant).map((ad) => ad.libraryId);
    assert.ok(
      ids.includes(libraryId),
      `expected exact cache hit for ${JSON.stringify(variant)}`,
    );
  }
});

test("semantic lookup returns a close stored ad and drops a distant one", async () => {
  const libraryId = "2000000000000002";
  await ingestScrapedAds({
    rawMarkdown: adMarkdown(libraryId, "Creative copy whatsapp-crm-body"),
    searchQuery: "seed query two",
    embedder: new FakeEmbedder(),
  });

  const close = await getAdsBySemanticQuery(
    "whatsapp chatbot close",
    undefined,
    5,
    DATE_RANGE,
    { embedder: new FakeEmbedder() },
  );
  assert.equal(close.success, true);
  assert.equal(close.semantic, true);
  assert.equal(
    close.data?.some((ad) => ad.libraryId === libraryId),
    true,
  );

  // Same ad vector, query vector at cosine 0.2: below the 0.55 floor.
  const distant = await getAdsBySemanticQuery(
    "unrelated query two",
    undefined,
    5,
    DATE_RANGE,
    { embedder: new FakeEmbedder() },
  );
  assert.equal(distant.success, true);
  assert.deepEqual(distant.data, []);
});

test("semantic lookup honours exclusions and the launch-date range", async () => {
  const libraryId = "2000000000000003";
  await ingestScrapedAds({
    rawMarkdown: adMarkdown(libraryId, "Creative copy whatsapp-crm-body"),
    searchQuery: "seed query three",
    embedder: new FakeEmbedder(),
  });

  const excluded = await getAdsBySemanticQuery(
    "whatsapp chatbot excluded",
    new Set([libraryId]),
    5,
    DATE_RANGE,
    { embedder: new FakeEmbedder() },
  );
  assert.equal(
    excluded.data?.some((ad) => ad.libraryId === libraryId),
    false,
  );

  const outside = await getAdsBySemanticQuery(
    "whatsapp chatbot dated",
    undefined,
    5,
    { startDate: "2026-12-01", endDate: "2026-12-31" },
    { embedder: new FakeEmbedder() },
  );
  assert.equal(
    outside.data?.some((ad) => ad.libraryId === libraryId),
    false,
  );

  const inside = await getAdsBySemanticQuery(
    "whatsapp chatbot dated in range",
    undefined,
    5,
    DATE_RANGE,
    { embedder: new FakeEmbedder() },
  );
  assert.equal(
    inside.data?.some((ad) => ad.libraryId === libraryId),
    true,
  );
});

test("semantic lookup skips null and other-model embeddings without throwing", async () => {
  const nullEmbeddingId = "2000000000000004";
  const otherModelId = "2000000000000005";

  await repo.persistScrapedAds(
    [
      {
        libraryId: nullEmbeddingId,
        adUrl: "https://www.facebook.com/ads/library/?id=2000000000000004",
        content: "Creative copy with no embedding",
        contentHash: "hash-null",
        embedding: null,
        embeddingModel: null,
        embeddingHash: null,
        startDate: "2026-11-11",
        status: "active",
      },
      {
        libraryId: otherModelId,
        adUrl: "https://www.facebook.com/ads/library/?id=2000000000000005",
        content: "Creative copy with another model",
        contentHash: "hash-other",
        embedding: new Float32Array([1, 0]),
        embeddingModel: "other-model",
        embeddingHash: "hash-other-model",
        startDate: "2026-11-11",
        status: "active",
      },
    ],
    [],
  );

  const result = await getAdsBySemanticQuery(
    "whatsapp chatbot model check",
    undefined,
    10,
    DATE_RANGE,
    { embedder: new FakeEmbedder() },
  );

  assert.equal(result.success, true);
  const ids = result.data?.map((ad) => ad.libraryId) ?? [];
  assert.equal(ids.includes(nullEmbeddingId), false);
  assert.equal(ids.includes(otherModelId), false);
});

test("repeated identical lookups embed the query exactly once", async () => {
  const embedder = new FakeEmbedder();

  await getAdsBySemanticQuery(
    "repeat cache probe",
    undefined,
    1,
    DATE_RANGE,
    { embedder },
  );
  await getAdsBySemanticQuery(
    "repeat cache probe",
    undefined,
    1,
    DATE_RANGE,
    { embedder },
  );
  // Casing/whitespace variants share the normalized cache key too.
  await getAdsBySemanticQuery(
    "  Repeat   Cache Probe ",
    undefined,
    1,
    DATE_RANGE,
    { embedder },
  );

  assert.equal(embedder.calls.length, 1);
});
