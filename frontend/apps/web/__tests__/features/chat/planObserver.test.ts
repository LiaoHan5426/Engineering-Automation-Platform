import { describe, expect, it } from 'vite-plus/test'
import { createPlanObserver, type PlanObservation } from '../../../src/features/chat/planObserver'
import type { ChatPlanSnapshot } from '@eap/runtime-client'
const conversationId = '11111111-1111-4111-8111-111111111111'
const executionId = '22222222-2222-4222-8222-222222222222'
const plan = (revision = 1): ChatPlanSnapshot => ({
  schemaVersion: 1,
  planId: '33333333-3333-4333-8333-333333333333',
  conversationId,
  executionId,
  revision,
  updatedAt: '2026-11-14T12:00:00Z',
  items: [
    { id: '44444444-4444-4444-8444-444444444444', content: 'Read sources', status: 'pending' },
  ],
})
describe('execution plan observer', () => {
  it('replaces full snapshots, preserves IDs, clears explicitly and ignores older/cross scope', () => {
    let value: PlanObservation | undefined
    const observer = createPlanObserver(
      conversationId,
      executionId,
      async () => null,
      (v) => {
        value = v
      },
    )
    observer.event(plan())
    const updated = plan(2)
    updated.items[0]!.status = 'in_progress'
    observer.event(updated)
    expect(value?.snapshot).toEqual(updated)
    observer.event({ ...plan(3), executionId: conversationId })
    observer.event(plan())
    expect(value?.snapshot?.revision).toBe(2)
    observer.event({ ...plan(3), items: [] })
    expect(value?.snapshot?.items).toEqual([])
  })
  it('repairs revision gaps without allowing stale GET or null to overwrite newer SSE', async () => {
    let resolve!: (v: ChatPlanSnapshot | null) => void
    let value: PlanObservation | undefined
    const observer = createPlanObserver(
      conversationId,
      executionId,
      () =>
        new Promise((r) => {
          resolve = r
        }),
      (v) => {
        value = v
      },
    )
    observer.event(plan())
    observer.event(plan(4))
    observer.event(plan(5))
    resolve(plan(2))
    await Promise.resolve()
    expect(value?.snapshot?.revision).toBe(5)
    const request = observer.refresh()
    observer.event(plan(6))
    resolve(null)
    await request
    expect(value?.snapshot?.revision).toBe(6)
  })
  it('retains the last observation on read failure and supports retry with server authority over cache', async () => {
    let fail = true
    let value: PlanObservation | undefined
    const observer = createPlanObserver(
      conversationId,
      executionId,
      async () => {
        if (fail) throw Error()
        return plan()
      },
      (v) => {
        value = v
      },
      plan(9),
    )
    await observer.refresh()
    expect(value).toMatchObject({ state: 'error', authority: 'cache', snapshot: { revision: 9 } })
    fail = false
    await observer.refresh()
    expect(value).toMatchObject({ state: 'ready', authority: 'server', snapshot: { revision: 1 } })
  })
})
