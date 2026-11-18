import { withChatGraph } from './graphApi.fixture'
import { expect, it, vi } from 'vite-plus/test'
import type { AiConversation, ModelConnection } from '@eap/runtime-client'
import { createChatSession, type ChatApi } from '../../../src/features/chat/chatSession'

function setup() {
  const old: AiConversation = {
    conversationId: 'old',
    workspaceLabel: 'saved-ws',
    memory: 'memory',
    connectionId: 'desk',
    model: 'm',
  }
  const reconnect = vi.fn(
    async (_id: string, _workspace: string, connectionId: string, model: string) => ({
      ...old,
      connectionId,
      model,
      contextReset: true,
      memoryCleared: false,
    }),
  )
  const assign = vi.fn(
    async (id: string, connectionId: string, confirm: boolean, model: string) => ({
      connectionId,
      model,
      connectionName: 'Desk',
      memoryCleared: false,
    }),
  )
  const api: Omit<ChatApi, 'chatGraph' | 'chatOperation' | 'cancelAiExecution'> = {
    aiStatus: vi.fn(),
    openAiConversation: vi.fn(async () => old),
    aiConversation: vi.fn(async () => {
      throw { response: { status: 404 } }
    }),
    reconnectAiConversation: reconnect,
    assignConversationConnection: assign,
    sendAiMessage: vi.fn(),
  }
  const session = createChatSession(withChatGraph(api))
  session.connections.value = [
    {
      id: 'desk',
      name: 'Desk',
      enabled: true,
      models: [{ id: 'm' }],
      allowedModels: ['m'],
    } as ModelConnection,
  ]
  return { old, api, session, reconnect, assign }
}

it.each(['missing', 'disabled', 'disallowed'])(
  'refuses %s historical model without falling back and allows explicit replacement',
  async (kind) => {
    const { session, reconnect, assign } = setup()
    await session.openConversation()
    session.draft.value = 'kept'
    await session.selectConversation('old')
    if (kind === 'missing') session.connections.value = []
    if (kind === 'disabled') session.connections.value[0].enabled = false
    if (kind === 'disallowed') session.connections.value[0].allowedModels = []
    expect(await session.reconnectConversation()).toBeUndefined()
    expect(reconnect).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
    expect(session.failure.value).toBe('model-unavailable')
    session.connections.value.push({
      id: 'replacement',
      enabled: true,
      allowedModels: ['new'],
      models: [{ id: 'new' }],
    } as ModelConnection)
    session.chooseConversationConnection('replacement', 'new')
    expect(await session.reconnectConversation()).toMatchObject({ contextReset: true })
    expect(reconnect).toHaveBeenCalledExactlyOnceWith('old', 'saved-ws', 'replacement', 'new')
    expect(assign).not.toHaveBeenCalled()
  },
)

it.each(['offline', 'workspace', 'authorization'])(
  'preserves draft, context and saved workspace on %s reconnect failure',
  async (kind) => {
    const { session, reconnect, assign } = setup()
    await session.openConversation()
    session.draft.value = 'kept'
    session.context.value.instructions = 'keep context'
    await session.selectConversation('old')
    reconnect.mockRejectedValueOnce(
      kind === 'workspace'
        ? { response: { status: 409, data: { code: 'CONVERSATION_WORKSPACE_CHANGED' } } }
        : new Error('offline'),
    )
    expect(await session.reconnectConversation()).toBeUndefined()
    expect(session.failure.value).toBe(
      kind === 'workspace' ? 'workspace-changed' : 'reconnect-failed',
    )
    expect(session.expired.value).toBe(true)
    expect(session.draft.value).toBe('kept')
    expect(session.context.value.instructions).toBe('keep context')
    expect(session.history.value[0].workspaceLabel).toBe('saved-ws')
  },
)

it('serializes reconnect clicks and prevents a switched-away result from mutating or sending another conversation', async () => {
  const { session, reconnect, assign, api } = setup()
  await session.openConversation()
  session.draft.value = 'old draft'
  await session.selectConversation('old')
  let resolve!: (value: Awaited<ReturnType<typeof reconnect>>) => void
  reconnect.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const pending = session.reconnectConversation()
  expect(session.reconnecting.value).toBe(true)
  expect(await session.reconnectConversation()).toBeUndefined()
  session.beginDraft()
  session.draft.value = 'new draft'
  resolve({
    conversationId: 'old',
    workspaceLabel: 'saved-ws',
    memory: '',
    connectionId: 'desk',
    model: 'm',
    contextReset: true,
    memoryCleared: false,
  })
  expect(await pending).toMatchObject({ contextReset: true })
  expect(assign).not.toHaveBeenCalled()
  expect(reconnect).toHaveBeenCalledTimes(1)
  expect(api.sendAiMessage).not.toHaveBeenCalled()
  expect(session.conversationId.value).toBeNull()
  expect(session.boundConnectionId.value).not.toBe('replacement')
  expect(session.draft.value).toBe('new draft')
  expect(session.expired.value).toBe(false)
})

it('keeps transient probe failure separate from confirmed expiry and rechecks without creating or resetting a session', async () => {
  const { session, api, old, reconnect } = setup()
  await session.openConversation()
  session.draft.value = 'keep'
  vi.mocked(api.aiConversation!).mockRejectedValueOnce(new Error('offline'))
  await session.selectConversation('old')
  expect(session.expired.value).toBe(false)
  expect(session.history.value[0].expired).not.toBe(true)
  expect(session.sessionUnavailable.value).toBe(true)
  vi.mocked(api.aiConversation!).mockResolvedValueOnce(old)
  expect(await session.recheckConversation()).toBe(true)
  expect(session.sessionUnavailable.value).toBe(false)
  expect(session.draft.value).toBe('keep')
  expect(reconnect).not.toHaveBeenCalled()
  expect(api.openAiConversation).toHaveBeenCalledTimes(1)
})

it('does not permanently expire a conversation for an unrelated message 404', async () => {
  const { session, api, old } = setup()
  await session.openConversation()
  session.draft.value = 'keep'
  vi.mocked(api.sendAiMessage).mockRejectedValueOnce({
    response: { status: 404, data: { code: 'CODE_PROPOSAL_NOT_FOUND' } },
  })
  vi.mocked(api.aiConversation!).mockResolvedValueOnce(old)
  await session.send()
  expect(session.expired.value).toBe(false)
  expect(session.history.value[0].expired).not.toBe(true)
  expect(session.draft.value).toBe('keep')
})

it('uses the atomic recovery acknowledgement for target clearing and working memory', async () => {
  const { session, reconnect, assign, old } = setup()
  await session.openConversation()
  await session.selectConversation('old')
  reconnect.mockResolvedValueOnce({ ...old, contextReset: false, memoryCleared: true })
  const result = await session.reconnectConversation()
  expect(result?.contextReset).toBe(false)
  expect(session.reconnectNotice.value).toBe('reset')
  expect(assign).not.toHaveBeenCalled()
})

it('explicitly reconnects and reassigns the saved target, preserving local data without hidden sends', async () => {
  const { old, session, reconnect, assign, api } = setup()
  await session.openConversation()
  session.draft.value = 'retry only this'
  session.context.value.files = [{ name: 'keep.md', content: 'context' }]
  session.transcripts.value.old = [{ role: 'assistant', text: 'old transcript' } as never]
  await session.selectConversation('old')
  const before = JSON.stringify(session.context.value)
  const result = await session.reconnectConversation()
  expect(result).toMatchObject({ conversationId: 'old', contextReset: true })
  expect(reconnect).toHaveBeenCalledExactlyOnceWith('old', 'saved-ws', 'desk', 'm')
  expect(assign).not.toHaveBeenCalled()
  expect(api.openAiConversation).toHaveBeenCalledTimes(1)
  expect(api.sendAiMessage).not.toHaveBeenCalled()
  expect(session.conversationId.value).toBe(old.conversationId)
  expect(session.history.value).toHaveLength(1)
  expect(session.turns.value[0].text).toBe('old transcript')
  expect(session.draft.value).toBe('retry only this')
  expect(JSON.stringify(session.context.value)).toBe(before)
  expect(session.expired.value).toBe(false)
})
