import type { UiClientContribution, WebBootEntry, WebBootGraph } from './types.ts'

/** Opaque revision for one enablement row (stable for name + served URL). */
export function revFromNameUrl(name: string, clientUrl: string): string {
  let hash = 0
  const seed = `${name}\0${clientUrl}`
  for (let i = 0; i < seed.length; i++) hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0
  return `en-${(hash >>> 0).toString(36)}`
}

/**
 * Append enabled py-backend plugin clients to an existing graph without
 * replacing fixture/core rows.
 */
export function mergeEnablement(
  graph: WebBootGraph,
  uiClients: readonly UiClientContribution[],
): WebBootGraph {
  const seen = new Set(graph.entries.map((row) => row.id))
  const added: WebBootEntry[] = []
  for (const client of uiClients) {
    if (client.enabled === false || seen.has(client.name)) continue
    added.push({
      id: client.name,
      url: client.clientUrl,
      rev: revFromNameUrl(client.name, client.clientUrl),
      ...(client.inject !== undefined && client.inject.length > 0
        ? { inject: [...client.inject] }
        : {}),
    })
    seen.add(client.name)
  }
  if (added.length === 0) return graph
  return {
    ...graph,
    rev: [graph.rev, ...added.map(({ rev }) => rev)].join('+'),
    entries: [...graph.entries, ...added],
    batches: [
      ...graph.batches,
      ...added.map(({ id, url, rev }) => ({
        phase: 'application' as const,
        url,
        rev,
        entries: [id],
      })),
    ],
  }
}
