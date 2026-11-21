// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, type App } from 'vue'
import ListRow from '../src/list-row/ListRow.vue'

let app: App
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
})

type RowProps = {
  badge?: string
  badgeTone?: 'accent' | 'neutral'
  status?: string
  statusTone?: 'neutral' | 'success' | 'warning' | 'danger'
  selected?: boolean
  disabled?: boolean
}

function mount(props: RowProps, slots: Record<string, () => string> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const activate = vi.fn()
  app = createApp({
    render: () =>
      h(ListRow, { ...props, onActivate: activate }, { title: () => '风控审核规则', ...slots }),
  })
  app.mount(host)
  return { host, activate }
}

it('uses a native button so it stays keyboard reachable and matches list button selectors', () => {
  const { host } = mount({ badge: 'RB' })
  const row = host.querySelector('.list button, button')
  expect(row?.tagName).toBe('BUTTON')
  expect(row?.getAttribute('type')).toBe('button')
})

it('renders badge, title, meta and status as separate parts', async () => {
  const { host } = mount(
    { badge: 'RB', status: '已启用', statusTone: 'success' },
    {
      meta: () => '12 条规则',
    },
  )
  await nextTick()
  expect(host.querySelector('.eap-list-row__badge')?.textContent).toBe('RB')
  expect(host.querySelector('.eap-list-row__title')?.textContent).toBe('风控审核规则')
  expect(host.querySelector('.eap-list-row__meta')?.textContent).toBe('12 条规则')
  expect(host.querySelector('.eap-list-row__trailing')?.textContent).toBe('已启用')
  expect(host.querySelector('.eap-list-row')?.getAttribute('data-status-tone')).toBe('success')
})

it('omits the meta line when no meta slot is given', async () => {
  const { host } = mount({ badge: 'RB' })
  await nextTick()
  expect(host.querySelector('.eap-list-row__meta')).toBeNull()
})

it('marks selection with both data and aria so it is not colour-only', async () => {
  const { host } = mount({ badge: 'RB', selected: true })
  await nextTick()
  const row = host.querySelector('.eap-list-row')!
  expect(row.hasAttribute('data-selected')).toBe(true)
  expect(row.getAttribute('aria-current')).toBe('true')
})

it('emits activate on click but never when disabled', async () => {
  const enabled = mount({ badge: 'RB' })
  enabled.host.querySelector<HTMLButtonElement>('.eap-list-row')!.click()
  expect(enabled.activate).toHaveBeenCalledTimes(1)

  const disabled = mount({ badge: 'RB', disabled: true })
  disabled.host.querySelector<HTMLButtonElement>('.eap-list-row')!.click()
  expect(disabled.activate).not.toHaveBeenCalled()
})
