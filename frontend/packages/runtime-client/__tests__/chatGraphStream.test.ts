import { expect, it } from 'vite-plus/test'
import { createServer } from 'node:http'
import { createChatApi } from '../src/index'
import type { AiMessageResult, ChatGraphRequest } from '../src/contracts'
it('binds accepted operation before deduplicating scoped frames and ignores foreign finals', async () => {
  const operationId = '00000000-0000-4000-8000-000000000001'
  const final: AiMessageResult = {
    executionId: 'execution',
    answer: 'confirmed',
    status: 'SUCCEEDED',
    error: '',
    approval: '',
    verification: '',
    toolEvents: [],
    artifactError: '',
    artifacts: [],
  }
  const server = createServer((request, response) => {
    request.resume()
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    function frame(
      type: string,
      sequence: number,
      payload?: unknown,
      conversationId = 'conversation',
      executionId = 'execution',
    ) {
      response.write(
        `event: ${type}\ndata: ${JSON.stringify({ eventId: `${executionId}:${sequence}`, sequence, executionId, conversationId, protocolVersion: '1', occurredAt: '2026-01-01T00:00:00Z', type, status: type === 'final' ? 'SUCCEEDED' : 'RUNNING', text: type === 'answer.delta' ? 'delta' : '', code: '', payload })}\n\n`,
      )
    }
    frame('final', 100, { ...final, answer: 'foreign' }, 'other')
    frame('accepted', 1, {
      operationId,
      executionId: 'execution',
      userMessageId: 'user',
      assistantMessageId: 'assistant',
    })
    frame('answer.delta', 2)
    frame('answer.delta', 2)
    frame('answer.delta', 500, undefined, 'conversation', 'other-execution')
    frame('final', 3, final)
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No port')
  try {
    const api = createChatApi(`http://127.0.0.1:${address.port}`)
    const events: number[] = []
    const request: ChatGraphRequest = {
      operationId,
      expectedRevision: 0,
      kind: 'send',
      parentMessageId: null,
      targetMessageId: null,
      message: 'hello',
      toolMode: 'none',
    }
    expect(
      await api.sendAiMessage('conversation', request, {
        onEvent: (event) => {
          events.push(event.sequence)
        },
      }),
    ).toMatchObject({ answer: 'confirmed' })
    expect(events).toEqual([1, 2, 3])
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
      server.closeAllConnections()
    })
  }
})
