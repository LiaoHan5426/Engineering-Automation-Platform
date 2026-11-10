export const ExpertAgentState = {
  QUEUED: 'queued',
  RUNNING: 'running',
  INTERRUPTED: 'interrupted',
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  NEEDS_INPUT: 'needs-input',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMED_OUT: 'timed-out',
  AWAITING_APPROVAL: 'awaiting-approval',
  APPLYING: 'applying',
  APPLIED: 'applied',
  DENIED: 'denied',
  EXPIRED: 'expired',
  UNKNOWN: 'unknown',
} as const
export type ExpertAgentState = (typeof ExpertAgentState)[keyof typeof ExpertAgentState]
export const expertAgentStateValues: readonly ExpertAgentState[] = Object.values(ExpertAgentState)
export function isExpertAgentState(value: unknown): value is ExpertAgentState {
  return typeof value === 'string' && (expertAgentStateValues as readonly string[]).includes(value)
}

export function isExpertAgentStateActive(value: unknown): boolean {
  return (
    value === ExpertAgentState.QUEUED ||
    value === ExpertAgentState.RUNNING ||
    value === ExpertAgentState.AWAITING_APPROVAL ||
    value === ExpertAgentState.APPLYING
  )
}

export function isExpertAgentStateBlocking(value: unknown): boolean {
  return (
    value === ExpertAgentState.QUEUED ||
    value === ExpertAgentState.RUNNING ||
    value === ExpertAgentState.AWAITING_APPROVAL ||
    value === ExpertAgentState.APPLYING ||
    value === ExpertAgentState.UNKNOWN
  )
}
