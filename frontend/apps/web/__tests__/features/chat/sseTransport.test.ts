import { expect, it } from 'vite-plus/test'
import { createChatApi } from '@eap/runtime-client'
import { replyJson, sseFrame, startChatHttpFixture } from '../../chatHttpFixture'

it('preserves an authorization-reference conflict without treating JSON as a successful stream', async () => {
  const fixture = await startChatHttpFixture((_request, response) => {
    replyJson(response, { detail: 'EXPERT_CONTEXT_STALE', revision: 8 }, 409)
  })
  try {
    const expertRef = { id: 'saved-expert', revision: 7 }
    const context = {
      mode: 'chat' as const,
      expert: 'general' as const,
      instructions: '',
      reasoning: 'default' as const,
      approval: 'review' as const,
      files: [],
      prototypeVersionId: '',
      targetPath: '',
      knowledgeExpertRef: expertRef,
    }
    await expect(
      createChatApi(fixture.baseURL).sendAiMessage('c1', 'draft', 'none', context),
    ).rejects.toMatchObject({
      response: { status: 409, data: { detail: 'EXPERT_CONTEXT_STALE', revision: 8 } },
    })
    expect(fixture.requests.map(({ data }) => data)).toEqual([
      { message: 'draft', toolMode: 'none', context },
    ])
  } finally {
    await fixture.close()
  }
})

it('rejects premature EOF after a visible delta instead of reporting a completed answer', async () => {
  const fixture = await startChatHttpFixture((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(sseFrame('answer.delta', 1))
  })
  try {
    const events: string[] = []
    await expect(
      createChatApi(fixture.baseURL).sendAiMessage('c1', 'draft', 'none', undefined, {
        onEvent: (event) => events.push(event.type),
      }),
    ).rejects.toMatchObject({
      response: { status: 502, data: { detail: 'AI_RESPONSE_INCOMPLETE' } },
    })
    expect(events).toEqual(['answer.delta'])
  } finally {
    await fixture.close()
  }
})

it('forwards the caller AbortSignal to the actual fetch stream after a visible delta', async () => {
  const fixture = await startChatHttpFixture((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write(sseFrame('answer.delta', 1))
    // Deliberately no final frame: the caller cancels this owned fixture stream.
  })
  try {
    const controller = new AbortController()
    const events: string[] = []
    await expect(
      createChatApi(fixture.baseURL).sendAiMessage('c1', 'draft', 'none', undefined, {
        signal: controller.signal,
        onEvent: (event) => {
          events.push(event.type)
          controller.abort()
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(events).toEqual(['answer.delta'])
    expect(fixture.requests).toHaveLength(1)
  } finally {
    await fixture.close()
  }
})
