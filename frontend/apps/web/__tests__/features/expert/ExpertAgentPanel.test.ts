// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, type App } from 'vue'
import { runtimeApi, type ExpertAgentDetail, type ExpertAgentSummary } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import ExpertAgentPanel from '../../../src/features/expert/ExpertAgentPanel.vue'
import { useExpertAgentRuns } from '../../../src/features/expert/useExpertAgentRuns'

const mode = vi.hoisted(() => ({ preview: false }))
vi.mock('../../../src/lib/serviceConfig', () => ({
  get useMockServices() {
    return mode.preview
  },
}))
let app: App | undefined, host: HTMLElement
let saved: ExpertAgentDetail
function candidate(id = 'run-1'): ExpertAgentDetail {
  return {
    run: {
      id,
      snapshot: { manifest: { id: 'reviewer', name: 'SQL reviewer' }, revision: 3 },
      request: '{}',
      checkpoint: '{}',
      state: 'awaiting-approval',
      attempts: 1,
      automatic: true,
      leaseUntil: null,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      result: null,
    },
    approval: {
      proposal_id: 'proposal-' + id,
      approval_digest: 'digest-' + id,
      approval_expires_at: new Date(Date.now() + 600000).toISOString(),
      decision: null,
      decided_at: null,
      decided_by: null,
    },
    candidate: {
      proposal: {
        id: 'proposal-' + id,
        conversationId: id,
        workspace: '/authorized/workspace',
        summary: 'Unverified SQL',
        files: [
          {
            path: 'queries/review.sql',
            before: 'select 1;',
            content: 'select 2; -- <script>not executable</script>',
            baseHash: 'original-hash',
          },
        ],
        applied: false,
        writeAllowed: true,
        verification: 'unverified',
      },
      status: 'PROPOSED',
      result: null,
      reason: '',
    },
  }
}
function summary(detail: ExpertAgentDetail): ExpertAgentSummary {
  return {
    id: detail.run.id,
    expertId: 'reviewer',
    expertName: 'SQL reviewer',
    state: detail.run.state,
    attempts: 1,
    automatic: true,
    createdAt: '2026-11-08T00:00:00Z',
    updatedAt: '2026-11-08T00:00:00Z',
    expiresAt: detail.run.expiresAt,
  }
}
function button(id: string) {
  return document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!
}
function confirmButton() {
  return document.querySelector<HTMLButtonElement>(
    '[role="dialog"] button:not([data-confirm-cancel])',
  )!
}
async function mount() {
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(ExpertAgentPanel) })
  app.use(i18n).mount(host)
  await vi.waitFor(() => expect(button('agent-approve')).not.toBeNull())
  await vi.waitFor(() => expect(button('agent-approve').disabled).toBe(false))
}
beforeEach(() => {
  mode.preview = false
  saved = candidate()
  vi.spyOn(runtimeApi, 'experts').mockResolvedValue({
    items: [
      JSON.stringify({
        id: 'reviewer',
        name: 'SQL reviewer',
        apiVersion: 'eap/v2',
        behavior: { id: 'sql-readonly-agent', version: 1 },
      }),
    ],
    states: { reviewer: { enabled: true, builtin: false, revision: 3 } },
  })
  vi.spyOn(runtimeApi, 'expertAgentRuns').mockImplementation(async () => ({
    items: [summary(saved)],
    automaticScheduling: true,
  }))
  vi.spyOn(runtimeApi, 'expertAgentRun').mockImplementation(async () => structuredClone(saved))
  vi.spyOn(runtimeApi, 'reviewExpertAgent').mockImplementation(async (_expert, _id, review) => {
    saved.run.state = review.approve ? 'applied' : 'denied'
    saved.candidate!.status = review.approve ? 'APPLIED' : 'FAILED'
    return structuredClone(saved)
  })
  vi.spyOn(runtimeApi, 'queueExpertAgent').mockImplementation(async () => saved.run)
  vi.spyOn(runtimeApi, 'cancelExpertAgent').mockResolvedValue({ cancelRequested: true })
})
afterEach(() => {
  app?.unmount()
  app = undefined
  host?.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('shows persisted candidate diff and only approves after explicit confirmation with the captured digest', async () => {
  saved.run.result = JSON.stringify({ status: 'awaiting-approval', summary: 'Awaiting file approval' })
  await mount()
  expect(host.textContent).toContain('Awaiting file approval')
  expect(host.textContent).toContain('/authorized/workspace')
  expect(host.textContent).toContain('original-hash')
  expect(host.querySelector('script')).toBeNull()
  button('agent-approve').click()
  await nextTick()
  expect(runtimeApi.reviewExpertAgent).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('digest-run-1')
  confirmButton().click()
  await vi.waitFor(() =>
    expect(runtimeApi.reviewExpertAgent).toHaveBeenCalledWith('reviewer', 'run-1', {
      proposalId: 'proposal-run-1',
      digest: 'digest-run-1',
      approve: true,
    }),
  )
  await vi.waitFor(() => expect(host.textContent).toContain('文件已写入，未执行 SQL'))
  expect(host.textContent).not.toContain('Awaiting file approval')
  expect(button('agent-approve').disabled).toBe(true)
})

it('shows loading rather than claiming scheduling is unavailable before the first response', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof runtimeApi.expertAgentRuns>>) => void
  vi.mocked(runtimeApi.expertAgentRuns).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(ExpertAgentPanel) })
  app.use(i18n).mount(host)
  await nextTick()
  expect(host.textContent).toContain('正在读取服务端状态')
  expect(host.textContent).not.toContain('后台调度不可用')
  expect(host.textContent).not.toContain('暂无后台任务')
  resolve({ items: [], automaticScheduling: true })
  await vi.waitFor(() => expect(host.textContent).toContain('暂无后台任务'))
  expect(host.textContent).not.toContain('后台调度不可用')
})

it('discards a list poll begun before approval so it cannot replace the returned terminal state', async () => {
  let state!: ReturnType<typeof useExpertAgentRuns>
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    setup() {
      state = useExpertAgentRuns()
      return () => h('div')
    },
  })
  app.mount(host)
  await vi.waitFor(() => expect(state.canReview.value).toBe(true))
  let resolve!: (value: Awaited<ReturnType<typeof runtimeApi.expertAgentRuns>>) => void
  vi.mocked(runtimeApi.expertAgentRuns).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const pending = state.refresh()
  await state.review(true, state.detail.value!)
  expect(state.detail.value?.run.state).toBe('applied')
  resolve({ items: [summary(candidate())], automaticScheduling: true })
  await pending
  expect(runtimeApi.expertAgentRun).toHaveBeenCalledTimes(1)
  expect(state.detail.value?.run.state).toBe('applied')
})
it('rejects the bound candidate and reopening does not submit a second decision', async () => {
  await mount()
  button('agent-deny').click()
  await nextTick()
  confirmButton().click()
  await vi.waitFor(() => expect(saved.run.state).toBe('denied'))
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
  app!.unmount()
  app = undefined
  host.remove()
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(ExpertAgentPanel) })
  app.use(i18n).mount(host)
  await vi.waitFor(() =>
    expect(host.querySelector('[data-testid="agent-state"]')?.textContent).toContain('已拒绝'),
  )
  expect(runtimeApi.reviewExpertAgent).toHaveBeenCalledTimes(1)
  expect(button('agent-approve').disabled).toBe(true)
})
it.each(['unknown', 'expired', 'awaiting-approval'] as const)(
  'disables approval for %s with expired approval',
  async (state) => {
    saved.run.state = state
    saved.approval.approval_expires_at = new Date(Date.now() - 1000).toISOString()
    host = document.createElement('div')
    document.body.append(host)
    app = createApp({ render: () => h(ExpertAgentPanel) })
    app.use(i18n).mount(host)
    await vi.waitFor(() => expect(button('agent-approve')).not.toBeNull())
    expect(button('agent-approve').disabled).toBe(true)
    if (state === 'unknown') expect(host.textContent).toContain('不要重复应用')
    expect(runtimeApi.reviewExpertAgent).not.toHaveBeenCalled()
  },
)
it('explicitly disables background submission in preview without making API requests', async () => {
  mode.preview = true
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(ExpertAgentPanel) })
  app.use(i18n).mount(host)
  await nextTick()
  expect(host.textContent).toContain('预览模式未连接后台调度')
  expect(button('agent-submit').disabled).toBe(true)
  expect(runtimeApi.expertAgentRuns).not.toHaveBeenCalled()
  expect(runtimeApi.experts).not.toHaveBeenCalled()
  expect(runtimeApi.queueExpertAgent).not.toHaveBeenCalled()
})
it('retains approval errors and reloads durable state rather than assuming a successful write', async () => {
  vi.mocked(runtimeApi.reviewExpertAgent).mockRejectedValue(new Error('baseline changed'))
  await mount()
  button('agent-approve').click()
  await nextTick()
  confirmButton().click()
  await vi.waitFor(() => expect(host.textContent).toContain('baseline changed'))
  expect(host.querySelector('[data-testid="agent-state"]')?.textContent).toContain('等待写入审批')
  expect(runtimeApi.expertAgentRun).toHaveBeenCalledTimes(2)
})
it('requires cost confirmation to enqueue and does not cancel the server task when the panel unmounts', async () => {
  await mount()
  const sql = host.querySelector<HTMLTextAreaElement>('#agent-sql')!
  sql.value = 'select 1'
  sql.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  button('agent-submit').click()
  await nextTick()
  expect(runtimeApi.queueExpertAgent).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('模型费用')
  confirmButton().click()
  await vi.waitFor(() => expect(runtimeApi.queueExpertAgent).toHaveBeenCalledTimes(1))
  expect(vi.mocked(runtimeApi.queueExpertAgent).mock.calls[0]?.[2].sql).toBe('select 1')
  app!.unmount()
  app = undefined
  expect(runtimeApi.cancelExpertAgent).not.toHaveBeenCalled()
})
it('stops polling after unmount and discards a late response from a previously selected run', async () => {
  const second = candidate('run-2')
  vi.mocked(runtimeApi.expertAgentRuns).mockResolvedValue({
    items: [summary(saved), summary(second)],
    automaticScheduling: true,
  })
  await mount()
  let resolve!: (detail: ExpertAgentDetail) => void
  vi.mocked(runtimeApi.expertAgentRun).mockImplementation((_expert, id) =>
    id === 'run-1'
      ? new Promise((done) => {
          resolve = done
        })
      : Promise.resolve(second),
  )
  button('agent-run-run-1').click()
  await nextTick()
  button('agent-run-run-2').click()
  await nextTick()
  resolve(saved)
  await vi.waitFor(() => expect(host.querySelector('[data-testid="agent-approve"]')).not.toBeNull())
  button('agent-approve').click()
  await nextTick()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('digest-run-2')
  vi.useFakeTimers()
  app!.unmount()
  app = undefined
  const count = vi.mocked(runtimeApi.expertAgentRuns).mock.calls.length
  await vi.advanceTimersByTimeAsync(5000)
  expect(runtimeApi.expertAgentRuns).toHaveBeenCalledTimes(count)
})
