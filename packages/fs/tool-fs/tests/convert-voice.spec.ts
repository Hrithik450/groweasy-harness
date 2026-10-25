/**
 * Unit tests for `convert_voice`: voice resolution, parameter validation,
 * Speech-to-Speech audio transformation, error handling, and presentation.
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
import {
  DEFAULT_VOICE,
  resolveVoiceId,
  VOICE_CATALOG,
} from '../src/convert-voice.ts'

const MOCK_MP3_BYTES = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00])

describe('convert_voice', () => {
  describe('resolveVoiceId', () => {
    it('defaults to shivraj when voice is undefined or empty', () => {
      expect(DEFAULT_VOICE).toBe('shivraj')
      expect(resolveVoiceId(undefined)).toBe(VOICE_CATALOG.shivraj.id)
      expect(resolveVoiceId('')).toBe(VOICE_CATALOG.shivraj.id)
      expect(resolveVoiceId('   ')).toBe(VOICE_CATALOG.shivraj.id)
    })

    it('resolves curated voice aliases', () => {
      expect(resolveVoiceId('shivraj')).toBe(VOICE_CATALOG.shivraj.id)
      expect(resolveVoiceId('dr-joshi')).toBe(VOICE_CATALOG['dr-joshi'].id)
      expect(resolveVoiceId('shlok')).toBe(VOICE_CATALOG.shlok.id)
      expect(resolveVoiceId('manish')).toBe(VOICE_CATALOG.manish.id)
      expect(resolveVoiceId('kalyan')).toBe(VOICE_CATALOG.kalyan.id)
      expect(resolveVoiceId('surabhi')).toBe(VOICE_CATALOG.surabhi.id)
      expect(resolveVoiceId('vanishree')).toBe(VOICE_CATALOG.vanishree.id)
    })

    it('preserves custom voice IDs verbatim', () => {
      expect(resolveVoiceId('custom-voice-uuid-1234')).toBe('custom-voice-uuid-1234')
    })
  })

  describe('tool lifecycle and execution', () => {
    let dir: string
    let savedApiKey: string | undefined

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'convert-voice-test-'))
      savedApiKey = process.env.ELEVENLABS_API_KEY
    })

    afterEach(async () => {
      if (savedApiKey === undefined) delete process.env.ELEVENLABS_API_KEY
      else process.env.ELEVENLABS_API_KEY = savedApiKey

      vi.restoreAllMocks()
      await rm(dir, { recursive: true, force: true })
    })

    async function createTestContext(options: { convertVoice?: boolean } = {}) {
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
        convertVoice: options.convertVoice ?? true,
        dubAudio: false,
      })
      return ctx
    }

    it('registers convert_voice when convertVoice is true', async () => {
      const ctx = await createTestContext({ convertVoice: true })
      expect(ctx.tools.get('convert_voice')).toBeDefined()
      expect(ctx.tools.schemas().map(s => s.name)).toContain('convert_voice')
    })

    it('omits convert_voice when convertVoice is false', async () => {
      const ctx = await createTestContext({ convertVoice: false })
      expect(ctx.tools.get('convert_voice')).toBeUndefined()
    })

    it('rejects an empty input_path or output_path', async () => {
      const ctx = await createTestContext()
      process.env.ELEVENLABS_API_KEY = 'test-key'

      const r1 = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'convert_voice',
        arguments: { input_path: '', output_path: 'out.mp3' },
        signal: new AbortController().signal,
      })
      expect(r1.isError).toBe(true)
      expect(r1.content[0]?.type === 'text' && r1.content[0].text).toContain('input_path must be a non-empty string')

      const r2 = await ctx.tools.execute({
        callId: ToolCallId('call-2'),
        name: 'convert_voice',
        arguments: { input_path: 'in.mp3', output_path: '   ' },
        signal: new AbortController().signal,
      })
      expect(r2.isError).toBe(true)
      expect(r2.content[0]?.type === 'text' && r2.content[0].text).toContain('output_path must be a non-empty string')
    })

    it('throws when ELEVENLABS_API_KEY is not set', async () => {
      const ctx = await createTestContext()
      delete process.env.ELEVENLABS_API_KEY

      const r = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'convert_voice',
        arguments: { input_path: 'in.mp3', output_path: 'out.mp3' },
        signal: new AbortController().signal,
      })
      expect(r.isError).toBe(true)
      expect(r.content[0]?.type === 'text' && r.content[0].text).toContain('ELEVENLABS_API_KEY environment variable is required')
    })

    it('converts voice audio and writes to output_path', async () => {
      const ctx = await createTestContext()
      process.env.ELEVENLABS_API_KEY = 'mock-eleven-key'

      const inputAudioPath = join(dir, 'original.mp3')
      await writeFile(inputAudioPath, MOCK_MP3_BYTES)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Uint8Array.from(MOCK_MP3_BYTES).buffer,
      })
      vi.stubGlobal('fetch', fetchMock)

      const outputPath = join(dir, 'converted_shivraj.mp3')
      const result = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'convert_voice',
        arguments: {
          input_path: inputAudioPath,
          output_path: outputPath,
          voice: 'shivraj',
        },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBe(false)
      expect(result.meta).toEqual({ path: expect.stringContaining('converted_shivraj.mp3') })
      const textBlock = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(textBlock).toContain('Voice tone transformed to `shivraj`')

      const savedBytes = await readFile(outputPath)
      expect(savedBytes.byteLength).toBe(MOCK_MP3_BYTES.byteLength)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(calledUrl).toContain(`speech-to-speech/${VOICE_CATALOG.shivraj.id}`)
      expect((calledInit.headers as Record<string, string>)['xi-api-key']).toBe('mock-eleven-key')

      const tool = ctx.tools.get('convert_voice')!
      const view = tool.presentCall?.({ input_path: 'in.mp3', output_path: 'out.mp3' })
      expect(view?.card).toBe('generic')
      if (view?.card === 'generic') {
        expect(view.kind).toBe('edit')
      }
    })

    it('handles HTTP error responses from the provider', async () => {
      const ctx = await createTestContext()
      process.env.ELEVENLABS_API_KEY = 'mock-key'

      const inputAudioPath = join(dir, 'original.mp3')
      await writeFile(inputAudioPath, MOCK_MP3_BYTES)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'convert_voice',
        arguments: { input_path: inputAudioPath, output_path: join(dir, 'out.mp3') },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.type === 'text' && result.content[0].text).toContain(
        'Voice conversion API HTTP 401: Invalid API key',
      )
    })
  })
})
