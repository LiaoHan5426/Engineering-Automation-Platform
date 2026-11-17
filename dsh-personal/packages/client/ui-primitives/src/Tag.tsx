// Tag: read-only capsule badge. The selectable capsule button is `Pill` —
// a tag takes no `onClick` and no `active`, and carries no copy of its own.

import { defineComponent, h, type PropType } from 'vue'
import clsx from 'clsx'
import css from './Tag.module.css'

/** Palette selector; each tone names one shipped appearance. */
export type TagTone =
  /** Hairline outline on tertiary text: the read-only default. */
  | 'outline'
  /** Inverted fill: one tag per group that names the current selection. */
  | 'solid'
  /** Platform-gray fill: a neutral fact with no status meaning. */
  | 'neutral'
  /** Text only, no fill: a fact stated more quietly than `neutral`. */
  | 'quiet'
  /** Tinted green: a healthy or enabled state. */
  | 'success'
  /** Tinted blue: informational classification, not health. */
  | 'info'
  /** Tinted amber: attention needed, not yet a failure. */
  | 'warning'
  /** Tinted red: a failure. */
  | 'danger'

/** Read-only localized default-slot content with a palette selected by tone. */
export const Tag = defineComponent({
  name: 'Tag',
  inheritAttrs: false,
  props: {
    tone: { type: String as PropType<TagTone>, default: 'outline' },
    className: String,
  },
  setup(props, { slots }) {
    return () => h('span', { class: clsx(css.tag, props.className), 'data-tone': props.tone }, slots.default?.())
  },
})
