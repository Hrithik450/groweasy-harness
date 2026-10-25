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

  if (['marketing-poster', 'video-generation', 'creative-brief-generator', 'marketing-strategist'].includes(skillName)) {
    relevantTools.push(`- **AI Image & Creative Generator** (Content-Addressed Storage):
  \`node "${scriptsDir}/generate-images.mjs" --prompt "<detailed visual prompt>" [--aspect "1:1"|"9:16"|"16:9"|"4:5"] [--format "png"|"webp"]\``)
  }

  if (['video-generation'].includes(skillName)) {
    relevantTools.push(`- **Image to Video Tool (I2V)** (AI Motion & Native Speech Synthesis):
  \`node "${scriptsDir}/generate-video.mjs" --image "<anchor_still_path>" --prompt "<motion_prompt>" [--script "<spoken_dialogue>"] [--duration 4] [--aspect "9:16"]\`
  *Batch Mode for Full Plan:*
  \`node "${scriptsDir}/generate-video.mjs" --plan "<path_to_plan.json>"\``)

    relevantTools.push(`- **Voice Tone Conversion (Process 1: Speech-to-Speech)**:
  \`node "${scriptsDir}/convert-voice.mjs" --input "<source_audio_or_video>" [--voice "shivraj"|"dr-joshi"|"shlok"|"manish"|"kalyan"|"surabhi"|"vanishree"]\`
  *Transforms persona, accent, or energy level while preserving 100% of cadence, timing, and lip alignment. Automatically remuxes into video if input is video. Zero subsequent lip-sync required.*`)

    relevantTools.push(`- **Multi-lingual Audio Dubbing (Process 2: Translation & Dubbing)**:
  \`node "${scriptsDir}/dub-audio.mjs" --text "<translated_dialogue>" [--input "<reference_audio_or_video>"] [--voice "aarav"|"rushi"|"lovinder"|"mohit"|"shivraj"] [--language "hi"] [--target-duration <seconds>]\`
  *Generates localized commercial dialogue (e.g. Hindi) with phonetic brand normalization and duration conformance. Subsequent visual lip-syncing (Modal LatentSync) is required for video because syllable counts change.*`)

    relevantTools.push(`- **Reel Video Stitching & Transition Engine** (Minimalistic Transitions & Native Audio Chaining):
  \`node "${scriptsDir}/render-video.mjs" --clips "<path1,path2,...>" [--transition "fade"|"slideleft"|"smoothleft"]\`
  *Batch Mode with Plan:*
  \`node "${scriptsDir}/render-video.mjs" [--plan "<path_to_plan.json>"]\``)
  }

  if (['competitor-research', 'ad-copywriter', 'marketing-strategist', 'creative-brief-generator'].includes(skillName)) {
    relevantTools.push(`- **Meta Ad Library Scraper** (Apify):
  \`node "${scriptsDir}/meta-ads.mjs" --query "<brand_or_domain>" [--country US] [--limit 10] [--raw]\``)
  }

  if (['competitor-research', 'keyword-suggestions', 'facebook-audience-builder', 'marketing-strategist', 'creative-brief-generator'].includes(skillName)) {
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

  if (relevantTools.length === 0) return ''

  return `\n\n## Available CLI Scripts & Execution Runtime

You have access to pre-packaged Node.js scripts in \`tool-bash\` to gather intelligence and generate media. Run them directly in terminal:

${relevantTools.join('\n\n')}

*Execution Guidance:*
1. Run these CLI commands directly via \`tool-bash\`. All authentication, API keys, duration preservation, model calling, and media processing are handled automatically by the backend scripts.
2. Never attempt to query, inspect, or check environment variables, API keys, or .env files via shell commands. All required credentials are authenticated directly by the backend tools.
3. A new session starts with no campaign, uploaded images, approved script, or production plan. Use only assets uploaded, generated, or explicitly imported in this conversation. Never search sibling sessions or pick the latest database asset. If the user says not to use earlier images, do not use them, even within this session.
4. Treat \`DSH_SESSION_ID\` as the current session identity supplied by the runtime. Never substitute another identity. Keep plans and intermediates in the current working directory. Reuse a plan only when its \`session_id\` matches.
5. Resolve the current brief before spending generation credits: distinguish uploaded-footage editing, image animation, and new AI footage. If required inputs are missing or ambiguous, ask a concise question. Do not invent product facts, URLs, approvals, completed shots, or QA results. Honor explicit exclusions and obtain script approval before generating media.
6. A failed generation, save, or render is not a finished deliverable. Report the actual error; retry from this session’s checkpoints rather than borrowing another session’s media.`
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
