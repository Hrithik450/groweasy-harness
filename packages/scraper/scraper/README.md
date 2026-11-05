# @openai-harness/scraper

Meta Ad Library scraping, embedding relevance, and durable ad storage.

Ported from `apps/gateway/src/lib/services/scraper/` following the reference
deepseek-harness storage architecture: the package declares a storage domain
with `defineDomain`/`domainTable` and reads and writes it through the
`storageDomain` service, replacing the application's Drizzle repository. The
original app modules are temporary re-export shims until their call sites are
rewired.

## Layers

| Layer | File | Owns |
|---|---|---|
| Domain spec | `src/spec.ts` | The `scraper` domain: `scraped_ads` and `ad_query_relevance` tables, their zod record schemas, and JSON-native embeddings. |
| Repository | `src/repository.ts` | Reads and writes over the opened domain's table handles, plus the process-wide default binding (`configureScraperRepository`). Replaces `@/lib/repositories/scraper.repo`. |
| Plugin | `src/plugin.ts` | `apply`/`name`/`inject`: opens the domain from `ctx.storageDomain`, binds the repository, and closes the domain on teardown. |
| Service wrappers | `src/scraper.service.ts` | The app-facing `Response`-wrapped free functions (`getAdsByQuery`, `getScrapedAdsByIds`, `persistScrapedAds`, `touchScrapedAds`). |
| Ingestion | `src/ingestion.service.ts` | Meta card parsing, search URL construction, and the parse → canonicalize → embed → score → persist pipeline. |
| Embeddings | `src/ad.relevance.service.ts` | The `EmbeddingProvider` seam, OpenAI provider, cosine scoring, and bounded concurrency. |
| Pipeline stages | `src/pipeline.ts` | Media attachment, canonicalization, embedding reuse, and scoring. |
| Helpers | `src/utils.ts`, `src/openai.client.ts`, `src/policy.ts` | Canonicalization/hashing, environment-driven OpenAI client, and relevance/embedding policy. |

## Storage domain

`scraper`, version 1, default single-document layout, no global:

| Table | Key | Record |
|---|---|---|
| `scraped_ads` | Meta Ad Library id | `libraryId`, `adUrl`, `content`, `contentHash`, `embedding` (`number[] \| null`), `embeddingModel`, `embeddingHash`, `startDate`, `status`, `firstSeenAt`, `lastSeenAt` |
| `ad_query_relevance` | JSON pair `[libraryId, searchQuery]` | `libraryId`, `searchQuery`, `relevanceScore`, `firstSeenAt`, `lastSeenAt` |

Only columns the services actually read or write are stored; the former Drizzle
indexes, defaults, foreign key, and blob custom type are gone because the
domain layer loads records into memory and owns durability. Embeddings are
stored as JSON number arrays and converted to `Float32Array` at the repository
boundary, so the medium stays JSON-serializable.

## Use

```ts
import { Context } from "@deepseek-ai/cordis";
import * as Scraper from "@openai-harness/scraper";

const ctx = new Context();
// ... mount storage, storage-domain, and a routed backend first ...
await ctx.plugin(Scraper); // inject = ["storageDomain"]

const result = await Scraper.ingestScrapedAds({
  rawMarkdown,
  searchQuery: "whatsapp automation",
});
```

Hosts that open the domain themselves can bind a repository directly:

```ts
import { scraperDomain } from "@openai-harness/scraper";
import {
  configureScraperRepository,
  ScraperRepository,
} from "@openai-harness/scraper/src/repository";

const domain = await ctx.storageDomain.open(scraperDomain);
configureScraperRepository(new ScraperRepository(domain));
```

Calling the free functions without a bound repository rejects with a descriptive
error rather than silently dropping data.

## Tests

`tests/` uses `node:test` and an in-memory storage backend. The root
`pnpm test` glob already includes `packages/**/*.test.ts`.
