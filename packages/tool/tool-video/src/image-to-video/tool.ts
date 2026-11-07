import type { Session } from "@openai-harness/session";
import fs from "fs";
import path from "path";
import { materializeAttachment, saveAttachment } from "@openai-harness/attachment-r2";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export const DEFAULT_BYTEPLUS_MODEL = "dreamina-seedance-2-0-260128";

export interface VideoClipSpec {
  seq: number;
  imagePath: string;
  prompt: string;
  script: string;
  duration: number;
}

export interface GeneratedClipResult {
  seq: number;
  attachmentUrl: string;
  /**
   * `image` when the anchor frame was used as the first frame; `text` when the
   * provider refused the frame as a real-person image and the shot was
   * rendered from the prompt alone instead.
   */
  mode: "image" | "text";
}

async function resolveImageDataUrl(
  imagePathOrUrl: string,
  userId?: string,
): Promise<string> {
  const trimmed = imagePathOrUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const res = await fetch(trimmed);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch image from URL: ${trimmed} (HTTP ${res.status})`,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType =
      res.headers.get("content-type") ||
      (trimmed.endsWith(".png") ? "image/png" : "image/jpeg");
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  }

  if (!userId) {
    throw new Error("imageToVideo requires an authenticated tenant.");
  }

  const targetPath = await materializeAttachment(trimmed, userId);
  const fileBuffer = fs.readFileSync(targetPath);
  const ext = path.extname(targetPath).toLowerCase();
  const mimeType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";

  return `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
}

export const imageToVideoTool = defineTool({
  name: "imageToVideo",
  description:
    "Prerequisite: video-ad skill is a prerequisite.\n\n" +
    "Generate video motion from anchor still images using AI Image-to-Video (I2V) motion generation with BytePlus SeaDance. " +
    "Accepts a 'clips' array of one or more shots (e.g. 1 shot for a single clip, or 2 to 10 shots for continuous motion/promos) rendered concurrently in parallel. " +
    "Produces realistic cinematic human motion and speech articulation. Video clips are 4, 5, 6, or 10 seconds long. " +
    "BytePlus refuses anchor frames that contain a person; when that happens the shot is rendered from its prompt as text-to-video and reported with mode 'text'.",
  // The internal wait is 240s per task; clips poll in parallel, so the tool
  // budget must outlive that wait plus submission and download.
  timeoutMs: 300000,
  isConcurrencySafe: () => false,
  parameters: {
    clips: {
      type: "array",
      required: true,
      description:
        "Array of video clips to generate (pass 1 clip for single generation, or 2 to 10 clips for continuous multi-shot promos). All clips render concurrently in parallel.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          seq: {
            type: "number",
            required: true,
            description:
              "1-based sequence order in the story/timeline (1, 2, 3...).",
          },
          imagePath: {
            type: "string",
            required: true,
            description:
              "Attachment id (`sha256:<hex>`), '/api/attachments/<attachmentId>' URL, or remote http(s) URL of the anchor still image.",
          },
          prompt: {
            type: "string",
            required: true,
            description:
              'Motion description prompt (e.g. "Direct eye contact, smiling warmly, articulate hand gesture").',
          },
          script: {
            type: "string",
            required: true,
            description:
              "Spoken dialogue for this shot. Injected to coordinate natural lip synchronization and mouth movements.",
          },
          duration: {
            type: "number",
            required: true,
            enum: [4, 5, 6, 10],
            description: "Target duration in seconds (4, 5, 6, or 10).",
          },
        },
      },
    },
    aspectRatio: {
      type: "string",
      enum: ["9:16", "16:9", "1:1"],
      description:
        'Advisory only: the output ratio follows the anchor image ratio (e.g. "9:16"). Not sent to the model.',
    },
    resolution: {
      type: "string",
      enum: ["480p", "720p", "1080p"],
      description:
        'Video resolution quality tier for all clips (e.g. "720p", "1080p").',
    },
    storage: {
      type: "string",
      enum: ["tmp", "artifact"],
      description:
        "Storage tier for all clips: 'tmp' (default) for intermediate draft clips; 'artifact' for permanent deliverables.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string", required: true },
        clips: {
          type: "array",
          required: true,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              seq: { type: "number", required: true },
              attachmentUrl: { type: "string", required: true },
              mode: {
                type: "string",
                required: true,
                enum: ["image", "text"],
              },
            },
          },
        },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ clips: value.clips }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "execute",
    title: `Generate video motion (${args.clips?.length ?? 0} clips)`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "execute",
    title: `Video motion generated (${((result.meta as any)?.clips || []).length} clips)`,
    content: result.content,
  }),
  async execute(args, exec) {
    const rawClips = Array.isArray(args.clips) ? args.clips : [];
    if (rawClips.length === 0) {
      throw new Error(
        "No clips provided. Specify at least 1 clip: { clips: [{ seq: 1, imagePath: '...', prompt: '...', script: '...', duration: 5 }] }",
      );
    }

    const apiKey = process.env.BYTEPLUS_API_KEY;
    if (!apiKey) {
      throw new Error(
        "BYTEPLUS_API_KEY environment variable is missing. SeaDance video motion requires a valid BytePlus API key.",
      );
    }

    // Ark's video route is `/contents/generations/tasks`; the `.byteplus.com`
    // host does not resolve — only `.bytepluses.com` does. Both are mirrored
    // from the reference harness.
    const baseUrl = (
      process.env.BYTEPLUS_BASE_URL ||
      "https://ark.ap-southeast.bytepluses.com/api/v3"
    ).replace(/\/+$/, "");
    const taskEndpoint = `${baseUrl}/contents/generations/tasks`;

    const model =
      process.env.BYTEPLUS_VIDEO_MODEL ||
      process.env.BYTEPLUS_MODEL ||
      DEFAULT_BYTEPLUS_MODEL;
    const validRatio = args.aspectRatio || "9:16";
    const validResolution = args.resolution || "720p";
    const targetStorage = args.storage || "tmp";

    const sortedClips = [...rawClips].sort(
      (a, b) => (a.seq ?? 0) - (b.seq ?? 0),
    );

    const submitPromises = sortedClips.map(async (clip, idx) => {
      const seq = clip.seq ?? idx + 1;
      const validDuration = [4, 5, 6, 10].includes(Number(clip.duration))
        ? Number(clip.duration)
        : 5;

      const imageDataUrl = await resolveImageDataUrl(
        clip.imagePath,
        toolSession<Session>(exec).userId,
      );

      let composedPrompt = clip.prompt.trim();
      if (clip.script && clip.script.trim()) {
        composedPrompt += ` Natural speaking articulation and expression while delivering the dialogue: "${clip.script.trim()}".`;
      }

      const requestPayload = {
        model,
        content: [
          {
            type: "text",
            text: composedPrompt,
          },
          {
            type: "image_url",
            image_url: {
              url: imageDataUrl,
              role: "first_frame",
            },
          },
        ],
        // No `ratio` with a first-frame image: Seedance derives the output
        // ratio from the anchor image and rejects the parameter otherwise.
        resolution: validResolution,
        duration: validDuration,
        generate_audio: true,
      };

      const submitTask = (payload: Record<string, unknown>) =>
        fetch(taskEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal: exec.signal,
          body: JSON.stringify(payload),
        });

      let mode: "image" | "text" = "image";
      let payload: Record<string, unknown> = requestPayload;
      let submitRes = await submitTask(payload);

      if (!submitRes.ok) {
        const errText = await submitRes.text().catch(() => "");
        // Seedance refuses any photo-like human face as the first frame — the
        // input-image moderation fires on generated faces too, and no model
        // variant lifts it. Re-submit the shot as text-to-video from the same
        // prompt so the shot still renders.
        const isPrivacy =
          errText.includes("PrivacyInformation") ||
          errText.includes("SensitiveContentDetected") ||
          errText.includes("may contain real person");
        // The account can only call model endpoints activated in the Ark
        // console; a closed one is retried with the configured alternate.
        const isClosedEndpoint =
          errText.includes("InvalidEndpoint") ||
          errText.includes("ClosedEndpoint");
        const configuredFallback = process.env.BYTEPLUS_VIDEO_FALLBACK_MODEL?.trim();

        if (isPrivacy) {
          mode = "text";
          payload = {
            model,
            content: [{ type: "text", text: composedPrompt }],
            // Text-to-video has no anchor frame, so the ratio must be given.
            ratio: validRatio,
            resolution: validResolution,
            duration: validDuration,
            generate_audio: true,
          };
          submitRes = await submitTask(payload);
        } else if (
          isClosedEndpoint &&
          configuredFallback &&
          configuredFallback !== model
        ) {
          payload = { ...requestPayload, model: configuredFallback };
          submitRes = await submitTask(payload);
        }

        if (!submitRes.ok) {
          const finalErr = await submitRes.text().catch(() => errText);
          const hint = isClosedEndpoint
            ? ` The model endpoint "${model}" is closed for this BytePlus account: activate it in the Ark console, or set BYTEPLUS_VIDEO_MODEL / BYTEPLUS_VIDEO_FALLBACK_MODEL to an activated model.`
            : "";
          throw new Error(
            `Clip ${seq} task submission failed (HTTP ${submitRes.status}): ${finalErr}${hint}`,
          );
        }
      }

      const submitJson = (await submitRes.json()) as {
        id?: string;
        task_id?: string;
      };
      const taskId = submitJson.id || submitJson.task_id;
      if (!taskId) {
        throw new Error(`Clip ${seq}: API did not return a valid task ID.`);
      }

      return {
        seq,
        taskId,
        validDuration,
        payload,
        mode,
        audioRetried: false,
      };
    });

    // One bad anchor image must not discard the other shots: submission runs
    // settled, and only the failed shot is reported back for a retry.
    const submittedResults = await Promise.allSettled(submitPromises);
    const submittedTasks: Array<{
      seq: number;
      taskId: string;
      validDuration: number;
      payload: Record<string, unknown>;
      mode: "image" | "text";
      audioRetried: boolean;
    }> = [];
    const failures: string[] = [];

    submittedResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        submittedTasks.push(result.value);
      } else {
        const seq = sortedClips[index]?.seq ?? index + 1;
        const msg =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        failures.push(`- Shot (seq: ${seq}) was not submitted: ${msg}`);
      }
    });

    if (submittedTasks.length === 0) {
      throw new Error(
        `No clip could be submitted to the video API:\n${failures.join("\n")}`,
      );
    }

    const MAX_WAIT_MS = 240000;
    const POLL_INTERVAL_MS = 3000;

    const pollTask = async (
      task: (typeof submittedTasks)[0],
    ): Promise<GeneratedClipResult> => {
      // Re-submitting after an audio-policy failure restarts the clock.
      let deadline = Date.now() + MAX_WAIT_MS;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        const pollRes = await fetch(`${taskEndpoint}/${task.taskId}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          signal: exec.signal,
        });

        if (!pollRes.ok) continue;

        const pollJson = (await pollRes.json()) as {
          status?: string;
          content?:
            | { video_url?: string; url?: string }
            | Array<{ video_url?: string; url?: string }>;
          result?: { video_url?: string; url?: string };
          error?: { message?: string } | string;
        };

        const status = pollJson.status;
        if (status === "succeeded") {
          const content = Array.isArray(pollJson.content)
            ? pollJson.content[0]
            : (pollJson.content ?? pollJson.result);
          const videoUrl = content?.video_url ?? content?.url;
          if (!videoUrl) {
            throw new Error(
              `Clip ${task.seq}: Task succeeded but no video URL was returned.`,
            );
          }

          const vidRes = await fetch(videoUrl, { signal: exec.signal });
          if (!vidRes.ok) {
            throw new Error(
              `Clip ${task.seq}: Failed to download completed video (HTTP ${vidRes.status}).`,
            );
          }
          const vidArrayBuf = await vidRes.arrayBuffer();
          const vidBuffer = Buffer.from(vidArrayBuf);

          const saved = await saveAttachment({
            buffer: vidBuffer,
            filename: `clip_${task.seq}.mp4`,
            mediaType: "video/mp4",
            storage: targetStorage,
            userId: toolSession<Session>(exec).userId,
          });

          return {
            seq: task.seq,
            attachmentUrl: saved.url,
            mode: task.mode,
          };
        }

        if (status === "failed" || status === "cancelled") {
          const failureMsg =
            typeof pollJson.error === "string"
              ? pollJson.error
              : pollJson.error?.message || JSON.stringify(pollJson.error || {});

          // The model's own soundtrack can trip the copyright filter after the
          // video itself passed; re-run once without generated audio.
          const isAudioRejection = /OutputAudioSensitiveContentDetected/.test(
            failureMsg,
          );
          if (
            isAudioRejection &&
            !task.audioRetried &&
            task.payload.generate_audio === true
          ) {
            task.audioRetried = true;
            const retryRes = await fetch(taskEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              signal: exec.signal,
              body: JSON.stringify({ ...task.payload, generate_audio: false }),
            });
            if (retryRes.ok) {
              const retryJson = (await retryRes.json()) as {
                id?: string;
                task_id?: string;
              };
              const retryId = retryJson.id || retryJson.task_id;
              if (retryId) {
                task.taskId = retryId;
                deadline = Date.now() + MAX_WAIT_MS;
                continue;
              }
            }
          }

          throw new Error(
            `Clip ${task.seq} generation ${status}: ${failureMsg}`,
          );
        }
      }

      throw new Error(
        `Clip ${task.seq} generation timed out after ${MAX_WAIT_MS / 1000}s.`,
      );
    };

    // Successful shots are kept and saved even when a sibling shot fails; the
    // failed ones are named in the summary so only those need regenerating.
    const pollResults = await Promise.allSettled(submittedTasks.map(pollTask));
    const clips: GeneratedClipResult[] = [];
    pollResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        clips.push(result.value);
      } else {
        const seq = submittedTasks[index]?.seq ?? index + 1;
        const msg =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        failures.push(`- Shot (seq: ${seq}) failed: ${msg}`);
      }
    });

    if (clips.length === 0) {
      throw new Error(`All clip generations failed:\n${failures.join("\n")}`);
    }

    clips.sort((a, b) => a.seq - b.seq);

    const lines: string[] = [];
    if (failures.length === 0) {
      lines.push(
        clips.length > 1
          ? `Batch video motion completed: ${clips.length} clip(s) generated concurrently in parallel.`
          : `Video motion generated successfully (seq: ${clips[0]?.seq ?? 1}).`,
      );
    } else {
      lines.push(
        `Video motion partially completed: ${clips.length} of ${clips.length + failures.length} clip(s) generated.`,
      );
    }
    lines.push(
      ...clips.map(
        (c) =>
          `- Shot (seq: ${c.seq}): ${c.attachmentUrl}${
            c.mode === "text"
              ? " — rendered from the prompt (BytePlus refused the anchor frame as a real-person image)"
              : ""
          }`,
      ),
    );

    if (failures.length > 0) {
      lines.push(
        `\n### Failed Shots\n${failures.join("\n")}`,
        `\nRegenerate only the failed shots listed above; the successful clips are already stored.`,
      );
    } else {
      lines.push(
        `\nAll ${clips.length} clip(s) are assembled in sequence. Proceed with downstream FFmpeg processing.`,
      );
    }

    return {
      summary: lines.join("\n"),
      clips,
    };
  },
});
