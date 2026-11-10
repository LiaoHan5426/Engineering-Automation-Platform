export const SkillDependencyStatus = {
  UNKNOWN: 'unknown',
  DISABLED: 'disabled',
  AVAILABLE: 'available',
} as const
export type SkillDependencyStatus =
  (typeof SkillDependencyStatus)[keyof typeof SkillDependencyStatus]
export const skillDependencyStatusValues: readonly SkillDependencyStatus[] =
  Object.values(SkillDependencyStatus)
export function isSkillDependencyStatus(value: unknown): value is SkillDependencyStatus {
  return (
    typeof value === 'string' && (skillDependencyStatusValues as readonly string[]).includes(value)
  )
}
