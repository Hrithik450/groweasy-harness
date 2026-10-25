/**
 * Unit tests for the model-facing `generate_image` tool: model resolution,
 * conditional tool registration, parameter validation, image generation API
 * payload handling, aspect ratio resolution, file output, and presentation.
 */

import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  resolveImageModel,
  resolveImageSize,
} from '../src/generate-image.ts'

const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

describe('generate_image', () => {
  describe('resolveImageModel', () => {
    it('defaults to gpt-image-2 when env is undefined or whitespace', () => {
      expect(resolveImageModel(undefined)).toBe(DEFAULT_IMAGE_GENERATION_MODEL)
      expect(resolveImageModel('')).toBe(DEFAULT_IMAGE_GENERATION_MODEL)
      expect(resolveImageModel('   ')).toBe(DEFAULT_IMAGE_GENERATION_MODEL)
    })

    it('maps gpt-image-2 aliases to gpt-image-2', () => {
      expect(resolveImageModel('gpt-image-2.0')).toBe('gpt-image-2')
      expect(resolveImageModel('gpt-image')).toBe('gpt-image-2')
      expect(resolveImageModel('gpt-image-2')).toBe('gpt-image-2')
      expect(resolveImageModel('gpt-image-2.5-sunburst')).toBe('gpt-image-2.5')
    })

    it('preserves custom model names verbatim', () => {
      expect(resolveImageModel('dall-e-3')).toBe('dall-e-3')
      expect(resolveImageModel('custom-model-id')).toBe('custom-model-id')
    })
  })

  describe('resolveImageSize', () => {
    it('resolves standard aspect ratios for gpt-image-2', () => {
      expect(resolveImageSize('1:1', 'gpt-image-2')).toBe('1024x1024')
      expect(resolveImageSize(undefined, 'gpt-image-2')).toBe('1024x1024')
      expect(resolveImageSize('16:9', 'gpt-image-2')).toBe('1536x864')
      expect(resolveImageSize('9:16', 'gpt-image-2')).toBe('864x1536')
      expect(resolveImageSize('4:3', 'gpt-image-2')).toBe('1152x864')
      expect(resolveImageSize('3:4', 'gpt-image-2')).toBe('864x1152')
    })

    it('resolves aspect ratios for dall-e-3', () => {
      expect(resolveImageSize('1:1', 'dall-e-3')).toBe('1024x1024')
      expect(resolveImageSize('16:9', 'dall-e-3')).toBe('1792x1024')
      expect(resolveImageSize('9:16', 'dall-e-3')).toBe('1024x1792')
    })
  })

  describe('tool lifecycle and execution', () => {
    let dir: string
    let savedApiKey: string | undefined
    let savedModel: string | undefined
    let savedBaseUrl: string | undefined
    let savedQuality: string | undefined

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'generate-image-test-'))
      savedApiKey = process.env.OPENAI_API_KEY
      savedModel = process.env.IMAGE_GENERATION_MODEL
      savedBaseUrl = process.env.OPENAI_BASE_URL
      savedQuality = process.env.OPENAI_IMAGE_QUALITY
    })

    afterEach(async () => {
      if (savedApiKey === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = savedApiKey

      if (savedModel === undefined) delete process.env.IMAGE_GENERATION_MODEL
      else process.env.IMAGE_GENERATION_MODEL = savedModel

      if (savedBaseUrl === undefined) delete process.env.OPENAI_BASE_URL
      else process.env.OPENAI_BASE_URL = savedBaseUrl

      if (savedQuality === undefined) delete process.env.OPENAI_IMAGE_QUALITY
      else process.env.OPENAI_IMAGE_QUALITY = savedQuality

      vi.restoreAllMocks()
      await rm(dir, { recursive: true, force: true })
    })

    async function createTestContext(options: { generateImage?: boolean; mountLlm?: boolean; sandboxMode?: 'read-only' | 'workspace-write' } = {}) {
      const ctx = new Context()
      provideWorkingDirectoryFixture(ctx)
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(LocalFileSystem, { cwd: dir })
      if (options.sandboxMode) {
        ctx.provide('sandboxPolicy')
        ctx.sandboxPolicy = {
          defaultMode: options.sandboxMode,
          resolve: () => ({ mode: options.sandboxMode, workspaceRoot: dir }),
        } as never
        Object.defineProperty(ctx.fs, 'sandboxMode', { value: options.sandboxMode, configurable: true })
      }
      if (options.mountLlm ?? true) {
        ctx.provide('llm')
        ctx.llm = {} as never
      }
      await ctx.plugin(ToolFs, {
        read: false,
        write: false,
        edit: false,
        readImage: false,
        generateImage: options.generateImage ?? true,
      })
      return ctx
    }

    it('registers generate_image when generateImage is true and llm is mounted', async () => {
      const ctx = await createTestContext({ generateImage: true, mountLlm: true })
      expect(ctx.tools.get('generate_image')).toBeDefined()
      expect(ctx.tools.schemas().map(s => s.name)).toContain('generate_image')
    })

    it('omits generate_image when generateImage is false', async () => {
      const ctx = await createTestContext({ generateImage: false, mountLlm: true })
      expect(ctx.tools.get('generate_image')).toBeUndefined()
    })

    it('omits generate_image when llm service is not mounted', async () => {
      const ctx = await createTestContext({ generateImage: true, mountLlm: false })
      expect(ctx.tools.get('generate_image')).toBeUndefined()
    })

    it('rejects an empty prompt or empty file_path', async () => {
      const ctx = await createTestContext()
      process.env.OPENAI_API_KEY = 'test-api-key'

      const r1 = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'generate_image',
        arguments: { prompt: '', file_path: 'output.png' },
        signal: new AbortController().signal,
      })
      expect(r1.isError).toBe(true)
      expect(r1.content[0]?.type === 'text' && r1.content[0].text).toContain('prompt must be a non-empty string')

      const r2 = await ctx.tools.execute({
        callId: ToolCallId('call-2'),
        name: 'generate_image',
        arguments: { prompt: 'a cute cat', file_path: '   ' },
        signal: new AbortController().signal,
      })
      expect(r2.isError).toBe(true)
      expect(r2.content[0]?.type === 'text' && r2.content[0].text).toContain('file_path must be a non-empty string')
    })

    it('throws when OPENAI_API_KEY is not set', async () => {
      const ctx = await createTestContext()
      delete process.env.OPENAI_API_KEY

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'generate_image',
        arguments: { prompt: 'test', file_path: 'output.png' },
        signal: new AbortController().signal,
      })
      expect(result.isError).toBe(true)
      expect(result.content[0]?.type === 'text' && result.content[0].text).toContain('OPENAI_API_KEY environment variable is required')
    })

    it('generates an image and writes to disk', async () => {
      const ctx = await createTestContext()
      process.env.OPENAI_API_KEY = 'mock-key'
      process.env.IMAGE_GENERATION_MODEL = 'gpt-image-2.0'
      process.env.OPENAI_IMAGE_QUALITY = 'high'

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          created: 1713700000,
          data: [
            {
              b64_json: TINY_PNG_BASE64,
            },
          ],
        }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'generate_image',
        arguments: { prompt: 'A cozy campfire at night', file_path: join(dir, 'sub/campfire.png'), aspect_ratio: '16:9' },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBe(false)
      expect(result.meta).toEqual({ path: expect.stringContaining('campfire.png') })
      const textBlock = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(textBlock).toContain('Image generated and saved to')

      const savedPath = (result.meta as { path: string }).path
      const savedBytes = await readFile(savedPath)
      expect(savedBytes.byteLength).toBeGreaterThan(0)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(calledUrl).toBe('https://api.openai.com/v1/images/generations')
      const headers = calledInit.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer mock-key')
      expect(headers['Content-Type']).toBe('application/json')

      const body = JSON.parse(calledInit.body as string)
      expect(body).toEqual({
        model: 'gpt-image-2',
        prompt: 'A cozy campfire at night',
        n: 1,
        size: '1536x864',
        quality: 'high',
      })

      const tool = ctx.tools.get('generate_image')!
      const view = tool.presentCall?.({ prompt: 'test', file_path: 'campfire.png' })
      expect(view?.card).toBe('generic')
      if (view?.card === 'generic') {
        expect(view.title).toContain('campfire.png')
        expect(view.kind).toBe('edit')
      }

      const resultView = tool.presentResult?.(
        { prompt: 'test', file_path: 'campfire.png' },
        { content: [], isError: false },
      )
      expect(resultView?.card).toBe('generic')
      if (resultView?.card === 'generic') {
        expect(resultView.title).toBe('Generated image campfire.png')
      }
    })

    it('downloads image from url fallback if b64_json is omitted', async () => {
      const ctx = await createTestContext()
      process.env.OPENAI_API_KEY = 'mock-key'

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ url: 'https://cdn.example.com/generated.png' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => Buffer.from(TINY_PNG_BASE64, 'base64'),
        })
      vi.stubGlobal('fetch', fetchMock)

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-url'),
        name: 'generate_image',
        arguments: { prompt: 'A sunny beach', file_path: join(dir, 'beach.png') },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const savedBytes = await readFile(join(dir, 'beach.png'))
      expect(savedBytes.byteLength).toBeGreaterThan(0)
    })

    it('handles HTTP error responses from provider', async () => {
      const ctx = await createTestContext()
      process.env.OPENAI_API_KEY = 'mock-key'

      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid prompt safety check',
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'generate_image',
        arguments: { prompt: 'test', file_path: 'fail.png' },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.type === 'text' && result.content[0].text).toContain(
        'Image generation failed (400): Invalid prompt safety check',
      )
    })

    it('throws when the response contains no image data', async () => {
      const ctx = await createTestContext()
      process.env.OPENAI_API_KEY = 'mock-key'

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
        }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'generate_image',
        arguments: { prompt: 'test', file_path: 'empty.png' },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.type === 'text' && result.content[0].text).toContain(
        'No image payload returned by the provider.',
      )
    })

    it('denies writing under read-only sandbox mode', async () => {
      const ctx = await createTestContext({ sandboxMode: 'read-only' })
      process.env.OPENAI_API_KEY = 'mock-key'

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-ro'),
        name: 'generate_image',
        arguments: { prompt: 'A sunny beach', file_path: join(dir, 'beach.png') },
        signal: new AbortController().signal,
      })
      expect(result.isError).toBe(true)
      expect(result.content[0]?.type === 'text' && result.content[0].text).toContain(
        '[sandbox: file access denied under read-only mode]',
      )
    })

    it('denies writing outside workspace under workspace-write sandbox mode', async () => {
      const ctx = await createTestContext({ sandboxMode: 'workspace-write' })
      process.env.OPENAI_API_KEY = 'mock-key'

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-ww-outside'),
        name: 'generate_image',
        arguments: { prompt: 'A sunny beach', file_path: '/nonexistent/secret/beach.png' },
        signal: new AbortController().signal,
      })
      expect(result.isError).toBe(true)
      expect(result.content[0]?.type === 'text' && result.content[0].text).toContain(
        '[sandbox: file access denied under workspace-write mode]',
      )
    })
  })
})
