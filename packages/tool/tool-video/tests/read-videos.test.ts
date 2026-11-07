import test from "node:test";
import assert from "node:assert/strict";

import { buildAnalysisText } from "../src/read-videos/tool";
import type { VideoPipelineResult } from "../src/video.client";

function pipelineResult(
  overrides: Partial<VideoPipelineResult> = {},
): VideoPipelineResult {
  return {
    metadata: {
      durationSeconds: 20.2,
      width: 1080,
      height: 1920,
      fps: 30,
      aspectRatio: "9:16",
      hasAudio: true,
      hasVideo: true,
      videoCodec: "h264",
      audioCodec: "aac",
      sizeBytes: 1_000_000,
      format: "mp4",
    },
    transcript: {
      language: "en",
      fullText: "hello from the ad",
      segments: [],
    },
    keyframes: [
      {
        index: 0,
        timestampSeconds: 0,
        timestampLabel: "00:00",
        detailLevel: "high",
        base64Jpeg: "AAAA",
        mimeType: "image/jpeg",
      },
      {
        index: 1,
        timestampSeconds: 2,
        timestampLabel: "00:02",
        detailLevel: "low",
        base64Jpeg: "BBBB",
        mimeType: "image/jpeg",
      },
    ],
    stats: { keyframeCount: 2, estimatedVisionTokens: 340, hasTranscript: true },
    summaryText:
      '### 📹 Video Analysis Package\n\n**Spoken Transcript (Whisper-1)**\n- 00:00: "hello from the ad"\n\n**Visual Timeline (2 keyframes attached below)**',
    ...overrides,
  };
}

test("the pipeline summary is used verbatim, never the transcript object", () => {
  const text = buildAnalysisText(
    1,
    1,
    "/data/ad.mp4",
    " [Full Video]",
    pipelineResult(),
    2,
    0,
  );

  assert.match(text, /hello from the ad/);
  assert.match(text, /Visual Timeline \(2 keyframes attached below\)/);
  assert.ok(!text.includes("[object Object]"));
});

test("a missing summary falls back to transcript.fullText", () => {
  const text = buildAnalysisText(
    1,
    1,
    "/data/ad.mp4",
    " [Full Video]",
    pipelineResult({ summaryText: "" }),
    0,
    0,
  );

  assert.match(text, /Transcript: "hello from the ad"/);
  assert.ok(!text.includes("[object Object]"));
});

test("keyframes beyond the image budget are reported, not silently dropped", () => {
  const text = buildAnalysisText(
    2,
    3,
    "/data/ad.mp4",
    " [Segment: 0s → 5s]",
    pipelineResult(),
    1,
    0,
  );

  assert.match(text, /1 of 2 keyframes were not attached/);
});
