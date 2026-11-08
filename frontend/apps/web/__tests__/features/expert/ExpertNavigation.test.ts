// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test'
import { createApp, h, nextTick, type App } from 'vue'
import DesktopNavigation from '../../../src/features/DesktopNavigation.vue'
import { i18n } from '../../../src/lib/i18n'

let app: App | undefined
let host: HTMLElement
const previousHash = location.hash
afterEach(() => {
  app?.unmount()
  host?.remove()
  window.history.replaceState(null, '', previousHash || '#chat')
})
async function mount(hash: string) {
  window.history.replaceState(null, '', hash)
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(DesktopNavigation, { activeView: 'experts', pages: [] }) })
  app.use(i18n).mount(host)
  await settle()
}
async function settle() { await Promise.resolve(); await nextTick() }
function nav(id: string) { return host.querySelector<HTMLButtonElement>(`[data-testid="expert-${id}-nav"]`)! }
function expectSelected(id: 'list' | 'tasks') {
  expect(nav(id).getAttribute('data-active')).toBe('true')
  expect(nav(id).getAttribute('aria-current')).toBe('page')
  expect(nav(id === 'list' ? 'tasks' : 'list').hasAttribute('data-active')).toBe(false)
  expect(host.querySelectorAll('.desktop-sidebar [aria-current="page"]')).toHaveLength(1)
}
async function changeHash(hash: string) {
  window.history.replaceState(null, '', hash)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  await settle()
}
it('selects All tasks exclusively after a click and returns to My experts on a parent route', async () => {
  await mount('#experts')
  expectSelected('list')
  nav('tasks').click()
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  await settle()
  expect(location.hash).toBe('#experts?view=tasks')
  expectSelected('tasks')
  await changeHash('#experts')
  expectSelected('list')
})
it.each([
  ['#experts?view=tasks', 'tasks'],
  ['#experts?view=task&expert=e&run=r&from=all', 'tasks'],
  ['#experts?view=review&expert=e&run=r&from=all', 'tasks'],
  ['#experts?view=tasks&expert=e', 'list'],
  ['#experts?view=task&expert=e&run=r', 'list'],
  ['#experts?view=config&expert=e', 'list'],
] as const)('derives selection from the full direct/history route %s', async (hash, selected) => {
  await mount(hash)
  expectSelected(selected)
})
it('keeps the accepted selection when a draft guard restores the hash during navigation', async () => {
  await mount('#experts?view=config&expert=e')
  const guard = () => window.history.replaceState(null, '', '#experts?view=config&expert=e')
  window.addEventListener('hashchange', guard)
  try {
    await changeHash('#experts?view=tasks')
    expectSelected('list')
  } finally { window.removeEventListener('hashchange', guard) }
})
