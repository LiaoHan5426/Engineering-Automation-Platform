import type { BoardRuntimeSnapshot } from '@eap/runtime-client'
import type { PluginId } from './model'

export type PluginServiceDependency = {
  id: string
  label: string
}

/** Declared runtime services; contribution assumptions are not read observations. */
export const PLUGIN_SERVICE_DEPENDENCIES: Record<PluginId, readonly PluginServiceDependency[]> = {
  chat: [],
  builder: [],
  board: [{ id: 'runtime.board-api', label: '看板 Task/Run API' }],
}

export type PluginRuntimeKind =
  | 'ready'
  | 'dependency_unchecked'
  | 'dependency_checking'
  | 'dependency_check_failed'
  | 'disabled'
  | 'dependency_missing'
  | 'activation_failed'

export type PluginRuntimeObservation = {
  kind: PluginRuntimeKind
  missingDependencies: PluginServiceDependency[]
  message: string
}

/** Scoped read observation; not installation, activation or full Run verification. */
export type DependencyCheck = {
  status: 'unchecked' | 'checking' | 'available' | 'failed'
  source: string
  observedAt: string | null
  reason: string
  /** Last successful observation, never an independently maintained execution state. */
  snapshot?: BoardRuntimeSnapshot
}

export function missingDependenciesFor(
  pluginId: PluginId,
  services: Record<string, boolean>,
): PluginServiceDependency[] {
  return PLUGIN_SERVICE_DEPENDENCIES[pluginId].filter((dep) => services[dep.id] !== true)
}

export function pluginRuntimeObservation(input: {
  pluginId: PluginId
  enabled: boolean
  services: Record<string, boolean>
  activationError: string | null
}): PluginRuntimeObservation {
  // Sticky activation failure is shown even after rollback leaves enabled=false.
  if (input.activationError) {
    return {
      kind: 'activation_failed',
      missingDependencies: [],
      message: input.activationError,
    }
  }
  if (!input.enabled) {
    return { kind: 'disabled', missingDependencies: [], message: '' }
  }
  const missing = missingDependenciesFor(input.pluginId, input.services)
  if (missing.length) {
    return {
      kind: 'dependency_missing',
      missingDependencies: missing,
      message: missing.map((item) => item.label).join('、'),
    }
  }
  return { kind: 'ready', missingDependencies: [], message: '' }
}

export function contributionVisible(
  pluginId: PluginId,
  enabled: boolean,
  services: Record<string, boolean>,
  activationError: string | null,
): boolean {
  const observation = pluginRuntimeObservation({
    pluginId,
    enabled,
    services,
    activationError: pluginId === 'board' ? activationError : null,
  })
  return observation.kind === 'ready'
}
