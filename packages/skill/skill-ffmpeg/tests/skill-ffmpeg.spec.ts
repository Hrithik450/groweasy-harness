import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFfmpeg from '@deepseek-ai/dsh-skill-ffmpeg'
import {
  ensureFfmpegOnPath,
  probeFfmpegCapabilities,
  resolveFfmpeg,
} from '@deepseek-ai/dsh-skill-ffmpeg'

describe('dsh-skill-ffmpeg', () => {
  it('registers and disposes the bundled ffmpeg skill', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillFfmpeg)
    const resourcePath = fileURLToPath(new URL('../assets/ffmpeg/', import.meta.url))

    expect(await ctx.skills.list()).toEqual([{
      name: 'ffmpeg',
      description: 'Complete FFmpeg filter and encoder reference for this system. Read this before writing any ffmpeg bash command. Covers every option for all commonly used filters so commands are correct on the first attempt — no hallucination, no guessing.',
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'dsh-ffmpeg',
      source: 'bundled',
      resourceBase: { kind: 'directory', path: resourcePath },
    }])

    const loaded = await ctx.skills.get('ffmpeg')
    expect(loaded?.name).toBe('ffmpeg')
    expect(loaded?.content).toContain('FFmpeg')
    expect(loaded?.content).toContain('Available Encoders')
    expect(loaded?.content).toContain('Video Filters — Complete Option Reference')
    expect(loaded?.content).toContain('xfade')

    await fiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
  })

  it('resolves the active FFmpeg binary and capabilities', async () => {
    const resolution = await resolveFfmpeg()
    expect(resolution.ffmpegPath).toBeTruthy()
    expect(['env', 'standalone']).toContain(resolution.source)
    if (resolution.version) {
      expect(typeof resolution.version).toBe('string')
    }
    if (process.platform === 'darwin') {
      expect(resolution.hasVideoToolbox).toBe(true)
    }
  })

  it('resolves an explicit path override when provided', async () => {
    const current = await resolveFfmpeg()
    const custom = await resolveFfmpeg({ explicitPath: current.ffmpegPath })
    expect(custom.ffmpegPath).toBe(current.ffmpegPath)
    expect(custom.source).toBe('env')
  })

  it('ensures the resolved FFmpeg binary is on PATH', async () => {
    const originalPath = process.env.PATH
    const originalFfmpeg = process.env.FFMPEG_PATH
    const originalFfprobe = process.env.FFPROBE_PATH
    try {
      const resolved = await ensureFfmpegOnPath()
      expect(resolved).toBeTruthy()
      expect(process.env.PATH).toBeTruthy()
      expect(process.env.FFMPEG_PATH).toBe(resolved)
    } finally {
      process.env.PATH = originalPath
      if (originalFfmpeg === undefined) delete process.env.FFMPEG_PATH
      else process.env.FFMPEG_PATH = originalFfmpeg
      if (originalFfprobe === undefined) delete process.env.FFPROBE_PATH
      else process.env.FFPROBE_PATH = originalFfprobe
    }
  })

  it('probes invalid binaries gracefully without throwing', async () => {
    const probe = await probeFfmpegCapabilities('/non/existent/path/ffmpeg')
    expect(probe).toEqual({ hasVideoToolbox: false, hasNvenc: false })
  })

  it('throws an actionable error when explicit ffmpeg path does not exist', async () => {
    await expect(
      resolveFfmpeg({
        explicitPath: '/invalid/path/to/nothing',
      }),
    ).rejects.toThrow(/Explicit FFmpeg binary not found at/)
  })

  it('throws an actionable error when ffmpeg is missing and download is disabled', async () => {
    const originalFfmpeg = process.env.FFMPEG_PATH
    delete process.env.FFMPEG_PATH
    try {
      await expect(
        resolveFfmpeg({
          dshHome: '/tmp/empty-dsh-home-test',
          allowDownload: false,
        }),
      ).rejects.toThrow(/Standalone FFmpeg binary is not installed/)
    } finally {
      if (originalFfmpeg !== undefined) process.env.FFMPEG_PATH = originalFfmpeg
    }
  })

  it('ignores unmanaged host system binary paths in FFMPEG_PATH in favor of standalone binary', async () => {
    const originalFfmpeg = process.env.FFMPEG_PATH
    try {
      process.env.FFMPEG_PATH = '/opt/homebrew/bin/ffmpeg'
      const resolution = await resolveFfmpeg()
      expect(resolution.source).toBe('standalone')
      expect(resolution.ffmpegPath).not.toContain('/opt/homebrew')
    } finally {
      if (originalFfmpeg !== undefined) process.env.FFMPEG_PATH = originalFfmpeg
      else delete process.env.FFMPEG_PATH
    }
  })
})
