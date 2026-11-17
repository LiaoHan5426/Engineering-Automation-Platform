import { defineComponent, h, type VNodeChild } from 'vue'
import clsx from 'clsx'
import { Pill } from './Pill.tsx'
import css from './SegmentedTabs.module.css'

/** A tab links its localized label to a caller-owned panel. */
export interface SegmentedTab<Value extends string = string> {
  value: Value
  label: VNodeChild
  id: string
  panelId: string
}
/** Controlled tabs with wrapping keyboard selection and caller-owned panels. */
export const SegmentedTabs = defineComponent(<Value extends string>(props: {
  items: readonly [SegmentedTab<Value>, ...SegmentedTab<Value>[]]
  value: Value
  onChange: (value: Value) => void
  label: string
  className?: string | undefined
  size?: 'sm' | 'md' | undefined
}) => {
  const onKeydown = (event: KeyboardEvent, index: number): void => {
    let next: number
    switch (event.key) {
      case 'ArrowLeft': next = (index + props.items.length - 1) % props.items.length; break
      case 'ArrowRight': next = (index + 1) % props.items.length; break
      case 'Home': next = 0; break
      case 'End': next = props.items.length - 1; break
      default: return
    }
    event.preventDefault()
    event.stopPropagation()
    const tablist = event.currentTarget instanceof HTMLElement ? event.currentTarget.parentElement : null
    const nextItem = props.items[next]
    if (tablist === null || nextItem === undefined) return
    tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]').item(next).focus()
    props.onChange(nextItem.value)
  }
  return () => h('div', {
    role: 'tablist', 'data-size': props.size ?? 'md', 'aria-label': props.label, class: clsx(css.tabs, props.className),
    style: { gridTemplateColumns: `repeat(${props.items.length}, minmax(0, 1fr))` },
  }, [
    h('span', { class: css.indicator, 'aria-hidden': 'true', style: { width: `calc((100% - 2 * var(--segmented-tabs-inset)) / ${props.items.length})`, transform: `translateX(${props.items.findIndex(item => item.value === props.value) * 100}%)` } }),
    ...props.items.map((item, index) => h(Pill, {
      key: item.value, id: item.id, role: 'tab', className: clsx(css.tab), 'aria-selected': props.value === item.value,
      'aria-controls': item.panelId, tabindex: props.value === item.value ? 0 : -1,
      onClick: () => { props.onChange(item.value) }, onKeydown: (event: KeyboardEvent) => { onKeydown(event, index) },
    }, { default: () => item.label })),
  ])
}, { name: 'SegmentedTabs', inheritAttrs: false, props: ['items', 'value', 'onChange', 'label', 'className', 'size'] })
