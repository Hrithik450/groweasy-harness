/**
 * Model-facing dynamic caption rendering and burning tool.
 * Automatically transcribes dialogue with word-level precision,
 * renders high-retention animated subtitle graphics (karaoke highlight, pop),
 * burns them into video, and saves the result to the attachment store.
 * @module @deepseek-ai/dsh-tool-fs/src/render-captions
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolExecution } from '@deepseek-ai/dsh-tools'
import { sessionResolveOptions } from './session-cwd.ts'
import { assertPathWritable } from './sandbox.ts'
import type { FsSandboxController } from './sandbox.ts'
import { detectVideoEncoder, executeFfmpeg, findFfmpegPath, probeMedia } from './ffmpeg.ts'
import { resolveTenantDshHome, resolveTenantTmp, assertTenantTmpPath } from './tenant-tmp.ts'

/** Output schema for the render_captions tool. */
export interface RenderCaptionsOutput {
  path: string
  attachmentId?: string
  duration: number
  width: number
  height: number
  bytes: number
  cueCount: number
  mediaType: string
}

/** Individual timestamped word in caption cue. */
export interface CaptionWord {
  word: string
  start: number
  end: number
}

/** Timestamped caption cue burst. */
export interface CaptionCue {
  start: number
  end: number
  text: string
  words?: CaptionWord[]
}

/** Supported caption presentation styles. */
export type CaptionStyle = 'karaoke' | 'pop' | 'highlight'

/** Supported karaoke highlight colors. */
export type HighlightColor = 'yellow' | 'cyan' | 'green' | 'orange' | 'white'

const HIGHLIGHT_COLOR_CODES: Readonly<Record<HighlightColor, string>> = {
  yellow: '&H0000E6FF&',
  cyan: '&H00FFFF00&',
  green: '&H0033FF55&',
  orange: '&H000099FF&',
  white: '&H00FFFFFF&',
}

/**
 * Format timestamp in seconds to ASS format (H:MM:SS.cs).
 * @param seconds - time offset in seconds.
 * @returns formatted ASS timestamp string.
 */
export function formatAssTime(seconds: number): string {
  const totalSec = Math.max(0, seconds)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.floor(totalSec % 60)
  const cs = Math.round((totalSec % 1) * 100) % 100
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`
}

/**
 * Group raw word timestamps into adaptive 1-3 word caption bursts.
 * @param rawWords - sequence of timestamped words.
 * @returns grouped caption cues.
 */
export function groupWordsIntoCues(rawWords: CaptionWord[]): CaptionCue[] {
  const cleanWords = rawWords
    .map(item => ({
      word: (item.word || '').trim().toUpperCase(),
      start: Math.max(0, Number(item.start) || 0),
      end: Math.max(0, Number(item.end) || 0),
    }))
    .filter(item => item.word.length > 0 && item.end >= item.start)
    .sort((a, b) => a.start - b.start)

  if (cleanWords.length === 0) return []

  const cues: CaptionCue[] = []
  let currentWords: CaptionWord[] = []
  let cueStart = 0

  for (let i = 0; i < cleanWords.length; i++) {
    const currentWord = cleanWords[i]
    if (!currentWord) continue
    const nextWord = cleanWords[i + 1]

    if (currentWords.length === 0) {
      cueStart = currentWord.start
    }
    currentWords.push(currentWord)
    const cueEnd = currentWord.end

    const isLastWord = i === cleanWords.length - 1
    const gapToNext = nextWord ? nextWord.start - currentWord.end : 999
    const isLongPause = gapToNext >= 0.35

    if (isLastWord || isLongPause || currentWords.length >= 3) {
      cues.push({
        start: cueStart,
        end: cueEnd,
        text: currentWords.map(w => w.word).join(' '),
        words: [...currentWords],
      })
      currentWords = []
    }
  }

  return cues
}

/**
 * Build Advanced SubStation Alpha (.ass) subtitle file content with glow and karaoke styles.
 * @param cues - caption cues to render.
 * @param width - target video width.
 * @param height - target video height.
 * @param options - presentation options.
 * @returns raw ASS script content.
 */
export function buildAssSubtitleScript(
  cues: CaptionCue[],
  width: number,
  height: number,
  options: {
    style?: CaptionStyle | undefined
    highlightColor?: HighlightColor | undefined
    position?: 'chest' | 'center' | 'top' | 'bottom' | undefined
    y?: string | undefined
    x?: 'center' | 'left' | 'right' | undefined
    fontSize?: number | undefined
  } = {},
): string {
  let targetYRatio = 0.55
  if (options.y) {
    if (options.y.endsWith('%')) {
      targetYRatio = parseFloat(options.y) / 100
    } else {
      const px = parseFloat(options.y)
      if (!isNaN(px) && height > 0) targetYRatio = px / height
    }
  } else if (options.position === 'top') {
    targetYRatio = 0.25
  } else if (options.position === 'center') {
    targetYRatio = 0.50
  } else if (options.position === 'bottom') {
    targetYRatio = 0.75
  } else if (options.position === 'chest') {
    targetYRatio = 0.55
  }

  const marginV = Math.max(20, Math.round(height * (1 - targetYRatio)))
  const baseFontSize = options.fontSize || 72
  const scaledFontSize = Math.round(baseFontSize * (height / 1920))
  const glowBorder = Math.max(6, Math.round(14 * (height / 1920)))
  const textBorder = Math.max(2, Math.round(3 * (height / 1920)))
  const textShadow = Math.max(2, Math.round(4 * (height / 1920)))

  let alignment = 2
  if (options.x === 'left') alignment = 1
  else if (options.x === 'right') alignment = 3

  const style = options.style || 'karaoke'
  const hlColorKey = options.highlightColor || 'yellow'
  const hlColorCode = HIGHLIGHT_COLOR_CODES[hlColorKey] || HIGHLIGHT_COLOR_CODES.yellow

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Glow,Arial Black,${scaledFontSize},&H00FFFFFF,&H00FFFFFF,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,2,0,1,${glowBorder},0,${alignment},40,40,${marginV},1
Style: Text,Arial Black,${scaledFontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,2,0,1,${textBorder},${textShadow},${alignment},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

  const eventLines: string[] = []
  for (const cue of cues) {
    const rawText = (cue.text || '').trim().toUpperCase()
    if (!rawText) continue
    const startStr = formatAssTime(cue.start)
    const endStr = formatAssTime(cue.end)
    const cleanText = rawText.replace(/\\/g, '').replace(/{/g, '(').replace(/}/g, ')')

    // Layer 0: Ambient white glow bloom
    eventLines.push(`Dialogue: 0,${startStr},${endStr},Glow,,0,0,0,,{\\blur16\\alpha&H70}${cleanText}`)

    // Layer 1: Foreground text
    const hasWords = Array.isArray(cue.words) && cue.words.length > 0
    const isKaraokeMode = (style === 'karaoke' || style === 'highlight') && hasWords

    if (!isKaraokeMode || !cue.words || cue.words.length <= 1) {
      eventLines.push(`Dialogue: 1,${startStr},${endStr},Text,,0,0,0,,{\\blur0}${cleanText}`)
    } else {
      const words = cue.words
      const firstWord = words[0]
      if (firstWord && firstWord.start > cue.start + 0.05) {
        const initEnd = formatAssTime(firstWord.start)
        eventLines.push(`Dialogue: 1,${startStr},${initEnd},Text,,0,0,0,,{\\blur0}${cleanText}`)
      }

      for (let k = 0; k < words.length; k++) {
        const current = words[k]
        if (!current) continue
        const next = words[k + 1]
        const wStart = Math.max(cue.start, current.start)
        const wEnd = k === words.length - 1 || !next
          ? cue.end
          : Math.max(current.end, Math.min(cue.end, next.start))

        if (wEnd <= wStart) continue
        const subStartStr = formatAssTime(wStart)
        const subEndStr = formatAssTime(wEnd)

        const lineParts = words.map((w, idx) => {
          const sanitized = (w?.word || '').replace(/\\/g, '').replace(/{/g, '(').replace(/}/g, ')')
          if (idx === k) {
            return `{\\c${hlColorCode}}${sanitized}{\\c&H00FFFFFF&}`
          }
          return sanitized
        })

        eventLines.push(`Dialogue: 1,${subStartStr},${subEndStr},Text,,0,0,0,,{\\blur0}${lineParts.join(' ')}`)
      }
    }
  }

  return header + eventLines.join('\n') + '\n'
}

/**
 * Transcribe speech from an audio buffer using Gemini or OpenAI API.
 * @param audioBuffer - audio bytes (MP3/WAV).
 * @param language - optional language hint.
 * @param signal - cancellation signal.
 * @returns extracted word timestamps.
 */
async function transcribeSpeech(audioBuffer: Buffer, language: string | undefined, signal: AbortSignal): Promise<CaptionWord[]> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (geminiKey) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`
    const langInstruction = language && language !== 'auto'
      ? `The primary language is ${language}. Transcribe in Latin/Roman alphabet for Hinglish/Hindi or English.`
      : 'Transcribe faithfully in the spoken language. For Hinglish/Indian spoken dialogue, use the Latin/Roman alphabet.'

    const payload = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: 'audio/mp3',
                data: audioBuffer.toString('base64'),
              },
            },
            {
              text: `You are an expert audio transcription system for short-form social video ads.
Transcribe all spoken dialogue in this audio with exact word-level start and end timestamps in seconds.
${langInstruction}

Output strictly a JSON array of word objects:
[
  { "start": 0.00, "end": 0.40, "word": "FIRST" },
  { "start": 0.40, "end": 0.95, "word": "WORD" }
]

Return ONLY valid JSON array, no commentary.`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Speech transcription failed (HTTP ${response.status}): ${err}`)
    }

    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Speech transcription returned empty text.')
    const parsed = JSON.parse(text) as CaptionWord[]
    if (Array.isArray(parsed)) return parsed
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mp3' })
    formData.append('file', blob, 'audio.mp3')
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'verbose_json')
    formData.append('timestamp_granularities[]', 'word')
    if (language && language !== 'auto') formData.append('language', language)

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
      signal,
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Whisper transcription failed (HTTP ${response.status}): ${err}`)
    }

    const data = (await response.json()) as { words?: Array<{ word: string; start: number; end: number }> }
    if (Array.isArray(data.words)) {
      return data.words.map(w => ({ word: w.word, start: w.start, end: w.end }))
    }
  }

  throw new Error('GEMINI_API_KEY or OPENAI_API_KEY is required for speech transcription.')
}

/**
 * Register the `render_captions` tool.
 * @param ctx - plugin context.
 * @param sandbox - optional sandbox-escalation controller.
 */
export function applyRenderCaptionsTool(ctx: Context, sandbox?: FsSandboxController): void {
  ctx.tools.register(defineTool({
    name: 'render_captions',
    description: 'Burn high-retention animated captions (karaoke highlight, pop) directly onto video. '
      + 'If captions are not supplied, the tool automatically transcribes spoken audio into synchronized cues.',
    parameters: {
      video_path: {
        type: 'string',
        required: true,
        description: 'Path or attachment ID (sha256:...) of the input video to caption.',
      },
      output_path: {
        type: 'string',
        required: true,
        description: 'Destination file path for the captioned MP4 video (e.g. "output/captioned.mp4").',
      },
      captions: {
        type: 'string',
        description: 'Optional path to captions JSON file or raw JSON string. If omitted, speech is automatically transcribed.',
      },
      style: {
        type: 'string',
        enum: ['karaoke', 'pop', 'highlight'],
        description: 'Caption animation style. Defaults to "karaoke".',
      },
      highlight_color: {
        type: 'string',
        enum: ['yellow', 'cyan', 'green', 'orange', 'white'],
        description: 'Karaoke active word highlight color. Defaults to "yellow".',
      },
      position: {
        type: 'string',
        enum: ['chest', 'center', 'top', 'bottom'],
        description: 'Semantic vertical position. Defaults to "chest" (55% safe area for talking head reels).',
      },
      y: {
        type: 'string',
        description: 'Direct vertical position (e.g. "55%" or pixel offset).',
      },
      font_size: {
        type: 'number',
        description: 'Base font size (default: 72).',
      },
      language: {
        type: 'string',
        description: 'Spoken language hint for transcription (e.g. "en", "hi", "hinglish"). Defaults to "auto".',
      },
      ...sandbox && sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {},
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true, description: 'Canonical path on disk where the captioned video was written.' },
          attachmentId: { type: 'string' },
          duration: { type: 'number', required: true },
          width: { type: 'integer', required: true },
          height: { type: 'integer', required: true },
          bytes: { type: 'integer', required: true },
          cueCount: { type: 'integer', required: true },
          mediaType: { type: 'string', required: true },
        },
      },
      render: (_args, value) => {
        return [
          {
            type: 'text',
            text: `Captions burned onto video and saved to temporary scratchpad at \`${value.path}\` (${value.cueCount} cues, ${value.duration.toFixed(1)}s, ${value.bytes} bytes). Use \`save_asset\` when ready to promote to permanent attachments.`,
          },
        ]
      },
      presentationMeta: (_args, value) => ({ path: value.path }),
    },
    async execute(
      args: {
        video_path: string
        output_path: string
        captions?: string
        style?: CaptionStyle
        highlight_color?: HighlightColor
        position?: 'chest' | 'center' | 'top' | 'bottom'
        y?: string
        font_size?: number
        language?: string
      },
      exec: ToolExecution,
    ) {
      if (args.video_path.trim().length === 0) throw new Error('video_path must be a non-empty string')
      if (args.output_path.trim().length === 0) throw new Error('output_path must be a non-empty string')

      let sandboxPolicy
      if (sandbox) {
        sandboxPolicy = await sandbox.resolvePolicy('write', args as object, exec)
      }

      // 1. Resolve source video path
      let videoProcessPath: string
      if (args.video_path.trim().startsWith('sha256:')) {
        const hash = args.video_path.trim().slice(7)
        const dshHome = resolveTenantDshHome()
        let objectPath = join(dshHome, 'attachments', 'v1', 'objects', hash.slice(0, 2), hash)
        if (!existsSync(objectPath)) {
          const fallbackPath = join(resolveTenantTmp(), 'dsh-attachments', 'v1', 'objects', hash.slice(0, 2), hash)
          if (existsSync(fallbackPath)) {
            objectPath = fallbackPath
          } else {
            throw new Error(`Video attachment object not found for ${args.video_path}`)
          }
        }
        videoProcessPath = objectPath
      } else {
        const resolveOpts = await sessionResolveOptions(ctx, exec)
        const target = await ctx.fs.resolve(args.video_path, resolveOpts)
        videoProcessPath = ctx.fs.processPath(target)
        if (!existsSync(videoProcessPath)) {
          throw new Error(`Video file not found at ${args.video_path}`)
        }
      }

      const ffmpeg = findFfmpegPath()
      const probe = probeMedia(videoProcessPath, ffmpeg)
      if (!probe.hasVideo || probe.duration <= 0) {
        throw new Error(`Invalid video stream in ${args.video_path}`)
      }

      const width = probe.width || 1080
      const height = probe.height || 1920

      // 2. Resolve or transcribe caption cues
      let cues: CaptionCue[] = []
      if (args.captions && args.captions.trim()) {
        const rawCaptions = args.captions.trim()
        if (rawCaptions.startsWith('[') || rawCaptions.startsWith('{')) {
          const parsed = JSON.parse(rawCaptions)
          cues = Array.isArray(parsed) ? parsed : (parsed.cues || parsed.segments || [])
        } else {
          const resolveOpts = await sessionResolveOptions(ctx, exec)
          const target = await ctx.fs.resolve(rawCaptions, resolveOpts)
          const fileContent = JSON.parse(await readFile(ctx.fs.processPath(target), 'utf-8'))
          cues = Array.isArray(fileContent) ? fileContent : (fileContent.cues || fileContent.segments || [])
        }
      } else {
        // Automatic transcription: extract audio and transcribe
        const tempAudioDir = resolve(resolveTenantTmp(videoProcessPath), `stt_extract_${Date.now()}_${randomUUID()}`)
        await mkdir(tempAudioDir, { recursive: true })
        const tempAudioPath = join(tempAudioDir, 'audio.mp3')
        try {
          const extractRes = spawnSync(ffmpeg, [
            '-y',
            '-i', videoProcessPath,
            '-vn',
            '-ac', '1',
            '-ar', '16000',
            '-b:a', '64k',
            tempAudioPath,
          ])
          if (extractRes.status !== 0 || !existsSync(tempAudioPath)) {
            throw new Error(`Audio extraction for STT failed: ${extractRes.stderr?.toString()}`)
          }
          const audioBuffer = await readFile(tempAudioPath)
          const words = await transcribeSpeech(audioBuffer, args.language, exec.signal)
          cues = groupWordsIntoCues(words)
        } finally {
          await rm(tempAudioDir, { recursive: true, force: true }).catch(() => {})
        }
      }

      if (cues.length === 0) {
        throw new Error('No caption cues were found or transcribed.')
      }

      // 3. Generate ASS subtitles
      const assContent = buildAssSubtitleScript(cues, width, height, {
        style: args.style,
        highlightColor: args.highlight_color,
        position: args.position,
        y: args.y,
        fontSize: args.font_size,
      })

      const tempAssDir = resolve(resolveTenantTmp(videoProcessPath), `captions_${Date.now()}_${randomUUID()}`)
      await mkdir(tempAssDir, { recursive: true })
      const assPath = join(tempAssDir, 'subs.ass')
      await writeFile(assPath, assContent, 'utf-8')

      // 4. Resolve output destination
      const resolveOpts = await sessionResolveOptions(ctx, exec)
      const outputTarget = await ctx.fs.resolve(args.output_path, resolveOpts)
      const outputProcessPath = ctx.fs.processPath(outputTarget)
      const activeCwd = resolveOpts.cwd
        || (ctx.fs ? ctx.fs.processPath(await ctx.fs.resolve('.', resolveOpts)) : process.cwd())
      if (sandboxPolicy) {
        await assertPathWritable(outputProcessPath, sandboxPolicy, sandbox)
      }
      assertTenantTmpPath(outputProcessPath, args.output_path, activeCwd)
      await mkdir(dirname(outputProcessPath), { recursive: true })

      const encoder = detectVideoEncoder(ffmpeg)
      const ffmpegArgs = ['-y']
      if (encoder.hwaccelArgs.length > 0) ffmpegArgs.push(...encoder.hwaccelArgs)

      ffmpegArgs.push(
        '-i', videoProcessPath,
        '-vf', `ass=${assPath}`,
        ...encoder.encodingArgs,
        '-c:a', 'copy',
        outputProcessPath,
      )

      // 5. Execute FFmpeg with cooperative cancellation
      try {
        await executeFfmpeg(ffmpegArgs, exec.signal, ffmpeg)
      } finally {
        await rm(tempAssDir, { recursive: true, force: true }).catch(() => {})
      }

      const outputBuffer = await readFile(outputProcessPath)
      const outProbe = probeMedia(outputProcessPath, ffmpeg)

      const outcome: RenderCaptionsOutput = {
        path: outputProcessPath,
        duration: outProbe.duration || probe.duration,
        width: outProbe.width || width,
        height: outProbe.height || height,
        bytes: outputBuffer.byteLength,
        cueCount: cues.length,
        mediaType: 'video/mp4',
      }
      return outcome
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Burn captions onto ${args.output_path}`,
        kind: 'edit',
        locations: [{ path: args.output_path }],
      }
    },
    presentResult(args, outcome) {
      return {
        card: 'generic',
        title: outcome.isError ? `Failed to burn captions onto ${args.output_path}` : `Burned captions onto ${args.output_path}`,
        content: outcome.content,
      }
    },
  }))
}
