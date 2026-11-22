// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import ExecutionLogDialog from '../../../src/features/chat/ExecutionLogDialog.vue'

let app: App | undefined
const settle = async () => {
  for (let i = 0; i < 8; i++) await nextTick()
}
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
async function mount() {
  const executionId = ref('execution-1')
  const root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () =>
      h(ExecutionLogDialog, { conversationId: 'conversation-1', executionId: executionId.value }),
  })
  app.use(i18n).mount(root)
  await settle()
  return executionId
}
const snapshot = (executionId = 'execution-1') => ({
  conversationId: 'conversation-1',
  executionId,
  status: 'UNKNOWN',
  complete: false,
  latestSequence: 1,
  events: [
    {
      eventId: 'event-1',
      sequence: 1,
      executionId,
      conversationId: 'conversation-1',
      type: 'status',
      protocolVersion: '1',
      occurredAt: '2026-11-22T14:00:00Z',
      text: '保留的执行证据',
      code: '',
      status: 'RUNNING',
    },
  ],
})
it('reads a snapshot, shows unknown honestly, and refreshes only with GET', async () => {
  const read = vi.spyOn(runtimeApi, 'executionSnapshot').mockResolvedValue(snapshot())
  await mount()
  expect(read).toHaveBeenCalledWith('conversation-1', 'execution-1', 0)
  expect(document.body.textContent).toContain('结果未确认')
  expect(document.body.textContent).toContain('保留的执行证据')
  expect(document.body.textContent).toContain('不会续跑')
  document.querySelector<HTMLButtonElement>('[data-testid="execution-log-refresh"]')!.click()
  await settle()
  expect(read).toHaveBeenCalledTimes(2)
})
it('keeps errors inside the dialog and allows retry', async () => {
  const read = vi
    .spyOn(runtimeApi, 'executionSnapshot')
    .mockRejectedValueOnce(new Error('断开'))
    .mockResolvedValue(snapshot())
  await mount()
  expect(
    document.querySelector('[role="dialog"] [data-testid="execution-log-error"]'),
  ).not.toBeNull()
  document.querySelector<HTMLButtonElement>('[data-testid="execution-log-refresh"]')!.click()
  await settle()
  expect(read).toHaveBeenCalledTimes(2)
  expect(document.querySelector('[data-testid="execution-log-error"]')).toBeNull()
})
it('ignores a late response from a previously selected execution', async () => {
  let resolveFirst!: (value: ReturnType<typeof snapshot>) => void
  vi.spyOn(runtimeApi, 'executionSnapshot')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    .mockResolvedValue(snapshot('execution-2'))
  const selected = await mount()
  selected.value = 'execution-2'
  await settle()
  resolveFirst(snapshot())
  await settle()
  expect(document.querySelector('[data-testid="execution-log-id"]')?.textContent).toBe(
    'execution-2',
  )
})
