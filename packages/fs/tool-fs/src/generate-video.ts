/**
 * Model-facing AI video motion generation tool.
 * Generates cinematic image-to-video motion from anchor images,
 * persists the output directly to the content-addressed attachment store,
 * and presents interactive video playback in the chat UI.
 * @module @deepseek-ai/dsh-tool-fs/src/generate-video
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolExecution } from '@deepseek-ai/dsh-tools'
import { sessionResolveOptions } from './session-cwd.ts'
import { assertPathWritable } from './sandbox.ts'
import type { FsSandboxController } from './sandbox.ts'
import { findFfmpegPath, probeMedia } from './ffmpeg.ts'
import { resolveTenantDshHome, resolveTenantTmp, assertTenantTmpPath } from './tenant-tmp.ts'

/** Default model used for video generation. */
export const DEFAULT_BYTEPLUS_MODEL = 'seedance-1-5-pro-251215'

/** Output schema for the generate_video tool. */
export interface GenerateVideoOutput {
  path: string
  attachmentId?: string
  duration: number
  width: number
  height: number
  bytes: number
  mediaType: string
}

/** Payload schema from task polling endpoint. */
interface BytePlusTaskPollResponse {
  id?: string
  task_id?: string
  status?: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  content?: Array<{ video_url?: string; url?: string }> | { video_url?: string; url?: string }
  result?: { video_url?: string; url?: string }
  error?: unknown
}

/**
 * Trim video buffer using FFmpeg to discard head settling artifacts.
 * @param inputBuffer - raw MP4 video buffer.
 * @param targetDuration - duration in seconds.
 * @param trimIn - head trim offset in seconds.
 * @param ffmpegPath - path to FFmpeg binary.
 * @returns trimmed MP4 buffer.
 */
function trimVideo(inputBuffer: Buffer<ArrayBufferLike>, targetDuration: number, trimIn: number, ffmpegPath: string): Buffer<ArrayBufferLike> {
  if (trimIn <= 0) return inputBuffer
  const tempDir = resolve(resolveTenantTmp(), `trim_${Date.now()}_${randomUUID()}`)
  try {
    mkdirSync(tempDir, { recursive: true })
    const inPath = join(tempDir, 'in.mp4')
    const outPath = join(tempDir, 'out.mp4')
    writeFileSync(inPath, inputBuffer)
    const res = spawnSync(ffmpegPath, [
      '-y',
      '-ss', String(trimIn),
      '-i', inPath,
      '-t', String(targetDuration),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      outPath,
    ])
    if (res.status === 0 && existsSync(outPath)) {
      return readFileSync(outPath)
    }
    return inputBuffer
  } catch {
    return inputBuffer
  } finally {
    try { rmSync(tempDir, { recursive: true, force: true }) } catch {}
  }
}

/**
 * Register the `generate_video` tool.
 * @param ctx - plugin context.
 * @param sandbox - optional sandbox-escalation controller.
 */
export function applyGenerateVideoTool(ctx: Context, sandbox?: FsSandboxController): void {
  ctx.tools.register(defineTool({
    name: 'generate_video',
    description: 'Generate video motion from an anchor still image using AI Image-to-Video (I2V) motion generation. '
      + 'Produces real cinematic human motion and speech articulation. Video clips are 4, 5, 6, or 10 seconds long.',
    parameters: {
      image_path: {
        type: 'string',
        required: true,
        description: 'Path or attachment ID (sha256:...) of the anchor still image for this shot.',
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'Motion description prompt (e.g. "Direct eye contact, smiling warmly, natural hand gesture").',
      },
      script: {
        type: 'string',
        description: 'Spoken dialogue for this shot. Injected to coordinate natural lip synchronization and mouth movements.',
      },
      duration: {
        type: 'number',
        enum: [4, 5, 6, 10],
        description: 'Target duration in seconds (4, 5, 6, or 10). Defaults to 4 seconds.',
      },
      aspect_ratio: {
        type: 'string',
        enum: ['9:16', '16:9', '1:1'],
        description: 'Target video aspect ratio. Defaults to "9:16".',
      },
      resolution: {
        type: 'string',
        enum: ['480p', '720p', '1080p'],
        description: 'Video resolution quality tier. Defaults to "480p".',
      },
      output_path: {
        type: 'string',
        description: 'Destination file path for the generated MP4 video (e.g. "output/shot1.mp4").',
      },
      trim_in: {
        type: 'number',
        description: 'Head offset in seconds to discard initial settling artifacts (default: 0).',
      },
      ...sandbox && sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {},
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true, description: 'Canonical path on disk where the video was written.' },
          attachmentId: { type: 'string' },
          duration: { type: 'number', required: true },
          width: { type: 'integer', required: true },
          height: { type: 'integer', required: true },
          bytes: { type: 'integer', required: true },
          mediaType: { type: 'string', required: true },
        },
      },
      render: (_args, value) => {
        return [
          {
            type: 'text',
            text: `Generated video clip saved to temporary scratchpad at \`${value.path}\` (${value.duration.toFixed(1)}s, ${value.width}x${value.height}, ${value.bytes} bytes). Use \`save_asset\` when ready to promote to permanent attachments.`,
          },
        ]
      },
      presentationMeta: (_args, value) => ({ path: value.path }),
    },
    async execute(
      args: {
        prompt: string
        image_path: string
        script?: string
        duration?: number
        aspect_ratio?: string
        resolution?: string
        output_path?: string
        trim_in?: number
      },
      exec: ToolExecution,
    ) {
      if (args.prompt.trim().length === 0) throw new Error('prompt must be a non-empty string')
      if (args.image_path.trim().length === 0) throw new Error('image_path must be a non-empty string')

      const apiKey = process.env.BYTEPLUS_API_KEY
      if (!apiKey) {
        throw new Error('BYTEPLUS_API_KEY environment variable is required to generate video motion.')
      }

      let sandboxPolicy
      if (sandbox) {
        sandboxPolicy = await sandbox.resolvePolicy('write', args as object, exec)
      }

      const validAspect = ['9:16', '16:9', '1:1'].includes(args.aspect_ratio || '') ? args.aspect_ratio! : '9:16'
      const validResolution = ['480p', '720p', '1080p'].includes(args.resolution || '') ? args.resolution! : '480p'
      const requestedDuration = Number(args.duration) || 4
      const validDuration = [4, 5, 6, 10].find(b => b >= requestedDuration) || 4

      // 1. Resolve image input to Base64 data URL
      let imageUrl = args.image_path.trim()
      if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:')) {
        let imageBuffer: Buffer
        if (imageUrl.startsWith('sha256:')) {
          const hash = imageUrl.slice(7)
          const dshHome = resolveTenantDshHome()
          let objectPath = join(dshHome, 'attachments', 'v1', 'objects', hash.slice(0, 2), hash)
          if (!existsSync(objectPath)) {
            const fallbackPath = join(resolveTenantTmp(), 'dsh-attachments', 'v1', 'objects', hash.slice(0, 2), hash)
            if (existsSync(fallbackPath)) {
              objectPath = fallbackPath
            } else {
              throw new Error(`Anchor image attachment not found at ${objectPath}`)
            }
          }
          imageBuffer = await readFile(objectPath)
        } else {
          const resolveOpts = await sessionResolveOptions(ctx, exec)
          const target = await ctx.fs.resolve(imageUrl, resolveOpts)
          const absPath = ctx.fs.processPath(target)
          if (!existsSync(absPath)) {
            throw new Error(`Anchor image file not found at ${imageUrl}`)
          }
          imageBuffer = await readFile(absPath)
        }
        const ext = extname(imageUrl).toLowerCase()
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png'
        imageUrl = `data:${mime};base64,${imageBuffer.toString('base64')}`
      }

      // 2. Augment motion prompt with spoken script
      let finalPrompt = args.prompt.trim()
      if (args.script && args.script.trim()) {
        const cleanDialogue = args.script.trim().replace(/^["']|["']$/g, '')
        finalPrompt = `${finalPrompt}. Character is speaking naturally to camera saying: "${cleanDialogue}". Natural lip movement, facial articulation, and realistic conversational speech dynamics.`
      }

      const rawBaseUrl = process.env.BYTEPLUS_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3'
      const baseUrl = rawBaseUrl.replace(/\/+$/, '')
      const model = process.env.BYTEPLUS_VIDEO_MODEL || DEFAULT_BYTEPLUS_MODEL
      const taskEndpoint = `${baseUrl}/contents/generations/tasks`

      // 3. Submit video generation task
      const submitRes = await fetch(taskEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: exec.signal,
        body: JSON.stringify({
          model,
          content: [
            { type: 'text', text: finalPrompt },
            { type: 'image_url', image_url: { url: imageUrl }, role: 'first_frame' },
          ],
          ratio: validAspect,
          resolution: validResolution,
          duration: validDuration,
          generate_audio: true,
        }),
      })

      if (!submitRes.ok) {
        const errText = await submitRes.text().catch(() => '')
        throw new Error(`Video motion API submission failed (HTTP ${submitRes.status}): ${errText}`)
      }

      const submitJson = (await submitRes.json()) as { id?: string; task_id?: string }
      const taskId = submitJson.id || submitJson.task_id
      if (!taskId) {
        throw new Error('Video motion API did not return a valid task ID.')
      }

      // 4. Poll task completion
      const pollEndpoint = `${taskEndpoint}/${taskId}`
      const MAX_WAIT_MS = 180000
      const POLL_INTERVAL_MS = 2500
      const pollStart = Date.now()
      let videoDownloadUrl = ''

      while (Date.now() - pollStart < MAX_WAIT_MS) {
        if (exec.signal.aborted) {
          throw new Error('Video generation was cancelled.')
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

        let pollJson: BytePlusTaskPollResponse | null = null
        try {
          const pollRes = await fetch(pollEndpoint, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: exec.signal,
          })
          if (!pollRes.ok) continue
          pollJson = (await pollRes.json()) as BytePlusTaskPollResponse
        } catch {
          continue
        }

        const status = pollJson?.status
        if (status === 'succeeded') {
          const content = Array.isArray(pollJson.content) ? pollJson.content[0] : (pollJson.content || pollJson.result)
          videoDownloadUrl = content?.video_url || content?.url || (typeof content === 'string' ? content : '')
          break
        } else if (status === 'failed' || status === 'cancelled') {
          const errorMsg = typeof pollJson.error === 'object' ? JSON.stringify(pollJson.error) : String(pollJson.error || 'Video rendering failed')
          throw new Error(`Video motion rendering ${status}: ${errorMsg}`)
        }
      }

      if (!videoDownloadUrl) {
        throw new Error(`Video motion generation timed out after ${MAX_WAIT_MS / 1000}s.`)
      }

      // 5. Download generated video bytes
      const dlRes = await fetch(videoDownloadUrl, { signal: exec.signal })
      if (!dlRes.ok) {
        throw new Error(`Failed to download rendered video (HTTP ${dlRes.status})`)
      }
      const arrayBuffer = await dlRes.arrayBuffer()
      let videoBuffer: Buffer<ArrayBufferLike> = Buffer.from(new Uint8Array(arrayBuffer))

      // 6. Apply head trim if requested
      const trimIn = args.trim_in || 0
      if (trimIn > 0) {
        const ffmpeg = findFfmpegPath()
        videoBuffer = trimVideo(videoBuffer, validDuration - trimIn, trimIn, ffmpeg)
      }

      let finalPath: string
      if (args.output_path) {
        const resolveOpts = await sessionResolveOptions(ctx, exec)
        const target = await ctx.fs.resolve(args.output_path, resolveOpts)
        finalPath = ctx.fs.processPath(target)
        const activeCwd = resolveOpts.cwd
          || (ctx.fs ? ctx.fs.processPath(await ctx.fs.resolve('.', resolveOpts)) : process.cwd())
        if (sandboxPolicy) {
          await assertPathWritable(finalPath, sandboxPolicy, sandbox)
        }
        assertTenantTmpPath(finalPath, args.output_path, activeCwd)
      } else {
        const resolveOpts = await sessionResolveOptions(ctx, exec)
        const activeCwd = resolveOpts.cwd
          || (ctx.fs ? ctx.fs.processPath(await ctx.fs.resolve('.', resolveOpts)) : process.cwd())
        const tenantTmp = resolveTenantTmp(activeCwd)
        finalPath = join(tenantTmp, `shot-${randomUUID().slice(0, 8)}.mp4`)
      }

      await mkdir(dirname(finalPath), { recursive: true })
      await writeFile(finalPath, videoBuffer)

      const probe = probeMedia(finalPath)
      const outcome: GenerateVideoOutput = {
        path: finalPath,
        duration: probe.duration || validDuration - trimIn,
        width: probe.width || (validAspect === '9:16' ? 1080 : 1920),
        height: probe.height || (validAspect === '9:16' ? 1920 : 1080),
        bytes: videoBuffer.byteLength,
        mediaType: 'video/mp4',
      }
      return outcome
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Generate video ${args.output_path || args.image_path}`,
        kind: 'edit',
        locations: [{ path: args.output_path || args.image_path }],
      }
    },
    presentResult(args, outcome) {
      return {
        card: 'generic',
        title: outcome.isError ? `Failed to generate video ${args.output_path || args.image_path}` : `Generated video ${args.output_path || args.image_path}`,
        content: outcome.content,
      }
    },
  }))
}
