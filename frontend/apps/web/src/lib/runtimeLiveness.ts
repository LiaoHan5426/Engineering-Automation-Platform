import { runtimeApi } from '@eap/runtime-client'

/**
 * One shell probe for backend reachability.
 *
 * A failed read used to stick until the next full page load. While the tab is
 * visible this probe repeats, and listeners hear only a change: the first
 * success is not a recovery, and a later success after a failure is.
 */
export type RuntimeLiveness = {
  online: boolean
  recovered: boolean
  lost: boolean
}

type Listener = (event: RuntimeLiveness) => void

const OFFLINE_DELAY_MS = 2_000
const ONLINE_DELAY_MS = 8_000

const listeners = new Set<Listener>()
let online: boolean | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let probing = false
let started = false
let healthProbe: () => Promise<boolean> = defaultHealthProbe

async function defaultHealthProbe() {
  const health = await runtimeApi.health()
  return health.status === 'ok'
}

/** Tests replace the probe. Production uses `GET /health`. */
export function configureRuntimeProbe(probe: (() => Promise<boolean>) | null) {
  healthProbe = probe ?? defaultHealthProbe
}

export function subscribeRuntimeLiveness(listener: Listener) {
  listeners.add(listener)
  ensure()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stop()
  }
}

function ensure() {
  if (started) return
  started = true
  document.addEventListener('visibilitychange', onVisible)
  void probe()
}

function stop() {
  started = false
  online = null
  probing = false
  if (timer) clearTimeout(timer)
  timer = undefined
  document.removeEventListener('visibilitychange', onVisible)
}

function onVisible() {
  if (!started || document.visibilityState !== 'visible') return
  if (timer) clearTimeout(timer)
  timer = undefined
  void probe()
}

function schedule() {
  if (!started) return
  if (timer) clearTimeout(timer)
  const delay = online === false ? OFFLINE_DELAY_MS : ONLINE_DELAY_MS
  timer = setTimeout(() => void probe(), delay)
}

async function probe() {
  if (!started || probing) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    schedule()
    return
  }
  probing = true
  let next = false
  try {
    next = await healthProbe()
  } catch {
    next = false
  } finally {
    probing = false
  }
  if (!started) return
  const previous = online
  if (previous === next) {
    schedule()
    return
  }
  online = next
  const event: RuntimeLiveness = {
    online: next,
    recovered: previous === false && next,
    lost: previous === true && !next,
  }
  for (const listener of [...listeners]) listener(event)
  schedule()
}
