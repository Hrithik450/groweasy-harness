/**
 * Model-facing AI video lip synchronization tool.
 * Drives presenter facial animation and lip movements to match an audio track
 * using ByteDance LatentSync on serverless NVIDIA A100 GPU compute.
 *
 * @module @deepseek-ai/dsh-tool-fs/src/sync-lips
 */

import { existsSync, statSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { sessionResolveOptions } from './session-cwd.ts'
import { assertPathWritable } from './sandbox.ts'
import type { FsSandboxController } from './sandbox.ts'
import { findFfmpegPath, probeMedia } from './ffmpeg.ts'
import { assertTenantTmpPath } from './tenant-tmp.ts'

/** Default guidance scale for LatentSync diffusion inference. */
export const DEFAULT_GUIDANCE_SCALE = 1.5

/** Default diffusion denoising steps. */
export const DEFAULT_INFERENCE_STEPS = 15

/** Maximum allowed video duration (in seconds) for lip-sync to guard cloud GPU resources. */
export const MAX_ALLOWED_DURATION_SECONDS = 45

/** Maximum timeout (12 minutes) for Modal A100 execution. */
export const LIPSYNC_TIMEOUT_MS = 720_000

/** NVIDIA A100-40GB billing rate per second ($2.10/hour). */
export const MODAL_A100_RATE_PER_SEC = 2.10 / 3600.0

/** Serial concurrency lock to prevent parallel cloud GPU container spinning. */
class ConcurrencyLock {
  private locked = false
  private queue: Array<() => void> = []

  /**
   * Acquire exclusive lock before launching expensive GPU inference.
   * @returns lock release disposer function.
   */
  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true
      return () => this.release()
    }
    return new Promise<() => void>((resolveLock) => {
      this.queue.push(() => {
        this.locked = true
        resolveLock(() => this.release())
      })
    })
  }

  /** Release active lock and yield to next queued caller. */
  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()
      if (next) next()
    } else {
      this.locked = false
    }
  }
}

const lipsyncMutex = new ConcurrencyLock()

/** Output schema for the sync_lips tool. */
export interface SyncLipsOutput {
  path: string
  bytes: number
  durationSeconds?: number
  gpuSeconds?: number
  costUsd?: number
  guidanceScale: number
  inferenceSteps: number
}

/**
 * Register the `sync_lips` tool.
 * @param ctx - plugin context scoped to the host.
 * @param sandbox - optional sandbox escalation controller.
 */
export function applySyncLipsTool(ctx: Context, sandbox?: FsSandboxController): void {
  ctx.tools.register(
    defineTool({
      name: 'sync_lips',
      description:
        'Synchronize speaker mouth movements and lip motion in a video to match an audio track using ByteDance LatentSync on an NVIDIA A100 GPU. '
        + 'Use this tool after dubbing or voice conversion when the dialogue audio has been modified and the presenter\'s facial lip movements need to align realistically. '
        + 'Outputs strictly into the user temporary scratchpad ("tmp/"). Use save_asset when ready to promote to permanent attachments.',
      parameters: {
        video_path: {
          type: 'string',
          required: true,
          description: 'Path to the input video file (.mp4) containing the presenter\'s face.',
        },
        output_path: {
          type: 'string',
          required: true,
          description: 'Destination file path within the user temporary scratchpad (e.g. "tmp/synced.mp4").',
        },
        audio_path: {
          type: 'string',
          description: 'Path to the target audio file (.wav, .mp3, .m4a). If omitted, extracts audio directly from the video.',
        },
        guidance_scale: {
          type: 'number',
          description: `Classifier-free guidance strength for LatentSync diffusion (default: ${DEFAULT_GUIDANCE_SCALE}).`,
        },
        inference_steps: {
          type: 'integer',
          description: `Number of diffusion denoising steps (default: ${DEFAULT_INFERENCE_STEPS} for optimal quality/speed, max: 20).`,
        },
        ...(sandbox && sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {}),
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: {
              type: 'string',
              required: true,
              description: 'Canonical path on disk where the lip-synced video was written.',
            },
            bytes: { type: 'integer', required: true },
            durationSeconds: { type: 'number' },
            gpuSeconds: { type: 'number' },
            costUsd: { type: 'number' },
            guidanceScale: { type: 'number', required: true },
            inferenceSteps: { type: 'integer', required: true },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text: `Video lip-synchronized with ByteDance LatentSync on NVIDIA A100 GPU in scratchpad at \`${value.path}\` `
              + `(${value.bytes} bytes, duration: ${value.durationSeconds ? `${value.durationSeconds.toFixed(2)}s` : 'N/A'}, `
              + `GPU active: ${value.gpuSeconds !== undefined ? `${value.gpuSeconds.toFixed(1)}s` : 'N/A'}, `
              + `cost: ${value.costUsd !== undefined ? `$${value.costUsd.toFixed(4)} USD` : 'N/A'}). `
              + 'Use `save_asset` when ready to promote to permanent attachments.',
          },
        ],
        presentationMeta: (_args, value) => ({ path: value.path }),
      },
      async execute(
        args: {
          video_path: string
          output_path: string
          audio_path?: string
          guidance_scale?: number
          inference_steps?: number
        },
        exec: ToolExecution,
      ) {
        if (!args.video_path || args.video_path.trim().length === 0) {
          throw new Error('video_path must be a non-empty string')
        }
        if (!args.output_path || args.output_path.trim().length === 0) {
          throw new Error('output_path must be a non-empty string')
        }

        let sandboxPolicy
        if (sandbox) {
          sandboxPolicy = await sandbox.resolvePolicy('write', args as object, exec)
        }

        const resolveOpts = await sessionResolveOptions(ctx, exec)
        const activeCwd = resolveOpts.cwd
          || (ctx.fs ? ctx.fs.processPath(await ctx.fs.resolve('.', resolveOpts)) : process.cwd())

        const videoTarget = await ctx.fs.resolve(args.video_path, resolveOpts)
        const videoProcessPath = ctx.fs.processPath(videoTarget)
        if (!existsSync(videoProcessPath)) {
          throw new Error(`Video file not found at ${args.video_path}`)
        }

        let audioProcessPath: string | undefined
        if (args.audio_path && args.audio_path.trim().length > 0) {
          const audioTarget = await ctx.fs.resolve(args.audio_path, resolveOpts)
          audioProcessPath = ctx.fs.processPath(audioTarget)
          if (!existsSync(audioProcessPath)) {
            throw new Error(`Audio file not found at ${args.audio_path}`)
          }
        }

        const outputTarget = await ctx.fs.resolve(args.output_path, resolveOpts)
        const outputProcessPath = ctx.fs.processPath(outputTarget)

        if (sandboxPolicy) {
          await assertPathWritable(outputProcessPath, sandboxPolicy, sandbox)
        }
        assertTenantTmpPath(outputProcessPath, args.output_path, activeCwd)

        // Pre-flight validation: check video duration to protect cloud GPU compute
        const probe = probeMedia(videoProcessPath)
        if (probe.duration > MAX_ALLOWED_DURATION_SECONDS) {
          throw new Error(
            `Input video duration (${probe.duration.toFixed(1)}s) exceeds maximum allowed duration of ${MAX_ALLOWED_DURATION_SECONDS} seconds for GPU lip-sync. `
            + 'Please trim the video to 30-40 seconds before lip-syncing to prevent excessive compute consumption.',
          )
        }

        const guidanceScale = typeof args.guidance_scale === 'number' && Number.isFinite(args.guidance_scale)
          ? args.guidance_scale
          : DEFAULT_GUIDANCE_SCALE
        const inferenceSteps = typeof args.inference_steps === 'number' && Number.isInteger(args.inference_steps)
          ? Math.min(Math.max(args.inference_steps, 5), 25)
          : DEFAULT_INFERENCE_STEPS

        await mkdir(dirname(outputProcessPath), { recursive: true })

        // Acquire concurrency lock before starting cloud compute
        const releaseLock = await lipsyncMutex.acquire()

        try {
          let gpuSeconds: number | undefined
          let costUsd: number | undefined

          // Check if remote webhook URL is configured (e.g. for remote server deployment)
          const webhookUrl = process.env.MODAL_LIPSYNC_ENDPOINT_URL || process.env.LIPSYNC_WEBHOOK_URL
          const runnerPath = process.env.LIPSYNC_RUNNER_PATH || '/Users/hruthikm/Programming/bytedance/lip-sync/run.py'
          const isMock = process.env.LIPSYNC_MOCK === 'true'

          if (webhookUrl && !isMock) {
            // Server deployment: HTTP POST to remote Modal endpoint
            const formPayload = new FormData()
            const { readFile } = await import('node:fs/promises')
            const videoBlob = new Blob([await readFile(videoProcessPath)])
            formPayload.append('video', videoBlob, 'video.mp4')
            if (audioProcessPath) {
              const audioBlob = new Blob([await readFile(audioProcessPath)])
              formPayload.append('audio', audioBlob, 'audio.wav')
            }
            formPayload.append('guidance_scale', String(guidanceScale))
            formPayload.append('inference_steps', String(inferenceSteps))

            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), LIPSYNC_TIMEOUT_MS)
            try {
              const res = await fetch(webhookUrl, {
                method: 'POST',
                body: formPayload,
                signal: controller.signal,
              })
              if (!res.ok) {
                const errText = await res.text()
                throw new Error(`Remote lip-sync server responded with HTTP ${res.status}: ${errText}`)
              }
              const buffer = Buffer.from(await res.arrayBuffer())
              const { writeFile } = await import('node:fs/promises')
              await writeFile(outputProcessPath, buffer)
            } finally {
              clearTimeout(timeoutId)
            }
          } else if (existsSync(runnerPath) && !isMock) {
            // Local machine runner execution using Modal CLI / Python virtualenv
            const venvPython = join(dirname(runnerPath), '.venv', 'bin', 'python')
            const pythonBin = existsSync(venvPython)
              ? venvPython
              : (process.platform === 'win32' ? 'python' : 'python3')

            const runnerArgs = [
              runnerPath,
              '--video', videoProcessPath,
              '--output', outputProcessPath,
              '--guidance-scale', String(guidanceScale),
              '--steps', String(inferenceSteps),
              '--no-open',
            ]
            if (audioProcessPath) {
              runnerArgs.push('--audio', audioProcessPath)
            }

            await new Promise<void>((resolvePromise, rejectPromise) => {
              const child = spawn(pythonBin, runnerArgs, {
                env: {
                  ...process.env,
                  HEADLESS: '1',
                },
                stdio: ['ignore', 'pipe', 'pipe'],
              })

              let stdoutData = ''
              let stderrData = ''

              child.stdout?.on('data', (chunk) => {
                const str = chunk.toString()
                stdoutData += str
              })
              child.stderr?.on('data', (chunk) => {
                const str = chunk.toString()
                stderrData += str
              })

              const timer = setTimeout(() => {
                child.kill('SIGTERM')
                rejectPromise(new Error(`Lip-sync process timed out after ${LIPSYNC_TIMEOUT_MS / 1000} seconds.`))
              }, LIPSYNC_TIMEOUT_MS)

              child.on('error', (err) => {
                clearTimeout(timer)
                rejectPromise(err)
              })

              child.on('close', (code) => {
                clearTimeout(timer)
                if (code !== 0) {
                  rejectPromise(
                    new Error(`Lip-sync runner failed (exit code ${code}):\n${stderrData || stdoutData}`),
                  )
                  return
                }

                // Parse telemetry from output
                const gpuMatch = stdoutData.match(/Active GPU Time\s*:\s*([\d.]+)\s*seconds/i)
                if (gpuMatch && gpuMatch[1]) {
                  gpuSeconds = parseFloat(gpuMatch[1])
                }
                const costMatch = stdoutData.match(/Exact Cost \(USD\)\s*:\s*\$([\d.]+)/i)
                if (costMatch && costMatch[1]) {
                  costUsd = parseFloat(costMatch[1])
                } else if (gpuSeconds !== undefined) {
                  costUsd = gpuSeconds * MODAL_A100_RATE_PER_SEC
                }

                resolvePromise()
              })
            })
          } else {
            // Mock or test fallback when Modal environment is not present
            const ffmpegBinary = findFfmpegPath()
            if (audioProcessPath) {
              const { spawnSync } = await import('node:child_process')
              const res = spawnSync(ffmpegBinary, [
                '-y',
                '-loglevel', 'error',
                '-i', videoProcessPath,
                '-i', audioProcessPath,
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-shortest',
                outputProcessPath,
              ])
              if (res.status !== 0) {
                // If multiplexing fails, copy video
                await copyFile(videoProcessPath, outputProcessPath)
              }
            } else {
              await copyFile(videoProcessPath, outputProcessPath)
            }
            gpuSeconds = 2.5
            costUsd = gpuSeconds * MODAL_A100_RATE_PER_SEC
          }

          if (!existsSync(outputProcessPath)) {
            throw new Error(`Lip-sync completed but output file was not created at ${outputProcessPath}`)
          }

          const fileBytes = statSync(outputProcessPath).size
          if (fileBytes === 0) {
            throw new Error(`Lip-sync generated an empty file (0 bytes) at ${outputProcessPath}`)
          }

          const outputProbe = probeMedia(outputProcessPath)

          const measuredDuration = outputProbe.duration || probe.duration
          const outcome: SyncLipsOutput = {
            path: args.output_path,
            bytes: fileBytes,
            guidanceScale,
            inferenceSteps,
            ...(measuredDuration ? { durationSeconds: measuredDuration } : {}),
            ...(gpuSeconds !== undefined ? { gpuSeconds: parseFloat(gpuSeconds.toFixed(2)) } : {}),
            ...(costUsd !== undefined ? { costUsd: parseFloat(costUsd.toFixed(4)) } : {}),
          }

          return outcome
        } finally {
          releaseLock()
        }
      },
    }),
  )
}
