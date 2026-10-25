/** Video inspection, storage, and retrieval. @module @deepseek-ai/dsh-attachment-local/video */

import { createReadStream } from 'node:fs'
import { open, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  AttachmentError,
  AttachmentId,
} from '@deepseek-ai/dsh-attachment'
import type {
  SaveVideoAttachment,
  SaveVideoStreamAttachment,
  StoredVideoAttachment,
  VideoAttachmentLimits,
  VideoAttachmentRef,
  VideoMediaType,
} from '@deepseek-ai/dsh-attachment'
import {
  digest,
  displayName,
  ensureReference,
  publishImmutableObject,
  publishStagedObject,
  removeTemporary,
  stageImmutableObject,
} from './store.ts'

/** Decoded metadata from a supported video container. */
export interface DetectedVideo {
  readonly mediaType: VideoMediaType
  readonly width?: number
  readonly height?: number
  readonly duration?: number
}

function parseMp4(data: Uint8Array): DetectedVideo | undefined {
  if (data.byteLength < 8) return undefined
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let offset = 0
  let isMp4OrMov = false
  let isQuickTime = false
  let width: number | undefined
  let height: number | undefined
  let duration: number | undefined

  while (offset + 8 <= data.byteLength) {
    let size = view.getUint32(offset)
    const type = String.fromCharCode(
      data[offset + 4]!,
      data[offset + 5]!,
      data[offset + 6]!,
      data[offset + 7]!,
    )
    let headerSize = 8
    if (size === 1) {
      if (offset + 16 > data.byteLength) break
      size = Number(view.getBigUint64(offset + 8))
      headerSize = 16
    } else if (size === 0) {
      size = data.byteLength - offset
    }
    if (size < headerSize) break

    if (type === 'ftyp') {
      isMp4OrMov = true
      if (offset + 12 <= data.byteLength) {
        const major = String.fromCharCode(
          data[offset + 8]!,
          data[offset + 9]!,
          data[offset + 10]!,
          data[offset + 11]!,
        )
        if (major === 'qt  ') isQuickTime = true
      }
      for (let b = offset + 16; b + 4 <= offset + size && b + 4 <= data.byteLength; b += 4) {
        const compat = String.fromCharCode(data[b]!, data[b + 1]!, data[b + 2]!, data[b + 3]!)
        if (compat === 'qt  ') isQuickTime = true
      }
    } else if (type === 'moov' || type === 'wide' || type === 'mdat') {
      isMp4OrMov = true
      if (type === 'moov') {
        const moovEnd = Math.min(offset + size, data.byteLength)
        let subOffset = offset + headerSize
        while (subOffset + 8 <= moovEnd) {
          let subSize = view.getUint32(subOffset)
          const subType = String.fromCharCode(
            data[subOffset + 4]!,
            data[subOffset + 5]!,
            data[subOffset + 6]!,
            data[subOffset + 7]!,
          )
          let subHeaderSize = 8
          if (subSize === 1) {
            if (subOffset + 16 > moovEnd) break
            subSize = Number(view.getBigUint64(subOffset + 8))
            subHeaderSize = 16
          } else if (subSize === 0) {
            subSize = moovEnd - subOffset
          }
          if (subSize < subHeaderSize) break

          if (subType === 'mvhd') {
            const version = data[subOffset + subHeaderSize]
            if (version === 0 && subOffset + subHeaderSize + 20 <= moovEnd) {
              const timescale = view.getUint32(subOffset + subHeaderSize + 12)
              const dur = view.getUint32(subOffset + subHeaderSize + 16)
              if (timescale > 0) duration = Math.round((dur / timescale) * 1000) / 1000
            } else if (version === 1 && subOffset + subHeaderSize + 28 <= moovEnd) {
              const timescale = view.getUint32(subOffset + subHeaderSize + 20)
              const dur = Number(view.getBigUint64(subOffset + subHeaderSize + 24))
              if (timescale > 0) duration = Math.round((dur / timescale) * 1000) / 1000
            }
          } else if (subType === 'trak') {
            const trakEnd = Math.min(subOffset + subSize, moovEnd)
            let trakSub = subOffset + subHeaderSize
            while (trakSub + 8 <= trakEnd) {
              let tSize = view.getUint32(trakSub)
              const tType = String.fromCharCode(
                data[trakSub + 4]!,
                data[trakSub + 5]!,
                data[trakSub + 6]!,
                data[trakSub + 7]!,
              )
              let tHeaderSize = 8
              if (tSize === 1) {
                if (trakSub + 16 > trakEnd) break
                tSize = Number(view.getBigUint64(trakSub + 8))
                tHeaderSize = 16
              } else if (tSize === 0) {
                tSize = trakEnd - trakSub
              }
              if (tSize < tHeaderSize) break

              if (tType === 'tkhd') {
                const tVersion = data[trakSub + tHeaderSize]
                const wOffset = trakSub + (tVersion === 1 ? 88 : 76)
                const hOffset = trakSub + (tVersion === 1 ? 92 : 80)
                if (hOffset + 4 <= trakSub + tSize && hOffset + 4 <= moovEnd) {
                  const trackW = view.getUint16(wOffset)
                  const trackH = view.getUint16(hOffset)
                  if (trackW > 0 && trackH > 0 && (width === undefined || height === undefined)) {
                    width = trackW
                    height = trackH
                  }
                }
              }
              trakSub += tSize
            }
          }
          subOffset += subSize
        }
      }
    }

    offset += size
  }

  if (!isMp4OrMov) return undefined
  return {
    mediaType: isQuickTime ? 'video/quicktime' : 'video/mp4',
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(duration !== undefined ? { duration } : {}),
  }
}

function parseWebm(data: Uint8Array): DetectedVideo | undefined {
  if (data.byteLength < 4) return undefined
  if (data[0] !== 0x1a || data[1] !== 0x45 || data[2] !== 0xdf || data[3] !== 0xa3) {
    return undefined
  }
  let width: number | undefined
  let height: number | undefined
  let duration: number | undefined

  const limit = Math.min(data.byteLength, 65536)
  for (let i = 0; i < limit; i++) {
    // PixelWidth: 0xB0 followed by 1 or 2 byte VINT length
    if (data[i] === 0xb0) {
      const len = data[i + 1]!
      if (len === 0x81 && i + 3 <= limit) {
        width = data[i + 2]!
      } else if (len === 0x82 && i + 4 <= limit) {
        width = (data[i + 2]! << 8) | data[i + 3]!
      }
    }
    // PixelHeight: 0xBA
    if (data[i] === 0xba) {
      const len = data[i + 1]!
      if (len === 0x81 && i + 3 <= limit) {
        height = data[i + 2]!
      } else if (len === 0x82 && i + 4 <= limit) {
        height = (data[i + 2]! << 8) | data[i + 3]!
      }
    }
    // Duration: 0x44 0x89
    if (data[i] === 0x44 && data[i + 1] === 0x89) {
      const len = data[i + 2]!
      const view = new DataView(data.buffer, data.byteOffset + i + 3)
      if (len === 0x84 && i + 7 <= limit) {
        const durMs = view.getFloat32(0)
        duration = Math.round((durMs / 1000) * 1000) / 1000
      } else if (len === 0x88 && i + 11 <= limit) {
        const durMs = view.getFloat64(0)
        duration = Math.round((durMs / 1000) * 1000) / 1000
      }
    }
  }

  return {
    mediaType: 'video/webm',
    ...(width !== undefined && width > 0 ? { width } : {}),
    ...(height !== undefined && height > 0 ? { height } : {}),
    ...(duration !== undefined && duration > 0 ? { duration } : {}),
  }
}

/**
 * Inspect a byte buffer and return detected video metadata.
 * @param data - byte buffer to probe.
 * @returns detected video format and dimensions.
 * @throws AttachmentError if the format is unrecognized.
 */
export function detectVideo(data: Uint8Array): DetectedVideo {
  const mp4 = parseMp4(data)
  if (mp4 !== undefined) return mp4
  const webm = parseWebm(data)
  if (webm !== undefined) return webm
  throw new AttachmentError('Unsupported or malformed video data.', 'INVALID_VIDEO')
}

/**
 * Probe a staged video file on disk, reading header and tail chunks if needed.
 * @param path - file path to probe.
 * @param totalBytes - total byte size of the file.
 * @returns detected video metadata.
 */
export async function probeVideoFile(path: string, totalBytes: number): Promise<DetectedVideo> {
  const handle = await open(path, 'r')
  try {
    const headLen = Math.min(totalBytes, 65536)
    const headBuf = new Uint8Array(headLen)
    await handle.read(headBuf, 0, headLen, 0)
    let detected = detectVideo(headBuf)
    if (detected.mediaType === 'video/mp4' || detected.mediaType === 'video/quicktime') {
      if ((detected.width === undefined || detected.height === undefined || detected.duration === undefined) && totalBytes > headLen) {
        const tailLen = Math.min(totalBytes - headLen, 131072)
        const tailOffset = totalBytes - tailLen
        const tailBuf = new Uint8Array(tailLen)
        await handle.read(tailBuf, 0, tailLen, tailOffset)
        const tailMp4 = parseMp4(tailBuf)
        if (tailMp4 !== undefined) {
          const width = detected.width ?? tailMp4.width
          const height = detected.height ?? tailMp4.height
          const duration = detected.duration ?? tailMp4.duration
          detected = {
            mediaType: detected.mediaType,
            ...(width !== undefined ? { width } : {}),
            ...(height !== undefined ? { height } : {}),
            ...(duration !== undefined ? { duration } : {}),
          }
        }
      }
    }
    return detected
  } finally {
    await handle.close()
  }
}

/**
 * Derive the absolute immutable-object path for one video attachment.
 * Stored directly in `objects/<prefix>/<sha256>` in Content-Addressed Storage.
 * @param root - absolute versioned attachment root.
 * @param ref - durable video attachment reference.
 * @returns provider-local path without reading the object.
 */
export function normalizedVideoPath(root: string, ref: VideoAttachmentRef): string {
  const sha256 = ensureReference(ref)
  return join(root, 'objects', sha256.slice(0, 2), sha256)
}

/**
 * Save one video from a complete byte array into Content-Addressed Storage.
 * @param root - absolute versioned attachment root.
 * @param input - video bytes and declared media type.
 * @param limits - video policy limits.
 * @returns durable video reference.
 */
export async function saveVideoFile(
  root: string,
  input: SaveVideoAttachment,
  limits: VideoAttachmentLimits,
): Promise<VideoAttachmentRef> {
  if (input.data.byteLength === 0) {
    throw new AttachmentError('Video is empty.', 'INVALID_VIDEO')
  }
  if (input.data.byteLength > limits.maxVideoBytes) {
    throw new AttachmentError('Video exceeds the 50MB limit.', 'VIDEO_TOO_LARGE')
  }
  if (!limits.mediaTypes.includes(input.mediaType)) {
    throw new AttachmentError(`Video type ${input.mediaType} is not accepted by this deployment.`, 'UNSUPPORTED_VIDEO_TYPE')
  }
  const detected = detectVideo(input.data)
  if (detected.mediaType !== input.mediaType) {
    throw new AttachmentError('Declared video type does not match its bytes.', 'VIDEO_TYPE_MISMATCH')
  }
  const sha256 = digest(input.data)
  const name = displayName(input.name)
  const ref: VideoAttachmentRef = {
    attachmentId: AttachmentId(`sha256:${sha256}`),
    mediaType: detected.mediaType,
    bytes: input.data.byteLength,
    ...(detected.width !== undefined ? { width: detected.width } : {}),
    ...(detected.height !== undefined ? { height: detected.height } : {}),
    ...(detected.duration !== undefined ? { duration: detected.duration } : {}),
    ...(name !== undefined ? { name } : {}),
  }
  const target = normalizedVideoPath(root, ref)
  await publishImmutableObject(root, target, input.data, sha256)
  return ref
}

/**
 * Stream bounded chunks into a staging file, probe video facts, and publish into Content-Addressed Storage.
 * @param root - absolute versioned attachment root.
 * @param input - stream and optional declared metadata.
 * @param limits - video policy limits.
 * @returns durable video reference.
 */
export async function saveVideoStreamFile(
  root: string,
  input: SaveVideoStreamAttachment,
  limits: VideoAttachmentLimits,
): Promise<VideoAttachmentRef> {
  const staged = await stageImmutableObject(root, input.data, input.signal, limits.maxVideoBytes)
  if (staged.bytes === 0) {
    await removeTemporary(staged.path)
    throw new AttachmentError('Video is empty.', 'INVALID_VIDEO')
  }
  let detected: DetectedVideo
  try {
    detected = await probeVideoFile(staged.path, staged.bytes)
  } catch (error) {
    await removeTemporary(staged.path)
    throw error
  }
  if (input.mediaType !== undefined && detected.mediaType !== input.mediaType) {
    await removeTemporary(staged.path)
    throw new AttachmentError('Declared video type does not match its bytes.', 'VIDEO_TYPE_MISMATCH')
  }
  if (!limits.mediaTypes.includes(detected.mediaType)) {
    await removeTemporary(staged.path)
    throw new AttachmentError(`Video type ${detected.mediaType} is not accepted by this deployment.`, 'UNSUPPORTED_VIDEO_TYPE')
  }
  const name = displayName(input.name)
  const ref: VideoAttachmentRef = {
    attachmentId: AttachmentId(`sha256:${staged.sha256}`),
    mediaType: detected.mediaType,
    bytes: staged.bytes,
    ...(detected.width !== undefined ? { width: detected.width } : {}),
    ...(detected.height !== undefined ? { height: detected.height } : {}),
    ...(detected.duration !== undefined ? { duration: detected.duration } : {}),
    ...(name !== undefined ? { name } : {}),
  }
  const target = normalizedVideoPath(root, ref)
  await publishStagedObject(root, target, staged)
  return ref
}

/**
 * Read and verify one stored video attachment.
 * @param root - absolute versioned attachment root.
 * @param ref - durable video reference.
 * @param signal - optional cancellation signal.
 * @returns stored video reference and verified bytes.
 */
export async function readVideoFile(
  root: string,
  ref: VideoAttachmentRef,
  signal?: AbortSignal,
): Promise<StoredVideoAttachment> {
  signal?.throwIfAborted()
  const sha256 = ensureReference(ref)
  let data: Uint8Array
  try {
    data = new Uint8Array(await readFile(normalizedVideoPath(root, ref), { signal }))
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new AttachmentError('Attachment object is missing.', 'ATTACHMENT_NOT_FOUND')
    }
    throw new AttachmentError('Unable to read video attachment.', 'ATTACHMENT_READ_FAILED', { cause: error })
  }
  signal?.throwIfAborted()
  if (digest(data) !== sha256 || data.byteLength !== ref.bytes) {
    throw new AttachmentError('Stored attachment failed integrity verification.', 'ATTACHMENT_CORRUPT')
  }
  return { ref, data }
}

/**
 * Stream bytes for one stored video attachment in bounded chunks.
 * @param root - absolute versioned attachment root.
 * @param ref - durable video reference.
 * @param signal - optional cancellation signal.
 * @returns async iterable of byte chunks.
 */
export async function* readVideoStreamFile(
  root: string,
  ref: VideoAttachmentRef,
  signal?: AbortSignal,
): AsyncIterable<Uint8Array> {
  signal?.throwIfAborted()
  ensureReference(ref)
  const path = normalizedVideoPath(root, ref)
  const stream = createReadStream(path, { highWaterMark: 64 * 1024 })
  try {
    for await (const chunk of stream) {
      signal?.throwIfAborted()
      yield chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
    }
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new AttachmentError('Attachment object is missing.', 'ATTACHMENT_NOT_FOUND')
    }
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Unable to read video attachment.', 'ATTACHMENT_READ_FAILED', { cause: error })
  }
}
