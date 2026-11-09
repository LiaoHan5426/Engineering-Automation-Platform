// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, KeepAlive, h, ref, type App } from 'vue'
import { runtimeApi, type ToolExecution, type ToolProcessReview } from '@eap/runtime-client'
import Panel from '../../../src/features/capability/TrustedGitExecutionPanel.vue'

let app: App | undefined
let operation: 'git-status' | 'git-diff' = 'git-status'
let root: HTMLDivElement
const row = (status: ToolExecution['status'] = 'RUNNING'): ToolExecution => ({
  id: 'a',
  requestId: 'request',
  programId: 'git',
  capabilityId: operation,
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
  app = createApp(Panel, { enabled: true, operation })
  app.mount(root)
  await settle()
}
function button(id: string) {
  const element = root.querySelector<HTMLButtonElement>(
    `[data-testid="trusted-${operation}-${id}"]`,
  )
  expect(element).not.toBeNull()
  return element!
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(runtimeApi, 'gitOperationExecutions').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'startGitOperationExecution').mockResolvedValue(row())
  vi.spyOn(runtimeApi, 'gitOperationExecution').mockResolvedValue(row('SUCCEEDED'))
  vi.spyOn(runtimeApi, 'cancelGitOperationExecution').mockResolvedValue(row('CANCELLING'))
  vi.spyOn(runtimeApi, 'gitExecutionProcessReview').mockImplementation(async (op, id) => ({
    executionId: id,
    capabilityId: op,
    executionStatus: 'UNKNOWN',
    observedAt: '2026-11-09T08:00:00Z',
    completeProcessTreeEvidence: false,
    truncated: false,
    steps: [
      {
        stepId: 'step',
        phase: 'root',
        process: {
          pid: 42,
          status: 'MATCHING_ALIVE',
          capturedStartedAt: '2026-11-09T07:00:00Z',
          observedStartedAt: '2026-11-09T07:00:00Z',
          capturedExecutable: '/bin/git',
          observedExecutable: '/bin/git',
        },
      },
    ],
  }))
  vi.spyOn(runtimeApi, 'resolveUnknownGitExecution').mockImplementation(
    async (op, id, request) => ({
      ...row('CLOSED_UNKNOWN'),
      id,
      capabilityId: op,
      unconfirmedReason: 'SERVICE_RESTART_EXIT_UNCONFIRMED',
      resolution: {
        ...request,
        requestDigest: 'a'.repeat(64),
        operator: 'local-operator',
        resolvedAt: new Date().toISOString(),
      },
    }),
  )
})
afterEach(() => {
  app?.unmount()
  app = undefined
  root?.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe.each(['git-status', 'git-diff'] as const)('durable %s lifecycle', (op) => {
  beforeEach(() => {
    operation = op
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({ items: [] })
    vi.mocked(runtimeApi.startGitOperationExecution).mockResolvedValue(row())
    vi.mocked(runtimeApi.gitOperationExecution).mockResolvedValue(row('SUCCEEDED'))
    vi.mocked(runtimeApi.cancelGitOperationExecution).mockResolvedValue(row('CANCELLING'))
  })
  async function prepareReview() {
    const textarea = root.querySelector<HTMLTextAreaElement>(
      '[data-testid="trusted-' + operation + '-review-note"]',
    )!
    textarea.value = 'Verified execution and all related child processes stopped'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    root
      .querySelector<HTMLInputElement>('[data-testid="trusted-' + operation + '-review-checked"]')!
      .click()
    await settle()
  }
  function confirmReview() {
    const confirm = document.querySelector<HTMLButtonElement>('.eap-confirm__actions button')!
    expect(confirm).not.toBeNull()
    confirm.click()
  }
  it('inspects only on explicit action and retains UNKNOWN and manual attestation requirements', async () => {
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({ items: [row('UNKNOWN')] })
    await mount()
    expect(runtimeApi.gitExecutionProcessReview).not.toHaveBeenCalled()
    button('process-inspect').click()
    await settle()
    expect(runtimeApi.gitExecutionProcessReview).toHaveBeenCalledWith(
      operation,
      'a',
      expect.any(AbortSignal),
    )
    expect(root.textContent).toContain('身份匹配，进程仍存活')
    expect(root.textContent).toContain('2026-11-09T08:00:00Z')
    expect(button('invoke').disabled).toBe(true)
    expect(button('review-open').disabled).toBe(true)
    expect(runtimeApi.resolveUnknownGitExecution).not.toHaveBeenCalled()
    vi.mocked(runtimeApi.gitExecutionProcessReview).mockResolvedValue({
      executionId: 'a',
      capabilityId: operation,
      executionStatus: 'UNKNOWN',
      observedAt: 'now',
      completeProcessTreeEvidence: false,
      truncated: false,
      steps: [
        {
          stepId: 'step',
          phase: 'root',
          process: {
            pid: 42,
            status: 'NOT_FOUND',
            capturedStartedAt: null,
            observedStartedAt: null,
            capturedExecutable: '/bin/git',
            observedExecutable: '',
          },
        },
      ],
    })
    button('process-inspect').click()
    await settle()
    expect(root.textContent).toContain('当前未找到该 PID')
    expect(button('invoke').disabled).toBe(true)
    expect(button('review-open').disabled).toBe(true)
    expect(root.textContent).toContain('不能证明子进程已结束')
  })
  it('distinguishes legacy, empty and truncated descendant evidence without accepting the review', async () => {
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({ items: [row('UNKNOWN')] })
    const process = {
      pid: 123,
      status: 'NOT_FOUND' as const,
      capturedStartedAt: null,
      observedStartedAt: null,
      capturedExecutable: '/captured/parent',
      observedExecutable: '',
    }
    vi.mocked(runtimeApi.gitExecutionProcessReview).mockResolvedValue({
      executionId: 'a',
      capabilityId: operation,
      executionStatus: 'UNKNOWN',
      observedAt: 'now',
      completeProcessTreeEvidence: false,
      truncated: false,
      steps: [
        { stepId: 'old', phase: 'legacy', process },
        { stepId: 'empty', phase: 'empty', process, descendantsCaptured: true, descendants: [] },
        {
          stepId: 'children',
          phase: 'children',
          process,
          descendantsCaptured: true,
          descendantsTruncated: true,
          descendants: [
            {
              ...process,
              pid: 456,
              status: 'MATCHING_ALIVE',
              capturedExecutable: '/captured/child',
            },
          ],
        },
      ],
    })
    await mount()
    button('process-inspect').click()
    await settle()
    expect(root.textContent).toContain('此步骤未保存子进程身份')
    expect(root.textContent).toContain('执行期间未观察到子进程')
    expect(root.textContent).toContain('子进程证据已截断')
    expect(root.textContent).toContain('/captured/child')
    expect(root.textContent).toContain('身份匹配，进程仍存活')
    expect(button('invoke').disabled).toBe(true)
    expect(button('review-open').disabled).toBe(true)
    expect(runtimeApi.resolveUnknownGitExecution).not.toHaveBeenCalled()
  })
  it('reopens a closed historical execution through scoped GET and inspects it without replay', async () => {
    const closed = {
      ...row('CLOSED_UNKNOWN'),
      id: 'closed',
      unconfirmedReason: 'preserved unknown',
    }
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({
      items: [row('SUCCEEDED'), closed],
    })
    vi.mocked(runtimeApi.gitOperationExecution).mockResolvedValue(closed)
    await mount()
    button('history-open-closed').click()
    await settle()
    expect(runtimeApi.gitOperationExecution).toHaveBeenCalledWith(
      operation,
      'closed',
      expect.any(AbortSignal),
    )
    expect(
      root.querySelector('[data-testid="trusted-' + operation + '-summary"]')?.textContent,
    ).toContain('closed')
    button('process-inspect').click()
    await settle()
    expect(runtimeApi.gitExecutionProcessReview).toHaveBeenCalledWith(
      operation,
      'closed',
      expect.any(AbortSignal),
    )
    expect(runtimeApi.startGitOperationExecution).not.toHaveBeenCalled()
    expect(runtimeApi.cancelGitOperationExecution).not.toHaveBeenCalled()
  })
  it('keeps an UNKNOWN reservation while showing a different historical record', async () => {
    const closed = { ...row('CLOSED_UNKNOWN'), id: 'closed' }
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({
      items: [row('UNKNOWN'), closed],
    })
    vi.mocked(runtimeApi.gitOperationExecution).mockResolvedValue(closed)
    await mount()
    button('history-open-closed').click()
    await settle()
    expect(button('invoke').disabled).toBe(true)
    expect(runtimeApi.startGitOperationExecution).not.toHaveBeenCalled()
  })
  it('discards historical detail after leaving and requires recheck after an unavailable detail', async () => {
    const closed = { ...row('CLOSED_UNKNOWN'), id: 'closed' }
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({
      items: [row('SUCCEEDED'), closed],
    })
    vi.mocked(runtimeApi.gitOperationExecution).mockRejectedValueOnce(
      new Error('detail unavailable'),
    )
    await mount()
    button('history-open-closed').click()
    await settle()
    expect(button('invoke').disabled).toBe(true)
    expect(button('history-open-closed').disabled).toBe(true)
    button('recheck').click()
    await settle()
    let resolve!: (value: ToolExecution) => void
    vi.mocked(runtimeApi.gitOperationExecution).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    button('history-open-closed').click()
    await settle()
    app?.unmount()
    app = undefined
    resolve(closed)
    await settle()
    expect(root.textContent).not.toContain('closed')
    expect(runtimeApi.startGitOperationExecution).not.toHaveBeenCalled()
  })
  it('shows inspection errors separately without clearing UNKNOWN or enabling start', async () => {
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({ items: [row('UNKNOWN')] })
    vi.mocked(runtimeApi.gitExecutionProcessReview).mockRejectedValue(new Error('unavailable'))
    await mount()
    button('process-inspect').click()
    await settle()
    expect(root.textContent).toContain('PROCESS_REVIEW_UNAVAILABLE')
    expect(button('invoke').disabled).toBe(true)
    expect(button('review-open').disabled).toBe(true)
    expect(runtimeApi.startGitOperationExecution).not.toHaveBeenCalled()
  })
  it('discards a late process observation after cached navigation and explicitly rechecks on return', async () => {
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({ items: [row('UNKNOWN')] })
    let resolve!: (value: ToolProcessReview) => void
    vi.mocked(runtimeApi.gitExecutionProcessReview).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const visible = ref(true)
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(KeepAlive, null, {
          default: () => (visible.value ? h(Panel, { enabled: true, operation }) : null),
        }),
    })
    app.mount(root)
    await settle()
    button('process-inspect').click()
    await settle()
    visible.value = false
    await settle()
    resolve({
      executionId: 'a',
      capabilityId: operation,
      executionStatus: 'UNKNOWN',
      observedAt: 'late-observation',
      completeProcessTreeEvidence: false,
      truncated: false,
      steps: [],
    })
    await settle()
    visible.value = true
    await settle()
    expect(root.textContent).not.toContain('late-observation')
    expect(runtimeApi.gitExecutionProcessReview).toHaveBeenCalledTimes(1)
    expect(button('invoke').disabled).toBe(true)
  })
  it('requires notes, process-tree attestation and explicit confirmation; closure keeps outcome unknown', async () => {
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({
      items: [{ ...row('UNKNOWN'), unconfirmedReason: 'SERVICE_RESTART_EXIT_UNCONFIRMED' }],
    })
    await mount()
    expect(button('review-open').disabled).toBe(true)
    await prepareReview()
    expect(button('review-open').disabled).toBe(false)
    button('review-open').click()
    await settle()
    expect(runtimeApi.resolveUnknownGitExecution).not.toHaveBeenCalled()
    expect(document.querySelector('.eap-confirm')?.textContent).toContain('原结果仍未知')
    confirmReview()
    await settle()
    expect(runtimeApi.resolveUnknownGitExecution).toHaveBeenCalledWith(
      operation,
      'a',
      {
        requestId: expect.any(String),
        note: 'Verified execution and all related child processes stopped',
        processTreeStopped: true,
      },
      expect.any(AbortSignal),
    )
    expect(button('invoke').disabled).toBe(false)
    expect(root.textContent).toContain('人工关闭（结果仍未知）')
    expect(root.textContent).toContain('SERVICE_RESTART_EXIT_UNCONFIRMED')
    expect(root.querySelector('[data-testid="trusted-' + operation + '-cancelled"]')).toBeNull()
    expect(runtimeApi.startGitOperationExecution).not.toHaveBeenCalled()
  })
  it('keeps the identical review request after response loss and never automatically resubmits', async () => {
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({ items: [row('UNKNOWN')] })
    vi.mocked(runtimeApi.resolveUnknownGitExecution).mockRejectedValueOnce(
      new Error('response lost'),
    )
    await mount()
    await prepareReview()
    button('review-open').click()
    await settle()
    confirmReview()
    await settle()
    const first = vi.mocked(runtimeApi.resolveUnknownGitExecution).mock.calls[0]!
    expect(button('invoke').disabled).toBe(true)
    expect(button('review-open').disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(3000)
    expect(runtimeApi.resolveUnknownGitExecution).toHaveBeenCalledTimes(1)
    button('recheck').click()
    await settle()
    button('review-open').click()
    await settle()
    confirmReview()
    await settle()
    expect(vi.mocked(runtimeApi.resolveUnknownGitExecution).mock.calls[1]![2]).toEqual(first[2])
    expect(root.textContent).toContain('人工关闭（结果仍未知）')
  })
  it('shows a review conflict without enabling start or losing the original UNKNOWN', async () => {
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({ items: [row('UNKNOWN')] })
    vi.mocked(runtimeApi.resolveUnknownGitExecution).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { detail: 'EXECUTION_OWNER_STILL_ACTIVE' } },
    })
    await mount()
    await prepareReview()
    button('review-open').click()
    await settle()
    confirmReview()
    await settle()
    expect(root.textContent).toContain('EXECUTION_OWNER_STILL_ACTIVE')
    expect(button('invoke').disabled).toBe(true)
    expect(root.querySelector('[data-testid="trusted-' + operation + '-unknown"]')).not.toBeNull()
  })
  it('cancelling the confirmation leaves the review editable and sends no request', async () => {
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({ items: [row('UNKNOWN')] })
    await mount()
    await prepareReview()
    button('review-open').click()
    await settle()
    document.querySelector<HTMLButtonElement>('[data-confirm-cancel]')!.click()
    await settle()
    expect(runtimeApi.resolveUnknownGitExecution).not.toHaveBeenCalled()
    expect(
      root.querySelector<HTMLTextAreaElement>(
        '[data-testid="trusted-' + operation + '-review-note"]',
      )!.disabled,
    ).toBe(false)
  })
  it('a late closure response after unmount is recovered by list readback', async () => {
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({ items: [row('UNKNOWN')] })
    let complete!: (value: ToolExecution) => void
    vi.mocked(runtimeApi.resolveUnknownGitExecution).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    await mount()
    await prepareReview()
    button('review-open').click()
    await settle()
    confirmReview()
    await settle()
    app?.unmount()
    app = undefined
    root.remove()
    const reviewed = {
      ...row('CLOSED_UNKNOWN'),
      resolution: {
        requestId: 'review',
        note: 'Verified all related processes stopped',
        processTreeStopped: true as const,
        requestDigest: 'a'.repeat(64),
        operator: 'local-operator' as const,
        resolvedAt: new Date().toISOString(),
      },
    }
    complete(reviewed)
    await settle()
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({ items: [reviewed] })
    await mount()
    expect(root.textContent).toContain('人工关闭（结果仍未知）')
    expect(button('invoke').disabled).toBe(false)
    expect(runtimeApi.resolveUnknownGitExecution).toHaveBeenCalledTimes(1)
  })
  it('shows a confirmed start denial separately from transport uncertainty', async () => {
    vi.mocked(runtimeApi.startGitOperationExecution).mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { detail: 'CAPABILITY_DISABLED' } },
    })
    await mount()
    button('invoke').click()
    await settle()
    expect(
      root.querySelector(`[data-testid="trusted-${operation}-denied"]`)?.textContent,
    ).toContain('CAPABILITY_DISABLED')
    expect(root.querySelector(`[data-testid="trusted-${operation}-network"]`)).toBeNull()
    expect(root.querySelector(`[data-testid="trusted-${operation}-cancel"]`)).toBeNull()
    expect(button('invoke').disabled).toBe(false)
  })
  it('pauses a cached KeepAlive page and rechecks on return without cancelling', async () => {
    const visible = ref(true)
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({ items: [row()] })
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(KeepAlive, null, {
          default: () => (visible.value ? h(Panel, { enabled: true, operation }) : null),
        }),
    })
    app.mount(root)
    await settle()
    const signal = vi.mocked(runtimeApi.gitOperationExecutions).mock.calls[0]?.[1]
    visible.value = false
    await settle()
    expect(signal?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(3000)
    expect(runtimeApi.gitOperationExecution).not.toHaveBeenCalled()
    expect(runtimeApi.cancelGitOperationExecution).not.toHaveBeenCalled()
    visible.value = true
    await settle()
    expect(runtimeApi.gitOperationExecutions).toHaveBeenCalledTimes(2)
    expect(button('invoke').disabled).toBe(true)
  })
  it('deduplicates same-tick starts and waits for cleanup after cancellation acknowledgement', async () => {
    await mount()
    button('invoke').click()
    button('invoke').click()
    await settle()
    expect(runtimeApi.startGitOperationExecution).toHaveBeenCalledTimes(1)
    expect(button('invoke').disabled).toBe(true)
    button('cancel').click()
    await settle()
    expect(runtimeApi.cancelGitOperationExecution).toHaveBeenCalledWith(
      operation,
      'a',
      expect.any(AbortSignal),
    )
    expect(root.querySelector(`[data-testid="trusted-${operation}-cancelling"]`)).not.toBeNull()
    expect(root.querySelector(`[data-testid="trusted-${operation}-cancelled"]`)).toBeNull()
    vi.mocked(runtimeApi.gitOperationExecution).mockResolvedValue({
      ...row('CANCELLED'),
      exitEvidence: 'tree cleaned',
    })
    await vi.advanceTimersByTimeAsync(1000)
    await settle()
    expect(
      root.querySelector(`[data-testid="trusted-${operation}-cancelled"]`)?.textContent,
    ).toContain('tree cleaned')
    expect(button('invoke').disabled).toBe(false)
    await vi.advanceTimersByTimeAsync(3000)
    expect(runtimeApi.gitOperationExecution).toHaveBeenCalledTimes(1)
  })
  it('leaving aborts HTTP observation and never sends server cancellation; returning reads records', async () => {
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({ items: [row()] })
    await mount()
    const signal = vi.mocked(runtimeApi.gitOperationExecutions).mock.calls[0]?.[1]
    app?.unmount()
    app = undefined
    expect(signal?.aborted).toBe(true)
    expect(runtimeApi.cancelGitOperationExecution).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(3000)
    expect(runtimeApi.gitOperationExecution).not.toHaveBeenCalled()
    root.remove()
    await mount()
    expect(button('invoke').disabled).toBe(true)
    expect(root.textContent).toContain('a')
  })
  it('retains restart UNKNOWN and blocks another start', async () => {
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({
      items: [{ ...row('UNKNOWN'), unconfirmedReason: 'SERVICE_RESTART_EXIT_UNCONFIRMED' }],
    })
    await mount()
    expect(button('invoke').disabled).toBe(true)
    expect(
      root.querySelector(`[data-testid="trusted-${operation}-unknown"]`)?.textContent,
    ).toContain('SERVICE_RESTART')
    expect(root.querySelector(`[data-testid="trusted-${operation}-cancel"]`)).toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    expect(runtimeApi.gitOperationExecution).not.toHaveBeenCalled()
  })
  it('does not overwrite a completed outcome with a late cancel request', async () => {
    vi.mocked(runtimeApi.cancelGitOperationExecution).mockResolvedValue(row('SUCCEEDED'))
    await mount()
    button('invoke').click()
    await settle()
    button('cancel').click()
    await settle()
    expect(root.querySelector(`[data-testid="trusted-${operation}-cancelled"]`)).toBeNull()
    expect(root.textContent).toContain('执行成功')
  })
  it('stops polling after transport failure and rechecks without restarting', async () => {
    vi.mocked(runtimeApi.gitOperationExecution).mockRejectedValue({ name: 'AbortError' })
    await mount()
    button('invoke').click()
    await settle()
    await vi.advanceTimersByTimeAsync(1000)
    await settle()
    expect(root.querySelector(`[data-testid="trusted-${operation}-network"]`)).not.toBeNull()
    expect(root.querySelector(`[data-testid="trusted-${operation}-cancelled"]`)).toBeNull()
    await vi.advanceTimersByTimeAsync(3000)
    expect(runtimeApi.gitOperationExecution).toHaveBeenCalledTimes(1)
    vi.mocked(runtimeApi.gitOperationExecutions).mockResolvedValue({ items: [row('SUCCEEDED')] })
    button('recheck').click()
    await settle()
    expect(runtimeApi.startGitOperationExecution).toHaveBeenCalledTimes(1)
    expect(button('invoke').disabled).toBe(false)
  })
  it('ignores an older poll arriving after a cancellation response', async () => {
    let resolve!: (value: ToolExecution) => void
    vi.mocked(runtimeApi.gitOperationExecution).mockImplementation(
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
    expect(root.querySelector(`[data-testid="trusted-${operation}-cancelling"]`)).not.toBeNull()
  })
  it('keeps the request ID after an uncertain start so recovery cannot duplicate it', async () => {
    vi.mocked(runtimeApi.startGitOperationExecution).mockRejectedValue(new Error('connection lost'))
    await mount()
    button('invoke').click()
    await settle()
    expect(button('invoke').disabled).toBe(true)
    const first = vi.mocked(runtimeApi.startGitOperationExecution).mock.calls[0]?.[1]
    button('recheck').click()
    await settle()
    vi.mocked(runtimeApi.startGitOperationExecution).mockResolvedValue(row())
    button('invoke').click()
    await settle()
    expect(vi.mocked(runtimeApi.startGitOperationExecution).mock.calls[1]?.[1]).toBe(first)
  })
})

it('isolates two mounted panels and only starts the enabled unblocked operation', async () => {
  vi.mocked(runtimeApi.gitOperationExecutions).mockImplementation(async (op) => ({
    items: op === 'git-status' ? [{ ...row('UNKNOWN'), capabilityId: 'git-status' }] : [],
  }))
  vi.mocked(runtimeApi.startGitOperationExecution).mockResolvedValue({
    ...row(),
    capabilityId: 'git-diff',
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () =>
      h('div', [
        h(Panel, { operation: 'git-status', enabled: false }),
        h(Panel, { operation: 'git-diff', enabled: true }),
      ]),
  })
  app.mount(root)
  await settle()
  expect(
    root.querySelector<HTMLButtonElement>('[data-testid="trusted-git-status-invoke"]')?.disabled,
  ).toBe(true)
  const diff = root.querySelector<HTMLButtonElement>('[data-testid="trusted-git-diff-invoke"]')!
  expect(diff.disabled).toBe(false)
  expect(root.textContent).toContain('不包含暂存区和未跟踪文件')
  diff.click()
  await settle()
  expect(runtimeApi.startGitOperationExecution).toHaveBeenCalledWith(
    'git-diff',
    expect.any(String),
    expect.any(Object),
  )
  expect(root.querySelector('[data-testid="trusted-git-status-unknown"]')).not.toBeNull()
})
