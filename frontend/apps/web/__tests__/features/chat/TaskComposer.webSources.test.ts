// @vitest-environment happy-dom
import { expect, it } from 'vite-plus/test'
import { createApp, h, ref, nextTick } from 'vue'
import { i18n } from '../../../src/lib/i18n'
import TaskComposer from '../../../src/features/chat/TaskComposer.vue'
import type { TaskContext, WebSourceService } from '@eap/runtime-client'
it('requires explicit service, capability and enable choices, and never grants capabilities when availability changes', async () => {
  const context = ref<TaskContext>({
    mode: 'chat',
    expert: 'general',
    instructions: '',
    reasoning: 'default',
    approval: 'review',
    files: [],
    prototypeVersionId: '',
    targetPath: '',
  })
  const services = ref<WebSourceService[]>([])
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({
    render: () =>
      h(TaskComposer, {
        context: context.value,
        disabled: false,
        reasoningEfforts: [],
        webSourceServices: services.value,
        onUpdate: (value) => {
          context.value = value
        },
      }),
  })
  app.use(i18n).mount(root)
  const select = root.querySelector<HTMLSelectElement>('[data-testid="web-source-server"]')!
  expect(select.disabled).toBe(true)
  expect(context.value.webSources).toBeUndefined()
  services.value = [
    { serverId: 'safe-search', search: true, read: false },
    { serverId: 'safe-read', search: false, read: true },
  ]
  await nextTick()
  expect(select.value).toBe('')
  expect(context.value.webSources).toBeUndefined()
  select.value = 'safe-search'
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
  expect(context.value.webSources).toEqual({
    enabled: false,
    serverId: 'safe-search',
    search: false,
    read: false,
  })
  const checkboxes = root.querySelectorAll<HTMLInputElement>(
    '[data-testid="web-source-options"] input[type="checkbox"]',
  )
  expect(checkboxes[1]!.disabled).toBe(true)
  checkboxes[0]!.click()
  await nextTick()
  expect(context.value.webSources?.enabled).toBe(false)
  checkboxes[2]!.click()
  await nextTick()
  expect(context.value.webSources?.enabled).toBe(true)
  select.value = 'safe-read'
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
  expect(context.value.webSources).toEqual({
    enabled: false,
    serverId: 'safe-read',
    search: false,
    read: false,
  })
  app.unmount()
  root.remove()
})
