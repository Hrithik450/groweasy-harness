/**
 * `imageToVideo` — BytePlus SeaDance motion generation.
 *
 * One call renders one or more shots concurrently; each shot is either driven
 * by an anchor still or rendered from its prompt alone when the subject is a
 * real human the provider would refuse as a first frame.
 */

import { generateVideoClips } from "@/lib/services/video.generator";

export interface ImageToVideoClipArgs {
  seq: number;
  imagePath?: string;
  prompt: string;
  script?: string;
  duration: number;
}

export interface ImageToVideoMotionArgs {
  clips: ImageToVideoClipArgs[];
  aspectRatio?: string;
  resolution?: "480p" | "720p" | "1080p";
  storage?: "tmp" | "artifact";
}

export const imageToVideoMotionToolDefinition = {
  type: "function" as const,
  name: "imageToVideo",
  preSkills: "video-ad",
  description:
    "Prerequisite: video-ad skill is a prerequisite.\n\n" +
    "Renders video motion from anchor stills (or from the prompt alone), using BytePlus SeaDance. " +
    "Pass a `clips` array of 1–10 shots; they render concurrently. " +
    "Clips render at 4, 5, 6 or 10 seconds; a 2.5s request renders at 4s and is trimmed to exactly 2.5s. " +
    "Omit `imagePath` for any shot whose subject is a real human: the provider moderates faces out of first frames, and a refused frame is retried as text-to-video with the same prompt (reported as mode 'text'). " +
    "Returns the attachment URL for every rendered clip.",
  parameters: {
    type: "object",
    properties: {
      clips: {
        type: "array",
        description:
          "1 to 10 shots. One entry for a single clip, several for a multi-shot spot.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            seq: {
              type: "number",
              description: "1-based order in the timeline.",
            },
            imagePath: {
              type: "string",
              description:
                "Anchor still: '/api/attachments/<id>' URL or an https URL. Omit for real-human shots and text-to-video; required for products, interiors and b-roll.",
            },
            prompt: {
              type: "string",
              description:
                "Motion description: subject movement, camera, light, wardrobe and setting.",
            },
            script: {
              type: "string",
              description:
                "Spoken dialogue for this shot; drives natural lip articulation.",
            },
            duration: {
              type: "number",
              enum: [2.5, 4, 5, 6, 10],
              description:
                "Seconds. 2.5 renders at 4s and is trimmed to exactly 2.5s (60 frames at 24fps).",
            },
          },
          required: ["seq", "prompt", "duration"],
        },
      },
      aspectRatio: {
        type: "string",
        enum: ["9:16", "16:9", "1:1"],
        description:
          "Ratio for text-to-video shots; anchored shots follow the image ratio.",
      },
      resolution: {
        type: "string",
        enum: ["480p", "720p", "1080p"],
      },
      storage: {
        type: "string",
        enum: ["tmp", "artifact"],
        description:
          "'tmp' for intermediate shots (default), 'artifact' for the final deliverable.",
      },
    },
    required: ["clips"],
  },
} as const;

export interface ImageToVideoMotionResult {
  clips: { seq: number; attachmentUrl: string; mode: "image" | "text" }[];
  failures: string[];
}

export async function executeImageToVideoMotion(
  args: ImageToVideoMotionArgs,
): Promise<ImageToVideoMotionResult> {
  return generateVideoClips({
    clips: args.clips,
    aspectRatio: args.aspectRatio,
    resolution: args.resolution,
    storage: args.storage,
  });
}
