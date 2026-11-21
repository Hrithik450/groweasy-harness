---
name: video-service-config
description: "How to query and drive the deployed video-model services: available models, the priority model, assets, asynchronous jobs, per-shot versions, retries, and downloads."
---

## Rules

- **The service owns the models.** Never call a video provider directly and never assume a model's limits; ask the service.
- **Ask before submitting.** Call `generateVideo` with `action: "models"`: it returns each service's capability lists and the full request schemas (`schemas.assets`, `schemas.render`, `schemas.retry`). Build the body from those schemas, not from memory. Call `action: "health"` on the service you plan to use.
- **Validated before sending.** `ingest`, `submit`, and `retry` bodies are preflighted for shape and against the service's capability lists; a rejected body never reaches the provider.
- **Priority first.** If the user does not name a model, use the service marked `priority: true`. If there is no priority flag, use the first service returned.
- **Jobs are asynchronous.** `submit` returns a job id. Poll with `job`, or call `wait` when the turn should block. Never assume a render finished because submit succeeded.
- **Retry shots, not the job.** Use `retry` with the failed shots and their overrides; it creates a new version. Inspect `shot` with `version` to compare versions.
- **Download through the service.** The `download` action returns the service's direct media URL. Use that URL as the creative `mediaUrl`; do not download and re-store it.

## Quick reference

| Need | Action |
| --- | --- |
| Services, models, priority | `models` |
| Liveness of one service | `health` |
| Upload stills and get asset ids | `ingest` → `body: [{ kind: "image", input_url, mime_type }]` |
| Check one asset | `asset` → `assetId` |
| Submit a job | `submit` → `body: { shots, seed, quality, aspect_ratio }` |
| Job + shot statuses | `job` → `jobId` |
| One shot, one version | `shot` → `jobId`, `shotId`, `version` |
| Re-run failed shots | `retry` → `jobId`, `body: { shots: [{ id, index, ...overrides }] }` |
| Block until settled | `wait` → `jobId`, `timeoutSeconds` |
| Clip or full job zip URL | `download` → `jobId`, optional `shotId`/`version` |

## Shape of a job

```json
{
  "shots": [
    {
      "index": 0,
      "image_id": "<from ingest — omit only for text-only models>",
      "prompt": "visual direction only: motion, camera, light, wardrobe, setting",
      "narration": "spoken words for this shot, if any",
      "duration": 4
    }
  ],
  "seed": 7001,
  "quality": "1080p",
  "aspect_ratio": "9/16"
}
```

- `index` is the caller's cut order, echoed back in job status.
- `duration` must be one the model supports; `models` is the source of truth.
- `quality` and `aspect_ratio` must be in that model's capability list. Unsupported values fail at submit; do not try to coerce them.
- `prompt` is **visual direction only**. `narration` is the **spoken line only**. Never mix dialogue into `prompt` or visual direction into `narration`.
- Generated audio ships inside the returned `.mp4`; there is no separate audio field, track, or URL.
- A human on camera is never a first frame where the provider moderates faces. Send the prompt alone (`image_id` omitted) for those shots, and keep the still only as the approval artefact.

## Reading results

- `job` returns each shot's `id`, `index`, `status` (`pending | done | error`), `version`, `error`, and settings used.
- A failed shot names its own error. Retry only that shot with `retry`; keep the successful shots untouched.
- `download` without `shotId` returns a URL to a zip of every finished shot; with `shotId` it returns that clip URL. Save that URL as the media reference.

## Failure handling

- `health` failing: stop and report the service is down.
- `submit` rejecting a value: re-read `models`, correct the value, resubmit a new job. Do not retry the same invalid body.
- A shot `error`: retry that shot once with a corrected prompt or overrides. If it fails again, report the error and keep the other shots.
- Never invent a job id, shot id, asset id, version, or download URL.
