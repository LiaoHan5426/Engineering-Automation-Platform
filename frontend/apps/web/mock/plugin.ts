import type { Plugin } from 'vite-plus'
import { createMockChatBackend } from './chatBackend'

export function mockBackend(): Plugin {
  return {
    name: 'eap-mock-backend',
    apply: 'serve',
    configureServer(server) {
      const backend = createMockChatBackend()
      server.middlewares.use('/api', async (req, res) => {
        // This namespace never proxies to Java or any external model service.
        try {
          let raw = ''
          for await (const chunk of req) {
            raw += chunk.toString()
            if (raw.length > 262144) {
              res.statusCode = 413
              res.end()
              return
            }
          }
          const body = raw ? JSON.parse(raw) : {}
          const url = new URL(req.url ?? '/', 'http://mock.local')
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
            const frames = [
              {
                type: 'status',
                sequence: 1,
                status: 'RUNNING',
                text: '',
                code: '',
                executionId,
                conversationId,
              },
              {
                type: 'answer.delta',
                sequence: 2,
                status: 'RUNNING',
                text: payload.answer ?? '',
                code: '',
                executionId,
                conversationId,
              },
              {
                type: 'final',
                sequence: 3,
                status: payload.status ?? 'SUCCEEDED',
                text: payload.answer ?? '',
                code: payload.error ?? '',
                executionId,
                conversationId,
                payload: { ...payload, executionId },
              },
            ]
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
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(reply.data))
        } catch {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'MOCK_BAD_REQUEST' }))
        }
      })
    },
  }
}
