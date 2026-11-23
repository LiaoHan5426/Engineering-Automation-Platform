/**
 * Prototype board 01 gives each recent session a small status chip next to its
 * timestamp. A chip is only ever derived from data the client genuinely owns:
 * local history flags for every session, and the live chat binding for the one
 * active session. Sessions without evidence get no chip — we never fabricate a
 * "completed"/"verified" label for a conversation we cannot inspect.
 */
export type SessionStatus = 'expired' | 'draft' | 'running' | 'pending' | 'verified'

export type SessionStatusItem = {
  id: string
  draft?: string
  expired?: boolean
}

export type SessionStatusBinding = {
  activeId: string | null
  sending?: boolean
  busyIds?: string[]
  proposalFiles: string[]
  appliedFiles?: string[]
  verificationChecks?: Array<{ name: string; exitCode: number | null; summary: string }>
} | null

/**
 * Resolve a single status chip, or null when there is no honest signal.
 * Priority: expired > active live state > unsent local draft.
 * The live binding applies only to its active session, never to siblings.
 */
export function resolveSessionStatus(
  item: SessionStatusItem,
  binding: SessionStatusBinding,
): SessionStatus | null {
  if (item.expired) return 'expired'

  if (binding && binding.activeId === item.id) {
    if (binding.sending || (binding.busyIds?.length ?? 0) > 0) return 'running'
    const pending =
      binding.proposalFiles.length > 0 &&
      !(binding.appliedFiles?.length && binding.appliedFiles.length >= binding.proposalFiles.length)
    if (pending) return 'pending'
    const checks = binding.verificationChecks ?? []
    if (
      checks.length > 0 &&
      checks.every((check) => check.exitCode !== null && check.exitCode === 0)
    ) {
      return 'verified'
    }
  }

  if (item.draft && item.draft.trim()) return 'draft'
  return null
}
