import { describe, expect, it } from 'vitest'
import { projectEvents, type ChatExecutionEvent } from '../../../src/features/chat/eventProjector'

function event(
  sequence: number,
  type: string,
  extra: Partial<ChatExecutionEvent> = {},
): ChatExecutionEvent {
  return {
    eventId: 'e' + sequence,
    sequence,
    executionId: 'exec-1',
    conversationId: 'c1',
    type,
    protocolVersion: '1',
    occurredAt: '2026-11-07T00:00:00Z',
    text: '',
    code: '',
    status: 'RUNNING',
    ...extra,
  }
}

describe('eventProjector', () => {
  it('dedups duplicate sequences and records gaps', () => {
    const projected = projectEvents([
      event(1, 'status'),
      event(2, 'answer.delta', { text: 'hel' }),
      event(2, 'answer.delta', { text: 'DUP' }),
      event(4, 'answer.delta', { text: 'lo' }),
      event(5, 'final', { text: 'hello', status: 'SUCCEEDED' }),
    ])
    expect(projected.duplicateSequences).toEqual([2])
    expect(projected.missingSequences).toEqual([3])
    expect(projected.answer).toBe('hello')
    expect(projected.complete).toBe(true)
  })

  it('collects tool events without duplicating', () => {
    const projected = projectEvents([
      event(1, 'tool', { code: 'TOOL_SUCCEEDED', payload: { sequence: 1 } }),
      event(1, 'tool', { code: 'TOOL_SUCCEEDED', payload: { sequence: 1 } }),
      event(2, 'final', { status: 'SUCCEEDED' }),
    ])
    expect(projected.toolEvents).toEqual([{ sequence: 1, code: 'TOOL_SUCCEEDED' }])
    expect(projected.duplicateSequences).toEqual([1])
  })
})
