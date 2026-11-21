import type { TaskContext } from '@eap/runtime-client'
import type { ChatTurn, ConversationHistory } from './chatSession'

const STORAGE_KEY = 'eap.chat.history.v1'
/** Sentinel proving the legacy local history was already cleared for this storage scope. */
const CLEARED_SENTINEL = 'eap.chat.history.cleared.v1'
export type ChatHistorySnapshot = {
  version?: number
  items?: ConversationHistory[]
  transcripts?: Record<string, ChatTurn[]>
  activeId?: string
  scratch?: { draft: string; context?: TaskContext }
}
export type ChatHistoryStorage = Pick<Storage, 'getItem' | 'setItem'>
export type ChatHistoryClearStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Sentinel key name, exported so callers/tests can assert scope-prefixed cleanup state. */
export const CHAT_HISTORY_CLEARED_KEY = CLEARED_SENTINEL

/**
 * One-shot removal of the legacy linear chat history for this storage scope.
 * Deletes only the chat-history key, writes a sentinel so later loads keep any
 * newly created sessions, and is a no-op when storage is absent. The sentinel is
 * written before removal: a failure mid-way therefore leaves the old history
 * intact and a later load retries, rather than losing history without a marker.
 * Returns true only when a removal actually happened.
 */
export function clearLegacyChatHistory(storage?: ChatHistoryClearStorage): boolean {
  if (!storage) return false
  try {
    if (storage.getItem(CLEARED_SENTINEL) != null) return false
    const hadHistory = storage.getItem(STORAGE_KEY) != null
    storage.setItem(CLEARED_SENTINEL, new Date().toISOString())
    if (hadHistory) storage.removeItem(STORAGE_KEY)
    return hadHistory
  } catch {
    // Storage may be unavailable/quota-limited; never block app startup over cleanup.
    return false
  }
}

export function readChatHistory(storage?: ChatHistoryStorage): ChatHistorySnapshot | null {
  return JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null')
}

/** A bounded streaming checkpoint; callers flush edits, terminal results and page lifecycle boundaries. */
export function createChatHistoryWriter(
  storage: ChatHistoryStorage | undefined,
  snapshot: () => ChatHistorySnapshot,
  failed: () => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  function flush() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    if (!storage) return
    try {
      const state = snapshot()
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...state,
          transcripts: Object.fromEntries(
            Object.entries(state.transcripts ?? {}).map(([id, turns]) => [
              id,
              turns.map(({ errorMessage: _message, errorLanguage: _language, ...turn }) => turn),
            ]),
          ),
        }),
      )
    } catch {
      failed()
    }
  }
  function schedule() {
    if (!storage || timer !== undefined) return
    timer = setTimeout(flush, 150)
  }
  return { flush, schedule }
}
