import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { surfacesFor, type NotifyEvent, type NotifyKind, type NotifySeverity } from '@eap/runtime-client'

type HubEvent = NotifyEvent

const events: HubEvent[] = []
let sequence = 0
const sseWaiters = new Set<(event: HubEvent) => void>()

export function publishMockNotify(input: {
  kind: NotifyKind
  severity: NotifySeverity
  code: string
  title: string
  text: string
  conversationId?: string
}): HubEvent {
  sequence += 1
  const event: HubEvent = {
    eventId: randomBytes(8).toString('hex'),
    sequence,
    occurredAt: new Date().toISOString(),
    protocolVersion: '1',
    kind: input.kind,
    severity: input.severity,
    code: input.code,
    title: input.title,
    text: input.text,
    surfaces: surfacesFor(input.kind, input.severity),
    target: input.conversationId ? { conversationId: input.conversationId } : undefined,
  }
  events.push(event)
  if (events.length > 500) events.shift()
  for (const waiter of sseWaiters) waiter(event)
  return event
}

export function mockNotifySnapshot(after = 0) {
  return {
    events: events.filter((event) => event.sequence > after),
    latestSequence: sequence,
  }
}

export async function writeMockNotifySse(
  req: IncomingMessage,
  res: ServerResponse,
  after = 0,
): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  for (const event of mockNotifySnapshot(after).events) {
    res.write(`id: ${event.eventId}\nevent: notify\ndata: ${JSON.stringify(event)}\n\n`)
  }
  const onEvent = (event: HubEvent) => {
    res.write(`id: ${event.eventId}\nevent: notify\ndata: ${JSON.stringify(event)}\n\n`)
  }
  sseWaiters.add(onEvent)
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n')
  }, 15000)
  await new Promise<void>((resolve) => {
    req.on('close', () => {
      clearInterval(heartbeat)
      sseWaiters.delete(onEvent)
      resolve()
    })
  })
}

export function acceptMockNotifyWs(req: IncomingMessage, socket: Duplex, after = 0) {
  const key = req.headers['sec-websocket-key']
  if (typeof key !== 'string') {
    socket.destroy()
    return
  }
  const accept = createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
      accept +
      '\r\n\r\n',
  )
  const send = (payload: unknown) => {
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    let header: Buffer
    if (body.length < 126) {
      header = Buffer.alloc(2)
      header[0] = 0x81
      header[1] = body.length
    } else if (body.length < 65536) {
      header = Buffer.alloc(4)
      header[0] = 0x81
      header[1] = 126
      header.writeUInt16BE(body.length, 2)
    } else {
      header = Buffer.alloc(10)
      header[0] = 0x81
      header[1] = 127
      header.writeBigUInt64BE(BigInt(body.length), 2)
    }
    socket.write(Buffer.concat([header, body]))
  }
  for (const event of mockNotifySnapshot(after).events) send(event)
  const onEvent = (event: HubEvent) => send(event)
  sseWaiters.add(onEvent)
  socket.on('close', () => sseWaiters.delete(onEvent))
  socket.on('error', () => sseWaiters.delete(onEvent))
}

export function resetMockNotify() {
  events.length = 0
  sequence = 0
  sseWaiters.clear()
}
