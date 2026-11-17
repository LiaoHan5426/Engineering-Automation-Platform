import { defineComponent, nextTick } from 'vue'
import { h, Fragment, computed, shallowRef, type VNodeChild, type Component, type ComputedRef } from 'vue'
// @vitest-environment jsdom
import { contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
/**
 * View registration acceptance on the real framework stack: the plugin fiber
 * registers Trajectory into a real SlotRegistry view ring, tabs
 * switch inside ConversationRoot (renderSlot share driven by the same tab
 * projection apply uses) without collapsing chat, trajectory renders the
 * event ledger with its timing overview, and fiber disposal removes the tab.
 * Timeline projection and inclusive focus edge cases ride along.
 */
import type { GlobalStandardProps, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render as renderNative } from '../../../test-support/client-runtime/src/vue-test.ts'
const render = async (...args: Parameters<typeof renderNative>) => {
  const view = renderNative(...args)
  await nextTick()
  return view
}
import { fireEvent, screen, waitFor, within } from '@testing-library/dom'
import { allowAllAccess, bindSnapshotSelector, SlotTestRuntime, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { EMPTY_CONVERSATION_SNAPSHOT, UiConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ConversationBinding, ConversationSnapshot, ConversationViewSnapshotMap, ConvViewProps, InputActions, InputState, RequestView, ViewTab } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { EMPTY_CHAT_SNAPSHOT } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ChatSnapshot, LegacyConversationSlice } from '@deepseek-ai/dsh-client-ui-chat/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionBinding, SessionListState, SessionProjectionMap, SessionSnapshot, UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session-status/client'
import { ConversationSession, ConversationSessionHeader, type ConversationSessionHeaderProps, type ConversationSessionProps } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/ConversationSession.tsx'
import { createConversationStore } from '@deepseek-ai/dsh-client-ui-conversation/src/client/stores.ts'
import { zh as conversationZh } from '@deepseek-ai/dsh-client-ui-conversation/src/client/locales.ts'
import * as localePlugin from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-trajectory/client'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import type { TrajectoryTurnModel } from '../src/client/layout.ts'
import { TrajectoryTimeline as LocalizedTrajectoryTimeline } from '../src/client/TrajectoryTimeline.tsx'
import { TrajectoryView, type TrajectoryViewInjected } from '../src/client/TrajectoryView.tsx'
import { createTrajectoryDurationStore } from '../src/client/duration-store.ts'
import { EMPTY_TRAJECTORY_SNAPSHOT } from '../src/client/trajectory-snapshot-builder.ts'
import type { TrajectorySnapshot } from '../src/client/trajectory-contract.ts'
import { deriveTrajectoryTimeline } from '../src/client/timeline.ts'
import { t as tTrajectory, tZh } from './locale.client.ts'
// Every session-scope fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => shallowRef({ status: 'none' as const, value: undefined, failure: undefined, reload: () => { } })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => computed(() => selector({ activePanelId: null }))
function TrajectoryTimeline(props: Omit<InstanceType<typeof LocalizedTrajectoryTimeline>['$props'], 't'>) {
  return h(LocalizedTrajectoryTimeline, { ...props, 't': tTrajectory })
}
const SID = 's1' as SessionId
const tConversation: ConversationSessionHeaderProps['t'] = key => (conversationZh as Record<string, string>)[key] ?? key
const runtimes: SlotTestRuntime[] = []
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
  for (const runtime of runtimes.splice(0))
    await runtime.dispose()
})
// The Conversation store persists under its declared key; clear so one case's active
// view cannot rehydrate into the next.
beforeEach(() => {
  localStorage.clear()
})
/** Node fixture: user prologue, two turns, one tool result inside turn 1. */
const NODES: LegacyConversationSlice['nodes'] = [
  { kind: 'user', seq: 1, time: 1000, content: [], source: null },
  {
    kind: 'assistant', seq: 2, time: 2000, turn: 1, step: 1, blocks: [],
    timing: { stepStartTime: 1800, firstTokenTime: 1900, completedTime: 2000 },
  },
  {
    kind: 'tool-result', seq: 3, time: 3000, callId: 'c1', call: null, callTime: 2200,
    name: '', args: PartialArguments.EMPTY,
    content: [], isError: false, subCalls: [],
  },
  {
    kind: 'assistant', seq: 4, time: 4000, turn: 2, step: 1, blocks: [],
    timing: { stepStartTime: 3500, firstTokenTime: 3700, completedTime: 4000 },
  },
]
function historySnapshot(nodes: LegacyConversationSlice['nodes'], inspection: Partial<TrajectorySnapshot> = {}): TrajectorySnapshot {
  return {
    eventNodes: nodes,
    eventLocations: new Map(),
    requests: [],
    callSchemas: new Map(),
    partial: null,
    runningCalls: [],
    ...inspection,
  }
}
function sessionSnapshot(nodes: LegacyConversationSlice['nodes']): SessionSnapshot {
  return {
    sessionId: SID,
    pendingSubmissions: [],
    running: false,
    subagent: null,
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: false,
    loadingOlder: false, historyLoadStatus: 'idle', historyWasPartial: false,
    promptError: null,
    blank: nodes.length === 0,
    lastAgentError: null,
    promptAttempted: nodes.length > 0,
    awaitingFirstTurn: false,
  }
}
function conversationSnapshot(trajectory: TrajectorySnapshot): ConversationSnapshot {
  return {
    views: EMPTY_CONVERSATION_SNAPSHOT.views,
    activeTargets: trajectory.eventNodes.length === 0
      ? new Set()
      : new Set(['trajectory']),
  }
}
function standaloneHistory(snapshot: TrajectorySnapshot): Pick<InstanceType<typeof TrajectoryView>['$props'], 'useSession' | 'useTrajectory' | 'loadOlder'> {
  const session = createSnapshotStore(sessionSnapshot(snapshot.eventNodes))
  const trajectory = createSnapshotStore(snapshot)
  return {
    useSession: bindSnapshotSelector(session),
    useTrajectory: bindSnapshotSelector(trajectory),
    loadOlder: () => Promise.resolve(false),
  }
}
function standaloneDuration(): Pick<InstanceType<typeof TrajectoryView>['$props'], 'useDuration' | 'setActualDuration'> {
  const duration = createSnapshotStore(false)
  return {
    useDuration: bindSnapshotSelector(duration),
    setActualDuration: (value) => { duration.set(value) },
  }
}
/** Empty sessions-list hook; breadcrumbs therefore fall back to the raw id. */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}
function emptyProjection<Key extends Extract<keyof SessionProjectionMap, string>>(
  key: Key): ComputedRef<SessionProjectionMap[Key] | undefined>
function emptyProjection<Key extends Extract<keyof SessionProjectionMap, string>, Selected>(key: Key, selector: (
  value: SessionProjectionMap[Key] | undefined) => Selected, eq?: (left: Selected, right: Selected) => boolean): ComputedRef<Selected>
function emptyProjection<Key extends Extract<keyof SessionProjectionMap, string>, Selected>(_key: Key,
  selector?: (value: SessionProjectionMap[Key] | undefined) =>
  Selected): ComputedRef<SessionProjectionMap[Key] | Selected | undefined> {
  return computed(() => selector === undefined ? undefined : selector(undefined))
}
const useProjection: UseProjection = emptyProjection
type StandaloneBaseProps = Omit<InstanceType<typeof TrajectoryView>['$props'], 'useSession' | 'useTrajectory' | 'useDuration' | 'loadOlder' | 'setActualDuration'>
/** Standalone view props: the session-scope standard kit the outlet would bake. */
function standaloneProps(nodes: LegacyConversationSlice['nodes']): StandaloneBaseProps {
  const trajectory = historySnapshot(nodes)
  const input = createSnapshotStore<InputState>({
    draft: '', attachmentIds: [], draftRev: 0, phase: 'plain', occurrences: [], queue: [],
  })
  const inputActions: InputActions = {
    insertQuote: () => false,
    captureInsertion: () => ({ start: 0, end: 0, draftRev: 0 }),
    insertText: () => false,
    setDraft: () => { },
    persistDraft: () => { },
    addAttachments: () => false,
    removeAttachment: () => { },
    pruneAttachments: () => { },
    submit: () => { },
  }
  return {
    sessionId: SID,
    useChat: bindSnapshotSelector(createSnapshotStore(EMPTY_CHAT_SNAPSHOT)),
    useSessions: emptySessions(),
    usePanelInfo, useResource,
    useSessionStatus: bindSnapshotSelector(createSnapshotStore<SessionStatusSnapshot>(new Map())),
    useSessionRetainInfo: () => shallowRef(undefined),
    useWorkspaces: emptyWorkspaces(),
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    useConversation: bindSnapshotSelector(createSnapshotStore(conversationSnapshot(trajectory))),
    useInput: bindSnapshotSelector(input),
    inputActions,
    useProjection,
    inspectCall: undefined,
    viewRequest: null,
    openView: () => { },
    completeViewRequest: () => { },
    // Image seats the outlet would bake: standalone renders omit the gallery.
    renderSlot: () => null,
    loadImage: () => Promise.reject(new Error('standalone views load no images')),
    // The locale seat the outlet would inject for the declared namespace.
    t: tZh,
  }
}
const TestSessionProvider = defineComponent((_props: import('@deepseek-ai/dsh-client-ui-slots').SessionAreaProps, { slots }) => () => slots.default?.(), { props: ['session', 'children'], inheritAttrs: false })
type ConversationTargetSources = {
  [Target in Extract<keyof ConversationViewSnapshotMap, string>]: ObservableSnapshot<ConversationViewSnapshotMap[Target] | undefined>;
}
/** Real-stack bench: root Context + real SlotRegistry ring + the plugin fiber. */
async function bench(snapshot = historySnapshot(NODES)) {
  const runtime = await SlotTestRuntime.create()
  runtime.remote.provideNamespaces({ toolResults: {} })
  runtimes.push(runtime)
  const ctx = runtime.ctx
  const slots = runtime.slots
  const loadOlder = vi.fn(() => Promise.resolve())
  await runtime.sessions.add({
    id: SID,
    snapshot: { blank: false },
    session: { loadOlder },
  })
  const reference = runtime.sessions.retain(SID)
  await reference.ready
  const trajectoryStore = createSnapshotStore(snapshot)
  const conversationStore = createSnapshotStore<ConversationSnapshot>(conversationSnapshot(snapshot))
  const uiConversation = new UiConversation(ctx, runtime.sessions)
  const { events, views } = uiConversation
  // Only the targets this trajectory bench binds; a typed lookup keeps the map
  // non-exhaustive so other packages' targets need no dependency here.
  const targetSources: Partial<ConversationTargetSources> = {
    chat: createSnapshotStore<ChatSnapshot | undefined>(undefined),
    trajectory: trajectoryStore,
  }
  const binding: ConversationBinding = {
    snapshot: conversationStore,
    openTurn: createSnapshotStore<number | undefined>(undefined),
    activate: () => { },
    target: (target) => {
      const source = targetSources[target]
      if (source === undefined)
        throw new Error(`trajectory bench has no source for target "${target}"`)
      return source
    },
  }
  vi.spyOn(uiConversation, 'binding').mockReturnValue(binding)
  // The conversation entry's role: declare the ring, then seed the chat entry.
  await runtime.root.declare({ 'conversation.view': { kind: 'list', scope: 'session' } }, (_p: {
    renderSlot?: unknown
  }) => null)
  const chatBody = vi.fn(() => h('div', { 'data-testid': 'chat-body' }))
  slots.register({ name: 'conversation.view', id: 'chat', order: 0, label: 'Chat' } as never, chatBody as never)
  // The locale plugin backs the locale-aware view tab label ('locale' in
  // inject); its settings scope needs a connection handle.
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  await runtime.mount(localePlugin)
  const provide = vi.spyOn(ctx.uiSession, 'provide')
  const feature = await runtime.mount({ inject: [...inject], apply })
  const sourceDescriptor = provide.mock.calls[0]?.[0]
  if (sourceDescriptor === undefined)
    throw new Error('ui-trajectory did not provide its standard source')
  return {
    runtime, ctx, slots, feature, loadOlder, trajectoryStore, conversationStore,
    events, views, sourceDescriptor, reference,
  }
}
/** Tab projection twin of apply's viewTabs (the render-side consumption path). */
function tabsOf(slots: SlotRegistry): ViewTab[] {
  return slots.entries('conversation.view')
    .map(e => ({ id: e.options.id!, label: resolveSlotLabel(e.options.label) ?? e.options.id! }))
}
type ConvViewOwner = Pick<ConvViewProps, 'inspectCall' | 'viewRequest' | 'openView' | 'completeViewRequest'>
function isConvViewOwner(owner: object): owner is ConvViewOwner {
  return 'inspectCall' in owner && 'viewRequest' in owner
        && 'openView' in owner && typeof owner.openView === 'function'
        && 'completeViewRequest' in owner && typeof owner.completeViewRequest === 'function'
}
/** Mount the strict Session header/body over the ring ledger with outlet-faithful render shares. */
async function mount(fixture: Awaited<ReturnType<typeof bench>>) {
  const { slots, trajectoryStore, conversationStore } = fixture
  const session = fixture.reference.binding.session
  const useSession = bindSnapshotSelector<SessionSnapshot>(session)
  const useTrajectory = bindSnapshotSelector<TrajectorySnapshot>(trajectoryStore)
  const useConversation = bindSnapshotSelector<ConversationSnapshot>(conversationStore)
  const useChat = bindSnapshotSelector(createSnapshotStore(EMPTY_CHAT_SNAPSHOT))
  const useSessions = emptySessions()
  const useSessionStatus = bindSnapshotSelector(createSnapshotStore<SessionStatusSnapshot>(new Map()))
  const useWorkspaces = emptyWorkspaces()
  const conversation = createConversationStore().create()
  const useConversationViews = bindSnapshotSelector(createSnapshotStore<readonly ViewTab[]>(tabsOf(slots)))
  const useInput = bindSnapshotSelector(createSnapshotStore<InputState>({
    draft: '', attachmentIds: [], draftRev: 0, phase: 'plain', occurrences: [], queue: [],
  }))
  const inputActions: InputActions = {
    insertQuote: () => false,
    captureInsertion: () => ({ start: 0, end: 0, draftRev: 0 }),
    insertText: () => false,
    setDraft: vi.fn(),
    persistDraft: vi.fn(),
    addAttachments: vi.fn(() => false),
    removeAttachment: vi.fn(),
    pruneAttachments: vi.fn(),
    submit: vi.fn(),
  }
  const standardProps = {
    sessionId: SID,
    useSession,
    useTrajectory,
    useChat,
    useConversation,
    useConversationViews,
    useSessions,
    usePanelInfo, useResource,
    useSessionStatus,
    useSessionRetainInfo: () => shallowRef(undefined),
    useWorkspaces,
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    useProjection,
    useInput,
    inputActions,
  }
  // Minimal outlet twin: resolve the ring entry by the `only` filter and
  // render it with the session standard kit (what SlotOutlet does for a
  // list-kind session slot, minus machinery).
  const renderSlot: ConversationSessionProps['renderSlot'] = (key, owner, opts): VNodeChild => {
    const entry = slots.entries('conversation.view').find(e => e.options.id === opts?.only)
    if (entry === undefined)
      return null
    if (!isConvViewOwner(owner))
      throw new Error('trajectory fixture expected Conversation view owner props')
    const View = entry.component as Component
    const injectEntry = entry.inject as ((sessionId: SessionId) => object) | undefined
    const injected = injectEntry === undefined
      ? {}
      : injectEntry(SID)
    const injectedProps = 'hooks' in injected
      ? (() => {
        const trajectory = injected as TrajectoryViewInjected
        return {
          loadOlder: trajectory.loadOlder,
          loadImage: trajectory.loadImage,
          setActualDuration: trajectory.setActualDuration,
          useDuration: bindSnapshotSelector(trajectory.hooks.duration),
          t: tZh,
        }
      })()
      : injected
    const viewProps: ConvViewProps & Pick<PropsRenderSlots<'conversation.trajectory.images'>, 'renderSlot'> = {
      ...owner, ...standardProps, renderSlot: () => null,
    }
    return (h(View, { ...viewProps, ...injectedProps, 'key': key }))
  }
  return await (async () => {
    const nativeView = await render(h(Fragment, null, [
      h(ConversationSessionHeader, { 'hideChrome': false, 'useEntryPins': selector => computed(() => selector([])), 'useEntryActions': selector => computed(() => selector(false)), 'setPinned': vi.fn(), ...standardProps, 'SessionProvider': TestSessionProvider, 'useStore': bindSnapshotSelector(conversation), 'actions': conversation.actions, 'renderSlot': () => null, 'renderFactorySlot': () => null, 'open': vi.fn(), 'selectView': conversation.actions.setView, 't': tConversation }),
      h(ConversationSession, { ...standardProps, 'SessionProvider': TestSessionProvider, 'useStore': bindSnapshotSelector(conversation), 'actions': conversation.actions, 'renderSlot': renderSlot, 'bindDraftPersistence': () => () => { }, 'openView': conversation.actions.openView, 'useInspectCall': selector => computed(() => selector(undefined)) }),
    ]))
    await act(() => { })
    return nativeView
  })()
}
describe('plugin registration', () => {
  it('registers trajectory after chat on the ring', async () => {
    const b = await bench()
    expect(tabsOf(b.slots)).toEqual([
      { id: 'chat', label: 'Chat' },
      { id: 'trajectory', label: 'Trajectory' },
    ])
  })
  it('fiber disposal removes the tab and leaves chat standing', async () => {
    const b = await bench()
    expect(b.events.entries().length).toBeGreaterThan(0)
    expect(b.views.entries()).toHaveLength(1)
    await b.feature.dispose()
    expect(tabsOf(b.slots).map(v => v.id)).toEqual(['chat'])
    expect(b.events.entries()).toEqual([])
    expect(b.views.entries()).toEqual([])
  })
  it('keeps one total standard source for a Session binding', async () => {
    const b = await bench()
    using reference = b.runtime.sessions.retain(SID)
    await reference.ready
    const binding = reference.binding
    const resolveSource = (owner: SessionBinding): ObservableSnapshot<TrajectorySnapshot> => {
      const contribution = b.sourceDescriptor.resolve(owner) as {
        hooks: {
          trajectory: ObservableSnapshot<TrajectorySnapshot>
        }
      }
      return contribution.hooks.trajectory
    }
    const source = b.runtime.ctx.uiSession.adapter.bindingSource(reference).getSnapshot(
    ).hooks.trajectory as ObservableSnapshot<TrajectorySnapshot>
    expect(resolveSource(binding)).toBe(source)
    expect(resolveSource(binding)).toBe(source)
    const optionalTrajectory = b.trajectoryStore as {
      set(value: TrajectorySnapshot | undefined): void
    }
    optionalTrajectory.set(undefined)
    expect(source.getSnapshot()).toBe(EMPTY_TRAJECTORY_SNAPSHOT)
  })
  it('shares one browser-wide duration preference across session injections', async () => {
    const b = await bench()
    const entry = b.slots.entries('conversation.view')
      .find(candidate => candidate.options.id === 'trajectory')
    expect(entry).toBeDefined()
    const injectEntry = entry!.inject as unknown as (sessionId: SessionId) => TrajectoryViewInjected
    const first = injectEntry(SID)
    await b.runtime.sessions.add({ id: 's2' })
    using reference = b.runtime.sessions.retain('s2' as SessionId)
    await reference.ready
    const second = injectEntry(reference.sessionId)
    expect(second.hooks.duration).toBe(first.hooks.duration)
    first.setActualDuration(true)
    expect(second.hooks.duration.getSnapshot()).toBe(true)
    expect(localStorage.getItem('dsh.trajectory.duration')).toBe('true')
    expect(localStorage.getItem(`dsh.trajectory.duration.${SID}`)).toBeNull()
  })
  it('reports whether loading older history changed the Trajectory snapshot', async () => {
    const b = await bench()
    const entry = b.slots.entries('conversation.view')
      .find(candidate => candidate.options.id === 'trajectory')
    const injectEntry = entry!.inject as unknown as (sessionId: SessionId) => TrajectoryViewInjected
    const injected = injectEntry(SID)
    expect(await injected.loadOlder()).toBe(false)
    b.loadOlder.mockImplementationOnce(async () => {
      b.trajectoryStore.set(historySnapshot([...NODES]))
    })
    expect(await injected.loadOlder()).toBe(true)
  })
})
describe('tab switching in ConversationRoot', () => {
  it('renders two tabs, defaults to chat, and switches to the trajectory ledger', async () => {
    const b = await bench()
    const view = await mount(b)
    expect(screen.getByTestId('chat-body')).toBeTruthy()
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Chat', 'Trajectory'])
    await act(() => fireEvent.click(screen.getByRole('tab', { name: 'Trajectory' })))
    expect(screen.queryByText(/turns ·/)).toBeNull()
    expect(view.container.querySelectorAll('tr[data-turn-start="true"]')).toHaveLength(2)
    expect(screen.queryByRole('columnheader')).toBeNull()
    expect(screen.getByRole('toolbar', { name: '轨迹工具栏' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '轨迹时间线' })).toBeTruthy()
    expect(view.container.querySelector('[data-conversation-composer-overlay]')).toBeTruthy()
    await act(() => fireEvent.click(screen.getByRole('button', { name: '收起所有轮次' })))
    expect(view.container.querySelector('[data-collapsed-summary="turn"]')).toBeTruthy()
    await act(() => fireEvent.click(screen.getByRole('button', { name: '展开所有轮次' })))
    expect(screen.getByRole('row', { name: /用户/ })).toBeTruthy()
    expect(screen.queryByTestId('chat-body')).toBeNull()
    expect(b.loadOlder).not.toHaveBeenCalled()
    await act(() => fireEvent.click(screen.getByRole('tab', { name: 'Chat' })))
    expect(b.loadOlder).not.toHaveBeenCalled()
  })
  it('labels the trajectory tab in the active locale', async () => {
    const b = await bench()
    const labelOf = () => tabsOf(b.slots).find(tab => tab.id === 'trajectory')?.label
    expect(labelOf()).toBe('Trajectory')
    const locale = b.ctx.get('locale') as {
      setLocale(id: string): void
    }
    locale.setLocale('zh')
    expect(labelOf()).toBe('轨迹')
    locale.setLocale('en')
    expect(labelOf()).toBe('Trajectory')
  })
  it('opens a local record inspector and switches payload tabs without opening chat details', async () => {
    const b = await bench()
    await mount(b)
    await act(() => fireEvent.click(screen.getByRole('tab', { name: 'Trajectory' })))
    await act(() => fireEvent.keyDown(screen.getByRole('row', { name: /工具/ }), { key: 'Enter' }))
    expect(screen.getByRole('complementary', { name: '事件详情' })).toBeTruthy()
    expect(screen.getByText('第 1 轮 · 第 1 步')).toBeTruthy()
    expect(screen.getByText('已完成')).toBeTruthy()
    expect(screen.getByRole('tab', { name: '结果' })).toBeTruthy()
    await act(() => fireEvent.click(screen.getByRole('button', { name: '关闭详情' })))
    expect(screen.queryByRole('complementary', { name: '事件详情' })).toBeNull()
  })
  it('labels a standalone compaction as between-turn work in the ledger and inspector', async () => {
    const nodes: LegacyConversationSlice['nodes'] = [
      { kind: 'user', seq: 1, time: 1000, content: [], source: null },
      {
        kind: 'assistant', seq: 2, time: 2000, turn: 1, step: 1,
        blocks: [{ kind: 'text', text: 'before' }],
      },
      { kind: 'user', seq: 5, time: 5000, content: [], source: null },
      {
        kind: 'assistant', seq: 6, time: 6000, turn: 2, step: 1,
        blocks: [{ kind: 'text', text: 'after' }],
      },
    ]
    const compaction: RequestView = {
      purpose: 'compaction',
      startSeq: 3,
      turn: null,
      step: 0,
      startedAt: 3000,
      completedAt: 4000,
      status: 'complete',
      summary: [{ type: 'text', text: 'standalone summary' }],
    }
    const b = await bench(historySnapshot(nodes, { requests: [compaction] }))
    const view = await mount(b)
    await act(() => fireEvent.click(screen.getByRole('tab', { name: 'Trajectory' })))
    expect(screen.getByText('轮次之间')).toBeTruthy()
    expect(view.container.textContent).not.toContain('Turn null')
    await act(() => fireEvent.click(screen.getByRole('button', { name: '请求 #2 · 压缩' })))
    expect(screen.getByText('压缩 · 轮次之间')).toBeTruthy()
    expect(view.container.textContent).not.toContain('Turn null')
  })
  it('reports a streaming Assistant record and a running compaction as pending', async () => {
    const nodes: LegacyConversationSlice['nodes'] = [
      { kind: 'user', seq: 1, time: 1000, content: [], source: null },
    ]
    const requests: RequestView[] = [
      {
        purpose: 'assistant', startSeq: 2, turn: 1, step: 1,
        startedAt: 2000, completedAt: null, status: 'running',
      },
      {
        purpose: 'compaction', startSeq: 3, turn: 1, step: 0,
        startedAt: 3000, completedAt: null, status: 'running',
      },
    ]
    const b = await bench(historySnapshot(nodes, {
      requests,
      partial: { turn: 1, step: 1, blocks: [{ kind: 'text', text: 'still streaming' }] },
    }))
    await mount(b)
    await act(() => fireEvent.click(screen.getByRole('tab', { name: 'Trajectory' })))
    const detail = () => screen.getByRole('complementary', { name: '事件详情' })
    await act(() => fireEvent.click(screen.getByRole('row', { name: /still streaming/ })))
    expect(within(detail()).getByText('等待中')).toBeTruthy()
    expect(within(detail()).queryByText('已完成')).toBeNull()
    await act(() => fireEvent.click(screen.getByRole('button', { name: '请求 #2 · 压缩' })))
    expect(within(detail()).getByText('等待中')).toBeTruthy()
    expect(within(detail()).queryByText('已压缩')).toBeNull()
  })
  it('activates only the selected standalone compaction section', async () => {
    const nodes: LegacyConversationSlice['nodes'] = [
      { kind: 'user', seq: 1, time: 1000, content: [], source: null },
      {
        kind: 'assistant', seq: 2, time: 2000, turn: 1, step: 1,
        blocks: [{ kind: 'text', text: 'before first compaction' }],
      },
      { kind: 'user', seq: 5, time: 5000, content: [], source: null },
      {
        kind: 'assistant', seq: 6, time: 6000, turn: 2, step: 1,
        blocks: [{ kind: 'text', text: 'between compactions' }],
      },
      { kind: 'user', seq: 9, time: 9000, content: [], source: null },
      {
        kind: 'assistant', seq: 10, time: 10000, turn: 3, step: 1,
        blocks: [{ kind: 'text', text: 'after second compaction' }],
      },
    ]
    const compactions: RequestView[] = [
      {
        purpose: 'compaction',
        startSeq: 3,
        turn: null,
        step: 0,
        startedAt: 3000,
        completedAt: 4000,
        status: 'complete',
        summary: [{ type: 'text', text: 'first standalone summary' }],
      },
      {
        purpose: 'compaction',
        startSeq: 7,
        turn: null,
        step: 0,
        startedAt: 7000,
        completedAt: 8000,
        status: 'complete',
        summary: [{ type: 'text', text: 'second standalone summary' }],
      },
    ]
    const b = await bench(historySnapshot(nodes, { requests: compactions }))
    await mount(b)
    await act(() => fireEvent.click(screen.getByRole('tab', { name: 'Trajectory' })))
    const firstRequest = screen.getByRole('button', { name: '请求 #2 · 压缩' })
    const secondRequest = screen.getByRole('button', { name: '请求 #4 · 压缩' })
    const firstSection = firstRequest.closest('tr')?.querySelector('span')
    const secondSection = secondRequest.closest('tr')?.querySelector('span')
    expect(firstSection?.textContent).toBe('轮次之间')
    expect(secondSection?.textContent).toBe('轮次之间')
    await act(() => fireEvent.click(firstRequest))
    expect(firstSection?.className).toMatch(/turnLabelActive/)
    expect(secondSection?.className).not.toMatch(/turnLabelActive/)
    expect(screen.getByText('请求 #2')).toBeTruthy()
    expect(screen.getByText('压缩 · 轮次之间')).toBeTruthy()
    await act(() => fireEvent.click(secondRequest))
    expect(firstSection?.className).not.toMatch(/turnLabelActive/)
    expect(secondSection?.className).toMatch(/turnLabelActive/)
    expect(screen.getByText('请求 #4')).toBeTruthy()
    expect(screen.getByText('压缩 · 轮次之间')).toBeTruthy()
  })
  it('dragging the overview focuses overlapping records without filtering the ledger', async () => {
    const b = await bench()
    await mount(b)
    await act(() => fireEvent.click(screen.getByRole('tab', { name: 'Trajectory' })))
    const plot = screen.getByLabelText('时间线概览；水平拖动可聚焦事件')
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 72, width: 100, height: 72,
      toJSON: () => ({}),
    })
    await act(() => fireEvent.pointerDown(plot, { button: 0, clientX: 55, pointerId: 1 }))
    await act(() => fireEvent.pointerMove(plot, { clientX: 95, pointerId: 1 }))
    await act(() => fireEvent.pointerUp(plot, { clientX: 95, pointerId: 1 }))
    expect(screen.getByRole('row', { name: /用户/ }).getAttribute('data-timeline-focus'))
      .toBe('outside')
    const tablePane = screen.getByRole('table').parentElement
    expect(tablePane).not.toBeNull()
    await act(() => fireEvent.click(tablePane as HTMLElement))
    expect(screen.getByRole('row', { name: /用户/ }).getAttribute('data-timeline-focus'))
      .toBeNull()
    await act(() => fireEvent.pointerDown(plot, { button: 0, clientX: 55, pointerId: 2 }))
    await act(() => fireEvent.pointerMove(plot, { clientX: 95, pointerId: 2 }))
    await act(() => fireEvent.pointerUp(plot, { clientX: 95, pointerId: 2 }))
    expect(screen.getByRole('row', { name: /用户/ }).getAttribute('data-timeline-focus'))
      .toBe('outside')
    await act(() => fireEvent.contextMenu(plot))
    expect(screen.getByRole('row', { name: /用户/ }).getAttribute('data-timeline-focus'))
      .toBe('outside')
  })
  it('clicking a timeline block clears the range, selects the record, and opens its inspector', async () => {
    const b = await bench()
    const view = await mount(b)
    await act(() => fireEvent.click(screen.getByRole('tab', { name: 'Trajectory' })))
    const plot = screen.getByLabelText('时间线概览；水平拖动可聚焦事件')
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 72, width: 100, height: 72,
      toJSON: () => ({}),
    })
    const toolSpan = view.container.querySelector<HTMLElement>('[data-timeline-span="tool"]')
    expect(toolSpan).not.toBeNull()
    const recordIndex = toolSpan?.dataset.timelineRecordIndex
    expect(recordIndex).toBeTruthy()
    await act(() => fireEvent.pointerMove(toolSpan as HTMLElement, { clientX: 50, pointerId: 1 }))
    expect(view.container.querySelector('[data-timeline-hover-line]')).toBeNull()
    expect(toolSpan?.getAttribute('data-hovered')).toBe('true')
    await act(() => fireEvent.pointerDown(plot, { button: 0, clientX: 5, pointerId: 1 }))
    await act(() => fireEvent.pointerMove(plot, { clientX: 95, pointerId: 1 }))
    await act(() => fireEvent.pointerUp(plot, { clientX: 95, pointerId: 1 }))
    expect(view.container.querySelector('tr[data-timeline-focus]')).toBeTruthy()
    await act(() => fireEvent.pointerDown(toolSpan as HTMLElement, {
      button: 0, clientX: 50, pointerId: 2,
    }))
    await act(() => fireEvent.pointerUp(toolSpan as HTMLElement, { clientX: 50, pointerId: 2 }))
    const selectedRow = view.container.querySelector<HTMLElement>(`tr[data-record-index="${recordIndex}"]`)
    expect(selectedRow?.getAttribute('aria-selected')).toBe('true')
    expect(view.container.querySelector('tr[data-timeline-focus]')).toBeNull()
    expect(screen.getByRole('complementary', { name: '事件详情' })).toBeTruthy()
  })
  it('empty window keeps the toolbar and reports no timing data', async () => {
    const b = await bench(historySnapshot([]))
    await mount(b)
    await act(() => fireEvent.click(screen.getByRole('tab', { name: 'Trajectory' })))
    expect(screen.getByRole('toolbar', { name: '轨迹工具栏' })).toBeTruthy()
    expect(screen.getByText('无计时数据')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', {
      name: '收起所有轮次',
    }).disabled).toBe(false)
    expect(screen.getByRole<HTMLButtonElement>('button', {
      name: '收起所有调用',
    }).disabled).toBe(false)
    expect(screen.queryByRole('row')).toBeNull()
    expect(screen.queryByText(/turns ·/)).toBeNull()
  })
})
describe('timeline projection', () => {
  const turns = [{
    turn: 1,
    groups: [{
      title: 'Step 1',
      cells: [
        { index: 1, kind: 'message', text: 'assistant', startedAt: 1000, timeSeconds: 1 },
        { index: 2, kind: 'tool', text: 'bash', startedAt: 2000, timeSeconds: 1 },
        { index: 3, kind: 'user', text: 'unknown', timeSeconds: 0 },
      ],
    }],
  }] satisfies readonly TrajectoryTurnModel[]
  const longTurns = [{
    turn: 1,
    groups: [{
      title: 'Step 1',
      cells: Array.from({ length: 10 }, (_, index) => ({
        index,
        kind: 'message' as const,
        text: `record ${index}`,
        timeSeconds: 1,
      })),
    }],
  }] satisfies readonly TrajectoryTurnModel[]
  it('splits assistant time into recorded TTFT and decoding proportions with a delayed tooltip', async () => {
    vi.useFakeTimers()
    try {
      const view = await (async () => {
        const nativeView = await render(h(TrajectoryTimeline, { 'turns': [{
          turn: 1,
          groups: [{
            title: 'Step 1',
            cells: [{
              index: 1,
              kind: 'message',
              text: 'assistant',
              startedAt: 1000,
              timeSeconds: 2,
              assistantMetrics: {
                timingRecorded: true,
                stepStartTime: 1000,
                firstTokenTime: 1500,
                completedTime: 3000,
                usageProvided: false,
                outputTokens: null,
              },
            }],
          }],
        }], 'mode': 'duration', 'range': null, 'onRangeChange': vi.fn() }))
        await act(() => { })
        return nativeView
      })()
      const span = view.container.querySelector<HTMLElement>('[data-timeline-span="message"]')
      expect(span?.getAttribute('title')).toBeNull()
      expect(span?.getAttribute('data-assistant-timing')).toBe('true')
      expect(span?.style.getPropertyValue('--trajectory-assistant-ttft')).toBe('25%')
      await act(() => fireEvent.pointerEnter(span as HTMLElement))
      await act(() => { vi.advanceTimersByTime(499) })
      expect(view.container.querySelector('[role="tooltip"]')).toBeNull()
      await act(() => { vi.advanceTimersByTime(1) })
      const tooltip = view.container.querySelector<HTMLElement>('[role="tooltip"]')
      expect(tooltip?.textContent).toContain('Total 2,000 ms')
      expect(tooltip?.textContent).toContain('TTFT 500 ms')
      expect(tooltip?.textContent).toContain('Decoding 1,500 ms')
    }
    finally {
      vi.useRealTimers()
    }
  })
  it('marks an unloaded history prefix without inventing timeline duration', async () => {
    const onLoadEarlier = vi.fn(() => new Promise<boolean>(() => { }))
    const view = await (async () => {
      const nativeView = await render(h(TrajectoryTimeline, { 'turns': turns, 'mode': 'sequence', 'range': null, 'hasEarlierRecords': true, 'onLoadEarlier': onLoadEarlier, 'onRangeChange': vi.fn() }))
      await act(() => { })
      return nativeView
    })()
    const boundary = screen.getByLabelText('Load earlier history')
    expect(boundary.getAttribute('data-earlier-history')).not.toBeNull()
    const plot = screen.getByLabelText('Timeline overview; drag horizontally to focus events')
    await act(() => fireEvent.pointerMove(plot, { clientX: 50, pointerId: 1 }))
    expect(view.container.querySelector('[data-timeline-hover-line]')).toBeTruthy()
    await act(() => fireEvent.pointerEnter(boundary))
    expect(view.container.querySelector('[data-timeline-hover-line]')).toBeNull()
    // Keyboard modality first: Tooltip suppresses focus arriving after a
    // pointer interaction, and earlier cases in this file press pointers.
    await act(() => fireEvent.keyDown(boundary, { key: 'Tab' }))
    await act(() => fireEvent.focus(boundary))
    expect(screen.getByRole('tooltip').textContent)
      .toContain('Click to load earlier history')
    await act(() => fireEvent.click(boundary))
    expect(onLoadEarlier).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Loading earlier history…')).toBeTruthy()
    await view.rerender(h(TrajectoryTimeline, { 'turns': turns, 'mode': 'sequence', 'range': null, 'onRangeChange': vi.fn() }))
    expect(screen.queryByLabelText('Load earlier history')).toBeNull()
    expect(screen.queryByLabelText('Loading earlier history')).toBeNull()
  })
  it('cancels native scrolling across the timeline while zooming', async () => {
    await (async () => {
      const nativeView = await render(h(TrajectoryTimeline, { 'turns': longTurns, 'mode': 'sequence', 'range': null, 'onRangeChange': vi.fn() }))
      await act(() => { })
      return nativeView
    })()
    const plot = screen.getByLabelText('Timeline overview; drag horizontally to focus events')
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      x: 44, y: 0, left: 44, top: 0, right: 144, bottom: 50, width: 100, height: 50,
      toJSON: () => ({}),
    })
    expect(await act(() => fireEvent.wheel(plot, { clientX: 94, deltaY: -100 }))).toBe(false)
    expect(await act(() => fireEvent.wheel(screen.getByText('Input'), {
      clientX: 20,
      deltaY: -100,
    }))).toBe(false)
  })
  it('scales sequence gutters with narrow operation spans', async () => {
    const view = await (async () => {
      const nativeView = await render(h(TrajectoryTimeline, { 'turns': longTurns, 'mode': 'sequence', 'range': null, 'onRangeChange': vi.fn() }))
      await act(() => { })
      return nativeView
    })()
    const span = view.container.querySelector<HTMLElement>('[data-timeline-span]')
    expect(span?.style.getPropertyValue('--trajectory-span-width')).toBe('10%')
    expect(span?.style.getPropertyValue('--trajectory-span-gap'))
      .toBe('min(0.8%, 1px)')
  })
  it('keeps dense sequence spans proportional before applying the pixel floor', async () => {
    const denseTurns = [{
      turn: 1,
      groups: [{
        title: 'Step 1',
        cells: Array.from({ length: 400 }, (_, index) => ({
          index,
          kind: 'message' as const,
          text: `message ${index}`,
          timeSeconds: 1,
        })),
      }],
    }]
    const view = await (async () => {
      const nativeView = await render(h(TrajectoryTimeline, { 'turns': denseTurns, 'mode': 'sequence', 'range': null, 'onRangeChange': vi.fn() }))
      await act(() => { })
      return nativeView
    })()
    const span = view.container.querySelector<HTMLElement>('[data-timeline-span]')
    expect(span?.style.getPropertyValue('--trajectory-span-width')).toBe('0.25%')
    expect(span?.style.getPropertyValue('--trajectory-span-gap'))
      .toBe('min(0.02%, 1px)')
  })
  it('clears the selection without changing zoom on a zoomed right click', async () => {
    const onRangeChange = vi.fn()
    const view = await (async () => {
      const nativeView = await render(h(TrajectoryTimeline, { 'turns': longTurns, 'mode': 'sequence', 'range': { start: 2, end: 4 }, 'hasEarlierRecords': true, 'onRangeChange': onRangeChange }))
      await act(() => { })
      return nativeView
    })()
    const plot = screen.getByLabelText('Timeline overview; drag horizontally to focus events')
    expect(screen.getByLabelText('Load earlier history')).toBeTruthy()
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 72, width: 100, height: 72,
      toJSON: () => ({}),
    })
    await act(() => fireEvent.wheel(plot, { clientX: 50, deltaY: -1000 }))
    expect(screen.queryByLabelText('Load earlier history')).toBeNull()
    const domain = view.container.querySelector<HTMLElement>('[data-timeline-domain]')
    const domainWidth = domain?.style.getPropertyValue('--trajectory-domain-width')
    expect(domainWidth).not.toBe('100%')
    await act(() => fireEvent.pointerDown(plot, { button: 2, clientX: 50, pointerId: 1 }))
    expect(await act(() => fireEvent.contextMenu(plot))).toBe(false)
    await act(() => fireEvent.pointerUp(plot, { button: 2, clientX: 50, pointerId: 1 }))
    expect(onRangeChange).toHaveBeenCalledOnce()
    expect(onRangeChange).toHaveBeenCalledWith(null)
    expect(domain?.style.getPropertyValue('--trajectory-domain-width')).toBe(domainWidth)
  })
  it('clears the selection and suppresses the context menu at full zoom', async () => {
    const onRangeChange = vi.fn()
    await (async () => {
      const nativeView = await render(h(TrajectoryTimeline, { 'turns': longTurns, 'mode': 'sequence', 'range': { start: 2, end: 4 }, 'onRangeChange': onRangeChange }))
      await act(() => { })
      return nativeView
    })()
    const plot = screen.getByLabelText('Timeline overview; drag horizontally to focus events')
    await act(() => fireEvent.pointerDown(plot, { button: 2, clientX: 50, pointerId: 1 }))
    expect(await act(() => fireEvent.contextMenu(plot))).toBe(false)
    await act(() => fireEvent.pointerUp(plot, { button: 2, clientX: 50, pointerId: 1 }))
    expect(onRangeChange).toHaveBeenCalledOnce()
    expect(onRangeChange).toHaveBeenCalledWith(null)
  })
  it('pans the zoomed viewport with a right-button drag without changing the selection', async () => {
    const onRangeChange = vi.fn()
    const view = await (async () => {
      const nativeView = await render(h(TrajectoryTimeline, { 'turns': longTurns, 'mode': 'sequence', 'range': { start: 2, end: 4 }, 'onRangeChange': onRangeChange }))
      await act(() => { })
      return nativeView
    })()
    const plot = screen.getByLabelText('Timeline overview; drag horizontally to focus events')
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 72, width: 100, height: 72,
      toJSON: () => ({}),
    })
    await act(() => fireEvent.wheel(plot, { clientX: 50, deltaY: -1000 }))
    const domain = view.container.querySelector<HTMLElement>('[data-timeline-domain]')
    const before = domain?.style.getPropertyValue('--trajectory-domain-left')
    await act(() => fireEvent.pointerDown(plot, { button: 2, clientX: 50, pointerId: 1 }))
    expect(plot.getAttribute('data-panning')).toBe('true')
    expect(await act(() => fireEvent.contextMenu(plot))).toBe(false)
    await act(() => fireEvent.pointerMove(plot, { buttons: 2, clientX: 75, pointerId: 1 }))
    await act(() => fireEvent.pointerUp(plot, { button: 2, clientX: 75, pointerId: 1 }))
    expect(domain?.style.getPropertyValue('--trajectory-domain-left')).not.toBe(before)
    expect(onRangeChange).not.toHaveBeenCalled()
    expect(plot.getAttribute('data-panning')).toBeNull()
  })
  it('pans the zoomed viewport only far enough to reveal a newly selected record', async () => {
    const onRangeChange = vi.fn()
    const view = await (async () => {
      const nativeView = await render(h(TrajectoryTimeline, { 'turns': longTurns, 'mode': 'sequence', 'range': null, 'onRangeChange': onRangeChange }))
      await act(() => { })
      return nativeView
    })()
    const plot = screen.getByLabelText('Timeline overview; drag horizontally to focus events')
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 72, width: 100, height: 72,
      toJSON: () => ({}),
    })
    await act(() => fireEvent.wheel(plot, { clientX: 50, deltaY: -1000 }))
    await view.rerender(h(TrajectoryTimeline, { 'turns': longTurns, 'mode': 'sequence', 'range': null, 'selectedIndex': 1, 'onRangeChange': onRangeChange }))
    await vi.waitFor(() => {
      const domain = view.container.querySelector<HTMLElement>('[data-timeline-domain]')
      expect(domain?.style.getPropertyValue('--trajectory-domain-left')).toBe('-25%')
    })
    await view.rerender(h(TrajectoryTimeline, { 'turns': longTurns, 'mode': 'sequence', 'range': null, 'selectedIndex': 8, 'onRangeChange': onRangeChange }))
    await vi.waitFor(() => {
      const domain = view.container.querySelector<HTMLElement>('[data-timeline-domain]')
      expect(domain?.style.getPropertyValue('--trajectory-domain-left')).toBe('-125%')
    })
  })
  it('auto-pans a zoomed viewport while a range drag pushes against an edge', async () => {
    const onRangeChange = vi.fn()
    const view = await (async () => {
      const nativeView = await render(h(TrajectoryTimeline, { 'turns': longTurns, 'mode': 'sequence', 'range': null, 'onRangeChange': onRangeChange }))
      await act(() => { })
      return nativeView
    })()
    const plot = screen.getByLabelText('Timeline overview; drag horizontally to focus events')
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 72, width: 100, height: 72,
      toJSON: () => ({}),
    })
    await act(() => fireEvent.wheel(plot, { clientX: 50, deltaY: -1000 }))
    await act(() => fireEvent.pointerDown(plot, { button: 0, clientX: 50, pointerId: 1 }))
    for (let index = 0; index < 24; index++) {
      await act(() => fireEvent.pointerMove(plot, { clientX: 99, pointerId: 1 }))
    }
    const draftSelection = view.container.querySelectorAll<HTMLElement>('[data-dragging="true"]')
    expect(draftSelection).toHaveLength(2)
    for (const overlay of draftSelection) {
      expect(Number.parseFloat(overlay.style.getPropertyValue('--trajectory-selection-left'))).toBeLessThan(0)
    }
    await act(() => fireEvent.pointerUp(plot, { clientX: 99, pointerId: 1 }))
    const selectedRange = onRangeChange.mock.calls.at(-1)?.[0] as {
      start: number
      end: number
    } | undefined
    const fullRange = deriveTrajectoryTimeline(longTurns)
    expect(selectedRange).toBeDefined()
    expect(fullRange).not.toBeNull()
    expect((selectedRange?.end ?? 0) - (selectedRange?.start ?? 0)).toBeGreaterThan(4)
    expect(selectedRange?.start).toBeGreaterThanOrEqual(fullRange?.start ?? 0)
    expect(selectedRange?.end).toBeLessThanOrEqual(fullRange?.end ?? 0)
  })
  it('uses equal-width operation slots and stable semantic lanes', () => {
    expect(deriveTrajectoryTimeline(turns)).toEqual({
      start: 0,
      end: 3,
      spans: [
        {
          index: 1, isError: false, kind: 'message', label: 'assistant',
          lane: 1, start: 0, end: 1,
        },
        {
          index: 2, isError: false, kind: 'tool', label: 'bash',
          lane: 2, start: 1, end: 2,
        },
        {
          index: 3, isError: false, kind: 'user', label: 'unknown',
          lane: 0, start: 2, end: 3,
        },
      ],
      turnBoundaries: [{ turn: 1, time: 0 }],
    })
  })
  it('marks error records directly on timeline spans', async () => {
    const errorTurns = [{
      turn: 1,
      groups: [{
        title: 'Step 1',
        cells: [{
          index: 1,
          kind: 'tool' as const,
          text: 'failed tool',
          timeSeconds: 0.1,
          isError: true,
        }],
      }],
    }] satisfies readonly TrajectoryTurnModel[]
    const view = await (async () => {
      const nativeView = await render(h(TrajectoryTimeline, { 'turns': errorTurns, 'mode': 'sequence', 'range': null, 'onRangeChange': () => { } }))
      await act(() => { })
      return nativeView
    })()
    expect(view.container.querySelector('[data-timeline-span="tool"][data-error="true"]')).toBeTruthy()
  })
  it('ignores durations and idle gaps while retaining turn boundaries', () => {
    const separatedTurns = [
      {
        turn: 1,
        groups: [{
          title: 'Step 1',
          cells: [
            { index: 1, kind: 'message', text: 'first', startedAt: 1000, timeSeconds: 1 },
            { index: 2, kind: 'tool', text: 'within-turn gap', startedAt: 4000, timeSeconds: 1 },
          ],
        }],
      },
      {
        turn: 2,
        groups: [{
          title: 'Step 1',
          cells: [
            { index: 3, kind: 'message', text: 'after user idle', startedAt: 40000, timeSeconds: 1 },
          ],
        }],
      },
    ] satisfies readonly TrajectoryTurnModel[]
    expect(deriveTrajectoryTimeline(separatedTurns)).toMatchObject({
      start: 0,
      end: 3,
      spans: [
        { index: 1, start: 0, end: 1 },
        { index: 2, start: 1, end: 2 },
        { index: 3, start: 2, end: 3 },
      ],
      turnBoundaries: [
        { turn: 1, time: 0 },
        { turn: 2, time: 2 },
      ],
    })
  })
  it('compresses every idle gap in duration mode while actual mode retains wall time', () => {
    const separatedTurns = [
      {
        turn: 1,
        groups: [{
          title: 'Step 1',
          cells: [
            { index: 1, kind: 'message', text: 'first', startedAt: 1000, timeSeconds: 1 },
            { index: 2, kind: 'tool', text: 'within-turn gap', startedAt: 4000, timeSeconds: 1 },
          ],
        }],
      },
      {
        turn: 2,
        groups: [{
          title: 'Step 1',
          cells: [
            { index: 3, kind: 'message', text: 'after user idle', startedAt: 40000, timeSeconds: 1 },
          ],
        }],
      },
    ] satisfies readonly TrajectoryTurnModel[]
    expect(deriveTrajectoryTimeline(separatedTurns, 'duration')).toMatchObject({
      start: 1000,
      end: 4000,
      spans: [
        { index: 1, start: 1000, end: 2000 },
        { index: 2, start: 2000, end: 3000 },
        { index: 3, start: 3000, end: 4000 },
      ],
      turnBoundaries: [
        { turn: 1, time: 1000 },
        { turn: 2, time: 3000 },
      ],
    })
    expect(deriveTrajectoryTimeline(separatedTurns, 'actual')).toMatchObject({
      start: 1000,
      end: 41000,
      spans: [
        { index: 1, start: 1000, end: 2000 },
        { index: 2, start: 4000, end: 5000 },
        { index: 3, start: 40000, end: 41000 },
      ],
    })
  })
  it('projects between-turn compaction without inventing a turn boundary', () => {
    const withStandaloneCompaction = [
      {
        turn: 1,
        groups: [{
          title: 'Step 1',
          cells: [{ index: 1, kind: 'message', text: 'before', timeSeconds: 0 }],
        }],
      },
      {
        turn: null,
        groups: [{
          title: 'Compaction 3',
          cells: [{ index: 2, kind: 'compacted', text: 'summary', timeSeconds: 0 }],
        }],
      },
      {
        turn: 2,
        groups: [{
          title: 'Step 1',
          cells: [{ index: 3, kind: 'message', text: 'after', timeSeconds: 0 }],
        }],
      },
    ] satisfies readonly TrajectoryTurnModel[]
    expect(deriveTrajectoryTimeline(withStandaloneCompaction)).toMatchObject({
      spans: [
        { index: 1, start: 0, end: 1 },
        { index: 2, start: 1, end: 2 },
        { index: 3, start: 2, end: 3 },
      ],
      turnBoundaries: [
        { turn: 1, time: 0 },
        { turn: 2, time: 2 },
      ],
    })
  })
  it('empty inputs produce no model and the standalone view reports its empty form', async () => {
    expect(deriveTrajectoryTimeline([])).toBeNull()
    await (async () => {
      const nativeView = await render(h(TrajectoryView, {
        ...standaloneProps([]),
        ...standaloneHistory(historySnapshot([])),
        ...standaloneDuration(),
      }))
      await act(() => { })
      return nativeView
    })()
    expect(screen.getByRole('toolbar', { name: '轨迹工具栏' })).toBeTruthy()
    expect(screen.queryByRole('row')).toBeNull()
  })
})
describe('TrajectoryView state', () => {
  const nestedCallNodes: LegacyConversationSlice['nodes'] = [
    { kind: 'user', seq: 1, time: 1000, content: [], source: null },
    {
      kind: 'assistant', seq: 2, time: 2000, turn: 1, step: 1,
      blocks: [
        { kind: 'text', text: 'parent assistant' },
        { kind: 'tool-call', callId: 'root', name: 'run_code', argsRaw: '{}' },
        { kind: 'tool-call', callId: 'sibling', name: 'write', argsRaw: '{}' },
      ],
    },
    {
      kind: 'tool-result', seq: 3, time: 4000, callId: 'root',
      name: 'run_code', args: PartialArguments.fromText('{}'),
      call: { name: 'run_code', argsRaw: '{}' }, callTime: 2100,
      content: [], isError: false,
      subCalls: [{
        phase: 'start', args: PartialArguments.fromText('{}'),
        callId: 'first-child', parentCallId: 'root', name: 'bash', argsRaw: '{}',
        turn: 1, step: 1, time: 2200, subCalls: [],
      }, {
        phase: 'start', args: PartialArguments.fromText('{}'),
        callId: 'child', parentCallId: 'root', name: 'read', argsRaw: '{}',
        turn: 1, step: 1, time: 2300,
        subCalls: [{
          phase: 'start', args: PartialArguments.fromText('{}'),
          callId: 'grandchild', parentCallId: 'child', name: 'grep', argsRaw: '{}',
          turn: 1, step: 1, time: 2400, subCalls: [],
        }],
      }],
    },
    {
      kind: 'tool-result', seq: 4, time: 5000, callId: 'sibling',
      name: 'write', args: PartialArguments.fromText('{}'),
      call: { name: 'write', argsRaw: '{}' }, callTime: 2100,
      content: [], isError: false, subCalls: [],
    },
  ]
  it('folds only descendants, searches them, and reveals a requested grandchild through every fold', async () => {
    const nodes = nestedCallNodes
    const props = {
      ...standaloneProps(nodes),
      ...standaloneHistory(historySnapshot(nodes)),
      ...standaloneDuration(),
    }
    const view = await (async () => {
      const nativeView = await render(h(TrajectoryView, { ...props }))
      await act(() => { })
      return nativeView
    })()
    const collapse = screen.getByRole('button', { name: '收起所有子调用' })
    expect(screen.getByRole('button', { name: '收起所有调用' }).nextElementSibling).toBe(collapse)
    expect(screen.getByRole('row', { name: /子工具.*bash/ })).toBeTruthy()
    await act(() => fireEvent.click(collapse))
    expect(screen.queryByRole('row', { name: /子工具.*bash/ })).toBeNull()
    expect(screen.getByRole('row', { name: /工具.*run_code/ })).toBeTruthy()
    expect(screen.getByRole('row', { name: /工具.*write/ })).toBeTruthy()
    expect(screen.getByRole('row', { name: /收起的子调用/ }).textContent).toBe('…3 个工具调用 · bash, read, grep')
    await act(() => fireEvent.click(screen.getByRole('button', { name: '展开所有子调用' })))
    expect(screen.getByRole('row', { name: /子工具.*bash/ })).toBeTruthy()
    await act(() => fireEvent.click(screen.getByRole('button', { name: '收起所有子调用' })))
    await act(() => fireEvent.keyDown(screen.getByRole('row', { name: /收起的子调用/ }), { key: 'Enter' }))
    expect(screen.getByRole('row', { name: /子工具.*bash/ })).toBeTruthy()
    await act(() => fireEvent.click(screen.getByRole('button', { name: '收起所有子调用' })))
    await act(() => fireEvent.input(screen.getByRole('searchbox', { name: '搜索轨迹' }), { target: { value: 'bash' } }))
    expect(screen.getByRole('row', { name: /子工具.*bash/ })).toBeTruthy()
    await act(() => fireEvent.input(screen.getByRole('searchbox', { name: '搜索轨迹' }), { target: { value: '' } }))
    expect(screen.queryByRole('row', { name: /子工具.*bash/ })).toBeNull()
    await act(() => fireEvent.click(screen.getByRole('button', { name: '收起所有调用' })))
    await act(() => fireEvent.click(screen.getByRole('button', { name: '收起所有轮次' })))
    await view.rerender(h(TrajectoryView, { ...props, 'viewRequest': { view: 'trajectory', focus: 'grandchild' } }))
    expect(screen.getByRole('row', { name: /子工具.*grep/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('row', { name: /收起的/ })).toBeNull()
  })
  it.each(['click', 'Enter', ' '])('expands a subcall summary with %j', async (activation) => {
    await (async () => {
      const nativeView = await render(h(TrajectoryView, { ...standaloneProps(nestedCallNodes),
        ...standaloneHistory(historySnapshot(nestedCallNodes)), ...standaloneDuration() }))
      await act(() => { })
      return nativeView
    })()
    await act(() => fireEvent.click(screen.getByRole('button', { name: '收起所有子调用' })))
    const summary = screen.getByRole('row', { name: /收起的子调用.*3 个工具调用/ })
    expect(summary.tabIndex).toBe(0)
    if (activation === 'click')
      await act(() => fireEvent.click(summary))
    else
      await act(() => fireEvent.keyDown(summary, { key: activation }))
    expect(screen.getAllByRole('row', { name: /子工具/ })).toHaveLength(3)
    expect(screen.queryByRole('row', { name: /收起的子调用/ })).toBeNull()
  })
  it.each([
    { outer: ['轮次'] },
    { outer: ['调用'] },
    { outer: ['调用', '轮次'] },
  ])('preserves subcall folding through outer folds $outer', async ({ outer }) => {
    await (async () => {
      const nativeView = await render(h(TrajectoryView, { ...standaloneProps(nestedCallNodes),
        ...standaloneHistory(historySnapshot(nestedCallNodes)), ...standaloneDuration() }))
      await act(() => { })
      return nativeView
    })()
    await act(() => fireEvent.click(screen.getByRole('button', { name: '收起所有子调用' })))
    for (const kind of outer) {
      await act(() => fireEvent.click(screen.getByRole('button', { name: `收起所有${kind}` })))
    }
    expect(screen.getAllByRole('row', { name: /收起的/ })).toHaveLength(1)
    expect(screen.queryByRole('row', { name: /收起的子调用/ })).toBeNull()
    for (const kind of outer.toReversed()) {
      await act(() => fireEvent.click(screen.getByRole('button', { name: `展开所有${kind}` })))
    }
    expect(screen.getByRole('row', { name: /收起的子调用/ })).toBeTruthy()
    expect(screen.getByRole('row', { name: /工具.*write/ })).toBeTruthy()
    expect(screen.queryByRole('row', { name: /子工具/ })).toBeNull()
  })
  it.each([
    { interrupted: true, status: '失败' },
    { interrupted: false, status: '已完成' },
  ])('uses the settled response status when the Step start is unloaded: $status', async ({ interrupted, status }) => {
    const nodes: LegacyConversationSlice['nodes'] = [{
      kind: 'assistant', seq: 10, time: 10000, turn: 2, step: 3,
      blocks: [{ kind: 'text', text: 'loaded response' }],
      ...(interrupted ? { interrupted: true } : {}),
    }]
    await (async () => {
      const nativeView = await render(h(TrajectoryView, { ...standaloneProps(nodes), ...standaloneHistory(
        historySnapshot(nodes)), ...standaloneDuration() }))
      await act(() => { })
      return nativeView
    })()
    await act(() => fireEvent.click(screen.getByRole('row', { name: /loaded response/ })))
    expect(within(screen.getByRole('tabpanel')).getByText(status)).toBeTruthy()
    await act(() => fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: '请求 #1' })))
    expect(within(screen.getByRole('tabpanel')).getByText(status)).toBeTruthy()
    await act(() => fireEvent.click(screen.getByRole('button', { name: '助手消息' })))
    expect(within(screen.getByRole('tabpanel')).getByText(status)).toBeTruthy()
  })
  it('reveals resident history one bounded page at a time', async () => {
    const nodes: LegacyConversationSlice['nodes'] = Array.from({ length: 5000 }, (_, index) => ({
      kind: 'user' as const,
      seq: index + 1,
      time: index + 1,
      content: [{ type: 'text' as const, text: `prompt ${String(index + 1)}` }],
      source: null,
    }))
    const trajectory = createSnapshotStore(historySnapshot([]))
    const loadOlder = vi.fn(() => Promise.resolve(false))
    await (async () => {
      const nativeView = await render(h(TrajectoryView, { ...standaloneProps([]), ...standaloneHistory(historySnapshot(nodes)), ...standaloneDuration(), 'useTrajectory': bindSnapshotSelector(trajectory), 'loadOlder': loadOlder }))
      await act(() => { })
      return nativeView
    })()
    await act(() => { trajectory.set(historySnapshot(nodes)) })
    expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('51')
    await act(() => fireEvent.click(screen.getAllByRole('button', { name: '加载更早的历史' }).at(-1)!))
    expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('101')
    expect(loadOlder).not.toHaveBeenCalled()
    await act(() => {
      trajectory.set(historySnapshot([...nodes, {
        kind: 'user', seq: 5001, time: 5001,
        content: [{ type: 'text', text: 'appended prompt' }], source: null,
      }]))
    })
    expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('102')
  })
  it('keeps a replacement window bounded when its predecessor tail is absent', async () => {
    const nodes = (start: number): LegacyConversationSlice['nodes'] => Array.from({ length: 100 }, (_, index) => ({
      kind: 'user' as const,
      seq: start + index,
      time: start + index,
      content: [],
      source: null,
    }))
    const trajectory = createSnapshotStore(historySnapshot(nodes(1)))
    await (async () => {
      const nativeView = await render(h(TrajectoryView, { ...standaloneProps([]), ...standaloneHistory(historySnapshot([])), ...standaloneDuration(), 'useTrajectory': bindSnapshotSelector(trajectory) }))
      await act(() => { })
      return nativeView
    })()
    expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('51')
    await act(() => { trajectory.set(historySnapshot(nodes(201))) })
    expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('51')
  })
  it('keeps resident request numbering and cumulative usage outside the layout page', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    })
    const visibleNodes: LegacyConversationSlice['nodes'] = Array.from({ length: 10 }, (_, index) => ({
      kind: 'assistant' as const,
      seq: index * 2 + 44,
      time: index * 2 + 44,
      turn: index + 2,
      step: 1,
      blocks: [{ kind: 'text' as const, text: `visible response ${String(index + 1)}` }],
    }))
    const nodes: LegacyConversationSlice['nodes'] = [{
      kind: 'assistant', seq: 2, time: 2, turn: 1, step: 1,
      blocks: [{ kind: 'tool-call', callId: 'boundary-call', name: 'bash', argsRaw: '{}' }],
    }, {
      kind: 'tool-result', seq: 3, time: 3, callId: 'boundary-call',
      name: 'bash', args: PartialArguments.fromText('{}'),
      call: { name: 'bash', argsRaw: '{}' }, callTime: 2,
      content: [], isError: false, subCalls: [],
    }, ...Array.from({ length: 39 }, (_, index) => ({
      kind: 'compaction' as const,
      seq: index + 4,
      time: index + 4,
      summary: null,
      summaryEventSeq: null,
      shadowedItemCount: null,
      shadowedTokenCount: null,
    })), ...visibleNodes]
    const requests: readonly RequestView[] = [{
      purpose: 'assistant', startSeq: 1, resultSeq: 2, startedAt: 1, completedAt: 2,
      status: 'complete', turn: 1, step: 1, usage: { inputTokens: 1 },
    }, ...visibleNodes.map((node, index) => ({
      purpose: 'assistant' as const,
      startSeq: node.seq - 1,
      resultSeq: node.seq,
      startedAt: node.seq - 1,
      completedAt: node.seq,
      status: 'complete' as const,
      turn: index + 2,
      step: 1,
      usage: { inputTokens: 1 },
    }))]
    await (async () => {
      const nativeView = await render(h(TrajectoryView, { ...standaloneProps([]), ...standaloneHistory(
        historySnapshot(nodes, { requests })), ...standaloneDuration() }))
      await act(() => { })
      return nativeView
    })()
    await waitFor(() => { expect(screen.getByRole('button', { name: '请求 #1' })).toBeTruthy() })
    await waitFor(() => { expect(screen.getByRole('button', { name: '请求 #11' })).toBeTruthy() })
    await act(() => fireEvent.click(screen.getByRole('button', { name: '请求 #11' })))
    await act(() => fireEvent.click(screen.getByRole('tab', { name: '用量' })))
    expect(screen.getByText('会话累计').closest('section')?.textContent).toContain('11 tok')
  })
  it.each([
    ['root', {
      kind: 'assistant' as const,
      seq: 3,
      time: 3,
      turn: 1,
      step: 1,
      blocks: [{ kind: 'tool-call' as const, callId: 'hidden-root', name: 'bash', argsRaw: '{}' }],
    }, 'hidden-root'],
    ['nested', {
      kind: 'tool-result' as const,
      seq: 3,
      time: 3,
      callId: 'hidden-root',
      name: 'run_code', args: PartialArguments.fromText('{}'),
      call: { name: 'run_code', argsRaw: '{}' },
      callTime: 2,
      content: [],
      isError: false,
      subCalls: [{
        phase: 'start' as const, args: PartialArguments.fromText('{}'), callId: 'hidden-child', parentCallId: 'hidden-root', name: 'bash', argsRaw: '{}',
        turn: 1, step: 1, time: 3, subCalls: [],
      }],
    }, 'hidden-child'],
  ])('reveals a hidden resident %s call for cross-view inspection', async (_kind, target, focus) => {
    const nodes: LegacyConversationSlice['nodes'] = [
      { kind: 'user', seq: 1, time: 1, content: [], source: null },
      {
        kind: 'tool-result', seq: 2, time: 2, callId: 'unrelated', call: null, callTime: null,
        name: '', args: PartialArguments.EMPTY,
        content: [], isError: false, subCalls: [],
      },
      target,
      ...Array.from({ length: 50 }, (_, index) => ({
        kind: 'user' as const,
        seq: index + 4,
        time: index + 4,
        content: [{ type: 'text' as const, text: `later ${String(index + 1)}` }],
        source: null,
      })),
    ]
    const completeViewRequest = vi.fn()
    await (async () => {
      const nativeView = await render(h(TrajectoryView, { ...standaloneProps([]), ...standaloneHistory(historySnapshot(nodes)), ...standaloneDuration(), 'viewRequest': { view: 'trajectory', focus }, 'completeViewRequest': completeViewRequest }))
      await act(() => { })
      return nativeView
    })()
    expect(completeViewRequest).toHaveBeenCalledOnce()
  })
  it('persists the duration preference through the runtime snapshot-store seam', async () => {
    const firstDuration = createTrajectoryDurationStore()
    const commonProps = {
      ...standaloneProps(NODES),
      ...standaloneHistory(historySnapshot(NODES)),
    }
    const first = await (async () => {
      const nativeView = await render(h(TrajectoryView, { ...commonProps, ...standaloneDuration(), 'useDuration': bindSnapshotSelector(firstDuration), 'setActualDuration': (value) => { firstDuration.set(value) } }))
      await act(() => { })
      return nativeView
    })()
    const duration = screen.getByRole('button', { name: '使用实际时长' })
    expect(duration.getAttribute('aria-pressed')).toBe('false')
    await act(() => fireEvent.click(duration))
    expect(localStorage.getItem('dsh.trajectory.duration')).toBe('true')
    first.unmount()
    const restoredDuration = createTrajectoryDurationStore()
    await (async () => {
      const nativeView = await render(h(TrajectoryView, { ...commonProps, ...standaloneDuration(), 'useDuration': bindSnapshotSelector(restoredDuration), 'setActualDuration': (value) => { restoredDuration.set(value) } }))
      await act(() => { })
      return nativeView
    })()
    expect(screen.getByRole('button', { name: '使用实际时长' }).getAttribute('aria-pressed'))
      .toBe('true')
  })
  it('keeps ledger and timeline selection on the same event after prepend', async () => {
    const older: LegacyConversationSlice['nodes'][number] = {
      kind: 'user', seq: 1, time: 1000,
      content: [{ type: 'text', text: 'older prompt' }], source: null,
    }
    const current: LegacyConversationSlice['nodes'][number] = {
      kind: 'assistant', seq: 100, time: 5000, turn: 2, step: 1,
      blocks: [{ kind: 'text', text: 'selected current response' }],
    }
    const store = createSnapshotStore(historySnapshot([current]))
    const view = await (async () => {
      const nativeView = await render(h(TrajectoryView, { ...standaloneProps([]), ...standaloneHistory(historySnapshot([])), ...standaloneDuration(), 'useTrajectory': bindSnapshotSelector(store), 'loadOlder': vi.fn(() => Promise.resolve(false)) }))
      await act(() => { })
      return nativeView
    })()
    await act(() => fireEvent.click(screen.getByRole('row', { name: /selected current response/ })))
    await act(() => { store.set(historySnapshot([older, current])) })
    const row = screen.getByRole('row', { name: /selected current response/ })
    expect(row.getAttribute('aria-selected')).toBe('true')
    const currentIndex = row.getAttribute('data-record-index')
    expect(view.container.querySelector(`[data-timeline-record-index="${currentIndex}"][data-current="true"]`)).toBeTruthy()
  })
})
