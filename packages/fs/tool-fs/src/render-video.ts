/**
 * Model-facing video stitching and rendering tool.
 * Concatenates multiple video clips with transition crossfades,
 * multi-track audio mixing, and background music ducking.
 * @module @deepseek-ai/dsh-tool-fs/src/render-video
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { VideoAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolExecution } from '@deepseek-ai/dsh-tools'
import { sessionResolveOptions } from './session-cwd.ts'
import { assertPathWritable } from './sandbox.ts'
import type { FsSandboxController } from './sandbox.ts'
import { detectVideoEncoder, executeFfmpeg, findFfmpegPath, probeMedia } from './ffmpeg.ts'
import type { MediaProbeResult } from './ffmpeg.ts'
import { persistAttachment } from './cas.ts'
import { resolveTenantDshHome, resolveTenantTmp } from './tenant-tmp.ts'

/** Output schema for the render_video tool. */
export interface RenderVideoOutput {
  path: string
  attachmentId: string
  duration: number
  width: number
  height: number
  bytes: number
  mediaType: string
}

/** Supported visual transition types. */
export type VideoTransitionType = 'fade' | 'slideleft' | 'slideright' | 'smoothleft' | 'wipeleft' | 'none'

/** Resolved clip item with probed metadata. */
interface LocalClipInfo {
  path: string
  duration: number
  probe: MediaProbeResult
}

/**
 * Resolve a path or attachment ID to a local process path.
 * @param ctx - plugin context.
 * @param filePathOrId - file path or sha256:... identifier.
 * @param exec - tool execution context.
 * @returns absolute file system path.
 */
async function resolveMediaPath(ctx: Context, filePathOrId: string, exec: ToolExecution): Promise<string> {
  const trimmed = filePathOrId.trim()
  if (trimmed.startsWith('sha256:')) {
    const hash = trimmed.slice(7)
    const dshHome = resolveTenantDshHome()
    const objectPath = join(dshHome, 'attachments', 'v1', 'objects', hash.slice(0, 2), hash)
    if (existsSync(objectPath)) return objectPath
    const fallbackPath = join(resolveTenantTmp(), 'dsh-attachments', 'v1', 'objects', hash.slice(0, 2), hash)
    if (existsSync(fallbackPath)) return fallbackPath
    throw new Error(`Media attachment object not found for ${trimmed}`)
  }
  const resolveOpts = await sessionResolveOptions(ctx, exec)
  const target = await ctx.fs.resolve(trimmed, resolveOpts)
  const absPath = ctx.fs.processPath(target)
  if (!existsSync(absPath)) {
    throw new Error(`Media file not found at ${trimmed}`)
  }
  return absPath
}

/**
 * Register the `render_video` tool.
 * @param ctx - plugin context.
 * @param sandbox - optional sandbox-escalation controller.
 */
export function applyRenderVideoTool(ctx: Context, sandbox?: FsSandboxController): void {
  ctx.tools.register(defineTool({
    name: 'render_video',
    description: 'Stitch multiple video clips into a single continuous video with transition crossfades (fade, slideleft, smoothleft) '
      + 'and optional voiceover and background music ducking. Returns the final assembled video attachment.',
    parameters: {
      clips: {
        type: 'array',
        required: true,
        description: 'Ordered list of video clip paths or attachment IDs to stitch together in timeline sequence.',
      },
      output_path: {
        type: 'string',
        required: true,
        description: 'Destination file path for the stitched MP4 video (e.g. "output/final_ad.mp4").',
      },
      transition: {
        type: 'string',
        enum: ['fade', 'slideleft', 'slideright', 'smoothleft', 'wipeleft', 'none'],
        description: 'Visual transition between clips. Defaults to "fade".',
      },
      transition_duration: {
        type: 'number',
        description: 'Transition crossfade duration in seconds. Defaults to 0.3.',
      },
      voiceover_path: {
        type: 'string',
        description: 'Optional path or attachment ID for a voiceover narration audio track.',
      },
      music_path: {
        type: 'string',
        description: 'Optional path or attachment ID for background music.',
      },
      ducking_db: {
        type: 'number',
        description: 'Background music attenuation in decibels when voiceover is speaking (default: -18.0).',
      },
      canvas_width: {
        type: 'number',
        description: 'Output video width in pixels (default: 1080).',
      },
      canvas_height: {
        type: 'number',
        description: 'Output video height in pixels (default: 1920).',
      },
      fps: {
        type: 'number',
        description: 'Output video frame rate (default: 30).',
      },
      ...sandbox && sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {},
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true, description: 'Canonical path on disk where the rendered video was written.' },
          attachmentId: { type: 'string', required: true },
          duration: { type: 'number', required: true },
          width: { type: 'integer', required: true },
          height: { type: 'integer', required: true },
          bytes: { type: 'integer', required: true },
          mediaType: { type: 'string', required: true },
        },
      },
      render: (_args, value) => {
        const attachmentRef: VideoAttachmentRef = {
          attachmentId: AttachmentId(value.attachmentId),
          mediaType: value.mediaType as 'video/mp4',
          bytes: value.bytes,
          duration: value.duration,
          width: value.width,
          height: value.height,
          name: basename(value.path),
        }
        return [
          {
            type: 'text',
            text: `Rendered stitched video saved to \`${value.path}\` (${value.duration.toFixed(1)}s, ${value.width}x${value.height}, ${value.bytes} bytes).`,
          },
          {
            type: 'video',
            attachment: attachmentRef,
          },
        ]
      },
      presentationMeta: (_args, value) => ({ path: value.path }),
    },
    async execute(
      args: {
        clips: string[]
        output_path: string
        transition?: VideoTransitionType
        transition_duration?: number
        voiceover_path?: string
        music_path?: string
        ducking_db?: number
        canvas_width?: number
        canvas_height?: number
        fps?: number
      },
      exec: ToolExecution,
    ) {
      if (!Array.isArray(args.clips) || args.clips.length === 0) {
        throw new Error('clips must be a non-empty array of file paths or attachment IDs')
      }
      if (args.output_path.trim().length === 0) {
        throw new Error('output_path must be a non-empty string')
      }

      let sandboxPolicy
      if (sandbox) {
        sandboxPolicy = await sandbox.resolvePolicy('write', args as object, exec)
      }

      const width = args.canvas_width || 1080
      const height = args.canvas_height || 1920
      const fps = args.fps || 30
      const transitionType = args.transition || 'fade'
      const transitionDuration = args.transition_duration !== undefined ? Math.max(0, args.transition_duration) : 0.3

      const ffmpeg = findFfmpegPath()
      const encoder = detectVideoEncoder(ffmpeg)

      // 1. Resolve and probe all clip inputs
      const localClips: LocalClipInfo[] = []
      for (const clipRef of args.clips) {
        const clipPath = await resolveMediaPath(ctx, clipRef, exec)
        const probe = probeMedia(clipPath, ffmpeg)
        if (!probe.hasVideo || probe.duration <= 0) {
          throw new Error(`Invalid video stream in clip: ${clipRef}`)
        }
        localClips.push({
          path: clipPath,
          duration: probe.duration,
          probe,
        })
      }

      // 2. Resolve optional audio tracks
      let voPath: string | null = null
      if (args.voiceover_path) {
        voPath = await resolveMediaPath(ctx, args.voiceover_path, exec)
      }
      let musicPath: string | null = null
      if (args.music_path) {
        musicPath = await resolveMediaPath(ctx, args.music_path, exec)
      }

      // 3. Resolve destination path
      const resolveOpts = await sessionResolveOptions(ctx, exec)
      const outputTarget = await ctx.fs.resolve(args.output_path, resolveOpts)
      const outputProcessPath = ctx.fs.processPath(outputTarget)
      if (sandboxPolicy) {
        await assertPathWritable(outputProcessPath, sandboxPolicy, sandbox)
      }
      await mkdir(dirname(outputProcessPath), { recursive: true })

      // 4. Build FFmpeg command
      const ffmpegArgs: string[] = ['-y']
      localClips.forEach(c => {
        if (encoder.hwaccelArgs.length > 0) ffmpegArgs.push(...encoder.hwaccelArgs)
        ffmpegArgs.push('-i', c.path)
      })

      let voInputIndex = -1
      if (voPath) {
        voInputIndex = localClips.length
        ffmpegArgs.push('-i', voPath)
      }

      let musicInputIndex = -1
      if (musicPath) {
        musicInputIndex = voInputIndex !== -1 ? voInputIndex + 1 : localClips.length
        ffmpegArgs.push('-i', musicPath)
      }

      // 5. Construct Filtergraph
      const filtergraph: string[] = []
      for (let i = 0; i < localClips.length; i++) {
        const clip = localClips[i]
        if (!clip) continue
        filtergraph.push(
          `[${i}:v]trim=duration=${clip.duration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},setsar=1,format=yuv420p[v${i}]`,
        )
      }

      let currentOutputLabel = 'v0'
      const firstClip = localClips[0]
      if (!firstClip) throw new Error('No clips to render')
      let currentOffset = firstClip.duration

      if (localClips.length > 1 && transitionDuration > 0 && transitionType !== 'none') {
        for (let i = 1; i < localClips.length; i++) {
          const nextClip = localClips[i]
          if (!nextClip) continue
          const nextInputLabel = `v${i}`
          const xfadeOutLabel = `vx${i}`
          const offset = Math.max(0.1, currentOffset - transitionDuration)
          filtergraph.push(
            `[${currentOutputLabel}][${nextInputLabel}]xfade=transition=${transitionType}:duration=${transitionDuration}:offset=${offset.toFixed(2)}[${xfadeOutLabel}]`,
          )
          currentOutputLabel = xfadeOutLabel
          currentOffset = offset + nextClip.duration
        }
      } else if (localClips.length > 1) {
        const clipLabels = localClips.map((_, i) => `[v${i}]`).join('')
        filtergraph.push(`${clipLabels}concat=n=${localClips.length}:v=1:a=0[v_concat]`)
        currentOutputLabel = 'v_concat'
        currentOffset = localClips.reduce((sum, c) => sum + c.duration, 0)
      }

      // Audio mixing
      const audioOutputArgs: string[] = []
      if (voInputIndex !== -1 && musicInputIndex !== -1) {
        const duckingDb = args.ducking_db !== undefined ? args.ducking_db : -18.0
        filtergraph.push(
          `[${voInputIndex}:a]asplit=2[vo_sidechain][vo_mix]`,
          `[${musicInputIndex}:a]volume=${Math.pow(10, duckingDb / 20).toFixed(4)}[music_vol]`,
          `[music_vol][vo_sidechain]sidechaincompress=threshold=0.08:ratio=4:attack=20:release=300[ducked_music]`,
          `[ducked_music][vo_mix]amix=inputs=2:duration=longest:dropout_transition=2[mixed_audio]`,
          `[mixed_audio]loudnorm=I=-14:TP=-1.5:LRA=11[a_out]`,
        )
        audioOutputArgs.push('-map', '[a_out]')
      } else if (voInputIndex !== -1) {
        audioOutputArgs.push('-map', `${voInputIndex}:a`)
      } else if (musicInputIndex !== -1) {
        audioOutputArgs.push('-map', `${musicInputIndex}:a`)
      } else {
        const nativeAudioInputs: string[] = []
        for (let i = 0; i < localClips.length; i++) {
          const clip = localClips[i]
          if (clip && clip.probe.hasAudio) {
            filtergraph.push(`[${i}:a]atrim=duration=${clip.duration},asetpts=PTS-STARTPTS[a${i}]`)
            nativeAudioInputs.push(`[a${i}]`)
          }
        }
        if (nativeAudioInputs.length > 0) {
          const firstAudio = nativeAudioInputs[0]
          if (nativeAudioInputs.length === 1 && firstAudio) {
            audioOutputArgs.push('-map', firstAudio)
          } else if (transitionDuration > 0 && transitionType !== 'none' && nativeAudioInputs.length === localClips.length && firstAudio) {
            let currAudio: string = firstAudio
            for (let i = 1; i < nativeAudioInputs.length; i++) {
              const nextAudio = nativeAudioInputs[i]
              if (!nextAudio) continue
              const outAudio = `ax${i}`
              filtergraph.push(`${currAudio}${nextAudio}acrossfade=d=${transitionDuration}:c1=tri:c2=tri[${outAudio}]`)
              currAudio = `[${outAudio}]`
            }
            audioOutputArgs.push('-map', currAudio)
          } else {
            filtergraph.push(`${nativeAudioInputs.join('')}concat=n=${nativeAudioInputs.length}:v=0:a=1[a_native_out]`)
            audioOutputArgs.push('-map', '[a_native_out]')
          }
        }
      }

      ffmpegArgs.push('-filter_complex', filtergraph.join(';'))
      ffmpegArgs.push('-map', `[${currentOutputLabel}]`)
      ffmpegArgs.push(...audioOutputArgs)

      ffmpegArgs.push(...encoder.encodingArgs)
      ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', currentOffset.toFixed(2), outputProcessPath)

      // 6. Execute FFmpeg with cooperative cancellation
      await executeFfmpeg(ffmpegArgs, exec.signal, ffmpeg)

      const outputBuffer = await readFile(outputProcessPath)
      const outputProbe = probeMedia(outputProcessPath, ffmpeg)

      // 7. Persist to CAS attachment store
      const stored = await persistAttachment(ctx, outputBuffer, 'video', 'video/mp4', basename(outputProcessPath))

      const outcome: RenderVideoOutput = {
        path: outputProcessPath,
        attachmentId: stored.attachmentId,
        duration: outputProbe.duration || currentOffset,
        width: outputProbe.width || width,
        height: outputProbe.height || height,
        bytes: outputBuffer.byteLength,
        mediaType: 'video/mp4',
      }
      return outcome
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Render stitched video ${args.output_path}`,
        kind: 'edit',
        locations: [{ path: args.output_path }],
      }
    },
    presentResult(args, outcome) {
      return {
        card: 'generic',
        title: outcome.isError ? `Failed to render video ${args.output_path}` : `Rendered video ${args.output_path}`,
        content: outcome.content,
      }
    },
  }))
}
