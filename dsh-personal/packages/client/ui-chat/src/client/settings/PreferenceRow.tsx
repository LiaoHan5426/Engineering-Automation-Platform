/** Localized two-column selector shared by Chat preference rows. */
import { defineComponent, h, ref, shallowRef } from 'vue'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './PreferenceRow.module.css'

interface PreferenceRowProps {
  title: string
  description: string
  value: string
  selectedLabel: string
  options: readonly { id: string; label: string }[]
  onSelect: (value: string) => void
}

/** Selection restores focus before publishing the new value. */
export const PreferenceRow = defineComponent((props: PreferenceRowProps) => {
  const open = ref(false)
  const selector = shallowRef<HTMLButtonElement | null>(null)
  const close = () => { open.value = false }
  const select = (id: string) => {
    selector.value?.focus({ preventScroll: true })
    close()
    props.onSelect(id)
  }
  return () => h('div', { class: css.row }, [
    h('div', { class: css.rowText }, [
      h('div', { class: css.title }, props.title),
      h('div', { class: css.desc }, props.description),
    ]),
    h(Menu, { open: open.value, onClose: close, items: props.options, selectedId: props.value,
      onSelect: select, align: 'end', portal: true }, {
      anchor: () => h('button', { ref: selector, type: 'button', class: css.selector,
        'aria-haspopup': 'menu', 'aria-expanded': open.value,
        onClick: () => { open.value = !open.value } }, [
        props.selectedLabel, h(IconChevronDownOutlineRegular, { className: css.chevron ?? '' }),
      ]),
    }),
  ])
}, { name: 'PreferenceRow', inheritAttrs: false,
  props: ['title', 'description', 'value', 'selectedLabel', 'options', 'onSelect'] })
