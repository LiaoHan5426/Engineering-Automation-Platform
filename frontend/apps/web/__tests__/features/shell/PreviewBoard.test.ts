// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { createApp, type App } from 'vue'
import { AxiosError } from 'axios'
import {
  runtimeApi,
  type BoardTask,
  type BoardRun,
  type BoardDelivery,
  type PrototypeVersionRecord,
} from '@eap/runtime-client'
import { createMockChatBackend } from '@eap/backend-mock/backend'
import { i18n } from '../../../src/lib/i18n'
import PreviewBoard from '../../../src/features/shell/PreviewBoard.vue'
import { chatBinding, workbench, type ChatBinding } from '../../../src/features/shell/workbench'
import { writeTaskHandoff } from '../../../src/features/shell/boardTaskHandoff'
import { apiStorageScope } from '../../../src/lib/runtimeConfig'
import { localProjectState } from '../../../src/features/shell/localProjects'
vi.mock('node:url', () => ({ fileURLToPath: () => '/mock/workspace/' }))
let app: App, root: HTMLDivElement
const fill = (selector: string, value: string) => {
  const input = document.querySelector(selector) as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
}
const prepare = () => {
  fill('[data-testid=board-new-goal]', '完成任务目标')
  fill('[data-testid=board-new-criteria]', '构建与检查通过')
}
async function mountBoard() {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(PreviewBoard)
  app.use(i18n).mount(root)
  await vi.waitFor(() =>
    expect(
      (root.querySelector('[data-testid=board-create-task]') as HTMLButtonElement).disabled,
    ).toBe(false),
  )
}
async function createTask() {
  ;(root.querySelector('[data-testid=board-create-task]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(document.querySelector('form')).not.toBeNull())
  fill('form input', '并发准备任务')
  prepare()
  ;(document.querySelector('form') as HTMLFormElement).requestSubmit()
  await vi.waitFor(() => expect(detail()).not.toBeNull())
}
const detail = () => document.querySelector('[data-testid=board-detail]') as HTMLElement | null
beforeEach(() => {
  window.history.replaceState(null, '', '#board')
  sessionStorage.clear()
  localStorage.removeItem(apiStorageScope + '.eap.board-task-handoff.v1')
  const mock = createMockChatBackend()
  const call = async (method: string, path: string, body = {}) => {
    const reply = await mock.handle(method, path, body)
    if (reply.status >= 400)
      throw new AxiosError('rejected', undefined, undefined, undefined, {
        status: reply.status,
        data: reply.data,
      } as never)
    return JSON.parse(JSON.stringify(reply.data))
  }
  vi.spyOn(runtimeApi, 'cancelTaskDescriptionOptimization').mockResolvedValue(undefined)
  vi.spyOn(runtimeApi, 'prototypeVersions').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'boardRuns').mockResolvedValue({
    availability: {
      allowed: false,
      workspacePath: '',
      workspaceLabel: '',
      reason: 'MOCK_RUN_NOT_AVAILABLE',
    },
    items: [],
  })
  vi.spyOn(runtimeApi, 'boardTasks').mockImplementation((id) =>
    call('GET', '/board/tasks?projectId=' + id),
  )
  vi.spyOn(runtimeApi, 'createBoardTask').mockImplementation((draft) =>
    call('POST', '/board/tasks', draft),
  )
  vi.spyOn(runtimeApi, 'updateBoardTask').mockImplementation((id, body) =>
    call('POST', '/board/tasks/' + id, body),
  )
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '#board')
  workbench.pendingBoardDraft = null
  chatBinding.value = null
  localProjectState.projects = localProjectState.projects.filter(
    (project) => project.id !== 'other-project',
  )
  localStorage.removeItem(apiStorageScope + '.eap.board-task-handoff.v1')
})
const click = (id: string) =>
  (document.querySelector(`[data-testid=${id}]`) as HTMLButtonElement).click()
const goalValue = () =>
  (document.querySelector('[data-testid=board-new-goal]') as HTMLTextAreaElement).value
async function openOptimizationForm() {
  await mountBoard()
  click('board-create-task')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-new-goal]')).not.toBeNull(),
  )
  fill('[data-testid=board-new-title]', '目标建议任务')
  prepare()
  await vi.waitFor(() =>
    expect(
      (document.querySelector('[data-testid=board-optimize-goal]') as HTMLButtonElement).disabled,
    ).toBe(false),
  )
}
const taskGoal = () => (document.querySelector('[data-testid=task-goal]') as HTMLTextAreaElement).value
async function openEditOptimization() {
  await mountBoard()
  await createTask()
  await vi.waitFor(() => expect(document.querySelector('[data-testid=task-goal-optimize]')).not.toBeNull())
}
it('adopts into the existing goal draft only and saves all fields with the original CAS revision', async () => {
  vi.spyOn(runtimeApi, 'optimizeTaskDescription').mockResolvedValue({ text: 'AI draft', connectionId: 'c', model: 'm' })
  await openEditOptimization()
  const task = (await runtimeApi.boardTasks(vi.mocked(runtimeApi.createBoardTask).mock.calls[0]![0].projectId)).items[0]!
  fill('[data-testid=task-notes]', 'keep notes')
  fill('[data-testid=task-criteria]', 'keep criteria')
  const priority = document.querySelector('[data-testid=task-priority]') as HTMLSelectElement
  priority.value = 'p1'
  priority.dispatchEvent(new Event('change'))
  click('task-goal-optimize')
  await vi.waitFor(() => expect(document.querySelector('[data-testid=task-goal-suggestion]')).not.toBeNull())
  expect(taskGoal()).toBe(task.goal)
  click('task-goal-adopt')
  await vi.waitFor(() => expect(taskGoal()).toBe('AI draft'))
  expect(runtimeApi.updateBoardTask).not.toHaveBeenCalled()
  expect((document.querySelector('[data-testid=task-criteria]') as HTMLTextAreaElement).value).toBe('keep criteria')
  expect((document.querySelector('[data-testid=task-notes]') as HTMLTextAreaElement).value).toBe('keep notes')
  expect(priority.value).toBe('p1')
  click('board-save-fields')
  await vi.waitFor(() => expect(runtimeApi.updateBoardTask).toHaveBeenCalledWith(task.id, {
    projectId: task.projectId, revision: task.revision, goal: 'AI draft',
    acceptanceCriteria: 'keep criteria', notes: 'keep notes', priority: 'p1',
  }))
})
it.each(['aba', 'cancel', 'close', 'task', 'save', 'unmount'] as const)(
  'cancels existing goal optimization on %s and drops late results', async (action) => {
    let finish!: (result: { text: string; connectionId: string; model: string }) => void
    const optimize = vi.spyOn(runtimeApi, 'optimizeTaskDescription').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await openEditOptimization()
    if (action === 'save') fill('[data-testid=task-notes]', 'save notes')
    click('task-goal-optimize')
    await vi.waitFor(() => expect(optimize).toHaveBeenCalledTimes(1))
    const [id, , options] = optimize.mock.calls[0]!
    const original = taskGoal()
    if (action === 'aba') { fill('[data-testid=task-goal]', 'temporary'); fill('[data-testid=task-goal]', original) }
    else if (action === 'cancel') click('task-goal-cancel')
    else if (action === 'close') click('board-close-detail')
    else if (action === 'task') {
      const task = (await runtimeApi.boardTasks(vi.mocked(runtimeApi.createBoardTask).mock.calls[0]![0].projectId)).items[0]!
      const other = await runtimeApi.createBoardTask({ projectId: task.projectId, title: 'other', goal: 'other goal', acceptanceCriteria: 'criteria', column: 'planned', sessionId: '', requestId: crypto.randomUUID() })
      vi.spyOn(runtimeApi, 'boardTask').mockResolvedValue(other)
      window.history.replaceState(null, '', `#board?projectId=${task.projectId}&taskId=${other.id}`)
      window.dispatchEvent(new Event('hashchange'))
    } else if (action === 'save') click('board-save-fields')
    else app.unmount()
    await vi.waitFor(() => expect(runtimeApi.cancelTaskDescriptionOptimization).toHaveBeenCalledWith(id))
    expect(options?.signal?.aborted).toBe(true)
    finish({ text: 'late edit suggestion', connectionId: 'c', model: 'm' })
    await Promise.resolve(); await Promise.resolve()
    expect(document.querySelector('[data-testid=task-goal-suggestion]')).toBeNull()
  },
)
it('invalidates a completed existing suggestion even when goal text is restored', async () => {
  vi.spyOn(runtimeApi, 'optimizeTaskDescription').mockResolvedValue({ text: 'old advice', connectionId: 'c', model: 'm' })
  await openEditOptimization()
  click('task-goal-optimize')
  await vi.waitFor(() => expect(document.querySelector('[data-testid=task-goal-adopt]')).not.toBeNull())
  const adopt = document.querySelector('[data-testid=task-goal-adopt]') as HTMLButtonElement
  const original = taskGoal()
  fill('[data-testid=task-goal]', 'temporary'); fill('[data-testid=task-goal]', original)
  adopt.click()
  await vi.waitFor(() => expect(document.querySelector('[data-testid=task-goal-suggestion]')).toBeNull())
  expect(taskGoal()).toBe(original)
})
it.each(['stale', 'executing'] as const)('invalidates pending and completed advice when task becomes %s', async (state) => {
  let finish!: (result: { text: string; connectionId: string; model: string }) => void
  const optimize = vi.spyOn(runtimeApi, 'optimizeTaskDescription')
    .mockResolvedValueOnce({ text: 'completed advice', connectionId: 'c', model: 'm' })
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await openEditOptimization()
  const task = (await runtimeApi.boardTasks(vi.mocked(runtimeApi.createBoardTask).mock.calls[0]![0].projectId)).items[0]!
  fill('[data-testid=task-notes]', 'retain local notes')
  click('task-goal-optimize')
  await vi.waitFor(() => expect(document.querySelector('[data-testid=task-goal-adopt]')).not.toBeNull())
  const adopt = document.querySelector('[data-testid=task-goal-adopt]') as HTMLButtonElement
  click('task-goal-optimize')
  await vi.waitFor(() => expect(optimize).toHaveBeenCalledTimes(2))
  vi.mocked(runtimeApi.boardTasks).mockResolvedValueOnce({ items: [{ ...task,
    revision: state === 'stale' ? task.revision + 1 : task.revision,
    executionActive: state === 'executing',
  }] })
  click('board-tab-runs')
  await vi.waitFor(() => expect(document.querySelector('[data-testid=board-run-refresh]')).not.toBeNull())
  click('board-run-refresh')
  await vi.waitFor(() => expect(runtimeApi.cancelTaskDescriptionOptimization).toHaveBeenCalledWith(optimize.mock.calls[1]![0]))
  finish({ text: 'late advice', connectionId: 'c', model: 'm' })
  click('board-tab-preparation')
  await vi.waitFor(() => expect((document.querySelector('[data-testid=task-goal-optimize]') as HTMLButtonElement).disabled).toBe(true))
  adopt.click()
  expect(taskGoal()).toBe(task.goal)
  expect(document.querySelector('[data-testid=task-goal-suggestion]')).toBeNull()
  expect(runtimeApi.updateBoardTask).not.toHaveBeenCalled()
})
it.each(['keep', 'latest'] as const)('preserves AI adopted goal and other drafts on CAS conflict until %s resolution', async (resolution) => {
  vi.spyOn(runtimeApi, 'optimizeTaskDescription').mockResolvedValue({ text: 'AI local goal', connectionId: 'c', model: 'm' })
  await openEditOptimization()
  const task = (await runtimeApi.boardTasks(vi.mocked(runtimeApi.createBoardTask).mock.calls[0]![0].projectId)).items[0]!
  fill('[data-testid=task-notes]', 'local notes')
  fill('[data-testid=task-criteria]', 'local criteria')
  click('task-goal-optimize')
  await vi.waitFor(() => expect(document.querySelector('[data-testid=task-goal-adopt]')).not.toBeNull())
  click('task-goal-adopt')
  await vi.waitFor(() => expect(taskGoal()).toBe('AI local goal'))
  await runtimeApi.updateBoardTask(task.id, { projectId: task.projectId, revision: task.revision, goal: 'remote goal' })
  click('board-save-fields')
  await vi.waitFor(() => expect(document.querySelector('[data-testid=board-conflict]')).not.toBeNull())
  expect(taskGoal()).toBe('AI local goal')
  expect((document.querySelector('[data-testid=task-notes]') as HTMLTextAreaElement).value).toBe('local notes')
  expect((document.querySelector('[data-testid=task-criteria]') as HTMLTextAreaElement).value).toBe('local criteria')
  expect((document.querySelector('[data-testid=task-goal-optimize]') as HTMLButtonElement).disabled).toBe(true)
  expect(vi.mocked(runtimeApi.updateBoardTask).mock.calls[1]![1].revision).toBe(task.revision)
  click(resolution === 'keep' ? 'board-keep-draft' : 'board-use-latest')
  await vi.waitFor(() => expect(document.querySelector('[data-testid=board-conflict]')).toBeNull())
  expect(taskGoal()).toBe(resolution === 'keep' ? 'AI local goal' : 'remote goal')
  if (resolution === 'keep') {
    click('board-save-fields')
    await vi.waitFor(() => expect(vi.mocked(runtimeApi.updateBoardTask).mock.calls[2]![1].revision).toBe(task.revision + 1))
  }
})
it('shows a suggestion before adoption and changes only the goal', async () => {
  vi.spyOn(runtimeApi, 'optimizeTaskDescription').mockResolvedValue({
    text: '优化后的目标',
    connectionId: 'c',
    model: 'm',
  })
  await openOptimizationForm()
  expect(document.querySelector('[data-testid=board-link-session]')).toBeNull()
  click('board-optimize-goal')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-goal-suggestion]')?.textContent).toContain(
      '优化后的目标',
    ),
  )
  expect(goalValue()).toBe('完成任务目标')
  click('board-goal-adopt')
  await vi.waitFor(() => expect(goalValue()).toBe('优化后的目标'))
  expect(
    (document.querySelector('[data-testid=board-new-criteria]') as HTMLTextAreaElement).value,
  ).toBe('构建与检查通过')
  expect(runtimeApi.createBoardTask).not.toHaveBeenCalled()
})
it.each(['edit', 'cancel', 'close', 'project', 'unmount'] as const)(
  'invalidates an optimization on %s and ignores its late response',
  async (action) => {
    let finish!: (result: { text: string; connectionId: string; model: string }) => void
    const optimize = vi.spyOn(runtimeApi, 'optimizeTaskDescription').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await openOptimizationForm()
    click('board-optimize-goal')
    await vi.waitFor(() => expect(optimize).toHaveBeenCalledTimes(1))
    const [requestId, , options] = optimize.mock.calls[0]!
    expect(
      (document.querySelector('[data-testid=board-new-goal]') as HTMLTextAreaElement).disabled,
    ).toBe(false)
    if (action === 'edit') fill('[data-testid=board-new-goal]', '用户的新目标')
    else if (action === 'cancel') click('board-optimize-cancel')
    else if (action === 'close') {
      click('board-create-close')
      await vi.waitFor(() => expect(document.querySelector('.eap-confirm')).not.toBeNull())
      ;(document.querySelector('[data-confirm-cancel]') as HTMLButtonElement).click()
    } else if (action === 'project') {
      localProjectState.projects.push({ id: 'other-project', label: 'Other', intendedPath: '' })
      await vi.waitFor(() =>
        expect(
          document.querySelector('[data-testid=board-create-project] option[value=other-project]'),
        ).not.toBeNull(),
      )
      const select = document.querySelector(
        '[data-testid=board-create-project]',
      ) as HTMLSelectElement
      select.value = 'other-project'
      select.dispatchEvent(new Event('change'))
    } else app.unmount()
    await vi.waitFor(() =>
      expect(runtimeApi.cancelTaskDescriptionOptimization).toHaveBeenCalledWith(requestId),
    )
    expect(options?.signal?.aborted).toBe(true)
    finish({ text: '迟到建议', connectionId: 'c', model: 'm' })
    await Promise.resolve()
    await Promise.resolve()
    expect(document.querySelector('[data-testid=board-goal-suggestion]')).toBeNull()
    if (action !== 'unmount')
      expect(goalValue()).toBe(action === 'edit' ? '用户的新目标' : '完成任务目标')
  },
)
it('discards a dirty create draft only after confirmation and blocks submission from the retired form', async () => {
  await openOptimizationForm()
  click('board-create-close')
  await vi.waitFor(() => expect(document.querySelector('.eap-confirm')).not.toBeNull())
  expect(goalValue()).toBe('完成任务目标')
  ;(document.querySelector('.eap-confirm button') as HTMLButtonElement).click()
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-create-form]')).toBeNull(),
  )
  click('board-create-task')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-new-goal]')).not.toBeNull(),
  )
  expect(goalValue()).toBe('')
  fill('[data-testid=board-new-title]', '唯一创建')
  const form = document.querySelector('form') as HTMLFormElement
  form.requestSubmit()
  await vi.waitFor(() => expect(detail()).not.toBeNull())
  form.dispatchEvent(new Event('submit', { cancelable: true }))
  await Promise.resolve()
  expect(runtimeApi.createBoardTask).toHaveBeenCalledTimes(1)
})
it('keeps the original goal after an optimization error and allows retry with a fresh identity', async () => {
  const optimize = vi
    .spyOn(runtimeApi, 'optimizeTaskDescription')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ text: '重试建议', connectionId: 'c', model: 'm' })
  await openOptimizationForm()
  click('board-optimize-goal')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-optimize-error]')).not.toBeNull(),
  )
  expect(goalValue()).toBe('完成任务目标')
  click('board-optimize-goal')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-goal-suggestion]')?.textContent).toContain(
      '重试建议',
    ),
  )
  expect(optimize.mock.calls[0]![0]).not.toBe(optimize.mock.calls[1]![0])
  click('board-goal-dismiss')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-goal-suggestion]')).toBeNull(),
  )
  expect(goalValue()).toBe('完成任务目标')
})
it('rejects oversized optimization output while accepting a 4000 character goal', async () => {
  const optimize = vi
    .spyOn(runtimeApi, 'optimizeTaskDescription')
    .mockResolvedValue({ text: 'x'.repeat(2001), connectionId: 'c', model: 'm' })
  await openOptimizationForm()
  fill('[data-testid=board-new-goal]', 'a'.repeat(4000))
  click('board-optimize-goal')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-optimize-error]')).not.toBeNull(),
  )
  expect(optimize.mock.calls[0]![1].text).toHaveLength(4000)
  expect(goalValue()).toHaveLength(4000)
  expect(document.querySelector('[data-testid=board-goal-adopt]')).toBeNull()
})
it('cancels optimization on submit and freezes AI until the same unknown creation request is resolved', async () => {
  let finish!: (result: { text: string; connectionId: string; model: string }) => void
  vi.spyOn(runtimeApi, 'optimizeTaskDescription').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  vi.mocked(runtimeApi.createBoardTask).mockRejectedValueOnce(new AxiosError('connection lost'))
  await openOptimizationForm()
  click('board-optimize-goal')
  ;(document.querySelector('form') as HTMLFormElement).requestSubmit()
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-create-note]')?.textContent).toContain(
      '创建结果尚未确认',
    ),
  )
  expect(runtimeApi.cancelTaskDescriptionOptimization).toHaveBeenCalledTimes(1)
  expect(
    (document.querySelector('[data-testid=board-optimize-goal]') as HTMLButtonElement).disabled,
  ).toBe(true)
  finish({ text: '迟到建议', connectionId: 'c', model: 'm' })
  await Promise.resolve()
  expect(goalValue()).toBe('完成任务目标')
  const first = vi.mocked(runtimeApi.createBoardTask).mock.calls[0]![0]
  ;(document.querySelector('form') as HTMLFormElement).requestSubmit()
  await vi.waitFor(() => expect(detail()).not.toBeNull())
  expect(vi.mocked(runtimeApi.createBoardTask).mock.calls[1]![0]).toEqual(first)
})
it('unfreezes the original draft after a definite 4xx and creates a corrected ready task with a new identity', async () => {
  vi.mocked(runtimeApi.createBoardTask).mockRejectedValueOnce(
    new AxiosError('invalid', undefined, undefined, undefined, { status: 400 } as never),
  )
  await openOptimizationForm()
  ;(document.querySelector('form') as HTMLFormElement).requestSubmit()
  await vi.waitFor(() => expect(runtimeApi.createBoardTask).toHaveBeenCalledTimes(1))
  await vi.waitFor(() =>
    expect(
      (document.querySelector('[data-testid=board-optimize-goal]') as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  fill('[data-testid=board-new-goal]', '修正目标')
  const column = document.querySelector('[data-testid=board-create-column]') as HTMLSelectElement
  column.value = 'ready'
  column.dispatchEvent(new Event('change'))
  ;(document.querySelector('form') as HTMLFormElement).requestSubmit()
  await vi.waitFor(() => expect(detail()).not.toBeNull())
  const calls = vi.mocked(runtimeApi.createBoardTask).mock.calls
  expect(calls[1]![0]).toMatchObject({
    goal: '修正目标',
    column: 'ready',
    acceptanceCriteria: '构建与检查通过',
  })
  expect(calls[1]![0].requestId).not.toBe(calls[0]![0].requestId)
})
it('reads a linked task outside the recent list and opens its current runs without starting work', async () => {
  const task = await runtimeApi.createBoardTask({
    projectId: 'linked-project',
    title: 'Original task',
    goal: 'Goal',
    acceptanceCriteria: 'Criteria',
    column: 'ready',
    sessionId: '',
    requestId: crypto.randomUUID(),
  })
  vi.spyOn(runtimeApi, 'boardTask').mockResolvedValue(task)
  vi.mocked(runtimeApi.boardTasks).mockResolvedValue({ items: [] })
  const start = vi.spyOn(runtimeApi, 'startBoardRun')
  window.history.replaceState(
    null,
    '',
    '#board?' + new URLSearchParams({ projectId: task.projectId, taskId: task.id }),
  )
  await mountBoard()
  await vi.waitFor(() =>
    expect(
      document.querySelector('[data-testid=board-tab-runs]')?.getAttribute('aria-selected'),
    ).toBe('true'),
  )
  expect(runtimeApi.boardTask).toHaveBeenCalledWith(task.id, task.projectId)
  expect(document.querySelector('[data-testid=board-detail-dialog]')?.textContent).toContain(
    task.title,
  )
  expect(start).not.toHaveBeenCalled()
  expect(runtimeApi.updateBoardTask).not.toHaveBeenCalled()
  ;(document.querySelector('[data-testid=board-close-detail]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(detail()).toBeNull())
  expect(window.location.hash).toBe('#board')
})
it('keeps a failed task link recoverable without selecting a different task', async () => {
  const task = await runtimeApi.createBoardTask({
    projectId: 'linked-project',
    title: 'Linked task',
    goal: 'Goal',
    acceptanceCriteria: 'Criteria',
    column: 'ready',
    sessionId: '',
    requestId: crypto.randomUUID(),
  })
  vi.spyOn(runtimeApi, 'boardTask')
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValue(task)
  window.history.replaceState(
    null,
    '',
    '#board?' + new URLSearchParams({ projectId: task.projectId, taskId: task.id }),
  )
  await mountBoard()
  expect(detail()).toBeNull()
  expect(document.querySelector('[data-testid=board-task-link-error]')).not.toBeNull()
  ;(document.querySelector('[data-testid=board-task-link-retry]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(detail()).not.toBeNull())
  expect(runtimeApi.boardTask).toHaveBeenCalledTimes(2)
  expect(runtimeApi.updateBoardTask).not.toHaveBeenCalled()
})
it('ignores a late linked-task result and opens the latest requested task', async () => {
  const create = (title: string) =>
    runtimeApi.createBoardTask({
      projectId: 'linked-project',
      title,
      goal: 'Goal',
      acceptanceCriteria: 'Criteria',
      column: 'ready',
      sessionId: '',
      requestId: crypto.randomUUID(),
    })
  const first = await create('First task'),
    second = await create('Second task')
  let finish!: (task: BoardTask) => void
  vi.spyOn(runtimeApi, 'boardTask')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValue(second)
  vi.mocked(runtimeApi.boardTasks).mockResolvedValue({ items: [] })
  const location = (task: BoardTask) =>
    '#board?' + new URLSearchParams({ projectId: task.projectId, taskId: task.id })
  window.history.replaceState(null, '', location(first))
  const mounted = mountBoard()
  await vi.waitFor(() =>
    expect(runtimeApi.boardTask).toHaveBeenCalledWith(first.id, first.projectId),
  )
  window.location.hash = location(second)
  finish(first)
  await mounted
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-detail-dialog]')?.textContent).toContain(
      second.title,
    ),
  )
  expect(document.querySelector('[data-testid=board-detail-dialog]')?.textContent).not.toContain(
    first.title,
  )
  expect(runtimeApi.updateBoardTask).not.toHaveBeenCalled()
})
it('keeps an oversized answer intact until the user shortens the task goal and restores the unsent draft', async () => {
  writeTaskHandoff(
    localStorage,
    apiStorageScope,
    {
      source: {
        conversationId: 'source-session',
        executionId: 'source-execution',
        text: 'x'.repeat(6000),
      },
      draft: {
        projectId: 'local-eap',
        title: 'Reviewed answer',
        goal: 'x'.repeat(6000),
        acceptanceCriteria: '',
      },
      linkSource: true,
    },
    null,
  )
  await mountBoard()
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-new-goal]')).not.toBeNull(),
  )
  const goal = () => document.querySelector('[data-testid=board-new-goal]') as HTMLTextAreaElement
  expect(goal().value).toHaveLength(6000)
  expect(
    (document.querySelector('[data-testid=board-create-save]') as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(runtimeApi.createBoardTask).not.toHaveBeenCalled()
  fill('[data-testid=board-new-goal]', 'Reviewed short goal')
  expect(
    document.querySelector('[data-testid=board-handoff-source] pre')?.textContent,
  ).toHaveLength(6000)
  ;(document.querySelector('[data-eap-dialog-close]') as HTMLButtonElement).click()
  app.unmount()
  root.remove()
  await mountBoard()
  await vi.waitFor(() => expect(goal()?.value).toBe('Reviewed short goal'))
  expect(
    document.querySelector('[data-testid=board-handoff-source] pre')?.textContent,
  ).toHaveLength(6000)
  expect(runtimeApi.createBoardTask).not.toHaveBeenCalled()
})
it('renders decorative create icons without submitting a task when opening the form', async () => {
  await mountBoard()
  const create = root.querySelector('[data-testid="board-create-task"]') as HTMLButtonElement
  expect(create.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  expect(create.textContent?.trim()).toBe(i18n.global.t('preview.createTask'))
  const laneAdds = [...root.querySelectorAll<HTMLButtonElement>('[data-testid="lane-add-task"]')]
  expect(laneAdds).toHaveLength(2)
  for (const add of laneAdds) {
    expect(add.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(add.textContent?.trim()).toBe(i18n.global.t('desktop.boardAddTask'))
  }
  create.click()
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid="board-create-form"]')).not.toBeNull(),
  )
  expect(runtimeApi.createBoardTask).not.toHaveBeenCalled()
})
it('hands off only the saved ready task identity and never derives it from sessionId', async () => {
  await mountBoard()
  await createTask()
  const project = vi.mocked(runtimeApi.createBoardTask).mock.calls[0]![0].projectId
  let saved = (await runtimeApi.boardTasks(project)).items[0]!
  saved = await runtimeApi.updateBoardTask(saved.id, {
    projectId: project,
    revision: saved.revision,
    column: 'ready',
  })
  ;[...root.querySelectorAll('button')]
    .find((b) => b.textContent === i18n.global.t('desktop.boardRefresh'))!
    .click()
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid=lane-ready] .board-card')).not.toBeNull(),
  )
  ;(root.querySelector('[data-testid=lane-ready] .board-card') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(detail()).not.toBeNull())
  const open = [...detail()!.querySelectorAll('button')].find((b) => b.textContent?.includes('↗'))!
  open.click()
  await vi.waitFor(() =>
    expect(workbench.pendingBoardDraft?.taskRef).toEqual({
      projectId: project,
      taskId: saved.id,
      revision: saved.revision,
    }),
  )
  expect(workbench.pendingBoardDraft?.sessionId).toBe('')
  expect(workbench.pendingBoardDraft?.prototypeVersionId).toBe('')
})
it.each(['ACCEPT', 'REJECT'] as const)(
  'keeps the full board → panel → delivery chain usable after submission for %s',
  async (decision) => {
    await mountBoard()
    await createTask()
    let authoritative = (
      await runtimeApi.boardTasks(vi.mocked(runtimeApi.createBoardTask).mock.calls[0]![0].projectId)
    ).items[0]!
    authoritative = { ...authoritative, column: 'ready' }
    const run: BoardRun = {
      requestId: 'run-request',
      taskRevision: authoritative.revision,
      task: {
        title: authoritative.title,
        goal: authoritative.goal,
        acceptanceCriteria: authoritative.acceptanceCriteria,
      },
      execution: {
        id: 'run-a',
        missionId: 'mission-a',
        status: 'SUCCEEDED',
        capability: 'git-status',
        principal: 'local-operator',
        approval: 'NOT_REQUIRED',
        workspacePath: 'F:/repo',
        workspaceLabel: 'repo',
        executable: 'git',
        stdout: '',
        stderr: '',
        startedAt: '2026-11-01T00:00:00Z',
        finishedAt: '2026-11-01T00:00:01Z',
      },
    }
    let saved: BoardDelivery | null = null
    vi.mocked(runtimeApi.boardTasks).mockImplementation(async () => ({
      items: [{ ...authoritative }],
    }))
    vi.mocked(runtimeApi.boardRuns).mockResolvedValue({
      availability: { allowed: true, workspacePath: 'F:/repo', workspaceLabel: 'repo', reason: '' },
      items: [run],
    })
    vi.spyOn(runtimeApi, 'boardDelivery').mockImplementation(async () => ({
      record: saved,
      prepareAllowed: !saved,
      reason: '',
    }))
    vi.spyOn(runtimeApi, 'submitBoardDelivery').mockImplementation(async (_task, _run, request) => {
      authoritative = {
        ...authoritative,
        column: 'acceptance',
        revision: authoritative.revision + 1,
      }
      saved = {
        id: 'delivery-a',
        source: 'EXTERNAL_MANUAL',
        requestId: request.requestId,
        taskRevision: request.revision,
        submittedRevision: authoritative.revision,
        workspacePath: 'F:/repo',
        baseCommit: 'base',
        verificationId: 'verification-a',
        sourceHash: 'hash',
        prototypeVersionId: null,
        goal: authoritative.goal,
        acceptanceCriteria: authoritative.acceptanceCriteria,
        note: request.note,
        files: [],
        createdAt: '2026-11-01T00:05:00Z',
        decision: null,
      }
      return saved
    })
    vi.spyOn(runtimeApi, 'decideBoardDelivery').mockImplementation(async (_task, _run, request) => {
      authoritative = {
        ...authoritative,
        column: decision === 'ACCEPT' ? 'done' : 'ready',
        revision: authoritative.revision + 1,
      }
      saved = {
        ...saved!,
        decision: {
          ...request,
          id: 'decision-a',
          operator: 'local-operator',
          createdAt: '2026-11-01T00:10:00Z',
        },
      }
      return saved
    })
    const button = (id: string) =>
      document.querySelector(`[data-testid=${id}]`) as HTMLButtonElement
    const confirm = async (id: string) => {
      await vi.waitFor(() => expect(button(id)?.disabled, id).toBe(false))
      button(id).click()
      await vi.waitFor(() =>
        expect(document.querySelector('.eap-confirm__actions button:first-child')).not.toBeNull(),
      )
      ;(
        document.querySelector('.eap-confirm__actions button:first-child') as HTMLButtonElement
      ).click()
    }
    button('board-tab-runs').click()
    await vi.waitFor(() => expect(button('board-run-delivery')).not.toBeNull())
    button('board-run-delivery').click()
    await vi.waitFor(() => expect(button('delivery-submit')).not.toBeNull())
    fill('[data-testid=delivery-paths]', 'frontend/App.vue')
    await confirm('delivery-submit')
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid=lane-acceptance] .board-card')).not.toBeNull(),
    )
    expect(document.querySelector('[data-testid=board-conflict]')).toBeNull()
    await vi.waitFor(() =>
      expect(
        (document.querySelector('[data-testid=delivery-criteria]') as HTMLInputElement)?.disabled,
      ).toBe(false),
    )
    ;(document.querySelector('[data-testid=delivery-criteria]') as HTMLInputElement).click()
    fill('[data-testid=delivery-preview-url]', 'http://127.0.0.1:5193/#/')
    await vi.waitFor(() =>
      expect(
        (document.querySelector('[data-testid=delivery-preview]') as HTMLInputElement).disabled,
      ).toBe(false),
    )
    ;(document.querySelector('[data-testid=delivery-preview]') as HTMLInputElement).click()
    fill('[data-testid=delivery-comment]', 'Human review')
    await confirm(decision === 'ACCEPT' ? 'delivery-accept' : 'delivery-reject')
    await vi.waitFor(() =>
      expect(runtimeApi.decideBoardDelivery).toHaveBeenCalledWith(
        authoritative.id,
        run.execution.id,
        expect.objectContaining({ decision, revision: saved!.submittedRevision }),
      ),
    )
    await vi.waitFor(() =>
      expect(
        root.querySelector(
          `[data-testid=lane-${decision === 'ACCEPT' ? 'done' : 'ready'}] .board-card`,
        ),
      ).not.toBeNull(),
    )
    expect(document.querySelector('[data-testid=delivery-decision]')?.textContent).toContain(
      'decision-a',
    )
    expect(document.querySelector('[data-testid=board-conflict]')).toBeNull()
  },
)
it('retains dirty task fields and their revision when panel refresh completes after editing starts', async () => {
  await mountBoard()
  await createTask()
  const task = (
    await runtimeApi.boardTasks(vi.mocked(runtimeApi.createBoardTask).mock.calls[0]![0].projectId)
  ).items[0]!
  let complete!: (page: { items: BoardTask[] }) => void
  vi.mocked(runtimeApi.boardTasks).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  ;(document.querySelector('[data-testid=board-tab-runs]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(runtimeApi.boardRuns).toHaveBeenCalledTimes(1))
  ;(document.querySelector('[data-testid=board-run-refresh]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
  fill('[data-testid=task-goal]', 'local draft while refresh is pending')
  complete({ items: [{ ...task, revision: task.revision + 1, goal: 'new authoritative goal' }] })
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-conflict]')).not.toBeNull(),
  )
  expect((document.querySelector('[data-testid=task-goal]') as HTMLTextAreaElement).value).toBe(
    'local draft while refresh is pending',
  )
  expect(
    (document.querySelector('[data-testid=board-save-fields]') as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(
    (document.querySelector('[data-testid=board-run-start]') as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(runtimeApi.updateBoardTask).not.toHaveBeenCalled()
})
it('separates preparation, prototype and runs without losing edits or restarting requests', async () => {
  await mountBoard()
  await createTask()
  expect(document.querySelector('[data-testid=board-detail-tabs]')).not.toBeNull()
  expect(runtimeApi.boardRuns).not.toHaveBeenCalled()
  expect(runtimeApi.prototypeVersions).not.toHaveBeenCalled()
  fill('[data-testid=task-goal]', '切换工作面仍保留的目标')
  const tab = (id: string) =>
    (document.querySelector(`[data-testid=board-tab-${id}]`) as HTMLButtonElement).click()
  tab('prototype')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-prototype-panel]')).not.toBeNull(),
  )
  expect(
    (document.querySelector('[data-testid=board-preparation-section]') as HTMLElement).style
      .display,
  ).toBe('none')
  tab('runs')
  await vi.waitFor(() => expect(runtimeApi.boardRuns).toHaveBeenCalledTimes(1))
  const runs = document.querySelector('[data-testid=board-run-panel]')
  expect(
    (document.querySelector('[data-testid=board-run-start]') as HTMLButtonElement).disabled,
  ).toBe(true)
  tab('preparation')
  await vi.waitFor(() =>
    expect(
      (document.querySelector('[data-testid=board-preparation-section]') as HTMLElement).style
        .display,
    ).not.toBe('none'),
  )
  expect((document.querySelector('[data-testid=task-goal]') as HTMLTextAreaElement).value).toBe(
    '切换工作面仍保留的目标',
  )
  tab('runs')
  await vi.waitFor(() =>
    expect(
      (document.querySelector('[data-testid=board-runs-section]') as HTMLElement).style.display,
    ).not.toBe('none'),
  )
  expect(document.querySelector('[data-testid=board-run-panel]')).toBe(runs)
  expect(runtimeApi.boardRuns).toHaveBeenCalledTimes(1)
  expect(runtimeApi.updateBoardTask).not.toHaveBeenCalled()
  ;(document.querySelector('[data-testid=board-close-detail]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(document.querySelector('[data-confirm-cancel]')).not.toBeNull())
})
it('preserves goal edits made while a prototype link save is awaiting its response', async () => {
  const version: PrototypeVersionRecord = {
    id: 'design-a',
    requestId: '22222222-2222-4222-8222-222222222222',
    sourceRef: 'builder-alpha',
    title: '设计 A',
    body: 'saved text',
    acceptance: [],
    contentHash: 'hash-a',
    createdAt: '2026-10-31T08:00:00Z',
  }
  vi.mocked(runtimeApi.prototypeVersions).mockImplementation(async (source) => ({
    items: source === 'builder-alpha' ? [version] : [],
  }))
  let complete!: (saved: BoardTask) => void
  vi.spyOn(runtimeApi, 'setBoardPrototype').mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  await mountBoard()
  await createTask()
  const task = (
    await runtimeApi.boardTasks(vi.mocked(runtimeApi.createBoardTask).mock.calls[0]![0].projectId)
  ).items[0]!
  ;(document.querySelector('[data-testid=board-tab-prototype]') as HTMLButtonElement).click()
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-prototype-select]')).not.toBeNull(),
  )
  const select = document.querySelector('[data-testid=board-prototype-select]') as HTMLSelectElement
  await vi.waitFor(() => expect(select.options).toHaveLength(2))
  select.value = version.id
  select.dispatchEvent(new Event('change'))
  const save = document.querySelector('[data-testid=board-prototype-save]') as HTMLButtonElement
  await vi.waitFor(() => expect(save.disabled).toBe(false))
  save.click()
  await vi.waitFor(() => expect(runtimeApi.setBoardPrototype).toHaveBeenCalledTimes(1))
  ;(document.querySelector('[data-testid=board-tab-preparation]') as HTMLButtonElement).click()
  fill('[data-testid=task-goal]', '保存关联期间输入的新目标')
  complete({ ...task, prototypeVersionId: version.id, revision: task.revision + 1 })
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-prototype-current]')?.textContent).toContain(
      '设计 A',
    ),
  )
  expect((document.querySelector('[data-testid=task-goal]') as HTMLTextAreaElement).value).toBe(
    '保存关联期间输入的新目标',
  )
  expect(document.querySelector('[data-testid=board-conflict]')).not.toBeNull()
  expect(
    (document.querySelector('[data-testid=board-save-fields]') as HTMLButtonElement).disabled,
  ).toBe(true)
  ;(document.querySelector('[data-testid=board-keep-draft]') as HTMLButtonElement).click()
  await vi.waitFor(() =>
    expect(
      (document.querySelector('[data-testid=board-save-fields]') as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  expect(runtimeApi.updateBoardTask).not.toHaveBeenCalled()
})
it('persists backlog task edits through the service and refuses invented execution', async () => {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(PreviewBoard)
  app.use(i18n).mount(root)
  await vi.waitFor(() => expect(runtimeApi.boardTasks).toHaveBeenCalled())
  await vi.waitFor(() =>
    expect(
      (root.querySelector('[data-testid=board-create-task]') as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  Array.from(root.querySelectorAll('button'))
    .find((item) => item.textContent?.includes('新建任务'))!
    .click()
  await vi.waitFor(() => expect(document.querySelector('form')).not.toBeNull())
  const input = document.querySelector('form input') as HTMLInputElement
  input.value = '验收任务'
  input.dispatchEvent(new Event('input'))
  prepare()
  ;(document.querySelector('form') as HTMLFormElement).requestSubmit()
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid=lane-planned]')?.textContent).toContain('验收任务'),
  )
  await vi.waitFor(() => expect(detail()).not.toBeNull())
  expect(document.querySelector('[data-testid=board-detail-dialog]')).not.toBeNull()
  const move = (name: string) =>
    Array.from(detail()!.querySelectorAll('.task-moves button'))
      .find((item) => item.textContent === name)!
      .click()
  move('进行中')
  expect(runtimeApi.updateBoardTask).not.toHaveBeenCalled()
  move('待处理')
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid=lane-ready]')?.textContent).toContain('验收任务'),
  )
  const notes = detail()!.querySelector('[data-testid=task-notes]') as HTMLTextAreaElement
  notes.value = '保存备注'
  notes.dispatchEvent(new Event('input'))
  await vi.waitFor(() =>
    expect(
      (
        Array.from(detail()!.querySelectorAll('button')).find(
          (item) => item.textContent === '保存',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  )
  Array.from(detail()!.querySelectorAll('button'))
    .find((item) => item.textContent === '保存')!
    .click()
  await vi.waitFor(() =>
    expect(root.textContent).toMatch(/备注已保存|任务修改已保存|Notes saved|Task fields saved/),
  )
  move('已完成')
  expect(root.querySelector('[data-testid=lane-done]')?.textContent).not.toContain('验收任务')
  const args = vi.mocked(runtimeApi.createBoardTask).mock.calls[0]!
  const persisted = await runtimeApi.boardTasks(args[0].projectId)
  expect(persisted.items[0]?.notes).toBe('保存备注')
})

it('filters by notes and saved priority using the same service contract', async () => {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(PreviewBoard)
  app.use(i18n).mount(root)
  await vi.waitFor(() => expect(runtimeApi.boardTasks).toHaveBeenCalled())
  await vi.waitFor(() =>
    expect(
      (root.querySelector('[data-testid=board-create-task]') as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  ;(root.querySelector('[data-testid=board-create-task]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(document.querySelector('form')).not.toBeNull())
  const input = document.querySelector('form input') as HTMLInputElement
  input.value = '优先级筛选任务'
  input.dispatchEvent(new Event('input'))
  prepare()
  ;(document.querySelector('form') as HTMLFormElement).requestSubmit()
  await vi.waitFor(() => expect(root.textContent).toContain('优先级筛选任务'))
  await vi.waitFor(() => expect(detail()).not.toBeNull())
  const notes = detail()!.querySelector('[data-testid=task-notes]') as HTMLTextAreaElement
  notes.value = '标签:迁移验收'
  notes.dispatchEvent(new Event('input'))
  const rank = detail()!.querySelector('[data-testid=task-priority]') as HTMLSelectElement
  rank.value = 'p0'
  rank.dispatchEvent(new Event('change'))
  await vi.waitFor(() =>
    expect(
      (
        Array.from(detail()!.querySelectorAll('button')).find(
          (item) => item.textContent === '保存',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  )
  Array.from(detail()!.querySelectorAll('button'))
    .find((item) => item.textContent === '保存')!
    .click()
  await vi.waitFor(() =>
    expect(root.textContent).toMatch(/备注已保存|任务修改已保存|Notes saved|Task fields saved/),
  )
  const search = root.querySelector('[data-testid=board-search]') as HTMLInputElement
  search.value = '迁移验收'
  search.dispatchEvent(new Event('input'))
  await vi.waitFor(() => expect(root.textContent).toContain('优先级筛选任务'))
  search.value = ''
  search.dispatchEvent(new Event('input'))
  const priority = root.querySelector('[data-testid=board-priority]') as HTMLSelectElement
  expect(priority.value).toBe('all')
  priority.value = 'p0'
  priority.dispatchEvent(new Event('change'))
  await vi.waitFor(() =>
    expect(root.querySelector('.board-card')?.textContent).toContain('优先级筛选任务'),
  )
  priority.value = 'p2'
  priority.dispatchEvent(new Event('change'))
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid=board-filter-empty]')?.textContent).toMatch(
      /没有符合|No tasks match/i,
    ),
  )
  expect(root.querySelectorAll('.board-card')).toHaveLength(0)
  expect(root.querySelector('[data-testid=board-unattended-badge]')?.textContent).toMatch(
    /无人值守未接通|Unattended is off/,
  )
})

it('links the active conversation id on create without inventing execution', async () => {
  chatBinding.value = {
    history: [],
    activeId: 'conv-link-9',
    references: [],
    draft: '',
    sending: false,
    workspaceLabel: '',
    memory: '',
    model: '',
    connectionName: '',
    approval: 'review',
    goal: 'chat',
    executionMode: 'chat',
    scenarioId: null,
    proposalFiles: [],
    verification: 'not_requested',
    select: () => {},
    create: () => {},
  } as ChatBinding
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(PreviewBoard)
  app.use(i18n).mount(root)
  await vi.waitFor(() =>
    expect(
      (root.querySelector('[data-testid=board-create-task]') as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  ;(root.querySelector('[data-testid=board-create-task]') as HTMLButtonElement).click()
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-link-session]')?.textContent).toMatch(
      /关联当前对话|Link current/,
    ),
  )
  const input = document.querySelector(
    '[data-testid=board-create-form] input:not([type=checkbox])',
  ) as HTMLInputElement
  input.value = '关联会话任务'
  input.dispatchEvent(new Event('input'))
  prepare()
  ;(document.querySelector('[data-testid=board-create-form]') as HTMLFormElement).requestSubmit()
  await vi.waitFor(() =>
    expect(runtimeApi.createBoardTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '关联会话任务',
        column: 'planned',
        sessionId: 'conv-link-9',
        requestId: expect.any(String),
      }),
    ),
  )
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid=card-session]')?.textContent).toMatch(/会话|Session/),
  )
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=task-session]')?.textContent).toMatch(
      /已关联|Linked/,
    ),
  )
  expect(root.querySelector('[data-testid=card-priority]')?.className).toMatch(/prio-none/)
})

it('opens task detail as a modal and protects unsaved edits on close', async () => {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(PreviewBoard)
  app.use(i18n).mount(root)
  await vi.waitFor(() => expect(runtimeApi.boardTasks).toHaveBeenCalled())
  await vi.waitFor(() =>
    expect(
      (root.querySelector('[data-testid=board-create-task]') as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  ;(
    root.querySelector('[data-testid=lane-ready] [data-testid=lane-add-task]') as HTMLButtonElement
  ).click()
  await vi.waitFor(() => expect(document.querySelector('form input')).not.toBeNull())
  const title = document.querySelector('form input') as HTMLInputElement
  title.value = '待处理列创建'
  title.dispatchEvent(new Event('input'))
  prepare()
  ;(document.querySelector('form') as HTMLFormElement).requestSubmit()
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid=lane-ready] .board-card')?.textContent).toContain(
      '待处理列创建',
    ),
  )
  await vi.waitFor(() =>
    expect(
      document.querySelector('[data-testid=board-detail-dialog] [role=dialog]'),
    ).not.toBeNull(),
  )
  const notes = detail()!.querySelector('[data-testid=task-notes]') as HTMLTextAreaElement
  notes.value = '尚未保存'
  notes.dispatchEvent(new Event('input'))
  ;(document.querySelector('[data-testid=board-close-detail]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(document.querySelector('[data-confirm-cancel]')).not.toBeNull())
  ;(document.querySelector('[data-confirm-cancel]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(document.querySelector('[data-confirm-cancel]')).toBeNull())
  expect((detail()!.querySelector('[data-testid=task-notes]') as HTMLTextAreaElement).value).toBe(
    '尚未保存',
  )
  expect(runtimeApi.updateBoardTask).not.toHaveBeenCalled()
})

it('preserves the draft revision on conflict and requires an explicit resolution before saving', async () => {
  await mountBoard()
  await createTask()
  const draft = vi.mocked(runtimeApi.createBoardTask).mock.calls[0]![0]
  const task = (await runtimeApi.boardTasks(draft.projectId)).items[0]!
  fill('[data-testid=task-goal]', '本地未提交目标')
  await runtimeApi.updateBoardTask(task.id, {
    projectId: task.projectId,
    revision: task.revision,
    goal: '另一个窗口保存的目标',
  })
  ;(document.querySelector('[data-testid=board-save-fields]') as HTMLButtonElement).click()
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-conflict]')?.textContent).toContain(
      '另一个窗口保存的目标',
    ),
  )
  expect((document.querySelector('[data-testid=task-goal]') as HTMLTextAreaElement).value).toBe(
    '本地未提交目标',
  )
  expect(
    (document.querySelector('[data-testid=board-save-fields]') as HTMLButtonElement).disabled,
  ).toBe(true)
  // Reopening must not silently rebase the cached draft onto the new revision.
  app.unmount()
  root.remove()
  await mountBoard()
  ;(root.querySelector('.board-card') as HTMLButtonElement).click()
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-conflict]')).not.toBeNull(),
  )
  ;(document.querySelector('[data-testid=board-keep-draft]') as HTMLButtonElement).click()
  await vi.waitFor(() =>
    expect(
      (document.querySelector('[data-testid=board-save-fields]') as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  ;(document.querySelector('[data-testid=board-save-fields]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(document.querySelector('[data-testid=board-conflict]')).toBeNull())
  await vi.waitFor(async () =>
    expect((await runtimeApi.boardTasks(task.projectId)).items[0]!.goal).toBe('本地未提交目标'),
  )
})
it('retries the identical creation after a lost response and renders only one persisted task', async () => {
  await mountBoard()
  const original = vi.mocked(runtimeApi.createBoardTask).getMockImplementation()!
  vi.mocked(runtimeApi.createBoardTask).mockImplementationOnce(async (draft) => {
    await original(draft)
    throw new AxiosError('connection lost')
  })
  ;(root.querySelector('[data-testid=board-create-task]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(document.querySelector('form')).not.toBeNull())
  fill('form input', '未知创建结果')
  prepare()
  ;(document.querySelector('form') as HTMLFormElement).requestSubmit()
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=board-create-note]')?.textContent).toContain(
      '创建结果尚未确认',
    ),
  )
  expect((document.querySelector('form input') as HTMLInputElement).disabled).toBe(true)
  app.unmount()
  root.remove()
  await mountBoard()
  expect((document.querySelector('form input') as HTMLInputElement).value).toBe('未知创建结果')
  ;(document.querySelector('form') as HTMLFormElement).requestSubmit()
  await vi.waitFor(() => expect(root.querySelectorAll('.board-card')).toHaveLength(1))
  const calls = vi.mocked(runtimeApi.createBoardTask).mock.calls
  expect(calls[0]![0]).toEqual(calls[1]![0])
  expect((await runtimeApi.boardTasks(calls[0]![0].projectId)).items).toHaveLength(1)
})
it('allows an incomplete planned draft but disables ready and preserves preparation after reopening', async () => {
  await mountBoard()
  ;(root.querySelector('[data-testid=board-create-task]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(document.querySelector('form')).not.toBeNull())
  fill('form input', '待补全')
  ;(document.querySelector('form') as HTMLFormElement).requestSubmit()
  await vi.waitFor(() => expect(detail()).not.toBeNull())
  const ready = () =>
    Array.from(detail()!.querySelectorAll('.task-moves button')).find(
      (item) => item.textContent === '待处理',
    ) as HTMLButtonElement
  expect(ready().disabled).toBe(true)
  fill('[data-testid=task-goal]', '明确目标')
  fill('[data-testid=task-criteria]', '可复现检查')
  await vi.waitFor(() =>
    expect(
      (document.querySelector('[data-testid=board-save-fields]') as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  ;(document.querySelector('[data-testid=board-save-fields]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(ready().disabled).toBe(false))
  ready().click()
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid=lane-ready] .board-card')).not.toBeNull(),
  )
  app.unmount()
  root.remove()
  await mountBoard()
  ;(root.querySelector('.board-card') as HTMLButtonElement).click()
  await vi.waitFor(() =>
    expect(
      (document.querySelector('[data-testid=task-criteria]') as HTMLTextAreaElement)?.value,
    ).toBe('可复现检查'),
  )
})
