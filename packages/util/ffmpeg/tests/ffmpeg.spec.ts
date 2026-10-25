import { describe, expect, it } from 'vitest'
import {
  detectVideoEncoder,
  findFfmpegPath,
  probeMedia,
} from '../src/index.ts'

describe('@deepseek-ai/dsh-ffmpeg', () => {
  it('locates an ffmpeg path or defaults to ffmpeg command', () => {
    const p = findFfmpegPath()
    expect(typeof p).toBe('string')
    expect(p.length).toBeGreaterThan(0)
  })

  it('detects video encoder settings with valid encodingArgs', () => {
    const enc = detectVideoEncoder()
    expect(enc).toBeDefined()
    expect(typeof enc.videoCodec).toBe('string')
    expect(Array.isArray(enc.hwaccelArgs)).toBe(true)
    expect(Array.isArray(enc.encodingArgs)).toBe(true)
    expect(enc.encodingArgs.length).toBeGreaterThanOrEqual(2)
  })

  it('handles probe on nonexistent file gracefully', () => {
    const probe = probeMedia('/tmp/nonexistent-media-file-12345.mp4')
    expect(probe.duration).toBe(0)
    expect(probe.width).toBe(0)
    expect(probe.height).toBe(0)
    expect(probe.hasVideo).toBe(false)
    expect(probe.hasAudio).toBe(false)
  })
})
