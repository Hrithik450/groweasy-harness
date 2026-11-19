/**
 * BytePlus SeaDance video motion generation.
 *
 * Submits one task per clip in parallel, polls to completion, trims requests
 * shorter than the provider's native lengths, and stores every clip in the
 * attachment store. A shot whose anchor frame is refused as a real-person
 * image is retried as text-to-video from the same prompt.
 *
 * @module @/lib/services/video.generator
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureScratchDir,
  getAttachmentStore,
  materializeAttachment,
  toAttachmentReceipt,
} from "@/lib/attachments";
import {
  executeFfmpeg,
  findFfmpegPath,
} from "@/lib/tools/composition/ffmpeg/probe";

export const DEFAULT_BYTEPLUS_MODEL = "dreamina-seedance-2-0-260128";

/** Lengths the provider renders; anything else renders longer, then is cut. */
const SUPPORTED_DURATIONS = [4, 5, 6, 10];

const MAX_WAIT_MS = 240_000;
const POLL_INTERVAL_MS = 3_000;

export interface VideoClipSpec {
  seq: number;
  /** Anchor still; omit for real-human shots and text-to-video. */
  imagePath?: string;
  prompt: string;
  /** Spoken dialogue for this shot. */
  script?: string;
  /** 2.5 renders at 4s and is trimmed to exactly 2.5s. */
  duration: number;
}

export interface GeneratedVideoClip {
  seq: number;
  attachmentUrl: string;
  /** `image` when the anchor frame drove the shot; `text` after a refusal. */
  mode: "image" | "text";
}

export interface GenerateVideoClipsOptions {
  clips: VideoClipSpec[];
  aspectRatio?: string;
  resolution?: "480p" | "720p" | "1080p";
  storage?: "tmp" | "artifact";
}

function providerConfig(): {
  apiKey: string;
  taskEndpoint: string;
  model: string;
} {
  const apiKey = process.env.BYTEPLUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BYTEPLUS_API_KEY is missing; video motion generation cannot run.",
    );
  }

  // Ark's video route; only the `.bytepluses.com` host resolves.
  const baseUrl = (
    process.env.BYTEPLUS_BASE_URL ||
    "https://ark.ap-southeast.bytepluses.com/api/v3"
  ).replace(/\/+$/, "");

  return {
    apiKey,
    taskEndpoint: `${baseUrl}/contents/generations/tasks`,
    model:
      process.env.BYTEPLUS_VIDEO_MODEL ||
      process.env.BYTEPLUS_MODEL ||
      DEFAULT_BYTEPLUS_MODEL,
  };
}

async function resolveImageDataUrl(imagePath: string): Promise<string> {
  const trimmed = imagePath.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const res = await fetch(trimmed);
    if (!res.ok) {
      throw new Error(`Failed to fetch anchor image (HTTP ${res.status}).`);
    }
    const contentType = res.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  }

  const localPath = await materializeAttachment(trimmed);
  const buffer = await fs.readFile(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const mimeType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/** Stream-copy trim: exact length, no re-encode, no quality loss. */
async function trimClip(
  buffer: Uint8Array,
  seconds: number,
): Promise<Buffer> {
  const scratch = await ensureScratchDir();
  const inputPath = path.join(scratch, `trim_in_${Date.now()}.mp4`);
  const outputPath = path.join(scratch, `trim_out_${Date.now()}.mp4`);
  await fs.writeFile(inputPath, buffer);
  try {
    await executeFfmpeg(
      [
        "-y",
        "-i",
        inputPath,
        "-t",
        seconds.toFixed(2),
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        outputPath,
      ],
      findFfmpegPath(),
    );
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(inputPath, { force: true });
    await fs.rm(outputPath, { force: true });
  }
}

interface SubmittedTask {
  seq: number;
  taskId: string;
  duration: number;
  trimTo: number | null;
  mode: "image" | "text";
  payload: Record<string, unknown>;
  audioRetried: boolean;
}

/** Generate every clip concurrently and store the rendered files. */
export async function generateVideoClips({
  clips,
  aspectRatio = "9:16",
  resolution = "720p",
  storage = "tmp",
}: GenerateVideoClipsOptions): Promise<{ clips: GeneratedVideoClip[]; failures: string[] }> {
  if (clips.length === 0) {
    throw new Error("No clips supplied.");
  }

  const { apiKey, taskEndpoint, model } = providerConfig();
  const auth = { Authorization: `Bearer ${apiKey}` };
  const sorted = [...clips].sort((a, b) => a.seq - b.seq);

  // Submit every shot; one bad anchor must not cancel its siblings.
  const submissions = await Promise.allSettled(
    sorted.map(async (clip): Promise<SubmittedTask> => {
      const requested = Number(clip.duration);
      const duration = SUPPORTED_DURATIONS.includes(requested)
        ? requested
        : requested < 4
          ? 4
          : 5;
      const trimTo =
        requested > 0 && requested !== duration ? requested : null;

      const anchor = clip.imagePath?.trim() ?? "";
      const imageDataUrl =
        anchor.length > 0 ? await resolveImageDataUrl(anchor) : null;

      let prompt = clip.prompt.trim();
      if (clip.script?.trim()) {
        prompt += ` Natural speaking articulation and expression while delivering the dialogue: "${clip.script.trim()}".`;
      }

      const withImage = {
        model,
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: imageDataUrl, role: "first_frame" },
          },
        ],
        resolution,
        duration,
        generate_audio: true,
      };
      const textOnly = {
        model,
        content: [{ type: "text", text: prompt }],
        ratio: aspectRatio,
        resolution,
        duration,
        generate_audio: true,
      };

      const submit = (payload: Record<string, unknown>) =>
        fetch(taskEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...auth },
          body: JSON.stringify(payload),
        });

      let mode: "image" | "text" = imageDataUrl === null ? "text" : "image";
      let payload = imageDataUrl === null ? textOnly : withImage;
      let res = await submit(payload);

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        const refusedFace =
          errorText.includes("PrivacyInformation") ||
          errorText.includes("SensitiveContentDetected") ||
          errorText.includes("may contain real person");
        const closedEndpoint =
          errorText.includes("InvalidEndpoint") ||
          errorText.includes("ClosedEndpoint");
        const fallbackModel = process.env.BYTEPLUS_VIDEO_FALLBACK_MODEL?.trim();

        if (refusedFace && imageDataUrl !== null) {
          mode = "text";
          payload = textOnly;
          res = await submit(payload);
        } else if (
          closedEndpoint &&
          fallbackModel &&
          fallbackModel !== model
        ) {
          payload = { ...payload, model: fallbackModel };
          res = await submit(payload);
        }

        if (!res.ok) {
          const finalText = await res.text().catch(() => errorText);
          throw new Error(
            `Clip ${clip.seq} submission failed (HTTP ${res.status}): ${finalText}`,
          );
        }
      }

      const json = (await res.json()) as { id?: string; task_id?: string };
      const taskId = json.id ?? json.task_id;
      if (!taskId) throw new Error(`Clip ${clip.seq}: no task id returned.`);

      return {
        seq: clip.seq,
        taskId,
        duration,
        trimTo,
        mode,
        payload,
        audioRetried: false,
      };
    }),
  );

  const tasks: SubmittedTask[] = [];
  const failures: string[] = [];
  submissions.forEach((result, index) => {
    if (result.status === "fulfilled") {
      tasks.push(result.value);
      return;
    }
    const seq = sorted[index]?.seq ?? index + 1;
    const reason =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
    failures.push(`- Shot ${seq} was not submitted: ${reason}`);
  });

  if (tasks.length === 0) {
    throw new Error(`No clip could be submitted:\n${failures.join("\n")}`);
  }

  const store = getAttachmentStore();

  const pollTask = async (task: SubmittedTask): Promise<GeneratedVideoClip> => {
    let deadline = Date.now() + MAX_WAIT_MS;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const res = await fetch(`${taskEndpoint}/${task.taskId}`, { headers: auth });
      if (!res.ok) continue;

      const json = (await res.json()) as {
        status?: string;
        content?:
          | { video_url?: string; url?: string }
          | Array<{ video_url?: string; url?: string }>;
        result?: { video_url?: string; url?: string };
        error?: { message?: string } | string;
      };

      if (json.status === "succeeded") {
        const content = Array.isArray(json.content)
          ? json.content[0]
          : (json.content ?? json.result);
        const videoUrl = content?.video_url ?? content?.url;
        if (!videoUrl) {
          throw new Error(`Clip ${task.seq}: no video URL returned.`);
        }

        const download = await fetch(videoUrl);
        if (!download.ok) {
          throw new Error(
            `Clip ${task.seq}: download failed (HTTP ${download.status}).`,
          );
        }

        let buffer: Uint8Array = Buffer.from(await download.arrayBuffer());
        if (task.trimTo !== null) {
          buffer = await trimClip(buffer, task.trimTo);
        }

        const name = `clip_${task.seq}.mp4`;
        const ref = await store.saveVideo({
          data: buffer,
          mediaType: "video/mp4",
          name,
        });
        const saved = toAttachmentReceipt(ref, "video/mp4", {
          storage,
          filename: name,
        });

        return { seq: task.seq, attachmentUrl: saved.url, mode: task.mode };
      }

      if (json.status === "failed" || json.status === "cancelled") {
        const message =
          typeof json.error === "string"
            ? json.error
            : json.error?.message ?? JSON.stringify(json.error ?? {});

        // The model's own soundtrack can trip a copyright filter after the
        // video passed; retry once with generated audio off.
        if (
          /OutputAudioSensitiveContentDetected/.test(message) &&
          !task.audioRetried &&
          task.payload.generate_audio === true
        ) {
          task.audioRetried = true;
          const retry = await fetch(taskEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...auth },
            body: JSON.stringify({ ...task.payload, generate_audio: false }),
          });
          if (retry.ok) {
            const retryJson = (await retry.json()) as {
              id?: string;
              task_id?: string;
            };
            const retryId = retryJson.id ?? retryJson.task_id;
            if (retryId) {
              task.taskId = retryId;
              deadline = Date.now() + MAX_WAIT_MS;
              continue;
            }
          }
        }

        throw new Error(`Clip ${task.seq} generation ${json.status}: ${message}`);
      }
    }

    throw new Error(`Clip ${task.seq} timed out after ${MAX_WAIT_MS / 1000}s.`);
  };

  const polls = await Promise.allSettled(tasks.map(pollTask));
  const rendered: GeneratedVideoClip[] = [];
  polls.forEach((result, index) => {
    if (result.status === "fulfilled") {
      rendered.push(result.value);
      return;
    }
    const seq = tasks[index]?.seq ?? index + 1;
    const reason =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
    failures.push(`- Shot ${seq} failed: ${reason}`);
  });

  if (rendered.length === 0) {
    throw new Error(`All clip generations failed:\n${failures.join("\n")}`);
  }

  return { clips: rendered.sort((a, b) => a.seq - b.seq), failures };
}
