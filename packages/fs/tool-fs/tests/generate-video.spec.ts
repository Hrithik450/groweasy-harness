/**
 * Unit tests for `generate_video`: parameter validation, API submission,
 * task polling, file persistence, error handling, and presentation.
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
import { DEFAULT_BYTEPLUS_MODEL } from '../src/generate-video.ts'

const MOCK_MP4_BYTES = Buffer.from([
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
  0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  0x6d, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x08,
])

describe('generate_video', () => {
  describe('defaults and configuration', () => {
    it('declares seedance-1-5-pro-251215 as default model', () => {
      expect(DEFAULT_BYTEPLUS_MODEL).toBe('seedance-1-5-pro-251215')
    })
  })

  describe('tool lifecycle and execution', () => {
    let dir: string
    let savedApiKey: string | undefined

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'generate-video-test-'))
      savedApiKey = process.env.BYTEPLUS_API_KEY
    })

    afterEach(async () => {
      if (savedApiKey === undefined) delete process.env.BYTEPLUS_API_KEY
      else process.env.BYTEPLUS_API_KEY = savedApiKey

      vi.restoreAllMocks()
      await rm(dir, { recursive: true, force: true })
    })

    async function createTestContext(options: { generateVideo?: boolean } = {}) {
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
        generateVideo: options.generateVideo ?? true,
        renderVideo: false,
        renderCaptions: false,
      })
      return ctx
    }

    it('registers generate_video when generateVideo is true', async () => {
      const ctx = await createTestContext({ generateVideo: true })
      expect(ctx.tools.get('generate_video')).toBeDefined()
      expect(ctx.tools.schemas().map(s => s.name)).toContain('generate_video')
    })

    it('omits generate_video when generateVideo is false', async () => {
      const ctx = await createTestContext({ generateVideo: false })
      expect(ctx.tools.get('generate_video')).toBeUndefined()
    })

    it('rejects an empty prompt or image_path', async () => {
      const ctx = await createTestContext()
      process.env.BYTEPLUS_API_KEY = 'test-key'

      const r1 = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'generate_video',
        arguments: { prompt: '', image_path: 'still.png' },
        signal: new AbortController().signal,
      })
      expect(r1.isError).toBe(true)
      expect(r1.content[0]?.type === 'text' && r1.content[0].text).toContain('prompt must be a non-empty string')

      const r2 = await ctx.tools.execute({
        callId: ToolCallId('call-2'),
        name: 'generate_video',
        arguments: { prompt: 'motion', image_path: '   ' },
        signal: new AbortController().signal,
      })
      expect(r2.isError).toBe(true)
      expect(r2.content[0]?.type === 'text' && r2.content[0].text).toContain('image_path must be a non-empty string')
    })

    it('fails when BYTEPLUS_API_KEY is not set', async () => {
      delete process.env.BYTEPLUS_API_KEY
      const ctx = await createTestContext()

      const r = await ctx.tools.execute({
        callId: ToolCallId('call-key'),
        name: 'generate_video',
        arguments: { prompt: 'gentle camera tilt', image_path: 'still.png' },
        signal: new AbortController().signal,
      })
      expect(r.isError).toBe(true)
      expect(r.content[0]?.type === 'text' && r.content[0].text).toContain('BYTEPLUS_API_KEY environment variable is required')
    })

    it('generates video, polls task to completion, and persists output', async () => {
      process.env.BYTEPLUS_API_KEY = 'test-byteplus-key'
      const ctx = await createTestContext()

      const stillPath = join(dir, 'anchor.png')
      await writeFile(stillPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/tasks') && !url.includes('task-123')) {
          return new Response(JSON.stringify({ id: 'task-123' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.includes('/tasks/task-123')) {
          return new Response(
            JSON.stringify({
              status: 'succeeded',
              content: [{ video_url: 'https://cdn.example.com/rendered.mp4' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.includes('rendered.mp4')) {
          return new Response(MOCK_MP4_BYTES, {
            status: 200,
            headers: { 'Content-Type': 'video/mp4' },
          })
        }
        return new Response('Not found', { status: 404 })
      })

      const outVideoPath = join(dir, 'tmp', 'shot1.mp4')
      const result = await ctx.tools.execute({
        callId: ToolCallId('call-exec'),
        name: 'generate_video',
        arguments: {
          prompt: 'Presenter speaks directly to camera',
          image_path: 'anchor.png',
          script: 'Welcome to the platform',
          output_path: 'tmp/shot1.mp4',
          duration: 4,
          aspect_ratio: '9:16',
        },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBe(false)
      expect(fetchSpy).toHaveBeenCalledTimes(3)
      const diskBytes = await readFile(outVideoPath)
      expect(diskBytes).toEqual(MOCK_MP4_BYTES)
    })
  })
})
