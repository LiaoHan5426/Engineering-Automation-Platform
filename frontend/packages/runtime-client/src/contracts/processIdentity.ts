export const ProcessIdentityStatus = {
  NOT_CAPTURED: 'NOT_CAPTURED',
  NOT_FOUND: 'NOT_FOUND',
  MATCHING_ALIVE: 'MATCHING_ALIVE',
  MATCHING_EXITED: 'MATCHING_EXITED',
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  UNVERIFIABLE: 'UNVERIFIABLE',
  UNAVAILABLE: 'UNAVAILABLE',
} as const
export type ProcessIdentityStatus =
  (typeof ProcessIdentityStatus)[keyof typeof ProcessIdentityStatus]
export const processIdentityStatusValues: readonly ProcessIdentityStatus[] =
  Object.values(ProcessIdentityStatus)
export function isProcessIdentityStatus(value: unknown): value is ProcessIdentityStatus {
  return (
    typeof value === 'string' && (processIdentityStatusValues as readonly string[]).includes(value)
  )
}
