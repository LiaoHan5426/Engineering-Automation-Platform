// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import Panel from '../../../src/components/DeliveryEvidencePanel.vue'
import type { EvidenceFile } from '../../../src/components/deliveryEvidenceModel'
let app: App | undefined, root: HTMLElement
afterEach(() => {
  app?.unmount()
  root?.remove()
})
const labels = {
  title: 'Evidence',
  filter: 'Filter files',
  empty: 'No matching files',
  total: 'Total',
  changed: 'Changed',
  added: 'Added',
  details: 'Details',
  bytes: 'Bytes',
  baseline: 'Baseline',
  boundary: 'Read only; application, validation and acceptance require explicit actions.',
}
const files: EvidenceFile[] = [
  { path: 'frontend/Page.vue', before: 'before', content: '你好', baseHash: 'b'.repeat(64) },
  { path: 'frontend/Summary.vue', before: null, content: 'new', baseHash: 'absent' },
  { path: 'frontend/model.ts', before: 'same', content: 'same', baseHash: 'c'.repeat(64) },
]
async function mount() {
  const current = ref(files)
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(Panel, { files: current.value, status: 'PROPOSED', labels }) })
  app.mount(root)
  await nextTick()
  return current
}
const query = () => root.querySelector<HTMLInputElement>('[data-testid=evidence-filter]')!
async function filter(value: string) {
  query().value = value
  query().dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}
it('shows all-file totals and selected UTF-8 bytes, supports filter, selection and an honest empty state without changing evidence', async () => {
  const original = JSON.stringify(files)
  await mount()
  expect(root.querySelector('[data-testid=evidence-summary]')?.textContent).toContain('Total')
  expect(root.querySelector('[data-testid=evidence-total]')?.textContent).toContain('3')
  expect(root.querySelector('[data-testid=evidence-changed]')?.textContent).toContain('1')
  expect(root.querySelector('[data-testid=evidence-added]')?.textContent).toContain('1')
  expect(root.querySelector('[data-testid=evidence-detail]')?.textContent).toContain('6')
  expect(root.textContent).toContain(labels.boundary)
  await filter('SUMMARY')
  expect(root.querySelectorAll('[data-testid=evidence-file]')).toHaveLength(1)
  ;(root.querySelector('[data-testid=evidence-file]') as HTMLButtonElement).click()
  await nextTick()
  expect(root.querySelector('[data-testid=evidence-detail]')?.textContent).toContain('absent')
  expect(root.querySelector('[data-testid=evidence-total]')?.textContent).toContain('3')
  await filter('no-such-file')
  expect(root.textContent).toContain(labels.empty)
  expect(root.querySelector('[data-testid=evidence-detail]')).toBeNull()
  expect(JSON.stringify(files)).toBe(original)
})
it('reconciles selection and details when the candidate changes or becomes empty', async () => {
  const current = await mount()
  current.value = [{ ...files[2]!, content: 'new candidate' }]
  await nextTick()
  await nextTick()
  expect(root.querySelector('[data-testid=evidence-detail]')?.textContent).toContain(
    'frontend/model.ts',
  )
  expect(root.querySelector('[data-testid=evidence-detail]')?.textContent).not.toContain('你好')
  current.value = []
  await nextTick()
  await nextTick()
  expect(root.textContent).toContain(labels.empty)
  expect(root.querySelector('[data-testid=evidence-detail]')).toBeNull()
})
