/** Shared user-message background, typography, and content inset. */
import { defineComponent, h, type HTMLAttributes } from 'vue'
import clsx from 'clsx'
import css from './UserMessageBubble.module.css'

/** Native div attributes for user-authored message content. */
export type UserMessageBubbleProps = HTMLAttributes & { readonly className?: string }

/** Theme-aware message surface with caller-owned default-slot content. */
export const UserMessageBubble = defineComponent({
  name: 'UserMessageBubble',
  inheritAttrs: false,
  props: { className: String },
  setup(props, { attrs, slots }) {
    return () => h('div', { ...attrs, class: clsx(css.bubble, props.className, attrs.class) }, slots.default?.())
  },
})
