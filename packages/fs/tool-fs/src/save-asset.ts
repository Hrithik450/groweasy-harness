/**
 * Model-facing tool to save a verified asset from the temporary scratchpad
 * into the permanent Content-Addressed Attachment Store (.dsh/attachments).
 *
 * @module @deepseek-ai/dsh-tool-fs/src/save-asset
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolExecution } from '@deepseek-ai/dsh-tools'
import { sessionResolveOptions } from './session-cwd.ts'
import { persistAttachment } from './cas.ts'
import { isPathInTenantTmp } from './tenant-tmp.ts'
import type { FsSandboxController } from './sandbox.ts'

/** Output payload schema for the save_asset tool. */
export interface SaveAssetOutput {
  attachmentId: string
  name: string
  mediaType: string
  type: 'video' | 'image' | 'audio' | 'file'
  bytes: number
  sha256: string
  sourcePath: string
}

/**
 * Register the `save_asset` tool.
 * @param ctx - plugin context scoped to host.
 * @param sandbox - optional sandbox escalation controller.
 */
export function applySaveAssetTool(ctx: Context, sandbox?: FsSandboxController): void {
  ctx.tools.register(defineTool({
    name: 'save_asset',
    description: 'Promote a verified media or data asset from the user temporary scratchpad ("tmp/") '
      + 'into permanent Content-Addressed Attachment Storage (.dsh/attachments). Returns canonical attachment '
      + 'metadata (attachmentId, sha256, bytes, mediaType) recorded in the session for durable reference. '
      + 'The source file must strictly reside within the user temporary scratchpad.',
    parameters: {
      file_path: {
        type: 'string',
        required: true,
        description: 'Path to the asset file in the temporary scratchpad (e.g. "tmp/final_reel.mp4").',
      },
      name: {
        type: 'string',
        description: 'Friendly display name for the saved attachment. Defaults to the filename.',
      },
      type: {
        type: 'string',
        enum: ['video', 'image', 'audio', 'file'],
        description: 'Kind of media asset (video, image, audio, or file). Inferred automatically from extension if omitted.',
      },
      ...sandbox && sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {},
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          attachmentId: { type: 'string', required: true, description: 'Canonical SHA-256 attachment identifier.' },
          name: { type: 'string', required: true, description: 'Display name of the saved asset.' },
          mediaType: { type: 'string', required: true, description: 'MIME type of the asset.' },
          type: { type: 'string', enum: ['video', 'image', 'audio', 'file'], required: true },
          bytes: { type: 'integer', required: true, description: 'Size of the asset in bytes.' },
          sha256: { type: 'string', required: true, description: 'Hex-encoded SHA-256 hash of the asset bytes.' },
          sourcePath: { type: 'string', required: true, description: 'Source scratchpad path of the saved file.' },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: `Asset \`${value.name}\` (${value.bytes} bytes) saved to attachments under ID \`${value.attachmentId}\`.`,
        },
      ],
      presentationMeta: (_args, value) => ({
        attachmentId: value.attachmentId,
        path: value.sourcePath,
        bytes: value.bytes,
      }),
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Save ${args.file_path} to attachments`,
        kind: 'edit',
      }
    },
    async execute(
      args: { file_path: string; name?: string; type?: 'video' | 'image' | 'audio' | 'file' },
      exec: ToolExecution,
    ): Promise<SaveAssetOutput> {
      if (!args.file_path || args.file_path.trim().length === 0) {
        throw new Error('file_path must be a non-empty string')
      }

      const resolveOpts = await sessionResolveOptions(ctx, exec)
      const target = await ctx.fs.resolve(args.file_path, resolveOpts)
      const processPath = ctx.fs.processPath(target)

      if (!existsSync(processPath)) {
        throw new Error(`Asset not found at: ${args.file_path}`)
      }

      const targetDir = resolveOpts.cwd
        || (ctx.fs ? ctx.fs.processPath(await ctx.fs.resolve('.', resolveOpts)) : process.cwd())
      if (!isPathInTenantTmp(processPath, targetDir)) {
        throw new Error(
          `Security error: Only assets inside your user temporary scratchpad ("tmp/") can be saved to attachments. Path "${args.file_path}" is outside the temporary directory.`,
        )
      }

      const ext = extname(processPath).toLowerCase()
      let inferredKind: 'video' | 'image' | 'audio' = 'image'
      let mediaType = 'application/octet-stream'

      if (['.mp4', '.mov', '.webm', '.m4v'].includes(ext)) {
        inferredKind = 'video'
        mediaType = ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : 'video/mp4'
      } else if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) {
        inferredKind = 'image'
        mediaType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg'
      } else if (['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(ext)) {
        inferredKind = 'audio'
        mediaType = ext === '.wav' ? 'audio/wav' : ext === '.m4a' ? 'audio/mp4' : ext === '.ogg' ? 'audio/ogg' : 'audio/mpeg'
      }

      const mediaKind = args.type ? (args.type === 'file' ? 'image' : args.type) : inferredKind
      const filename = args.name?.trim() || basename(processPath)

      const buffer = await readFile(processPath)
      const stored = await persistAttachment(ctx, buffer, mediaKind, mediaType, filename)

      return {
        attachmentId: stored.attachmentId,
        name: filename,
        mediaType,
        type: args.type || inferredKind,
        bytes: stored.bytes,
        sha256: stored.sha256,
        sourcePath: processPath,
      }
    },
  }))
}
