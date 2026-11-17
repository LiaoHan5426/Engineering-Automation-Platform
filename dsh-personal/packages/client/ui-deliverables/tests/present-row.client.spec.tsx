// @vitest-environment jsdom
/** Present UI derives statuses and details from durable tool records. */
import { fireEvent } from '@testing-library/dom'
import { h } from 'vue'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { cleanup, act, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import { nextTick } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import type { StartedToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import { PresentRow } from '../src/client/PresentRow.tsx'
import { en } from '../src/client/locales.ts'
afterEach(cleanup)
type Props = InstanceType<typeof PresentRow>['$props']
const running: StartedToolCall = {
  phase: 'start' as const,
  args: PartialArguments.fromText('{"files":[{"path":"report.txt"}]}'),
  callId: 'p',
  name: 'present',
  argsRaw: '{"files":[{"path":"report.txt"}]}',
  turn: 1,
  step: 1,
  time: 1,
  subCalls: [],
}
const settled: ToolResultNode = {
  kind: 'tool-result',
  seq: 2,
  time: 2,
  callId: 'p',
  name: 'present',
  args: PartialArguments.fromText(running.argsRaw),
  call: { name: 'present', argsRaw: running.argsRaw },
  callTime: 1,
  content: [{ type: 'text', text: 'Presented report.txt (4 bytes)' }],
  isError: false,
  subCalls: [],
}
function props(block: Props['block'], inspect?: () => void): Props {
  const unused = (): never => {
    throw new Error('isolated present row does not consume this binding')
  }
  const common = {
    callId: 'p',
    toolName: 'present',
    openFile: vi.fn(),
    inspect,
    t: makeTranslate(en),
    sessionId: brandString<SessionId>('row-session'),
    useSession: unused,
    useProjection: unused,
    useAccess: unused,
    useRemoteAccess: unused,
    useSessionAccess: unused,
    useWorkspaceAccess: unused,
    useConversation: unused,
    useInput: unused,
    useChat: unused,
    usePanelInfo: unused,
    useTrajectory: unused,
    useSessions: unused,
    useSessionStatus: unused,
    useSessionRetainInfo: unused,
    useResource: unused,
    useWorkspaces: unused,
    useContextMenu: unused,
    useDisclosure: unused,
    loadImage: unused,
    inputActions: {
      insertQuote: () => false,
      captureInsertion: unused,
      insertText: unused,
      setDraft: unused,
      persistDraft: unused,
      addAttachments: unused,
      removeAttachment: unused,
      pruneAttachments: unused,
      submit: unused,
    },
  }
  if ('kind' in block) return { ...common, phase: 'result', block }
  if (block.phase === 'preparing') return { ...common, phase: 'preparing', block }
  return { ...common, phase: 'start', block }
}
it('discloses the saved result and offers call inspection', async () => {
  const inspect = vi.fn()
  const view = render(
    h(PresentRow, {
      ...props(settled, inspect),
    }),
  )
  expect(view.getByText('Delivered')).toBeTruthy()
  expect(view.getByText('report.txt')).toBeTruthy()
  expect(view.container.querySelector('[data-tool="present"] svg')).not.toBeNull()
  expect(view.container.querySelector('[data-tool="present"] [data-state]')).toBeNull()
  expect(view.queryByText('Presented report.txt (4 bytes)')).toBeNull()
  const row = view.getByRole('button')
  {
    fireEvent.keyDown(row, { key: 'Enter' })
    await nextTick()
  }
  expect(view.getByText('Presented report.txt (4 bytes)')).toBeTruthy()
  {
    fireEvent.click(view.getByRole('button', { name: 'Inspect call' }))
    await nextTick()
  }
  expect(inspect).toHaveBeenCalledOnce()
  {
    fireEvent.click(row)
    await nextTick()
  }
  expect(row.getAttribute('aria-expanded')).toBe('false')
})
it('shows a non-expandable preparation before delivery arguments exist', async () => {
  const useDisclosure = vi.fn(() => {
    throw new Error('preparation must not subscribe to disclosure resets')
  })
  const view = render(
    h(PresentRow, {
      ...props({
        phase: 'preparing',
        args: PartialArguments.EMPTY,
        callId: 'p',
        name: 'present',
        turn: 1,
        step: 1,
        time: 1,
        subCalls: [],
      }),
      useDisclosure: useDisclosure,
    }),
  )
  expect(view.container.querySelector('[data-state="preparing"] svg')).not.toBeNull()
  expect(view.queryByRole('button')).toBeNull()
  expect(view.container.querySelector('pre')).toBeNull()
  expect(useDisclosure).not.toHaveBeenCalled()
})
it.each([
  [running, 'running', 'Delivering'],
  [{ ...settled, isError: true }, 'error', 'Delivery failed'],
  [{ ...settled, error: { name: 'Interrupted', code: 'interrupted' } }, 'stopped', 'Interrupted'],
] as const)(
  'renders call lifecycle without claiming failed delivery',
  async (block, state, label) => {
    const view = render(
      h(PresentRow, {
        ...props(block),
      }),
    )
    expect(view.container.querySelector('[data-tool="present"]')?.getAttribute('data-state')).toBe(
      state,
    )
    expect(view.container.querySelector('[data-tool="present"] svg')).not.toBeNull()
    expect(view.container.querySelector('[data-tool="present"] [data-state]')).toBeNull()
    expect(view.getByText(label)).toBeTruthy()
    expect(view.queryByText('Delivered')).toBeNull()
  },
)
it.each([
  '',
  '{',
  'null',
  '[]',
  '{"files":null}',
  '{"files":[null,{},1,{"path":false},{"path":"good.txt"}]}',
])('tolerates partial arguments %s', async (argsRaw) => {
  const view = render(
    h(PresentRow, {
      ...props({ ...running, argsRaw }),
    }),
  )
  expect(view.getByText('Delivering')).toBeTruthy()
  expect(view.queryByRole('button')).toBeNull()
})
it('shows orphaned error details and non-text results', async () => {
  const view = render(
    h(PresentRow, {
      ...props({
        ...settled,
        call: null,
        content: [],
        isError: true,
        error: { name: 'Missing', code: 'missing' },
      }),
    }),
  )
  {
    fireEvent.click(view.getByRole('button'))
    await nextTick()
  }
  expect(view.getByText('Missing: missing')).toBeTruthy()
  await act(() =>
    view.rerender(
      h(PresentRow, {
        ...props({ ...settled, content: [{ type: 'reasoning', text: 'Recorded detail' }] }),
      }),
    ),
  )
  expect(view.container.textContent).toContain('Recorded detail')
  await act(() =>
    view.rerender(
      h(PresentRow, {
        ...props({ ...settled, content: [] }),
      }),
    ),
  )
  expect(view.queryByRole('button')).toBeNull()
})
