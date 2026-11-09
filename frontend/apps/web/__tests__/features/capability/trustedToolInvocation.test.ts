// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, KeepAlive, h, ref, type App } from 'vue'
import { runtimeApi, type ToolExecution } from '@eap/runtime-client'
import Panel from '../../../src/features/capability/TrustedGitExecutionPanel.vue'

let app: App | undefined
let root: HTMLDivElement
const row = (status: ToolExecution['status'] = 'RUNNING'): ToolExecution => ({
  id: 'a',
  requestId: 'request',
  programId: 'git',
  capabilityId: 'git-status',
  workspacePath: '/workspace',
  executable: '/bin/git',
  status,
  cancelRequested: false,
  createdAt: new Date().toISOString(),
  finishedAt: null,
  exitCode: null,
  stdout: '',
  stderr: '',
  truncated: false,
  exitEvidence: null,
  unconfirmedReason: null,
  steps: [],
})
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
  await nextTick()
}
async function mount() {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(Panel, { enabled: true })
  app.mount(root)
  await settle()
}
function button(id: string) {
  const element = root.querySelector<HTMLButtonElement>(`[data-testid="trusted-git-status-${id}"]`)
  expect(element).not.toBeNull()
  return element!
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(runtimeApi, 'trustedGitExecutions').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'startTrustedGitExecution').mockResolvedValue(row())
  vi.spyOn(runtimeApi, 'trustedGitExecution').mockResolvedValue(row('SUCCEEDED'))
  vi.spyOn(runtimeApi, 'cancelTrustedGitExecution').mockResolvedValue(row('CANCELLING'))
})
afterEach(() => {
  app?.unmount()
  app = undefined
  root?.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('durable trusted Git operation lifecycle', () => {
  it('shows a confirmed start denial separately from transport uncertainty', async () => {
    vi.mocked(runtimeApi.startTrustedGitExecution).mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { detail: 'CAPABILITY_DISABLED' } },
    })
    await mount()
    button('invoke').click()
    await settle()
    expect(root.querySelector('[data-testid="trusted-git-status-denied"]')?.textContent).toContain(
      'CAPABILITY_DISABLED',
    )
    expect(root.querySelector('[data-testid="trusted-git-status-network"]')).toBeNull()
    expect(root.querySelector('[data-testid="trusted-git-status-cancel"]')).toBeNull()
    expect(button('invoke').disabled).toBe(false)
  })
  it('pauses a cached KeepAlive page and rechecks on return without cancelling', async () => {
    const visible = ref(true)
    vi.mocked(runtimeApi.trustedGitExecutions).mockResolvedValue({ items: [row()] })
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(KeepAlive, null, { default: () => (visible.value ? h(Panel, { enabled: true }) : null) }),
    })
    app.mount(root)
    await settle()
    const signal = vi.mocked(runtimeApi.trustedGitExecutions).mock.calls[0]?.[0]
    visible.value = false
    await settle()
    expect(signal?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(3000)
    expect(runtimeApi.trustedGitExecution).not.toHaveBeenCalled()
    expect(runtimeApi.cancelTrustedGitExecution).not.toHaveBeenCalled()
    visible.value = true
    await settle()
    expect(runtimeApi.trustedGitExecutions).toHaveBeenCalledTimes(2)
    expect(button('invoke').disabled).toBe(true)
  })
  it('deduplicates same-tick starts and waits for cleanup after cancellation acknowledgement', async () => {
    await mount()
    button('invoke').click()
    button('invoke').click()
    await settle()
    expect(runtimeApi.startTrustedGitExecution).toHaveBeenCalledTimes(1)
    expect(button('invoke').disabled).toBe(true)
    button('cancel').click()
    await settle()
    expect(runtimeApi.cancelTrustedGitExecution).toHaveBeenCalledWith('a', expect.any(AbortSignal))
    expect(root.querySelector('[data-testid="trusted-git-status-cancelling"]')).not.toBeNull()
    expect(root.querySelector('[data-testid="trusted-git-status-cancelled"]')).toBeNull()
    vi.mocked(runtimeApi.trustedGitExecution).mockResolvedValue({
      ...row('CANCELLED'),
      exitEvidence: 'tree cleaned',
    })
    await vi.advanceTimersByTimeAsync(1000)
    await settle()
    expect(
      root.querySelector('[data-testid="trusted-git-status-cancelled"]')?.textContent,
    ).toContain('tree cleaned')
    expect(button('invoke').disabled).toBe(false)
    await vi.advanceTimersByTimeAsync(3000)
    expect(runtimeApi.trustedGitExecution).toHaveBeenCalledTimes(1)
  })
  it('leaving aborts HTTP observation and never sends server cancellation; returning reads records', async () => {
    vi.mocked(runtimeApi.trustedGitExecutions).mockResolvedValue({ items: [row()] })
    await mount()
    const signal = vi.mocked(runtimeApi.trustedGitExecutions).mock.calls[0]?.[0]
    app?.unmount()
    app = undefined
    expect(signal?.aborted).toBe(true)
    expect(runtimeApi.cancelTrustedGitExecution).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(3000)
    expect(runtimeApi.trustedGitExecution).not.toHaveBeenCalled()
    root.remove()
    await mount()
    expect(button('invoke').disabled).toBe(true)
    expect(root.textContent).toContain('a')
  })
  it('retains restart UNKNOWN and blocks another start', async () => {
    vi.mocked(runtimeApi.trustedGitExecutions).mockResolvedValue({
      items: [{ ...row('UNKNOWN'), unconfirmedReason: 'SERVICE_RESTART_EXIT_UNCONFIRMED' }],
    })
    await mount()
    expect(button('invoke').disabled).toBe(true)
    expect(root.querySelector('[data-testid="trusted-git-status-unknown"]')?.textContent).toContain(
      'SERVICE_RESTART',
    )
    expect(root.querySelector('[data-testid="trusted-git-status-cancel"]')).toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    expect(runtimeApi.trustedGitExecution).not.toHaveBeenCalled()
  })
  it('does not overwrite a completed outcome with a late cancel request', async () => {
    vi.mocked(runtimeApi.cancelTrustedGitExecution).mockResolvedValue(row('SUCCEEDED'))
    await mount()
    button('invoke').click()
    await settle()
    button('cancel').click()
    await settle()
    expect(root.querySelector('[data-testid="trusted-git-status-cancelled"]')).toBeNull()
    expect(root.textContent).toContain('执行成功')
  })
  it('stops polling after transport failure and rechecks without restarting', async () => {
    vi.mocked(runtimeApi.trustedGitExecution).mockRejectedValue({ name: 'AbortError' })
    await mount()
    button('invoke').click()
    await settle()
    await vi.advanceTimersByTimeAsync(1000)
    await settle()
    expect(root.querySelector('[data-testid="trusted-git-status-network"]')).not.toBeNull()
    expect(root.querySelector('[data-testid="trusted-git-status-cancelled"]')).toBeNull()
    await vi.advanceTimersByTimeAsync(3000)
    expect(runtimeApi.trustedGitExecution).toHaveBeenCalledTimes(1)
    vi.mocked(runtimeApi.trustedGitExecutions).mockResolvedValue({ items: [row('SUCCEEDED')] })
    button('recheck').click()
    await settle()
    expect(runtimeApi.startTrustedGitExecution).toHaveBeenCalledTimes(1)
    expect(button('invoke').disabled).toBe(false)
  })
  it('ignores an older poll arriving after a cancellation response', async () => {
    let resolve!: (value: ToolExecution) => void
    vi.mocked(runtimeApi.trustedGitExecution).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await mount()
    button('invoke').click()
    await settle()
    await vi.advanceTimersByTimeAsync(1000)
    button('cancel').click()
    await settle()
    resolve(row())
    await settle()
    expect(root.querySelector('[data-testid="trusted-git-status-cancelling"]')).not.toBeNull()
  })
  it('keeps the request ID after an uncertain start so recovery cannot duplicate it', async () => {
    vi.mocked(runtimeApi.startTrustedGitExecution).mockRejectedValue(new Error('connection lost'))
    await mount()
    button('invoke').click()
    await settle()
    expect(button('invoke').disabled).toBe(true)
    const first = vi.mocked(runtimeApi.startTrustedGitExecution).mock.calls[0]?.[0]
    button('recheck').click()
    await settle()
    vi.mocked(runtimeApi.startTrustedGitExecution).mockResolvedValue(row())
    button('invoke').click()
    await settle()
    expect(vi.mocked(runtimeApi.startTrustedGitExecution).mock.calls[1]?.[0]).toBe(first)
  })
})
