// @vitest-environment jsdom
/** Internal context and unknown payloads follow the accepted Coding Tools preference. */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ChatNode } from '../src/client/contract/chat-nodes.ts'
import { ContextMessageNodeView, UnknownNodeView } from '../src/client/chat/MessageItem.tsx'
import { en } from '../src/client/locale.ts'

afterEach(cleanup)

it('shows a loaded skill by name without its instructions or provider metadata', () => {
  const codingTools = createSnapshotStore(false)
  const useDeveloperTools = bindSnapshotSelector(codingTools)
  const node: ChatNode<'context'> = {
    key: 'context:1', kind: 'context', id: '1', target: 'chat', anchorSeq: 1,
    location: { kind: 'unresolved' }, visibility: 'visible',
    data: {
      kind: 'context', seq: 1, time: 1,
      content: [{ type: 'text', text: 'INTERNAL_SKILL_SENTINEL' }],
      source: { kind: 'skill-invocation', name: 'marketing-poster', form: 'instructions' },
      form: 'instructions', producer: { role: 'inject', label: 'marketing-poster' },
    },
  }
  const view = render(<ContextMessageNodeView node={node} t={makeTranslate(en)} useDeveloperTools={useDeveloperTools} />)
  expect(view.getByText('Skill loaded')).toBeTruthy()
  expect(view.getByText('marketing-poster')).toBeTruthy()
  expect(view.queryByRole('button')).toBeNull()
  expect(view.container.textContent).not.toContain('INTERNAL_')
  act(() => { codingTools.set(true) })
  fireEvent.click(view.getByRole('button'))
  expect(view.container.textContent).toContain('INTERNAL_SKILL_SENTINEL')
  act(() => { codingTools.set(false) })
  expect(view.container.textContent).not.toContain('INTERNAL_')
  expect(view.queryByRole('button')).toBeNull()
})

it('withholds unfamiliar context sources and unknown event JSON without deleting their data', () => {
  const codingTools = createSnapshotStore(false)
  const useDeveloperTools = bindSnapshotSelector(codingTools)
  const node: ChatNode<'context'> = {
    key: 'context:1', kind: 'context', id: '1', target: 'chat', anchorSeq: 1,
    location: { kind: 'unresolved' }, visibility: 'visible',
    data: {
      kind: 'context', seq: 1, time: 1,
      content: [{ type: 'text', text: 'INTERNAL_CONTEXT_SENTINEL' }],
      source: { kind: 'private-provider' }, form: null,
      producer: { role: 'inject', label: '/internal/harness/AGENTS.md' },
    },
  }
  const unknown: ChatNode<'unknown'> = {
    key: 'unknown:2', kind: 'unknown', id: '2', target: 'chat', anchorSeq: 2,
    location: { kind: 'unresolved' }, visibility: 'visible',
    data: { kind: 'unknown', seq: 2, time: 2, type: 'private/event', data: { text: 'INTERNAL_EVENT_SENTINEL' } },
  }
  const view = render(<>
    <ContextMessageNodeView node={node} t={makeTranslate(en)} useDeveloperTools={useDeveloperTools} />
    <UnknownNodeView node={unknown} t={makeTranslate(en)} useDeveloperTools={useDeveloperTools} />
  </>)
  expect(view.container.textContent).toBe('Task context prepared')
  act(() => { codingTools.set(true) })
  fireEvent.click(view.getByRole('button', { name: 'Context injection/internal/harness/AGENTS.md' }))
  fireEvent.click(view.getByRole('button', { name: /Unknown surface event: private\/event/ }))
  expect(view.container.textContent).toContain('INTERNAL_CONTEXT_SENTINEL')
  expect(view.container.textContent).toContain('INTERNAL_EVENT_SENTINEL')
  act(() => { codingTools.set(false) })
  expect(view.container.textContent).toBe('Task context prepared')
  expect(node.data.content).toEqual([{ type: 'text', text: 'INTERNAL_CONTEXT_SENTINEL' }])
})
