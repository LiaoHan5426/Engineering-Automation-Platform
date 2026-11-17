import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client'
import { getQueriesForElement } from '@testing-library/dom'
import type { SessionAreaProps, GlobalStandardProps, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { TabId, PaneId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SubagentChatResource } from '../src/client/sidebar-chat/index.tsx'
// @vitest-environment jsdom
import { h, computed, ref, shallowRef, defineComponent, watch } from 'vue'
const revision = ref(0)
import { cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import { afterEach, describe, expect, it, vi, onTestFinished } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions, SessionListState, SessionReference, SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ResourceSnapshot, ResourceProvider } from '@deepseek-ai/dsh-client-resources/client'
import { SlotTestRuntime, conversationSnapshot, sessionSnapshot } from '@deepseek-ai/dsh-client-test-runtime'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarRightTabInfo, SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SubagentAddress } from '@deepseek-ai/dsh-subagent/client'
import { ConversationSlotPanel, FixedChatConversationView, parseSubagentChatAddress, registerSidebarChat, subagentChatAddress, SUBAGENT_CHAT_ID, type SidebarChatTabProps } from '../src/client/sidebar-chat/index.tsx'
import { SidebarChatTab } from '../src/client/sidebar-chat/index.tsx'
const PARENT = 'parent/a' as SessionId
const CHILD = 'child#1' as SessionId
const ADDRESS: SubagentAddress = {
  parentSessionId: PARENT,
  childSessionId: CHILD,
  mode: 'continuable',
}
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
describe('Sidebar chat address', () => {
  it('round-trips the child identity and direct-parent routing metadata', () => {
    const resource = subagentChatAddress(ADDRESS)
    expect(resource).toBe('dsh-resource://subagentchat/session/child%231?parent=parent%2Fa&mode=continuable')
    expect(parseSubagentChatAddress(resource)).toEqual(ADDRESS)
    expect(parseSubagentChatAddress(subagentChatAddress({ ...ADDRESS, mode: 'one-shot' })))
      .toEqual({ ...ADDRESS, mode: 'one-shot' })
    expect(parseSubagentChatAddress(subagentChatAddress({ ...ADDRESS, mode: 'unknown' })))
      .toEqual({ ...ADDRESS, mode: 'unknown' })
  })
  it.each([
    'not an address',
    'https://chat/session/child?parent=parent&mode=continuable',
    'dsh-resource://other/session/child?parent=parent&mode=continuable',
    'dsh-resource://subagentchat/other/child?parent=parent&mode=continuable',
    'dsh-resource://subagentchat/session/child?mode=continuable',
    'dsh-resource://subagentchat/session/child?parent=&mode=continuable',
    'dsh-resource://subagentchat/session/child?parent=parent&mode=invalid',
    'dsh-resource://subagentchat/session/%?parent=parent&mode=continuable',
  ])('rejects %s', (address) => {
    expect(parseSubagentChatAddress(address)).toBeUndefined()
  })
})
describe('Sidebar chat registration', () => {
  it('registers the resource, tab, and child slot and retains the child for the resource lifetime', async () => {
    const release = vi.fn()
    const reference = {
      sessionId: CHILD,
      ready: Promise.resolve(undefined),
      release,
      [Symbol.dispose]: release,
    } as unknown as SessionReference
    const retain = vi.fn(() => reference)
    const refreshProjections = vi.fn(() => Promise.resolve())
    const list = {
      getSnapshot: () => ({
        ids: [],
        byId: {
          [CHILD]: {
            displayTitle: 'Projected title',
            projectionValues: { subagent: { mode: 'continuable', label: 'Worker', seq: 1 } },
          },
        },
        phase: 'ready',
        projectionsBySession: {},
        jobsBySession: {},
      } as unknown as SessionListState),
      subscribe: () => () => { },
    }
    let provider: ResourceProvider<'subagentchat'> | undefined
    let definition: SidebarRightTabDefinition | undefined
    const registrations: {
      options: Record<string, unknown>
      component: unknown
    }[] = []
    const ctx = {
      sessions: { retain, refreshProjections, list } as unknown as ISessions,
      resources: { register: (value: ResourceProvider<'subagentchat'>) => { provider = value; return () => { } } },
      sidebarRightTabs: { register: (value: SidebarRightTabDefinition) => { definition = value; return () => { } } },
      slots: {
        inject: (_name: string, install: () => () => void) => install(),
        register: (options: Record<string, unknown>, component: unknown) => {
          registrations.push({ options, component })
          return () => { }
        },
      },
      effect: (install: () => unknown) => { install(); return () => { } },
    } as unknown as Context
    registerSidebarChat(ctx, (key: string) => key === 'sidebar.chat' ? 'Chat' : key)
    expect(definition?.id).toBe(SUBAGENT_CHAT_ID)
    expect(definition?.kind).toBe('subagentchat')
    expect(definition?.canOpen?.(subagentChatAddress(ADDRESS))).toBe(true)
    expect(definition?.canOpen?.('dsh-resource://subagentchat/invalid')).toBe(false)
    expect(definition?.title(subagentChatAddress(ADDRESS))).toBe('Worker')
    expect(definition?.title(subagentChatAddress({ ...ADDRESS, childSessionId: 'unknown' as SessionId }))).toBe('unknown')
    expect(definition?.title('invalid')).toBe('Chat')
    expect(registrations.map(entry => entry.options.name)).toEqual([
      'sidebar.right.pane.tab',
      'sidebar.chat.conversation',
    ])
    const controller = new AbortController()
    const stream = provider!.open(subagentChatAddress(ADDRESS), { signal: controller.signal })[Symbol.asyncIterator]()
    expect(await stream.next()).toEqual({ done: false, value: { ok: true, value: { address: ADDRESS, reference } } })
    expect(refreshProjections).not.toHaveBeenCalled()
    expect(retain).toHaveBeenCalledWith(ADDRESS, { source: 'sidebarChat', signal: controller.signal })
    const completion = stream.next()
    await Promise.resolve()
    controller.abort()
    expect(await completion).toEqual({ done: true, value: undefined })
    expect(release).toHaveBeenCalledOnce()
    const abortedAfterYield = new AbortController()
    const yielded = provider!.open(subagentChatAddress(ADDRESS), { signal: abortedAfterYield.signal })[Symbol.asyncIterator]()
    expect((await yielded.next()).done).toBe(false)
    abortedAfterYield.abort()
    expect(await yielded.next()).toEqual({ done: true, value: undefined })
    expect(release).toHaveBeenCalledTimes(2)
    const alreadyAborted = new AbortController()
    alreadyAborted.abort()
    const stopped = provider!.open(subagentChatAddress(ADDRESS), { signal: alreadyAborted.signal })[Symbol.asyncIterator]()
    expect(await stopped.next()).toEqual({ done: true, value: undefined })
    expect(retain).toHaveBeenCalledTimes(2)
    expect(release).toHaveBeenCalledTimes(2)
    const invalid = provider!.open('invalid', { signal: new AbortController().signal })[Symbol.asyncIterator]()
    await expect(invalid.next()).rejects.toThrow('invalid chat resource address')
  })
})
function unconsumedSeat(): never {
  throw new Error('This sidebar chat fixture does not consume this standard seat')
}
const standardProps = {
  sessionId: CHILD,
  useSession: unconsumedSeat, useProjection: unconsumedSeat, useAccess: unconsumedSeat,
  useConversation: unconsumedSeat, useInput: unconsumedSeat, useChat: unconsumedSeat,
  useTrajectory: unconsumedSeat, useRemoteAccess: unconsumedSeat, useSessions: unconsumedSeat,
  useSessionRetainInfo: unconsumedSeat, useSessionAccess: unconsumedSeat,
  useSessionStatus: unconsumedSeat, usePanelInfo: unconsumedSeat, useContextMenu: unconsumedSeat,
  useWorkspaces: unconsumedSeat, useResource: unconsumedSeat, useWorkspaceAccess: unconsumedSeat,
  inputActions: {
    insertQuote: unconsumedSeat, captureInsertion: unconsumedSeat, insertText: unconsumedSeat,
    setDraft: unconsumedSeat, persistDraft: unconsumedSeat, addAttachments: unconsumedSeat,
    removeAttachment: unconsumedSeat, pruneAttachments: unconsumedSeat, submit: unconsumedSeat,
  },
} satisfies SessionStandardProps & GlobalStandardProps

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap { 'subagent.resource.fixture': { kind: 'single'; scope: 'root' } }
}

describe('Sidebar chat components', () => {
  it('binds a live resource reference around the child Session slot', async () => {
    const reference = { sessionId: CHILD } as SessionReference
    const snapshot = shallowRef<ResourceSnapshot<SubagentChatResource>>({ status: 'loading', value: undefined, failure: undefined })
    const boundSession = vi.fn()
    const SessionProvider = defineComponent((props: SessionAreaProps, { slots }) => { boundSession(props.session); return () => slots.default?.() }, { props: ['session'], inheritAttrs: false })
    const renderSlot = vi.fn(() => h('span', null, [
      'child conversation',
    ]))
    const runtime = await SlotTestRuntime.create()
    onTestFinished(async () => { await runtime.dispose() })
    await runtime.declare({ 'subagent.resource.fixture': { kind: 'single', scope: 'root' } })
    runtime.slots.provideRoot({ keyedHooks: { resource: () => ({
      getSnapshot: () => snapshot.value,
      subscribe: listener => watch(snapshot, () => { listener() }, { flush: 'sync' }),
    }) } })
    const tab: SidebarRightTabInfo = {
      sidebar: { expanded: true, fullscreen: false }, panel: { id: 'pane' as PaneId, isFloating: false },
      tab: { id: 'chat' as TabId, kind: 'subagentchat', contentId: subagentChatAddress(ADDRESS), title: 'Chat', visible: true,
        navigation: { address: subagentChatAddress(ADDRESS), params: undefined, revision: 0 }, signal: new AbortController().signal,
        actions: { openTab: vi.fn(), openResource: vi.fn(), close: vi.fn(), bindCommands: () => () => {} } },
    }
    runtime.slots.register({ name: 'subagent.resource.fixture' }, defineComponent((global: GlobalStandardProps) => () => {
      const props: SidebarChatTabProps = {
        ...standardProps, useResource: global.useResource, useTabInfo: () => computed(() => tab), SessionProvider, renderSlot,
      }
      return h(SidebarChatTab, props)
    }, { props: ['useResource'], inheritAttrs: false }))
    const slotView = await runtime.renderSlot('subagent.resource.fixture', {})
    const view = { ...slotView, ...getQueriesForElement(slotView.container) }
    expect(view.container.textContent).toBe('')
    snapshot.value = { status: 'live', value: { address: ADDRESS, reference }, failure: undefined }
    revision.value++
    await Promise.resolve()
    expect(view.getByText('child conversation')).toBeTruthy()
    expect(boundSession).toHaveBeenCalledWith(reference)
    expect(renderSlot).toHaveBeenCalledWith('sidebar.chat.conversation', {})
  })
  it.each([
    {
      name: 'active',
      session: { blank: false, awaitingFirstTurn: false, running: false },
      summaryBlank: false,
      expected: { phase: 'active', hero: false },
    },
    {
      name: 'hero',
      session: { blank: true, awaitingFirstTurn: true, running: false, openState: 'open' },
      summaryBlank: true,
      expected: { phase: 'hero', hero: true },
    },
    {
      name: 'prompt attempted',
      session: { blank: true, awaitingFirstTurn: true, running: false, openState: 'open', promptAttempted: true },
      summaryBlank: false,
      expected: { phase: 'active', hero: false },
    },
    {
      name: 'loading',
      session: { blank: true, awaitingFirstTurn: true, running: false, openState: 'loading' },
      summaryBlank: false,
      expected: { phase: 'settling', hero: false },
    },
    {
      name: 'continuable child without parent availability',
      session: {
        blank: false,
        awaitingFirstTurn: false,
        running: false,
        subagent: { address: ADDRESS },
      },
      summaryBlank: false,
      expected: { phase: 'active', hero: false },
    },
  ])('derives the $name embedded phase and fixes the local view to Chat', ({ session: patch, summaryBlank, expected }) => {
    const snapshot = { ...sessionSnapshot(CHILD), ...patch } as SessionSnapshot
    const renderFactorySlot = vi.fn(() => null)
    render(h(ConversationSlotPanel, {
      ...standardProps,
      sessionId: CHILD,
      useSession: select => computed(() => {
        void revision.value
        return select(snapshot)
      }),
      useConversation: select => computed(() => {
        void revision.value
        return select(conversationSnapshot({ activeTargets: new Set() }))
      }),
      useSessions: select => computed(() => {
        void revision.value
        return select({
          ids: [], byId: { [CHILD]: { blank: summaryBlank } }, phase: 'ready', projectionsBySession: {}, jobsBySession: {},
        } as unknown as SessionListState)
      }),
      renderFactorySlot,
    } satisfies InstanceType<typeof ConversationSlotPanel>['$props']))
    expect(renderFactorySlot).toHaveBeenCalledWith('conversation.content', { variant: 'embedded', ...expected }, { slots: { views: FixedChatConversationView } })
  })
  it('routes the fixed local view through the ordinary Conversation Session slot', () => {
    const renderSlot = vi.fn(() => null)
    render(h(FixedChatConversationView, { ...({ renderSlot } as unknown as ConversationViewsProps) }))
    expect(renderSlot).toHaveBeenCalledWith('conversation.session', { view: 'chat' })
  })
})
