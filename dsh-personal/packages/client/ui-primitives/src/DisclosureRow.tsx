import { defineComponent, h, type VNodeChild } from 'vue'
import clsx from 'clsx'
import { IconChevronDownOutlineRegular, IconChevronUpOutlineRegular } from './icons/index.tsx'
import { TextShimmer } from './TextShimmer.tsx'
import css from './DisclosureRow.module.css'

/** Shared process row; expanded content is supplied through the default slot. */
export interface DisclosureRowProps {
  icon: VNodeChild
  title: string
  open: boolean
  expandable: boolean
  onToggle: () => void
  running?: boolean | undefined
  expandOnRowClick?: boolean | undefined
  previewChevron?: boolean | undefined
  keepContentWhenOpen?: boolean | undefined
  collapsedContent?: VNodeChild
  headerAccessory?: VNodeChild
  className?: string | undefined
  rowClassName?: string | undefined
  contentClassName?: string | undefined
  contentLayoutClassName?: string | undefined
  leadingClassName?: string | undefined
  chevronClassName?: string | undefined
  titleClassName?: string | undefined
}
/** Render a controlled disclosure with an independent accessory and inert shimmer copies. */
export const DisclosureRow = defineComponent((props: DisclosureRowProps, { slots }) => () => {
  const rowExpands = props.expandable && props.expandOnRowClick === true
  const collapsedLeading = (props.previewChevron ?? props.expandable)
    ? [h('span', { class: css.iconIdle }, [props.icon]), h(IconChevronDownOutlineRegular, { className: clsx(props.chevronClassName, css.chevronHover) })]
    : props.icon
  const leading = props.open ? h(IconChevronUpOutlineRegular, { className: props.chevronClassName ?? '' }) : collapsedLeading
  const toggleFromKeyboard = (event: KeyboardEvent): void => {
    if (!rowExpands || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    props.onToggle()
  }
  return h('div', { class: clsx(css.root, props.className), 'data-open': props.open || undefined }, [
    h('div', { class: css.header, 'data-disclosure-header': true, 'data-has-accessory': !!props.headerAccessory || undefined }, [
      h('div', {
        class: clsx(css.row, props.rowClassName), 'data-disclosure-row': true, 'data-expandable': rowExpands || undefined,
        role: rowExpands ? 'button' : undefined, tabindex: rowExpands ? 0 : undefined, 'aria-expanded': rowExpands ? props.open : undefined,
        onClick: rowExpands ? () => { props.onToggle() } : undefined, onKeydown: rowExpands ? toggleFromKeyboard : undefined,
      }, [
        props.expandable && !rowExpands
          ? h('button', { type: 'button', class: clsx(css.leading, props.leadingClassName), 'aria-label': props.title, 'aria-expanded': props.open, onClick: (event: MouseEvent) => { event.stopPropagation(); props.onToggle() } }, [leading])
          : h('span', { class: clsx(css.leading, props.leadingClassName) }, [leading]),
        h(TextShimmer, { active: props.running ?? false, className: props.contentClassName ?? '', contentClassName: props.contentLayoutClassName ?? '' }, {
          default: () => [h(TextShimmer, { className: clsx(css.title, props.titleClassName) }, { default: () =>
            props.title }), (props.keepContentWhenOpen || !props.open) ? props.collapsedContent : null],
        }),
      ]),
      props.headerAccessory,
    ]),
    props.open ? slots.default?.() : null,
  ])
}, { name: 'DisclosureRow', inheritAttrs: false, props: ['icon', 'title', 'open', 'expandable', 'onToggle', 'running', 'expandOnRowClick', 'previewChevron', 'keepContentWhenOpen', 'collapsedContent', 'headerAccessory', 'className', 'rowClassName', 'contentClassName', 'contentLayoutClassName', 'leadingClassName', 'chevronClassName', 'titleClassName'] })
