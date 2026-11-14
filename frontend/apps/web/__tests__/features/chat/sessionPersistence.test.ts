import { withChatGraph } from './graphApi.fixture'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createChatSession, type ChatApi } from '../../../src/features/chat/chatSession'
import type { AiMessageResult, AiStatus } from '@eap/runtime-client'

afterEach(() => vi.useRealTimers())
const conversation = {
  conversationId: 'one',
  workspaceLabel: 'workspace',
  memory: '',
  connectionId: 'desk',
  model: 'm',
}
const finalResult: AiMessageResult = {
  executionId: 'run',
  answer: 'complete',
  error: '',
  status: 'SUCCEEDED',
  approval: '',
  verification: '',
  toolEvents: [],
  artifactError: '',
  artifacts: [],
}
function setup(saved = 'null') {
  const values = new Map<string, string>()
  values.set(
    JSON.parse(saved)?.version === 1 ? 'eap.chat.history.v1' : 'eap.chat.preferences.v2',
    saved,
  )
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((_key: string, next: string) => {
      values.set(_key, next)
    }),
  }
  const api: Omit<ChatApi, 'chatGraph' | 'chatOperation' | 'cancelAiExecution'> = {
    aiStatus: vi.fn(async () => ({ state: 'available' }) as AiStatus),
    openAiConversation: vi.fn(async () => conversation),
    aiConversation: vi.fn(async () => conversation),
    sendAiMessage: vi.fn(async () => finalResult),
  }
  return {
    api,
    storage,
    session: createChatSession(withChatGraph(api), storage),
    saved: () => JSON.parse(values.get('eap.chat.preferences.v2') ?? 'null'),
  }
}

it('reads and parses startup history once, then restores the scratch draft and context from that snapshot', async () => {
  const { session, storage } = setup(
    JSON.stringify({
      version: 1,
      items: [],
      transcripts: {},
      scratch: { draft: 'keep draft', context: { instructions: 'keep context' } },
    }),
  )
  await session.restoreLastConversation()
  expect(storage.getItem).toHaveBeenCalledTimes(2)
  expect(session.draft.value).toBe('keep draft')
  expect(session.context.value.instructions).toBe('keep context')
  session.draft.value = 'edited after restoration'
  await session.restoreLastConversation()
  expect(session.draft.value).toBe('edited after restoration')
})

it('persists drafts immediately while streamed messages and localized errors remain server-only', async () => {
  vi.useFakeTimers()
  const { session, api, storage, saved } = setup()
  await session.openConversation()
  session.draft.value = 'request'
  expect(saved().items[0].draft).toBe('request')
  let event!: NonNullable<Parameters<ChatApi['sendAiMessage']>[2]>['onEvent']
  let finish!: (value: AiMessageResult) => void
  vi.mocked(api.sendAiMessage).mockImplementationOnce(async (_id, _request, options) => {
    event = options!.onEvent
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const pending = session.send()
  await vi.advanceTimersByTimeAsync(0)
  storage.setItem.mockClear()
  for (let sequence = 1; sequence <= 100; sequence++)
    event!({
      conversationId: 'one',
      executionId: 'run',
      sequence,
      type: 'answer.delta',
      text: 'x',
      code: '',
      status: 'RUNNING',
    })
  await vi.advanceTimersByTimeAsync(0)
  expect(session.turns.value[1].text).toHaveLength(100)
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(saved()).not.toHaveProperty('transcripts')
  finish({ ...finalResult, errorMessage: 'localized', errorLanguage: 'en-US' })
  await pending
  expect(session.turns.value[1]).toMatchObject({
    text: 'complete',
    status: 'SUCCEEDED',
    executionId: 'run',
  })
  expect(JSON.stringify(saved())).not.toContain('localized')
  expect(saved().items[0].draft).toBe('')
})

it('keeps legacy local transcripts read-only and available for exact export', async () => {
  const original = JSON.stringify({
    version: 1,
    items: [],
    transcripts: { one: [{ role: 'assistant', text: 'local observation' }] },
    scratch: { draft: 'unsent' },
  })
  const { session, saved } = setup(original)
  expect(session.turns.value).toEqual([])
  expect(session.legacyHistoryExport()).toBe(original)
  session.flushPersistence()
  expect(saved()).not.toHaveProperty('transcripts')
  expect(session.legacyHistoryExport()).toBe(original)
})

it('shares only concurrent probes and rejects stale results after a selection changes', async () => {
  const { session, api } = setup()
  await session.openConversation()
  let finish!: (value: typeof conversation) => void
  vi.mocked(api.aiConversation!).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const first = session.recheckConversation()
  const second = session.recheckConversation()
  expect(api.aiConversation).toHaveBeenCalledTimes(1)
  session.beginDraft()
  session.draft.value = 'new draft'
  finish({ ...conversation, model: 'stale model' })
  expect(await first).toBe(false)
  expect(await second).toBe(false)
  expect(session.draft.value).toBe('new draft')
  await session.selectConversation('one')
  expect(api.aiConversation).toHaveBeenCalledTimes(2)
})

it('does not apply an old working-memory response after leaving and returning to the same conversation', async () => {
  const { session, api } = setup()
  await session.openConversation()
  let finish!: (value: NonNullable<Awaited<ReturnType<typeof session.saveWorkingMemory>>>) => void
  api.putWorkingMemory = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = session.saveWorkingMemory({ goal: 'old save' })
  session.beginDraft()
  await session.selectConversation('one')
  finish({
    goal: 'old save',
    constraints: [],
    facts: [],
    evidenceRefs: [],
    dependencyKeys: [],
    invalidation: '',
    updatedAt: '',
    layers: [],
  })
  await pending
  expect(session.workingMemory.value).toBeNull()
})

it('keeps a failed target change from changing the newly selected draft', async () => {
  const { session, api } = setup()
  await session.openConversation()
  let fail!: (error: Error) => void
  api.assignConversationConnection = vi.fn(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject
      }),
  )
  session.chooseConversationConnection('new-target', 'new-model')
  const pending = session.confirmConnectionChange()
  expect(session.changingConnection.value).toBe(true)
  await session.confirmConnectionChange()
  expect(api.assignConversationConnection).toHaveBeenCalledTimes(1)
  session.beginDraft()
  session.draft.value = 'other draft'
  fail(new Error('old operation failed'))
  await pending
  expect(session.failure.value).toBe('')
  expect(session.draft.value).toBe('other draft')
  expect(session.changingConnection.value).toBe(false)
})

it('restores the unsent scratch after visiting existing history, including after reload', async () => {
  const { session, saved } = setup()
  await session.openConversation()
  session.beginDraft()
  session.draft.value = 'unsent scratch'
  session.context.value.instructions = 'scratch context'
  await session.selectConversation('one')
  expect(saved().scratch.draft).toBe('unsent scratch')
  const reloaded = setup(JSON.stringify(saved())).session
  await reloaded.restoreLastConversation()
  reloaded.beginDraft()
  expect(reloaded.draft.value).toBe('unsent scratch')
  expect(reloaded.context.value.instructions).toBe('scratch context')
})

it('does not steal selection or send when opening the scratch finishes after navigation', async () => {
  const { session, api } = setup()
  await session.openConversation()
  session.beginDraft()
  session.draft.value = 'scratch request'
  let finish!: (value: typeof conversation) => void
  vi.mocked(api.openAiConversation).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const sending = session.send()
  await session.selectConversation('one')
  session.draft.value = 'current draft'
  finish({ ...conversation, conversationId: 'late' })
  await sending
  expect(session.conversationId.value).toBe('one')
  expect(session.draft.value).toBe('current draft')
  expect(api.sendAiMessage).not.toHaveBeenCalled()
  session.beginDraft()
  expect(session.draft.value).toBe('scratch request')
})
