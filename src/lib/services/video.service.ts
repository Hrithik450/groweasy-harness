/**
 * Thin client for the deployed video-model services.
 *
 * Each service exposes the same contract (`/v1/health`, `/v1/assets`,
 * `/v1/render`, `/v1/jobs/...`), so this module knows nothing about individual
 * models. The deployed services are a static list below; add one there when a
 * new model service ships.
 *
 * @module @/lib/services/video.service
 */

export interface VideoServiceConfig {
  id: string;
  label: string;
  url: string;
  apiKey?: string;
  priority?: boolean;
  models?: string[];
}

export interface VideoServiceEnvelope<T = unknown> {
  success: boolean;
  error: string | null;
  data: T | null;
}

/** The deployed video services, in priority order. */
export const VIDEO_SERVICES: readonly VideoServiceConfig[] = [
  {
    id: "seedance",
    label: "Seedance 2.0",
    url: "https://mhrithik450--seedance-2-0-api.us-east.modal.run",
    priority: true,
    models: ["dreamina-seedance-2-0-260128"],
  },
];

/** The service a call targets: named explicitly, else the priority one. */
export function resolveVideoService(id?: string): VideoServiceConfig {
  const services = VIDEO_SERVICES;
  if (!id) return services[0];
  const match = services.find((service) => service.id === id);
  if (!match) {
    throw new Error(
      `Unknown video service "${id}". Configured: ${services
        .map((service) => service.id)
        .join(", ")}.`,
    );
  }
  return match;
}

export interface VideoServiceRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Raw binary response (downloads). */
  binary?: boolean;
  timeoutMs?: number;
}

export async function callVideoService(
  service: VideoServiceConfig,
  path: string,
  options: VideoServiceRequestOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (service.apiKey) headers["X-API-Key"] = service.apiKey;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${service.url}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Video service ${service.id} returned HTTP ${res.status}: ${text.slice(0, 600)}`,
    );
  }
  return res;
}

/** JSON call unwrapped to the envelope's `data`. */
export async function callVideoServiceJson<T = unknown>(
  service: VideoServiceConfig,
  path: string,
  options: VideoServiceRequestOptions = {},
): Promise<T> {
  const res = await callVideoService(service, path, options);
  const body = (await res.json()) as VideoServiceEnvelope<T>;
  if (!body.success) {
    throw new Error(body.error || `Video service ${service.id} failed.`);
  }
  return body.data as T;
}

/** Capabilities are cheap and stable; one fetch per service per few minutes. */
const capabilityCache = new Map<string, { at: number; data: unknown }>();
const CAPABILITY_TTL_MS = 5 * 60 * 1000;

export async function getVideoCapabilities(
  service: VideoServiceConfig,
): Promise<unknown | null> {
  const cached = capabilityCache.get(service.id);
  if (cached && Date.now() - cached.at < CAPABILITY_TTL_MS) return cached.data;
  try {
    const data = await callVideoServiceJson(service, "/v1/models", {
      timeoutMs: 8_000,
    });
    capabilityCache.set(service.id, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, label);
}

function requireIndex(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

/** Preflight the shared request bodies before any bytes leave the process. */
export function validateVideoRequestBody(
  action: "ingest" | "submit" | "retry",
  body: unknown,
): void {
  if (action === "ingest") {
    if (!Array.isArray(body) || body.length === 0) {
      throw new Error("ingest body must be a non-empty array of uploads.");
    }
    body.forEach((item, i) => {
      if (!isRecord(item)) throw new Error(`uploads[${i}] must be an object.`);
      if (item.kind !== "image") {
        throw new Error(`uploads[${i}].kind must be "image".`);
      }
      const url = requireString(item.input_url, `uploads[${i}].input_url`);
      if (!/^https?:\/\//i.test(url)) {
        throw new Error(`uploads[${i}].input_url must be an http(s) URL.`);
      }
      requireString(item.mime_type, `uploads[${i}].mime_type`);
    });
    return;
  }

  if (!isRecord(body)) throw new Error(`${action} body must be an object.`);
  const shots = body.shots;
  if (!Array.isArray(shots) || shots.length === 0) {
    throw new Error(`${action} body requires a non-empty shots array.`);
  }

  const seen = new Set<number>();
  shots.forEach((shot, i) => {
    if (!isRecord(shot)) throw new Error(`shots[${i}] must be an object.`);
    if (action === "retry") {
      requireString(shot.id, `shots[${i}].id`);
    }
    const index = requireIndex(shot.index, `shots[${i}].index`);
    if (seen.has(index)) throw new Error(`shots[${i}].index is duplicated.`);
    seen.add(index);

    optionalString(shot.image_id, `shots[${i}].image_id`);
    optionalString(shot.prompt, `shots[${i}].prompt`);
    optionalString(shot.narration, `shots[${i}].narration`);
    if (shot.duration !== undefined) {
      if (typeof shot.duration !== "number" || !(shot.duration > 0)) {
        throw new Error(`shots[${i}].duration must be a positive number.`);
      }
    }
  });

  if (action === "submit") {
    for (const shot of shots as Array<Record<string, unknown>>) {
      requireString(shot.prompt, "shots[].prompt");
      if (typeof shot.duration !== "number") {
        throw new Error("shots[].duration is required on submit.");
      }
    }
    if (body.seed !== undefined && !Number.isInteger(body.seed)) {
      throw new Error("seed must be an integer.");
    }
    optionalString(body.quality, "quality");
    optionalString(body.aspect_ratio, "aspect_ratio");
  }
}

/** Check values against the service catalog when it publishes one. */
export function validateAgainstCapabilities(
  body: unknown,
  caps: unknown,
): void {
  if (!isRecord(body) || !Array.isArray(body.shots)) return;
  const models = isRecord(caps) ? caps.models : undefined;
  const model = Array.isArray(models) && isRecord(models[0]) ? models[0] : null;
  if (!model) return;

  const durations = Array.isArray(model.durations)
    ? model.durations.filter((d): d is number => typeof d === "number")
    : [];
  const resolutions = Array.isArray(model.resolutions)
    ? model.resolutions.filter((r): r is string => typeof r === "string")
    : [];
  const aspects = Array.isArray(model.aspect_ratios)
    ? model.aspect_ratios.filter((r): r is string => typeof r === "string")
    : [];

  for (const shot of body.shots as Array<unknown>) {
    if (!isRecord(shot) || typeof shot.duration !== "number") continue;
    if (durations.length > 0 && !durations.includes(shot.duration)) {
      throw new Error(
        `duration ${shot.duration} is not supported; use ${durations.join(", ")}.`,
      );
    }
  }

  if (
    resolutions.length > 0 &&
    typeof body.quality === "string" &&
    !resolutions.includes(body.quality)
  ) {
    throw new Error(
      `quality "${body.quality}" is not supported; use ${resolutions.join(", ")}.`,
    );
  }

  if (aspects.length > 0 && typeof body.aspect_ratio === "string") {
    const normalized = body.aspect_ratio.replace("/", ":");
    if (normalized !== "adaptive" && !aspects.includes(normalized)) {
      throw new Error(
        `aspect_ratio "${body.aspect_ratio}" is not supported; use ${aspects.join(", ")}.`,
      );
    }
  }
}
