/**
 * Model-facing speech-to-speech voice conversion tool.
 * Transforms the vocal tone, accent, or style of existing spoken audio or video
 * while preserving cadence, timing, pauses, emotional intensity, and lip-synchronization.
 * @module @deepseek-ai/dsh-tool-fs/src/convert-voice
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolExecution } from '@deepseek-ai/dsh-tools'
import { sessionResolveOptions } from './session-cwd.ts'
import { assertPathWritable } from './sandbox.ts'
import type { FsSandboxController } from './sandbox.ts'
import { findFfmpegPath } from './ffmpeg.ts'
import { resolveTenantTmp, assertTenantTmpPath } from './tenant-tmp.ts'

/** Supported curated voice persona keys. */
export type VoicePersona = 'shivraj' | 'dr-joshi' | 'shlok' | 'manish' | 'kalyan' | 'surabhi' | 'vanishree'

/** Curated voice persona catalog for tone transformation. */
export const VOICE_CATALOG: Readonly<Record<VoicePersona, { id: string; name: string; description: string }>> = {
  'shivraj': {
    id: '6OWR66phKIqiCowCgr7X',
    name: 'Shivraj',
    description: 'Conversational, energetic Indian English delivery with high commercial josh',
  },
  'dr-joshi': {
    id: 'WkJcHHkxVUZl4ua7fWlW',
    name: 'Dr. Joshi',
    description: 'Deep, cinematic resonant baritone for authoritative and luxury narratives',
  },
  'shlok': {
    id: '2i7LhYjvw41fgbcqlf3Z',
    name: 'Shlok',
    description: 'Young, friendly, modern Indian creator for startups and social products',
  },
  'manish': {
    id: 'KSSOzt6V7IiEnDiQtnOJ',
    name: 'Manish',
    description: 'Confident, clear, grounded narrator for explainers and documentaries',
  },
  'kalyan': {
    id: 'AdU2HL826uF30ERr4lBu',
    name: 'Kalyan',
    description: 'Authentic South Indian English accent for localized campaigns',
  },
  'surabhi': {
    id: 'ch9J8IB6HKlEHQaWQFdk',
    name: 'Surabhi',
    description: 'Warm, polite, friendly conversational female voice',
  },
  'vanishree': {
    id: 'EQajdcMa8fccc3KCqwGO',
    name: 'Vanishree',
    description: 'Casual, modern, engaging female voice for social ads and creator videos',
  },
}

/** Default voice persona for voice tone conversion. */
export const DEFAULT_VOICE = 'shivraj'

/**
 * Resolve a voice persona alias or pass through an explicit voice identifier.
 * @param voice - voice persona name or 20-character voice identifier.
 * @returns canonical voice identifier.
 */
export function resolveVoiceId(voice: string | undefined): string {
  const normalized = (voice || DEFAULT_VOICE).trim().toLowerCase()
  if (normalized in VOICE_CATALOG) {
    return VOICE_CATALOG[normalized as VoicePersona].id
  }
  return voice?.trim() || VOICE_CATALOG[DEFAULT_VOICE].id
}



/** Output schema for the convert_voice tool. */
export interface ConvertVoiceOutput {
  path: string
  attachmentId?: string
  voice: string
  voiceId: string
  bytes: number
  isRemuxedVideo: boolean
}

/**
 * Register the `convert_voice` tool.
 * @param ctx - plugin context scoped to the host.
 * @param sandbox - optional sandbox-escalation controller.
 */
export function applyConvertVoiceTool(ctx: Context, sandbox?: FsSandboxController): void {
  ctx.tools.register(defineTool({
    name: 'convert_voice',
    description: 'Transform the vocal tone, accent, or style of existing speech audio or video '
      + 'without changing words, pauses, rhythm, or timing. Use this tool when the user wants to alter '
      + 'the speaker vocal tone (e.g. into an energetic Indian conversational voice, deep cinematic baritone, '
      + 'or warm tone) while preserving 100% lip synchronization with the original video (no lip-sync required).',
    parameters: {
      input_path: {
        type: 'string',
        required: true,
        description: 'Path to source audio (.mp3, .wav, .m4a) or video (.mp4, .mov) file containing the original spoken speech.',
      },
      output_path: {
        type: 'string',
        required: true,
        description: 'Destination file path for the converted output. If input is video and output is .mp4, the tool automatically remuxes the new voice into the video.',
      },
      voice: {
        type: 'string',
        enum: ['shivraj', 'dr-joshi', 'shlok', 'manish', 'kalyan', 'surabhi', 'vanishree'],
        description: 'Target voice persona (default: shivraj). Or an explicit custom voice identifier.',
      },
      remove_background_noise: {
        type: 'boolean',
        description: 'Whether to filter ambient background noise from the input audio before voice conversion (default: true).',
      },
      ...sandbox && sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {},
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true, description: 'Canonical path on disk where the converted asset was written.' },
          attachmentId: { type: 'string' },
          voice: { type: 'string', required: true },
          voiceId: { type: 'string', required: true },
          bytes: { type: 'integer', required: true },
          isRemuxedVideo: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: value.isRemuxedVideo
            ? `Voice tone transformed to \`${value.voice}\` and remuxed into video in scratchpad at \`${value.path}\` (${value.bytes} bytes). Timing and mouth synchronization are 100% preserved. Use \`save_asset\` when ready to promote to permanent attachments.`
            : `Voice tone transformed to \`${value.voice}\` and saved to scratchpad at \`${value.path}\` (${value.bytes} bytes). Use \`save_asset\` when ready to promote to permanent attachments.`,
        },
      ],
      presentationMeta: (_args, value) => ({ path: value.path }),
    },
    async execute(
      args: { input_path: string; output_path: string; voice?: string; remove_background_noise?: boolean },
      exec: ToolExecution,
    ) {
      if (args.input_path.trim().length === 0) throw new Error('input_path must be a non-empty string')
      if (args.output_path.trim().length === 0) throw new Error('output_path must be a non-empty string')

      let sandboxPolicy
      if (sandbox) {
        sandboxPolicy = await sandbox.resolvePolicy('write', args as object, exec)
      }

      const apiKey = process.env.ELEVENLABS_API_KEY || process.env.VOICE_CONVERSION_API_KEY
      if (!apiKey) {
        throw new Error('ELEVENLABS_API_KEY environment variable is required for voice conversion.')
      }

      const resolveOpts = await sessionResolveOptions(ctx, exec)
      const inputTarget = await ctx.fs.resolve(args.input_path, resolveOpts)
      const inputProcessPath = ctx.fs.processPath(inputTarget)
      if (!existsSync(inputProcessPath)) {
        throw new Error(`Input file not found at: ${args.input_path}`)
      }

      const outputTarget = await ctx.fs.resolve(args.output_path, resolveOpts)
      const outputProcessPath = ctx.fs.processPath(outputTarget)
      const activeCwd = resolveOpts.cwd
        || (ctx.fs ? ctx.fs.processPath(await ctx.fs.resolve('.', resolveOpts)) : process.cwd())
      if (sandboxPolicy) {
        await assertPathWritable(outputProcessPath, sandboxPolicy, sandbox)
      }
      assertTenantTmpPath(outputProcessPath, args.output_path, activeCwd)

      const voiceId = resolveVoiceId(args.voice)
      const voiceName = args.voice?.trim() || DEFAULT_VOICE
      const removeNoise = args.remove_background_noise !== false

      const inExt = extname(inputProcessPath).toLowerCase()
      const isVideoInput = ['.mp4', '.mov', '.webm', '.m4v'].includes(inExt)
      const outExt = extname(outputProcessPath).toLowerCase()
      const isVideoOutput = ['.mp4', '.mov', '.webm', '.m4v'].includes(outExt)

      const ffmpeg = findFfmpegPath()
      const tempDir = join(resolveTenantTmp(inputProcessPath), `dsh_voice_conv_${Date.now()}_${Math.random().toString(36).slice(2)}`)
      await mkdir(tempDir, { recursive: true })

      try {
        let audioToConvertPath = inputProcessPath
        if (isVideoInput) {
          const extractedAudioPath = join(tempDir, 'extracted.mp3')
          const extractRes = spawnSync(ffmpeg, [
            '-y',
            '-i', inputProcessPath,
            '-vn',
            '-ac', '1',
            '-ar', '16000',
            '-b:a', '128k',
            extractedAudioPath,
          ])
          if (extractRes.status !== 0 || !existsSync(extractedAudioPath)) {
            throw new Error(`Failed to extract audio track from video: ${extractRes.stderr?.toString() || 'unknown error'}`)
          }
          audioToConvertPath = extractedAudioPath
        }

        const audioBuffer = await readFile(audioToConvertPath)
        const boundary = `----DshBoundary${Date.now().toString(16)}`

        const bodyParts: Buffer[] = []
        bodyParts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\neleven_multilingual_sts_v2\r\n`,
        ))
        bodyParts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="remove_background_noise"\r\n\r\n${removeNoise ? 'true' : 'false'}\r\n`,
        ))
        bodyParts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="speech.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`,
        ))
        bodyParts.push(audioBuffer)
        bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

        const requestBody = Buffer.concat(bodyParts)
        const endpoint = `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          signal: exec.signal,
          body: requestBody,
        })

        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`Voice conversion API HTTP ${response.status}: ${errText}`)
        }

        const convertedAudioBuffer = Buffer.from(await response.arrayBuffer())
        if (convertedAudioBuffer.byteLength === 0) {
          throw new Error('Voice conversion returned empty audio payload.')
        }

        await mkdir(dirname(outputProcessPath), { recursive: true })

        let isRemuxed = false
        if (isVideoInput && isVideoOutput) {
          const tempConvertedAudioPath = join(tempDir, 'converted.mp3')
          await writeFile(tempConvertedAudioPath, convertedAudioBuffer)

          const remuxRes = spawnSync(ffmpeg, [
            '-y',
            '-i', inputProcessPath,
            '-i', tempConvertedAudioPath,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-shortest',
            outputProcessPath,
          ])

          if (remuxRes.status !== 0 || !existsSync(outputProcessPath)) {
            throw new Error(`Failed to remux converted audio into output video: ${remuxRes.stderr?.toString() || 'unknown error'}`)
          }
          isRemuxed = true
        } else {
          await writeFile(outputProcessPath, convertedAudioBuffer)
        }

        const finalOutputBuffer = await readFile(outputProcessPath)
        const outcome: ConvertVoiceOutput = {
          path: outputProcessPath,
          voice: voiceName,
          voiceId,
          bytes: finalOutputBuffer.byteLength,
          isRemuxedVideo: isRemuxed,
        }
        return outcome
      } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {})
      }
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Convert voice tone: ${args.input_path} -> ${args.output_path}`,
        kind: 'edit',
        locations: [{ path: args.input_path }, { path: args.output_path }],
      }
    },
    presentResult(args, outcome) {
      return {
        card: 'generic',
        title: outcome.isError
          ? `Failed to convert voice tone: ${args.input_path}`
          : `Converted voice tone (${args.voice || DEFAULT_VOICE}): ${args.output_path}`,
        content: outcome.content,
      }
    },
  }))
}
