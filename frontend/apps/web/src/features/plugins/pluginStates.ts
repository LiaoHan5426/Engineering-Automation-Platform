/** Product contribution/dependency observations; these are not backend execution states. */
export const DependencyCheckStatus = {
  UNCHECKED: 'unchecked',
  CHECKING: 'checking',
  AVAILABLE: 'available',
  FAILED: 'failed',
} as const
export type DependencyCheckStatus =
  (typeof DependencyCheckStatus)[keyof typeof DependencyCheckStatus]

export const PluginRuntimeKind = {
  READY: 'ready',
  DEPENDENCY_UNCHECKED: 'dependency_unchecked',
  DEPENDENCY_CHECKING: 'dependency_checking',
  DEPENDENCY_CHECK_FAILED: 'dependency_check_failed',
  DISABLED: 'disabled',
  DEPENDENCY_MISSING: 'dependency_missing',
  ACTIVATION_FAILED: 'activation_failed',
} as const
export type PluginRuntimeKind = (typeof PluginRuntimeKind)[keyof typeof PluginRuntimeKind]
