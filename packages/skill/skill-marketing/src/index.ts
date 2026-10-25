/**
 * Bundled digital marketing, performance creative, SEO, and ad generation skills.
 *
 * @module @deepseek-ai/dsh-skill-marketing
 */

import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BUNDLED_SKILL_RANK, type SkillCandidate, type SkillProvider } from '@deepseek-ai/dsh-skill'
import { parse as parseYaml } from 'yaml'

const SKILL_NAMES = [
  'creative-brief-generator',
  'facebook-audience-builder',
  'lead-cost-calculator',
  'competitor-research',
  'marketing-strategist',
  'ad-copywriter',
  'keyword-suggestions',
  'video-generation',
  'marketing-poster',
] as const

/** Marketing skill resource location. */
export interface Config {
  /** Absolute assets directory containing skill folders; defaults to packaged assets. */
  assetRoot?: string
}

/** Validated resource configuration. */
export const Config: z<Config> = z.object({
  assetRoot: z.string().min(1),
})

/** Cordis plugin identity. */
export const name = 'skill-marketing'
/** Registry used by the bundled provider. */
export const inject = ['skills']

function parseSkill(raw: string, path: string): { description: string; content: string } {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (frontmatter?.[1] === undefined) throw new Error(`skill-marketing: ${path} has no YAML frontmatter`)
  const metadata: unknown = parseYaml(frontmatter[1])
  const description = typeof metadata === 'object' && metadata !== null && 'description' in metadata
    ? metadata.description : undefined
  if (typeof description !== 'string' || description.length === 0) throw new Error(`skill-marketing: ${path} has no description`)
  return { description, content: raw.slice(frontmatter[0].length).trim() }
}

function resolveAssetRoot(configured?: string): string {
  if (configured) {
    if (!isAbsolute(configured)) throw new Error('skill-marketing: assetRoot must be an absolute directory')
    return configured
  }
  const rootCandidate = fileURLToPath(new URL('../../assets/', import.meta.url))
  if (existsSync(rootCandidate)) return rootCandidate
  const siblingCandidate = fileURLToPath(new URL('../assets/', import.meta.url))
  if (existsSync(siblingCandidate)) return siblingCandidate
  return siblingCandidate
}

function marketingRuntime(skillName: string, assetRoot: string): string {
  const scriptsDir = join(assetRoot, 'scripts').split(sep).join('/')
  const relevantTools: string[] = []

  if (['video-generation', 'competitor-research', 'ad-copywriter', 'marketing-strategist', 'creative-brief-generator'].includes(skillName)) {
    relevantTools.push(`- **Meta Ad Library Scraper** (Apify):
  \`node "${scriptsDir}/meta-ads.mjs" --query "<brand_or_domain>" [--country IN|US] [--limit 10] [--raw]\``)
  }

  if (['video-generation', 'competitor-research', 'keyword-suggestions', 'facebook-audience-builder', 'marketing-strategist', 'creative-brief-generator'].includes(skillName)) {
    relevantTools.push(`- **Firecrawl Landing Page Scraper**:
  \`node "${scriptsDir}/firecrawl-scrape.mjs" --url "<website_url>"\``)
  }

  if (['facebook-audience-builder', 'marketing-strategist'].includes(skillName)) {
    relevantTools.push(`- **Meta Graph API Ad Interests**:
  \`node "${scriptsDir}/meta-interests.mjs" --query "<interest_keyword>" [--limit 10]\``)
  }

  if (['keyword-suggestions', 'competitor-research', 'marketing-strategist'].includes(skillName)) {
    relevantTools.push(`- **Search Volume & CPC Analyzer**:
  \`node "${scriptsDir}/search-volume.mjs" --keywords "<kw1, kw2>" [--location "United States"]\``)
  }

  const mediaGuidance = skillName === 'video-generation'
    ? `\n\n## Media Generation Architecture & Pipeline

Use the native typed tools directly (never call shell wrappers or loose node scripts):
- **Image Generation (\`generate_image\`)**: Generates presenter anchor still in scratchpad (\`tmp/\`) from confirmed prompt and aspect ratio.
- **Motion & Native Speech (\`generate_video\`)**: Produces shot video clips in scratchpad (\`tmp/\`) with synchronous speech and mouth movements from approved script dialogue. Note: the synthesized speech has an intermediate default voice.
- **Speech-to-Speech Indian Voice Conversion (\`convert_voice\`)**: Ideal for Indian localized ads. Pass the video clip directly as \`input_path\` and destination in \`tmp/\` as \`output_path\`. It extracts the audio, converts to the selected Indian voice persona (default \`shivraj\`), and remuxes into video with 100% mouth/lip sync preserved.
- **Multi-lingual Dubbing (\`dub_audio\`)**: Synthesizes localized dialogue in a new language into \`tmp/\`.
- **A100 Cloud Lip-Sync (\`sync_lips\`)**: Synchronizes presenter mouth movements and facial animation to match new audio tracks using ByteDance LatentSync on an NVIDIA A100 GPU into \`tmp/\`. Video duration is strictly guarded up to 45 seconds to protect cloud compute.
- **Captions (\`render_captions\`)**: Burns dynamic karaoke/highlight captions onto video clips in \`tmp/\`.
- **Video Assembly (\`render_video\`)**: Stitches the converted and captioned clips into the final video reel in \`tmp/\`.
- **Deliverable Persistence (\`save_asset\`)**: When the final video is approved, call \`save_asset\` to promote it from \`tmp/\` into permanent Content-Addressed Attachment Storage (\`.dsh/attachments/\`).`
    : ''

  if (relevantTools.length === 0 && !mediaGuidance) return ''

  const scriptSection = relevantTools.length > 0
    ? `\n\n## Available CLI Scripts for Intelligence & Research

You have access to pre-packaged Node.js scripts in \`tool-bash\` to gather market intelligence and competitor research. Run them directly in terminal:

${relevantTools.join('\n\n')}

*Execution Guidance:*
1. Run these CLI commands directly via \`tool-bash\` for intelligence gathering. For all media generation (images, video, voice conversion, captions, assembly), call the native typed tools directly. All authentication, API keys, duration preservation, model calling, and media processing are handled automatically.
2. Never attempt to query, inspect, or check environment variables, API keys, or .env files via shell commands. All required credentials are authenticated directly by the backend tools.
3. A new session starts with no campaign, uploaded images, approved script, or production plan. Use only assets uploaded, generated, or explicitly imported in this conversation. Never search sibling sessions or pick the latest database asset. If the user says not to use earlier images, do not use them, even within this session.
4. User filesystem architecture: Users have direct sessions (\`srv/workspaces/<user_id>/.dsh/sessions/\`) and direct attachments (\`srv/workspaces/<user_id>/.dsh/attachments/\`). Intermediate generation files must strictly reside in the user temporary scratchpad (\`srv/workspaces/<user_id>/tmp/\`). Treat \`DSH_SESSION_ID\` as the current session identity supplied by the runtime. Never substitute another identity or access sibling user directories. Keep plans and intermediates in the current session scratchpad. Reuse a plan only when its \`session_id\` matches.
5. Resolve the current brief before spending generation credits: distinguish uploaded-footage editing, image animation, and new AI footage. If required inputs are missing or ambiguous, ask a concise question. Do not invent product facts, URLs, approvals, completed shots, or QA results. Honor explicit exclusions and obtain script approval before generating media.
6. A failed generation, save, or render is not a finished deliverable. Report the actual error; retry from this session’s checkpoints rather than borrowing another session’s media.`
    : ''

  return `${mediaGuidance}${scriptSection}`
}

/**
 * Register marketing skills on the Cordis skills service.
 * @param ctx - Context carrying the skill registry.
 * @param config - Optional external assets directory for packaged applications.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const assetRoot = resolveAssetRoot(config.assetRoot)

  const candidates: SkillCandidate[] = SKILL_NAMES.map((skillName) => {
    const directory = join(assetRoot, skillName)
    const path = join(directory, 'SKILL.md')
    const { description } = parseSkill(readFileSync(path, 'utf8'), path)
    return {
      name: skillName,
      description,
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'dsh-marketing',
      source: 'bundled',
      rank: BUNDLED_SKILL_RANK,
      resourceBase: { kind: 'directory', path: directory.split(sep).join('/') },
      locator: path,
    }
  })

  const provider: SkillProvider = {
    name: 'dsh-marketing',
    list: () => Promise.resolve(candidates),
    async get(candidate, options) {
      const { rank: _rank, locator, ...summary } = candidate
      const raw = await readFile(locator as string, { encoding: 'utf8', signal: options.signal })
      const content = parseSkill(raw, locator as string).content + marketingRuntime(candidate.name, assetRoot)
      return { ...summary, content }
    },
  }

  ctx.skills.registerProvider(() => provider)
}
