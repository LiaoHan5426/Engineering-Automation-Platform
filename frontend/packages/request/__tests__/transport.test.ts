import { afterEach, expect, it } from 'vite-plus/test'
import { createServer, type Server } from 'node:http'
import {
  createRequestClient,
  createUploadRequest,
  download,
  isRequestCancelled,
  openStream,
} from '../src'

let server: Server
afterEach(async () => {
  if (server)
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
})
async function endpoint() {
  const calls: Array<{ url: string; headers: Record<string, unknown>; body: string }> = []
  server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk.toString()
    calls.push({ url: req.url!, headers: req.headers, body })
    if (req.url === '/slow') return
    if (req.url === '/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.end('data: ready\n\n')
      return
    }
    if (req.url === '/error') {
      res.writeHead(409, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 'CONFLICT', detail: 'conflict' }))
      return
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename=example.txt',
    })
    res.end(JSON.stringify({ received: true }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing port')
  return { url: `http://127.0.0.1:${address.port}`, calls }
}
it('shares dynamic headers with JSON and stream requests, retains HTTP problems and does not replay writes', async () => {
  const { url, calls } = await endpoint()
  let language = 'zh-CN'
  const pending: number[] = []
  const client = createRequestClient({
    baseURL: url,
    headersForRequest: () => ({ 'Accept-Language': language }),
    onPendingChange: (count) => pending.push(count),
  })
  await client.get('/json')
  language = 'en-US'
  expect(await (await openStream(client, '/stream')).text()).toBe('data: ready\n\n')
  await expect(openStream(client, '/error', { method: 'POST', body: {} })).rejects.toMatchObject({
    response: { status: 409, data: { code: 'CONFLICT' } },
  })
  expect(calls.map((call) => call.headers['accept-language'])).toEqual(['zh-CN', 'en-US', 'en-US'])
  expect(calls.filter((call) => call.url === '/error')).toHaveLength(1)
  expect(pending).toEqual([1, 0])
})
it('cancels JSON and stream handshakes, times out headers, and returns pending requests to zero', async () => {
  const { url } = await endpoint()
  const pending: number[] = []
  const client = createRequestClient({
    baseURL: url,
    onPendingChange: (count) => pending.push(count),
  })
  const controller = new AbortController()
  const request = client.get('/slow', { signal: controller.signal })
  controller.abort()
  const error = await request.catch((reason: unknown) => reason)
  expect(isRequestCancelled(error)).toBe(true)
  expect(pending.at(-1)).toBe(0)
  await expect(openStream(client, '/slow', { timeout: 30 })).rejects.toMatchObject({
    name: 'TimeoutError',
  })
  const cancelled = new AbortController()
  cancelled.abort()
  await expect(openStream(client, '/slow', { signal: cancelled.signal })).rejects.toMatchObject({
    name: 'AbortError',
  })
})
it('uploads caller-defined multipart fields and downloads without browser or business dependencies', async () => {
  const { url, calls } = await endpoint()
  const client = createRequestClient({ baseURL: url })
  const upload = createUploadRequest(client, '/upload', {
    fieldName: 'attachment',
    fields: { category: 'document' },
  })
  expect(
    await upload(new File(['file body'], 'note.txt'), {
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
  ).toEqual({ received: true })
  expect(calls[0]?.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/)
  expect(calls[0]?.body).toContain('name="attachment"; filename="note.txt"')
  expect(calls[0]?.body).toContain('file body')
  expect(calls[0]?.body).toContain('name="category"')
  const response = await download<string>(client, '/download', { responseType: 'text' })
  expect(response.headers['content-disposition']).toContain('example.txt')
  expect(response.data).toBe('{"received":true}')
})
