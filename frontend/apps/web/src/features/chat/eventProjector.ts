import { ChatExecutionStatus } from '@eap/runtime-client/contracts'
import type { ChatExecutionEvent } from '@eap/runtime-client/contracts'
export type { ChatExecutionEvent } from '@eap/runtime-client/contracts'

export type ProjectedTurn = {
  executionId: string
  answer: string
  error: string
  status: string
  toolEvents: Array<{ sequence: number; code: string }>
  missingSequences: number[]
  duplicateSequences: number[]
  complete: boolean
  proposal: unknown
  finalPayload: unknown
}

/** Merge execution events by executionId+sequence. Duplicates ignored; gaps recorded. */
export function projectEvents(events: ChatExecutionEvent[]): ProjectedTurn {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence)
  const seen = new Set<number>()
  const duplicateSequences: number[] = []
  const unique: ChatExecutionEvent[] = []
  for (const event of ordered) {
    if (seen.has(event.sequence)) {
      duplicateSequences.push(event.sequence)
      continue
    }
    seen.add(event.sequence)
    unique.push(event)
  }
  const missingSequences: number[] = []
  if (unique.length > 0) {
    const min = unique[0]!.sequence
    const max = unique[unique.length - 1]!.sequence
    for (let sequence = min; sequence <= max; sequence += 1) {
      if (!seen.has(sequence)) missingSequences.push(sequence)
    }
  }
  let answer = ''
  let error = ''
  let status: string = ChatExecutionStatus.RUNNING
  let complete = false
  let proposal: unknown = null
  let finalPayload: unknown = null
  const toolEvents: Array<{ sequence: number; code: string }> = []
  const executionId = unique[0]?.executionId ?? ''
  for (const event of unique) {
    if (event.status) status = event.status
    switch (event.type) {
      case 'answer.delta':
        answer += event.text ?? ''
        break
      case 'tool':
        toolEvents.push({
          sequence:
            typeof (event.payload as { sequence?: number } | null)?.sequence === 'number'
              ? (event.payload as { sequence: number }).sequence
              : event.sequence,
          code: event.code || event.text,
        })
        break
      case 'approval':
        proposal = event.payload ?? null
        if (event.text) answer = event.text
        break
      case 'error':
        error = event.code || event.text || error
        break
      case 'final':
        complete = true
        finalPayload = event.payload ?? null
        if (event.text) answer = event.text
        if (event.code) error = event.code
        break
      default:
        break
    }
  }
  return {
    executionId,
    answer,
    error,
    status,
    toolEvents,
    missingSequences,
    duplicateSequences,
    complete,
    proposal,
    finalPayload,
  }
}

export function mergeSnapshot(
  existing: ChatExecutionEvent[],
  snapshotEvents: ChatExecutionEvent[],
): ChatExecutionEvent[] {
  return projectEvents([...existing, ...snapshotEvents]).complete
    ? dedupeKeepOrder([...existing, ...snapshotEvents])
    : dedupeKeepOrder([...existing, ...snapshotEvents])
}

function dedupeKeepOrder(events: ChatExecutionEvent[]): ChatExecutionEvent[] {
  const seen = new Set<string>()
  const out: ChatExecutionEvent[] = []
  for (const event of events) {
    const key = event.executionId + ':' + event.sequence
    if (seen.has(key)) continue
    seen.add(key)
    out.push(event)
  }
  return out.sort((a, b) => a.sequence - b.sequence)
}
