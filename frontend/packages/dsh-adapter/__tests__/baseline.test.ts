import { expect, it } from 'vite-plus/test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import accepted from '../baseline/accepted.json'
import fixture from './fixtures/upgrade.json'
// @ts-expect-error build tooling is JavaScript and intentionally outside browser source
import { compare } from '../upgrade/compare.mjs'
import { browserManifest, browserRoster } from '../src/graph'
it('retains exact licensed source bytes and a closed browser roster', () => {
  expect(accepted.commit).toBe('39163dd30f703a79079e2d2446545cff3c453738')
  for (const [path, digest] of Object.entries(accepted.sources)) {
    const data = readFileSync(new URL('../upstream/' + path + '.snapshot', import.meta.url))
    expect(createHash('sha256').update(data).digest('hex'), path).toBe(digest)
  }
  expect(accepted.sources).toHaveProperty('LICENSE')
  const ids = browserRoster.map((row) => row.id)
  for (const row of browserRoster)
    for (const dependency of row.inject) expect(ids).toContain(dependency)
  expect(browserManifest.entries.every((row) => row.url.startsWith('eap-static:'))).toBe(true)
})
it('reports deterministic candidate export/service differences without modifying baseline', () => {
  const first = compare('client.ts', fixture.accepted, fixture.candidate)
  expect(first).toEqual(compare('client.ts', fixture.accepted, fixture.candidate))
  expect(first.status).toBe('review-required')
  expect(first.exports.before).not.toContain('export const host = true')
  expect(first.exports.after).toContain('export const host = true')
  expect(compare('client.ts', fixture.accepted, fixture.accepted).status).toBe('unchanged')
  expect(accepted.commit).toBe('39163dd30f703a79079e2d2446545cff3c453738')
})
