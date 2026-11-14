import type { TaskContext } from '@eap/runtime-client'
import type { ConversationHistory } from './chatSession'

const STORAGE_KEY = 'eap.chat.preferences.v2'
const LEGACY_KEY = 'eap.chat.history.v1'
export type ChatHistorySnapshot = {
  version?: number
  items?: ConversationHistory[]
  branches?: Record<string, Record<string, string>>
  scroll?: Record<string, { follow: boolean; anchorMessageId?: string }>
  pendingOperations?: Record<string, string>
  activeId?: string
  scratch?: { draft: string; context?: TaskContext }
}
export type ChatHistoryStorage = Pick<Storage, 'getItem' | 'setItem'>

export function readChatHistory(storage?: ChatHistoryStorage): ChatHistorySnapshot | null {
  const current = storage?.getItem(STORAGE_KEY)
  if (current) return JSON.parse(current)
  const legacy = JSON.parse(storage?.getItem(LEGACY_KEY) ?? 'null') as ChatHistorySnapshot | null
  return legacy
    ? { version: 2, items: legacy.items, activeId: legacy.activeId, scratch: legacy.scratch }
    : null
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

/** Original local observations remain available verbatim; never uploaded as server nodes. */
export function exportLegacyChatHistory(storage?: ChatHistoryStorage): string | null {
  return storage?.getItem(LEGACY_KEY) ?? null
}
