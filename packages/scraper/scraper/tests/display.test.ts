import test from "node:test";
import assert from "node:assert/strict";

import {
  crispAdCardContent,
  isAvatarMediaUrl,
  isMediaUrlExpired,
  mediaUrlExpiresAt,
  stripExpiredMediaLines,
} from "../src/display";

const EXPIRED_VIDEO =
  "https://video.example/expired.mp4?_nc_cat=1&oe=6553f100&oh=abc";
const FRESH_VIDEO =
  "https://video.example/fresh.mp4?_nc_cat=1&oe=f4865700&oh=def";
const CREATIVE_IMAGE = "https://img.example/creative.jpg?oe=f4865700";
const AVATAR = "https://img.example/avatar.jpg?stp=dst-jpg_s60x60_tt6";

test("mediaUrlExpiresAt reads the signed oe epoch as hex seconds", () => {
  assert.equal(mediaUrlExpiresAt(EXPIRED_VIDEO), 1700000000 * 1000);
  assert.equal(mediaUrlExpiresAt("https://img.example/plain.jpg"), null);
  assert.equal(isMediaUrlExpired(EXPIRED_VIDEO, 1700000001 * 1000), true);
  assert.equal(isMediaUrlExpired(FRESH_VIDEO, 1700000001 * 1000), false);
});

test("stripExpiredMediaLines drops only expired media lines", () => {
  const content = [
    "Active",
    "Library ID: 123",
    `Video: ${EXPIRED_VIDEO}`,
    `Video: ${FRESH_VIDEO}`,
    `Image: ${CREATIVE_IMAGE}`,
  ].join("\n");

  const result = stripExpiredMediaLines(content, 1700000001 * 1000);

  assert.equal(result.dropped, 1);
  assert.equal(result.content.includes("expired.mp4"), false);
  assert.equal(result.content.includes("fresh.mp4"), true);
  assert.equal(result.content.includes("creative.jpg"), true);
});

test("crispAdCardContent strips chrome and lifts creative images", () => {
  const raw = [
    "Active",
    "Library ID: 456",
    "Started running on Nov 11, 2026",
    "Platforms",
    "\u200b",
    "* * *",
    `![CourtStride](${AVATAR})`,
    "**Sponsored**",
    "Real creative copy.",
    "",
    `![product](${CREATIVE_IMAGE})`,
    "See ad details",
  ].join("\n");

  const crisp = crispAdCardContent(raw);

  assert.match(crisp, /^Active\nLibrary ID: 456/);
  assert.match(crisp, /Real creative copy\./);
  assert.equal(crisp.includes("Platforms"), false);
  assert.equal(crisp.includes("Sponsored"), false);
  assert.equal(crisp.includes("See ad details"), false);
  assert.equal(crisp.includes("\u200b"), false);
  assert.equal(crisp.includes("s60x60"), false);
  assert.ok(crisp.includes(`Image: ${CREATIVE_IMAGE}`));
  // The creative URL leaves the body and appears once, as an Image line.
  assert.equal(crisp.split(CREATIVE_IMAGE).length - 1, 1);
});

test("crispAdCardContent is idempotent", () => {
  const raw = [
    "Active",
    "Library ID: 789",
    `![avatar](${AVATAR})`,
    "Copy line.",
    `Video: ${FRESH_VIDEO}`,
    `Image: ${CREATIVE_IMAGE}`,
  ].join("\n");

  const once = crispAdCardContent(raw);
  const twice = crispAdCardContent(once);

  assert.equal(twice, once);
  assert.equal(twice.split(FRESH_VIDEO).length - 1, 1);
  assert.equal(twice.split(CREATIVE_IMAGE).length - 1, 1);
});

test("avatar detection matches Meta's 60x60 thumbnails only", () => {
  assert.equal(isAvatarMediaUrl(AVATAR), true);
  assert.equal(
    isAvatarMediaUrl("https://img.example/creative.jpg?w=s60x600"),
    false,
  );
});
