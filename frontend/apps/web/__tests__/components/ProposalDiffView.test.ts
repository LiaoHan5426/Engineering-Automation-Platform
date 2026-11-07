// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test'
import { createApp, h, nextTick, type App } from 'vue'
import { i18n } from '../../src/lib/i18n'
import ProposalDiffView from '../../src/components/ProposalDiffView.vue'

let app: App | undefined
let root: HTMLDivElement | undefined

afterEach(() => {
  app?.unmount()
  root?.remove()
})

it('renders a read-only fallback diff when Monaco is disabled in test mode', async () => {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () =>
      h(ProposalDiffView, {
        path: 'src/App.vue',
        before: 'alpha',
        after: 'beta',
      }),
  })
  app.use(i18n).mount(root)
  await nextTick()
  await nextTick()
  expect(root.querySelector('[data-testid="diff-fallback-note"]')?.textContent).toMatch(
    /Monaco|双栏/,
  )
  expect(root.querySelector('[data-testid="diff-before"]')?.textContent).toBe('alpha')
  expect(root.querySelector('[data-testid="diff-after"]')?.textContent).toBe('beta')
})

it('labels new files when before is null', async () => {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () =>
      h(ProposalDiffView, {
        path: 'src/New.ts',
        before: null,
        after: 'export {}',
      }),
  })
  app.use(i18n).mount(root)
  await nextTick()
  await nextTick()
  const before = root.querySelector('[data-testid="diff-before"]')?.textContent ?? ''
  expect(before).toMatch(/新文件|New file/i)
})
