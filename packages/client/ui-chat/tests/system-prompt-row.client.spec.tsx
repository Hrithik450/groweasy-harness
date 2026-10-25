// @vitest-environment jsdom
import { useCodingTools } from './presentation-fixture.client.ts'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ChatNode } from '../src/client/contract/chat-nodes.ts'
import { SystemPromptNodeView } from '../src/client/chat/SystemPromptRow.tsx'
import { en } from '../src/client/locale.ts'

afterEach(cleanup)

describe('SystemPromptNodeView', () => {
  it('removes an expanded prompt immediately when Coding Tools is disabled', () => {
    const enabled = createSnapshotStore(true)
    const useDeveloperTools = bindSnapshotSelector(enabled)
    const node: ChatNode<'system-prompt'> = {
      key: 'system-message:1', kind: 'system-prompt', id: '1', target: 'chat', anchorSeq: 1,
      location: { kind: 'unresolved' }, visibility: 'visible', data: { text: 'INTERNAL_PROMPT_SENTINEL' },
    }
    const view = render(<SystemPromptNodeView node={node} t={makeTranslate(en)} useDeveloperTools={useDeveloperTools} />)
    fireEvent.click(view.getByRole('button'))
    expect(view.container.textContent).toContain('INTERNAL_PROMPT_SENTINEL')
    act(() => { enabled.set(false) })
    expect(view.container.textContent).toBe('')
    act(() => { enabled.set(true) })
    expect(view.container.textContent).not.toContain('INTERNAL_PROMPT_SENTINEL')
    expect(view.getByRole('button').getAttribute('aria-expanded')).toBe('false')
  })

  it('mounts the opaque context body only while its row is expanded', () => {
    const text = '# Agent rules\n\n- Read first\n- **Act carefully**'
    const node: ChatNode<'system-prompt'> = {
      key: 'request-prompt:1',
      kind: 'system-prompt',
      id: '1',
      target: 'chat',
      anchorSeq: 1,
      location: { kind: 'unresolved' },
      visibility: 'visible',
      data: { text },
    }
    const { container } = render(<SystemPromptNodeView useDeveloperTools={useCodingTools}
      node={node}
      t={makeTranslate(en)}
    />)

    const disclosure = screen.getByRole('button', { name: 'System prompt' })
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[data-system-prompt-body]')).toBeNull()
    expect(container.querySelector('[data-context-text]')).toBeNull()

    fireEvent.click(disclosure)
    expect(disclosure.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[data-system-prompt-body]')).not.toBeNull()
    expect(container.querySelector('[data-context-text]')?.textContent).toBe(text)
    expect(screen.queryByRole('heading', { name: 'Agent rules' })).toBeNull()

    fireEvent.click(disclosure)
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[data-system-prompt-body]')).toBeNull()
  })

  it('titles an in-history prompt update as an update of the same row', () => {
    const node: ChatNode<'system-prompt'> = {
      key: 'system-message:10',
      kind: 'system-prompt',
      id: '10',
      target: 'chat',
      anchorSeq: 10,
      location: { kind: 'unresolved' },
      visibility: 'visible',
      data: { text: '# Updated rules', update: true },
    }
    const { container } = render(<SystemPromptNodeView useDeveloperTools={useCodingTools} node={node} t={makeTranslate(en)} />)

    const disclosure = screen.getByRole('button', { name: 'System prompt update' })
    fireEvent.click(disclosure)
    expect(container.querySelector('[data-context-text]')?.textContent).toBe('# Updated rules')
  })
})
