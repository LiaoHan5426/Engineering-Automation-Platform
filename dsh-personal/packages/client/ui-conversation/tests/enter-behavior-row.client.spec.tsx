// @vitest-environment jsdom
import { contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/dom'
import { cleanupVue as cleanup, flushVue as act, renderVue } from '../../ui-primitives/tests/vue-render.ts'
import { within } from '@testing-library/dom'
import { computed, h } from 'vue'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session-status/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { EnterBehaviorRow } from '../src/client/settings/EnterBehaviorRow.tsx'
import type { EnterBehaviorRowProps } from '../src/client/settings/EnterBehaviorRow.tsx'
import { ComposerSubmissionPolicy } from '../src/client/input/submission-policy.ts'
import { en } from '../src/client/locales.ts'
// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => computed(() => ({ status: 'none' as const, value: undefined, failure: undefined }))) as GlobalStandardProps['useResource']
function render(node: Parameters<typeof renderVue>[0]) {
  const view = renderVue(node)
  return { ...view, ...within(document.body) }
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
function emptySessions() {
  return bindSnapshotSelector(createSnapshotStore<SessionListState>({
    ids: [], byId: {}, phase: 'ready', projectionsBySession: {},
  }))
}
function emptyWorkspaces() {
  return bindSnapshotSelector(createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  }))
}
function noPendingInteraction() {
  return bindSnapshotSelector(createSnapshotStore<SessionStatusSnapshot>(new Map()))
}
function mount() {
  const policy = new ComposerSubmissionPolicy()
  const setBusyEnter = vi.fn((behavior: 'queue' | 'steer') => { policy.setBusyEnter(behavior) })
  const props: EnterBehaviorRowProps = {
    usePanelInfo: selector => computed(() => selector({ activePanelId: null })),
    useSessions: emptySessions(),
    useSessionStatus: noPendingInteraction(),
    useSessionRetainInfo: () => computed(() => undefined),
    useResource,
    useWorkspaces: emptyWorkspaces(),
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    useBusyEnter: bindSnapshotSelector(policy.busyEnter),
    setBusyEnter,
    t: makeTranslate(en),
  }
  render(h(EnterBehaviorRow, {
    ...props,
  }))
  return { policy, setBusyEnter }
}
describe('EnterBehaviorRow', () => {
  it('explains the busy-only scope over Enter and Send and shows Queue by default', async () => {
    mount()
    expect(screen.getByText('Send behavior while busy')).toBeDefined()
    expect(screen.getByText('What Enter and the Send button do while the agent is running; Cmd/Ctrl+Enter uses the other behavior')).toBeDefined()
    expect(screen.getByRole('button', { name: /Queue/ }).getAttribute('aria-expanded')).toBe('false')
  })
  it('selects Steer, follows later preference changes, and closes outside', async () => {
    const b = mount()
    const trigger = screen.getByRole('button', { name: /Queue/ })
    await act(() => { fireEvent.click(trigger) })
    await act(() => { fireEvent.click(screen.getByRole('menuitem', { name: 'Steer' })) })
    expect(b.setBusyEnter).toHaveBeenCalledWith('steer')
    expect(screen.getByRole('button', { name: /Steer/ })).toBeDefined()
    await act(() => { b.policy.setBusyEnter('queue') })
    const queueTrigger = screen.getByRole('button', { name: /Queue/ })
    await act(() => { fireEvent.click(queueTrigger) })
    expect(screen.getByRole('menuitem', { name: 'Steer' })).toBeDefined()
    await act(() => { fireEvent.pointerDown(document.body) })
    expect(screen.queryByRole('menuitem', { name: 'Steer' })).toBeNull()
  })
})
