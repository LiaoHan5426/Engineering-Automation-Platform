// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { runtimeApi, type ExpertAgentDetail, type ExpertAgentSummary } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import ExpertAgentPanel from '../../../src/features/expert/ExpertAgentPanel.vue'
import { useExpertAgentRuns } from '../../../src/features/expert/useExpertAgentRuns'

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
async function mount(mode: 'review' | 'start' | 'task' = 'review') {
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    render: () => h(ExpertAgentPanel, { mode, expertId: 'reviewer', runId: 'run-1' }),
  })
  app.use(i18n).mount(host)
  if (mode === 'review')
    await vi.waitFor(() => expect(button('agent-approve')?.disabled).toBe(false))
  else await vi.waitFor(() => expect(host.textContent).toContain('SQL reviewer'))
}
beforeEach(() => {
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

it('orders the task goal, result and references before optional supporting details', async () => {
  saved.run.request = JSON.stringify({ question: 'Check NULL semantics', sql: 'select 1' })
  saved.run.result = JSON.stringify({
    status: 'awaiting-approval',
    summary: 'Candidate needs review',
    citations: [
      {
        id: 'ref-1',
        source: 'SQL reference',
        knowledgeBase: 'SQL notes',
        excerpt: 'Saved source excerpt',
      },
    ],
  })
  await mount('task')
  await vi.waitFor(() => expect(host.querySelector('[data-testid=task-goal]')).not.toBeNull())
  const text = host.textContent!
  expect(text.indexOf('任务目标')).toBeLessThan(text.indexOf('结果与待办'))
  expect(text.indexOf('结果与待办')).toBeLessThan(text.indexOf('已收集的参考资料'))
  expect(host.querySelectorAll('summary')).toHaveLength(0)
  expect(text).not.toContain('Saved source excerpt')
  expect(text).not.toContain('select 1')
  expect(text).not.toContain('digest-run-1')
  button('task-reference-0').click()
  await nextTick()
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('Saved source excerpt')
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('不是操作授权')
  expect(runtimeApi.reviewExpertAgent).not.toHaveBeenCalled()
})

it('opens full input and run metadata in the shared drawer without losing the main result', async () => {
  saved.run.request = JSON.stringify({
    question: 'Inspect query',
    sql: 'SELECT <script>unsafe</script>',
    targetPath: 'queries/review.sql',
    databaseId: 'profile-1',
    explainPlan: { Plan: 'Synthetic plan' },
  })
  await mount('task')
  await vi.waitFor(() => expect(button('task-input-open')).not.toBeNull())
  button('task-input-open').click()
  await nextTick()
  let dialog = document.querySelector<HTMLElement>('[role=dialog]')!
  expect(dialog.textContent).toContain('SELECT <script>unsafe</script>')
  expect(dialog.textContent).toContain('Synthetic plan')
  expect(dialog.querySelector('script')).toBeNull()
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await nextTick()
  expect(document.querySelector('[role=dialog]')).toBeNull()
  button('task-run-open').click()
  await nextTick()
  dialog = document.querySelector('[role=dialog]')!
  expect(dialog.textContent).toContain('run-1')
  expect(dialog.textContent).toContain('本任务使用专家版本 3')
  expect(host.querySelector('[data-testid=task-result]')).not.toBeNull()
  expect(runtimeApi.queueExpertAgent).not.toHaveBeenCalled()
})
afterEach(() => {
  app?.unmount()
  app = undefined
  host?.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('shows persisted candidate diff and only approves after explicit confirmation with the captured digest', async () => {
  saved.run.result = JSON.stringify({
    status: 'awaiting-approval',
    summary: 'Awaiting file approval',
  })
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
  expect(button('agent-approve')).toBeNull()
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
  app = createApp({ render: () => h(ExpertAgentPanel, { mode: 'tasks' }) })
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
  app = createApp({
    render: () => h(ExpertAgentPanel, { mode: 'review', expertId: 'reviewer', runId: 'run-1' }),
  })
  app.use(i18n).mount(host)
  await vi.waitFor(() =>
    expect(host.querySelector('[data-testid="agent-state"]')?.textContent).toContain('已拒绝'),
  )
  expect(runtimeApi.reviewExpertAgent).toHaveBeenCalledTimes(1)
  expect(button('agent-approve')).toBeNull()
})
it.each(['unknown', 'expired', 'awaiting-approval'] as const)(
  'disables approval for %s with expired approval',
  async (state) => {
    saved.run.state = state
    saved.approval.approval_expires_at = new Date(Date.now() - 1000).toISOString()
    host = document.createElement('div')
    document.body.append(host)
    app = createApp({
      render: () => h(ExpertAgentPanel, { mode: 'review', expertId: 'reviewer', runId: 'run-1' }),
    })
    app.use(i18n).mount(host)
    await vi.waitFor(() => expect(host.querySelector('[data-testid=agent-state]')).not.toBeNull())
    if (state === 'awaiting-approval') expect(button('agent-approve').disabled).toBe(true)
    else expect(button('agent-approve')).toBeNull()
    if (state === 'unknown') expect(host.textContent).toContain('不要重复应用')
    expect(runtimeApi.reviewExpertAgent).not.toHaveBeenCalled()
  },
)
it('retains approval errors and reloads durable state rather than assuming a successful write', async () => {
  vi.mocked(runtimeApi.reviewExpertAgent).mockRejectedValue({
    response: {
      status: 409,
      data: { code: 'FILE_CHANGED_SINCE_PROPOSAL', detail: 'baseline changed' },
    },
  })
  await mount()
  button('agent-approve').click()
  await nextTick()
  confirmButton().click()
  await vi.waitFor(() => expect(host.textContent).toContain('baseline changed'))
  expect(host.querySelector('[data-testid="agent-state"]')?.textContent).toContain('等待写入审批')
  expect(runtimeApi.expertAgentRun).toHaveBeenCalledTimes(2)
})
it('requires cost confirmation to enqueue and does not cancel the server task when the panel unmounts', async () => {
  await mount('start')
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
  const currentRun = ref('run-1')
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    render: () =>
      h(ExpertAgentPanel, { mode: 'review', expertId: 'reviewer', runId: currentRun.value }),
  })
  app.use(i18n).mount(host)
  await vi.waitFor(() => expect(button('agent-approve')?.disabled).toBe(false))
  let resolve!: (detail: ExpertAgentDetail) => void
  vi.mocked(runtimeApi.expertAgentRun).mockImplementation((_expert, id) =>
    id === 'run-1'
      ? new Promise((done) => {
          resolve = done
        })
      : Promise.resolve(second),
  )
  host.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    if (button.textContent?.trim() === '刷新') button.click()
  })
  await nextTick()
  currentRun.value = 'run-2'
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

it('shows only scoped tasks and does not fetch or render a task detail on list entry', async () => {
  vi.mocked(runtimeApi.expertAgentRuns).mockResolvedValue({
    items: [summary(saved), { ...summary(saved), id: 'other-run', expertId: 'other' }],
    automaticScheduling: true,
  })
  host = document.createElement('div')
  document.body.append(host)
  const navigate = vi.fn()
  app = createApp({
    render: () =>
      h(ExpertAgentPanel, { mode: 'tasks', expertId: 'reviewer', onNavigate: navigate }),
  })
  app.use(i18n).mount(host)
  await vi.waitFor(() => expect(button('agent-run-run-1')).not.toBeNull())
  expect(button('agent-run-other-run')).toBeNull()
  expect(host.querySelector('[data-testid=agent-detail]')).toBeNull()
  expect(host.querySelector('#agent-sql')).toBeNull()
  expect(runtimeApi.expertAgentRun).not.toHaveBeenCalled()
  button('agent-run-run-1').click()
  expect(navigate).toHaveBeenCalledWith({
    page: 'task',
    expertId: 'reviewer',
    runId: 'run-1',
    from: undefined,
  })
})

it('stops network polling for terminal details and refreshes only on explicit request', async () => {
  saved.run.state = 'partial'
  let state!: ReturnType<typeof useExpertAgentRuns>
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    setup() {
      state = useExpertAgentRuns(false, () => 'detail')
      return () => h('div')
    },
  })
  app.mount(host)
  await vi.waitFor(() => expect(state.checking.value).toBe(false))
  await state.select({ id: 'run-1', expertId: 'reviewer' })
  await nextTick()
  vi.useFakeTimers()
  const reads = vi.mocked(runtimeApi.expertAgentRun).mock.calls.length
  const lists = vi.mocked(runtimeApi.expertAgentRuns).mock.calls.length
  await vi.advanceTimersByTimeAsync(10000)
  expect(runtimeApi.expertAgentRun).toHaveBeenCalledTimes(reads)
  expect(runtimeApi.expertAgentRuns).toHaveBeenCalledTimes(lists)
  await state.refresh()
  expect(runtimeApi.expertAgentRun).toHaveBeenCalledTimes(reads + 1)
})

it('refreshes active details in the background without inserting loading content and stops on completion', async () => {
  saved.run.state = 'running'
  let state!: ReturnType<typeof useExpertAgentRuns>
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    setup() {
      state = useExpertAgentRuns(false, () => 'detail')
      return () => h('div')
    },
  })
  app.mount(host)
  await vi.waitFor(() => expect(state.checking.value).toBe(false))
  vi.useFakeTimers()
  await state.select({ id: 'run-1', expertId: 'reviewer' })
  await nextTick()
  let resolve!: (value: ExpertAgentDetail) => void
  vi.mocked(runtimeApi.expertAgentRun).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await vi.advanceTimersByTimeAsync(2000)
  expect(state.loading.value).toBe(false)
  expect(state.detail.value?.run.state).toBe('running')
  saved.run.state = 'completed'
  resolve(structuredClone(saved))
  await vi.advanceTimersByTimeAsync(1)
  const count = vi.mocked(runtimeApi.expertAgentRun).mock.calls.length
  await vi.advanceTimersByTimeAsync(10000)
  expect(state.detail.value?.run.state).toBe('completed')
  expect(runtimeApi.expertAgentRun).toHaveBeenCalledTimes(count)
})
