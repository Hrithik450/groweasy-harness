/**
 * Smoke test for the Meta Ad Library GraphQL path.
 *
 *   npm run smoke:meta -- "physiotherapy centre" 100 IN
 *
 * Requires Google Chrome (or META_BROWSER_EXECUTABLE_PATH) and network access.
 * Exits non-zero when fewer ads than requested come back.
 */

import { fetchMetaAdsViaGraphQL } from "../src/lib/services/scraper/meta-graphql";

const query = process.argv[2] ?? "physiotherapy centre";
const targetCount = Number(process.argv[3] ?? 100);
const country = process.argv[4] ?? "IN";

async function main(): Promise<void> {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 30);
  const iso = (date: Date): string => date.toISOString().slice(0, 10);

  const result = await fetchMetaAdsViaGraphQL({
    query,
    country,
    startDate: iso(start),
    endDate: iso(now),
    targetCount,
    mediaType: "all",
  });

  console.log(
    JSON.stringify(
      {
        query: result.query,
        country: result.country,
        requested: targetCount,
        delivered: result.ads.length,
        telemetry: result.telemetry,
        firstAd: result.ads[0] ?? null,
        lastAd: result.ads.at(-1) ?? null,
        ids: result.ads.map((ad) => ad.libraryId),
      },
      null,
      2,
    ),
  );

  if (result.ads.length < targetCount) {
    console.error(
      `Expected ${targetCount} ads, received ${result.ads.length}.`,
    );
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
