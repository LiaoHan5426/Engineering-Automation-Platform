export const ChatExecutionStatus = {
  CREATED: 'CREATED',
  RUNNING: 'RUNNING',
  CANCELLING: 'CANCELLING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REJECTED: 'REJECTED',
  REFUSED: 'REFUSED',
  TIMED_OUT: 'TIMED_OUT',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
} as const
export type ChatExecutionStatus = (typeof ChatExecutionStatus)[keyof typeof ChatExecutionStatus]
export const chatExecutionStatusValues: readonly ChatExecutionStatus[] =
  Object.values(ChatExecutionStatus)
export function isChatExecutionStatus(value: unknown): value is ChatExecutionStatus {
  return (
    typeof value === 'string' && (chatExecutionStatusValues as readonly string[]).includes(value)
  )
}

export function isChatExecutionStatusActive(value: unknown): boolean {
  return (
    value === ChatExecutionStatus.CREATED ||
    value === ChatExecutionStatus.RUNNING ||
    value === ChatExecutionStatus.CANCELLING
  )
}

export function isChatExecutionStatusBlocking(value: unknown): boolean {
  return (
    value === ChatExecutionStatus.CREATED ||
    value === ChatExecutionStatus.RUNNING ||
    value === ChatExecutionStatus.CANCELLING ||
    value === ChatExecutionStatus.UNKNOWN
  )
}
