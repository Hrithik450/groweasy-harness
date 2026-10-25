/**
 * Unit tests for `dub_audio`: voice resolution, script phonetic normalization,
 * multi-lingual TTS dubbing, error handling, and presentation.
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
  DEFAULT_DUB_VOICE,
  DUBBING_VOICE_CATALOG,
  normalizeScriptForSpeech,
  resolveDubbingVoiceId,
} from '../src/dub-audio.ts'

const MOCK_AUDIO_BYTES = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00])

describe('dub_audio', () => {
  describe('resolveDubbingVoiceId', () => {
    it('defaults to aarav when voice is undefined or empty', () => {
      expect(DEFAULT_DUB_VOICE).toBe('aarav')
      expect(resolveDubbingVoiceId(undefined)).toBe(DUBBING_VOICE_CATALOG.aarav.id)
      expect(resolveDubbingVoiceId('')).toBe(DUBBING_VOICE_CATALOG.aarav.id)
      expect(resolveDubbingVoiceId('   ')).toBe(DUBBING_VOICE_CATALOG.aarav.id)
    })

    it('resolves curated dubbing voice aliases', () => {
      expect(resolveDubbingVoiceId('aarav')).toBe(DUBBING_VOICE_CATALOG.aarav.id)
      expect(resolveDubbingVoiceId('rushi')).toBe(DUBBING_VOICE_CATALOG.rushi.id)
      expect(resolveDubbingVoiceId('lovinder')).toBe(DUBBING_VOICE_CATALOG.lovinder.id)
      expect(resolveDubbingVoiceId('mohit')).toBe(DUBBING_VOICE_CATALOG.mohit.id)
      expect(resolveDubbingVoiceId('shivraj')).toBe(DUBBING_VOICE_CATALOG.shivraj.id)
    })

    it('preserves custom voice IDs verbatim', () => {
      expect(resolveDubbingVoiceId('custom-dub-voice-id')).toBe('custom-dub-voice-id')
    })
  })

  describe('normalizeScriptForSpeech', () => {
    it('phonetically normalizes domain names (.ai, .io, .com)', () => {
      expect(normalizeScriptForSpeech('Visit GrowEasy.ai today')).toBe('Visit GrowEasy dot A.I. today')
      expect(normalizeScriptForSpeech('Powered by app.io and web.com')).toBe('Powered by app dot I.O. and web dot com')
    })

    it('phonetically normalizes currency amounts', () => {
      expect(normalizeScriptForSpeech('Save ₹10,000 every month')).toBe('Save 10000 rupees every month')
    })
  })

  describe('tool lifecycle and execution', () => {
    let dir: string
    let savedApiKey: string | undefined

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'dub-audio-test-'))
      savedApiKey = process.env.ELEVENLABS_API_KEY
    })

    afterEach(async () => {
      if (savedApiKey === undefined) delete process.env.ELEVENLABS_API_KEY
      else process.env.ELEVENLABS_API_KEY = savedApiKey

      vi.restoreAllMocks()
      await rm(dir, { recursive: true, force: true })
    })

    async function createTestContext(options: { dubAudio?: boolean } = {}) {
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
        dubAudio: options.dubAudio ?? true,
      })
      return ctx
    }

    it('registers dub_audio when dubAudio is true', async () => {
      const ctx = await createTestContext({ dubAudio: true })
      expect(ctx.tools.get('dub_audio')).toBeDefined()
      expect(ctx.tools.schemas().map(s => s.name)).toContain('dub_audio')
    })

    it('omits dub_audio when dubAudio is false', async () => {
      const ctx = await createTestContext({ dubAudio: false })
      expect(ctx.tools.get('dub_audio')).toBeUndefined()
    })

    it('rejects an empty script or output_path', async () => {
      const ctx = await createTestContext()
      process.env.ELEVENLABS_API_KEY = 'test-key'

      const r1 = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'dub_audio',
        arguments: { script: '', output_path: 'out.mp3' },
        signal: new AbortController().signal,
      })
      expect(r1.isError).toBe(true)
      expect(r1.content[0]?.type === 'text' && r1.content[0].text).toContain('script must be a non-empty string')

      const r2 = await ctx.tools.execute({
        callId: ToolCallId('call-2'),
        name: 'dub_audio',
        arguments: { script: 'test', output_path: '   ' },
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
        name: 'dub_audio',
        arguments: { script: 'test', output_path: 'out.mp3' },
        signal: new AbortController().signal,
      })
      expect(r.isError).toBe(true)
      expect(r.content[0]?.type === 'text' && r.content[0].text).toContain('ELEVENLABS_API_KEY environment variable is required')
    })

    it('synthesizes dubbed audio and writes to output_path', async () => {
      const ctx = await createTestContext()
      process.env.ELEVENLABS_API_KEY = 'mock-eleven-key'

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Uint8Array.from(MOCK_AUDIO_BYTES).buffer,
      })
      vi.stubGlobal('fetch', fetchMock)

      const outputPath = join(dir, 'dubbed_hindi.mp3')
      const result = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'dub_audio',
        arguments: {
          script: 'GrowEasy.ai se aapki growth autopilot pe chalti hai.',
          output_path: outputPath,
          voice: 'aarav',
        },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBe(false)
      expect(result.meta).toEqual({ path: expect.stringContaining('dubbed_hindi.mp3') })
      const textBlock = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(textBlock).toContain('Audio dubbed with voice `aarav`')
      expect(textBlock).toContain('Ready for lip-sync')

      const savedBytes = await readFile(outputPath)
      expect(savedBytes.byteLength).toBe(MOCK_AUDIO_BYTES.byteLength)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(calledUrl).toContain(`text-to-speech/${DUBBING_VOICE_CATALOG.aarav.id}`)
      expect((calledInit.headers as Record<string, string>)['xi-api-key']).toBe('mock-eleven-key')

      const payload = JSON.parse(calledInit.body as string)
      expect(payload.text).toContain('GrowEasy dot A.I.')

      const tool = ctx.tools.get('dub_audio')!
      const view = tool.presentCall?.({ script: 'test', output_path: 'out.mp3' })
      expect(view?.card).toBe('generic')
      if (view?.card === 'generic') {
        expect(view.kind).toBe('edit')
      }
    })

    it('handles HTTP error responses from the provider', async () => {
      const ctx = await createTestContext()
      process.env.ELEVENLABS_API_KEY = 'mock-key'

      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Quota exceeded',
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'dub_audio',
        arguments: { script: 'test', output_path: join(dir, 'out.mp3') },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.type === 'text' && result.content[0].text).toContain(
        'Audio dubbing API HTTP 400: Quota exceeded',
      )
    })
  })
})
