/** Controlled toggle with a required caller-localized accessible name. */
import { defineComponent, h, onMounted, ref, type PropType } from 'vue'
import clsx from 'clsx'
import css from './Switch.module.css'

/** Clicks request the inverse checked value; autoFocus focuses only an enabled control on mount. */
export const Switch = defineComponent({
  name: 'Switch',
  inheritAttrs: false,
  props: {
    checked: { type: Boolean, required: true },
    onChange: { type: Function as PropType<(next: boolean) => void>, required: true },
    label: { type: String, required: true },
    disabled: Boolean,
    title: String,
    className: String,
    autoFocus: Boolean,
    describedBy: String,
  },
  setup(props) {
    const element = ref<HTMLButtonElement | null>(null)
    onMounted(() => { if (props.autoFocus && !props.disabled) element.value?.focus() })
    return () => h('button', {
      ref: element, type: 'button', role: 'switch',
      'aria-checked': props.checked, 'aria-label': props.label, 'aria-describedby': props.describedBy,
      title: props.title, disabled: props.disabled, autofocus: props.autoFocus,
      class: clsx(css.switch, props.className),
      onClick: () => { if (!props.disabled) props.onChange(!props.checked) },
    }, [h('span', { class: css.thumb })])
  },
})
