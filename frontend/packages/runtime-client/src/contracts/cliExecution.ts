export const CliExecutionStatus = {
  CREATED: 'CREATED',
  RUNNING: 'RUNNING',
  CANCELLING: 'CANCELLING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REJECTED: 'REJECTED',
  TIMED_OUT: 'TIMED_OUT',
  CANCELLED: 'CANCELLED',
} as const
export type CliExecutionStatus = (typeof CliExecutionStatus)[keyof typeof CliExecutionStatus]
export const cliExecutionStatusValues: readonly CliExecutionStatus[] =
  Object.values(CliExecutionStatus)
export function isCliExecutionStatus(value: unknown): value is CliExecutionStatus {
  return (
    typeof value === 'string' && (cliExecutionStatusValues as readonly string[]).includes(value)
  )
}

export const CliApproval = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
} as const
export type CliApproval = (typeof CliApproval)[keyof typeof CliApproval]
export const cliApprovalValues: readonly CliApproval[] = Object.values(CliApproval)
export function isCliApproval(value: unknown): value is CliApproval {
  return typeof value === 'string' && (cliApprovalValues as readonly string[]).includes(value)
}

export const CliVerification = {
  UNVERIFIED: 'UNVERIFIED',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
} as const
export type CliVerification = (typeof CliVerification)[keyof typeof CliVerification]
export const cliVerificationValues: readonly CliVerification[] = Object.values(CliVerification)
export function isCliVerification(value: unknown): value is CliVerification {
  return typeof value === 'string' && (cliVerificationValues as readonly string[]).includes(value)
}
