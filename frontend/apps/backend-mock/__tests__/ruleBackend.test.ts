import { expect, it } from 'vite-plus/test'
import { createRuleBackend } from '../src/ruleBackend'

const setup = () => {
  const backend = createRuleBackend()
  const call = (method: string, path: string, body: Record<string, unknown> = {}) =>
    backend.handle(method, new URL(path, 'http://mock.local'), body)
  return { backend, call }
}

it('lists seeded packs with the exact summary fields the rule manager renders', () => {
  const { call } = setup()
  const reply = call('GET', '/rule-packs')!
  expect(reply.status).toBe(200)
  const data = reply.data as { items: Array<Record<string, unknown>> }
  expect(data.items).toHaveLength(3)
  expect(data.items.map((p) => p.id)).toEqual(['shipped-core', 'custom-credit', 'custom-disabled'])
  expect(data.items[0]).toMatchObject({ shipped: true, enabled: true, ruleCount: 8 })
  expect(data.items[1]).toMatchObject({ shipped: false, enabled: true, revision: 3 })
  expect(data.items[2]).toMatchObject({ shipped: false, enabled: false })
  // The manifest must never leak into the list payload.
  expect(data.items[0]).not.toHaveProperty('manifest')
})

it('serves vocabulary and a read-only detail for shipped packs', () => {
  const { call } = setup()
  expect(call('GET', '/rule-packs/vocabulary')!.data).toMatchObject({
    operators: expect.arrayContaining(['eq', 'gt']),
    facts: expect.arrayContaining([expect.objectContaining({ id: 'table.count' })]),
  })
  const detail = call('GET', '/rule-packs/shipped-core')!.data as {
    manifest: string
    shipped: boolean
    editable: boolean
  }
  expect(detail.shipped).toBe(true)
  expect(detail.editable).toBe(false)
  expect(JSON.parse(detail.manifest)).toMatchObject({ id: 'shipped-core' })
})

it('creates, updates and toggles a custom pack, incrementing its revision', () => {
  const { call } = setup()
  const created = call('POST', '/rule-packs', {
    id: 'custom-new',
    name: 'New pack',
    manifest: '{"id":"custom-new"}',
  })!
  expect(created.status).toBe(200)
  expect(created.data).toMatchObject({ id: 'custom-new', revision: 1, enabled: true })
  expect(call('POST', '/rule-packs', { id: 'custom-new' })!.status).toBe(409)

  const updated = call('PUT', '/rule-packs/custom-new', { name: 'Renamed', manifest: '{}' })!
  expect(updated.data).toMatchObject({ revision: 2 })
  const toggled = call('PUT', '/rule-packs/custom-new/activation', { enabled: false })!
  expect(toggled.data).toMatchObject({ enabled: false })
  expect(
    (call('GET', '/rule-packs')!.data as { items: Array<Record<string, unknown>> }).items.find(
      (p) => p.id === 'custom-new',
    ),
  ).toMatchObject({ name: 'Renamed', enabled: false, revision: 2 })
  expect(call('DELETE', '/rule-packs/custom-new')!.status).toBe(200)
  expect(call('GET', '/rule-packs/custom-new')!.status).toBe(404)
})

it('refuses to delete a shipped pack and ignores unrelated routes', () => {
  const { call } = setup()
  expect(call('DELETE', '/rule-packs/shipped-core')!.status).toBe(400)
  expect(call('GET', '/something-else')).toBeUndefined()
  expect(call('GET', '/rule-packs/no-such-pack')!.status).toBe(404)
})
