/** Controlled configuration input shared by generated and custom forms. */
import { defineComponent, h, useId, type PropType } from 'vue'
import css from './ConfigField.module.css'

/** Field state and localized controls supplied by the owning form. */
export interface ConfigFieldProps {
  /** Display label from the owning plugin. */
  label: string
  /** Editable text; containers may use JSON. */
  value: string
  /** Hide the input text and disable browser password autofill. */
  secret: boolean
  /** Finite choices; an empty list uses a text control. */
  choices: readonly string[]
  /** Whether the field is currently read-only. */
  disabled: boolean
  /** Whether the field has a user override. */
  overridden: boolean
  /** Whether the draft fails validation. */
  invalid: boolean
  /** Localized reset, inherited-value choice, and validation text. */
  labels: { reset: string; inherited: string; invalid: string }
  /** Stage a new text value. */
  onChange: (value: string) => void
  /** Stage removal of the user override. */
  onReset: () => void
}

/** A labelled field delegates schema, draft, and persistence ownership to its form. */
export const ConfigField = defineComponent({
  name: 'ConfigField',
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
    secret: Boolean,
    choices: { type: Array as PropType<readonly string[]>, required: true },
    disabled: Boolean,
    overridden: Boolean,
    invalid: Boolean,
    labels: { type: Object as PropType<ConfigFieldProps['labels']>, required: true },
    onChange: { type: Function as PropType<ConfigFieldProps['onChange']>, required: true },
    onReset: { type: Function as PropType<ConfigFieldProps['onReset']>, required: true },
  },
  setup(props) {
    const id = useId()
    const input = (event: Event) => {
      const el = event.target
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return
      if (el instanceof HTMLSelectElement && el.value === '') props.onReset()
      else props.onChange(el.value)
      el.value = props.value
    }
    return () => {
      const attrs = { id, value: props.value, disabled: props.disabled, 'aria-invalid': props.invalid }
      return h('div', { class: css.field }, [
        h('div', { class: css.head }, [h('label', { for: id }, props.label),
          props.overridden ? h('button', { type: 'button', disabled: props.disabled, onClick: props.onReset }, props.labels.reset) : null]),
        props.choices.length > 0
          ? h('select', { ...attrs, onChange: input }, [h('option', { value: '' }, props.labels.inherited),
            ...props.choices.map(choice => h('option', { key: choice, value: choice }, choice))])
          : props.secret ? h('input', { ...attrs, type: 'password', autocomplete: 'new-password', onInput: input })
            : h('textarea', { ...attrs, rows: Math.min(8, Math.max(1, props.value.split('\n').length)), onInput: input }),
        props.invalid ? h('p', { role: 'status' }, props.labels.invalid) : null,
      ])
    }
  },
})
