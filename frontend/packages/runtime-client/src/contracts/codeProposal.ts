export const CodeProposalStatus = {
  PROPOSED: 'PROPOSED',
  APPLYING: 'APPLYING',
  APPLIED: 'APPLIED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
  REFUSED: 'REFUSED',
} as const
export type CodeProposalStatus = (typeof CodeProposalStatus)[keyof typeof CodeProposalStatus]
export const codeProposalStatusValues: readonly CodeProposalStatus[] =
  Object.values(CodeProposalStatus)
export function isCodeProposalStatus(value: unknown): value is CodeProposalStatus {
  return (
    typeof value === 'string' && (codeProposalStatusValues as readonly string[]).includes(value)
  )
}

export function isCodeProposalStatusActive(value: unknown): boolean {
  return value === CodeProposalStatus.APPLYING
}

export function isCodeProposalStatusBlocking(value: unknown): boolean {
  return value === CodeProposalStatus.APPLYING || value === CodeProposalStatus.UNKNOWN
}

export function proposalRefused(status: string | null | undefined): boolean {
  return status === CodeProposalStatus.REFUSED
}
