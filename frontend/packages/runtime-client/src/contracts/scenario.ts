export const ScenarioStatus = {
  PARTIAL: 'partial',
  MISSING: 'missing',
  DISABLED: 'disabled',
} as const
export type ScenarioStatus = (typeof ScenarioStatus)[keyof typeof ScenarioStatus]
export const scenarioStatusValues: readonly ScenarioStatus[] = Object.values(ScenarioStatus)
export function isScenarioStatus(value: unknown): value is ScenarioStatus {
  return typeof value === 'string' && (scenarioStatusValues as readonly string[]).includes(value)
}

export const ScenarioDependencyStatus = {
  INSTALLED: 'installed',
  MISSING: 'missing',
  UNCONFIGURED: 'unconfigured',
  DENIED: 'denied',
} as const
export type ScenarioDependencyStatus =
  (typeof ScenarioDependencyStatus)[keyof typeof ScenarioDependencyStatus]
export const scenarioDependencyStatusValues: readonly ScenarioDependencyStatus[] =
  Object.values(ScenarioDependencyStatus)
export function isScenarioDependencyStatus(value: unknown): value is ScenarioDependencyStatus {
  return (
    typeof value === 'string' &&
    (scenarioDependencyStatusValues as readonly string[]).includes(value)
  )
}
