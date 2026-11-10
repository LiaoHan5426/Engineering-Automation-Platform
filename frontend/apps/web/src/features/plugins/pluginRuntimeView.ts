import { DependencyCheckStatus, PluginRuntimeKind } from './pluginStates'
import type { BoardRuntimeSnapshot } from '@eap/runtime-client'
import type { PluginId } from './model'

export type PluginServiceDependency = {
  id: string
  label: string
}

/** Declared runtime services; contribution assumptions are not read observations. */
export const PLUGIN_SERVICE_DEPENDENCIES: Record<PluginId, readonly PluginServiceDependency[]> = {
  chat: [],
  builder: [{ id: 'runtime.prototype-api', label: '原型版本 API' }],
  board: [{ id: 'runtime.board-api', label: '看板 Task/Run API' }],
}

export type { PluginRuntimeKind } from './pluginStates'

export type PluginRuntimeObservation = {
  kind: PluginRuntimeKind
  missingDependencies: PluginServiceDependency[]
  message: string
}

/** Scoped read observation; not installation, activation or full Run verification. */
export type DependencyCheck = {
  status: DependencyCheckStatus
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
      kind: PluginRuntimeKind.ACTIVATION_FAILED,
      missingDependencies: [],
      message: input.activationError,
    }
  }
  if (!input.enabled) {
    return { kind: PluginRuntimeKind.DISABLED, missingDependencies: [], message: '' }
  }
  const missing = missingDependenciesFor(input.pluginId, input.services)
  if (missing.length) {
    return {
      kind: PluginRuntimeKind.DEPENDENCY_MISSING,
      missingDependencies: missing,
      message: missing.map((item) => item.label).join('、'),
    }
  }
  return { kind: PluginRuntimeKind.READY, missingDependencies: [], message: '' }
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
    activationError,
  })
  return observation.kind === PluginRuntimeKind.READY
}
