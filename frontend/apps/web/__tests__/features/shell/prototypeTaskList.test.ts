// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test'
import { createApp, nextTick, ref, h, KeepAlive, type App } from 'vue'
import {
  emptyPrototypeSchema,
  parsePrototypeSchema,
  canAutoDeliver,
  isPrototypeTaskListItems,
} from '@eap/runtime-client/contracts'
import { i18n } from '../../../src/lib/i18n'
import Preview from '../../../src/features/shell/PrototypeSchemaPreview.vue'
import { prototypeTaskListSample } from '../../../src/features/shell/prototypeTaskListSample'
import {
  schemaFromGrapesProject,
  savePrototypeSchema,
} from '../../../src/features/shell/prototypeSchema'
import { taskListPrototypeBlock } from '../../../src/features/shell/prototypeBlocks'
const make = () => {
  const schema = emptyPrototypeSchema('Tasks')
  schema.root.children = [
    {
      id: 'tasks',
      kind: 'task-list',
      props: { items: structuredClone(prototypeTaskListSample) },
      children: [],
    },
  ]
  return schema
}
let app: App | undefined, host: HTMLElement
const tick = async () => {
  await nextTick()
  await nextTick()
}
afterEach(() => {
  app?.unmount()
  host?.remove()
})
const click = async (selector: string) => {
  ;(document.querySelector(selector) as HTMLElement).click()
  await tick()
}
async function change(selector: string, value: string) {
  const input = document.querySelector(selector) as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  await tick()
}
it('strictly rejects malformed records, duplicate IDs, extra keys and child nodes without a fallback', () => {
  const item = prototypeTaskListSample[0]!
  for (const bad of [
    null,
    {},
    '[]',
    Array(31).fill(item),
    [item, item],
    [{ ...item, extra: '' }],
    [{ ...item, priority: 'P1' }],
    [{ ...item, status: 'unknown' }],
    [{ ...item, goal: '' }],
    [{ ...item, summary: 'x'.repeat(241) }],
    [{ ...item, id: '1bad' }],
    [{ ...item, name: 2 }],
  ]) {
    expect(isPrototypeTaskListItems(bad)).toBe(false)
    const schema = make()
    schema.root.children[0]!.props.items = bad
    expect(canAutoDeliver(schema)).toBe(false)
    expect(parsePrototypeSchema(JSON.stringify(schema))).toBeNull()
    expect(() => savePrototypeSchema(schema)).toThrow('invalid_prototype_task_list')
  }
  expect(isPrototypeTaskListItems([])).toBe(true)
  const schema = make()
  schema.root.children[0]!.children.push({ id: 'bad', kind: 'text', props: {}, children: [] })
  expect(parsePrototypeSchema(JSON.stringify(schema))).toBeNull()
})
it('extracts approved editable records from project JSON and preserves multiline details through storage', () => {
  const block = taskListPrototypeBlock()
  const project = { pages: [{ frames: [{ component: block }] }] }
  const schema = schemaFromGrapesProject('Tasks', project)
  expect(schema.root.children[0]!.props.items).toEqual(prototypeTaskListSample)
  expect(schema.grapesProject).toEqual(project)
  const row = (schema.root.children[0]!.props.items as typeof prototypeTaskListSample)[0]!
  row.goal += '\nSecond line'
  const saved = savePrototypeSchema(schema)
  expect(parsePrototypeSchema(JSON.stringify(saved))!.root.children[0]!.props.items).toEqual(
    schema.root.children[0]!.props.items,
  )
  const malformed = structuredClone(project)
  malformed.pages[0]!.frames[0]!.component.attributes!['data-items'] = '{'
  expect(canAutoDeliver(schemaFromGrapesProject('Invalid', malformed))).toBe(false)
  const child = { ...block, components: [{ tagName: 'p', content: 'unexpected' }] }
  expect(
    canAutoDeliver(
      schemaFromGrapesProject('Child', { pages: [{ frames: [{ component: child }] }] }),
    ),
  ).toBe(false)
})
it('intersects trimmed case-insensitive name and status filters, clears empty results, and keeps readonly details local with Escape/focus return', async () => {
  const schema = ref(make()),
    before = JSON.stringify(schema.value)
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(Preview, { schema: schema.value }) })
  app.use(i18n).mount(host)
  await change('[data-testid="task-list-query"]', '  api  ')
  expect(host.querySelectorAll('[data-task-id]')).toHaveLength(2)
  const statusFilter = host.querySelector<HTMLSelectElement>('[data-testid="task-list-status"]')!
  // Explicit name excludes the wrapped select's option labels from its accessible name.
  expect(statusFilter.getAttribute('aria-label')).toBe('任务状态')
  expect(statusFilter.labels?.[0]?.textContent).toContain('全部状态')
  await change('select[aria-label="任务状态"]', 'running')
  expect(host.querySelectorAll('[data-task-id]')).toHaveLength(1)
  const opener = host.querySelector<HTMLButtonElement>('[data-task-id] button')!
  opener.focus()
  opener.click()
  await tick()
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.textContent).toContain(prototypeTaskListSample[2]!.goal)
  expect(dialog.querySelector('input,textarea,select')).toBeNull()
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await tick()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(opener)
  expect(host.querySelectorAll('[data-task-id]')).toHaveLength(1)
  await change('[data-testid="task-list-query"]', 'absent')
  expect(host.querySelector('[data-testid="task-list-empty"]')).not.toBeNull()
  await click('[data-testid="task-list-empty"] button')
  expect(host.querySelectorAll('[data-task-id]')).toHaveLength(6)
  expect(JSON.stringify(schema.value)).toBe(before)
})
it('resets filters and selected record on schema replacement and KeepAlive deactivation', async () => {
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
  await change('[data-testid="task-list-query"]', 'API')
  await click('[data-task-id] button')
  schema.value = make()
  await tick()
  expect(host.querySelectorAll('[data-task-id]')).toHaveLength(6)
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  await change('[data-testid="task-list-query"]', 'API')
  await click('[data-task-id] button')
  active.value = false
  await tick()
  active.value = true
  await tick()
  expect(host.querySelectorAll('[data-task-id]')).toHaveLength(6)
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
