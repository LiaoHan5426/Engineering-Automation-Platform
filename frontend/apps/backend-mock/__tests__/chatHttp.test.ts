import { expect, it } from 'vite-plus/test'
import { createChatApi, type ChatGraphOperation } from '@eap/runtime-client'
import { createMockChatBackend } from '../src/chatBackend'
import { replyChatSse, replyJson, startChatHttpFixture } from './chatHttpFixture'

it('uses the shared runtime HTTP client for models, conversation, message and proposal confirmation', async () => {
  const backend = createMockChatBackend()
  const fixture = await startChatHttpFixture(async (request, response) => {
    const reply = await backend.handle(request.method, request.url, request.data ?? {})
    if (
      reply.status === 200 &&
      request.method === 'POST' &&
      request.url.endsWith('/messages') &&
      request.headers.accept === 'text/event-stream'
    ) {
      const conversationId = request.url.split('/')[3]!
      const operation = await backend.handle(
        'GET',
        `/ai/conversations/${conversationId}/operations/${request.data!.operationId}`,
      )
      expect(operation.status).toBe(200)
      replyChatSse(response, reply.data, conversationId, operation.data as ChatGraphOperation)
    } else replyJson(response, reply.data, reply.status)
  })
  try {
    const api = createChatApi(fixture.baseURL)
    expect((await api.modelConnections()).items[0]?.allowedModels).toContain('general-demo')
    const conversation = await api.openAiConversation()
    const assigned = await api.assignConversationConnection(
      conversation.conversationId,
      'mock-local',
      true,
      'general-demo',
    )
    expect(assigned.model).toBe('general-demo')
    const response = await api.sendAiMessage(conversation.conversationId, {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      kind: 'send',
      parentMessageId: null,
      targetMessageId: null,
      message: 'Review a candidate',
      toolMode: 'none',
      context: {
        mode: 'code',
        expert: 'frontend',
        instructions: '',
        reasoning: 'default',
        approval: 'review',
        files: [],
        prototypeVersionId: '',
        targetPath: '',
      },
    })
    const plan = await api.chatPlan(conversation.conversationId, response.executionId!)
    expect(plan).toMatchObject({
      schemaVersion: 1,
      conversationId: conversation.conversationId,
      executionId: response.executionId,
      revision: 1,
    })
    expect(plan?.items.map((item) => item.status)).toEqual(['completed', 'in_progress', 'pending'])
    expect(await api.chatPlan(conversation.conversationId, response.executionId!)).toEqual(plan)
    expect(
      await api.chatPlan(conversation.conversationId, '00000000-0000-4000-8000-000000000000'),
    ).toBeNull()
    expect(response.proposal?.files[0]?.path).toBe('Example.vue')
    expect(response.proposal?.files[0]?.baseHash).toBe('')
    const messageRequest = fixture.requests.find((request) => request.url.endsWith('/messages'))!
    expect(messageRequest.method).toBe('POST')
    expect(messageRequest.url).toBe(`/ai/conversations/${conversation.conversationId}/messages`)
    expect(messageRequest.headers.accept).toBe('text/event-stream')
    expect(messageRequest.data).toEqual({
      operationId: expect.any(String),
      expectedRevision: 0,
      kind: 'send',
      parentMessageId: null,
      targetMessageId: null,
      message: 'Review a candidate',
      toolMode: 'none',
      context: {
        mode: 'code',
        expert: 'frontend',
        instructions: '',
        reasoning: 'default',
        approval: 'review',
        files: [],
        prototypeVersionId: '',
        targetPath: '',
      },
    })
    await expect(
      api.codeProposal(conversation.conversationId, response.proposal!.id),
    ).resolves.toMatchObject({
      status: 'PROPOSED',
      result: null,
      proposal: { id: response.proposal!.id, applied: false, writeAllowed: false },
    })
    await expect(
      api.applyCodeProposal(conversation.conversationId, response.proposal!.id),
    ).rejects.toMatchObject({ response: { status: 409, data: { error: 'BASELINE_UNKNOWN' } } })
    await expect(
      api.codeProposal(conversation.conversationId, response.proposal!.id),
    ).resolves.toMatchObject({
      status: 'PROPOSED',
      proposal: { applied: false, writeAllowed: false },
    })
    await api.deleteAiConversation(conversation.conversationId)
    await expect(api.aiConversation(conversation.conversationId)).rejects.toMatchObject({
      response: { status: 404 },
    })
  } finally {
    await fixture.close()
  }
})
