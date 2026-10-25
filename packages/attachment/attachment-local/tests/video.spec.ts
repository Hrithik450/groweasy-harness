import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentError } from '@deepseek-ai/dsh-attachment'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_VIDEO_BYTES,
  LocalAttachmentStore,
  detectVideo,
  normalizedVideoPath,
  readVideoFile,
  readVideoStreamFile,
  saveVideoFile,
  saveVideoStreamFile,
} from '../src/index.ts'

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

describe('video detection and storage', () => {
  it('detects standard MP4 metadata', () => {
    const mp4 = createMp4Buffer({ width: 1920, height: 1080, duration: 4.5 })
    const detected = detectVideo(mp4)
    expect(detected.mediaType).toBe('video/mp4')
    expect(detected.width).toBe(1920)
    expect(detected.height).toBe(1080)
    expect(detected.duration).toBe(4.5)
  })

  it('detects QuickTime MOV brand', () => {
    const mov = createMp4Buffer({ brand: 'qt  ', width: 640, height: 480, duration: 2 })
    const detected = detectVideo(mov)
    expect(detected.mediaType).toBe('video/quicktime')
    expect(detected.width).toBe(640)
    expect(detected.height).toBe(480)
    expect(detected.duration).toBe(2)
  })

  it('detects WebM metadata', () => {
    const webm = createWebmBuffer({ width: 1280, height: 720, durationMs: 2500 })
    const detected = detectVideo(webm)
    expect(detected.mediaType).toBe('video/webm')
    expect(detected.width).toBe(1280)
    expect(detected.height).toBe(720)
    expect(detected.duration).toBe(2.5)
  })

  it('rejects invalid or empty video data', () => {
    expect(() => detectVideo(new Uint8Array(0))).toThrowError(AttachmentError)
    expect(() => detectVideo(new Uint8Array([1, 2, 3, 4, 5]))).toThrowError(AttachmentError)
  })

  it('stores video in objects/<prefix>/<sha256> without extension', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'dsh-video-test-'))
    const root = join(temp, 'attachments', 'v1')
    try {
      const limits = {
        maxVideoBytes: DEFAULT_MAX_VIDEO_BYTES,
        mediaTypes: ['video/mp4', 'video/webm', 'video/quicktime'] as const,
      }
      const data = createMp4Buffer({ width: 1280, height: 720, duration: 3 })
      const ref = await saveVideoFile(root, { data, mediaType: 'video/mp4', name: 'sample.mp4' }, limits)

      expect(ref.mediaType).toBe('video/mp4')
      expect(ref.bytes).toBe(data.byteLength)
      expect(ref.width).toBe(1280)
      expect(ref.height).toBe(720)
      expect(ref.duration).toBe(3)
      expect(ref.name).toBe('sample.mp4')

      const hostPath = normalizedVideoPath(root, ref)
      expect(hostPath).toContain(join('objects', String(ref.attachmentId).slice(7, 9)))
      expect(hostPath.endsWith('.mp4')).toBe(false)

      const storedBytes = await readFile(hostPath)
      expect(new Uint8Array(storedBytes)).toEqual(data)

      const read = await readVideoFile(root, ref)
      expect(read.ref).toEqual(ref)
      expect(read.data).toEqual(data)
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

  it('enforces 50 MB limit and rejects oversized videos', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'dsh-video-test-'))
    const root = join(temp, 'attachments', 'v1')
    try {
      const limits = {
        maxVideoBytes: 100, // Small limit for test
        mediaTypes: ['video/mp4'] as const,
      }
      const data = createMp4Buffer()
      await expect(saveVideoFile(root, { data, mediaType: 'video/mp4' }, limits)).rejects.toThrowError(
        expect.objectContaining({ code: 'VIDEO_TOO_LARGE' }),
      )
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

  it('supports streaming save and read', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'dsh-video-test-'))
    const root = join(temp, 'attachments', 'v1')
    try {
      const limits = {
        maxVideoBytes: DEFAULT_MAX_VIDEO_BYTES,
        mediaTypes: ['video/mp4', 'video/webm', 'video/quicktime'] as const,
      }
      const data = createWebmBuffer({ width: 800, height: 600, durationMs: 1500 })
      const chunks = [
        data.slice(0, 10),
        data.slice(10, 20),
        data.slice(20),
      ]
      async function* stream(): AsyncIterable<Uint8Array> {
        for (const chunk of chunks) yield chunk
      }

      const ref = await saveVideoStreamFile(root, { data: stream(), name: 'video.webm' }, limits)
      expect(ref.mediaType).toBe('video/webm')
      expect(ref.bytes).toBe(data.byteLength)
      expect(ref.width).toBe(800)
      expect(ref.height).toBe(600)

      const readChunks: Uint8Array[] = []
      for await (const chunk of readVideoStreamFile(root, ref)) {
        readChunks.push(chunk)
      }
      const reassembled = Buffer.concat(readChunks)
      expect(new Uint8Array(reassembled)).toEqual(data)
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

  it('works through LocalAttachmentStore Cordis service', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'dsh-video-test-'))
    try {
      const ctx = new Context()
      const store = new LocalAttachmentStore(ctx, { dshHome: temp })
      const data = createMp4Buffer({ width: 1920, height: 1080 })

      const ref = await store.saveVideo({ data, mediaType: 'video/mp4', name: 'clip.mp4' })
      expect(ref.attachmentId).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(store.videoHostPath(ref)).toBe(normalizedVideoPath(store.root, ref))

      const read = await store.readVideo(ref)
      expect(read.data).toEqual(data)
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })
})
