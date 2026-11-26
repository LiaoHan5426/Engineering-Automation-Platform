import { describe, expect, it } from 'vite-plus/test'
import { bootInjections } from '../src/boot-injections.ts'
import { composeFixtureGraph } from '../src/compose-fixture.ts'
import { renderIndexInjections } from '../src/injections.ts'

describe('renderIndexInjections', () => {
  it('inserts __DSH_BOOT_READY__ resolve and __DSH_BOOT__ global', () => {
    const graph = composeFixtureGraph()
    const html = renderIndexInjections(
      '<html><head></head><body><div id="root"></div></body></html>',
      bootInjections(graph),
    )
    expect(html).toContain('__DSH_BOOT_READY__')
    expect(html).toContain('Promise.withResolvers()')
    expect(html).toContain('globalThis["__DSH_BOOT__"]')
    expect(html).toContain('"fixture-slice-b"')
  })
})