import type { NotifyEvent, NotifyKind } from '@eap/runtime-client'

export type NotifyListener = (event: NotifyEvent) => void

type Filter = { kind?: NotifyKind | NotifyKind[] }

const listeners = new Set<{ filter?: Filter; listener: NotifyListener }>()
const seenIds = new Set<string>()
let lastSequence = 0
let focusedConversation: () => string | undefined = () => undefined

/** Unread/attention counts per conversation from session notify events. */
const sessionAttention = new Map<string, number>()
const attentionListeners = new Set<() => void>()

/** Shell supplies the focused conversation so active sessions never badge themselves. */
export function configureNotifyFocus(getter: () => string | undefined) {
  focusedConversation = getter
}

export function notifyLastSequence() {
  return lastSequence
}

export function sessionAttentionCount(conversationId: string) {
  return sessionAttention.get(conversationId) ?? 0
}

export function subscribeSessionAttention(listener: () => void) {
  attentionListeners.add(listener)
  return () => attentionListeners.delete(listener)
}

export function clearSessionAttention(conversationId: string) {
  if (!sessionAttention.has(conversationId)) return
  sessionAttention.delete(conversationId)
  for (const listener of attentionListeners) listener()
}

function matches(filter: Filter | undefined, event: NotifyEvent) {
  if (!filter?.kind) return true
  const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind]
  return kinds.includes(event.kind)
}

/** Local or remote publish into the single in-app bus. Dedupes by eventId. */
export function publishNotify(event: NotifyEvent) {
  if (seenIds.has(event.eventId)) return false
  seenIds.add(event.eventId)
  if (seenIds.size > 2000) {
    const first = seenIds.values().next().value
    if (first) seenIds.delete(first)
  }
  if (event.sequence > lastSequence) lastSequence = event.sequence
  if (
    event.kind === 'session' &&
    event.target?.conversationId &&
    event.target.conversationId !== focusedConversation()
  ) {
    const id = event.target.conversationId
    sessionAttention.set(id, (sessionAttention.get(id) ?? 0) + 1)
    for (const listener of attentionListeners) listener()
  }
  for (const entry of listeners) {
    if (matches(entry.filter, event)) entry.listener(event)
  }
  return true
}

export function subscribeNotify(listener: NotifyListener, filter?: Filter) {
  const entry = { listener, filter }
  listeners.add(entry)
  return () => listeners.delete(entry)
}

/** Test/reset helper. */
export function resetNotifyBus() {
  listeners.clear()
  attentionListeners.clear()
  seenIds.clear()
  sessionAttention.clear()
  lastSequence = 0
}
