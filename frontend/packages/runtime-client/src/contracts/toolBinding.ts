export const TrustedToolBindingStatus = {
  READY: 'ready',
  DISABLED: 'disabled',
  MISSING_BINARY: 'missing_binary',
  CONFLICT: 'conflict',
  UNKNOWN_VERSION: 'unknown_version',
} as const
export type TrustedToolBindingStatus =
  (typeof TrustedToolBindingStatus)[keyof typeof TrustedToolBindingStatus]
export const trustedToolBindingStatusValues: readonly TrustedToolBindingStatus[] =
  Object.values(TrustedToolBindingStatus)
export function isTrustedToolBindingStatus(value: unknown): value is TrustedToolBindingStatus {
  return (
    typeof value === 'string' &&
    (trustedToolBindingStatusValues as readonly string[]).includes(value)
  )
}

export const TrustedToolVersionStatus = {
  UNKNOWN: 'unknown',
  KNOWN: 'known',
  NOT_APPLICABLE: 'not_applicable',
  PROBE_FAILED: 'probe_failed',
} as const
export type TrustedToolVersionStatus =
  (typeof TrustedToolVersionStatus)[keyof typeof TrustedToolVersionStatus]
export const trustedToolVersionStatusValues: readonly TrustedToolVersionStatus[] =
  Object.values(TrustedToolVersionStatus)
export function isTrustedToolVersionStatus(value: unknown): value is TrustedToolVersionStatus {
  return (
    typeof value === 'string' &&
    (trustedToolVersionStatusValues as readonly string[]).includes(value)
  )
}
