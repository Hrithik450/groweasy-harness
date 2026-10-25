/**
 * The `read_video` tool tests:
 * extension routing, extension-less content sniffing, route modality gating,
 * durable CAS commit, VideoBlock rendering, limits, and presentation.
 */

import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId, LlmAdapter, LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmResolvedModelInfo, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as FsPolicy from '@deepseek-ai/dsh-fs-observation-policy'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'

function createMp4Buffer(options?: {
  brand?: string
  width?: number
  height?: number
  duration?: number
  timescale?: number
}): Uint8Array {
  const brand = options?.brand ?? 'isom'
  const width = options?.width ?? 1920
  const height = options?.height ?? 1080
  const timescale = options?.timescale ?? 1000
  const duration = options?.duration ?? 5
  const durationUnits = Math.round(duration * timescale)

  const ftyp = Buffer.alloc(16)
  ftyp.writeUInt32BE(16, 0)
  ftyp.write('ftyp', 4, 'ascii')
  ftyp.write(brand, 8, 'ascii')
  ftyp.writeUInt32BE(0, 12)

  const mvhd = Buffer.alloc(108)
  mvhd.writeUInt32BE(108, 0)
  mvhd.write('mvhd', 4, 'ascii')
  mvhd.writeUInt8(0, 8)
  mvhd.writeUInt32BE(timescale, 20)
  mvhd.writeUInt32BE(durationUnits, 24)

  const tkhd = Buffer.alloc(92)
  tkhd.writeUInt32BE(92, 0)
  tkhd.write('tkhd', 4, 'ascii')
  tkhd.writeUInt8(0, 8)
  tkhd.writeUInt16BE(width, 76)
  tkhd.writeUInt16BE(height, 80)

  const trak = Buffer.concat([Buffer.alloc(8), tkhd])
  trak.writeUInt32BE(trak.length, 0)
  trak.write('trak', 4, 'ascii')

  const moov = Buffer.concat([Buffer.alloc(8), mvhd, trak])
  moov.writeUInt32BE(moov.length, 0)
  moov.write('moov', 4, 'ascii')

  return new Uint8Array(Buffer.concat([ftyp, moov]))
}

function createWebmBuffer(options?: {
  width?: number
  height?: number
  durationMs?: number
}): Uint8Array {
  const width = options?.width ?? 1280
  const height = options?.height ?? 720
  const durationMs = options?.durationMs ?? 3000

  const header = Buffer.from([
    0x1a, 0x45, 0xdf, 0xa3,
    0x01, 0x00, 0x00, 0x00,
    0x42, 0x82, 0x84,
    0x77, 0x65, 0x62, 0x6d,
  ])

  const dur = Buffer.alloc(7)
  dur[0] = 0x44
  dur[1] = 0x89
  dur[2] = 0x84
  dur.writeFloatBE(durationMs, 3)

  const w = Buffer.from([0xb0, 0x82, (width >> 8) & 0xff, width & 0xff])
  const h = Buffer.from([0xba, 0x82, (height >> 8) & 0xff, height & 0xff])

  return new Uint8Array(Buffer.concat([header, dur, w, h]))
}

const testToolSignal = new AbortController().signal

class CatalogAdapter extends LlmAdapter {
  constructor(
    private readonly models: LlmModelInfo[],
    private readonly resolvedModels: LlmModelInfo[] = models,
  ) {
    super()
  }

  override listModels(_provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.models)
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const resolved = this.resolvedModels.find(candidate => candidate.id === model)
    return Promise.resolve({
      provider,
      id: model,
      name: resolved?.name ?? model,
      ...resolved?.inputModalities === undefined ? {} : { inputModalities: [...resolved.inputModalities] },
    })
  }

  override stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    throw new Error('read_video tests never stream')
  }
}

let dir: string
let home: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsh-read-video-'))
  home = await mkdtemp(join(tmpdir(), 'dsh-read-video-home-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
  await rm(home, { recursive: true, force: true })
})

interface SetupOptions {
  toolFs?: ToolFs.Config
  models?: LlmModelInfo[]
  attachments?: boolean
  llm?: boolean
  storeConfig?: { maxVideoBytes?: number }
}

async function setup(options: SetupOptions = {}) {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  provideWorkingDirectoryFixture(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(FsPolicy)
  if (options.attachments !== false) {
    await ctx.plugin(LocalAttachmentStore, { dshHome: home, ...options.storeConfig })
  }
  if (options.llm !== false) {
    await ctx.plugin(LlmRuntime)
    ctx.llm.registerAdapter(['video-prov'], new CatalogAdapter(options.models ?? [
      { provider: 'video-prov', id: 'video-model', name: 'Video', inputModalities: ['text', 'video'] as never },
      { provider: 'video-prov', id: 'vision-model', name: 'Vision', inputModalities: ['text', 'image'] },
      { provider: 'video-prov', id: 'legacy-model', name: 'Legacy' },
    ]))
  }
  await ctx.plugin(ToolFs, { readVideo: true, ...options.toolFs })
  return ctx
}

function agentOn(model: string | undefined, provider = 'video-prov', messages: readonly Message[] = []): object {
  return {
    options: {},
    session: {
      header: { cwd: dir },
      requestHeader: () => (model === undefined ? undefined : { config: { provider, model } }),
      deriveMessages: () => [...messages],
      append: () => undefined,
    },
  }
}

let callCounter = 0
function call(ctx: Context, name: string, args: unknown, agent?: object) {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: ToolCallId(`vid-call-${++callCounter}`),
    name,
    arguments: args,
    ...agent ? { agent: agent as never } : {},
  })
}

function readVideo(ctx: Context, args: unknown, agent?: object) {
  return call(ctx, 'read_video', args, agent)
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

describe('read_video tool', () => {
  it('registers read_video when attachments store is mounted', async () => {
    const ctx = await setup()
    expect(ctx.tools.get('read_video')).toBeDefined()
  })

  it('omits read_video by default without explicit opt-in', async () => {
    const defaultCtx = new Context()
    onTestFinished(async () => { await defaultCtx.fiber.dispose() })
    await defaultCtx.plugin(SystemPrompt)
    await defaultCtx.plugin(ToolRuntime, { mode: 'native' })
    await defaultCtx.plugin(LocalFileSystem, { cwd: dir })
    await defaultCtx.plugin(LocalAttachmentStore, { dshHome: home })
    await defaultCtx.plugin(ToolFs, {})
    expect(defaultCtx.tools.get('read_video')).toBeUndefined()
  })

  it('omits read_video when readVideo config is false', async () => {
    const ctx = await setup({ toolFs: { readVideo: false } })
    expect(ctx.tools.get('read_video')).toBeUndefined()
  })

  it('rejects an empty file_path argument', async () => {
    const ctx = await setup()
    const result = await readVideo(ctx, { file_path: '   ' }, agentOn('video-model'))
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('file_path must be a non-empty string')
  })

  it('rejects an unsupported extension before reading bytes', async () => {
    const ctx = await setup()
    const result = await readVideo(ctx, { file_path: 'clip.avi' }, agentOn('video-model'))
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('the .avi extension does not declare a supported video format')
  })

  it('rejects when the calling route does not support video', async () => {
    const ctx = await setup()
    await writeFile(join(dir, 'test.mp4'), createMp4Buffer())
    const result = await readVideo(ctx, { file_path: 'test.mp4' }, agentOn('vision-model'))
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('does not declare video input')
  })

  it('accepts when route declares video input or leaves modalities undefined', async () => {
    const ctx = await setup()
    await writeFile(join(dir, 'test.mp4'), createMp4Buffer({ width: 1280, height: 720, duration: 3.5 }))

    const result = await readVideo(ctx, { file_path: 'test.mp4' }, agentOn('video-model'))
    expect(result.isError).toBe(false)
    expect(text(result)).toContain('video/mp4 video, 1280x720 px, 3.5s')
    expect(result.content).toContainEqual(expect.objectContaining({
      type: 'video',
      attachment: expect.objectContaining({
        mediaType: 'video/mp4',
        width: 1280,
        height: 720,
        duration: 3.5,
      }),
    }))

    // Legacy model with undefined inputModalities is also accepted
    const legacyResult = await readVideo(ctx, { file_path: 'test.mp4' }, agentOn('legacy-model'))
    expect(legacyResult.isError).toBe(false)
    expect(text(legacyResult)).toContain('video/mp4')
  })

  it('reads WebM videos with correct dimensions and duration', async () => {
    const ctx = await setup()
    await writeFile(join(dir, 'anim.webm'), createWebmBuffer({ width: 640, height: 480, durationMs: 2000 }))

    const result = await readVideo(ctx, { file_path: 'anim.webm' }, agentOn('video-model'))
    expect(result.isError).toBe(false)
    expect(text(result)).toContain('video/webm video, 640x480 px, 2.0s')
    expect(result.content).toContainEqual(expect.objectContaining({
      type: 'video',
      attachment: expect.objectContaining({
        mediaType: 'video/webm',
        width: 640,
        height: 480,
        duration: 2,
      }),
    }))
  })

  it('sniffs video format for extension-less files', async () => {
    const ctx = await setup()
    await writeFile(join(dir, 'raw_video'), createMp4Buffer({ width: 1920, height: 1080, duration: 1.0 }))

    const result = await readVideo(ctx, { file_path: 'raw_video' }, agentOn('video-model'))
    expect(result.isError).toBe(false)
    expect(text(result)).toContain('video/mp4 video, 1920x1080 px, 1.0s')
  })

  it('rejects when file exceeds the video byte cap', async () => {
    const ctx = await setup({ storeConfig: { maxVideoBytes: 100 } })
    const data = createMp4Buffer()
    await writeFile(join(dir, 'large.mp4'), data)

    const result = await readVideo(ctx, { file_path: 'large.mp4' }, agentOn('video-model'))
    expect(result.isError).toBe(true)
    expect(text(result)).toMatch(/exceeds the .* limit/)
  })

  it('rejects missing file with not found', async () => {
    const ctx = await setup()
    const result = await readVideo(ctx, { file_path: 'missing.mp4' }, agentOn('video-model'))
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('not found')
  })

  it('declares read_video parallel-safe and presents a read card', async () => {
    const ctx = await setup()
    expect(ctx.tools.executionMode({
      signal: testToolSignal, callId: ToolCallId('vid-parallel'), name: 'read_video', arguments: { file_path: 'a.mp4' },
    })).toEqual({ kind: 'parallel' })
    expect(ctx.tools.get('read_video')?.presentCall?.({ file_path: 'clip.mp4' })).toEqual({
      card: 'generic',
      title: 'Read video clip.mp4',
      kind: 'read',
      locations: [{ path: 'clip.mp4' }],
    })
  })
})
