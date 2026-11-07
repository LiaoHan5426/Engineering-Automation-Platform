// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi, type CapabilityResponse } from '@eap/runtime-client'
import CapabilityManager from '../../../src/features/capability/CapabilityManager.vue'

let app: App | undefined
let root: HTMLDivElement
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
  await nextTick()
}

async function mount() {
  vi.spyOn(runtimeApi, 'capabilities').mockResolvedValue({
    items: [],
    kinds: [],
    mcpServers: [],
    settings: {},
  } as unknown as CapabilityResponse)
  vi.spyOn(runtimeApi, 'trustedTools').mockResolvedValue({
    source: 'test',
    items: [
      {
        id: 'git-status',
        title: 'Git',
        kind: 'cli',
        scope: 'platform',
        readOnly: true,
        enabled: true,
        invocation: '',
        summary: '',
      },
    ],
  })
  vi.spyOn(runtimeApi, 'dataLayout').mockRejectedValue(new Error('unused'))
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(CapabilityManager)
  app.mount(root)
  await settle()
}

function button(id: string): HTMLButtonElement {
  const element = root.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)
  expect(element).not.toBeNull()
  return element!
}

afterEach(() => {
  app?.unmount()
  app = undefined
  root?.remove()
  vi.restoreAllMocks()
})

describe('trusted tool HTTP wait lifecycle', () => {
  it('stopping wait shows unknown, never confirmed cancellation or success', async () => {
    const invoke = vi.spyOn(runtimeApi, 'invokeTrustedGitStatus').mockImplementation(
      (options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject({ name: 'AbortError' }))
        }),
    )
    await mount()
    button('trusted-git-status-invoke').click()
    await settle()
    expect(button('trusted-git-status-invoke').disabled).toBe(true)
    expect(button('trusted-git-status-cancel').textContent).toContain('停止等待')
    button('trusted-git-status-cancel').click()
    await settle()
    expect(invoke).toHaveBeenCalledTimes(1)
    const result = root.querySelector('[data-testid="trusted-git-status-unknown"]')
    expect(result?.textContent).toContain('未确认后台进程已取消')
    expect(result?.textContent).toContain('CLIENT_WAIT_ABORTED')
    expect(root.querySelector('[data-testid="trusted-git-status-cancelled"]')).toBeNull()
    expect(root.querySelector('[data-testid="trusted-git-status-summary"]')).toBeNull()
    expect(button('trusted-git-status-invoke').disabled).toBe(false)
  })

  it('leaving the work surface stops waiting without claiming server termination', async () => {
    let signal: AbortSignal | undefined
    vi.spyOn(runtimeApi, 'invokeTrustedGitStatus').mockImplementation((options) => {
      signal = options?.signal
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject({ name: 'AbortError' }))
      })
    })
    await mount()
    button('trusted-git-status-invoke').click()
    await settle()
    app?.unmount()
    app = undefined
    expect(signal?.aborted).toBe(true)
    await settle()
  })
})
