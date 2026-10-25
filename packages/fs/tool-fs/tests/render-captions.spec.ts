/**
 * Unit tests for `render_captions`: caption grouping, ASS subtitle generation,
 * transcription integration, parameter validation, and presentation.
 */

import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import * as ffmpegModule from '../src/ffmpeg.ts'
import {
  buildAssSubtitleScript,
  formatAssTime,
  groupWordsIntoCues,
} from '../src/render-captions.ts'

const MOCK_MP4_BYTES = Buffer.from([
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
  0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  0x6d, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x08,
])

describe('render_captions', () => {
  describe('utility functions', () => {
    it('formats timestamps into ASS time format', () => {
      expect(formatAssTime(0)).toBe('0:00:00.00')
      expect(formatAssTime(1.25)).toBe('0:00:01.25')
      expect(formatAssTime(65.5)).toBe('0:01:05.50')
      expect(formatAssTime(3661.12)).toBe('1:01:01.12')
    })

    it('groups raw words into bursts of 1-3 words', () => {
      const words = [
        { word: 'STOP', start: 0.1, end: 0.4 },
        { word: 'SCROLLING', start: 0.4, end: 0.9 },
        { word: 'RIGHT', start: 1.0, end: 1.3 },
        { word: 'NOW', start: 1.3, end: 1.7 },
      ]
      const cues = groupWordsIntoCues(words)
      expect(cues.length).toBeGreaterThanOrEqual(2)
      expect(cues[0]?.text).toContain('STOP')
      expect(cues[0]?.words).toBeDefined()
    })

    it('builds dual-layer ASS subtitle script with Glow and Text styles', () => {
      const script = buildAssSubtitleScript(
        [
          {
            start: 0.0,
            end: 1.0,
            text: 'WATCH THIS',
            words: [
              { word: 'WATCH', start: 0.0, end: 0.5 },
              { word: 'THIS', start: 0.5, end: 1.0 },
            ],
          },
        ],
        1080,
        1920,
        { style: 'karaoke', highlightColor: 'yellow', position: 'chest' },
      )
      expect(script).toContain('[Script Info]')
      expect(script).toContain('Style: Glow')
      expect(script).toContain('Style: Text')
      expect(script).toContain('Dialogue: 0')
      expect(script).toContain('Dialogue: 1')
      expect(script).toContain('&H0000E6FF&') // Yellow highlight color code
    })
  })

  describe('tool lifecycle and execution', () => {
    let dir: string

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'render-captions-test-'))
    })

    afterEach(async () => {
      vi.restoreAllMocks()
      await rm(dir, { recursive: true, force: true })
    })

    async function createTestContext(options: { renderCaptions?: boolean } = {}) {
      const ctx = new Context()
      provideWorkingDirectoryFixture(ctx)
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(LocalFileSystem, { cwd: dir })
      await ctx.plugin(ToolFs, {
        read: false,
        write: false,
        edit: false,
        readImage: false,
        generateImage: false,
        convertVoice: false,
        dubAudio: false,
        generateVideo: false,
        renderVideo: false,
        renderCaptions: options.renderCaptions ?? true,
      })
      return ctx
    }

    it('registers render_captions when renderCaptions is true', async () => {
      const ctx = await createTestContext({ renderCaptions: true })
      expect(ctx.tools.get('render_captions')).toBeDefined()
      expect(ctx.tools.schemas().map(s => s.name)).toContain('render_captions')
    })

    it('omits render_captions when renderCaptions is false', async () => {
      const ctx = await createTestContext({ renderCaptions: false })
      expect(ctx.tools.get('render_captions')).toBeUndefined()
    })

    it('rejects empty video_path or output_path', async () => {
      const ctx = await createTestContext()

      const r1 = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'render_captions',
        arguments: { video_path: '', output_path: 'captioned.mp4' },
        signal: new AbortController().signal,
      })
      expect(r1.isError).toBe(true)
      expect(r1.content[0]?.type === 'text' && r1.content[0].text).toContain('video_path must be a non-empty string')

      const r2 = await ctx.tools.execute({
        callId: ToolCallId('call-2'),
        name: 'render_captions',
        arguments: { video_path: 'video.mp4', output_path: '   ' },
        signal: new AbortController().signal,
      })
      expect(r2.isError).toBe(true)
      expect(r2.content[0]?.type === 'text' && r2.content[0].text).toContain('output_path must be a non-empty string')
    })

    it('burns captions provided via JSON cues onto video', async () => {
      const ctx = await createTestContext()

      const inVideo = join(dir, 'input.mp4')
      await writeFile(inVideo, MOCK_MP4_BYTES)

      vi.spyOn(ffmpegModule, 'probeMedia').mockReturnValue({
        duration: 4.0,
        width: 1080,
        height: 1920,
        fps: 30,
        hasVideo: true,
        hasAudio: true,
        sizeBytes: MOCK_MP4_BYTES.byteLength,
      })

      const ffmpegSpy = vi.spyOn(ffmpegModule, 'executeFfmpeg').mockImplementation(async (args) => {
        const outPath = args[args.length - 1]
        if (outPath) await writeFile(outPath, MOCK_MP4_BYTES)
      })

      const captionsJson = JSON.stringify([
        {
          start: 0.0,
          end: 1.5,
          text: 'HERE IS THE OFFER',
          words: [
            { word: 'HERE', start: 0.0, end: 0.3 },
            { word: 'IS', start: 0.3, end: 0.6 },
            { word: 'THE', start: 0.6, end: 0.9 },
            { word: 'OFFER', start: 0.9, end: 1.5 },
          ],
        },
      ])

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-caps'),
        name: 'render_captions',
        arguments: {
          video_path: 'input.mp4',
          output_path: 'output/captioned.mp4',
          captions: captionsJson,
          style: 'karaoke',
          highlight_color: 'yellow',
        },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBe(false)
      expect(ffmpegSpy).toHaveBeenCalled()
      const diskBytes = await readFile(join(dir, 'output', 'captioned.mp4'))
      expect(diskBytes).toEqual(MOCK_MP4_BYTES)
    })
  })
})
