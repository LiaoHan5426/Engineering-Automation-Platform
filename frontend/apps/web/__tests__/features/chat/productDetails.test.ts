// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test'
import { createApp, h, nextTick, type App } from 'vue'
import { i18n } from '../../../src/lib/i18n'
import TurnContextDetails from '../../../src/features/chat/TurnContextDetails.vue'
import VerificationChecks from '../../../src/features/shell/VerificationChecks.vue'
import type { ContextBudgetObservation } from '@eap/runtime-client'

let app: App | undefined
let host: HTMLDivElement
afterEach(() => {
  app?.unmount()
  host?.remove()
  i18n.global.locale.value = 'zh-CN'
})
function mount(component: Parameters<typeof h>[0], props: Record<string, unknown>) {
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(component, props) })
  app.use(i18n).mount(host)
}

it.each(['zh-CN', 'en-US'] as const)(
  'keeps raw notes and hashes behind explicit details in %s',
  async (language) => {
    i18n.global.locale.value = language
    mount(TurnContextDetails, {
      budget: {
        usedChars: 236,
        remainingChars: 1000,
        outputReserve: 100,
        metering: 'CHAR_ESTIMATE',
        sources: [{ source: 'system', chars: 232, disposition: 'included' }],
        notes: ['COMPRESSION_NOT_ENABLED'],
      } as ContextBudgetObservation,
      artifacts: [{ kind: 'ai-trace', sizeBytes: 194, sha256: 'private-evidence-hash' }],
    })
    await nextTick()
    const details = [...host.querySelectorAll('details')]
    expect(details).toHaveLength(2)
    expect(details.every((detail) => !detail.open)).toBe(true)
    expect(details[0].querySelector('summary')?.textContent).toContain('236')
    expect(details[0].querySelector('summary')?.textContent).not.toContain('COMPRESSION')
    expect(details[1].querySelector('summary')?.textContent).not.toContain('private-evidence-hash')
    details[0].open = true
    expect(details[0].textContent).toContain('COMPRESSION_NOT_ENABLED')
  },
)

it.each([
  ['not_requested', [], '尚未运行检查'],
  ['passed', [], '检查明细尚不完整'],
  ['passed', [{ name: 'test', exitCode: 0, summary: 'verified' }], '检查已通过'],
  ['failed', [{ name: 'test', exitCode: 1, summary: 'failed' }], '检查未通过'],
  ['UNKNOWN', [], '检查结果待核对'],
] as const)('shows evidence-dependent verification for %s', async (recorded, checks, label) => {
  mount(VerificationChecks, { recorded, checks, origin: 'http://127.0.0.1:5174' })
  await nextTick()
  expect(host.querySelector('[data-testid="verification-result"]')?.textContent).toContain(label)
  expect(host.querySelectorAll('[data-testid="delivery-preview-link"]')).toHaveLength(1)
  expect(
    (host.querySelector('[data-testid="verification-details"]') as HTMLDetailsElement).open,
  ).toBe(false)
  expect(host.textContent).toContain('待人工验收')
  expect(host.textContent).not.toContain('verification =')
  expect(host.textContent).not.toContain('eap.runtime.verification.enabled=false')
})
