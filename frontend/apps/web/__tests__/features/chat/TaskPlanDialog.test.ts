// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, type App } from 'vue'
import { runtimeApi, type BoardTask } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import Dialog from '../../../src/features/chat/TaskPlanDialog.vue'
import { AxiosError } from 'axios'
let app: App, root: HTMLElement
const prepared = vi.fn()
const task = {
  id: 'task',
  projectId: 'project',
  revision: 3,
  column: 'ready',
  title: 'Page',
  goal: 'Original goal',
  acceptanceCriteria: 'Check page',
  notes: 'Existing notes',
  executionActive: false,
  preparationIssues: [],
} as BoardTask
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
  prepared.mockClear()
})
async function mount(revision = 3, column: BoardTask['column'] = 'ready') {
  vi.spyOn(runtimeApi, 'boardTask').mockResolvedValue({
    ...task,
    revision,
    column,
    allowedColumns: ['ready', 'planned'],
  })
  const save = vi
    .spyOn(runtimeApi, 'updateBoardTask')
    .mockImplementation(async (_id, update) => ({
      ...task,
      column,
      allowedColumns: ['ready', 'planned'],
      ...update,
      revision: update.revision + 1,
    }))
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () =>
      h(Dialog, {
        binding: { projectId: 'project', taskId: 'task', revision: 3 },
        text: 'Reviewed implementation plan',
        onPrepare: prepared,
      }),
  })
  app.use(i18n).mount(root)
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=task-plan-goal]')).not.toBeNull(),
  )
  return save
}
const button = (id: string) => document.querySelector(`[data-testid=${id}]`) as HTMLButtonElement
it('requires explicit adoption and saves only reviewed fields with the original revision', async () => {
  const save = await mount()
  await vi.waitFor(() => expect(button('task-plan-adopt').disabled).toBe(false))
  expect(save).not.toHaveBeenCalled()
  expect(button('task-plan-save').disabled).toBe(true)
  button('task-plan-adopt').click()
  await vi.waitFor(() => expect(button('task-plan-save').disabled).toBe(false))
  button('task-plan-save').click()
  await vi.waitFor(() =>
    expect(save).toHaveBeenCalledWith('task', {
      projectId: 'project',
      revision: 3,
      goal: 'Original goal',
      acceptanceCriteria: 'Check page',
      notes: 'Existing notes\n\nReviewed implementation plan',
    }),
  )
})
it('requires a separate ready transition after saving a planned task and reconciles its lost response', async () => {
  const save = await mount(3, 'planned')
  await vi.waitFor(() => expect(button('task-plan-adopt').disabled).toBe(false))
  button('task-plan-adopt').click()
  await vi.waitFor(() => expect(button('task-plan-save').disabled).toBe(false))
  button('task-plan-save').click()
  await vi.waitFor(() => expect(button('task-plan-ready').disabled).toBe(false))
  expect(button('task-plan-prepare').disabled).toBe(true)
  expect(save).toHaveBeenCalledTimes(1)
  save.mockImplementationOnce(async (_id, update) => {
    vi.mocked(runtimeApi.boardTask).mockResolvedValue({
      ...task,
      ...update,
      column: 'ready',
      revision: 5,
    })
    throw new AxiosError('ready response lost')
  })
  button('task-plan-ready').click()
  await vi.waitFor(() => expect(button('task-plan-reconcile')).not.toBeNull())
  expect(button('task-plan-prepare').disabled).toBe(true)
  expect(save.mock.calls[1]![1]).toMatchObject({ revision: 4, column: 'ready' })
  button('task-plan-reconcile').click()
  await vi.waitFor(() => expect(button('task-plan-prepare').disabled).toBe(false))
  button('task-plan-prepare').click()
  expect(prepared).toHaveBeenCalledWith(expect.objectContaining({ revision: 5, column: 'ready' }))
  expect(save).toHaveBeenCalledTimes(2)
})
it('refuses a stale plan without modifying the current task', async () => {
  const save = await mount(4)
  await vi.waitFor(() =>
    expect(
      (document.querySelector('[data-testid=task-plan-goal]') as HTMLTextAreaElement).value,
    ).toBe('Original goal'),
  )
  expect(button('task-plan-adopt').disabled).toBe(true)
  expect(button('task-plan-save').disabled).toBe(true)
  expect(save).not.toHaveBeenCalled()
})
it('reconciles a committed save after response loss using GET without replaying the write', async () => {
  const save = await mount()
  await vi.waitFor(() => expect(button('task-plan-adopt').disabled).toBe(false))
  save.mockImplementationOnce(async (_id, update) => {
    vi.mocked(runtimeApi.boardTask).mockResolvedValue({ ...task, ...update, revision: 4 })
    throw new AxiosError('response lost')
  })
  button('task-plan-adopt').click()
  await vi.waitFor(() => expect(button('task-plan-save').disabled).toBe(false))
  button('task-plan-save').click()
  await vi.waitFor(() => expect(button('task-plan-reconcile')).not.toBeNull())
  expect(button('task-plan-save').disabled).toBe(true)
  expect(
    (document.querySelector('[data-testid=task-plan-notes]') as HTMLTextAreaElement).disabled,
  ).toBe(true)
  button('task-plan-reconcile').click()
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=task-plan-reconcile]')).toBeNull(),
  )
  expect(save).toHaveBeenCalledTimes(1)
  expect(runtimeApi.boardTask).toHaveBeenCalledTimes(2)
  await vi.waitFor(() => expect(button('task-plan-prepare').disabled).toBe(false))
  button('task-plan-prepare').click()
  expect(prepared).toHaveBeenCalledWith(expect.objectContaining({ revision: 4, id: 'task' }))
})
