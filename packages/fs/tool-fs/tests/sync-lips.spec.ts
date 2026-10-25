/**
 * Unit tests for `sync_lips`: parameter validation, duration guarding,
 * tenant tmp scratchpad confinement, mock fallback, and presentation.
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
  DEFAULT_GUIDANCE_SCALE,
  DEFAULT_INFERENCE_STEPS,
  MAX_ALLOWED_DURATION_SECONDS,
} from '../src/sync-lips.ts'

const MOCK_MP4_BYTES = Buffer.from([
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
  0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  0x6d, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x08,
])

const MOCK_WAV_BYTES = Buffer.from('RIFF$---WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00')

describe('sync_lips', () => {
  describe('defaults and constants', () => {
    it('declares expected guidance scale, steps, and duration guards', () => {
      expect(DEFAULT_GUIDANCE_SCALE).toBe(1.5)
      expect(DEFAULT_INFERENCE_STEPS).toBe(15)
      expect(MAX_ALLOWED_DURATION_SECONDS).toBe(45)
    })
  })

  describe('tool lifecycle and execution', () => {
    let dir: string

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'sync-lips-test-'))
      process.env.LIPSYNC_MOCK = 'true'
    })

    afterEach(async () => {
      delete process.env.LIPSYNC_MOCK
      vi.restoreAllMocks()
      await rm(dir, { recursive: true, force: true })
    })

    async function createTestContext(options: { syncLips?: boolean } = {}) {
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
        renderCaptions: false,
        syncLips: options.syncLips ?? true,
      })
      return ctx
    }

    it('registers sync_lips when syncLips is true', async () => {
      const ctx = await createTestContext({ syncLips: true })
      expect(ctx.tools.get('sync_lips')).toBeDefined()
      expect(ctx.tools.schemas().map(s => s.name)).toContain('sync_lips')
    })

    it('omits sync_lips when syncLips is false', async () => {
      const ctx = await createTestContext({ syncLips: false })
      expect(ctx.tools.get('sync_lips')).toBeUndefined()
    })

    it('rejects empty video_path or output_path', async () => {
      const ctx = await createTestContext()

      const r1 = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'sync_lips',
        arguments: { video_path: '', output_path: 'tmp/synced.mp4' },
        signal: new AbortController().signal,
      })
      expect(r1.isError).toBe(true)
      expect(r1.content[0]?.type === 'text' && r1.content[0].text).toContain('video_path must be a non-empty string')

      const r2 = await ctx.tools.execute({
        callId: ToolCallId('call-2'),
        name: 'sync_lips',
        arguments: { video_path: 'tmp/video.mp4', output_path: '   ' },
        signal: new AbortController().signal,
      })
      expect(r2.isError).toBe(true)
      expect(r2.content[0]?.type === 'text' && r2.content[0].text).toContain('output_path must be a non-empty string')
    })

    it('rejects missing input video file', async () => {
      const ctx = await createTestContext()

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-missing-video'),
        name: 'sync_lips',
        arguments: { video_path: 'tmp/non_existent.mp4', output_path: 'tmp/synced.mp4' },
        signal: new AbortController().signal,
      })
      expect(result.isError).toBe(true)
      expect(result.content[0]?.type === 'text' && result.content[0].text).toContain('Video file not found')
    })

    it('rejects missing input audio file when specified', async () => {
      const ctx = await createTestContext()

      const inVideo = join(dir, 'input.mp4')
      await writeFile(inVideo, MOCK_MP4_BYTES)

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-missing-audio'),
        name: 'sync_lips',
        arguments: {
          video_path: 'input.mp4',
          audio_path: 'tmp/non_existent.wav',
          output_path: 'tmp/synced.mp4',
        },
        signal: new AbortController().signal,
      })
      expect(result.isError).toBe(true)
      expect(result.content[0]?.type === 'text' && result.content[0].text).toContain('Audio file not found')
    })

    it('strictly rejects output paths outside tenant tmp scratchpad', async () => {
      const ctx = await createTestContext()

      const inVideo = join(dir, 'input.mp4')
      await writeFile(inVideo, MOCK_MP4_BYTES)

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-outside-tmp'),
        name: 'sync_lips',
        arguments: {
          video_path: 'input.mp4',
          output_path: 'permanent/synced.mp4',
        },
        signal: new AbortController().signal,
      })
      expect(result.isError).toBe(true)
      expect(result.content[0]?.type === 'text' && result.content[0].text).toContain('Writing outside the temporary directory is strictly prohibited')
    })

    it('rejects videos exceeding 45 seconds to guard GPU compute', async () => {
      const ctx = await createTestContext()

      const inVideo = join(dir, 'input.mp4')
      await writeFile(inVideo, MOCK_MP4_BYTES)

      vi.spyOn(ffmpegModule, 'probeMedia').mockReturnValue({
        duration: 52.5,
        width: 1080,
        height: 1920,
        fps: 30,
        hasVideo: true,
        hasAudio: true,
        sizeBytes: MOCK_MP4_BYTES.byteLength,
      })

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-duration-limit'),
        name: 'sync_lips',
        arguments: {
          video_path: 'input.mp4',
          output_path: 'tmp/synced.mp4',
        },
        signal: new AbortController().signal,
      })
      expect(result.isError).toBe(true)
      expect(result.content[0]?.type === 'text' && result.content[0].text).toContain('exceeds maximum allowed duration of 45 seconds')
    })

    it('successfully executes mock lip-sync with audio and video', async () => {
      const ctx = await createTestContext()

      const inVideo = join(dir, 'input.mp4')
      const inAudio = join(dir, 'input.wav')
      await writeFile(inVideo, MOCK_MP4_BYTES)
      await writeFile(inAudio, MOCK_WAV_BYTES)

      vi.spyOn(ffmpegModule, 'probeMedia').mockReturnValue({
        duration: 12.0,
        width: 1080,
        height: 1920,
        fps: 30,
        hasVideo: true,
        hasAudio: true,
        sizeBytes: MOCK_MP4_BYTES.byteLength,
      })

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-sync-success'),
        name: 'sync_lips',
        arguments: {
          video_path: 'input.mp4',
          audio_path: 'input.wav',
          output_path: 'tmp/synced_output.mp4',
          guidance_scale: 1.8,
          inference_steps: 15,
        },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBe(false)
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text).toContain('ByteDance LatentSync on NVIDIA A100 GPU')
      expect(text).toContain('tmp/synced_output.mp4')
      expect(text).toContain('save_asset')

      const writtenBytes = await readFile(join(dir, 'tmp', 'synced_output.mp4'))
      expect(writtenBytes.byteLength).toBeGreaterThan(0)
    })

    it('successfully executes mock lip-sync without explicit audio', async () => {
      const ctx = await createTestContext()

      const inVideo = join(dir, 'input.mp4')
      await writeFile(inVideo, MOCK_MP4_BYTES)

      vi.spyOn(ffmpegModule, 'probeMedia').mockReturnValue({
        duration: 10.0,
        width: 1080,
        height: 1920,
        fps: 30,
        hasVideo: true,
        hasAudio: true,
        sizeBytes: MOCK_MP4_BYTES.byteLength,
      })

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-sync-no-audio'),
        name: 'sync_lips',
        arguments: {
          video_path: 'input.mp4',
          output_path: 'tmp/synced_no_audio.mp4',
        },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBe(false)
      const writtenBytes = await readFile(join(dir, 'tmp', 'synced_no_audio.mp4'))
      expect(writtenBytes.byteLength).toBeGreaterThan(0)
    })
  })
})
