/**
 * Unit tests for `render_video`: parameter validation, clip resolution,
 * filtergraph construction, FFmpeg execution, and presentation.
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

const MOCK_MP4_BYTES = Buffer.from([
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
  0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  0x6d, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x08,
])

describe('render_video', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'render-video-test-'))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(dir, { recursive: true, force: true })
  })

  async function createTestContext(options: { renderVideo?: boolean } = {}) {
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
      renderVideo: options.renderVideo ?? true,
      renderCaptions: false,
    })
    return ctx
  }

  it('registers render_video when renderVideo is true', async () => {
    const ctx = await createTestContext({ renderVideo: true })
    expect(ctx.tools.get('render_video')).toBeDefined()
    expect(ctx.tools.schemas().map(s => s.name)).toContain('render_video')
  })

  it('omits render_video when renderVideo is false', async () => {
    const ctx = await createTestContext({ renderVideo: false })
    expect(ctx.tools.get('render_video')).toBeUndefined()
  })

  it('rejects empty clips or output_path', async () => {
    const ctx = await createTestContext()

    const r1 = await ctx.tools.execute({
      callId: ToolCallId('call-1'),
      name: 'render_video',
      arguments: { clips: [], output_path: 'reel.mp4' },
      signal: new AbortController().signal,
    })
    expect(r1.isError).toBe(true)
    expect(r1.content[0]?.type === 'text' && r1.content[0].text).toContain('clips must be a non-empty array')

    const r2 = await ctx.tools.execute({
      callId: ToolCallId('call-2'),
      name: 'render_video',
      arguments: { clips: ['clip1.mp4'], output_path: '   ' },
      signal: new AbortController().signal,
    })
    expect(r2.isError).toBe(true)
    expect(r2.content[0]?.type === 'text' && r2.content[0].text).toContain('output_path must be a non-empty string')
  })

  it('rejects missing clip files', async () => {
    const ctx = await createTestContext()

    const r = await ctx.tools.execute({
      callId: ToolCallId('call-missing'),
      name: 'render_video',
      arguments: { clips: ['nonexistent.mp4'], output_path: 'reel.mp4' },
      signal: new AbortController().signal,
    })
    expect(r.isError).toBe(true)
    expect(r.content[0]?.type === 'text' && r.content[0].text).toContain('Media file not found')
  })

  it('renders video clips into stitched output file', async () => {
    const ctx = await createTestContext()

    const clip1 = join(dir, 'c1.mp4')
    const clip2 = join(dir, 'c2.mp4')
    await writeFile(clip1, MOCK_MP4_BYTES)
    await writeFile(clip2, MOCK_MP4_BYTES)

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

    const result = await ctx.tools.execute({
      callId: ToolCallId('call-render'),
      name: 'render_video',
      arguments: {
        clips: ['c1.mp4', 'c2.mp4'],
        output_path: 'tmp/reel.mp4',
        transition: 'fade',
        transition_duration: 0.3,
      },
      signal: new AbortController().signal,
    })

    expect(result.isError).toBe(false)
    expect(ffmpegSpy).toHaveBeenCalled()
    const outBytes = await readFile(join(dir, 'tmp', 'reel.mp4'))
    expect(outBytes).toEqual(MOCK_MP4_BYTES)
  })
})
