/**
 * `generateVideo` — query and drive the deployed video-model pipelines.
 *
 * The service contract is uniform: assets, render jobs, per-shot versions,
 * retries and downloads. This tool is the thin model-facing layer; provider
 * logic lives in the services.
 *
 * @module @/lib/tools/video/service/tool
 */

import { toolFailure as failure } from "@/lib/tools/utils";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import {
  callVideoServiceJson,
  getVideoCapabilities,
  VIDEO_SERVICES,
  resolveVideoService,
  validateAgainstCapabilities,
  validateVideoRequestBody,
} from "@/lib/services/video.service";

export const generateVideoToolDefinition = {
  type: "function" as const,
  name: "generateVideo",
  preSkills: "video-service-config, video-ad",
  description:
    "Query and drive the deployed video-model services. Actions: models, health, ingest, asset, submit, job, shot, retry, wait, download. Jobs are asynchronous: submit returns a job id, then poll job (or wait), retry individual shots, and download a clip. Read the video-service-config skill before using it.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "models",
          "health",
          "ingest",
          "asset",
          "submit",
          "job",
          "shot",
          "retry",
          "wait",
          "download",
        ],
        description: "What to do.",
      },
      service: {
        type: "string",
        description:
          "Service id from `models`. Omit to use the priority service.",
      },
      assetId: {
        type: "string",
        description: "Asset id for `asset`.",
      },
      jobId: {
        type: "string",
        description: "Job id for `job`, `shot`, `retry`, `wait`, `download`.",
      },
      shotId: {
        type: "string",
        description: "Shot id for `shot` and clip `download`.",
      },
      version: {
        type: "number",
        description: "Shot version for `shot` / `download`.",
      },
      body: {
        description:
          "Request body for `ingest` (array of uploads), `submit` (shots, seed, quality, aspect_ratio), or `retry` ({ shots: [...] }).",
        oneOf: [
          { type: "object", additionalProperties: true },
          {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        ],
      },
      timeoutSeconds: {
        type: "number",
        description:
          "For `wait`: give up after this many seconds (default 600).",
      },
    },
    required: ["action"],
  },
} as const;

export interface GenerateVideoArgs {
  action:
    | "models"
    | "health"
    | "ingest"
    | "asset"
    | "submit"
    | "job"
    | "shot"
    | "retry"
    | "wait"
    | "download";
  service?: string;
  assetId?: string;
  jobId?: string;
  shotId?: string;
  version?: number;
  body?: unknown;
  timeoutSeconds?: number;
}

function clipPath(args: GenerateVideoArgs): string {
  const jobId = args.jobId?.trim();
  const shotId = args.shotId?.trim();
  if (!jobId) throw new Error("jobId is required for download.");
  if (shotId) {
    return `/v1/jobs/${encodeURIComponent(jobId)}/shots/${encodeURIComponent(
      shotId,
    )}/download${args.version ? `?version=${args.version}` : ""}`;
  }
  return `/v1/jobs/${encodeURIComponent(jobId)}/download`;
}

export async function executeGenerateVideoTool(
  input: ToolInput<GenerateVideoArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const args = input.args;
  if (!args?.action) return failure("The 'action' parameter is required.");

  try {
    const service = resolveVideoService(args.service);

    switch (args.action) {
      case "models": {
        const services = await Promise.all(
          VIDEO_SERVICES.map(async (row) => {
            let capabilities: unknown = null;
            try {
              capabilities = await callVideoServiceJson(row, "/v1/models", {
                timeoutMs: 8_000,
              });
            } catch {
              // Older services have no catalog endpoint; the id still works.
            }
            return {
              id: row.id,
              label: row.label,
              priority: row.priority === true,
              models: row.models ?? [],
              capabilities,
            };
          }),
        );
        return text(JSON.stringify({ services }, null, 2));
      }

      case "health": {
        const data = await callVideoServiceJson(service, "/v1/health");
        return text(
          JSON.stringify({ service: service.id, health: data }, null, 2),
        );
      }

      case "ingest": {
        if (args.body === undefined) {
          return failure("A body (array of uploads) is required for ingest.");
        }
        validateVideoRequestBody("ingest", args.body);
        const data = await callVideoServiceJson(service, "/v1/assets", {
          method: "POST",
          body: args.body,
        });
        return text(JSON.stringify(data, null, 2));
      }

      case "asset": {
        if (!args.assetId?.trim()) {
          return failure("assetId is required for asset.");
        }
        const data = await callVideoServiceJson(
          service,
          `/v1/assets/${encodeURIComponent(args.assetId.trim())}`,
        );
        return text(JSON.stringify(data, null, 2));
      }

      case "submit": {
        if (args.body === undefined) {
          return failure("A body is required for submit.");
        }
        validateVideoRequestBody("submit", args.body);
        validateAgainstCapabilities(
          args.body,
          await getVideoCapabilities(service),
        );
        const data = await callVideoServiceJson(service, "/v1/render", {
          method: "POST",
          body: args.body,
        });
        return text(JSON.stringify(data, null, 2));
      }

      case "job": {
        if (!args.jobId?.trim()) return failure("jobId is required for job.");
        const data = await callVideoServiceJson(
          service,
          `/v1/jobs/${encodeURIComponent(args.jobId.trim())}`,
        );
        return text(JSON.stringify(data, null, 2));
      }

      case "shot": {
        if (!args.jobId?.trim() || !args.shotId?.trim()) {
          return failure("jobId and shotId are required for shot.");
        }
        const suffix = args.version ? `?version=${args.version}` : "";
        const data = await callVideoServiceJson(
          service,
          `/v1/jobs/${encodeURIComponent(args.jobId.trim())}/shots/${encodeURIComponent(
            args.shotId.trim(),
          )}${suffix}`,
        );
        return text(JSON.stringify(data, null, 2));
      }

      case "retry": {
        if (!args.jobId?.trim() || args.body === undefined) {
          return failure("jobId and body are required for retry.");
        }
        validateVideoRequestBody("retry", args.body);
        validateAgainstCapabilities(
          args.body,
          await getVideoCapabilities(service),
        );
        const data = await callVideoServiceJson(
          service,
          `/v1/jobs/${encodeURIComponent(args.jobId.trim())}/retry`,
          { method: "POST", body: args.body },
        );
        return text(JSON.stringify(data, null, 2));
      }

      case "wait": {
        if (!args.jobId?.trim()) return failure("jobId is required for wait.");
        const jobId = args.jobId.trim();
        const deadline = Date.now() + (args.timeoutSeconds ?? 600) * 1000;

        while (Date.now() < deadline) {
          const job = await callVideoServiceJson<{
            shots?: Array<{ status?: string }>;
          }>(service, `/v1/jobs/${encodeURIComponent(jobId)}`);
          const pending = (job.shots ?? []).some(
            (shot) => shot.status === "pending",
          );
          if (!pending) return text(JSON.stringify(job, null, 2));
          await new Promise((resolve) => setTimeout(resolve, 10_000));
        }

        return failure(`Job ${jobId} still has pending shots after the wait.`);
      }

      case "download": {
        // The service's own URL is the media URL; no second copy is stored.
        const path = clipPath(args);
        return text(
          JSON.stringify(
            {
              service: service.id,
              url: `${service.url}${path}`,
              kind: args.shotId ? "clip" : "zip",
            },
            null,
            2,
          ),
        );
      }

      default:
        return failure(`Unknown action "${String(args.action)}".`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(message);
  }
}

function text(value: string): ToolOutput<{
  contentParts: Array<InputContentParam>;
}> {
  return {
    success: true,
    data: { contentParts: [{ type: "input_text", text: value }] },
  };
}
