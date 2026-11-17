// @vitest-environment jsdom
import { cloneVNode, computed, defineComponent, h, shallowRef } from 'vue'
import { act, cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import { fireEvent, screen, waitFor } from '@testing-library/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskDock } from '../src/client/TaskDock.tsx'
import { en } from '../src/client/locales.ts'
import type { TimelineKey } from '../src/client/locales.ts'
import { createViewStore } from '../src/client/store.ts'
import type { ViewState } from '../src/client/store.ts'
import { reportId, taskId, treeId, treeSchema } from '../src/records.ts'
import type { TimelineView } from '../src/records.ts'
import { patchTasks } from '../src/tasks.ts'
import type { ProgressPrecision } from '../src/policy.ts'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const actual = await vi.importActual<typeof import('@deepseek-ai/dsh-client-ui-primitives')>('@deepseek-ai/dsh-client-ui-primitives')
  return { ...actual,
    MarkdownText: defineComponent((props: {
      text: string
    }) => () => h('div', props.text), { props: ['text'] }),
    Tag: defineComponent((props: {
      tone: string
    }, { slots }) => () => h('span', { 'data-tone': props.tone }, slots.default?.()), { props: ['tone'] }),
    IconPauseOutlineRegular: () => h('span', { 'data-icon': 'pause' }),
    IconPlayOutlineRegular: () => h('span', { 'data-icon': 'play' }),
    Tooltip: defineComponent((props: {
      label: string
      disabled?: boolean
    }, { slots }) => () => { const child = slots.default?.()[0]; return child ? cloneVNode(child, { 'data-tooltip': props.disabled ? undefined : props.label }) : null }, { props: ['label', 'disabled'], inheritAttrs: false }),
  }
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const tree = treeSchema.parse({
  id: 'release',
  title: 'Prepare the release',
  description: '',
  createdAt: 1,
  tasks: patchTasks([], [
    { id: taskId.parse('code'), title: 'Review code', status: 'done', timeShare: 1 },
    {
      id: taskId.parse('checks'),
      title: 'Check the release',
      status: 'active',
      timeShare: 3,
      done: [1, 2],
    },
  ], 1, 10),
})
const view: TimelineView = {
  annotations: [],
  trees: [treeSchema.parse({ ...tree, id: 'older', title: 'Earlier plan' }), tree],
  activeTreeId: tree.id,
  reports: [],
  error: null,
}
const state: ViewState = {
  tree: treeId.parse('older'),
  collapsed: { older: [taskId.parse('code')] },
  drafts: {},
  zoom: 15,
  level: 1,
  scrollMs: 60000,
  scrollLeft: 20,
  anchor: 10,
  historyReport: undefined,
  tab: 'timeline',
  historyOpen: false,
  details: {
    tasks: [
      { target: { kind: 'task', tree: treeId.parse('older'), task: taskId.parse('code') }, scrollTop: 20 },
    ],
    timeline: [],
  },
}
const update = vi.fn()
const toggleSidebar = vi.fn()
const removeTree = vi
  .fn()
  .mockResolvedValue({ action: 'remove', removed: true, notified: false, draft: true })
const fixture = shallowRef<{
  value: TimelineView | undefined
  decimals: ProgressPrecision
  stored: TimelineView | null | undefined
  segmented: boolean
  draft: boolean
}>({ value: view, decimals: 2, stored: undefined, segmented: false, draft: false })
function props(value: TimelineView | undefined = view, decimals: ProgressPrecision = 2,
  stored?: TimelineView | null, segmented = false, draft = false) {
  fixture.value = { value, decimals, stored, segmented, draft }
  return {
    sessionId: 'session' as import('@deepseek-ai/dsh-session/types').SessionId,
    useProjection: () => computed(() => fixture.value.stored ?? fixture.value.value),
    useSession: (selector: (value: unknown) => unknown) => computed(() => selector({ blank: fixture.value.draft,
      running: false, awaitingFirstTurn: false, pendingSubmissions: [] })),
    useStore: (selector: (value: ViewState) => unknown) => computed(() => selector(state)),
    useSettings: (selector: (value: unknown) => unknown) => computed(() => selector({ value: {
      progressDecimals: fixture.value.decimals, segmentedProgress: fixture.value.segmented } })),
    actions: { update, open: vi.fn(), forgetTree: vi.fn(), toggle: vi.fn(), draft: vi.fn() },
    toggleSidebar,
    removeTree,
    t: (key: TimelineKey) => en[key],
  } as InstanceType<typeof TaskDock>['$props']
}
describe('the composer task strip', () => {
  it('uses the default progress display for a new plan while settings load', async () => {
    const loading = props({ ...view, trees: [{ ...tree, tasks: [] }] })
    await (async () => {
      const mounted = render(h(TaskDock, { ...loading, 'useSettings': select => computed(() => select({
        status: 'loading', value: undefined, writable: false, revision: undefined, base: {}, user: {},
      })) }))
      await act(() => { })
      return mounted
    })()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
    expect(screen.getByText('0.00%')).toBeTruthy()
  })
  it.each([false, true])('preserves report navigation when removing a draft plan (changed tree: %s)', async (changeTree) => {
    const saved = Promise.withResolvers<{
      action: 'remove'
      removed: boolean
      notified: boolean
      draft: boolean
    }>()
    removeTree.mockReturnValueOnce(saved.promise)
    const store = createViewStore().create()
    store.actions.open(tree.id, taskId.parse('code'))
    const dock = props(view, 2, view, false, true)
    const rendered = await (async () => {
      const mounted = render(h(TaskDock, { ...dock, 'actions': store.actions, 'useStore': select => computed(() => select(store.getSnapshot())) }))
      await act(() => { })
      return mounted
    })()
    const remove = screen.getByRole<HTMLButtonElement>('button', { name: en.removeDraftTree })
    await act(() => fireEvent.click(remove))
    expect(remove.disabled).toBe(true)
    expect(removeTree).toHaveBeenCalledOnce()
    expect(removeTree).toHaveBeenCalledWith(tree.id)
    expect(store.getSnapshot().tree).toBe(tree.id)
    const older = treeId.parse('older')
    if (changeTree)
      store.actions.open(older, taskId.parse('code'))
    store.actions.update({
      tab: 'timeline',
      details: {
        ...store.getSnapshot().details,
        timeline: [{ target: { kind: 'report', report: reportId.parse('latest') }, scrollTop: 20 }],
      },
    })
    const { details } = store.getSnapshot()
    saved.resolve({ action: 'remove', removed: true, notified: false, draft: true })
    await waitFor(() => { expect(remove.disabled).toBe(false) })
    expect(store.getSnapshot()).toMatchObject({
      tree: changeTree ? older : null,
      tab: 'timeline',
      details: { ...details, tasks: changeTree ? details.tasks : [] },
    })
    const empty = { ...view, trees: [], activeTreeId: null }
    await rendered.rerender(h(TaskDock, { ...props(empty, 2, empty, false, true) }))
    expect(screen.queryByRole('region')).toBeNull()
  })
  it('keeps the imported plan after a removal failure and reserves direct cancellation for a draft', async () => {
    removeTree.mockRejectedValueOnce(new Error('Save failed'))
    const rendered = await (async () => {
      const mounted = render(h(TaskDock, { ...props(view, 2, view, false, true) }))
      await act(() => { })
      return mounted
    })()
    await act(() => fireEvent.click(screen.getByRole('button', { name: en.removeDraftTree })))
    await screen.findByRole('button', { name: en.draftRemoveFailed })
    expect(screen.getByRole('progressbar')).toBeTruthy()
    await rendered.rerender(h(TaskDock, { ...props() }))
    expect(screen.queryByRole('button', { name: en.removeDraftTree })).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
  it('updates the dock breakdown when the display setting changes', async () => {
    const mountedView1 = await (async () => {
      const mounted = render(h(TaskDock, { ...props(view, 2, view, false) }))
      await act(() => { })
      return mounted
    })()
    const rerender = (...args: Parameters<typeof mountedView1.rerender>) => mountedView1.rerender(...args)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('62.5')
    expect(screen.getByRole('progressbar').hasAttribute('data-segmented')).toBe(false)
    await rerender(h(TaskDock, { ...props(view, 2, view, true) }))
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('62.5')
    expect(screen.getByRole('progressbar').getAttribute('data-segmented')).toBe('true')
  })
  it('shows the active tree and weighted progress, independent of the sidebar selection', async () => {
    const mountedView2 = await (async () => {
      const mounted = render(h(TaskDock, { ...props() }))
      await act(() => { })
      return mounted
    })()
    const rerender = (...args: Parameters<typeof mountedView2.rerender>) => mountedView2.rerender(...args)
    expect(screen.getByText('Prepare the release')).toBeTruthy()
    expect(screen.queryByText('Earlier plan')).toBeNull()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('62.50%')
    await rerender(h(TaskDock, { ...props(view, 3) }))
    expect(screen.getByText('62.500%')).toBeTruthy()
    const completed = {
      ...view,
      trees: [treeSchema.parse({ ...tree, tasks: tree.tasks.map(task => ({ ...task, status: 'done' })) })],
    }
    await rerender(h(TaskDock, { ...props(completed) }))
    expect(screen.getByText('100.00%')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('data-status')).toBe('done')
  })
  it('opens the active tree in the Task Tree tab and clears an older tree’s detail state', async () => {
    await (async () => {
      const mounted = render(h(TaskDock, { ...props() }))
      await act(() => { })
      return mounted
    })()
    await act(() => fireEvent.click(screen.getByRole('button')))
    const patch = update.mock.calls[0]?.[0] as Partial<ViewState> | undefined
    expect({ ...state, ...patch }).toEqual({
      ...state,
      tree: tree.id,
      tab: 'tasks',
      details: { tasks: [], timeline: state.details.timeline },
    })
    expect(toggleSidebar).toHaveBeenCalledWith(false)
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(toggleSidebar.mock.invocationCallOrder[0] ?? 0)
  })
  it('allows collapsing the selected task-tree root, while details still request the tree', async () => {
    const current = shallowRef<ViewState>({ ...state, tree: tree.id, tab: 'tasks' as const, details: { tasks: [], timeline: [] } })
    await (async () => {
      const mounted = render(h(TaskDock, { ...props(), 'useStore': selector => computed(() => selector(current.value)) }))
      await act(() => { })
      return mounted
    })()
    await act(() => fireEvent.click(screen.getByRole('button')))
    expect(toggleSidebar).toHaveBeenLastCalledWith(true)
    current.value = { ...current.value, details: state.details }
    await act(() => { })
    await act(() => fireEvent.click(screen.getByRole('button')))
    expect(toggleSidebar).toHaveBeenLastCalledWith(false)
  })
  it('hides when there is no active tree, including an unavailable projection', async () => {
    const mountedView3 = await (async () => {
      const mounted = render(h(TaskDock, { ...props({ ...view, activeTreeId: null }) }))
      await act(() => { })
      return mounted
    })()
    const rerender = (...args: Parameters<typeof mountedView3.rerender>) => mountedView3.rerender(...args)
    expect(screen.queryByRole('region')).toBeNull()
    await rerender(h(TaskDock, { ...props({ ...view, activeTreeId: treeId.parse('missing') }) }))
    expect(screen.queryByRole('progressbar')).toBeNull()
    await rerender(h(TaskDock, { ...props({ ...view, trees: [] }) }))
    expect(screen.queryByRole('button')).toBeNull()
    fixture.value = { ...fixture.value, value: undefined, stored: undefined }
    await act(() => { })
    expect(screen.queryByRole('region')).toBeNull()
  })
})
