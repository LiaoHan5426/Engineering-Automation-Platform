import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { describe, expect, it } from 'vite-plus/test'
import { createMockHandler } from '../src/handler'

describe('explicit task description Mock HTTP contract', () => {
  it('preserves multiline text, limits, cancellation and stable ProblemDetail codes', async () => {
    const server = createServer(createMockHandler())
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const port = (server.address() as import('node:net').AddressInfo).port
    const base = `http://127.0.0.1:${port}/api/ai/task-description/optimizations/`
    const post = (id: string, text: string) =>
      fetch(base + id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
    try {
      const success = await post(randomUUID(), '任务列表导出\n保留筛选条件')
      expect(success.headers.get('X-EAP-Simulation')).toBe('true')
      expect(await success.json()).toMatchObject({
        text: '任务目标\n任务列表导出\n保留筛选条件',
        model: 'task-description-simulation',
      })
      for (const [text, status, code] of [
        ['  ', 400, 'INVALID_REQUEST'],
        ['x'.repeat(12001), 413, 'INVALID_REQUEST'],
        ['x'.repeat(2000), 502, 'AI_RESPONSE_OUTPUT_LIMIT'],
      ] as const) {
        const response = await post(randomUUID(), text)
        expect(response.status).toBe(status)
        expect(response.headers.get('content-type')).toContain('application/problem+json')
        expect(await response.json()).toMatchObject({ status, code })
      }
      const id = randomUUID()
      expect((await fetch(base + id, { method: 'DELETE' })).status).toBe(204)
      expect((await fetch(base + id, { method: 'DELETE' })).status).toBe(204)
      const cancelled = await post(id, '原文')
      expect(cancelled.status).toBe(409)
      expect(await cancelled.json()).toMatchObject({ code: 'AI_CANCELLED' })
    } finally {
      server.closeAllConnections()
      await new Promise<void>((done) => server.close(() => done()))
    }
  })
})
