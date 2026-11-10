export const BoardVerificationStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  STALE: 'STALE',
  UNKNOWN: 'UNKNOWN',
} as const
export type BoardVerificationStatus =
  (typeof BoardVerificationStatus)[keyof typeof BoardVerificationStatus]
export const boardVerificationStatusValues: readonly BoardVerificationStatus[] =
  Object.values(BoardVerificationStatus)
export function isBoardVerificationStatus(value: unknown): value is BoardVerificationStatus {
  return (
    typeof value === 'string' &&
    (boardVerificationStatusValues as readonly string[]).includes(value)
  )
}

export const BoardVerificationCheckStatus = {
  RUNNING: 'RUNNING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  TIMED_OUT: 'TIMED_OUT',
  UNKNOWN: 'UNKNOWN',
} as const
export type BoardVerificationCheckStatus =
  (typeof BoardVerificationCheckStatus)[keyof typeof BoardVerificationCheckStatus]
export const boardVerificationCheckStatusValues: readonly BoardVerificationCheckStatus[] =
  Object.values(BoardVerificationCheckStatus)
export function isBoardVerificationCheckStatus(
  value: unknown,
): value is BoardVerificationCheckStatus {
  return (
    typeof value === 'string' &&
    (boardVerificationCheckStatusValues as readonly string[]).includes(value)
  )
}

export function isBoardVerificationStatusActive(value: unknown): boolean {
  return value === BoardVerificationStatus.QUEUED || value === BoardVerificationStatus.RUNNING
}

export function isBoardVerificationStatusBlocking(value: unknown): boolean {
  return (
    value === BoardVerificationStatus.QUEUED ||
    value === BoardVerificationStatus.RUNNING ||
    value === BoardVerificationStatus.UNKNOWN
  )
}

export function isBoardVerificationCheckStatusActive(value: unknown): boolean {
  return value === BoardVerificationCheckStatus.RUNNING
}

export function isBoardVerificationCheckStatusBlocking(value: unknown): boolean {
  return (
    value === BoardVerificationCheckStatus.RUNNING || value === BoardVerificationCheckStatus.UNKNOWN
  )
}
