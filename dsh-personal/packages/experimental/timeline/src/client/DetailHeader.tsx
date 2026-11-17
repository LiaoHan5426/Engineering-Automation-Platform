import { defineComponent, h } from 'vue'
import { Button, IconChevronLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
/** A compact back control sits beside the detail title in both task and report views. */
export const DetailHeader = defineComponent((props: {
  title: string
  back: () => void
} & PropsLocale<'timeline'>, { slots }) => {
  return () => {
    return (h('header', { 'class': 'timeline-detail-header' }, [
      h(Button, { 'className': 'timeline-icon-button', 'aria-label': props.t('back'), 'title': props.t('back'), 'data-detail-back': true, 'onClick': props.back }, { default: () => [
        h(IconChevronLeftOutlineRegular, { 'size': 18 }),
      ] }),
      h('h2', null, [
        props.title,
      ]),
      slots.default?.(),
    ]))
  }
}, { name: 'DetailHeader', inheritAttrs: false, props: ['title', 'back', 't'] })
