import { describe, expect, it } from 'vite-plus/test'
import { composeFixtureGraph, FIXTURE_REQUIRED_ENTRY_IDS } from '../src/compose-fixture.ts'
import { mergeEnablement } from '../src/compose-enablement.ts'

describe('composeFixtureGraph', () => {
  it('includes every required client entry id from boot-client roster', () => {
    const graph = composeFixtureGraph()
    const ids = new Set(graph.entries.map((row) => row.id))
    for (const id of FIXTURE_REQUIRED_ENTRY_IDS) {
      expect(ids.has(id)).toBe(true)
    }
    expect(graph.batches.some((batch) => batch.phase === 'bootstrap')).toBe(true)
    expect(graph.batches.some((batch) => batch.phase === 'application')).toBe(true)
  })
})

describe('mergeEnablement', () => {
  it('appends enabled plugin client as a new graph entry', () => {
    const base = composeFixtureGraph()
    const merged = mergeEnablement(base, [
      {
        name: '@fixture/better-sidebar',
        hostApiBase: '/api/plugins/host/better-sidebar',
        clientUrl: '/api/plugins/better-sidebar/files/lib/client.js',
        inject: ['@deepseek-ai/dsh-client-ui-layout'],
      },
    ])
    expect(merged.batches.at(-1)).toMatchObject({
      phase: 'application',
      entries: ['@fixture/better-sidebar'],
      url: '/api/plugins/better-sidebar/files/lib/client.js',
    })
    expect(merged.entries.length).toBe(base.entries.length + 1)
    expect(merged.entries.at(-1)).toMatchObject({
      id: '@fixture/better-sidebar',
      url: '/api/plugins/better-sidebar/files/lib/client.js',
      inject: ['@deepseek-ai/dsh-client-ui-layout'],
    })
  })
  it('changes the graph and batch revision for an updated artifact at the same path', () => {
    const core = composeFixtureGraph()
    const client = { name: 'example', hostApiBase: '/api/plugins/host/example' }
    const first = mergeEnablement(core, [{ ...client, clientUrl: '/example.js?rev=1' }])
    const updated = mergeEnablement(core, [{ ...client, clientUrl: '/example.js?rev=2' }])
    expect(updated.rev).not.toBe(first.rev)
    expect(updated.batches.at(-1)?.rev).not.toBe(first.batches.at(-1)?.rev)
    expect(updated.batches.at(-1)?.url).toBe('/example.js?rev=2')
  })
})