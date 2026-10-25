/**
 * Content-addressed attachment persistence helper.
 * Saves media buffers content-addressed to both the mounted attachment service and local storage.
 * @module @deepseek-ai/dsh-tool-fs/src/cas
 */

import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { VideoMediaType, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { resolveTenantDshHome, resolveTenantTmp } from './tenant-tmp.ts'

/** Result of persisting a media attachment into the content-addressed store. */
export interface PersistAttachmentResult {
  attachmentId: string
  objectPath: string
  sha256: string
  bytes: number
}

/**
 * Persist a media buffer content-addressed to local storage and the attachment service.
 * @param ctx - plugin context.
 * @param buffer - binary content of the media file.
 * @param type - media kind ('video' | 'image' | 'audio').
 * @param mediaType - MIME media type (e.g. 'video/mp4', 'image/png').
 * @param filename - human-readable name of the file.
 * @returns object containing canonical attachment identifier and storage path.
 */
export async function persistAttachment(
  ctx: Context,
  buffer: Buffer<ArrayBufferLike>,
  type: 'video' | 'image' | 'audio',
  mediaType: string,
  filename: string,
): Promise<PersistAttachmentResult> {
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  const dshHome = resolveTenantDshHome()
  const objectDir = join(dshHome, 'attachments', 'v1', 'objects', sha256.slice(0, 2))
  let objectPath = join(objectDir, sha256)

  try {
    await mkdir(objectDir, { recursive: true })
    await writeFile(objectPath, buffer)
  } catch {
    const fallbackDir = join(resolveTenantTmp(), 'dsh-attachments', 'v1', 'objects', sha256.slice(0, 2))
    await mkdir(fallbackDir, { recursive: true })
    objectPath = join(fallbackDir, sha256)
    await writeFile(objectPath, buffer)
  }

  let attachmentId = `sha256:${sha256}`
  const attachments = ctx.get('attachments')
  if (attachments) {
    try {
      if (type === 'video') {
        const ref = await attachments.saveVideo({
          data: new Uint8Array(buffer),
          mediaType: mediaType as VideoMediaType,
          name: filename,
        })
        attachmentId = ref.attachmentId
      } else if (type === 'image') {
        const ref = await attachments.saveImage({
          data: new Uint8Array(buffer),
          mediaType: mediaType as ImageMediaType,
          name: filename,
        })
        attachmentId = ref.attachmentId
      }
    } catch {
      // Fallback to sha256 attachment ID
    }
  }

  return {
    attachmentId,
    objectPath,
    sha256,
    bytes: buffer.byteLength,
  }
}
