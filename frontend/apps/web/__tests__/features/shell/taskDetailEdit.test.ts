// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref, KeepAlive, type App } from 'vue'
import {
  emptyPrototypeSchema,
  parsePrototypeSchema,
  canAutoDeliver,
} from '@eap/runtime-client/contracts'
import { runtimeApi } from '@eap/runtime-client'
import Preview from '../../../src/features/shell/PrototypeSchemaPreview.vue'
import { prototypeTaskListSample } from '../../../src/features/shell/prototypeTaskListSample'
import { schemaFromGrapesProject } from '../../../src/features/shell/prototypeSchema'
import { i18n } from '../../../src/lib/i18n'
const make = () => {
  const s = emptyPrototypeSchema('Tasks')
  s.root.children = [
    {
      id: 'tasks',
      kind: 'task-list',
      props: { editable: true, items: structuredClone(prototypeTaskListSample) },
      children: [],
    },
  ]
  return s
}
let app: App | undefined, host: HTMLElement
const tick = async () => {
  await nextTick()
  await nextTick()
  await nextTick()
}
const el = (id: string) => document.querySelector<HTMLElement>('[data-testid="' + id + '"]')!
const click = async (id: string) => {
  el(id).click()
  await tick()
}
const change = async (id: string, value: string) => {
  const input = el(id) as HTMLTextAreaElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}
async function mount() {
  const schema = ref(make()),
    active = ref(true)
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    render: () =>
      h(
        KeepAlive,
        {},
        { default: () => (active.value ? h(Preview, { schema: schema.value }) : null) },
      ),
  })
  app.use(i18n).mount(host)
  await tick()
  return { schema, active }
}
async function open() {
  ;(host.querySelector('[data-task-id] button') as HTMLElement).focus()
  ;(host.querySelector('[data-task-id] button') as HTMLElement).click()
  await tick()
  await click('task-edit-open')
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.restoreAllMocks()
})
it('requires actual boolean editable and preserves omitted readonly contracts through Grapes', () => {
  for (const bad of [null, 'true', 0, {}, []]) {
    const s = make()
    s.root.children[0]!.props.editable = bad
    expect(parsePrototypeSchema(JSON.stringify(s))).toBeNull()
    expect(canAutoDeliver(s)).toBe(false)
  }
  for (const value of [true, false]) {
    const s = make()
    s.root.children[0]!.props.editable = value
    expect(parsePrototypeSchema(JSON.stringify(s))).not.toBeNull()
  }
  for (const value of ['true', 'false', 'invalid']) {
    const s = schemaFromGrapesProject('Tasks', {
      pages: [
        {
          frames: [
            {
              component: {
                tagName: 'section',
                attributes: {
                  'data-eap-kind': 'task-list',
                  'data-eap-id': 'tasks',
                  'data-editable': value,
                  'data-items': JSON.stringify(prototypeTaskListSample),
                },
              },
            },
          ],
        },
      ],
    })
    expect(canAutoDeliver(s)).toBe(value !== 'invalid')
    if (value !== 'invalid') expect(s.root.children[0]!.props.editable).toBe(value === 'true')
  }
})
it('validates both fields, preserves draft on error, saves locally and restores source on identity/deactivation', async () => {
  const { schema, active } = await mount(),
    before = JSON.stringify(schema.value)
  await open()
  await change('task-edit-goal', '   ')
  await change('task-edit-acceptanceCriteria', 'x'.repeat(2001))
  await click('task-edit-save')
  expect(document.activeElement).toBe(el('task-edit-goal'))
  expect(document.querySelectorAll('[role="alert"]')).toHaveLength(2)
  await change('task-edit-goal', 'Local goal')
  await change('task-edit-acceptanceCriteria', 'x'.repeat(2000))
  await click('task-edit-save')
  expect(document.querySelector('[data-testid="task-list-detail"]')!.textContent).toContain(
    'Local goal',
  )
  expect(JSON.stringify(schema.value)).toBe(before)
  await click('task-edit-open')
  expect((el('task-edit-goal') as HTMLTextAreaElement).value).toBe('Local goal')
  await click('task-edit-cancel')
  expect(document.querySelector('.eap-confirm')).toBeNull()
  const close = document.querySelector(
    '[data-testid="task-list-detail"] [data-eap-dialog-close]',
  ) as HTMLElement
  close.click()
  await tick()
  expect(document.activeElement).toBe(host.querySelector('[data-task-id] button'))
  await change('task-list-query', 'absent')
  ;(el('task-list-empty').querySelector('button') as HTMLElement).click()
  await tick()
  await open()
  expect((el('task-edit-goal') as HTMLTextAreaElement).value).toBe('Local goal')
  await click('task-edit-cancel')
  ;(host.querySelectorAll('[data-task-id] button')[1] as HTMLElement).click()
  await tick()
  await click('task-edit-open')
  expect((el('task-edit-goal') as HTMLTextAreaElement).value).toBe(prototypeTaskListSample[1]!.goal)
  schema.value = make()
  await tick()
  await open()
  expect((el('task-edit-goal') as HTMLTextAreaElement).value).toBe(prototypeTaskListSample[0]!.goal)
  active.value = false
  await tick()
  active.value = true
  await tick()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
it('protects dirty drafts for cancel/header/Escape and treats ABA as clean', async () => {
  await mount()
  await open()
  const original = (el('task-edit-goal') as HTMLTextAreaElement).value
  for (const exit of ['cancel', 'header', 'escape']) {
    await change('task-edit-goal', 'Changed')
    if (exit === 'cancel') await click('task-edit-cancel')
    else if (exit === 'header') {
      ;(
        document.querySelector(
          '[data-testid="task-edit-dialog"] [data-eap-dialog-close]',
        ) as HTMLElement
      ).click()
      await tick()
    } else {
      document
        .querySelector('[data-testid="task-edit-dialog"] [role="dialog"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await tick()
    }
    expect(document.querySelector('.eap-confirm')).not.toBeNull()
    ;(document.querySelector('[data-confirm-cancel]') as HTMLElement).click()
    await tick()
    expect((el('task-edit-goal') as HTMLTextAreaElement).value).toBe('Changed')
    await change('task-edit-goal', original)
  }
  await click('task-edit-cancel')
  expect(document.querySelector('.eap-confirm')).toBeNull()
  await click('task-edit-open')
  await change('task-edit-goal', 'discard')
  await click('task-edit-cancel')
  ;(document.querySelector('.eap-confirm .eap-button--danger') as HTMLElement).click()
  await tick()
  await click('task-edit-open')
  expect((el('task-edit-goal') as HTMLTextAreaElement).value).toBe(original)
})
it('invalidates ABA results with abort and independent DELETE, adopts only draft and preserves both drafts on failure', async () => {
  let resolve!: (value: any) => void
  const optimize = vi
    .spyOn(runtimeApi, 'optimizeTaskDetail')
    .mockImplementation(() => new Promise((done) => (resolve = done)))
  const cancel = vi.spyOn(runtimeApi, 'cancelTaskDetailOptimization').mockResolvedValue(undefined)
  const { schema } = await mount(),
    before = JSON.stringify(schema.value)
  await open()
  const goal = (el('task-edit-goal') as HTMLTextAreaElement).value
  await click('task-ai-optimize')
  const args = optimize.mock.calls[0]!
  await change('task-edit-goal', goal + 'A')
  await change('task-edit-goal', goal)
  expect(args[2]!.signal!.aborted).toBe(true)
  expect(cancel).toHaveBeenCalledWith(args[0])
  resolve({ goal: 'stale', acceptanceCriteria: 'stale', connectionId: 'c', model: 'm' })
  await tick()
  expect(document.querySelector('[data-testid="task-ai-adopt"]')).toBeNull()
  expect((el('task-edit-goal') as HTMLTextAreaElement).value).toBe(goal)
  optimize.mockResolvedValue({
    goal: 'AI goal',
    acceptanceCriteria: 'AI criteria',
    connectionId: 'c',
    model: 'm',
  })
  await click('task-ai-optimize')
  await tick()
  expect((el('task-edit-goal') as HTMLTextAreaElement).value).toBe(goal)
  await click('task-ai-adopt')
  expect((el('task-edit-goal') as HTMLTextAreaElement).value).toBe('AI goal')
  expect((el('task-edit-acceptanceCriteria') as HTMLTextAreaElement).value).toBe('AI criteria')
  expect(JSON.stringify(schema.value)).toBe(before)
  optimize.mockRejectedValue(new Error('fail'))
  await click('task-ai-optimize')
  await tick()
  expect((el('task-edit-goal') as HTMLTextAreaElement).value).toBe('AI goal')
  expect((el('task-edit-acceptanceCriteria') as HTMLTextAreaElement).value).toBe('AI criteria')
  expect(document.querySelector('[data-testid="task-ai-panel"]')!.textContent).toContain('请重试')
})
for (const exit of [
  'cancelAI',
  'closeConfirmation',
  'save',
  'identity',
  'deactivate',
  'unmount',
] as const) {
  it('invalidates pending results on ' + exit, async () => {
    let resolve!: (value: Awaited<ReturnType<typeof runtimeApi.optimizeTaskDetail>>) => void
    const optimize = vi.spyOn(runtimeApi, 'optimizeTaskDetail').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const cancel = vi.spyOn(runtimeApi, 'cancelTaskDetailOptimization').mockResolvedValue(undefined)
    const { schema, active } = await mount()
    const before = JSON.stringify(schema.value)
    await open()
    await change('task-edit-goal', 'Unsaved goal')
    await click('task-ai-optimize')
    const args = optimize.mock.calls[0]!
    if (exit === 'cancelAI') await click('task-ai-cancel')
    if (exit === 'closeConfirmation') await click('task-edit-cancel')
    if (exit === 'save') await click('task-edit-save')
    if (exit === 'identity') {
      schema.value = JSON.parse(before)
      await tick()
    }
    if (exit === 'deactivate') {
      active.value = false
      await tick()
    }
    if (exit === 'unmount') {
      app!.unmount()
      app = undefined
      await tick()
    }
    expect(args[2]!.signal!.aborted).toBe(true)
    expect(cancel).toHaveBeenCalledWith(args[0])
    resolve({
      goal: 'Stale output',
      acceptanceCriteria: 'Stale output',
      connectionId: 'c',
      model: 'm',
    })
    await tick()
    expect(document.querySelector('[data-testid="task-ai-adopt"]')).toBeNull()
    expect(JSON.stringify(schema.value)).toBe(before)
    if (exit === 'closeConfirmation') {
      ;(document.querySelector('[data-confirm-cancel]') as HTMLElement).click()
      await tick()
      expect((el('task-edit-goal') as HTMLTextAreaElement).value).toBe('Unsaved goal')
    }
  })
}
