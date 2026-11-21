/**
 * `syncLips` — OpenAI tool definition (this app's era).
 *
 * The executor posts to the app's own route; the heavy lifting (LatentSync)
 * runs behind it, so the tool layer stays free of model binaries.
 */

export interface SyncLipsArgs {
  videoPath: string;
  audioPath: string;
}


export const syncLipsToolDefinition = {
  type: "function" as const,
  name: "syncLips",
  description:
    "Re-syncs the mouth of a talking-head video to a different audio track. " +
    "Returns the attachment URL of the re-rendered clip.",
  parameters: {
    type: "object",
    properties: {
      videoPath: { type: "string", description: "Attachment URL of the source video." },
      audioPath: { type: "string", description: "Attachment URL of the target audio." },
    },
    required: ["videoPath", "audioPath"],
  },
} as const;

export async function executeSyncLips(args: SyncLipsArgs) {
  const res = await fetch("/api/video/sync-lips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const json = (await res.json()) as { data?: unknown; error?: string };
  if (!res.ok) throw new Error(json.error ?? `syncLips failed (HTTP ${res.status})`);
  return json.data;
}
