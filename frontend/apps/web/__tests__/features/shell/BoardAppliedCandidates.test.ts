// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import {
  runtimeApi,
  type BoardTask,
  type BoardRun,
  type BoardAppliedCandidates,
} from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import Candidates from '../../../src/features/shell/BoardAppliedCandidates.vue'
const task = { id: crypto.randomUUID(), projectId: 'project', revision: 3 } as BoardTask
const run = {
  taskRevision: 3,
  execution: { id: crypto.randomUUID(), workspacePath: 'J:/repo' },
} as BoardRun
const item = {
  conversationId: crypto.randomUUID(),
  proposalId: crypto.randomUUID(),
  generationId: crypto.randomUUID(),
  targetPath: 'frontend/Page.vue',
  afterHash: 'a'.repeat(64),
  appliedAt: '2026-11-10T00:00:00Z',
}
const page = (): BoardAppliedCandidates => ({
  taskBinding: { taskId: task.id, projectId: task.projectId, revision: 3 },
  workspacePath: run.execution.workspacePath,
  items: [item],
  truncated: false,
})
let app: App | undefined, root: HTMLElement
const selected = vi.fn(),
  disabled = ref(false),
  current = ref(task)
const button = (id: string) => root.querySelector<HTMLButtonElement>('[data-testid=' + id + ']')!
async function mount() {
  selected.mockClear()
  disabled.value = false
  current.value = task
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () =>
      h(Candidates, { task: current.value, run, disabled: disabled.value, onSelect: selected }),
  })
  app.use(i18n).mount(root)
  await nextTick()
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})
it('reads only on explicit request and selection emits the exact server evidence without writing', async () => {
  const read = vi.spyOn(runtimeApi, 'boardAppliedCandidates').mockResolvedValue(page())
  await mount()
  expect(read).not.toHaveBeenCalled()
  button('delivery-load-candidates').click()
  await vi.waitFor(() => expect(button('delivery-select-candidate')).not.toBeNull())
  expect(read).toHaveBeenCalledWith(task.id, run.execution.id, task.projectId)
  expect(selected).not.toHaveBeenCalled()
  button('delivery-select-candidate').click()
  expect(selected).toHaveBeenCalledWith(item)
})
it('preserves a failed previous snapshot for viewing and blocks selection until an explicit successful read', async () => {
  vi.spyOn(runtimeApi, 'boardAppliedCandidates')
    .mockResolvedValueOnce(page())
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(page())
  await mount()
  button('delivery-load-candidates').click()
  await vi.waitFor(() => expect(button('delivery-select-candidate')).not.toBeNull())
  button('delivery-load-candidates').click()
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid=delivery-candidates-failed]')).not.toBeNull(),
  )
  expect(root.textContent).toContain(item.targetPath)
  expect(button('delivery-select-candidate').disabled).toBe(true)
  button('delivery-load-candidates').click()
  await vi.waitFor(() => expect(button('delivery-select-candidate').disabled).toBe(false))
})
it('rejects another task or workspace response and discards a response arriving after the task changes', async () => {
  const read = vi
    .spyOn(runtimeApi, 'boardAppliedCandidates')
    .mockResolvedValue({ ...page(), workspacePath: 'another' })
  await mount()
  button('delivery-load-candidates').click()
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid=delivery-candidates-failed]')).not.toBeNull(),
  )
  expect(button('delivery-select-candidate')).toBeNull()
  let finish!: (value: BoardAppliedCandidates) => void
  read.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  button('delivery-load-candidates').click()
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  current.value = { ...task, id: crypto.randomUUID() }
  await nextTick()
  finish(page())
  await nextTick()
  await nextTick()
  expect(button('delivery-select-candidate')).toBeNull()
  expect(selected).not.toHaveBeenCalled()
})
it('cannot select or read while a delivery request is pending', async () => {
  const read = vi.spyOn(runtimeApi, 'boardAppliedCandidates').mockResolvedValue(page())
  await mount()
  disabled.value = true
  await nextTick()
  button('delivery-load-candidates').click()
  expect(read).not.toHaveBeenCalled()
  expect(selected).not.toHaveBeenCalled()
})
