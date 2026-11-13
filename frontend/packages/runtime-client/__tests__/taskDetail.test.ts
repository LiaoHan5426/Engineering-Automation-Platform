import { describe, expect, it } from 'vite-plus/test'
import { createServer } from 'node:http'
import { createRequestClient } from '@eap/request'
import { createTaskDetailApi } from '../src/taskDetail'

async function fixture(
  run: (
    api: ReturnType<typeof createTaskDetailApi>,
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
    if (req.url?.includes('/invalid-')) {
      const field = req.url.endsWith('goal') ? 'goal' : 'acceptanceCriteria'
      res.end(
        JSON.stringify({
          goal: 'Goal',
          acceptanceCriteria: 'Criteria',
          connectionId: 'c',
          model: 'm',
          [field]: req.url.includes('long') ? 'x'.repeat(2001) : '   ',
        }),
      )
      return
    }
    res.end(
      JSON.stringify({
        acceptanceCriteria: 'Criteria',
        goal: 'Goal\nPreserve original scope',
        connectionId: 'connection',
        model: 'model',
      }),
    )
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as import('node:net').AddressInfo).port
  try {
    await run(
      createTaskDetailApi(createRequestClient({ baseURL: `http://127.0.0.1:${port}/api` })),
      requests,
    )
  } finally {
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
}

describe('task detail optimization transport', () => {
  it('validates each field independently on input and output without truncation', async () => {
    await fixture(async (api, requests) => {
      for (const key of ['goal', 'acceptanceCriteria']) {
        for (const value of ['   ', 'x'.repeat(2001)]) {
          await expect(
            api.optimizeTaskDetail('input', { goal: 'G', acceptanceCriteria: 'A', [key]: value }),
          ).rejects.toThrow('INVALID_REQUEST')
        }
      }
      expect(requests).toHaveLength(0)
      for (const id of [
        'invalid-empty-goal',
        'invalid-long-goal',
        'invalid-empty-criteria',
        'invalid-long-criteria',
      ]) {
        await expect(
          api.optimizeTaskDetail(id, { goal: 'G', acceptanceCriteria: 'A' }),
        ).rejects.toThrow('AI_RESPONSE_INVALID')
      }
    })
  })
  it('sends unchanged multiline text and selected model through the task-only HTTP contract', async () => {
    await fixture(async (api, requests) => {
      const request = {
        acceptanceCriteria: 'Criteria',
        goal: 'Original\n  scope',
        connectionId: 'connection',
        model: 'model',
      }
      expect(await api.optimizeTaskDetail('id/with slash', request)).toEqual({
        acceptanceCriteria: 'Criteria',
        goal: 'Goal\nPreserve original scope',
        connectionId: 'connection',
        model: 'model',
      })
      expect(requests).toEqual([
        {
          method: 'POST',
          url: '/api/ai/task-detail/optimizations/id%2Fwith%20slash',
          body: JSON.stringify(request),
        },
      ])
      expect(request.goal).toBe('Original\n  scope')
    })
  })
  it('aborts pending HTTP and sends independent DELETE cancellation, including repeats', async () => {
    await fixture(async (api, requests) => {
      const controller = new AbortController()
      const pending = api.optimizeTaskDetail(
        'pending',
        { goal: 'Original', acceptanceCriteria: 'Criteria' },
        { signal: controller.signal },
      )
      const rejected = expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' })
      await new Promise<void>((done) => {
        const check = () => (requests.length ? done() : setImmediate(check))
        check()
      })
      controller.abort()
      await rejected
      await api.cancelTaskDetailOptimization('pending')
      await api.cancelTaskDetailOptimization('pending')
      expect(requests.map((request) => request.method)).toEqual(['POST', 'DELETE', 'DELETE'])
    })
  })
  it('preserves stable backend error envelopes without turning failures into suggestions', async () => {
    await fixture(async (api) => {
      await expect(
        api.optimizeTaskDetail('failure', { goal: 'Original', acceptanceCriteria: 'Criteria' }),
      ).rejects.toMatchObject({ response: { status: 503, data: { code: 'AI_NOT_CONFIGURED' } } })
    })
  })
})
