import test from "node:test";
import assert from "node:assert/strict";

import {
  attachMediaToCardContent,
  parseMetaAdCards,
} from "../src/ingestion.service";

const AVATAR_URL =
  "https://scontent.fblr1-3.fna.fbcdn.net/v/t39.35426-6/902156480_2374664390028383_6450553189878779279_n.jpg?stp=dst-jpg_s60x60_tt6&_nc_cat=101";
const VIDEO_URL =
  "https://video.fblr1-3.fna.fbcdn.net/o1/v/t2/f2/m367/AQPcTAGTdHMjQnPiMD87mb2ujMXAOpYAf6sQgRORjY3rDdcU2Ew.mp4?_nc_cat=111&oh=00_AQQ8Gn413Obe&oe=6AFB8E63";
const CREATIVE_IMAGE_URL =
  "https://scontent.fblr1-4.fna.fbcdn.net/v/t39.35426-6/850907515_1124091383836616_880531355741923581_n.jpg?stp=dst-jpg_s600x600_tt6&_nc_cat=110";

const SAMPLE_MARKDOWN = `~1,900 results
These results include ads that match your **keyword search.**

Active
Library ID: 1120549940592588
Started running on Nov 11, 2026 · Total active time 5 hrs
Platforms
​
See ad details
* * *
![Veblika](${AVATAR_URL})
[Veblika](https://www.facebook.com/veblika/)
**Sponsored**
Static ad body copy that must stay unchanged.

* * *

ActiveLow impression count
Library ID: 2315078802675960
Started running on Nov 12, 2026 · Total active time 6 hrs
Platforms
​
​
See ad details
* * *
![Goup](${AVATAR_URL})
[Goup](https://www.facebook.com/goup/)
**Sponsored**
Video ad body copy.
`;

test("parseMetaAdCards parses static and 'Low impression count' video cards", () => {
  const cards = parseMetaAdCards(SAMPLE_MARKDOWN);

  assert.equal(cards.length, 2);
  assert.deepEqual(
    cards.map((card) => card.libraryId),
    ["1120549940592588", "2315078802675960"],
  );
  assert.equal(cards[1].status, "active");
  assert.match(cards[1].content, /Video ad body copy/);
  assert.match(cards[1].content, /Started running on Nov 12, 2026/);
});

test("video media is attached to the matching ad card", () => {
  const cards = parseMetaAdCards(SAMPLE_MARKDOWN);
  const videoCard = cards[1];

  const content = attachMediaToCardContent(videoCard.content, {
    anchor: videoCard.libraryId,
    videos: [VIDEO_URL],
    images: [AVATAR_URL, CREATIVE_IMAGE_URL],
  });

  assert.ok(content.startsWith(videoCard.content));
  assert.match(content, new RegExp(`Video: ${escapeRegExp(VIDEO_URL)}`));
  assert.match(
    content,
    new RegExp(`Image: ${escapeRegExp(CREATIVE_IMAGE_URL)}`),
  );
  // Profile thumbnails are not creatives and must not be attached.
  assert.equal(content.includes(`Image: ${AVATAR_URL}`), false);
});

test("static card is byte-identical when it has no associated media", () => {
  const cards = parseMetaAdCards(SAMPLE_MARKDOWN);
  const staticCard = cards[0];

  assert.equal(attachMediaToCardContent(staticCard.content, undefined), staticCard.content);
  assert.equal(
    attachMediaToCardContent(staticCard.content, {
      anchor: staticCard.libraryId,
      videos: [],
      images: [AVATAR_URL],
    }),
    staticCard.content,
  );
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
