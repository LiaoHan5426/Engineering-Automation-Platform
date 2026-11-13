import { describe, expect, it } from 'vite-plus/test'
import { createServer } from 'node:http'
import { createRequestClient } from '@eap/request'
import { createTaskDescriptionApi } from '../src/taskDescription'

async function fixture(
  run: (
    api: ReturnType<typeof createTaskDescriptionApi>,
    requests: Array<{ method: string; url: string; body: string }>,
  ) => Promise<void>,
) {
  const requests: Array<{ method: string; url: string; body: string }> = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const part of req) body += part
    requests.push({ method: req.method!, url: req.url!, body })
    if (req.method === 'DELETE') {
      res.writeHead(204).end()
      return
    }
    if (req.url?.endsWith('/pending')) return
    res.setHeader('Content-Type', 'application/json')
    if (req.url?.endsWith('/failure')) {
      res
        .writeHead(503)
        .end(JSON.stringify({ code: 'AI_NOT_CONFIGURED', detail: 'Model unavailable' }))
      return
    }
    res.end(
      JSON.stringify({
        text: 'Goal\nPreserve original scope',
        connectionId: 'connection',
        model: 'model',
      }),
    )
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as import('node:net').AddressInfo).port
  try {
    await run(
      createTaskDescriptionApi(createRequestClient({ baseURL: `http://127.0.0.1:${port}/api` })),
      requests,
    )
  } finally {
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
}

describe('task description optimization transport', () => {
  it('sends unchanged multiline text and selected model through the task-only HTTP contract', async () => {
    await fixture(async (api, requests) => {
      const request = { text: 'Original\n  scope', connectionId: 'connection', model: 'model' }
      expect(await api.optimizeTaskDescription('id/with slash', request)).toEqual({
        text: 'Goal\nPreserve original scope',
        connectionId: 'connection',
        model: 'model',
      })
      expect(requests).toEqual([
        {
          method: 'POST',
          url: '/api/ai/task-description/optimizations/id%2Fwith%20slash',
          body: JSON.stringify(request),
        },
      ])
      expect(request.text).toBe('Original\n  scope')
    })
  })
  it('aborts pending HTTP and sends independent DELETE cancellation, including repeats', async () => {
    await fixture(async (api, requests) => {
      const controller = new AbortController()
      const pending = api.optimizeTaskDescription(
        'pending',
        { text: 'Original' },
        { signal: controller.signal },
      )
      const rejected = expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' })
      await new Promise<void>((done) => {
        const check = () => (requests.length ? done() : setImmediate(check))
        check()
      })
      controller.abort()
      await rejected
      await api.cancelTaskDescriptionOptimization('pending')
      await api.cancelTaskDescriptionOptimization('pending')
      expect(requests.map((request) => request.method)).toEqual(['POST', 'DELETE', 'DELETE'])
    })
  })
  it('preserves stable backend error envelopes without turning failures into suggestions', async () => {
    await fixture(async (api) => {
      await expect(
        api.optimizeTaskDescription('failure', { text: 'Original' }),
      ).rejects.toMatchObject({ response: { status: 503, data: { code: 'AI_NOT_CONFIGURED' } } })
    })
  })
})
