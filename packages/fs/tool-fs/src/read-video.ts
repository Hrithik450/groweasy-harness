/**
 * The model-facing `read_video` tool commits an MP4/WebM/QuickTime file. A path
 * without a file extension is identified from its file signature, while the
 * attachment service's full decode stays authoritative. The mounted `ctx.fs`
 * backend owns path resolution and read access; names only declare media type.
 * @module @deepseek-ai/dsh-tool-fs/src/read-video
 */

import { basename, extname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { AttachmentError, AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { AttachmentStore, VideoAttachmentRef, VideoMediaType } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolExecution } from '@deepseek-ai/dsh-tools'
import { FsError } from '@deepseek-ai/dsh-fs'
import { resolveRegularReadTarget } from './read-target.ts'

/** Extensions `read_video` accepts; container validation at the attachment service stays authoritative. */
const VIDEO_EXTENSIONS: Readonly<Record<string, VideoMediaType>> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
}

const EBML_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3] as const

function matchesBytes(data: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (data.byteLength < offset + expected.length) return false
  return expected.every((byte, index) => data[offset + index] === byte)
}

function matchesAscii(data: Uint8Array, offset: number, value: string): boolean {
  if (data.byteLength < offset + value.length) return false
  for (let index = 0; index < value.length; index += 1) {
    if (data[offset + index] !== value.charCodeAt(index)) return false
  }
  return true
}

/**
 * Identify the media type declared by a supported video file signature.
 * @param data - file bytes read through the current filesystem backend.
 * @returns the detected supported media type, or undefined for other bytes.
 */
export function sniffVideoMediaType(data: Uint8Array): VideoMediaType | undefined {
  if (matchesBytes(data, 0, EBML_SIGNATURE)) return 'video/webm'
  if (matchesAscii(data, 4, 'ftyp') || matchesAscii(data, 4, 'moov')) {
    if (matchesAscii(data, 4, 'ftyp') && matchesAscii(data, 8, 'qt  ')) {
      return 'video/quicktime'
    }
    return 'video/mp4'
  }
  return undefined
}

const VIDEO_VALUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: true,
  properties: {
    attachmentId: { type: 'string', required: true },
    mediaType: { type: 'string', enum: ['video/mp4', 'video/webm', 'video/quicktime'], required: true },
    bytes: { type: 'integer', required: true },
    width: { type: 'integer' },
    height: { type: 'integer' },
    duration: { type: 'number' },
    name: { type: 'string' },
  },
} as const

/** The structured outcome declared by the `read_video` output schema. */
export interface VideoReadValue {
  /** Canonical absolute path in the filesystem provider's execution world. */
  path: string
  video: {
    attachmentId: string
    mediaType: VideoMediaType
    bytes: number
    width?: number
    height?: number
    duration?: number
    name?: string
  }
}

/**
 * Map a model-supplied path to its declared video media type by extension.
 * @param filePath - the raw `file_path` argument (not yet resolved).
 * @returns the declared media type, or undefined when the path does not claim a video.
 */
export function videoMediaTypeForPath(filePath: string): VideoMediaType | undefined {
  return VIDEO_EXTENSIONS[extname(filePath).toLowerCase()]
}

/**
 * Enforce the video-capability gate for the calling route. Resolves the
 * session's latest routed provider/model and requires the route to support video
 * when modalities are declared.
 * @param ctx - the plugin context used to resolve the optional `llm` service.
 * @param exec - the tool-execution context supplying the calling agent.
 * @param requestedPath - the raw path rendered in refusal messages.
 */
export async function assertVideoCapableRoute(ctx: Context, exec: ToolExecution, requestedPath: string): Promise<void> {
  const routed = exec.agent?.session.requestHeader()?.config
  const provider = routed?.provider ?? exec.agent?.options.provider
  const model = routed?.model ?? exec.agent?.options.model
  const llm = ctx.get('llm')
  if (provider === undefined || model === undefined || llm === undefined) {
    throw new Error(`cannot read "${requestedPath}" as a video: the current model route could not be resolved`)
  }
  const active = await llm.resolveModelInfo(provider, model, exec.signal)
  const modalities = active.inputModalities as readonly string[] | undefined
  if (modalities !== undefined && !modalities.includes('video')) {
    throw new Error(`cannot read "${requestedPath}" as a video: model "${model}" does not declare video input; switch to a video-capable model to read videos`)
  }
}

/** Refuse a media type outside the deployment's accepted set, naming the offending path. */
function assertDeploymentAccepts(attachments: AttachmentStore, mediaType: VideoMediaType, displayPath: string): void {
  if (!attachments.videoLimits.mediaTypes.includes(mediaType)) {
    throw new Error(`cannot read "${displayPath}": ${mediaType} videos are not accepted by this deployment`)
  }
}

/**
 * Re-brand a structured video outcome into the durable attachment reference a
 * `VideoBlock` carries.
 * @param video - the video metadata from the output schema.
 * @returns the branded attachment reference.
 */
export function videoRefFromValue(video: VideoReadValue['video']): VideoAttachmentRef {
  return {
    attachmentId: AttachmentId(video.attachmentId),
    mediaType: video.mediaType,
    bytes: video.bytes,
    ...video.width === undefined ? {} : { width: video.width },
    ...video.height === undefined ? {} : { height: video.height },
    ...video.duration === undefined ? {} : { duration: video.duration },
    ...video.name === undefined ? {} : { name: video.name },
  }
}

/**
 * Format a video read as the model-facing envelope beside its video block.
 * @param displayPath - the backend-resolved path rendered in the envelope's `<path>` element.
 * @param video - the video metadata to summarize.
 * @returns the model-facing envelope; the video itself rides the adjacent video block.
 */
export function formatVideoReadOutput(displayPath: string, video: VideoReadValue['video']): string {
  const dimensions = video.width !== undefined && video.height !== undefined ? `${video.width}x${video.height} px, ` : ''
  const duration = video.duration !== undefined ? `${video.duration.toFixed(1)}s, ` : ''
  return `<path>${displayPath}</path>
<type>video</type>
<content>
${video.mediaType} video, ${dimensions}${duration}${video.bytes} bytes
</content>`
}

/**
 * Project one structured video read into its model-facing envelope and video.
 * @param value - the video-read outcome.
 * @returns the two content blocks used by native and nested dispatches.
 */
function videoReadContent(value: VideoReadValue): ContentBlock[] {
  return [
    { type: 'text', text: formatVideoReadOutput(value.path, value.video) },
    { type: 'video', attachment: videoRefFromValue(value.video) },
  ]
}

/**
 * Register the `read_video` tool into the given context.
 * @param ctx - the registration scope; execution uses its `fs` service plus
 *   the optional `attachments`/`llm` services.
 */
export function applyReadVideoTool(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'read_video',
    description: 'Read an MP4/WebM/QuickTime video file and return the video attachment. '
      + 'Videos up to 50MB are supported.',
    parameters: {
      file_path: { type: 'string', required: true, description: 'Path to the video file, resolved by the filesystem backend.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true, description: 'Canonical absolute path in the filesystem execution world.' },
          video: VIDEO_VALUE_SCHEMA,
        },
      },
      render: (_args, value) => videoReadContent(value),
      presentationMeta: (_args, value) => ({ path: value.path }),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (args.file_path.trim().length === 0) throw new Error('file_path must be a non-empty string')

      const extension = extname(args.file_path).toLowerCase()
      const declared = videoMediaTypeForPath(args.file_path)
      if (declared === undefined && extension !== '') {
        throw new Error(`cannot read "${args.file_path}": the ${extension} extension does not declare a supported video format; read_video accepts MP4/WebM/QuickTime files, including extension-less files in those formats`)
      }
      const attachments = ctx.get('attachments')
      if (attachments === undefined) {
        throw new Error(`cannot read "${args.file_path}" as a video: no attachment service is mounted`)
      }
      if (declared !== undefined) assertDeploymentAccepts(attachments, declared, args.file_path)
      await assertVideoCapableRoute(ctx, exec, args.file_path)

      const { target, info } = await resolveRegularReadTarget(ctx, exec, args.file_path)
      const byteCap = attachments.videoLimits.maxVideoBytes

      let data: Uint8Array
      try {
        data = await ctx.fs.readBytes(target, exec.signal, byteCap)
      } catch (error: unknown) {
        if (error instanceof FsError && error.code === 'FS_TOO_LARGE') {
          throw new Error(
            `cannot read "${target.displayPath}": the video exceeds the ${Math.round(byteCap / (1024 * 1024))}MB limit; reduce the file size and retry`,
            { cause: error },
          )
        }
        throw error
      }

      const mediaType = declared ?? sniffVideoMediaType(data)
      if (mediaType === undefined) {
        throw new Error(`cannot read "${target.displayPath}": the file content is not a supported video format; read_video accepts MP4/WebM/QuickTime`)
      }
      if (declared === undefined) assertDeploymentAccepts(attachments, mediaType, target.displayPath)

      let ref: VideoAttachmentRef
      try {
        ref = await attachments.saveVideo({ data, mediaType, name: basename(target.displayPath) })
      } catch (error: unknown) {
        if (!(error instanceof AttachmentError)) throw error
        if (error.code === 'VIDEO_TOO_LARGE') {
          throw new Error(
            `cannot read "${target.displayPath}": the video exceeds the ${Math.round(byteCap / (1024 * 1024))}MB limit; reduce the file size and retry`,
            { cause: error },
          )
        }
        if (error.code === 'INVALID_VIDEO') {
          throw new Error(
            `cannot read "${target.displayPath}": the bytes do not decode as a supported MP4/WebM/QuickTime video; the file may be truncated or corrupt`,
            { cause: error },
          )
        }
        if (error.code === 'VIDEO_TYPE_MISMATCH') {
          throw new Error(
            `cannot read "${target.displayPath}": the ${extension} extension declares ${mediaType}, but the bytes use a different video container format; rename or convert the file to match`,
            { cause: error },
          )
        }
        if (error.code === 'UNSUPPORTED_VIDEO_TYPE') {
          throw new Error(
            `cannot read "${target.displayPath}": ${mediaType} videos are not accepted by this deployment`,
            { cause: error },
          )
        }
        throw error
      }

      ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
      const value: VideoReadValue = {
        path: ctx.fs.processPath(target),
        video: {
          attachmentId: ref.attachmentId,
          mediaType: ref.mediaType,
          bytes: ref.bytes,
          ...ref.width === undefined ? {} : { width: ref.width },
          ...ref.height === undefined ? {} : { height: ref.height },
          ...ref.duration === undefined ? {} : { duration: ref.duration },
          ...ref.name === undefined ? {} : { name: ref.name },
        },
      }
      return value
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Read video ${args.file_path}`,
        kind: 'read',
        locations: [{ path: args.file_path }],
      }
    },
  }))
}
