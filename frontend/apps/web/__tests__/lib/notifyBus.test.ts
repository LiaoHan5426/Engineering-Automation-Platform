import { afterEach, expect, it } from 'vite-plus/test'
import {
  clearSessionAttention,
  configureNotifyFocus,
  publishNotify,
  resetNotifyBus,
  sessionAttentionCount,
  subscribeNotify,
} from '../../src/lib/notifyBus'
import type { NotifyEvent } from '@eap/runtime-client'

function event(partial: Partial<NotifyEvent> & Pick<NotifyEvent, 'eventId' | 'kind'>): NotifyEvent {
  return {
    sequence: 1,
    occurredAt: '2026-11-26T00:00:00Z',
    protocolVersion: '1',
    severity: 'info',
    code: 'TEST',
    title: 't',
    text: 'x',
    surfaces: ['badge', 'toast'],
    ...partial,
  }
}

afterEach(() => {
  resetNotifyBus()
  configureNotifyFocus(() => undefined)
})

it('dedupes by eventId and tracks session attention except focused conversation', () => {
  configureNotifyFocus(() => 'focus-1')
  const seen: string[] = []
  subscribeNotify((item) => seen.push(item.eventId))
  const first = event({
    eventId: 'a',
    kind: 'session',
    target: { conversationId: 'other' },
    sequence: 2,
  })
  expect(publishNotify(first)).toBe(true)
  expect(publishNotify(first)).toBe(false)
  expect(sessionAttentionCount('other')).toBe(1)
  expect(
    publishNotify(
      event({
        eventId: 'b',
        kind: 'session',
        target: { conversationId: 'focus-1' },
        sequence: 3,
      }),
    ),
  ).toBe(true)
  expect(sessionAttentionCount('focus-1')).toBe(0)
  clearSessionAttention('other')
  expect(sessionAttentionCount('other')).toBe(0)
  expect(seen).toEqual(['a', 'b'])
})
