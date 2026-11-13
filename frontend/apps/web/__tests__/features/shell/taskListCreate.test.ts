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
import {
  schemaFromGrapesProject,
  savePrototypeSchema,
} from '../../../src/features/shell/prototypeSchema'
import { taskListPrototypeBlock } from '../../../src/features/shell/prototypeBlocks'
import { i18n } from '../../../src/lib/i18n'
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
  const field = el(id) as HTMLInputElement
  field.value = value
  field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  await tick()
}
const make = (count = 6, editable = true) => {
  const schema = emptyPrototypeSchema('Tasks')
  schema.root.children = [
    {
      id: 'tasks',
      kind: 'task-list',
      props: {
        creatable: true,
        editable,
        items: Array.from({ length: count }, (_, i) => ({
          ...prototypeTaskListSample[i % 6]!,
          id: 'TASK-' + i,
        })),
      },
      children: [],
    },
  ]
  return schema
}
async function mount(count = 6, editable = true) {
  const schema = ref(make(count, editable)),
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
const fill = async (name = 'New task') => {
  await change('task-edit-name', name)
  await change('task-edit-goal', 'Local goal')
  await change('task-edit-acceptanceCriteria', 'Local criteria')
}
afterEach(() => {
  app?.unmount()
  app = undefined
  host?.remove()
  vi.restoreAllMocks()
})
it('strict boolean creatable survives Grapes extraction and save; illegal values block publication', () => {
  for (const value of [true, false, undefined, null, 'true', 1, {}, []]) {
    const s = make()
    if (value === undefined) delete s.root.children[0]!.props.creatable
    else s.root.children[0]!.props.creatable = value
    const valid = value === undefined || typeof value === 'boolean'
    expect(!!parsePrototypeSchema(JSON.stringify(s))).toBe(valid)
    expect(canAutoDeliver(s)).toBe(valid)
    if (!valid) expect(() => savePrototypeSchema(s)).toThrow('invalid_prototype_task_list')
  }
  for (const value of ['true', 'false', 'invalid', true, false, null, 0]) {
    const block = taskListPrototypeBlock()
    block.attributes!['data-creatable'] = value
    const s = schemaFromGrapesProject('Tasks', { pages: [{ frames: [{ component: block }] }] })
    expect(canAutoDeliver(s)).toBe(
      value === true || value === false || value === 'true' || value === 'false',
    )
    if (canAutoDeliver(s))
      expect(
        parsePrototypeSchema(JSON.stringify(savePrototypeSchema(s)))!.root.children[0]!.props
          .creatable,
      ).toBe(value === true || value === 'true')
  }
})
it('creates only on save, clears intersected filters, focuses first new detail, deduplicates and allows later edits', async () => {
  const { schema } = await mount(),
    before = JSON.stringify(schema.value)
  await change('task-list-query', 'absent')
  await change('task-list-status', 'done')
  await click('task-create-empty')
  await fill()
  expect(host.querySelectorAll('[data-task-id]')).toHaveLength(0)
  const save = el('task-edit-save')
  save.click()
  save.click()
  await tick()
  expect(host.querySelectorAll('[data-task-id]')).toHaveLength(7)
  expect((el('task-list-query') as HTMLInputElement).value).toBe('')
  expect((el('task-list-status') as HTMLSelectElement).value).toBe('all')
  const row = host.querySelector('[data-task-id]')!
  expect(row.getAttribute('data-task-id')).toMatch(/^LOCAL-[A-Za-z0-9_-]+$/)
  expect(row.textContent).toContain('New task')
  expect(document.activeElement).toBe(row.querySelector('button'))
  ;(row.querySelector('button') as HTMLElement).click()
  await tick()
  expect(el('task-list-detail').textContent).toContain('Local goal')
  await click('task-edit-open')
  await change('task-edit-goal', 'Updated local goal')
  await click('task-edit-save')
  expect(el('task-list-detail').textContent).toContain('Updated local goal')
  expect(JSON.stringify(schema.value)).toBe(before)
})
it('validates name and both details at exact limits and protects dirty exits without inserting', async () => {
  await mount(0)
  await click('task-create-open')
  await click('task-edit-save')
  expect(document.querySelectorAll('[role="alert"]')).toHaveLength(3)
  expect(document.activeElement).toBe(el('task-edit-name'))
  await fill('x'.repeat(121))
  await change('task-edit-goal', 'x'.repeat(2001))
  await change('task-edit-acceptanceCriteria', ' ')
  await click('task-edit-save')
  expect(document.querySelectorAll('[role="alert"]')).toHaveLength(3)
  await click('task-edit-cancel')
  expect(document.querySelector('.eap-confirm')).not.toBeNull()
  ;(document.querySelector('[data-confirm-cancel]') as HTMLElement).click()
  await tick()
  expect((el('task-edit-name') as HTMLInputElement).value).toHaveLength(121)
  await change('task-edit-name', 'x'.repeat(120))
  await change('task-edit-goal', 'x'.repeat(2000))
  await change('task-edit-acceptanceCriteria', 'x'.repeat(2000))
  await click('task-edit-save')
  expect(host.querySelectorAll('[data-task-id]')).toHaveLength(1)
})
it('checks unfiltered capacity and keeps creation independent from editing', async () => {
  await mount(29, false)
  await click('task-create-open')
  await fill()
  await click('task-edit-save')
  expect((el('task-create-open') as HTMLButtonElement).disabled).toBe(true)
  await change('task-list-query', 'absent')
  expect((el('task-create-empty') as HTMLButtonElement).disabled).toBe(true)
  await change('task-list-query', 'New task')
  ;(host.querySelector('[data-task-id] button') as HTMLElement).click()
  await tick()
  expect(document.querySelector('[data-testid="task-edit-open"]')).toBeNull()
})
it('invalidates name ABA with abort and independent DELETE, adopts only details into draft, resets on replacement/deactivation', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof runtimeApi.optimizeTaskDetail>>) => void
  const optimize = vi.spyOn(runtimeApi, 'optimizeTaskDetail').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const cancel = vi.spyOn(runtimeApi, 'cancelTaskDetailOptimization').mockResolvedValue(undefined)
  const { schema, active } = await mount()
  await click('task-create-open')
  await fill()
  await click('task-ai-optimize')
  const args = optimize.mock.calls[0]!
  expect(args[1]).toEqual({ goal: 'Local goal', acceptanceCriteria: 'Local criteria' })
  await change('task-edit-name', 'Other')
  await change('task-edit-name', 'New task')
  expect(args[2]!.signal!.aborted).toBe(true)
  expect(cancel).toHaveBeenCalledWith(args[0])
  resolve({ goal: 'Stale', acceptanceCriteria: 'Stale', connectionId: 'c', model: 'm' })
  await tick()
  expect(document.querySelector('[data-testid="task-ai-adopt"]')).toBeNull()
  optimize.mockResolvedValue({
    goal: 'AI goal',
    acceptanceCriteria: 'AI criteria',
    connectionId: 'c',
    model: 'm',
  })
  await click('task-ai-optimize')
  await tick()
  await click('task-ai-adopt')
  expect((el('task-edit-name') as HTMLInputElement).value).toBe('New task')
  expect(host.querySelectorAll('[data-task-id]')).toHaveLength(6)
  await click('task-edit-save')
  expect(host.querySelectorAll('[data-task-id]')).toHaveLength(7)
  await change('task-list-query', 'absent')
  schema.value = make()
  await tick()
  expect(host.querySelectorAll('[data-task-id]')).toHaveLength(6)
  await click('task-create-open')
  await fill()
  active.value = false
  await tick()
  active.value = true
  await tick()
  expect(document.querySelector('[data-testid="task-edit-dialog"]')).toBeNull()
  expect(host.querySelectorAll('[data-task-id]')).toHaveLength(6)
})
for (const exit of ['cancel', 'header', 'escape'] as const) {
  it('protects create draft on ' + exit + ', discards explicitly and reopens clean', async () => {
    await mount()
    const opener = el('task-create-open')
    opener.focus()
    await click('task-create-open')
    await fill()
    if (exit === 'cancel') await click('task-edit-cancel')
    else if (exit === 'header') {
      ;(el('task-edit-dialog').querySelector('[data-eap-dialog-close]') as HTMLElement).click()
      await tick()
    } else {
      el('task-edit-dialog')
        .querySelector('[role="dialog"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await tick()
    }
    expect(document.querySelector('.eap-confirm')).not.toBeNull()
    ;(document.querySelector('[data-confirm-cancel]') as HTMLElement).click()
    await tick()
    expect((el('task-edit-name') as HTMLInputElement).value).toBe('New task')
    await click('task-edit-cancel')
    ;(document.querySelector('.eap-confirm .eap-button--danger') as HTMLElement).click()
    await tick()
    expect(host.querySelectorAll('[data-task-id]')).toHaveLength(6)
    expect(document.activeElement).toBe(opener)
    await click('task-create-open')
    expect((el('task-edit-name') as HTMLInputElement).value).toBe('')
    expect(document.querySelector('[data-testid="task-ai-panel"]')).toBeNull()
    await click('task-edit-cancel')
    expect(document.querySelector('.eap-confirm')).toBeNull()
  })
}
it('keeps creation hidden when omitted or false, without changing existing editable behavior', async () => {
  const { schema } = await mount()
  delete schema.value.root.children[0]!.props.creatable
  await tick()
  expect(document.querySelector('[data-testid="task-create-open"]')).toBeNull()
  schema.value.root.children[0]!.props.creatable = false
  await tick()
  expect(document.querySelector('[data-testid="task-create-empty"]')).toBeNull()
  ;(host.querySelector('[data-task-id] button') as HTMLElement).click()
  await tick()
  expect(el('task-edit-open')).not.toBeNull()
})
