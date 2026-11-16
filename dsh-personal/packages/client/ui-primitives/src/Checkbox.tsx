/** Controlled native checkbox with a caller-owned visible and accessible label. */
import { defineComponent, h, type PropType } from 'vue'
import clsx from 'clsx'
import css from './Checkbox.module.css'

/** Changes request a boolean from the owner; modalAutofocus marks the native input for its owning modal. */
export const Checkbox = defineComponent({
  name: 'Checkbox',
  inheritAttrs: false,
  props: {
    checked: { type: Boolean, required: true },
    onChange: { type: Function as PropType<(next: boolean) => void>, required: true },
    label: { type: String, required: true },
    disabled: Boolean,
    title: String,
    className: String,
    modalAutofocus: Boolean,
  },
  setup(props) {
    return () => h('label', { class: clsx(css.checkbox, props.className), title: props.title }, [
      h('input', {
        type: 'checkbox', checked: props.checked, disabled: props.disabled,
        'data-modal-autofocus': props.modalAutofocus || undefined,
        onChange: (event: Event) => {
          if (!props.disabled && event.target instanceof HTMLInputElement) {
            props.onChange(event.target.checked)
            event.target.checked = props.checked
          }
        },
      }),
      h('span', props.label),
    ])
  },
})
