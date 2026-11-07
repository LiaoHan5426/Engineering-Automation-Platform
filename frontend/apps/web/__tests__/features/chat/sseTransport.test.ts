import { expect, it } from 'vite-plus/test'
import { createChatApi } from '@eap/runtime-client'
import { replyJson, sseFrame, startChatHttpFixture } from '../../chatHttpFixture'

const FRAME_LIMIT = 1_048_576 // Decoded UTF-16 code units, including metadata, excluding separator.

it.each(['callback', 'malformed'] as const)(
  'releases an open response after %s failure',
  async (failure) => {
    let closed!: () => void
    const connectionClosed = new Promise<void>((resolve) => {
      closed = resolve
    })
    const fixture = await startChatHttpFixture((_request, response) => {
      response.on('close', closed)
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.write(
        failure === 'callback' ? sseFrame('answer.delta', 1) : 'data: private-body\n\n',
      )
    })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1000)
    const sentinel = new Error('CALLER_FAILED')
    try {
      const pending = createChatApi(fixture.baseURL).sendAiMessage(
        'c1',
        'draft',
        'none',
        undefined,
        {
          signal: controller.signal,
          onEvent: () => {
            throw sentinel
          },
        },
      )
      if (failure === 'callback') await expect(pending).rejects.toBe(sentinel)
      else await expect(pending).rejects.toMatchObject({ message: 'AI_RESPONSE_INVALID' })
      await connectionClosed
      expect(controller.signal.aborted).toBe(false)
    } finally {
      clearTimeout(timeout)
      controller.abort()
      await fixture.close()
    }
  },
)

it('does not complete partial text when the HTTP connection fails', async () => {
  let failConnection!: () => void
  const fixture = await startChatHttpFixture((_request, response) => {
    failConnection = () => {
      response.destroy()
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write(sseFrame('answer.delta', 1))
  })
  try {
    const events: string[] = []
    await expect(
      createChatApi(fixture.baseURL).sendAiMessage('c1', 'draft', 'none', undefined, {
        onEvent: (event) => {
          events.push(event.type)
          failConnection()
        },
      }),
    ).rejects.toBeInstanceOf(Error)
    expect(events).toEqual(['answer.delta'])
  } finally {
    await fixture.close()
  }
})

it.each([
  ['CANCELLED', 'AI_CANCELLED', { error: 'AI_CANCELLED' }],
  ['FAILED', 'AI_PROVIDER_ERROR', null],
  [
    'FAILED',
    'AI_PROVIDER_ERROR',
    { status: 'FAILED', answer: 'partial', error: 'AI_PROVIDER_ERROR' },
  ],
] as const)('preserves %s final with sparse or null payload', async (status, code, payload) => {
  const fixture = await startChatHttpFixture((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(
      sseFrame('answer.delta', 1) +
        sseFrame('final', 2, payload)
          .replace('"status":"SUCCEEDED"', `"status":"${status}"`)
          .replace('"code":""', `"code":"${code}"`),
    )
  })
  try {
    await expect(
      createChatApi(fixture.baseURL).sendAiMessage('c1', 'draft', 'none'),
    ).resolves.toMatchObject({
      status,
      error: code,
      executionId: 'fixture-exec',
      answer: payload && 'answer' in payload ? payload.answer : 'simulated answer',
    })
  } finally {
    await fixture.close()
  }
})

it('forwards unknown event types without requiring a known domain payload schema', async () => {
  const fixture = await startChatHttpFixture((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(sseFrame('future.event', 1, ['opaque']) + sseFrame('final', 2, null))
  })
  try {
    const events: string[] = []
    await createChatApi(fixture.baseURL).sendAiMessage('c1', 'draft', 'none', undefined, {
      onEvent: (event) => events.push(event.type),
    })
    expect(events).toEqual(['future.event', 'final'])
  } finally {
    await fixture.close()
  }
})

it.each(['', '\n\n'])(
  'bounds a single frame even without its separator (%#)',
  async (separator) => {
    const fixture = await startChatHttpFixture((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.end(
        ':' + 'x'.repeat(FRAME_LIMIT) + separator + (separator ? sseFrame('final', 1) : ''),
      )
    })
    try {
      await expect(
        createChatApi(fixture.baseURL).sendAiMessage('c1', 'draft', 'none'),
      ).rejects.toMatchObject({
        message: 'AI_RESPONSE_TOO_LARGE',
        response: { status: 502, data: { detail: 'AI_RESPONSE_TOO_LARGE' } },
      })
    } finally {
      await fixture.close()
    }
  },
)

it('accepts the exact frame limit without treating total stream length as the limit', async () => {
  const fixture = await startChatHttpFixture(async (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write(':' + 'x'.repeat(FRAME_LIMIT - 1))
    for (const character of '\r\n\r\n') {
      response.write(character)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    response.end(':' + 'x'.repeat(FRAME_LIMIT - 1) + '\n\n' + sseFrame('final', 1))
  })
  try {
    await expect(
      createChatApi(fixture.baseURL).sendAiMessage('c1', 'draft', 'none'),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
    })
  } finally {
    await fixture.close()
  }
})

it.each([
  'data: private-body-not-json\n\n',
  'data:\n\n',
  'data: null\n\n',
  'data: {"type":"answer.delta","text":"private-body"}\n\n',
  sseFrame('answer.delta', 1).replace('"sequence":1', '"sequence":"1"'),
  sseFrame('answer.delta', 1).replace('"text":"simulated answer"', '"text":{}'),
  sseFrame('final', 2, 'private-body'),
  sseFrame('final', 2, { answer: { privateBody: true } }),
  // SSE joins data lines with LF, not concatenation into the valid number 12.
  sseFrame('answer.delta', 12).replace('"sequence":12', '"sequence":1\ndata: 2'),
])('rejects malformed consumed data before a later successful final (%#)', async (malformed) => {
  const fixture = await startChatHttpFixture((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(sseFrame('answer.delta', 1) + malformed + sseFrame('final', 3))
  })
  try {
    const events: string[] = []
    const failure = await createChatApi(fixture.baseURL)
      .sendAiMessage('c1', 'draft', 'none', undefined, {
        onEvent: (event) => events.push(event.type),
      })
      .catch((error: unknown) => error)
    expect(failure).toMatchObject({
      message: 'AI_RESPONSE_INVALID',
      response: { status: 502, data: { detail: 'AI_RESPONSE_INVALID' } },
    })
    expect(JSON.stringify(failure)).not.toContain('private-body')
    expect(events).toEqual(['answer.delta'])
  } finally {
    await fixture.close()
  }
})

it('settles at final and releases an open response without consuming later events', async () => {
  let closed!: () => void
  const connectionClosed = new Promise<void>((resolve) => {
    closed = resolve
  })
  const fixture = await startChatHttpFixture((_request, response) => {
    response.on('close', closed)
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write(sseFrame('final', 1) + sseFrame('answer.delta', 2))
    // Keep this response open: final, not HTTP EOF, is the terminal contract.
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1000)
  try {
    const events: string[] = []
    const result = await createChatApi(fixture.baseURL).sendAiMessage(
      'c1',
      'draft',
      'none',
      undefined,
      {
        signal: controller.signal,
        onEvent: (event) => events.push(event.type),
      },
    )
    expect(result.status).toBe('SUCCEEDED')
    expect(events).toEqual(['final'])
    await connectionClosed
    expect(controller.signal.aborted).toBe(false)
  } finally {
    clearTimeout(timeout)
    controller.abort()
    await fixture.close()
  }
})

it('reads CRLF frames with multiline JSON across line and UTF-8 chunk boundaries', async () => {
  const final = sseFrame('final', 2)
    .replace('"text":""', '"text":"边界🙂"')
    .replace('"sequence":2,', '"sequence":2,\ndata: ')
    .replaceAll('\n', '\r\n')
  const bytes = Buffer.from(': heartbeat\r\n\r\n' + sseFrame('answer.delta', 1) + final)
  const unicode = bytes.indexOf(Buffer.from('边'))
  const fixture = await startChatHttpFixture(async (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
    for (const chunk of [
      bytes.subarray(0, unicode + 1),
      bytes.subarray(unicode + 1, unicode + 2),
      bytes.subarray(unicode + 2, bytes.length - 3),
      bytes.subarray(bytes.length - 3),
    ]) {
      response.write(chunk)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    response.end()
  })
  try {
    const events: string[] = []
    const result = await createChatApi(fixture.baseURL).sendAiMessage(
      'c1',
      'draft',
      'none',
      undefined,
      {
        onEvent: (event) => events.push(event.type),
      },
    )
    expect(result.answer).toBe('边界🙂')
    expect(events).toEqual(['answer.delta', 'final'])
    expect(fixture.requests).toMatchObject([
      {
        method: 'POST',
        url: '/ai/conversations/c1/messages',
        headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
        data: { message: 'draft', toolMode: 'none' },
      },
    ])
  } finally {
    await fixture.close()
  }
})

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

it.each(['', sseFrame('final', 2).trimEnd()])(
  'rejects premature EOF after a visible delta without a complete final (%#)',
  async (trailing) => {
    const fixture = await startChatHttpFixture((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.end(sseFrame('answer.delta', 1) + trailing)
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
  },
)

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
