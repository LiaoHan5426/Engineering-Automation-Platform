// @vitest-environment jsdom
import { liveFixtureProps } from './vue-render.client.ts'
import { h as vueH, computed, defineComponent } from 'vue'
/** The task tab renders the one task its navigation parameters name. */
import { act, cleanup, fireEvent, render, screen, within } from './vue-render.client.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {
  PaneId,
  SidebarRightTabActions,
  SidebarRightTabInfo,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { ScheduleId, ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CatalogDeleteOutcome, CatalogSnapshot } from '../src/client/catalog-source.ts'
import type { HostTaskActions } from '../src/client/TaskDetail.tsx'
import {
  ScheduleTaskTab as NativeScheduleTaskTab,
  type ScheduleTaskTabProps,
} from '../src/client/ScheduleTaskTab.tsx'
import {
  ScheduleTaskTabTitle as NativeScheduleTaskTabTitle,
  type ScheduleTaskTabTitleProps,
} from '../src/client/ScheduleTaskTabTitle.tsx'
import { TaskTabBindings, type TaskTabPage } from '../src/client/task-tab-bindings.ts'
import { createEditorStore } from '../src/client/editor-store.ts'
import { en, zh } from '../src/client/task-manager-locales.ts'
import css from '../src/client/TaskManagerPage.module.css'
type Entry = ScheduleCatalogEntry
const SESSION = 'session-alpha' as SessionId
/** The persisted layout record of the tab under test: its id, kind, and content identity. */
const TAB: TaskTabPage = { id: 'tab1', kind: 'scheduleTask', contentId: 'sidebar://scheduleTask' }
const at: Entry = {
  kind: 'rrule',
  id: 'task-detail' as ScheduleId,
  title: 'Check metrics',
  prompt: 'Check metrics\nSecond line of the instruction',
  rrule: 'DTSTART;TZID=UTC:20261001T093000\nRRULE:FREQ=MINUTELY;INTERVAL=5',
  scheduledAt: '2026-10-01T09:30:00.000Z',
  target: { kind: 'session', sessionId: SESSION },
  involvedSessionIds: [SESSION],
  status: 'active',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
}
const other: Entry = { ...at, id: 'task-other' as ScheduleId, title: 'Other metrics' }
const sessions: SessionListState = {
  ids: [SESSION],
  byId: {
    [SESSION]: {
      id: SESSION,
      displayTitle: SESSION,
      running: false,
      blank: false,
      updatedAt: 0,
      retainedBy: {},
    },
  },
  phase: 'ready',
  projectionsBySession: {},
}
const workspaces: WorkspaceSnapshot = {
  items: [],
  archivedSessionIds: [],
  pinnedSessionIds: [],
  state: 'idle',
  phase: 'ready',
  error: null,
}
/**
 * Session list whose catalog row for this tab's Session carries a title.
 * @param title - title that Session row gains.
 * @returns the Session list projection with that title.
 */
function sessionsWithTitle(title: string): SessionListState {
  return {
    ...sessions,
    byId: Object.fromEntries(
      Object.entries(sessions.byId).map(
        ([id, summary]) =>
          [id, id === SESSION ? { ...summary, title, displayTitle: title } : summary] as const,
      ),
    ),
  }
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
/** Whether `later` follows `earlier` in document order. */
function follows(earlier: Element, later: Element): boolean {
  return (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}
/**
 * Stands in for a tab record a reload restored: the layout keeps the record,
 * the opener's navigation parameters are not part of it, so the body receives
 * `params: undefined` at revision 0 (the Sidebar's restored-record navigation).
 */
const RESTORED = Symbol('restored record without navigation parameters')
function tabInfo(params: unknown, revision = 1): SidebarRightTabInfo {
  const actions: SidebarRightTabActions = {
    bindCommands: vi.fn(() => vi.fn()),
    openResource: vi.fn(),
    openTab: vi.fn(),
    close: vi.fn(),
  }
  return {
    sidebar: { expanded: true, fullscreen: false },
    panel: { id: 'pane-1' as PaneId, isFloating: false },
    tab: {
      ...TAB,
      title: '',
      navigation: { address: TAB.contentId, params, revision },
      actions,
    },
  } as SidebarRightTabInfo
}
async function mount(
  initial: Partial<CatalogSnapshot<Entry>> = {},
  params: unknown = { sessionId: SESSION, id: at.id },
  dictionary: typeof en | typeof zh = en,
  sessionState: SessionListState = sessions,
  overrides: Partial<ScheduleTaskTabProps> = {},
) {
  const editor = createEditorStore().create()
  // Model the source: a first read is unsettled, and only a successful read
  // settles the snapshot and advances its revision. A refresh and a failure keep
  // both, which is what separates "no answer yet" from "the last answer stands".
  const initialStatus = initial.status ?? 'ready'
  let snapshot: CatalogSnapshot<Entry> = {
    records: [at],
    status: initialStatus,
    deleting: [],
    settled: initialStatus === 'ready',
    readRequest: initialStatus === 'ready' ? 1 : 0,
    readSettled: initialStatus === 'ready' ? 1 : 0,
    ...initial,
  }
  const info = params === RESTORED ? tabInfo(undefined, 0) : tabInfo(params)
  const props = {
    useStore: bindSnapshotSelector(editor),
    actions: editor.actions,
    sessionId: SESSION,
    useTabInfo: () => computed(() => info),
    useSessions: <T,>(select: (value: SessionListState) => T) =>
      computed(() => select(sessionState)),
    useWorkspaces: <T,>(select: (value: WorkspaceSnapshot) => T) =>
      computed(() => select(workspaces)),
    onDelete: vi.fn(async () => 'deleted' as const),
    onRetry: vi.fn(async () => {}),
    hostActions: {
      edit: vi.fn<HostTaskActions['edit']>(async () => 'saved'),
      run: vi.fn<HostTaskActions['run']>(async () => 'queued'),
      loadNewSessionInterval: vi.fn<HostTaskActions['loadNewSessionInterval']>(async () => 7200),
    },
    loadHistory: vi.fn(async ({ id }: { id: ScheduleId }) => ({
      ok: true,
      value: {
        id,
        records: [],
        earlierRecordsUnavailable: false,
        earlierRecordsPruned: false,
        retention: { days: 30, records: 200 },
      },
    })),
    onOpenSession: vi.fn(),
    taskBindings: new TaskTabBindings(() => [TAB.id]),
    t: makeTranslate(dictionary),
    ...overrides,
  } as ScheduleTaskTabProps
  /** Props whose catalog hook reads one snapshot. */
  const withSnapshot = (value: CatalogSnapshot<Entry>): ScheduleTaskTabProps => ({
    ...props,
    useCatalog: <T,>(select: (current: CatalogSnapshot<Entry>) => T) =>
      computed(() => select(value)),
  })
  const view = render(
    vueH(ScheduleTaskTab, {
      ...withSnapshot(
        initialStatus === 'ready' ? { ...snapshot, readRequest: 0, readSettled: 0 } : snapshot,
      ),
    }),
  )
  // The tab asks for a read when it appears and answers for the task only once a
  // read sent after that has succeeded. A case staging a settled snapshot therefore
  // shows that read landing; one staging a first read keeps it unanswered.
  if (initialStatus === 'ready')
    await view.rerender(vueH(ScheduleTaskTab, { ...withSnapshot(snapshot) }))
  /** Retry ordinals the mount asked with, before the case's own retries. */
  const mountRetries = vi.mocked(props.onRetry).mock.calls.map(call => call[0])
  vi.mocked(props.onRetry).mockClear()
  return {
    props,
    view,
    mountRetries,
    bindings: props.taskBindings,
    /** Render one catalog snapshot over the mounted tab. */
    async show(next: CatalogSnapshot<Entry>) {
      snapshot = next
      await view.rerender(vueH(ScheduleTaskTab, { ...withSnapshot(snapshot) }))
    },
    async update(next: Partial<CatalogSnapshot<Entry>>) {
      // A successful read settles the snapshot and advances its revision; a
      // refresh and a failure publish only the status they were given.
      const settled =
        next.status === 'ready'
          ? {
            settled: true,
            readRequest: snapshot.readRequest + 1,
            readSettled: snapshot.readRequest + 1,
          }
          : {}
      snapshot = { ...snapshot, ...next, ...settled }
      await view.rerender(vueH(ScheduleTaskTab, { ...withSnapshot(snapshot) }))
    },
  }
}
/**
 * Bindings that already hold one target for the tab under test.
 * @param id - the task the restored tab last showed.
 * @returns the seeded bindings.
 */
function boundTo(id: ScheduleId): TaskTabBindings {
  const bindings = new TaskTabBindings(() => [TAB.id])
  bindings.write(SESSION, TAB, { sessionId: SESSION, id })
  return bindings
}
describe.each([
  ['English', en],
  ['Chinese', zh],
] as const)('task tab body in %s', (_name, dictionary) => {
  it('opens stored weekly controls immediately and restores them after viewing records', async () => {
    const { rrule: _rrule, kind: _kind, ...common } = at
    await mount(
      {
        records: [
          { ...common, kind: 'weekly', time: '09:30:00.000', timeZone: 'UTC', weekdays: [1, 5] },
        ],
      },
      { sessionId: SESSION, id: at.id },
      dictionary,
    )
    const detail = screen.getByRole('complementary', { name: dictionary['detail.label'] })
    const days = (): (string | null)[] =>
      within(within(detail).getByRole('group', { name: dictionary['rule.weekday'] }))
        .getAllByRole('button')
        .map(button => button.getAttribute('aria-pressed'))
    expect(days()).toEqual(['true', 'false', 'false', 'false', 'true', 'false', 'false'])
    await fireEvent.click(within(detail).getByRole('tab', { name: dictionary['detail.records'] }))
    await fireEvent.click(within(detail).getByRole('tab', { name: dictionary['detail.rule'] }))
    expect(days()).toEqual(['true', 'false', 'false', 'false', 'true', 'false', 'false'])
    expect(
      within(detail)
        .getByRole('button', { name: dictionary['rule.save'] })
        .hasAttribute('disabled'),
    ).toBe(true)
  })
  it('renders the named task rule, its actions, and its target Session entry without a close control', async () => {
    const h = await mount({}, { sessionId: SESSION, id: at.id }, dictionary)
    const detail = screen.getByRole('complementary', { name: dictionary['detail.label'] })
    // The strip heads the panel, the task name follows it, then its next-run line.
    const tabs = within(detail).getByRole('tablist', { name: dictionary['detail.tabs'] })
    const name = within(detail).getByRole('heading', { level: 2, name: at.title })
    const nextRun = detail.querySelector<HTMLElement>(`.${css.nextRun}`)!
    expect(follows(tabs, name)).toBe(true)
    expect(follows(name, nextRun)).toBe(true)
    expect(nextRun.querySelector('time')?.dateTime).toBe(at.scheduledAt)
    expect(detail.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(at.prompt)
    const rule = detail.querySelector<HTMLFieldSetElement>('fieldset')!
    expect(
      within(rule)
        .getByRole('spinbutton', { name: dictionary['host.interval'] })
        .getAttribute('value'),
    ).toBe('5')
    expect(rule.textContent).toContain(dictionary['host.currentConversation'])
    expect(within(tabs).getAllByRole('tab')).toHaveLength(2)
    await fireEvent.click(within(detail).getByRole('button', { name: dictionary['detail.more'] }))
    const menu = screen.getByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent),
    ).toEqual([dictionary['host.run'], dictionary['delete.action']])
    await fireEvent.keyDown(menu, { key: 'Escape' })
    // The footer opens the Session that the task delivers to, as it does on the Tasks page.
    await fireEvent.click(
      within(detail).getByRole('button', { name: dictionary['detail.openSession'] }),
    )
    expect(h.props.onOpenSession).toHaveBeenCalledExactlyOnceWith(SESSION)
    // The tab has its own close control in the Sidebar strip, so the detail carries none.
    expect(within(detail).queryByRole('button', { name: dictionary['detail.close'] })).toBeNull()
  })
  it('names the shown task with its stored title and shows its instruction', async () => {
    const named = { ...at, title: 'Metrics review' }
    await mount({ records: [named] })
    const detail = screen.getByRole('complementary', { name: en['detail.label'] })
    expect(within(detail).getByRole('heading', { level: 2 }).textContent).toBe('Metrics review')
    expect(detail.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(named.prompt)
  })
  it('labels the target Session with its catalog title instead of its id', async () => {
    const title = 'Release review'
    const h = await mount(
      {},
      { sessionId: SESSION, id: at.id },
      dictionary,
      sessionsWithTitle(title),
    )
    const detail = screen.getByRole('complementary', { name: dictionary['detail.label'] })
    const link = within(detail).getByRole('button', {
      name: dictionary['detail.openSessionTitle'].replace('{title}', title),
    })
    expect(within(link).getByText(title)).toBeDefined()
    expect(within(detail).queryByText(SESSION)).toBeNull()
    await fireEvent.click(link)
    expect(h.props.onOpenSession).toHaveBeenCalledExactlyOnceWith(SESSION)
  })
  it('deletes only the shown task and only after confirmation', async () => {
    const h = await mount({}, { sessionId: SESSION, id: at.id }, dictionary)
    await fireEvent.click(screen.getByRole('button', { name: dictionary['detail.more'] }))
    await fireEvent.click(screen.getByRole('menuitem', { name: dictionary['delete.action'] }))
    const dialog = screen.getByRole('dialog', { name: dictionary['delete.title'] })
    expect(dialog.textContent).toContain(at.prompt)
    expect(dialog.textContent).toContain(dictionary['delete.description'])
    expect(h.props.onDelete).not.toHaveBeenCalled()
    await fireEvent.click(
      within(dialog).getByRole('button', { name: dictionary['delete.cancel'] }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.props.onDelete).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByRole('button', { name: dictionary['detail.more'] }))
    await fireEvent.click(screen.getByRole('menuitem', { name: dictionary['delete.action'] }))
    await fireEvent.click(screen.getByRole('button', { name: dictionary['delete.confirm'] }))
    expect(h.props.onDelete).toHaveBeenCalledExactlyOnceWith(at.id)
  })
})
describe('task tab states', () => {
  it('distinguishes a loading catalog, a failed read, and a task that is gone', async () => {
    const loading = await mount({ records: [], status: 'loading' })
    // The centered loading state is a bare spinner whose copy is its accessible name.
    expect(screen.getByRole('status', { name: en['list.loading'] }).textContent).toBe('')
    await loading.update({ status: 'error' })
    expect(screen.getByRole('alert').textContent).toBe(en['list.error'])
    await fireEvent.click(screen.getByRole('button', { name: en['list.retry'] }))
    expect(loading.props.onRetry).toHaveBeenCalledOnce()
    await loading.update({ status: 'ready' })
    expect(screen.getByRole('status').textContent).toBe(en['detail.missing'])
    expect(screen.queryByRole('complementary')).toBeNull()
  })
  it('holds the loading feedback until a read settles, then renders the named task', async () => {
    const h = await mount({ records: [], status: 'loading' })
    expect(screen.getByRole('status', { name: en['list.loading'] })).toBeDefined()
    expect(screen.queryByText(en['detail.missing'])).toBeNull()
    await h.update({ records: [at], status: 'ready' })
    expect(screen.getByRole('complementary', { name: en['detail.label'] })).toBeDefined()
    expect(screen.queryByText(en['detail.missing'])).toBeNull()
  })
  it('shows the missing-task state only for a settled read without the task', async () => {
    await mount({ records: [], status: 'ready' })
    expect(screen.getByRole('status').textContent).toBe(en['detail.missing'])
    expect(screen.queryByRole('complementary')).toBeNull()
  })
  it('shows the query failure, not the missing-task notice, when the read fails', async () => {
    const h = await mount({ records: [], status: 'error' })
    expect(screen.getByRole('alert').textContent).toBe(en['list.error'])
    expect(screen.queryByText(en['detail.missing'])).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: en['list.retry'] }))
    expect(h.props.onRetry).toHaveBeenCalledOnce()
  })
  it('degrades a restored tab without a binding to the missing-task state once a read succeeds', async () => {
    const h = await mount({ records: [], status: 'loading' }, RESTORED)
    expect(screen.getByRole('status', { name: en['list.loading'] })).toBeDefined()
    // The task is in the settled read; the restored record has no binding to match it against,
    // and a load that can never finish would be a false statement.
    await h.update({ records: [at], status: 'ready' })
    expect(screen.getByRole('status').textContent).toBe(en['detail.missing'])
    expect(screen.queryByRole('status', { name: en['list.loading'] })).toBeNull()
    expect(screen.queryByRole('complementary')).toBeNull()
  })
  it('keeps the query failure of a restored tab', async () => {
    await mount({ records: [], status: 'error' }, RESTORED)
    expect(screen.getByRole('alert').textContent).toBe(en['list.error'])
    expect(screen.queryByText(en['detail.missing'])).toBeNull()
  })
  it('renders the detail of a restored tab from the binding its last navigation wrote', async () => {
    const h = await mount({ records: [], status: 'loading' }, RESTORED, en, sessions, {
      taskBindings: boundTo(at.id),
    })
    expect(screen.getByRole('status', { name: en['list.loading'] })).toBeDefined()
    await h.update({ records: [at], status: 'ready' })
    const detail = screen.getByRole('complementary', { name: en['detail.label'] })
    expect(within(detail).getByRole('heading', { level: 2 }).textContent).toBe(at.title)
    expect(screen.queryByText(en['detail.missing'])).toBeNull()
  })
  it('writes the binding when a navigation names the task', async () => {
    const h = await mount()
    expect(h.bindings.read(SESSION, TAB)).toEqual({ sessionId: SESSION, id: at.id })
  })
  it('shows the navigated task rather than the binding when a navigation names one', async () => {
    const h = await mount(
      { records: [at, other] },
      { sessionId: SESSION, id: other.id },
      en,
      sessions,
      {
        taskBindings: boundTo(at.id),
      },
    )
    const detail = screen.getByRole('complementary', { name: en['detail.label'] })
    expect(within(detail).getByRole('heading', { level: 2 }).textContent).toBe(other.title)
    // The navigation rebinds the page to the task it named.
    expect(h.bindings.read(SESSION, TAB)).toEqual({ sessionId: SESSION, id: other.id })
  })
  it('keeps a binding whose read has not settled and shows its query failure', async () => {
    const h = await mount({ records: [], status: 'loading' }, RESTORED, en, sessions, {
      taskBindings: boundTo(at.id),
    })
    expect(h.bindings.read(SESSION, TAB)).toEqual({ sessionId: SESSION, id: at.id })
    await h.update({ status: 'error' })
    expect(screen.getByRole('alert').textContent).toBe(en['list.error'])
    expect(screen.queryByText(en['detail.missing'])).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: en['list.retry'] }))
    expect(h.props.onRetry).toHaveBeenCalledOnce()
    expect(h.bindings.read(SESSION, TAB)).toEqual({ sessionId: SESSION, id: at.id })
  })
  it('degrades a binding no settled read resolves to the missing-task state', async () => {
    const h = await mount({ records: [], status: 'ready' }, RESTORED, en, sessions, {
      taskBindings: boundTo(at.id),
    })
    expect(screen.getByRole('status').textContent).toBe(en['detail.missing'])
    expect(screen.queryByRole('status', { name: en['list.loading'] })).toBeNull()
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(h.bindings.read(SESSION, TAB)).toBeUndefined()
  })
  it('asks for the read that can answer for a tab without a task', async () => {
    // The retained records leave this restored tab without a task, so it asks for a
    // read once, naming the ordinal it observed at mount, and answers for the task
    // only once a read sent after that succeeded.
    const h = await mount(
      { records: [], status: 'loading', settled: true, readRequest: 6, readSettled: 5 },
      RESTORED,
      en,
      sessions,
      { taskBindings: boundTo(at.id) },
    )
    expect(h.mountRetries).toEqual([6])
  })
  it('keeps a navigated tab whose task the records hold from reading again', async () => {
    // A navigated tab whose task the retained records already hold needs no
    // roundtrip: asking would put the shared catalog into loading for every other
    // surface, and the tab already has what it needs.
    const h = await mount({ records: [at], status: 'ready' }, { sessionId: SESSION, id: at.id })
    expect(h.mountRetries).toEqual([])
    expect(screen.getByRole('complementary', { name: en['detail.label'] })).toBeDefined()
  })
  it('does not request again when a shown task leaves the retained records', async () => {
    // The task resolves at mount, so the mount read is not requested at all.
    const h = await mount({ records: [at], status: 'ready' }, { sessionId: SESSION, id: at.id })
    expect(h.mountRetries).toEqual([])
    // The task then leaves the retained records, but the read that published them
    // was requested after the tab appeared, so it states that the task is gone and
    // the tab asks for nothing further.
    await h.show({
      records: [],
      status: 'loading',
      deleting: [],
      settled: true,
      readRequest: 7,
      readSettled: 7,
    })
    expect(vi.mocked(h.props.onRetry)).not.toHaveBeenCalled()
  })
  it('asks for a read when a read in flight at mount leaves the tab without its task', async () => {
    // The task resolves at mount, so no read is requested then: a read that was
    // already in flight when the tab appeared decides this frame. That read settles
    // without the task, and it was sent before the tab appeared, so it cannot state
    // that the task is gone and the tab asks for one that can.
    const h = await mount(
      { records: [at], status: 'loading', settled: true, readRequest: 6, readSettled: 5 },
      { sessionId: SESSION, id: at.id },
    )
    expect(h.mountRetries).toEqual([])
    expect(screen.getByRole('complementary', { name: en['detail.label'] })).toBeDefined()
    await h.show({
      records: [],
      status: 'ready',
      deleting: [],
      settled: true,
      readRequest: 6,
      readSettled: 6,
    })
    expect(vi.mocked(h.props.onRetry)).toHaveBeenCalledExactlyOnceWith(6)
    // The tab reports the load its own read is producing rather than an empty body,
    // and the read that lands after it names the task as gone.
    expect(screen.getByRole('status', { name: en['list.loading'] })).toBeDefined()
    expect(screen.queryByText(en['detail.missing'])).toBeNull()
    await h.show({
      records: [],
      status: 'ready',
      deleting: [],
      settled: true,
      readRequest: 7,
      readSettled: 7,
    })
    expect(vi.mocked(h.props.onRetry)).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toBe(en['detail.missing'])
  })
  it('measures the answer for a reused tab from the navigation it now carries', async () => {
    // The Sidebar navigates a tab again without remounting its body, so the read the
    // tab measures its answer from moves with the new navigation: the answer that
    // resolved the previous task cannot state that the next one is gone.
    let info = tabInfo({ sessionId: SESSION, id: at.id })
    const h = await mount(
      { records: [at], status: 'ready', readRequest: 5, readSettled: 5 },
      { sessionId: SESSION, id: at.id },
      en,
      sessions,
      { useTabInfo: () => computed(() => info) },
    )
    expect(h.mountRetries).toEqual([])
    info = tabInfo({ sessionId: SESSION, id: other.id }, 2)
    await h.show({
      records: [at],
      status: 'ready',
      deleting: [],
      settled: true,
      readRequest: 5,
      readSettled: 5,
    })
    expect(vi.mocked(h.props.onRetry)).toHaveBeenCalledExactlyOnceWith(5)
    expect(screen.queryByText(en['detail.missing'])).toBeNull()
    expect(screen.getByRole('status', { name: en['list.loading'] })).toBeDefined()
    await h.show({
      records: [at, other],
      status: 'ready',
      deleting: [],
      settled: true,
      readRequest: 6,
      readSettled: 6,
    })
    expect(vi.mocked(h.props.onRetry)).toHaveBeenCalledOnce()
    expect(
      within(screen.getByRole('complementary', { name: en['detail.label'] })).getByRole('heading', {
        level: 2,
      }).textContent,
    ).toBe(other.title)
  })
  it('keeps a restored binding until a read after the tab confirms the task is gone', async () => {
    // The catalog holds a settled answer, but the read it settled from was sent
    // before this tab appeared (ordinal 5 against the read in flight under 6), so it
    // cannot state that the bound task is gone: the tab waits for its own read.
    const h = await mount(
      { records: [], status: 'loading', settled: true, readRequest: 6, readSettled: 5 },
      RESTORED,
      en,
      sessions,
      { taskBindings: boundTo(at.id) },
    )
    expect(h.bindings.read(SESSION, TAB)).toEqual({ sessionId: SESSION, id: at.id })
    expect(screen.getByRole('status', { name: en['list.loading'] })).toBeDefined()
    expect(screen.queryByText(en['detail.missing'])).toBeNull()
    // The read that was already in flight when the tab appeared settles here. It,
    // too, was sent before the tab, so it cannot state that the task is gone.
    await h.show({
      records: [],
      status: 'ready',
      deleting: [],
      settled: true,
      readRequest: 6,
      readSettled: 6,
    })
    expect(h.bindings.read(SESSION, TAB)).toEqual({ sessionId: SESSION, id: at.id })
    expect(screen.queryByText(en['detail.missing'])).toBeNull()
    // A read sent after the tab settles without the record: the task is gone.
    await h.show({
      records: [],
      status: 'ready',
      deleting: [],
      settled: true,
      readRequest: 7,
      readSettled: 7,
    })
    expect(screen.getByRole('status').textContent).toBe(en['detail.missing'])
    expect(screen.queryByRole('status', { name: en['list.loading'] })).toBeNull()
    expect(h.bindings.read(SESSION, TAB)).toBeUndefined()
  })
  it('keeps a settled tab state through a refresh and a failed refresh', async () => {
    const h = await mount({ records: [], status: 'ready' }, RESTORED, en, sessions, {
      taskBindings: boundTo(at.id),
    })
    // The settled read cannot resolve the restored binding, so the tab states that
    // it has no task and drops the binding instead of loading forever.
    expect(screen.getByRole('status').textContent).toBe(en['detail.missing'])
    expect(h.bindings.read(SESSION, TAB)).toBeUndefined()
    // A refresh republishes loading over the records of that read, and a failed
    // refresh only changes the status: neither may restate the tab as still loading
    // over the settled missing-task answer.
    for (const status of ['loading', 'error'] as const) {
      await h.update({ status })
      expect([status, screen.getByRole('status').textContent]).toEqual([
        status,
        en['detail.missing'],
      ])
      expect([status, screen.queryByRole('status', { name: en['list.loading'] })]).toEqual([
        status,
        null,
      ])
      expect([status, h.bindings.read(SESSION, TAB)]).toEqual([status, undefined])
    }
  })
  it('keeps a retained task rendered after its authoritative row disappears', async () => {
    const h = await mount()
    const pending = Promise.withResolvers<Awaited<ReturnType<HostTaskActions['edit']>>>()
    vi.mocked(h.props.hostActions.edit).mockReturnValueOnce(pending.promise)
    await fireEvent.change(screen.getByRole('textbox', { name: en['detail.name'] }), {
      target: { value: 'Renamed' },
    })
    await fireEvent.click(
      within(document.querySelector<HTMLElement>(`.${css.saveFooter}`)!).getByRole('button', {
        name: en['rule.save'],
      }),
    )
    expect(h.props.hostActions.edit).toHaveBeenCalledOnce()
    await h.update({ records: [] })
    const detail = screen.getByRole('complementary', { name: en['detail.label'] })
    expect(
      within(detail).getByRole<HTMLInputElement>('textbox', { name: en['detail.name'] }).value,
    ).toBe('Renamed')
    await fireEvent.click(within(detail).getByRole('button', { name: en['detail.more'] }))
    expect(
      screen.getByRole('menuitem', { name: en['delete.action'] }).hasAttribute('disabled'),
    ).toBe(true)
    await act(async () => {
      pending.resolve('saved')
      await pending.promise
    })
    expect(screen.queryByRole('complementary')).toBeNull()
  })
  it('closes the tab once the Host applies a confirmed deletion', async () => {
    const pending = Promise.withResolvers<CatalogDeleteOutcome>()
    const h = await mount({}, { sessionId: SESSION, id: at.id }, en, sessions, {
      onDelete: vi.fn<ScheduleTaskTabProps['onDelete']>(() => pending.promise),
    })
    const close = vi.spyOn(h.props.useTabInfo().value.tab.actions, 'close')
    await fireEvent.click(screen.getByRole('button', { name: en['detail.more'] }))
    await fireEvent.click(screen.getByRole('menuitem', { name: en['delete.action'] }))
    await fireEvent.click(screen.getByRole('button', { name: en['delete.confirm'] }))
    expect(h.props.onDelete).toHaveBeenCalledExactlyOnceWith(at.id)
    // The catalog still lists the row while the deletion is in flight, so the tab stays.
    await h.update({ deleting: [at.id] })
    // The refresh after the deletion drops the row, and the tab keeps the task until the Host answers.
    await h.update({ records: [], deleting: [] })
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByRole('complementary', { name: en['detail.label'] })).toBeDefined()
    await act(async () => {
      pending.resolve('deleted')
      await pending.promise
    })
    // The tab closes itself, and the app-wide toast, not this body, announces the outcome.
    expect(close).toHaveBeenCalledOnce()
  })
  it('ignores navigation parameters that belong to another tab type', async () => {
    await mount({ records: [at] }, { line: 12 })
    expect(screen.getByRole('status').textContent).toBe(en['detail.missing'])
    expect(screen.queryByRole('complementary')).toBeNull()
  })
})
describe('task tab chip', () => {
  it('names the shown task from its stored title and without a row from the detail label', async () => {
    const named = { ...at, title: 'Metrics review' }
    const props = {
      useTabInfo: () => computed(() => tabInfo({ sessionId: SESSION, id: at.id })),
      useCatalog: <T,>(select: (value: CatalogSnapshot<Entry>) => T) =>
        computed(() =>
          select({
            records: [named],
            status: 'ready',
            deleting: [],
            settled: true,
            readRequest: 0,
            readSettled: 0,
          }),
        ),
      t: makeTranslate(en),
    } as ScheduleTaskTabTitleProps
    const view = render(vueH(ScheduleTaskTabTitle, { ...props }))
    expect(view.container.textContent).toBe('Metrics review')
    const missing = {
      ...props,
      useCatalog: <T,>(select: (value: CatalogSnapshot<Entry>) => T) =>
        computed(() =>
          select({
            records: [],
            status: 'ready',
            deleting: [],
            settled: true,
            readRequest: 0,
            readSettled: 0,
          }),
        ),
    }
    await view.rerender(vueH(ScheduleTaskTabTitle, { ...missing }))
    expect(view.container.textContent).toBe(en['detail.label'])
  })
  it('names a restored tab from the binding its last navigation wrote', async () => {
    const props = {
      sessionId: SESSION,
      useTabInfo: () => computed(() => tabInfo(undefined, 0)),
      useCatalog: <T,>(select: (value: CatalogSnapshot<Entry>) => T) =>
        computed(() =>
          select({
            records: [at],
            status: 'ready',
            deleting: [],
            settled: true,
            readRequest: 0,
            readSettled: 0,
          }),
        ),
      taskBindings: boundTo(at.id),
      t: makeTranslate(en),
    } as ScheduleTaskTabTitleProps
    const view = render(vueH(ScheduleTaskTabTitle, { ...props }))
    expect(view.container.textContent).toBe(at.title)
    // A window with no saved binding names no task.
    localStorage.clear()
    await view.rerender(
      vueH(ScheduleTaskTabTitle, { ...props, taskBindings: new TaskTabBindings() }),
    )
    expect(view.container.textContent).toBe(en['detail.label'])
  })
})

const ScheduleTaskTab = defineComponent(
  (props: InstanceType<typeof NativeScheduleTaskTab>['$props']) => {
    const read = liveFixtureProps(props)
    return () => vueH(NativeScheduleTaskTab, read())
  },
  {
    props: [
      'useTabInfo',
      'useSession',
      'sessionId',
      'useProjection',
      'useAccess',
      'useConversation',
      'useInput',
      'inputActions',
      'useChat',
      'useRemoteAccess',
      'useSessions',
      'useSessionRetainInfo',
      'useSessionAccess',
      'usePanelInfo',
      'useContextMenu',
      'useSessionStatus',
      'useWorkspaces',
      'useResource',
      'useWorkspaceAccess',
      'useStore',
      'actions',
      'onDelete',
      'onRetry',
      'hostActions',
      'onOpenSession',
      'loadHistory',
      'taskBindings',
      'useCatalog',
      't',
    ],
  },
)

const ScheduleTaskTabTitle = defineComponent(
  (props: InstanceType<typeof NativeScheduleTaskTabTitle>['$props']) => {
    const read = liveFixtureProps(props)
    return () => vueH(NativeScheduleTaskTabTitle, read())
  },
  {
    props: [
      'useTabInfo',
      'useSession',
      'sessionId',
      'useProjection',
      'useAccess',
      'useConversation',
      'useInput',
      'inputActions',
      'useChat',
      'useRemoteAccess',
      'useSessions',
      'useSessionRetainInfo',
      'useSessionAccess',
      'usePanelInfo',
      'useContextMenu',
      'useSessionStatus',
      'useWorkspaces',
      'useResource',
      'useWorkspaceAccess',
      'taskBindings',
      'useCatalog',
      't',
    ],
  },
)
