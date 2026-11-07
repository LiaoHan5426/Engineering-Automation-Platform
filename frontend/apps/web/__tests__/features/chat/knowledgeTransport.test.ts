import { expect, it } from 'vite-plus/test'
import { createChatApi } from '@eap/runtime-client'
import { replyChatSse, replyJson, startChatHttpFixture } from '../../chatHttpFixture'

it('preserves server null for ordinary chat and omits an unsupplied expert reference', async () => {
  const fixture = await startChatHttpFixture((_request, response) => {
    replyChatSse(response, { knowledgeContext: null, knowledgeMemoryCleared: false })
  })
  try {
    const events: string[] = []
    const answer = await createChatApi(fixture.baseURL).sendAiMessage(
      'c1',
      'ordinary question',
      'none',
      undefined,
      { signal: new AbortController().signal, onEvent: (event) => events.push(event.type) },
    )
    expect(fixture.requests).toHaveLength(1)
    expect(fixture.requests[0]).toMatchObject({
      method: 'POST',
      url: '/ai/conversations/c1/messages',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
      data: { message: 'ordinary question', toolMode: 'none' },
    })
    expect(fixture.requests[0]!.data).toEqual({ message: 'ordinary question', toolMode: 'none' })
    expect(events).toEqual(['status', 'answer.delta', 'final'])
    expect(answer.knowledgeContext).toBeNull()
    expect(answer.knowledgeMemoryCleared).toBe(false)
  } finally {
    await fixture.close()
  }
})

it('serializes exact expert revision and draft through the shared client without injecting preview text', async () => {
  const expertRef = { id: 'saved-expert', revision: 7 }
  const preview = {
    expertRef,
    status: 'ready',
    references: [
      {
        id: 'K1',
        source: 'guide',
        knowledgeBase: 'rules',
        excerpt: 'untrusted excerpt',
        retrievalMode: 'keyword',
      },
    ],
  }
  const fixture = await startChatHttpFixture((request, response) => {
    if (request.url.endsWith('/preview')) replyJson(response, preview)
    else replyChatSse(response, { knowledgeContext: preview, knowledgeMemoryCleared: true })
  })
  try {
    const api = createChatApi(fixture.baseURL)
    expect(await api.previewExpertContext(expertRef, 'original draft')).toEqual(preview)
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
    const answer = await api.sendAiMessage('c1', 'original draft', 'none', context)
    expect(fixture.requests.map(({ method, url, data }) => ({ method, url, data }))).toEqual([
      {
        method: 'POST',
        url: '/ai/expert-context/preview',
        data: { expertRef, query: 'original draft' },
      },
      {
        method: 'POST',
        url: '/ai/conversations/c1/messages',
        data: { message: 'original draft', toolMode: 'none', context },
      },
    ])
    expect(answer.knowledgeContext).toEqual(preview)
    expect(answer.knowledgeMemoryCleared).toBe(true)
    expect(fixture.requests[1]!.headers.accept).toBe('text/event-stream')
  } finally {
    await fixture.close()
  }
})
