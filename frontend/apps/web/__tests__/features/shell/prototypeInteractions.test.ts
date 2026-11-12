// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test'
import { createApp, nextTick, ref, h, type App } from 'vue'
import {
  emptyPrototypeSchema,
  canAutoDeliver,
  parsePrototypeSchema,
} from '@eap/runtime-client/contracts'
import { i18n } from '../../../src/lib/i18n'
import Preview from '../../../src/features/shell/PrototypeSchemaPreview.vue'

const make = () => {
  const schema = emptyPrototypeSchema('Interactive form')
  schema.root.children = [
    {
      id: 'form',
      kind: 'form',
      props: { label: '申请' },
      children: [
        { id: 'name', kind: 'input', props: { label: '名称', required: true }, children: [] },
        {
          id: 'type',
          kind: 'select',
          props: { label: '类别', required: true, options: ['界面', '功能'] },
          children: [],
        },
        { id: 'confirm', kind: 'checkbox', props: { label: '确认', required: true }, children: [] },
        {
          id: 'submit',
          kind: 'button',
          props: { label: '提交', action: { type: 'SUBMIT', target: 'form' } },
          children: [],
        },
        {
          id: 'reset',
          kind: 'button',
          props: { label: '重置', action: { type: 'RESET', target: 'form' } },
          children: [],
        },
      ],
    },
    {
      id: 'open',
      kind: 'button',
      props: { label: '说明', action: { type: 'TOGGLE', target: 'dialog' } },
      children: [],
    },
    {
      id: 'dialog',
      kind: 'dialog',
      props: { label: '核对' },
      children: [{ id: 'text', kind: 'text', props: { text: '当前预览' }, children: [] }],
    },
  ]
  return schema
}
let app: App | undefined
let host: HTMLElement
afterEach(() => {
  app?.unmount()
  host?.remove()
})
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.trim() === label,
  )!
const change = async (node: HTMLInputElement | HTMLSelectElement, value: string) => {
  node.value = value
  node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  await nextTick()
}
it('validates a complete form, resets it and isolates interaction state from saved schema', async () => {
  const schema = ref(make())
  const before = JSON.stringify(schema.value)
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(Preview, { schema: schema.value }) })
  app.use(i18n).mount(host)
  button('提交').click()
  await nextTick()
  expect(host.querySelectorAll('[aria-invalid=true]')).toHaveLength(3)
  await change(host.querySelector('input:not([type=checkbox])')!, '新任务')
  await change(host.querySelector('select')!, '功能')
  host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click()
  button('提交').click()
  await nextTick()
  expect(host.textContent).toContain('预览提交完成')
  expect(host.querySelectorAll('[aria-invalid=true]')).toHaveLength(0)
  button('重置').click()
  await nextTick()
  expect(host.querySelector<HTMLInputElement>('input:not([type=checkbox])')!.value).toBe('')
  expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(false)
  expect(host.textContent).not.toContain('预览提交完成')
  button('说明').click()
  await nextTick()
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('当前预览')
  button('关闭面板').click()
  await nextTick()
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(JSON.stringify(schema.value)).toBe(before)
  await change(host.querySelector('input:not([type=checkbox])')!, '未保存输入')
  schema.value = make()
  await nextTick()
  expect(host.querySelector<HTMLInputElement>('input:not([type=checkbox])')!.value).toBe('')
})
it('refuses dangling or incompatible actions, duplicate IDs, and malformed selections before rendering or publication', () => {
  for (const mutate of [
    (schema: ReturnType<typeof make>) => {
      schema.root.children[1]!.props.action = { type: 'TOGGLE', target: 'missing' }
    },
    (schema: ReturnType<typeof make>) => {
      schema.root.children[1]!.props.action = { type: 'SUBMIT', target: 'dialog' }
    },
    (schema: ReturnType<typeof make>) => {
      schema.root.children[1]!.props.action = { type: 'FETCH', target: 'dialog' }
    },
    (schema: ReturnType<typeof make>) => {
      schema.root.children[1]!.id = 'form'
    },
    (schema: ReturnType<typeof make>) => {
      schema.root.children[0]!.children[1]!.props.options = ['重复', '重复']
    },
  ]) {
    const schema = make()
    mutate(schema)
    expect(canAutoDeliver(schema)).toBe(false)
    expect(parsePrototypeSchema(JSON.stringify(schema))).toBeNull()
  }
})
