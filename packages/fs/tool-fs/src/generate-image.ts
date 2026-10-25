/**
 * Model-facing image generation tool. Generates images from text prompts,
 * writes the resulting binary image to disk, and presents a markdown image reference and card.
 * @module @deepseek-ai/dsh-tool-fs/src/generate-image
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolExecution } from '@deepseek-ai/dsh-tools'
import { sessionResolveOptions } from './session-cwd.ts'
import { assertTenantTmpPath } from './tenant-tmp.ts'
import { assertPathWritable } from './sandbox.ts'
import type { FsSandboxController } from './sandbox.ts'

/** Default model used when IMAGE_GENERATION_MODEL is not set. */
export const DEFAULT_IMAGE_GENERATION_MODEL = 'gpt-image-2'

/**
 * Resolve the image generation model from the environment.
 * @param envModel - model name from process.env.IMAGE_GENERATION_MODEL.
 * @returns the canonical model identifier for image generation.
 */
export function resolveImageModel(envModel: string | undefined): string {
  const model = envModel?.trim() || DEFAULT_IMAGE_GENERATION_MODEL
  if (model === 'gpt-image-2.0' || model === 'gpt-image' || model === 'gpt-image-2') {
    return 'gpt-image-2'
  }
  if (model === 'gpt-image-2.5' || model === 'gpt-image-2.5-sunburst') {
    return 'gpt-image-2.5'
  }
  return model
}

/**
 * Resolve the target image resolution based on aspect ratio and model.
 * @param aspectRatio - aspect ratio string (e.g. '1:1', '16:9', '9:16', '4:3', '3:4').
 * @param model - model identifier.
 * @returns formatted WIDTHxHEIGHT dimension string.
 */
export function resolveImageSize(aspectRatio: string | undefined, model: string = DEFAULT_IMAGE_GENERATION_MODEL): string {
  const ratio = aspectRatio?.trim() || '1:1'
  if (model.startsWith('dall-e-3')) {
    if (ratio === '9:16') return '1024x1792'
    if (ratio === '16:9') return '1792x1024'
    return '1024x1024'
  }
  switch (ratio) {
    case '9:16':
      return '864x1536'
    case '16:9':
      return '1536x864'
    case '4:3':
      return '1152x864'
    case '3:4':
      return '864x1152'
    case '1:1':
    default:
      return '1024x1024'
  }
}

/** Output value schema for the generate_image tool. */
export interface GenerateImageOutput {
  path: string
  attachmentId?: string
  prompt: string
  model: string
  bytes: number
  mediaType: string
  width: number
  height: number
}

/** Response payload schema returned by the image generation endpoint. */
interface ImageGenerationResponse {
  created?: number
  data?: Array<{
    b64_json?: string
    url?: string
    revised_prompt?: string
  }>
}

/**
 * Register the `generate_image` tool.
 * @param ctx - the plugin context; registrations are effects scoped to it.
 * @param sandbox - optional sandbox-escalation controller.
 */
export function applyGenerateImageTool(ctx: Context, sandbox?: FsSandboxController): void {
  ctx.tools.register(defineTool({
    name: 'generate_image',
    description: 'Generate an image from a detailed text prompt and save it to a file.',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'Detailed prompt describing the visual scene, subject, style, and lighting for the image.',
      },
      file_path: {
        type: 'string',
        required: true,
        description: 'Destination file path for the generated image (e.g. "images/logo.png" or "output.jpg").',
      },
      aspect_ratio: {
        type: 'string',
        enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        description: 'Aspect ratio of the generated image. Defaults to "1:1".',
      },
      ...sandbox && sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {},
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true, description: 'Canonical path on disk where the image was written.' },
          attachmentId: { type: 'string' },
          prompt: { type: 'string', required: true },
          model: { type: 'string', required: true },
          bytes: { type: 'integer', required: true },
          mediaType: { type: 'string', required: true },
          width: { type: 'integer', required: true },
          height: { type: 'integer', required: true },
        },
      },
      render: (args, value) => {
        const blocks: Array<{ type: 'text'; text: string } | { type: 'image'; attachment: ImageAttachmentRef }> = [
          {
            type: 'text',
            text: `Image generated and saved to \`${value.path}\` (${value.bytes} bytes).\n\n![${args.prompt}](${value.path})`,
          },
        ]
        return blocks
      },
      presentationMeta: (_args, value) => ({ path: value.path }),
    },
    async execute(args: { prompt: string; file_path: string; aspect_ratio?: string }, exec: ToolExecution) {
      if (args.prompt.trim().length === 0) throw new Error('prompt must be a non-empty string')
      if (args.file_path.trim().length === 0) throw new Error('file_path must be a non-empty string')

      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required to generate images.')
      }

      let sandboxPolicy
      if (sandbox) {
        sandboxPolicy = await sandbox.resolvePolicy('write', args as object, exec)
      }
      const model = resolveImageModel(process.env.IMAGE_GENERATION_MODEL)
      const size = resolveImageSize(args.aspect_ratio, model)
      const resolveOpts = await sessionResolveOptions(ctx, exec)
      const target = await ctx.fs.resolve(args.file_path, resolveOpts)
      const absolutePath = ctx.fs.processPath(target)
      const activeCwd = resolveOpts.cwd
        || (ctx.fs ? ctx.fs.processPath(await ctx.fs.resolve('.', resolveOpts)) : process.cwd())
      if (sandboxPolicy) {
        await assertPathWritable(absolutePath, sandboxPolicy, sandbox)
      }
      assertTenantTmpPath(absolutePath, args.file_path, activeCwd)

      const baseUrl = process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, '') || 'https://api.openai.com/v1'
      const endpoint = `${baseUrl}/images/generations`

      const requestBody: {
        model: string
        prompt: string
        n: number
        size: string
        response_format?: string
        quality?: string
      } = {
        model,
        prompt: args.prompt,
        n: 1,
        size,
        ...(model.startsWith('dall-e-') ? { response_format: 'b64_json' } : {}),
      }

      if (process.env.OPENAI_IMAGE_QUALITY) {
        requestBody.quality = process.env.OPENAI_IMAGE_QUALITY
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: exec.signal,
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Image generation failed (${response.status}): ${errorText}`)
      }

      const data = (await response.json()) as ImageGenerationResponse
      const first = data.data?.[0]
      let buffer: Buffer

      if (first?.b64_json) {
        buffer = Buffer.from(first.b64_json, 'base64')
      } else if (first?.url) {
        const imageRes = await fetch(first.url, { signal: exec.signal })
        if (!imageRes.ok) {
          throw new Error(`Failed to download generated image from url (${imageRes.status})`)
        }
        buffer = Buffer.from(await imageRes.arrayBuffer())
      } else {
        throw new Error('No image payload returned by the provider.')
      }

      await mkdir(dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, buffer)

      const [dimWidth, dimHeight] = size.split('x').map(Number)
      const outcome: GenerateImageOutput = {
        path: absolutePath,
        prompt: args.prompt,
        model,
        bytes: buffer.byteLength,
        mediaType: 'image/png',
        width: dimWidth || 1024,
        height: dimHeight || 1024,
      }
      return outcome
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Generate image ${args.file_path}`,
        kind: 'edit',
        locations: [{ path: args.file_path }],
      }
    },
    presentResult(args, outcome) {
      return {
        card: 'generic',
        title: outcome.isError ? `Failed to generate image ${args.file_path}` : `Generated image ${args.file_path}`,
        content: outcome.content,
      }
    },
  }))
}
