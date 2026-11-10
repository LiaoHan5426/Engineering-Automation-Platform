import { createServer } from 'node:http'
import { createMockHandler } from './handler.ts'

const port = Number(process.env.EAP_MOCK_PORT ?? 53200)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid EAP_MOCK_PORT')
const server = createServer(createMockHandler())
server.listen(port, '127.0.0.1', () =>
  process.stdout.write(`Mock service: http://127.0.0.1:${port}/api (simulation only)\n`),
)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close())
