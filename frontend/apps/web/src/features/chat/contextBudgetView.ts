import type { ContextBudgetObservation } from '@eap/runtime-client'

export function isContextBudgetObservation(value: unknown): value is ContextBudgetObservation {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.platformLimit === 'number' &&
    typeof row.outputReserve === 'number' &&
    typeof row.usedChars === 'number' &&
    typeof row.metering === 'string' &&
    Array.isArray(row.sources)
  )
}

export function contextBudgetFromError(error: unknown): ContextBudgetObservation | null {
  const data = (error as { response?: { data?: Record<string, unknown> } } | null)?.response?.data
  if (!data) return null
  return isContextBudgetObservation(data.contextBudget) ? data.contextBudget : null
}

export function includedSourceSummary(budget: ContextBudgetObservation): string {
  return budget.sources
    .filter((source) => source.disposition === 'included' || source.disposition === 'detail')
    .map((source) => `${source.source}:${source.chars}`)
    .join(' · ')
}

/** Badge tone for stable CE-01 note codes; free-form mock prose stays neutral. */
export function contextBudgetNoteTone(
  note: string,
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (note === 'COMPRESSION_NOT_ENABLED') return 'warning'
  if (note === 'CHAT_MEMORY_NOT_METERED') return 'warning'
  if (note === 'DERIVED_CLEARED_BEFORE_SEND') return 'warning'
  if (note.startsWith('CONTEXT_BUDGET_')) return 'danger'
  return 'neutral'
}
