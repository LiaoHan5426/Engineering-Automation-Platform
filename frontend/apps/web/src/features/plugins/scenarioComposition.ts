import type { PluginHost } from './host'

/** Effective local contribution and server read evidence; saved scenario labels cannot override it. */
export function scenarioComposition(host: PluginHost) {
  const check = host.builderDependencyCheck.value
  const count = check.snapshot?.resources[0]?.count ?? 0
  const readable = check.status === 'available'
  const designer = host.builderContributionVisible.value
  return { designer, readable, count, ready: designer && readable && count > 0 }
}
