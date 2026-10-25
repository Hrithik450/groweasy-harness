/**
 * Unit tests for `save_asset`: security validation, scratchpad path verification,
 * attachment persistence, metadata extraction, and chat rendering.
 */

import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import { isPathInTenantTmp } from '../src/tenant-tmp.ts'

describe('save_asset', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'save-asset-test-'))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(dir, { recursive: true, force: true })
  })

  async function createTestContext(options: { saveAsset?: boolean } = {}) {
    const ctx = new Context()
    provideWorkingDirectoryFixture(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(LocalFileSystem, { cwd: dir })
    await ctx.plugin(ToolFs, {
      read: false,
      write: false,
      edit: false,
      readImage: false,
      generateImage: false,
      convertVoice: false,
      dubAudio: false,
      generateVideo: false,
      renderVideo: false,
      renderCaptions: false,
      saveAsset: options.saveAsset ?? true,
    })
    return ctx
  }

  it('registers save_asset by default', async () => {
    const ctx = await createTestContext()
    expect(ctx.tools.get('save_asset')).toBeDefined()
    expect(ctx.tools.schemas().map(s => s.name)).toContain('save_asset')
  })

  it('omits save_asset when saveAsset is false', async () => {
    const ctx = await createTestContext({ saveAsset: false })
    expect(ctx.tools.get('save_asset')).toBeUndefined()
  })

  it('rejects an empty file_path', async () => {
    const ctx = await createTestContext()
    const result = await ctx.tools.execute({
      callId: ToolCallId('call-1'),
      name: 'save_asset',
      arguments: { file_path: '' },
      signal: new AbortController().signal,
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.type === 'text' && result.content[0].text).toContain('file_path must be a non-empty string')
  })

  it('rejects a nonexistent file', async () => {
    const ctx = await createTestContext()
    const result = await ctx.tools.execute({
      callId: ToolCallId('call-2'),
      name: 'save_asset',
      arguments: { file_path: 'tmp/nonexistent.mp4' },
      signal: new AbortController().signal,
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.type === 'text' && result.content[0].text).toContain('Asset not found at')
  })

  it('strictly validates path is in temporary directory and saves asset', async () => {
    const ctx = await createTestContext()
    const tmpDir = join(dir, 'tmp')
    await mkdir(tmpDir, { recursive: true })

    const sampleFile = join(tmpDir, 'test_render.mp4')
    const sampleBytes = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04])
    await writeFile(sampleFile, sampleBytes)

    const result = await ctx.tools.execute({
      callId: ToolCallId('call-3'),
      name: 'save_asset',
      arguments: { file_path: 'tmp/test_render.mp4', name: 'final_ad.mp4' },
      signal: new AbortController().signal,
    })

    expect(result.isError).toBe(false)
    const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
    expect(text).toContain('saved to attachments under ID `sha256:')

    const meta = result.meta as { attachmentId?: string }
    expect(meta?.attachmentId).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('isPathInTenantTmp correctly classifies allowed vs forbidden directories', () => {
    const userRoot = '/srv/workspaces/user_alpha'
    expect(isPathInTenantTmp('/srv/workspaces/user_alpha/tmp/shot.mp4', userRoot)).toBe(true)
    expect(isPathInTenantTmp('/srv/workspaces/user_alpha/output/shot.mp4', userRoot)).toBe(false)
    expect(isPathInTenantTmp('/srv/workspaces/user_alpha/shot.mp4', userRoot)).toBe(false)
    expect(isPathInTenantTmp('/srv/workspaces/user_alpha/.dsh/attachments/shot.mp4', userRoot)).toBe(false)
    expect(isPathInTenantTmp('/etc/shadow', userRoot)).toBe(false)
  })
})
