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
  let value = saved
  const storage = {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next
    }),
  }
  const api: ChatApi = {
    aiStatus: vi.fn(async () => ({ state: 'available' }) as AiStatus),
    openAiConversation: vi.fn(async () => conversation),
    aiConversation: vi.fn(async () => conversation),
    sendAiMessage: vi.fn(async () => finalResult),
  }
  return { api, storage, session: createChatSession(api, storage), saved: () => JSON.parse(value) }
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
  expect(storage.getItem).toHaveBeenCalledTimes(1)
  expect(session.draft.value).toBe('keep draft')
  expect(session.context.value.instructions).toBe('keep context')
  session.draft.value = 'edited after restoration'
  await session.restoreLastConversation()
  expect(session.draft.value).toBe('edited after restoration')
})

it('coalesces streamed deltas, keeps draft writes immediate, and flushes the final outcome without persisting translated messages', async () => {
  vi.useFakeTimers()
  const { session, api, storage, saved } = setup()
  await session.openConversation()
  session.draft.value = 'request'
  expect(saved().items[0].draft).toBe('request')
  let event!: NonNullable<Parameters<ChatApi['sendAiMessage']>[4]>['onEvent']
  let finish!: (value: AiMessageResult) => void
  vi.mocked(api.sendAiMessage).mockImplementationOnce(
    async (_id, _text, _mode, _context, options) => {
      event = options!.onEvent
      return new Promise((resolve) => {
        finish = resolve
      })
    },
  )
  const pending = session.send()
  storage.setItem.mockClear()
  for (let sequence = 1; sequence <= 100; sequence++)
    event!({
      executionId: 'run',
      sequence,
      type: 'answer.delta',
      text: 'x',
      code: '',
      status: 'RUNNING',
    })
  expect(session.turns.value[1].text).toHaveLength(100)
  expect(storage.setItem).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(150)
  expect(storage.setItem).toHaveBeenCalledTimes(1)
  expect(saved().transcripts.one[1].text).toHaveLength(100)
  finish({ ...finalResult, errorMessage: 'localized', errorLanguage: 'en-US' })
  await pending
  expect(saved().transcripts.one[1]).toMatchObject({
    text: 'complete',
    status: 'SUCCEEDED',
    executionId: 'run',
  })
  expect(saved().transcripts.one[1]).not.toHaveProperty('errorMessage')
  expect(saved().items[0].draft).toBe('')
  const writes = storage.setItem.mock.calls.length
  await vi.advanceTimersByTimeAsync(500)
  expect(storage.setItem).toHaveBeenCalledTimes(writes)
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
