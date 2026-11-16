/** Capsule that becomes a native button when given an onClick listener. */
import { defineComponent, h, type PropType } from 'vue'
import clsx from 'clsx'
import css from './Pill.module.css'

/** Default slot supplies localized content; native button attributes apply only to interactive pills. */
export const Pill = defineComponent({
  name: 'Pill',
  inheritAttrs: false,
  props: {
    active: Boolean,
    className: String,
    onClick: Function as PropType<(event: MouseEvent) => void>,
  },
  setup(props, { attrs, slots }) {
    return () => h(props.onClick ? 'button' : 'span', {
      ...(props.onClick ? { type: 'button', ...attrs, onClick: props.onClick } : {}),
      class: [clsx(css.pill, props.onClick && css.interactive, props.active && css.active, props.className), attrs.class],
    }, slots.default?.())
  },
})
