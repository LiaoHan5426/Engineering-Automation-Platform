import type { ScenarioWorkflowDependencies } from '@eap/runtime-client'
import { createPluginHost } from '../../../src/features/plugins/host'
import { memoryStore } from '../../../src/features/plugins/model'

export function designerSnapshot(count = 1): ScenarioWorkflowDependencies {
  return {
    contractVersion: 1,
    workflow: 'prototype-to-code',
    observedAt: '2026-11-10T09:00:00Z',
    plugins: [
      { id: 'builder', required: true },
      { id: 'board', required: false },
    ],
    services: [{ id: 'prototype-versions', state: 'READABLE' }],
    resources: [{ id: 'prototype-version', required: true, count }],
  }
}
/** Scenarios testing preparation use explicit service evidence; composition failures have their own tests. */
export function scenarioHost(enabled = true) {
  const host = createPluginHost(memoryStore())
  host.setEnabled('builder', enabled)
  host.builderDependencyCheck.value = {
    status: 'available',
    reason: '',
    snapshot: designerSnapshot(),
  }
  return host
}
