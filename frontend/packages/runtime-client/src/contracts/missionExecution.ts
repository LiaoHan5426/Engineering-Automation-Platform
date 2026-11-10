export const MissionExecutionStatus = {
  CREATED: 'CREATED',
  RUNNING: 'RUNNING',
  CANCELLING: 'CANCELLING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REJECTED: 'REJECTED',
  TIMED_OUT: 'TIMED_OUT',
  CANCELLED: 'CANCELLED',
  INTERRUPTED: 'INTERRUPTED',
  UNKNOWN: 'UNKNOWN',
} as const
export type MissionExecutionStatus =
  (typeof MissionExecutionStatus)[keyof typeof MissionExecutionStatus]
export const missionExecutionStatusValues: readonly MissionExecutionStatus[] =
  Object.values(MissionExecutionStatus)
export function isMissionExecutionStatus(value: unknown): value is MissionExecutionStatus {
  return (
    typeof value === 'string' && (missionExecutionStatusValues as readonly string[]).includes(value)
  )
}

export function isMissionExecutionStatusActive(value: unknown): boolean {
  return (
    value === MissionExecutionStatus.CREATED ||
    value === MissionExecutionStatus.RUNNING ||
    value === MissionExecutionStatus.CANCELLING
  )
}

export function isMissionExecutionStatusBlocking(value: unknown): boolean {
  return (
    value === MissionExecutionStatus.CREATED ||
    value === MissionExecutionStatus.RUNNING ||
    value === MissionExecutionStatus.CANCELLING ||
    value === MissionExecutionStatus.UNKNOWN
  )
}
