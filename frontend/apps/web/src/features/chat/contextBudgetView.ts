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
