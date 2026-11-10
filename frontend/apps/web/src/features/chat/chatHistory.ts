import type { TaskContext } from '@eap/runtime-client'
import type { ChatTurn, ConversationHistory } from './chatSession'

const STORAGE_KEY = 'eap.chat.history.v1'
export type ChatHistorySnapshot = {
  version?: number
  items?: ConversationHistory[]
  transcripts?: Record<string, ChatTurn[]>
  activeId?: string
  scratch?: { draft: string; context?: TaskContext }
}
export type ChatHistoryStorage = Pick<Storage, 'getItem' | 'setItem'>

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
