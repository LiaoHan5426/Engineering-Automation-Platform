import { inject, onDeactivated, provide, reactive, watch, type InjectionKey, type Ref } from 'vue'
import {
  PrototypeActionType,
  prototypeNodes,
  type PrototypeAction,
  type PrototypeNode,
  type PrototypeSchema,
} from '@eap/runtime-client/contracts'

const previewKey: InjectionKey<ReturnType<typeof createState>> = Symbol('prototype-preview')
const initial = (node: PrototypeNode) =>
  node.kind === 'checkbox' ? node.props.checked === true : String(node.props.initialValue ?? '')

function createState(schema: Ref<PrototypeSchema>) {
  const values = reactive(new Map<string, string | boolean>())
  const hidden = reactive(new Set<string>())
  const invalid = reactive(new Set<string>())
  const submitted = reactive(new Set<string>())
  watch(
    schema,
    () => {
      values.clear()
      hidden.clear()
      invalid.clear()
      submitted.clear()
      for (const node of prototypeNodes(schema.value)) {
        values.set(node.id, initial(node))
        if (node.kind === 'dialog' || node.props.initiallyVisible === false) hidden.add(node.id)
      }
    },
    { immediate: true, deep: true },
  )

  function act(action: PrototypeAction) {
    const target = prototypeNodes(schema.value).find((node) => node.id === action.target)
    if (
      !target ||
      !Object.values(PrototypeActionType).includes(action.type) ||
      (action.type === PrototypeActionType.TOGGLE
        ? !['section', 'dialog'].includes(target.kind)
        : target.kind !== 'form')
    )
      return
    if (action.type === PrototypeActionType.TOGGLE) {
      if (hidden.has(target.id)) hidden.delete(target.id)
      else hidden.add(target.id)
      return
    }
    const fields: PrototypeNode[] = []
    const collect = (node: PrototypeNode) => {
      if (['input', 'checkbox', 'select'].includes(node.kind)) fields.push(node)
      node.children.forEach(collect)
    }
    collect(target)
    submitted.delete(target.id)
    for (const field of fields) {
      invalid.delete(field.id)
      if (action.type === PrototypeActionType.RESET) values.set(field.id, initial(field))
      else if (
        field.props.required &&
        !(field.kind === 'checkbox'
          ? values.get(field.id) === true
          : String(values.get(field.id) ?? '').trim())
      )
        invalid.add(field.id)
    }
    if (
      action.type === PrototypeActionType.SUBMIT &&
      !fields.some((field) => invalid.has(field.id))
    )
      submitted.add(target.id)
  }
  return { values, hidden, invalid, submitted, act }
}

export function providePrototypePreview(schema: Ref<PrototypeSchema>) {
  const state = createState(schema)
  provide(previewKey, state)
  onDeactivated(() =>
    prototypeNodes(schema.value)
      .filter((node) => node.kind === 'dialog')
      .forEach((node) => state.hidden.add(node.id)),
  )
  return state
}

export function usePrototypePreview() {
  const state = inject(previewKey)
  if (!state) throw new Error('Prototype preview provider missing')
  return state
}
