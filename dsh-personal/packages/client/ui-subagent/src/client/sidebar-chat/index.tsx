import { computed, defineComponent, Fragment, h } from 'vue'
/** Right-Sidebar presentation of an existing subagent Conversation. */
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ResourceProvider } from '@deepseek-ai/dsh-client-resources/client'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { PropsRenderFactories, PropsRenderSlots, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SubagentAddress } from '@deepseek-ai/dsh-subagent/client'
import type { NS } from '../locales.ts'
import css from './SidebarChat.module.css'
/** Stable implementation identity for the Sidebar tab body. */
export const SUBAGENT_CHAT_ID = '@deepseek-ai/dsh-client-ui-subagent'
/** Resource-address prefix for an embedded Session chat. */
export const SUBAGENT_CHAT_ADDRESS = 'dsh-resource://subagentchat/session/'
/** Value retained by one live chat resource occurrence. */
export interface SubagentChatResource {
  readonly address: SubagentAddress
  readonly reference: SessionReference
}
declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    sidebarChat: unknown
  }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap {
    subagentchat: SubagentChatResource
  }
  interface SlotMap {
    /** Session-scoped Conversation occurrence hosted by one Sidebar chat tab. */
    'sidebar.chat.conversation': {
      kind: 'single'
      scope: 'session'
    }
  }
}
/**
 * Address one subagent Session together with the routing facts needed to restore it.
 * @param address - durable direct-parent subagent address.
 * @returns canonical Sidebar resource address.
 */
export function subagentChatAddress(address: SubagentAddress): string {
  const query = new URLSearchParams({
    parent: address.parentSessionId,
    mode: address.mode,
  })
  return `${SUBAGENT_CHAT_ADDRESS}${encodeURIComponent(address.childSessionId)}?${query}`
}
/**
 * Parse one canonical Sidebar chat resource address.
 * @param value - possible chat resource address.
 * @returns the encoded direct-parent address, or undefined for another or malformed resource.
 */
export function parseSubagentChatAddress(value: string): SubagentAddress | undefined {
  let url: URL
  try {
    url = new URL(value)
  }
  catch (_invalidUrl) {
    return undefined
  }
  if (url.protocol !== 'dsh-resource:' || url.hostname.toLowerCase() !== 'subagentchat')
    return undefined
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length !== 2 || parts[0] !== 'session')
    return undefined
  const parentSessionId = url.searchParams.get('parent')
  const mode = url.searchParams.get('mode')
  if (parentSessionId === null || parentSessionId === '' || (mode !== 'one-shot' && mode !== 'continuable' && mode !== 'unknown')) {
    return undefined
  }
  try {
    const childSessionId = decodeURIComponent(parts[1] as string)
    return {
      parentSessionId: parentSessionId as SessionId,
      childSessionId: childSessionId as SessionId,
      mode,
    }
  }
  catch (_invalidEncoding) {
    return undefined
  }
}
function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted)
    return Promise.resolve()
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => { resolve() }, { once: true })
  })
}
function isAbortRequested(signal: AbortSignal): boolean {
  return signal.aborted
}
function subagentChatResourceProvider(sessions: ISessions): ResourceProvider<'subagentchat'> {
  return {
    protocol: 'subagentchat',
    async *open(resourceAddress, { signal }) {
      const address = parseSubagentChatAddress(resourceAddress)
      if (address === undefined)
        throw new Error(`ui-subagent: invalid chat resource address "${resourceAddress}"`)
      if (isAbortRequested(signal))
        return
      const reference = sessions.retain(address, { source: 'sidebarChat', signal })
      try {
        yield { ok: true, value: { address, reference } }
        await waitForAbort(signal)
      }
      finally {
        reference.release()
      }
    },
  }
}
/** Fixed Chat selection used by an embedded Conversation occurrence. */
export const FixedChatConversationView = defineComponent((props: ConversationViewsProps) => {
  return () => {
    return h(Fragment, null, [
      props.renderSlot('conversation.session', { view: 'chat' }),
    ])
  }
}, { name: 'FixedChatConversationView', inheritAttrs: false, props: ['renderSlot'] })
/** Props supplied to the child-Session Conversation host. */
export type ConversationSlotPanelProps = PropsRuntime<'sidebar.chat.conversation'> & PropsRenderFactories
/** Render the shared Conversation content for one explicitly provided child Session. */
export const ConversationSlotPanel = defineComponent((props: ConversationSlotPanelProps) => {
  const session = props.useSession(value => value)
  const conversation = props.useConversation(value => value)
  const summaryBlank = props.useSessions(state => state.byId[props.sessionId]?.blank)
  return () => {
    const current = session.value
    const active = conversation.value.activeTargets.size > 0 || (!current.blank && !current.awaitingFirstTurn) || current.running
    const shellPhase = active ? 'active' : current.promptAttempted ? 'engaging' : 'blank'
    const settling = shellPhase === 'blank' && current.openState === 'loading' && summaryBlank.value !== true
    const hero = shellPhase === 'blank' && (current.openState === 'open' || summaryBlank.value === true)
    return props.renderFactorySlot('conversation.content', { variant: 'embedded', phase: settling ? 'settling' : hero ? 'hero' : 'active', hero }, { slots: { views: FixedChatConversationView } })
  }
}, { props: ['sessionId', 'useSession', 'useConversation', 'useSessions', 'renderFactorySlot'], inheritAttrs: false })
/** Props supplied to the parent-Session Sidebar tab body. */
export type SidebarChatTabProps = Pick<PropsRuntime<'sidebar.right.pane.tab'>, 'useResource' | 'useTabInfo'> & PropsRenderSlots<'sidebar.chat.conversation'>
/** Bind a chat resource's child reference around its Conversation slot. */
export const SidebarChatTab = defineComponent((props: SidebarChatTabProps) => {
  const tabInfo = props.useTabInfo()
  const resource = props.useResource<'subagentchat'>(computed(() => tabInfo.value.tab.contentId))
  return () => {
    const current = resource.value?.value
    return h('div', { class: css.root, 'data-sidebar-chat': '' }, current === undefined ? [] : [h(props.SessionProvider, { session: current.reference, children: null }, { default: () => props.renderSlot('sidebar.chat.conversation', {}) })])
  }
}, { props: ['useResource', 'useTabInfo', 'SessionProvider', 'renderSlot'], inheritAttrs: false })
/**
 * Register the chat resource owner and its right-Sidebar presentation.
 * @param ctx - Client root carrying Sessions, resources, Slots, and Sidebar registries.
 * @param t - Chat namespace translator used for fallback tab titles.
 */
export function registerSidebarChat(ctx: Context, t: TranslateNS<typeof NS>): void {
  ctx.effect(() => ctx.resources.register(subagentChatResourceProvider(ctx.sessions)), 'ui-subagent: Sidebar chat resources')
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: SUBAGENT_CHAT_ID,
    kind: 'subagentchat',
    patterns: [`${SUBAGENT_CHAT_ADDRESS}**`],
    priority: 'builtin',
    canOpen: address => parseSubagentChatAddress(address) !== undefined,
    title: (address) => {
      const child = parseSubagentChatAddress(address)?.childSessionId
      return child === undefined
        ? t('sidebar.chat')
        : ctx.sessions.list.getSnapshot().byId[child]?.projectionValues?.subagent?.label ?? child
    },
  } satisfies SidebarRightTabDefinition), 'ui-subagent: Sidebar chat type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: SUBAGENT_CHAT_ID,
    children: { 'sidebar.chat.conversation': { kind: 'single', scope: 'session' } },
  }, SidebarChatTab)), 'ui-subagent: Sidebar chat body')
  ctx.effect(() => ctx.slots.inject('sidebar.chat.conversation', () => ctx.slots.register({
    name: 'sidebar.chat.conversation',
  }, ConversationSlotPanel)), 'ui-subagent: Sidebar Conversation')
}
