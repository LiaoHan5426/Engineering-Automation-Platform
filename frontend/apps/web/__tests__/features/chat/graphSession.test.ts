import 'fake-indexeddb/auto'
import { expect, it } from 'vite-plus/test'
import { createMockChatBackend } from '@eap/backend-mock/backend'
import { createChatSession, type ChatApi } from '../../../src/features/chat/chatSession'
import type {
  AiConversation,
  AiMessageResult,
  AiStatus,
  ChatGraph,
  ChatGraphOperation,
} from '@eap/runtime-client'
function setup() {
  const backend = createMockChatBackend()
  let sends = 0
  let loseResponse = false
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
  async function call<T>(method: string, route: string, body?: Record<string, unknown>) {
    const response = await backend.handle(method, route, body)
    if (response.status !== 200)
      throw { response: { status: response.status, data: response.data } }
    return structuredClone(response.data) as T
  }
  const api: ChatApi = {
    aiStatus: () => call<AiStatus>('GET', '/ai/status'),
    openAiConversation: () => call<AiConversation>('POST', '/ai/conversations'),
    aiConversation: (id) => call<AiConversation>('GET', '/ai/conversations/' + id),
    chatGraph: (id) => call<ChatGraph>('GET', '/ai/conversations/' + id + '/graph'),
    chatOperation: (id, operation) =>
      call<ChatGraphOperation>('GET', '/ai/conversations/' + id + '/operations/' + operation),
    cancelAiExecution: (id, execution) =>
      call('POST', '/ai/conversations/' + id + '/executions/' + execution + '/cancel'),
    sendAiMessage: async (id, request) => {
      sends++
      const response = await call<AiMessageResult>(
        'POST',
        '/ai/conversations/' + id + '/messages',
        request,
      )
      if (loseResponse) throw new TypeError('response lost')
      return response
    },
  }
  return {
    api,
    storage,
    values,
    sends: () => sends,
    lose: () => {
      loseResponse = true
    },
  }
}
it('reads sent messages from server after reload and persists only draft/branch preferences', async () => {
  const fixture = setup()
  const session = createChatSession(fixture.api, fixture.storage)
  await session.openConversation()
  session.draft.value = 'original'
  await session.send()
  expect(session.turns.value.map((turn) => turn.role)).toEqual(['user', 'assistant'])
  const root = session.turns.value[0]!.id!
  await session.editMessage(root, 'edited')
  expect(session.failure.value).toBe('')
  expect(session.turns.value[0]?.text).toBe('edited')
  session.switchBranch(root)
  session.draft.value = 'keep unsent'
  session.flushPersistence()
  const persisted = JSON.parse(fixture.values.get('eap.chat.preferences.v2')!)
  expect(persisted.transcripts).toBeUndefined()
  const restored = createChatSession(fixture.api, fixture.storage)
  expect(restored.turns.value).toEqual([])
  await restored.restoreLastConversation()
  expect(restored.turns.value[0]?.text).toBe('original')
  expect(restored.draft.value).toBe('keep unsent')
})
it('keeps a response-loss operation across reload and queries it without resending or clearing draft', async () => {
  const fixture = setup()
  const session = createChatSession(fixture.api, fixture.storage)
  await session.openConversation()
  fixture.lose()
  session.draft.value = 'uncertain'
  await session.send()
  expect(session.failure.value).toBe('response-uncertain')
  await session.send()
  expect(fixture.sends()).toBe(1)
  session.flushPersistence()
  const restored = createChatSession(fixture.api, fixture.storage)
  await restored.restoreLastConversation()
  await restored.send()
  expect(fixture.sends()).toBe(1)
  await restored.recoverOperation()
  expect(restored.turns.value[0]?.text).toBe('uncertain')
  expect(restored.pendingOperations.value).toEqual({})
  expect(restored.draft.value).toBe('uncertain')
})

it('retains local originals for confirmed message history and refuses a replay after eviction', async () => {
  const fixture = setup()
  const session = createChatSession(fixture.api, fixture.storage)
  await session.refreshStatus()
  await session.openConversation()
  await session.attachFiles([new File(['private original'], 'notes.txt', { type: 'text/plain' })])
  const ref = session.context.value.attachmentRefs![0]!
  session.draft.value = 'with attachment'
  await session.send()
  expect(session.failure.value).toBe('')
  const user = session.turns.value[0]!
  expect(await session.attachmentStore.value!.affectedOwners(ref.id)).toContain(
    `message:${user.id}`,
  )
  expect(session.context.value.attachmentRefs).toEqual([])
  session.flushPersistence()
  expect(fixture.values.get('eap.chat.preferences.v2')).not.toContain('private original')
  await session.attachmentStore.value!.evictOriginal(ref.id)
  session.draft.value = 'follow up'
  const before = fixture.sends()
  await session.send()
  expect(session.failure.value).toBe('attachment.missing')
  expect(fixture.sends()).toBe(before)
  expect(session.draft.value).toBe('follow up')
})

it('ignores older concurrent readbacks even when their graph revision is identical', async () => {
  const fixture = setup()
  const session = createChatSession(fixture.api)
  await session.openConversation()
  session.draft.value = 'question'
  await session.send()
  const id = session.conversationId.value!
  const complete = await fixture.api.chatGraph(id)
  const stale = structuredClone(complete)
  const assistant = stale.nodes.find((node) => node.role === 'assistant')!
  assistant.status = 'RUNNING'
  assistant.content = 'old partial'
  assistant.response = null
  let resolveOld!: (value: ChatGraph) => void
  let reads = 0
  fixture.api.chatGraph = async () => {
    reads++
    return reads === 1
      ? new Promise<ChatGraph>((resolve) => {
          resolveOld = resolve
        })
      : complete
  }
  const oldRead = session.refreshGraph()
  await session.refreshGraph()
  resolveOld(stale)
  await oldRead
  expect(session.turns.value.at(-1)?.status).toBe('SUCCEEDED')
  expect(session.turns.value.at(-1)?.text).toBe(complete.nodes.at(-1)?.content)
})

it.each([
  ['UNKNOWN_CONVERSATION', true],
  ['CHAT_OPERATION_NOT_FOUND', false],
] as const)(
  'classifies preaccept message 404 %s without confusing operation lookup absence',
  async (code, expired) => {
    const fixture = setup()
    const session = createChatSession(fixture.api)
    await session.openConversation()
    const rejected = { response: { status: 404, data: { code } } }
    fixture.api.sendAiMessage = async () => {
      throw rejected
    }
    fixture.api.chatGraph = async () => {
      throw rejected
    }
    session.draft.value = 'keep for reconnect'
    await session.send()
    expect(session.expired.value).toBe(expired)
    expect(session.history.value[0]?.expired === true).toBe(expired)
    expect(session.draft.value).toBe('keep for reconnect')
    expect(session.pendingOperations.value).toEqual({})
  },
)
