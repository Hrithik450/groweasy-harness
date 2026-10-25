/**
 * Model-facing multi-lingual audio dubbing tool.
 * Synthesizes localized dialogue with commercial pacing and phonetic brand normalization.
 * Note: Changing languages alters phonetic syllable cadence; a subsequent lip-sync step
 * re-aligns the speaker's mouth movements to the new audio track.
 * @module @deepseek-ai/dsh-tool-fs/src/dub-audio
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { GenericCallView, ToolExecution } from "@deepseek-ai/dsh-tools";
import { sessionResolveOptions } from "./session-cwd.ts";
import { findFfmpegPath } from "./ffmpeg.ts";
import { assertPathWritable } from "./sandbox.ts";
import type { FsSandboxController } from "./sandbox.ts";
import { resolveTenantTmp } from "./tenant-tmp.ts";
import { persistAttachment } from "./cas.ts";

/** Supported curated dubbing voice persona keys. */
export type DubVoicePersona =
  | "aarav"
  | "rushi"
  | "lovinder"
  | "mohit"
  | "shivraj";

/** Curated voice persona catalog for dubbing. */
export const DUBBING_VOICE_CATALOG: Readonly<
  Record<DubVoicePersona, { id: string; name: string; description: string }>
> = {
  aarav: {
    id: "x9wViLHrpGxKBhkUybpR",
    name: "Aarav R",
    description:
      "Deep, energetic, punchy Hindi delivery with commercial josh (ideal for marketing ads)",
  },
  rushi: {
    id: "fEQJjEw1p6Y1eTj9o3mB",
    name: "Rushi",
    description: "Modern tech and conversational social Hindi voice",
  },
  lovinder: {
    id: "2EEkWvP67s3GZtC63Y74",
    name: "Lovinder",
    description: "Warm, trustworthy, and friendly Hindi male delivery",
  },
  mohit: {
    id: "Z14F75yYc73D1wJp8u5N",
    name: "Mohit",
    description: "Expressive and dynamic conversational Hindi voice",
  },
  shivraj: {
    id: "6OWR66phKIqiCowCgr7X",
    name: "Shivraj",
    description: "Conversational, energetic Indian English delivery",
  },
};

/** Default voice persona for dubbing. */
export const DEFAULT_DUB_VOICE = "aarav";

/**
 * Resolve a dubbing voice persona alias or pass through an explicit voice identifier.
 * @param voice - voice persona name or 20-character voice identifier.
 * @returns canonical voice identifier.
 */
export function resolveDubbingVoiceId(voice: string | undefined): string {
  const normalized = (voice || DEFAULT_DUB_VOICE).trim().toLowerCase();
  if (normalized in DUBBING_VOICE_CATALOG) {
    return DUBBING_VOICE_CATALOG[normalized as DubVoicePersona].id;
  }
  return voice?.trim() || DUBBING_VOICE_CATALOG[DEFAULT_DUB_VOICE].id;
}

/**
 * Normalize script text to ensure phonetic clarity for domain names and currencies.
 * @param script - raw dialogue script.
 * @returns phonetically normalized text for speech synthesis.
 */
export function normalizeScriptForSpeech(script: string): string {
  let normalized = script;
  normalized = normalized.replace(/\b([a-zA-Z0-9_-]+)\.ai\b/gi, "$1 dot A.I.");
  normalized = normalized.replace(/\b([a-zA-Z0-9_-]+)\.io\b/gi, "$1 dot I.O.");
  normalized = normalized.replace(/\b([a-zA-Z0-9_-]+)\.com\b/gi, "$1 dot com");
  normalized = normalized.replace(
    /₹\s*(\d+(?:,\d+)*(?:\.\d+)?)/g,
    (_match, num) => `${num.replace(/,/g, "")} rupees`,
  );
  return normalized.trim();
}

/** Output schema for the dub_audio tool. */
export interface DubAudioOutput {
  path: string;
  attachmentId?: string;
  voice: string;
  voiceId: string;
  bytes: number;
  durationSeconds?: number;
  conformedToTargetDuration: boolean;
}

/**
 * Register the `dub_audio` tool.
 * @param ctx - plugin context scoped to the host.
 * @param sandbox - optional sandbox-escalation controller.
 */
export function applyDubAudioTool(
  ctx: Context,
  sandbox?: FsSandboxController,
): void {
  ctx.tools.register(
    defineTool({
      name: "dub_audio",
      description:
        "Dub speech into a different language (e.g. Hindi, English) or synthesize localized dialogue for video. " +
        "Use this tool when translating content into a new language or replacing dialogue with a new script. " +
        "Note: Because changing languages alters syllable counts and speech cadence, a subsequent lip-sync step " +
        "is needed to re-align the speaker mouth movements.",
      parameters: {
        script: {
          type: "string",
          required: true,
          description:
            "Spoken dialogue or translated script to dub (e.g. in Hindi or English).",
        },
        output_path: {
          type: "string",
          required: true,
          description:
            "Destination file path for the dubbed audio (.mp3 or .wav).",
        },
        voice: {
          type: "string",
          enum: ["aarav", "rushi", "lovinder", "mohit", "shivraj"],
          description:
            "Target voice persona for the dub (default: aarav for energetic Hindi ads). Or a custom voice identifier.",
        },
        target_duration: {
          type: "number",
          description:
            "Target video duration in seconds. When provided, the tool normalizes tempo if the generated speech exceeds the duration slot.",
        },
        ...(sandbox && sandbox.escalationModes.length > 0
          ? sandbox.schemaFields()
          : {}),
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: {
              type: "string",
              required: true,
              description:
                "Canonical path on disk where the dubbed audio was written.",
            },
            attachmentId: { type: "string" },
            voice: { type: "string", required: true },
            voiceId: { type: "string", required: true },
            bytes: { type: "integer", required: true },
            durationSeconds: { type: "number" },
            conformedToTargetDuration: { type: "boolean", required: true },
          },
        },
        render: (_args, value) => [
          {
            type: "text",
            text: value.conformedToTargetDuration
              ? `Audio dubbed with voice \`${value.voice}\` at \`${value.path}\` (${value.bytes} bytes, duration: ${value.durationSeconds?.toFixed(2)}s conformed to target duration). Ready for lip-sync.`
              : `Audio dubbed with voice \`${value.voice}\` at \`${value.path}\` (${value.bytes} bytes, duration: ${value.durationSeconds?.toFixed(2)}s). Ready for lip-sync.`,
          },
        ],
        presentationMeta: (_args, value) => ({ path: value.path }),
      },
      async execute(
        args: {
          script: string;
          output_path: string;
          voice?: string;
          target_duration?: number;
        },
        exec: ToolExecution,
      ) {
        if (args.script.trim().length === 0)
          throw new Error("script must be a non-empty string");
        if (args.output_path.trim().length === 0)
          throw new Error("output_path must be a non-empty string");

        let sandboxPolicy;
        if (sandbox) {
          sandboxPolicy = await sandbox.resolvePolicy("write", args as object, exec);
        }

        const apiKey =
          process.env.ELEVENLABS_API_KEY ||
          process.env.VOICE_CONVERSION_API_KEY;
        if (!apiKey) {
          throw new Error(
            "ELEVENLABS_API_KEY environment variable is required for audio dubbing.",
          );
        }

        const resolveOpts = await sessionResolveOptions(ctx, exec);
        const outputTarget = await ctx.fs.resolve(
          args.output_path,
          resolveOpts,
        );
        const outputProcessPath = ctx.fs.processPath(outputTarget);
        if (sandboxPolicy) {
          await assertPathWritable(outputProcessPath, sandboxPolicy, sandbox);
        }

        const voiceId = resolveDubbingVoiceId(args.voice);
        const voiceName = args.voice?.trim() || DEFAULT_DUB_VOICE;
        const normalizedScript = normalizeScriptForSpeech(args.script);

        const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
          signal: exec.signal,
          body: JSON.stringify({
            text: normalizedScript,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(
            `Audio dubbing API HTTP ${response.status}: ${errText}`,
          );
        }

        let audioBuffer = Buffer.from(await response.arrayBuffer());
        if (audioBuffer.byteLength === 0) {
          throw new Error("Audio dubbing returned empty audio payload.");
        }

        const ffmpeg = findFfmpegPath();
        const ffprobe = ffmpeg.replace(/ffmpeg(?:\.exe)?$/u, "ffprobe");

        const tempDir = join(
          resolveTenantTmp(outputProcessPath),
          `dsh_dub_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        );
        await mkdir(tempDir, { recursive: true });
        try {
          const rawAudioPath = join(tempDir, "raw.mp3");
          await writeFile(rawAudioPath, audioBuffer);

          let measuredDuration: number | undefined;
          let conformed = false;

          if (existsSync(ffprobe)) {
            const probeRes = spawnSync(ffprobe, [
              "-v",
              "error",
              "-show_entries",
              "format=duration",
              "-of",
              "default=noprint_wrappers=1:nokey=1",
              rawAudioPath,
            ]);
            if (probeRes.status === 0) {
              const parsed = parseFloat(probeRes.stdout.toString().trim());
              if (!Number.isNaN(parsed) && parsed > 0) {
                measuredDuration = parsed;
              }
            }
          }

          // If target duration is specified and generated audio overflows target by up to 35%
          if (
            args.target_duration !== undefined &&
            args.target_duration > 0 &&
            measuredDuration !== undefined
          ) {
            if (measuredDuration > args.target_duration) {
              const ratio = measuredDuration / args.target_duration;
              if (ratio <= 1.35) {
                const conformedPath = join(tempDir, "conformed.mp3");
                const atempoVal = Math.min(ratio, 2.0).toFixed(4);
                const tempoRes = spawnSync(ffmpeg, [
                  "-y",
                  "-i",
                  rawAudioPath,
                  "-filter:a",
                  `atempo=${atempoVal}`,
                  conformedPath,
                ]);
                if (tempoRes.status === 0 && existsSync(conformedPath)) {
                  audioBuffer = await readFile(conformedPath);
                  measuredDuration = args.target_duration;
                  conformed = true;
                }
              }
            }
          }

          await mkdir(dirname(outputProcessPath), { recursive: true });
          await writeFile(outputProcessPath, audioBuffer);

          let attachmentId: string | undefined;
          try {
            const stored = await persistAttachment(
              ctx,
              audioBuffer,
              "audio",
              "audio/mpeg",
              basename(outputProcessPath),
            );
            attachmentId = stored.attachmentId;
          } catch {
            // Fallback
          }

          const outcome: DubAudioOutput = {
            path: outputProcessPath,
            ...(attachmentId !== undefined ? { attachmentId } : {}),
            voice: voiceName,
            voiceId,
            bytes: audioBuffer.byteLength,
            conformedToTargetDuration: conformed,
            ...(measuredDuration !== undefined
              ? { durationSeconds: measuredDuration }
              : {}),
          };
          return outcome;
        } finally {
          await rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }
      },
      presentCall(args): GenericCallView {
        return {
          card: "generic",
          title: `Dub audio: ${args.output_path}`,
          kind: "edit",
          locations: [{ path: args.output_path }],
        };
      },
      presentResult(args, outcome) {
        return {
          card: "generic",
          title: outcome.isError
            ? `Failed to dub audio: ${args.output_path}`
            : `Dubbed audio (${args.voice || DEFAULT_DUB_VOICE}): ${args.output_path}`,
          content: outcome.content,
        };
      },
    }),
  );
}
