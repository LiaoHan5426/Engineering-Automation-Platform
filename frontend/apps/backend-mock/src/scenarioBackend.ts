import { ResourceErrors } from '@eap/runtime-client/contracts'
import type { ScenarioConfiguration, ScenarioSnapshot } from '@eap/runtime-client/contracts'

/** Development-server memory only. Never accesses Java, a model, or the filesystem. */
export function createScenarioBackend(versionCount: () => number = () => 0) {
  const records = new Map<string, ScenarioSnapshot>()
  const deleted = new Set<string>()
  const result = (status: number, data: unknown) => ({ status, data: structuredClone(data) })
  const invalid = () => result(400, { code: ResourceErrors.INVALID_SCENARIO_INPUT })
  return {
    handle(method: string, url: URL, body: Record<string, unknown>) {
      if (url.pathname === '/scenarios/workflows/prototype-to-code/dependencies') {
        if (method !== 'GET') return result(405, { code: 'METHOD_NOT_ALLOWED' })
        return result(200, {
          contractVersion: 1,
          workflow: 'prototype-to-code',
          observedAt: new Date().toISOString(),
          plugins: [
            { id: 'builder', required: true },
            { id: 'board', required: false },
          ],
          services: [{ id: 'prototype-versions', state: 'READABLE' }],
          resources: [{ id: 'prototype-version', required: true, count: versionCount() }],
        })
      }
      if (url.pathname === '/scenarios' && method === 'GET')
        return result(200, { items: [...records.values()] })
      if (!url.pathname.startsWith('/scenarios/')) return
      const id = decodeURIComponent(url.pathname.slice('/scenarios/'.length))
      if (!/^custom-[A-Za-z0-9][A-Za-z0-9-]{0,92}$/.test(id)) return invalid()
      const current = records.get(id)
      if (method === 'GET')
        return current
          ? result(200, current)
          : result(404, { code: ResourceErrors.SCENARIO_NOT_FOUND })
      if (method === 'DELETE') {
        const revision = Number(url.searchParams.get('revision'))
        if (!Number.isSafeInteger(revision) || revision < 1) return invalid()
        if (!current || current.revision !== revision)
          return result(409, { code: ResourceErrors.SCENARIO_STALE })
        records.delete(id)
        deleted.add(id)
        return result(200, { deleted: true })
      }
      if (method !== 'PUT') return
      const revision = body.revision
      const d = body.definition as ScenarioConfiguration | undefined
      const text = (value: unknown, max: number, required = false) =>
        typeof value === 'string' &&
        value.length <= max &&
        !value.includes('\0') &&
        (!required || !!value.trim())
      if (
        !Number.isSafeInteger(revision) ||
        (revision as number) < 0 ||
        !d ||
        !text(d.name, 80, true) ||
        !text(d.summary, 400) ||
        !text(d.instructions, 4000) ||
        !['partial', 'missing', 'disabled'].includes(d.status) ||
        !Array.isArray(d.modes) ||
        d.modes.length < 1 ||
        d.modes.length > 2 ||
        new Set(d.modes).size !== d.modes.length ||
        d.modes.some((mode) => !['code', 'work'].includes(mode)) ||
        [d.tools, d.skills, d.mcp].some(
          (values) =>
            !Array.isArray(values) ||
            values.length > 30 ||
            values.some((value) => !text(value, 200, true)),
        ) ||
        (d.workflow != null && d.workflow !== 'prototype-to-code') ||
        !Array.isArray(d.dependencies) ||
        d.dependencies.length > 30 ||
        d.dependencies.some(
          (dep) =>
            !dep ||
            !text(dep.name, 200, true) ||
            !text(dep.where, 1000) ||
            !['installed', 'missing', 'unconfigured', 'denied'].includes(dep.state),
        )
      )
        return invalid()
      if (deleted.has(id) || (current?.revision ?? 0) !== revision)
        return result(409, { code: ResourceErrors.SCENARIO_STALE })
      const saved = { id, revision: (revision as number) + 1, definition: structuredClone(d) }
      records.set(id, saved)
      // Mock-only: persist then drop the HTTP response so the client must reconcile → unknown.
      if (url.searchParams.get('mockOutcome') === 'save-lost') {
        return result(502, { code: 'MOCK_SAVE_RESPONSE_LOST' })
      }
      return result(200, saved)
    },
  }
}
