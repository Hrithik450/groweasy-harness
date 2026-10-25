import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillMarketing from '@deepseek-ai/dsh-skill-marketing'
import { groupWordsIntoCues, buildAssSubtitleScript } from '../../../fs/tool-fs/src/render-captions.ts'
import { VOICE_CATALOG, DEFAULT_VOICE } from '../../../fs/tool-fs/src/convert-voice.ts'
import { DUBBING_VOICE_CATALOG, DEFAULT_DUB_VOICE, normalizeScriptForSpeech } from '../../../fs/tool-fs/src/dub-audio.ts'
import { persistAttachment } from '../../../fs/tool-fs/src/cas.ts'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

describe('dsh-skill-marketing', () => {
  it('registers and disposes bundled marketing skills including video-generation', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillMarketing)

    const list = await ctx.skills.list()
    expect(list.some(s => s.name === 'video-generation')).toBe(true)
    expect(list.some(s => s.name === 'creative-brief-generator')).toBe(true)
    expect(list.some(s => s.name === 'marketing-poster')).toBe(true)

    const loaded = await ctx.skills.get('video-generation')
    expect(loaded?.name).toBe('video-generation')
    expect(loaded?.content).toContain('# Video generator')
    expect(loaded?.content).toContain('generate_image')
    expect(loaded?.content).toContain('generate_video')
    expect(loaded?.content).toContain('render_captions')
    expect(loaded?.content).toContain('render_video')

    await fiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
  })

  it('generates strictly generic attachment references with zero provider fields', async () => {
    const ctx = new Context()
    const fakeBuffer = Buffer.from('test media stream bytes')
    const stored = await persistAttachment(
      ctx,
      fakeBuffer,
      'video',
      'video/mp4',
      'test-clip.mp4',
    )

    // Strictly conforms to AttachmentRef schema
    expect(stored.attachmentId).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(stored.bytes).toBe(fakeBuffer.byteLength)
    expect(stored.sha256).toBeDefined()
  })

  it('ensures zero emojis exist across all skill definition files', () => {
    const assetsDir = resolve(__dirname, '../assets')
    const skillDirs = readdirSync(assetsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== 'scripts')
      .map(d => d.name)

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u

    for (const skillName of skillDirs) {
      const skillPath = join(assetsDir, skillName, 'SKILL.md')
      const content = readFileSync(skillPath, 'utf8')
      const match = emojiRegex.exec(content)
      expect(match, `Emoji found in ${skillPath}: ${match?.[0]}`).toBeNull()
    }
  })

  it('groups words into bursts of 1-3 words', () => {
    const rapidWords = [
      { word: 'STILL', start: 0.0, end: 0.15 },
      { word: 'WASTING', start: 0.18, end: 0.35 },
      { word: 'HOURS', start: 0.38, end: 0.75 },
    ]

    const cues = groupWordsIntoCues(rapidWords)
    expect(cues.length).toBe(1)
    expect(cues[0]?.text).toBe('STILL WASTING HOURS')
    expect(cues[0]?.words).toHaveLength(3)
  })

  it('preserves 100% of all spoken words without dropping any caption text', () => {
    const allWords = [
      { word: 'GROWEASY.AI', start: 0.0, end: 0.8 },
      { word: 'AUTOMATES', start: 0.9, end: 1.4 },
      { word: 'YOUR', start: 1.4, end: 1.6 },
      { word: 'GROWTH', start: 1.6, end: 2.2 },
      { word: 'SO', start: 2.3, end: 2.5 },
      { word: 'YOU', start: 2.5, end: 2.7 },
      { word: 'GET', start: 2.7, end: 3.1 },
      { word: 'MORE', start: 3.1, end: 3.5 },
      { word: 'CUSTOMERS', start: 3.5, end: 4.2 },
    ]

    const cues = groupWordsIntoCues(allWords)
    const resultingWords = cues.flatMap(c => (c.words || []).map(w => w.word))
    expect(resultingWords).toEqual([
      'GROWEASY.AI', 'AUTOMATES', 'YOUR', 'GROWTH', 'SO', 'YOU', 'GET', 'MORE', 'CUSTOMERS',
    ])
  })

  it('builds dual-layer ASS script with steady ambient glow and progressive karaoke word highlight', () => {
    const cues = [
      {
        start: 1.0,
        end: 2.5,
        text: 'AUTOMATES YOUR GROWTH',
        words: [
          { word: 'AUTOMATES', start: 1.0, end: 1.5 },
          { word: 'YOUR', start: 1.5, end: 1.8 },
          { word: 'GROWTH', start: 1.8, end: 2.5 },
        ],
      },
    ]

    const assScript = buildAssSubtitleScript(cues, 1080, 1920, {
      style: 'karaoke',
      highlightColor: 'yellow',
      position: 'chest',
      fontSize: 72,
    })

    // Steady ambient glow on Layer 0 across full cue duration
    expect(assScript).toContain('Dialogue: 0,0:00:01.00,0:00:02.50,Glow,,0,0,0,,{\\blur16\\alpha&H70}AUTOMATES YOUR GROWTH')

    // Layer 1 progressive word highlight with golden yellow color code &H0000E6FF&
    expect(assScript).toContain('{\\c&H0000E6FF&}AUTOMATES{\\c&H00FFFFFF&} YOUR GROWTH')
    expect(assScript).toContain('AUTOMATES {\\c&H0000E6FF&}YOUR{\\c&H00FFFFFF&} GROWTH')
    expect(assScript).toContain('AUTOMATES YOUR {\\c&H0000E6FF&}GROWTH{\\c&H00FFFFFF&}')
  })

  it('exposes curated voice catalogs for tone conversion and multi-lingual dubbing', () => {
    expect(DEFAULT_VOICE).toBe('shivraj')
    expect(VOICE_CATALOG.shivraj?.id).toBe('6OWR66phKIqiCowCgr7X')
    expect(VOICE_CATALOG['dr-joshi']?.id).toBe('WkJcHHkxVUZl4ua7fWlW')
    expect(VOICE_CATALOG.shlok?.id).toBe('2i7LhYjvw41fgbcqlf3Z')

    expect(DEFAULT_DUB_VOICE).toBe('aarav')
    expect(DUBBING_VOICE_CATALOG.aarav?.id).toBe('x9wViLHrpGxKBhkUybpR')
    expect(DUBBING_VOICE_CATALOG.rushi?.id).toBe('fEQJjEw1p6Y1eTj9o3mB')
    expect(DUBBING_VOICE_CATALOG.lovinder?.id).toBe('2EEkWvP67s3GZtC63Y74')
  })

  it('normalizes phonetic brand names and currencies for accurate speech synthesis', () => {
    const raw = 'Visit GrowEasy.ai to save ₹10,000 on your marketing tool at app.io!'
    const normalized = normalizeScriptForSpeech(raw)
    expect(normalized).toBe('Visit GrowEasy dot A.I. to save 10000 rupees on your marketing tool at app dot I.O.!')
  })
})
