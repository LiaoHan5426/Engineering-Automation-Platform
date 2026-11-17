/** Single-line input with an optional leading icon slot. */
import { defineComponent, h, type ComponentPublicInstance, type PropType } from 'vue'
import clsx from 'clsx'
import css from './Input.module.css'

/** Native attributes/listeners reach the input; className places its wrapper; elementRef clears on disposal. */
export const Input = defineComponent({
  name: 'Input',
  inheritAttrs: false,
  props: {
    className: String,
    elementRef: Function as PropType<(element: HTMLInputElement | null) => void>,
  },
  setup(props, { attrs, slots }) {
    return () => h('span', { class: clsx(css.wrap, props.className) }, [
      slots.icon && h('span', { class: css.icon }, slots.icon()),
      h('input', { ...attrs, ref: (element: Element | ComponentPublicInstance | null) => { props.elementRef?.(element instanceof HTMLInputElement ? element : null) }, class: [css.input, attrs.class] }),
    ])
  },
})
