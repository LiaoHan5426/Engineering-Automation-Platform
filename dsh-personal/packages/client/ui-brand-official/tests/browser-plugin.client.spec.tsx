// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {} from '@testing-library/dom'
import { h } from 'vue'
import { cleanupVue as cleanup, renderVue } from '../../ui-primitives/tests/vue-render.ts'
import { within as queriesWithin } from '@testing-library/dom'

function render(node: Parameters<typeof renderVue>[0]) { const view = renderVue(node); return { ...view, ...queriesWithin(document.body) } }
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { OfficialBrandMark, OfficialBrandName } from '../src/client/Brand.tsx'
import { apply as hostApply } from '../src/index.ts'
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const HOLES = [
  'sidebar.brand.mark',
  'sidebar.brand.name',
  'conversation.hero.frame',
] as const
const HERO_HOLE = 'conversation.hero.brand.mark'
async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const declareHoles = () => slots.register({
    name: 'root',
    children: Object.fromEntries([...HOLES, HERO_HOLE].map(name => [name, {
      kind: name === 'conversation.hero.frame' ? 'hoc' : 'single',
      scope: 'root',
    }])),
  } as never, () => null)
  const disposeHoles = declare ? declareHoles() : undefined
  return { ctx, slots, declareHoles, disposeHoles }
}
describe('official browser-brand plugin', () => {
  it('keeps the host Loader entry inert', async () => {
    expect(hostApply).not.toThrow()
  })
  it('declares only the slot service it uses', async () => {
    expect(inject).toEqual(['slots'])
  })
  it('keeps local sidebar branding and provides the same blank-home feedback', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'local')
    const subject = await bench()
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    expect(subject.slots.entries('sidebar.brand.mark')).toHaveLength(0)
    expect(subject.slots.entries('sidebar.brand.name')).toHaveLength(0)
    expect(subject.slots.entries('conversation.hero.frame')).toHaveLength(1)
  })
  it('fills declarations before or after apply and removes every occupant on teardown', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'official')
    const before = await bench()
    const fiber = before.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES)
      expect(before.slots.entries(hole)).toHaveLength(1)
    before.disposeHoles?.()
    for (const hole of HOLES)
      expect(before.slots.entries(hole)).toHaveLength(0)
    before.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES)
      expect(before.slots.entries(hole)).toHaveLength(1)
    await fiber.dispose()
    for (const hole of HOLES)
      expect(before.slots.entries(hole)).toHaveLength(0)
    const after = await bench(false)
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES)
      expect(after.slots.entries(hole)).toHaveLength(0)
    after.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES)
      expect(after.slots.entries(hole)).toHaveLength(1)
  })
  it('leaves the conversation hero on its declaring fallback even in official builds', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'official')
    const subject = await bench()
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    expect(subject.slots.entries(HERO_HOLE)).toHaveLength(0)
  })
  it('registers the whale as a self-contained frame layer without replacing the hero mark', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'official')
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    try {
      await fiber.await()
      const [entry] = subject.slots.entries('conversation.hero.frame')
      expect(entry?.options.id).toBe('pixel-whale')
      expect(entry?.inject).toBeUndefined()
      expect(subject.slots.entries(HERO_HOLE)).toHaveLength(0)
    }
    finally {
      await fiber.dispose()
    }
  })
  it('renders the official name independently from both requested mark sizes', async () => {
    const name = render(h(OfficialBrandName, {}))
    expect(name.container.querySelector('svg')?.getAttribute('viewBox')).toBe('26 0 156 24')
    name.unmount()
    const mark = render(h(OfficialBrandMark, {
      'size': 34,
    }))
    expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('34')
    mark.rerender(h(OfficialBrandMark, {
      'size': 24,
    }))
    expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('24')
  })
})
