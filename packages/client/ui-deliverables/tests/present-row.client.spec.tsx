// @vitest-environment jsdom
/** Present UI derives statuses and details from durable tool records. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { StartedToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import { PresentRow } from '../src/client/PresentRow.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
type Props = Parameters<typeof PresentRow>[0]
const running: StartedToolCall = { phase: 'start' as const, args: PartialArguments.fromText('{"files":[{"path":"report.txt"}]}'), callId: 'p', name: 'present', argsRaw: '{"files":[{"path":"report.txt"}]}', turn: 1, step: 1, time: 1, subCalls: [] }
const settled: ToolResultNode = { kind: 'tool-result', seq: 2, time: 2, callId: 'p', name: 'present', args: PartialArguments.fromText(running.argsRaw), call: { name: 'present', argsRaw: running.argsRaw }, callTime: 1, content: [{ type: 'text', text: 'Presented report.txt (4 bytes)' }], isError: false, subCalls: [] }
function props(block: Props['block'], inspect?: () => void): Props {
  return { showDetails: true, ...('kind' in block ? { phase: 'result' as const, block: block } : { phase: block.phase, block: block }), callId: 'p', toolName: 'present', openFile: vi.fn(), inspect, t: makeTranslate(en) } as Props
}

it('discloses the saved result and offers call inspection', () => {
  const inspect = vi.fn()
  const view = render(<PresentRow {...props(settled, inspect)} />)
  expect(view.getByText('Delivered')).toBeTruthy()
  expect(view.getByText('report.txt')).toBeTruthy()
  expect(view.container.querySelector('[data-tool="present"] svg')).not.toBeNull()
  expect(view.container.querySelector('[data-tool="present"] [data-state]')).toBeNull()
  expect(view.queryByText('Presented report.txt (4 bytes)')).toBeNull()
  const row = view.getByRole('button')
  fireEvent.keyDown(row, { key: 'Enter' })
  expect(view.getByText('Presented report.txt (4 bytes)')).toBeTruthy()
  fireEvent.click(view.getByRole('button', { name: 'Inspect call' }))
  expect(inspect).toHaveBeenCalledOnce()
  fireEvent.click(row)
  expect(row.getAttribute('aria-expanded')).toBe('false')
})

it('keeps delivery status and basenames while hiding an open receipt in ordinary Chat', () => {
  const block = { ...settled, call: { name: 'present', argsRaw: '{"files":[{"path":"/internal/output/report.txt"}]}' } }
  const inspect = vi.fn()
  const view = render(<PresentRow {...props(block, inspect)} />)
  fireEvent.click(view.getByRole('button'))
  expect(view.getByText('Presented report.txt (4 bytes)')).toBeTruthy()
  view.rerender(<PresentRow {...props(block, inspect)} showDetails={false} />)
  expect(view.getByText('Delivered')).toBeTruthy()
  expect(view.getByText('report.txt')).toBeTruthy()
  expect(view.container.textContent).not.toContain('/internal')
  expect(view.queryByRole('button')).toBeNull()
  expect(view.container.querySelector('pre')).toBeNull()
  view.rerender(<PresentRow {...props({ ...running, argsRaw: 'INTERNAL_ARGUMENT_SENTINEL' })} showDetails={false} />)
  expect(view.container.textContent).not.toContain('INTERNAL_')
})

it('shows a non-expandable preparation before delivery arguments exist', () => {
  const useDisclosure = vi.fn(() => { throw new Error('preparation must not subscribe to disclosure resets') })
  const view = render(<PresentRow {...props({
    phase: 'preparing', args: PartialArguments.EMPTY, callId: 'p', name: 'present', turn: 1, step: 1, time: 1, subCalls: [],
  })} useDisclosure={useDisclosure} />)
  expect(view.container.querySelector('[data-state="preparing"] svg')).not.toBeNull()
  expect(view.queryByRole('button')).toBeNull()
  expect(view.container.querySelector('pre')).toBeNull()
  expect(useDisclosure).not.toHaveBeenCalled()
})

it.each([
  [running, 'running', 'Delivering'],
  [{ ...settled, isError: true }, 'error', 'Delivery failed'],
  [{ ...settled, error: { name: 'Interrupted', code: 'interrupted' } }, 'stopped', 'Interrupted'],
] as const)('renders call lifecycle without claiming failed delivery', (block, state, label) => {
  const view = render(<PresentRow {...props(block)} />)
  expect(view.container.querySelector('[data-tool="present"]')?.getAttribute('data-state')).toBe(state)
  expect(view.container.querySelector('[data-tool="present"] svg')).not.toBeNull()
  expect(view.container.querySelector('[data-tool="present"] [data-state]')).toBeNull()
  expect(view.getByText(label)).toBeTruthy()
  expect(view.queryByText('Delivered')).toBeNull()
})

it.each(['', '{', 'null', '[]', '{"files":null}', '{"files":[null,{},1,{"path":false},{"path":"good.txt"}]}'])('tolerates partial arguments %s', (argsRaw) => {
  const view = render(<PresentRow {...props({ ...running, argsRaw })} />)
  expect(view.getByText('Delivering')).toBeTruthy()
  expect(view.queryByRole('button')).toBeNull()
})

it('shows orphaned error details and non-text results', () => {
  const view = render(<PresentRow {...props({ ...settled, call: null, content: [], isError: true, error: { name: 'Missing', code: 'missing' } })} />)
  fireEvent.click(view.getByRole('button'))
  expect(view.getByText('Missing: missing')).toBeTruthy()
  view.rerender(<PresentRow {...props({ ...settled, content: [{ type: 'reasoning', text: 'Recorded detail' }] })} />)
  expect(view.container.textContent).toContain('Recorded detail')
  view.rerender(<PresentRow {...props({ ...settled, content: [] })} />)
  expect(view.queryByRole('button')).toBeNull()
})
