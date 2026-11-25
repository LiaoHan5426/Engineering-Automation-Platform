// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import {
  configureRuntimeProbe,
  subscribeRuntimeLiveness,
  type RuntimeLiveness,
} from '../../src/lib/runtimeLiveness'

afterEach(() => {
  configureRuntimeProbe(null)
  vi.useRealTimers()
})

it('treats the first success as online and a later success as recovery', async () => {
  vi.useFakeTimers()
  let reachable = false
  configureRuntimeProbe(async () => reachable)
  const events: RuntimeLiveness[] = []
  const stop = subscribeRuntimeLiveness((event) => events.push(event))

  await vi.advanceTimersByTimeAsync(0)
  expect(events).toEqual([{ online: false, recovered: false, lost: false }])

  reachable = true
  await vi.advanceTimersByTimeAsync(2_000)
  expect(events.at(-1)).toEqual({ online: true, recovered: true, lost: false })

  await vi.advanceTimersByTimeAsync(8_000)
  expect(events).toHaveLength(2)

  reachable = false
  await vi.advanceTimersByTimeAsync(8_000)
  expect(events.at(-1)).toEqual({ online: false, recovered: false, lost: true })

  stop()
})

it('probes again when the tab becomes visible', async () => {
  vi.useFakeTimers()
  let calls = 0
  configureRuntimeProbe(async () => {
    calls += 1
    return true
  })
  const stop = subscribeRuntimeLiveness(() => {})
  await vi.advanceTimersByTimeAsync(0)
  expect(calls).toBe(1)

  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(8_000)
  expect(calls).toBe(1)

  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(0)
  expect(calls).toBe(2)

  stop()
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})
