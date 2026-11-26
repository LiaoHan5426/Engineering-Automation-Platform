import { createServer } from 'node:http'
import { createMockHandler } from './handler.ts'
import { acceptMockNotifyWs } from './notifyBackend.ts'

const port = Number(process.env.EAP_MOCK_PORT ?? 53200)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid EAP_MOCK_PORT')
const server = createServer(createMockHandler())
server.on('upgrade', (req, socket, _head) => {
  const url = new URL(req.url ?? '/', 'http://mock.local')
  if (!url.pathname.endsWith('/notify/ws') && url.pathname !== '/api/notify/ws') {
    socket.destroy()
    return
  }
  const after = Number(url.searchParams.get('after') ?? '0')
  acceptMockNotifyWs(req, socket, Number.isFinite(after) ? after : 0)
})
server.listen(port, '127.0.0.1', () =>
  process.stdout.write(`Mock service: http://127.0.0.1:${port}/api (simulation only)\n`),
)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close())
