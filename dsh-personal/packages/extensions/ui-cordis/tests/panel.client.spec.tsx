// @vitest-environment jsdom
import { computed, h, nextTick, shallowRef, type Ref } from 'vue'
import { fireEvent, waitFor, within } from '@testing-library/dom'
import { expect, it, vi } from 'vitest'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { CordisRunActivity } from '@deepseek-ai/dsh-cordis-client-runner/client'
import type { ApprovalRequestId, CordisDynamicPackageId, CordisDynamicPluginId, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { renderVue } from '../../../client/ui-primitives/tests/vue-render.ts'
import { CordisPanel } from '../src/client/CordisPanel.tsx'

const selector = <T,>(source: Readonly<Ref<T>>) => <S,>(select: (value: T) => S) => computed(() => select(source.value))
const fixed = <T,>(value: T): ReturnType<typeof selector<T>> => selector(shallowRef(value))

it('discovers new approvals, guards simultaneous actions and distinguishes one-time from future approval', async () => {
  const pluginId = 'test-plugin' as CordisDynamicPluginId
  const packageId = 'test-package' as CordisDynamicPackageId
  const agentId = 'test-session' as SessionId
  const requestId = 'request-one' as ApprovalRequestId
  const nextRequestId = 'request-two' as ApprovalRequestId
  const activity = (id: ApprovalRequestId): CordisRunActivity => ({ phase: 'awaiting-approval', requestId: id, agentId, packageId, mode: 'run', name: 'Test plugin', purpose: 'Review approval' })
  const runs = shallowRef<ReadonlyMap<CordisDynamicPluginId, CordisRunActivity>>(new Map())
  let complete: (() => void) | undefined
  const onApprove = vi.fn(() => new Promise<void>((resolve) => { complete = resolve }))
  const onRefresh = vi.fn()
  const view = renderVue(h(CordisPanel, {
    wide: true, t: key => key,
    useInventory: fixed({ rows: [], removed: new Set<CordisDynamicPluginId>(), read: true }),
    useActiveRuns: selector(runs), useRunErrors: fixed(new Map()), useLoaded: fixed([]),
    useRenderFailures: fixed(new Map()),
    useSessions: fixed<SessionListState>({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }),
    onRefresh, onApprove, onDecline: vi.fn(async () => undefined), onRun: vi.fn(async () => undefined),
    onStop: vi.fn(async () => ({ ok: true as const })), onRemove: vi.fn(async () => ({ ok: true as const })),
  }))
  await nextTick()
  expect(view.container.querySelector('[data-cordis-panel]')).toBeNull()
  runs.value = new Map([[pluginId, activity(requestId)]])
  await nextTick()
  const approve = within(view.container).getByRole('button', { name: 'action.approveOnce' })
  fireEvent.click(approve)
  fireEvent.click(approve)
  expect(onApprove).toHaveBeenCalledTimes(1)
  expect(onApprove).toHaveBeenLastCalledWith(requestId, false)
  await nextTick()
  expect(approve).toHaveProperty('disabled', true)
  complete?.()
  await waitFor(() => { expect(view.container.querySelector('[data-cordis-panel]')).toBeNull() })
  runs.value = new Map([[pluginId, activity(requestId)]])
  await nextTick()
  expect(view.container.querySelector('[data-cordis-panel]')).toBeNull()
  runs.value = new Map([[pluginId, activity(nextRequestId)]])
  await nextTick()
  fireEvent.click(within(view.container).getByRole('button', { name: 'action.approvePlugin' }))
  expect(onApprove).toHaveBeenLastCalledWith(nextRequestId, true)
  complete?.()
  await nextTick()
  view.unmount()
})
