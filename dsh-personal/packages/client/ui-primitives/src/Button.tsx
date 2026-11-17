/** Token-styled native button with default content and an optional icon slot. */
import { defineComponent, h, type ComponentPublicInstance, type PropType } from 'vue'
import clsx from 'clsx'
import css from './Button.module.css'

/** Visual family backed by the corresponding button tokens. */
export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'

/** Native attributes and listeners reach the button; elementRef receives its element and null on disposal. */
export const Button = defineComponent({
  name: 'Button',
  inheritAttrs: false,
  props: {
    variant: { type: String as PropType<ButtonVariant>, default: 'ghost' },
    size: { type: String as PropType<'md' | 'sm'>, default: 'md' },
    className: String,
    elementRef: Function as PropType<(element: HTMLButtonElement | null) => void>,
  },
  setup(props, { attrs, slots }) {
    return () => h('button', {
      type: 'button', ...attrs, ref: (element: Element | ComponentPublicInstance | null) => { props.elementRef?.(element instanceof HTMLButtonElement ? element : null) },
      class: [clsx(css.button, css[props.variant], css[props.size], props.className), attrs.class],
    }, [slots.icon && h('span', { class: css.icon }, slots.icon()), slots.default?.()])
  },
})
