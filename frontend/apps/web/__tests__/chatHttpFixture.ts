import type { ChatGraphRequest, TaskContext } from '@eap/runtime-client'
import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http'

export interface FixtureRequest {
  method: string
  url: string
  data: Record<string, unknown> | undefined
  headers: IncomingHttpHeaders
}

/** Simulated protocol only; no provider/model calls. Bound to a worker-owned ephemeral endpoint. */
export async function startChatHttpFixture(
  handle: (request: FixtureRequest, response: ServerResponse) => void | Promise<void>,
) {
  const requests: FixtureRequest[] = []
  const server = createServer(async (req, res) => {
    try {
      let raw = ''
      for await (const chunk of req) {
        raw += chunk.toString()
        if (raw.length > 262144) {
          res.writeHead(413).end()
          return
        }
      }
      const request = {
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        data: raw ? JSON.parse(raw) : undefined,
        headers: req.headers,
      }
      requests.push(request)
      await handle(request, res)
    } catch {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  })
  server.requestTimeout = 5000
  server.headersTimeout = 5000
  server.setTimeout(5000, (socket) => socket.destroy())
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture port')
  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      }),
  }
}

export function replyJson(response: ServerResponse, data: unknown, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(data))
}

export function sseFrame(type: string, sequence: number, payload?: unknown) {
  return `id: fixture-exec-${sequence}\nevent: ${type}\ndata: ${JSON.stringify({
    eventId: `fixture-exec-${sequence}`,
    protocolVersion: '1',
    occurredAt: '2026-01-01T00:00:00Z',
    executionId: 'fixture-exec',
    conversationId: 'c1',
    type,
    sequence,
    status: type === 'final' ? 'SUCCEEDED' : 'RUNNING',
    text: type === 'answer.delta' ? 'simulated answer' : '',
    code: '',
    ...(payload === undefined ? {} : { payload }),
  })}\n\n`
}

export function replyChatSse(response: ServerResponse, payload: unknown) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
  response.write(acceptedFrame())
  response.write(sseFrame('status', 1))
  response.write(sseFrame('answer.delta', 2))
  response.end(sseFrame('final', 3, payload))
}

export function graphRequest(message = 'draft', context?: TaskContext): ChatGraphRequest {
  return {
    operationId: '11111111-1111-4111-8111-111111111111',
    expectedRevision: 0,
    kind: 'send',
    parentMessageId: null,
    targetMessageId: null,
    message,
    toolMode: 'none',
    ...(context ? { context } : {}),
  }
}
export function acceptedFrame() {
  return sseFrame('accepted', 0, {
    operationId: graphRequest().operationId,
    userMessageId: 'fixture-user',
    assistantMessageId: 'fixture-assistant',
    executionId: 'fixture-exec',
    graphRevision: 1,
  })
}
