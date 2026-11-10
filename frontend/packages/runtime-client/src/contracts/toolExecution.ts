export const ToolExecutionStatus = {
  CREATED: 'CREATED',
  RUNNING: 'RUNNING',
  CANCELLING: 'CANCELLING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REJECTED: 'REJECTED',
  TIMED_OUT: 'TIMED_OUT',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
  CLOSED_UNKNOWN: 'CLOSED_UNKNOWN',
} as const
export type ToolExecutionStatus = (typeof ToolExecutionStatus)[keyof typeof ToolExecutionStatus]
export const toolExecutionStatusValues: readonly ToolExecutionStatus[] =
  Object.values(ToolExecutionStatus)
export function isToolExecutionStatus(value: unknown): value is ToolExecutionStatus {
  return (
    typeof value === 'string' && (toolExecutionStatusValues as readonly string[]).includes(value)
  )
}

export function isToolExecutionStatusActive(value: unknown): boolean {
  return (
    value === ToolExecutionStatus.CREATED ||
    value === ToolExecutionStatus.RUNNING ||
    value === ToolExecutionStatus.CANCELLING
  )
}

export function isToolExecutionStatusBlocking(value: unknown): boolean {
  return (
    value === ToolExecutionStatus.CREATED ||
    value === ToolExecutionStatus.RUNNING ||
    value === ToolExecutionStatus.CANCELLING ||
    value === ToolExecutionStatus.UNKNOWN
  )
}
