import { proposalRefused, type CodeProposalState } from '@eap/runtime-client'

export function refusedFromState(state: CodeProposalState | null | undefined): boolean {
  return proposalRefused(state?.status)
}
