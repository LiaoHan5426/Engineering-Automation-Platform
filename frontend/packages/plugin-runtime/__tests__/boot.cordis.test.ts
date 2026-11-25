// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, h, nextTick } from 'vue'
import { bootCordisClient } from '../src/client/boot.ts'
import { LAYOUT_SLOTS } from '../src/client/layoutSlots.ts'

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-sidebar-right-open')
})

describe('bootCordisClient', () => {
  it('mounts rightbar seat and proxies session.phase to py-backend', async () => {
    const fetchHost = vi.fn(async (method: string) => {
      if (method === 'session.phase') return { blank: false }
      return {}
    })
    const app = document.createElement('div')
    app.className = 'app'
    const body = document.createElement('div')
    body.className = 'body'
    const column = document.createElement('aside')
    column.id = 'eap-cordis-sidebar-right'
    column.setAttribute('hidden', '')
    body.appendChild(column)
    app.appendChild(body)
    document.body.appendChild(app)

    const boot = await bootCordisClient({
      hostApiBase: '/api/plugins/host/x',
      fetchHost,
    })

    expect(document.querySelector('#eap-cordis-sidebar-right[data-sidebar-right-seat]')).toBeTruthy()
    expect(app.classList.contains('app--inspector')).toBe(false)
    expect(body.classList.contains('body--inspector')).toBe(false)
    expect(document.querySelector('.workspace-inspector')?.getAttribute('style') ?? '').not.toContain('display: none')
    expect(boot.ctx.get('sidebarRight')).toBeUndefined()
    expect(boot.ctx.get('sidebarRightTabs')).toBeUndefined()
    expect(boot.ctx.get('profile')).toBeUndefined()

    await boot.ctx.remote.session.phase?.({ sessionId: 'eap' })
    expect(fetchHost).toHaveBeenCalledWith('session.phase', { sessionId: 'eap' })

    const slotErrors = [...document.querySelectorAll('[data-slot-error]')].map(
      (n) => n.getAttribute('data-slot-error'),
    )
    expect(slotErrors, `slot errors: ${slotErrors.join(',')}`).toEqual([])

    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 50))

    expect(document.querySelector('[data-sidebar-right-guide]')).toBeNull()
    expect(document.querySelector('#eap-cordis-sidebar-right [data-slot="dsh-layout-rightbar"]')).toBeTruthy()
    expect(document.querySelector('[data-slot-error]')).toBeNull()

    boot.dispose()
  }, 30_000)

  it('mounts catalog probes in the layout outlets', async () => {
    const fetchHost = vi.fn(async () => ({}))
    const boot = await bootCordisClient({
      hostApiBase: '/api/plugins/host/x',
      fetchHost,
    })
    const slots = boot.ctx.get('slots') as {
      register: (options: object, component: unknown) => void
      inject: (key: string, callback: () => () => void) => void
    }
    const probe = (key: string) =>
      defineComponent({
        name: `Probe${key}`,
        setup: () => () => h('span', { 'data-probe': key }, key),
      })
    const register = (key: string) => {
      const slot = LAYOUT_SLOTS.find((item) => item.key === key)
      if (!slot) throw new Error(key)
      const options: Record<string, unknown> = { name: key }
      if (slot.kind === 'list' || slot.kind === 'hoc') options.id = `probe-${key}`
      if (slot.kind === 'keyed') options.key = `probe-${key}`
      if (slot.kind === 'chain') options.select = () => ({ hit: true })
      slots.register(options, probe(key))
    }
    register('settings.section')
    register('conversation.composer.bar')
    register('sidebar.panellist')
    register('settings.header')
    register('plugins.tab')
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 30))

    const slotIn = (region: string, key: string) =>
      document.querySelector(
        `[data-dsh-region="${region}"] [data-slot="dsh-layout-${key}"] [data-probe="${key}"]`,
      )
    expect(slotIn('settings', 'settings.section')).toBeTruthy()
    expect(
      document.querySelector(
        '[data-dsh-region="conversation"] [data-dsh-band="dock"] [data-slot="dsh-layout-conversation.composer.bar"] [data-probe="conversation.composer.bar"]',
      ),
    ).toBeTruthy()
    expect(slotIn('sidebar-leading', 'sidebar.panellist')).toBeTruthy()
    expect(slotIn('sidebar-leading', 'settings.header')).toBeTruthy()
    expect(document.querySelector('[data-dsh-region="settings"] [data-probe="settings.header"]')).toBeNull()
    expect(slotIn('conversation', 'plugins.tab')).toBeTruthy()
    expect(document.querySelector('[data-dsh-region="settings"] [data-probe="plugins.tab"]')).toBeNull()
    const rightSlots = [
      ...document.querySelectorAll('#eap-cordis-sidebar-right [data-slot]'),
    ].map((node) => node.getAttribute('data-slot'))
    expect(rightSlots.some((name) => name?.startsWith('dsh-layout-'))).toBe(true)
    expect(document.querySelector('[data-sidebar-right-guide]')).toBeNull()

    const settings = document.querySelector('[data-dsh-region="settings"]')
    settings?.setAttribute('hidden', '')
    expect(settings?.querySelector('[data-probe="settings.section"]')).toBeTruthy()

    expect(() => slots.inject('not.a.slot', () => () => {})).toThrow(/not\.a\.slot/)
    expect(() => slots.register({ name: 'root' }, probe('root'))).toThrow(/shell\.overlay/)
    boot.dispose()
  }, 30_000)
})
