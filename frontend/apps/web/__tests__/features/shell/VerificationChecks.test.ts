// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { i18n } from '../../../src/lib/i18n'
import VerificationChecks from '../../../src/features/shell/VerificationChecks.vue'

let app: App | undefined
let host: HTMLDivElement | undefined
afterEach(() => {
  app?.unmount()
  host?.remove()
})

it('renders only an explicit preview URL and clears the link when the evidence disappears', async () => {
  const url = ref<string | undefined>('http://127.0.0.1:5193/detail?view=delivery#form')
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(VerificationChecks, { previewUrl: url.value }) })
  app.use(i18n).mount(host)
  await nextTick()
  expect(host.querySelector('[data-testid="delivery-preview-link"]')?.getAttribute('href')).toBe(
    url.value,
  )
  expect(host.textContent).toContain(i18n.global.t('desktop.acceptanceStillOpen'))
  url.value = undefined
  await nextTick()
  expect(host.querySelector('[data-testid="delivery-preview-link"]')).toBeNull()
  expect(host.querySelector('[data-testid="delivery-preview"]')?.textContent).toBe(
    i18n.global.t('desktop.deliveryPreview'),
  )
  expect(host.textContent).toContain(i18n.global.t('desktop.acceptanceStillOpen'))
})
