/**
 * Trigger candidate menu: renders the InputTriggerService menu store into the
 * conversation.input.overlay anchor. Closed state renders null (the overlay
 * slot stays mounted); groups render in roster order under localized title
 * rows. A pending group keeps showing the items it already had (the reducer
 * retains them across a query refinement) and falls back to two skeleton
 * rows only while it has none; pointer picks route back through
 * the service (combobox pattern — focus never leaves the textarea, so rows
 * are mousedown-handled and the highlight is exposed via
 * aria-activedescendant on the listbox). A row reads title, then the
 * command-name alias when the title is not the name in another letter case
 * (a localized title), then the description right-aligned. A source publishing crumbs gets a breadcrumb
 * header pinned above the scrolling list.
 */
import { MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives'
import { Fragment, h, defineComponent, shallowRef, watch, watchEffect } from 'vue'
import clsx from 'clsx'
import { IconChevronRightOutlineRegular, ReferenceIconRegular, useAnchoredMaxHeight } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './MenuView.module.css'
import type { MenuViewInjected } from './slots.ts'
import type { MenuKey } from './locales.ts'
/** Full menu props: injected face + the locale seat. */
export type MenuViewProps = MenuViewInjected & PropsLocale<'slash.menu'>
/** Height cap that fits the two headings and eight built-in command rows. */
const MAX_HEIGHT = 400
/**
 * Viewport top margin: the conversation header's 76px block (title row plus
 * view tabs, ui-conversation) plus 8px of air, so a tall list stops below the
 * header instead of sliding under it.
 */
const TOP_MARGIN = 84
/** DOM id of one option row (the aria-activedescendant target). */
function optionId(source: string, index: number): string {
  return `dsh-slash-option-${source}-${index}`
}
/**
 * Render the candidate menu overlay entry.
 * @param props - injected face (the menu store and the pick route); `t` rides the standard locale seat.
 * @returns the dropdown while open; null while closed.
 */
export const MenuView = defineComponent((props: MenuViewProps) => {
  const stateSeat = shallowRef(props.menu.getSnapshot())
  const crumbSeat = shallowRef(props.headers.getSnapshot())
  watchEffect((onCleanup) => {
    const store = props.menu
    stateSeat.value = store.getSnapshot()
    onCleanup(store.subscribe(() => { stateSeat.value = store.getSnapshot() }))
  })
  watchEffect((onCleanup) => {
    const store = props.headers
    crumbSeat.value = store.getSnapshot()
    onCleanup(store.subscribe(() => { crumbSeat.value = store.getSnapshot() }))
  })
  const listRef = shallowRef<HTMLDivElement | null>(null)
  const viewportRef = shallowRef<HTMLDivElement | null>(null)
  const overflow = shallowRef(false)
  const height = useAnchoredMaxHeight(listRef, MAX_HEIGHT, () => stateSeat.value, TOP_MARGIN)
  const updateOverflowHint = () => {
    const viewport = viewportRef.value
    overflow.value = viewport !== null && viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1
  }
  watch([stateSeat, height, viewportRef], updateOverflowHint, { flush: 'post' })
  watch([() => stateSeat.value.open ? stateSeat.value.highlight : null, listRef], ([highlight]) => {
    if (highlight !== null)
      document.getElementById(optionId(highlight.source, highlight.index))?.scrollIntoView({ block: 'nearest' })
  }, { flush: 'post' })
  watch(() => stateSeat.value.open, (open, _, onCleanup) => {
    if (!open)
      return
    const onPointerDown = (ev: PointerEvent) => {
      if (!(ev.target instanceof Node) || listRef.value?.contains(ev.target))
        return
      if (listRef.value?.closest('[data-composer-card]')?.contains(ev.target))
        return
      props.onDismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    onCleanup(() => { document.removeEventListener('pointerdown', onPointerDown, true) })
  }, { immediate: true })
  return () => {
    const { onPick, onCrumb, onHover, t } = props
    const state = stateSeat.value
    const crumbs = crumbSeat.value
    const highlight = state.open ? state.highlight : null
    const maxHeight = `${height.value}px`
    const hasOverflowBelow = overflow.value
    if (!state.open)
      return null
    return (h(MenuSurface, { 'elementRef': (element) => { listRef.value = element }, 'className': clsx(css.menu), 'style': { maxHeight }, 'data-trigger-menu': '', 'data-overflow-below': hasOverflowBelow || undefined }, { 'default': () => [state.groups.map((group) => {
      const trail = crumbs.get(group.source)
      return trail === undefined ? null : (h('nav', { 'key': group.source, 'class': css.crumbs, 'aria-label': t('crumbs.aria') }, [trail.map((crumb, index) => (h(Fragment, { 'key': `${String(index)}-${crumb.value}` }, [index > 0 && h('span', { 'class': css.crumbSeparator, 'aria-hidden': true }, [h(IconChevronRightOutlineRegular)]), h('button', { 'type': 'button', 'class': clsx(css.crumb, crumb.current === true && css.crumbCurrent), 'aria-current': crumb.current === true ? 'location' : undefined, 'disabled': crumb.current === true, 'onMousedown': (ev: MouseEvent) => {
        ev.preventDefault()
        if (crumb.current !== true) onCrumb(group.source, index)
      } }, [crumb.label])])))]))
    }), h('div', { 'ref': viewportRef, 'class': css.viewport, 'role': 'listbox', 'aria-label': t('suggestions.aria'), 'aria-activedescendant': highlight !== null ? optionId(highlight.source, highlight.index) : undefined, 'onScroll': updateOverflowHint }, [state.groups.map(group => (group.status === 'ready' && group.items.length === 0)
      ? null
      : (h(Fragment, { 'key': group.source }, [group.showGroupTitle === false || group.items.some(item => item.section !== undefined)
        ? null
        : h('div', { 'class': css.groupTitle, 'role': 'presentation', 'data-source': group.source }, [t(group.source as MenuKey)]), group.status === 'pending' && group.items.length === 0
        ? (h('div', { 'role': 'status', 'aria-label': t('loading'), 'data-source': group.source }, [h('div', { 'class': css.skeletonRow }, [h('span', { 'class': css.skeletonBar, 'style': { width: '32%' } })]), h('div', { 'class': css.skeletonRow }, [h('span', { 'class': css.skeletonBar, 'style': { width: '48%' } })])]))
        : group.items.map((item, index) => {
          const active = highlight !== null && highlight.source === group.source && highlight.index === index
          return (h(Fragment, { 'key': optionId(group.source, index) }, [item.section !== undefined && item.section !== group.items[index - 1]?.section
            ? h('div', { 'class': css.sectionTitle, 'role': 'presentation' }, [item.section]) : null, h('button', { 'id': optionId(group.source, index), 'type': 'button', 'role': 'option', 'aria-selected': active, 'class': clsx(css.item, active && css.active), 'onMousedown': (ev: MouseEvent) => {
            ev.preventDefault()
            onPick(group.source, index)
          }, 'onMousemove': active ? undefined : () => { onHover(group.source, index) } }, [item.icon !== undefined && (h('span', { 'class': css.itemIcon, 'aria-hidden': true }, [typeof item.icon === 'string'
            ? h(ReferenceIconRegular, { 'kind': item.icon, 'size': 14 }) : h(item.icon, { 'size': 14 })])), h('span', { 'class': css.itemName }, [item.label ?? item.name]), item.label !== undefined && item.label.toLowerCase() !== item.name.toLowerCase() && (h('span', { 'class': css.itemAlias }, [item.name])), item.description !== undefined && h('span', { 'class': css.itemDescription }, [item.description]), item.drill === true && (h('span', { 'class': css.trailing }, [h('span', { 'class': css.drillHintText, 'aria-hidden': true }, [t('drill.hint')]), h('kbd', { 'class': css.drillHint, 'aria-hidden': true }, [t('drill.key')]), h('span', { 'role': 'button', 'aria-label': t('drill.aria'), 'class': css.drill, 'onMousedown': (ev: MouseEvent) => {
            ev.preventDefault()
            ev.stopPropagation()
            onPick(group.source, index, 'drill')
          } }, [h(IconChevronRightOutlineRegular, { 'size': 12 })])]))])]))
        })])))])] }))
  }
}, { props: ['menu', 'headers', 'onPick', 'onCrumb', 'onHover', 'onDismiss', 't'] })
