/**
 * Bundled `ffmpeg` skill and standalone binary provider.
 *
 * @module @deepseek-ai/dsh-skill-ffmpeg
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'
import {
  ensureFfmpegOnPath,
  installStandaloneFfmpeg,
  probeFfmpegCapabilities,
  resolveFfmpeg,
  type FfmpegResolution,
  type ResolveFfmpegOptions,
} from './resolver.ts'

export {
  ensureFfmpegOnPath,
  installStandaloneFfmpeg,
  probeFfmpegCapabilities,
  resolveFfmpeg,
  type FfmpegResolution,
  type ResolveFfmpegOptions,
}

const PROVIDER_NAME = 'dsh-ffmpeg'
const SKILL_BODY_URL = new URL('../assets/ffmpeg/SKILL.md', import.meta.url)
const RESOURCE_BASE = {
  kind: 'directory',
  path: fileURLToPath(new URL('../assets/ffmpeg/', import.meta.url)),
} as const
const INVOCATION = { modelInvocable: true, userInvocable: true } as const
const DESCRIPTION = 'Complete FFmpeg filter and encoder reference for this system. Read this before writing any ffmpeg bash command. Covers every option for all commonly used filters so commands are correct on the first attempt — no hallucination, no guessing.'

const CANDIDATE: SkillCandidate = {
  name: 'ffmpeg',
  description: DESCRIPTION,
  invocation: INVOCATION,
  provider: PROVIDER_NAME,
  source: 'bundled',
  resourceBase: RESOURCE_BASE,
  rank: BUNDLED_SKILL_RANK,
  locator: SKILL_BODY_URL,
}

const provider: SkillProvider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve([CANDIDATE]),
  async get(_candidate): Promise<SkillDefinition> {
    return {
      name: CANDIDATE.name,
      description: CANDIDATE.description,
      invocation: CANDIDATE.invocation,
      provider: CANDIDATE.provider,
      source: CANDIDATE.source,
      resourceBase: RESOURCE_BASE,
      content: await readFile(SKILL_BODY_URL, 'utf8'),
    }
  },
}

/** Configuration for the ffmpeg skill and standalone runtime provider. */
export interface Config {
  /** Explicit path to the ffmpeg executable. */
  explicitPath?: string
  /** Custom root directory for standalone tools (defaults to ~/.dsh). */
  dshHome?: string
  /** Whether to automatically install a standalone static binary if missing. Defaults to true. */
  allowDownload?: boolean
}

/** Schema for validating plugin configuration. */
export const Config: z<Config> = z.object({
  explicitPath: z.string(),
  dshHome: z.string(),
  allowDownload: z.boolean().default(true),
})

/** Cordis plugin name. */
export const name = 'skill-ffmpeg'
/** Service required by the bundled provider. */
export const inject = ['skills']

/**
 * Register the bundled `ffmpeg` provider on `ctx.skills` and ensure binary is provisioned on PATH.
 * @param ctx - Cordis context carrying the skill registry.
 * @param config - Optional configuration for binary resolution.
 */
export function apply(ctx: Context, config: Config = {}): void {
  ctx.effect(() => ctx.skills.registerProvider(() => provider))
  ctx.effect(() => {
    void ensureFfmpegOnPath(config).catch(() => {})
    return () => {}
  })
}
