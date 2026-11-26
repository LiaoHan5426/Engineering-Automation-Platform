import { parseNotifyEvent, runtimeApi } from '@eap/runtime-client'
import { notifyLastSequence, publishNotify } from './notifyBus'

let started = false
let stopRequested = false
let sseAbort: AbortController | undefined
let ws: WebSocket | undefined
let wsBackoffMs = 1000
let sseBackoffMs = 1000
let reconnectTimer: ReturnType<typeof setTimeout> | undefined

function ingest(raw: unknown) {
  try {
    if (
      raw &&
      typeof raw === 'object' &&
      'type' in raw &&
      (raw as { type: string }).type === 'heartbeat'
    )
      return
    publishNotify(parseNotifyEvent(raw))
  } catch {
    /* Illegal frames are dropped; contract violations never become UNKNOWN. */
  }
}

async function catchUp() {
  const snap = await runtimeApi.notifySnapshot(notifyLastSequence())
  for (const event of snap.events) publishNotify(event)
}

function schedule(kind: 'ws' | 'sse', run: () => void) {
  if (stopRequested) return
  const delay = kind === 'ws' ? wsBackoffMs : sseBackoffMs
  if (kind === 'ws') wsBackoffMs = Math.min(wsBackoffMs * 2, 30_000)
  else sseBackoffMs = Math.min(sseBackoffMs * 2, 30_000)
  reconnectTimer = setTimeout(run, delay)
}

function connectWs() {
  if (stopRequested) return
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
  const socket = new WebSocket(runtimeApi.notifyWsUrl(notifyLastSequence()))
  ws = socket
  socket.onopen = () => {
    wsBackoffMs = 1000
  }
  socket.onmessage = (message) => {
    try {
      ingest(JSON.parse(String(message.data)))
    } catch {
      /* ignore */
    }
  }
  socket.onclose = () => {
    if (ws === socket) ws = undefined
    schedule('ws', connectWs)
  }
  socket.onerror = () => socket.close()
}

async function connectSse() {
  if (stopRequested) return
  sseAbort?.abort()
  const controller = new AbortController()
  sseAbort = controller
  try {
    const response = await runtimeApi.openNotifyStream(notifyLastSequence(), {
      signal: controller.signal,
    })
    if (!response.body) throw new Error('NOTIFY_STREAM_EMPTY')
    sseBackoffMs = 1000
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (!stopRequested) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let separator: RegExpExecArray | null
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        const chunk = buffer.slice(0, separator.index)
        buffer = buffer.slice(separator.index + separator[0].length)
        const dataLines = chunk
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
        if (!dataLines.length) continue
        try {
          ingest(JSON.parse(dataLines.join('\n')))
        } catch {
          /* ignore */
        }
      }
    }
  } catch (error) {
    if (controller.signal.aborted || stopRequested) return
    void error
  }
  schedule('sse', () => void connectSse())
}

async function onVisible() {
  if (document.visibilityState !== 'visible') return
  try {
    await catchUp()
  } catch {
    /* silent catch-up failures stay off NProgress */
  }
}

/** Start standing notify transports. Safe to call once from app boot. */
export function startNotifyClient() {
  if (started || typeof window === 'undefined') return () => {}
  started = true
  stopRequested = false
  void catchUp()
    .catch(() => {})
    .finally(() => {
      connectWs()
      void connectSse()
    })
  document.addEventListener('visibilitychange', onVisible)
  return stopNotifyClient
}

export function stopNotifyClient() {
  stopRequested = true
  started = false
  sseAbort?.abort()
  sseAbort = undefined
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
  ws = undefined
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = undefined
  document.removeEventListener('visibilitychange', onVisible)
}
