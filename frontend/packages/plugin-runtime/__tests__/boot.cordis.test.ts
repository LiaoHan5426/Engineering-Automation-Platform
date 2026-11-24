// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { bootCordisClient } from '../src/client/boot.ts'

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-sidebar-right-open')
})

describe('bootCordisClient (real ui-sidebar-right)', () => {
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
    expect(boot.ctx.get('sidebarRight')).toBeTruthy()
    expect(boot.ctx.get('sidebarRightTabs')).toBeTruthy()
    expect(boot.ctx.get('profile')).toBeUndefined()

    await boot.ctx.remote.session.phase?.({ sessionId: 'eap' })
    expect(fetchHost).toHaveBeenCalledWith('session.phase', { sessionId: 'eap' })

    const slotErrors = [...document.querySelectorAll('[data-slot-error]')].map(
      (n) => n.getAttribute('data-slot-error'),
    )
    expect(slotErrors, `slot errors: ${slotErrors.join(',')}`).toEqual([])

    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 50))

    const host = document.querySelector('#eap-cordis-sidebar-right')
    const dump = host?.innerHTML?.slice(0, 1200) ?? '(no column)'
    expect(
      document.querySelector('[data-sidebar-right-guide]'),
      `expected guide; html=${dump}`,
    ).toBeTruthy()
    expect(document.querySelector('[data-slot-error]')).toBeNull()

    boot.dispose()
  }, 30_000)
})
