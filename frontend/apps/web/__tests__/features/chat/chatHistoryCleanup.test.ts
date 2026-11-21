import { expect, it, vi } from 'vite-plus/test'
import {
  CHAT_HISTORY_CLEARED_KEY,
  clearLegacyChatHistory,
  type ChatHistoryClearStorage,
} from '../../../src/features/chat/chatHistory'

function memoryStorage(seed: Record<string, string> = {}): ChatHistoryClearStorage & {
  data: Map<string, string>
} {
  const data = new Map(Object.entries(seed))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
}

it('removes the legacy history and leaves a sentinel on first run', () => {
  const storage = memoryStorage({
    'eap.chat.history.v1': JSON.stringify({ version: 1, items: [{ id: 'old' }] }),
    'settings.appearance': 'dark',
  })
  expect(clearLegacyChatHistory(storage)).toBe(true)
  expect(storage.data.has('eap.chat.history.v1')).toBe(false)
  expect(storage.data.get('settings.appearance')).toBe('dark')
  expect(storage.data.has(CHAT_HISTORY_CLEARED_KEY)).toBe(true)
  expect(typeof storage.data.get(CHAT_HISTORY_CLEARED_KEY)).toBe('string')
})

it('does not remove history when the sentinel is already present', () => {
  const storage = memoryStorage({
    'eap.chat.history.v1': JSON.stringify({ version: 1, items: [] }),
    [CHAT_HISTORY_CLEARED_KEY]: '2026-11-21T00:00:00.000Z',
  })
  expect(clearLegacyChatHistory(storage)).toBe(false)
  expect(storage.data.has('eap.chat.history.v1')).toBe(true)
})

it('keeps sessions written after a previous cleanup across later loads', () => {
  const storage = memoryStorage()
  clearLegacyChatHistory(storage) // first load: nothing to delete, sentinel written
  storage.setItem('eap.chat.history.v1', JSON.stringify({ version: 1, items: [{ id: 'fresh' }] }))
  expect(clearLegacyChatHistory(storage)).toBe(false)
  expect(storage.data.has('eap.chat.history.v1')).toBe(true)
})

it('is a no-op without storage and never throws on storage failure', () => {
  expect(clearLegacyChatHistory(undefined)).toBe(false)
  const throwing: ChatHistoryClearStorage = {
    getItem() {
      throw new Error('blocked')
    },
    setItem() {
      throw new Error('blocked')
    },
    removeItem() {
      throw new Error('blocked')
    },
  }
  expect(() => clearLegacyChatHistory(throwing)).not.toThrow()
  expect(clearLegacyChatHistory(throwing)).toBe(false)
})

it('writes the sentinel before deleting so a mid-way failure is retried', () => {
  const order: string[] = []
  const storage: ChatHistoryClearStorage = {
    getItem: (key: string) => (key === 'eap.chat.history.v1' ? 'present' : null),
    setItem: (key: string) => {
      order.push('set:' + key)
    },
    removeItem: (key: string) => {
      order.push('remove:' + key)
    },
  }
  clearLegacyChatHistory(storage)
  expect(order).toEqual([
    'set:' + CHAT_HISTORY_CLEARED_KEY,
    'remove:eap.chat.history.v1',
  ])
})
