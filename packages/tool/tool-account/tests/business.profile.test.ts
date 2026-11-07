import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_KEYWORDS_PER_LIST,
  attachCollectedMedia,
  mergeBusinessProfilePayload,
  normalizeBusinessProfilePayload,
} from "../src/business.profile/utils";

const URL = "https://brand.example";

function profileWith(competitors: unknown) {
  return normalizeBusinessProfilePayload({
    url: URL,
    brand: { name: "Brand" },
    competitors: { competitors },
  });
}

test("business keyword lists are capped at 10 per list", () => {
  const profile = normalizeBusinessProfilePayload({
    url: URL,
    brand: {
      name: "Brand",
      keywords: {
        broadPhrases: Array.from({ length: 15 }, (_, i) => `broad ${i}`),
        productOrServicePhrases: Array.from(
          { length: 15 },
          (_, i) => `product ${i}`,
        ),
      },
    },
  });

  assert.equal(profile.brand.keywords?.broadPhrases?.length, 10);
  assert.equal(
    profile.brand.keywords?.productOrServicePhrases?.length,
    10,
  );
  assert.equal(MAX_KEYWORDS_PER_LIST, 10);
});

test("competitor keywords are dropped and ads keep collector URLs", () => {
  const profile = profileWith([
    {
      name: "Competitor A",
      website: "https://a.example",
      keywords: {
        broadPhrases: ["legacy broad"],
        productOrServicePhrases: ["legacy product"],
      },
      ads: [
        {
          format: "video",
          adUrl: "https://ad-library.example/1",
          mediaUrls: ["https://cdn.example/video.mp4", ""],
          label: "Launch offer",
        },
        { adUrl: "https://ad-library.example/2" },
        { format: "static", adUrl: "" },
      ],
    },
  ]);

  const competitor = profile.competitors?.competitors[0];
  assert.ok(competitor);
  assert.equal("keywords" in competitor, false);
  assert.equal(competitor.ads.length, 2);
  assert.equal(competitor.ads[0].format, "video");
  assert.deepEqual(competitor.ads[0].mediaUrls, [
    "https://cdn.example/video.mp4",
  ]);
  assert.equal(competitor.ads[0].label, "Launch offer");
  assert.equal(competitor.ads[1].format, "static");
  assert.equal(competitor.ads[1].mediaUrls, undefined);
});

test("competitors without ads normalize to an empty ads list", () => {
  const profile = profileWith([{ name: "Competitor B" }]);
  assert.deepEqual(profile.competitors?.competitors[0].ads, []);
});

test("merging competitors unions ads by ad URL with incoming data winning", () => {
  const existing = profileWith([
    {
      name: "Competitor A",
      website: "https://a.example",
      ads: [
        {
          format: "video",
          adUrl: "https://ad-library.example/1",
          mediaUrls: ["https://cdn.example/old.mp4"],
        },
        { format: "static", adUrl: "https://ad-library.example/2" },
      ],
    },
  ]);

  const merged = mergeBusinessProfilePayload(existing, {
    url: URL,
    brand: { name: "Brand" },
    competitors: {
      competitors: [
        {
          name: "Competitor A",
          ads: [
            {
              format: "video",
              adUrl: "https://ad-library.example/1",
              mediaUrls: ["https://cdn.example/new.mp4"],
            },
            { format: "static", adUrl: "https://ad-library.example/3" },
          ],
        },
      ],
    },
  });

  const competitor = merged.competitors?.competitors[0];
  assert.ok(competitor);
  assert.deepEqual(
    competitor.ads.map((ad) => ad.adUrl),
    [
      "https://ad-library.example/1",
      "https://ad-library.example/3",
      "https://ad-library.example/2",
    ],
  );
  assert.deepEqual(competitor.ads[0].mediaUrls, [
    "https://cdn.example/new.mp4",
  ]);
});

test("ad media is read back from the crawl, not from the model's copy", async () => {
  const fresh = "https://video.example/ad.mp4?oe=f4865700&oh=abc";
  const stale = "https://video.example/old.mp4?oe=6553f100&oh=def";
  const still = "https://img.example/photo.jpg?oe=f4865700&oh=ghi";
  const now = 1700000001 * 1000;

  const competitors = normalizeBusinessProfilePayload({
    url: URL,
    brand: { name: "Brand" },
    competitors: {
      competitors: [
        {
          name: "AiSensy",
          ads: [
            // The model saved the ad without its creative URL...
            {
              format: "video",
              adUrl: "https://www.facebook.com/ads/library/?id=28842070572159677",
              label: "AI ads builder",
            },
            // ...and here it saved a link that has since expired.
            {
              format: "static",
              adUrl: "https://www.facebook.com/ads/library/?id=2",
              mediaUrls: [stale],
            },
          ],
        },
      ],
    },
  }).competitors!.competitors;

  const enriched = await attachCollectedMedia(
    competitors,
    async (ids) => {
      assert.deepEqual([...ids].sort(), ["2", "28842070572159677"]);
      return new Map([
        [
          "28842070572159677",
          [
            {
              libraryId: "28842070572159677",
              content: `Active\nLibrary ID: 28842070572159677\nVideo: ${fresh}`,
            } as never,
          ],
        ],
        [
          "2",
          [
            {
              libraryId: "2",
              content: `Active\nLibrary ID: 2\nImage: ${still}\nVideo: ${stale}`,
            } as never,
          ],
        ],
      ]);
    },
    now,
  );

  const [first, second] = enriched[0].ads;
  // Media comes from storage and the format follows what the crawl found.
  assert.deepEqual(first.mediaUrls, [fresh]);
  assert.equal(first.format, "video");
  // The expired link is replaced by the card's live one.
  assert.deepEqual(second.mediaUrls, [still]);
  assert.equal(second.format, "static");
});

test("an ad the crawl never saw keeps only live supplied media", async () => {
  const stale = "https://video.example/old.mp4?oe=6553f100&oh=def";
  const competitors = normalizeBusinessProfilePayload({
    url: URL,
    brand: { name: "Brand" },
    competitors: {
      competitors: [
        {
          name: "Unknown",
          ads: [
            {
              format: "video",
              adUrl: "https://www.facebook.com/ads/library/?id=999",
              mediaUrls: [stale],
            },
          ],
        },
      ],
    },
  }).competitors!.competitors;

  const enriched = await attachCollectedMedia(
    competitors,
    async () => new Map(),
    1700000001 * 1000,
  );

  assert.equal(enriched[0].ads[0].mediaUrls, undefined);
});
