import type { IncomingMessage, ServerResponse } from 'node:http'
import { createMockChatBackend } from './chatBackend.ts'
import { mockLanguage, mockProblem } from './problems.ts'
import { ChatExecutionStatus } from '@eap/runtime-client/contracts'

async function readJson(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > limit) throw new RangeError('MOCK_INPUT_TOO_LARGE')
    chunks.push(buffer)
  }
  const value: unknown = bytes ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('MOCK_BAD_REQUEST')
  return value as Record<string, unknown>
}

/** Independent local development service. It never forwards requests to Java or a provider. */
export function createMockHandler() {
  const backend = createMockChatBackend()
  const faults = new Map<string, string>()
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('X-EAP-Simulation', 'true')
    if (req.url === '/__mock/faults' && req.method === 'POST') {
      try {
        const { method, path, outcome } = await readJson(req, 4096)
        if (
          typeof method !== 'string' ||
          !['POST', 'PUT'].includes(method) ||
          typeof path !== 'string' ||
          !/^\/api\/(?:scenarios\/[a-z0-9_-]+|runtime\/trusted-tools\/(?:git-status|git-diff)\/probe-version|cli-programs\/git\/operations\/(?:git-status|git-diff)\/executions)$/.test(
            path,
          ) ||
          typeof outcome !== 'string' ||
          !['save-lost', 'running', 'unknown', 'success', 'fail', 'conflict', 'disabled'].includes(
            outcome,
          )
        )
          throw new Error('input')
        faults.set(method + ' ' + path, outcome)
        res
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ armed: true, once: true }))
      } catch {
        res
          .writeHead(400, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ code: 'MOCK_FAULT_INVALID' }))
      }
      return
    }
    if (!req.url?.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 'MOCK_ROUTE_NOT_FOUND' }))
      return
    }
    const original = new URL(req.url, 'http://mock.local')
    const faultKey = req.method + ' ' + original.pathname
    const fault = faults.get(faultKey)
    if (fault) {
      faults.delete(faultKey)
      original.searchParams.set('mockOutcome', fault)
    }
    req.url = original.pathname.slice(4) + original.search
    const language = mockLanguage(String(req.headers['accept-language'] ?? ''))
    res.setHeader('Content-Language', language)
    // This namespace never proxies to Java or any external model service.
    try {
      const body = await readJson(
        req,
        /\/ai\/conversations\/[^/]+\/messages$/.test(req.url ?? '') ||
          /\/ai\/speech\/(transcriptions|synthesis)$/.test(req.url ?? '')
          ? 24 * 1024 * 1024
          : 262144,
      )
      const url = new URL(req.url ?? '/', 'http://mock.local')
      if (url.pathname.startsWith('/ai/speech/')) res.setHeader('Cache-Control', 'no-store')
      if (url.searchParams.has('connectionId'))
        body.connectionId = url.searchParams.get('connectionId')
      const reply = await backend.handle(req.method ?? 'GET', url.pathname + url.search, body)
      const sse =
        reply.status === 200 &&
        (req.method ?? 'GET').toUpperCase() === 'POST' &&
        /\/ai\/conversations\/[^/]+\/messages$/.test(url.pathname) &&
        String(req.headers.accept ?? '').includes('text/event-stream')
      if (sse) {
        const payload = reply.data as {
          executionId?: string | null
          answer?: string
          error?: string
          status?: string
          toolEvents?: Array<{ sequence: number; code: string }>
        }
        const executionId = payload.executionId || 'mock-exec'
        const conversationId = url.pathname.split('/')[3] ?? ''
        const operation = await backend.handle(
          'GET',
          `/ai/conversations/${conversationId}/operations/${encodeURIComponent(String(body.operationId))}`,
          {},
        )
        const frames = [
          {
            type: 'accepted',
            sequence: 0,
            status: ChatExecutionStatus.RUNNING,
            text: '',
            code: '',
            executionId,
            conversationId,
            payload: operation.data,
          },
          {
            type: 'status',
            sequence: 1,
            status: ChatExecutionStatus.RUNNING,
            text: '',
            code: '',
            executionId,
            conversationId,
          },
          {
            type: 'answer.delta',
            sequence: 2,
            status: ChatExecutionStatus.RUNNING,
            text: payload.answer ?? '',
            code: '',
            executionId,
            conversationId,
          },
          {
            type: 'final',
            sequence: 3,
            status: payload.status ?? ChatExecutionStatus.SUCCEEDED,
            text: payload.answer ?? '',
            code: payload.error ?? '',
            executionId,
            conversationId,
            payload: { ...payload, executionId },
            message: payload.error
              ? mockProblem(400, { code: payload.error }, language).detail
              : '',
          },
        ]
        const planReply = await backend.handle(
          'GET',
          `/ai/conversations/${conversationId}/executions/${executionId}/plan`,
          {},
        )
        if (planReply.status === 200 && planReply.data) {
          frames.splice(1, 0, {
            type: 'plan.updated',
            sequence: 2,
            status: ChatExecutionStatus.RUNNING,
            text: '',
            code: '',
            executionId,
            conversationId,
            payload: planReply.data,
          } as (typeof frames)[number])
          frames.forEach((frame, index) => {
            frame.sequence = index + 1
          })
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        for (const frame of frames) {
          res.write(
            `id: ${executionId}-${frame.sequence}\nevent: ${frame.type}\ndata: ${JSON.stringify({
              eventId: `${executionId}-${frame.sequence}`,
              protocolVersion: '1',
              occurredAt: new Date().toISOString(),
              ...frame,
            })}\n\n`,
          )
        }
        res.end()
        return
      }
      res.statusCode = reply.status
      res.setHeader(
        'Content-Type',
        reply.status >= 400
          ? 'application/problem+json; charset=utf-8'
          : 'application/json; charset=utf-8',
      )
      res.end(
        JSON.stringify(
          reply.status >= 400 ? mockProblem(reply.status, reply.data, language) : reply.data,
        ),
      )
    } catch (error) {
      const oversized = error instanceof RangeError
      res.statusCode = oversized ? 413 : 400
      res.setHeader('Content-Type', 'application/problem+json; charset=utf-8')
      res.end(
        JSON.stringify(
          mockProblem(
            res.statusCode,
            { code: oversized ? 'MOCK_INPUT_TOO_LARGE' : 'MOCK_BAD_REQUEST' },
            String(req.headers['accept-language'] ?? ''),
          ),
        ),
      )
    }
  }
}
