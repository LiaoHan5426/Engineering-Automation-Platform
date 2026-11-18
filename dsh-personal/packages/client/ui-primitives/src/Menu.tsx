import { nextTick, computed, defineComponent, h, shallowRef, watch, useId, Teleport } from 'vue'
import type { PropType, Ref, VNodeChild } from 'vue'
import clsx from 'clsx'
import { useMenuSubmenu, menuHoverAllowed } from './useMenuSubmenu.ts'
import { MenuRow, menuIconColumns, renderMenuDecoration } from './MenuRow.tsx'
import { SubmenuPanel } from './SubmenuPanel.tsx'
import { usePointerGrace } from './pointer-grace.ts'
import { isBehindModal } from './useModalLayer.ts'
import { observeComposition } from './keyboard-composition.ts'
import { focusWithoutRing } from './focus.ts'
import { MenuSurface } from './MenuSurface.tsx'
import css from './Menu.module.css'
/** Selectable row (optionally with a nested submenu). */
export interface MenuItem {
  id: string
  label: VNodeChild
  disabled?: boolean
  /** Effective binding supplied by the command owner; omitted for unbound actions. */
  shortcut?: {
    keys: readonly string[]
    aria?: string | undefined
  }
  /** Leading icon (figma .Menu_cell gap 8). */
  icon?: VNodeChild
  /** Destructive row: error-colored text/icon and danger hover fill. */
  danger?: boolean
  /** Child choices opened by hover, focus, click, or ArrowRight; placement follows available space. */
  submenu?: readonly MenuEntry[]
}
/** Hairline between item groups (not selectable). */
export interface MenuSeparator {
  type: 'separator'
  id: string
}
/** Non-interactive heading row above a group of items. */
export interface MenuLabel {
  type: 'label'
  id: string
  text: string
}
/** One primary-menu entry: a row, a separator, or a heading label. */
export type MenuEntry = MenuItem | MenuSeparator | MenuLabel
/** Props for one component-rendered menu row. */
export interface MenuItemButtonProps {
  /** Visible row label. */
  /** Effective binding supplied by the command owner; omitted for unbound actions. */
  shortcut?: MenuItem['shortcut']
  /** Leading icon (figma .Menu_cell gap 8). */
  icon?: VNodeChild
  /** Whether this row identifies the currently displayed page or view. */
  current?: boolean
  /** Whether the row cannot be activated. */
  disabled?: boolean
  /**
     * Why the disabled row cannot be activated. The row then stays hoverable and
     * focusable, shows the reason in a tooltip, and exposes it as the row's
     * description; an enabled row ignores it.
     */
  disabledReason?: string | undefined
  /** Destructive row: error-colored text/icon and danger hover fill. */
  danger?: boolean
  /**
     * Start a new group: a hairline above this row, the same one a
     * `{ type: 'separator' }` data entry draws. It comes and goes with the row,
     * so a row that renders nothing leaves no stray line; a data separator
     * directly before it draws no second line, and the list's first row draws none.
     */
  separatorBefore?: boolean
  /** Row activation (click, Enter, or Tab on the focused row). */
  onSelect: () => void
}
/**
 * Render one `role="menuitem"` row for a {@link Menu} whose rows are
 * components rather than `items` data: the same markup and styling as a data
 * row, so it joins the list's keyboard walk and post-selection focus return
 * without any shared state. Closing the menu stays the owner's decision, as
 * it is for data rows.
 * @param props.children - visible row label.
 * @param props.shortcut - effective key labels and accessible combination.
 * @param props.icon - optional leading icon.
 * @param props.current - whether the row identifies the currently displayed page or view.
 * @param props.disabled - whether the row cannot be activated.
 * @param props.disabledReason - why a disabled row cannot be activated, shown in a tooltip and read as its description.
 * @param props.danger - whether to use the destructive row colors.
 * @param props.separatorBefore - whether this row starts a new group (hairline above it).
 * @param props.onSelect - row activation callback.
 * @returns one menu-item row.
 */
export const MenuItemButton = defineComponent({ name: 'MenuItemButton', inheritAttrs: false, props: { onSelect: { type: Function as PropType<() => void>, required: true } }, setup(props, { attrs, slots }) { return () => h(MenuRow, { ...attrs, decorativeIcon: false, onClick: props.onSelect }, slots) } })
/**
 * Render an anchored dropdown menu. While the list is open its keys mirror the
 * composer's: Tab settles the focused row — from the trigger, Tab enters the
 * list instead — and Escape or Shift+Tab close it and return focus to the
 * anchor's first button, and selecting a row does the same — the rows unmount
 * with the list. Only a keyboard on the trigger or inside the list is
 * intercepted; Tab presses elsewhere on the page stay the browser's. Escape
 * first returns from a visible child, while ArrowRight enters and ArrowLeft returns.
 * When neither side fits, click or ArrowRight opens a single-panel child page;
 * focus alone retains the parent page.
 * @param props.contextual - cursor positioning, context dismissal, and per-divider icon alignment.
 * @param props.exiting - retain an inert popup during dismissal or replacement fade.
 * @param props.returnFocus - original control captured before asynchronous menu preparation.
 * @param props.isExternalTrigger - recognizes external controls whose pointer presses should not dismiss;
 * omitted, every press outside the anchor and menu panels dismisses.
 * @param props.autoFocus - focus the first item on open; the arrow keys walk the list either way.
 * @param props.open - whether the list is showing (owner-controlled).
 * @param props.anchor - the trigger element (rendered in place).
 * @param props.items - selectable data rows and optional separators (default none; with no `children` either, the list is empty).
 * @param props.submenuBackLabel - localized single-panel return label; omitted uses the caller's
 * parent-row label beside a back arrow, without selecting that row.
 * @param props.selectedId - row shown as selected.
 * @param props.selectedIds - rows shown as selected when a menu contains independent option groups.
 * @param props.onSelect - data-row activation callback (not called for disabled rows or submenu parents that only open children).
 * @param props.onClose - invoked on outside click, Escape, or a window blur
 * that moved focus into an iframe (the only signal a pointerdown inside a
 * cross-origin iframe leaves).
 * @param props.align - list alignment against the anchor (default 'start').
 * @param props.side - open below (`bottom`, default) or above (`top`) the anchor.
 * @param props.portal - render the list into document.body, fixed-positioned
 * with CSS anchor positioning; it follows browser zoom and may exceed the
 * visual viewport. Use when an ancestor's overflow clipping would crop the
 * in-place list; default false keeps the pure-CSS in-place behavior.
 * @param props.closeOnPointerLeave - close the list once the pointer has left
 * both trigger and list for the pointer grace (default false keeps it open
 * until outside click/Escape/selection). The grace makes the 4px trigger->list
 * gap and a brief overshoot survivable; coming back cancels the close.
 * @param props.dense - reduce vertical row spacing without changing the standard typography or card width.
 * @param props.compact - use reduced menu typography and spacing.
 * @param props.anchorRef - external element used as the CSS anchor in portal mode.
 * @param props.anchorPoint - client viewport coordinates captured when a context menu opens.
 * @param props.minWidthFromAnchor - in portal mode, keep the menu at least as wide as its anchor, bounded by viewport margins.
 * @param props.footer - rows pinned below the scrolling items area, separated
 * by a hairline; contextual menus reuse an explicit leading separator. These rows stay visible while the items above scroll.
 * @param props.children - component rows rendered after `items` in the same
 * list, each a `role="menuitem"` button such as {@link MenuItemButton}; they
 * share the keyboard walk, the submenu exclusivity, and the post-selection
 * focus return.
 * @param props.selection - how a selected row is marked: a trailing check
 * (`'check'`, default — figma .Menu_cell) or the hover fill held on the row
 * with no check (`'fill'`, for icon-labelled rows where a trailing glyph
 * crowds the cell).
 * @param props.className - extra class on the anchor wrapper span.
 * @param props.listClassName - extra class on the dropdown card itself; the
 * only style hook that reaches a portaled list, which renders under
 * document.body outside the owner's DOM subtree.
 * @returns anchor wrapper with the conditional list.
 */
export const Menu = defineComponent({ name: 'Menu', props: { open: { type: Boolean, required: true }, items: { type: Array as PropType<readonly MenuEntry[]>, default: () => [] }, footer: Array as PropType<readonly MenuEntry[]>, submenuBackLabel: String, selectedId: String, selectedIds: Array as PropType<readonly string[]>, onSelect: Function as PropType<(id: string) => void>, onClose: { type: Function as PropType<() => void>, required: true }, align: { type: String as PropType<'start' | 'end'>, default: 'start' }, side: { type: String as PropType<'bottom' | 'top' | 'right'>, default: 'bottom' }, portal: Boolean, closeOnPointerLeave: Boolean, dense: Boolean, compact: Boolean, autoFocus: Boolean, selection: { type: String as PropType<'check' | 'fill'>, default: 'check' }, anchorRef: Object as PropType<Readonly<Ref<HTMLElement | null>>>, anchorPoint: Object as PropType<{
  readonly x: number
  readonly y: number
}>, minWidthFromAnchor: Boolean, className: String, listClassName: String, contextual: Boolean, exiting: String as PropType<'dismiss' | 'replace'>, returnFocus: Function as PropType<() => HTMLElement | null>, isExternalTrigger: Function as PropType<(node: Node) => boolean> }, setup(props, { slots }) {
  const rootRef = shallowRef<HTMLSpanElement | null>(null)
  const listRef = shallowRef<HTMLDivElement | null>(null)
  const menuId = useId()
  const pointX = computed(() => props.anchorPoint?.x)
  const pointY = computed(() => props.anchorPoint?.y)
  const point = computed(() => {
    if (pointX.value === undefined || pointY.value === undefined)
      return undefined
    // WebKit reports client coordinates from the visual origin; fixed CSS uses
    // the layout origin. Subsequent panning must not move this captured point.value.
    const visualOrigin = props.open && typeof window.CSS !== 'undefined'
                && window.CSS.supports('-webkit-backdrop-filter', 'none')
    const viewport = visualOrigin ? window.visualViewport : undefined
    return { x: pointX.value + (viewport?.offsetLeft ?? 0), y: pointY.value + (viewport?.offsetTop ?? 0) }
  })
  watch([() => props.open, () => props.contextual, () => props.portal, () => props.returnFocus, () =>
    props.anchorRef?.value, () => rootRef.value, () => listRef.value], (_v, _p, onCleanup) => {
    const dispose = (() => {
      const trigger = props.returnFocus?.() ?? props.anchorRef?.value ?? rootRef.value?.querySelector<HTMLElement>('button:not([role="menuitem"])')
      if (!props.open || (!props.contextual && !props.portal) || trigger == null)
        return
      const previous = trigger.getAttribute('aria-controls')
      trigger.setAttribute('aria-controls', [previous, menuId].filter(Boolean).join(' '))
      return () => {
        if (previous === null)
          trigger.removeAttribute('aria-controls')
        else
          trigger.setAttribute('aria-controls', previous)
      }
    })()
    if (typeof dispose === 'function')
      onCleanup(dispose)
  }, { immediate: true, flush: 'post' })
  /** Index the arrow walk last focused, the resume point when focus left the rows. */
  const walkIndex = shallowRef<number | null>(null)
  /**
         * The control that had the keyboard when this menu opened — its own trigger,
         * which an anchor that wraps several controls (a split button) would not be
         * able to name by position.
         */
  const triggerRef = shallowRef<HTMLElement | null>(null)
  const selectingWithTab = shallowRef(false)
  /**
         * Hand the keyboard back to the trigger that opened the menu — or, when the
         * anchor never held it, to the anchor's first button. Focus left on a removed
         * row otherwise falls to the page body, where the next Tab restarts from the
         * top of the page.
         * @param navigation - whether explicit keyboard traversal should retain its focus indicator.
         */
  const refocusAnchor = (navigation = false): void => {
    const remembered = triggerRef.value
    const trigger = props.returnFocus?.() ?? (remembered?.isConnected ? remembered : props.anchorRef?.value) ?? null
    const target = trigger !== null && document.contains(trigger) && !(trigger as HTMLButtonElement).disabled
      ? trigger : rootRef.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    if (target == null)
      return
    if (navigation)
      target.focus()
    else
      focusWithoutRing(target)
  }
  /**
         * Post-selection focus, for the paths where the rows unmount with the list.
         * A selection whose owner keeps the menu open is left alone, and so is an
         * owner that moved focus itself (a presented file card hands it to its
         * preview button): only a keyboard left on the closing list (or on the body
         * its removal produced) comes back to the trigger.
         */
  const refocusAfterSelection = (): void => {
    const navigation = selectingWithTab.value
    void nextTick(() => {
      if (props.open && props.exiting === undefined)
        return
      const active = document.activeElement
      if (active === null || active === document.body || listRef.value?.contains(active) === true
                    || submenu.contains(active))
        refocusAnchor(navigation)
    })
  }
  const submenu = useMenuSubmenu(() => ({ open: props.open && props.exiting === undefined, items: props.items,
    footer: props.footer, listRef, refocusAnchor }))
  const submenuEvents = shallowRef<Pick<typeof submenu, 'contains' | 'activeList' | 'returnToParent'>>(submenu)
  submenuEvents.value = submenu
  const anchorName = `--dsh-menu-trigger-${menuId.replaceAll(':', '')}`
  const externalAnchor = shallowRef<HTMLElement | null>(null)
  const positioned = computed(() => !props.portal || props.anchorRef === undefined || externalAnchor.value !== null)
  // External refs can attach after this component or replace their element
  // without changing ref identity. Publish the anchor after all refs commit.
  watch([() => props.open, () => props.portal, () => rootRef.value, () => listRef.value, () =>
    props.anchorRef?.value], (_v, _p, onCleanup) => {
    const dispose = (() => {
      if (!props.open || !props.portal || props.anchorRef === undefined) {
        externalAnchor.value = null
        return
      }
      const element = props.anchorRef.value
      externalAnchor.value = element
      if (element === null)
        return
      const previous = element.style.getPropertyValue('anchor-name')
      const priority = element.style.getPropertyPriority('anchor-name')
      element.style.setProperty('anchor-name', anchorName)
      return () => { element.style.setProperty('anchor-name', previous, priority) }
    })()
    if (typeof dispose === 'function')
      onCleanup(dispose)
  }, { immediate: true, flush: 'post' })
  watch([() => props.open, () => props.portal, () => props.exiting, () => props.anchorRef?.value, () =>
    externalAnchor.value, () => props.returnFocus, () => rootRef.value], (_v, _p, onCleanup) => {
    const dispose = (() => {
      if (!props.open || !props.portal || props.exiting !== undefined)
        return
      const currentAnchor = (): HTMLElement | null => props.returnFocus?.() ?? (
        props.anchorRef === undefined ? rootRef.value : props.anchorRef.value)
      const element = currentAnchor()
      if (element === null)
        return
      let dismissed = false
      const check = (): void => {
        const current = currentAnchor()
        if (dismissed || (current !== null && current.isConnected && current.closest('[inert], [hidden]') === null))
          return
        dismissed = true
        props.onClose()
      }
      const observer = new MutationObserver(check)
      observer.observe(element.ownerDocument.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['inert', 'hidden'],
      })
      check()
      return () => { observer.disconnect() }
    })()
    if (typeof dispose === 'function')
      onCleanup(dispose)
  }, { immediate: true, flush: 'post' })
  const { arm: armClose, cancel: cancelClose } = usePointerGrace(() => { props.onClose() })
  // Opening remembers where the keyboard was, so closing can hand it back to
  // that control — an anchor wrapping several (a split button) cannot be asked
  // for it by position. Declared before the autoFocus effect so the capture
  // sees the trigger, not the row autoFocus is about to focus.
  watch([() => props.open, () => rootRef.value], (_v, _p) => {
    (() => {
      if (!props.open)
        return
      const active = document.activeElement
      if (listRef.value?.contains(active) === true || submenu.contains(active)) return
      triggerRef.value = active instanceof HTMLElement && active !== document.body && (
        props.anchorRef !== undefined || props.anchorPoint !== undefined || rootRef.value?.contains(active) === true) ? active : null
    })()
  }, { immediate: true, flush: 'post' })
  watch([() => props.open, () => props.autoFocus, () => props.items.length, () => props.footer?.length, () =>
    positioned.value, () => props.exiting, () => listRef.value], (_v, _p) => {
    (() => {
      if (!props.open || !positioned.value || props.exiting !== undefined || !props.autoFocus ||
        listRef.value?.contains(document.activeElement) || submenu.contains(document.activeElement))
        return
      const first = listRef.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      walkIndex.value = first === undefined || first === null ? null : 0
      if (first != null)
        focusWithoutRing(first)
    })()
  }, { immediate: true, flush: 'post' })
  watch([() => props.open, () => props.onClose, () => props.autoFocus, () => props.contextual, () =>
    props.exiting, () => props.anchorRef, () => props.returnFocus, () => props.isExternalTrigger], (_v, _p, onCleanup) => {
    const dispose = (() => {
      if (!props.open || props.exiting !== undefined) {
        walkIndex.value = null
        return
      }
      const composition = observeComposition(document)
      const onPointerDown = (e: PointerEvent) => {
        if (!(e.target instanceof Node) || (props.contextual && e.button === 2))
          return
        if (rootRef.value?.contains(e.target) === true || props.anchorRef?.value?.contains(e.target) === true)
          return
        if (props.isExternalTrigger?.(e.target) === true)
          return
        if (listRef.value?.contains(e.target) === true || submenuEvents.value.contains(e.target))
          return
        props.onClose()
      }
      const onKeyDown = (e: KeyboardEvent) => {
        if (composition.guards(e) || isBehindModal(triggerRef.value ?? rootRef.value) || e.defaultPrevented ||
          e.ctrlKey || e.altKey || e.metaKey)
          return
        const focused = document.activeElement
        const insideList = listRef.value?.contains(focused) === true || submenuEvents.value.contains(focused)
        const anchored = focused === props.returnFocus?.() || props.anchorRef?.value?.contains(
          focused) === true || rootRef.value?.contains(focused) === true || insideList
        if (e.key === 'Escape' && !e.shiftKey) {
          e.preventDefault()
          if (e.repeat)
            return
          if (submenuEvents.value.returnToParent())
            return
          props.onClose()
          if (anchored || props.autoFocus)
            refocusAnchor()
        }
        if (e.key === 'ArrowLeft' && anchored && submenuEvents.value.returnToParent()) {
          e.preventDefault()
          return
        }
        if (e.key === 'ArrowRight' && insideList && focused instanceof HTMLButtonElement && focused.getAttribute('aria-haspopup') === 'menu') {
          e.preventDefault()
          focused.click()
          return
        }
        if (e.key === 'Tab') {
          const list = submenuEvents.value.activeList(focused)
          if (list === null || !anchored)
            return
          if (e.shiftKey) {
            e.preventDefault()
            props.onClose()
            refocusAnchor(true)
            return
          }
          if (insideList) {
            if (focused instanceof Element && focused.getAttribute('role') === 'menuitem') {
              e.preventDefault()
              if (focused.getAttribute('aria-disabled') === 'true') {
                props.onClose()
                refocusAnchor(true)
                return
              }
              selectingWithTab.value = true
              try {
                (focused as HTMLElement).click()
              }
              finally {
                selectingWithTab.value = false
              }
            }
            return
          }
          const row = list.querySelector<HTMLButtonElement>('button:not(:disabled)')
          if (row === null)
            return
          e.preventDefault()
          row.focus()
          walkIndex.value = 0
          return
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key))
          return
        const list = submenuEvents.value.activeList(focused)
        if (list === null || !anchored)
          return
        const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        if (buttons.length === 0)
          return
        const index = buttons.indexOf(focused as HTMLButtonElement)
        const from = index >= 0 ? index : walkIndex.value
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : from === null ? (e.key === 'ArrowDown' ? 0 : buttons.length - 1) : (from + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        e.preventDefault()
        walkIndex.value = next
        buttons[next]?.focus()
      }
      const onWindowBlur = () => {
        if (document.activeElement instanceof HTMLIFrameElement)
          props.onClose()
      }
      const onOtherTrigger = (event: MouseEvent): void => {
        const trigger = event.target instanceof Element ? event.target.closest('[aria-haspopup]') : null
        if (trigger === null || rootRef.value?.contains(trigger) === true || props.anchorRef?.value?.contains(trigger) === true) return
        if (props.isExternalTrigger?.(trigger) === true) return
        if (listRef.value?.contains(trigger) === true || submenuEvents.value.contains(trigger)) return
        props.onClose()
      }
      document.addEventListener('click', onOtherTrigger, true)
      document.addEventListener('pointerdown', onPointerDown)
      const onEscape = (event: KeyboardEvent): void => {
        if (event.key === 'Escape')
          onKeyDown(event)
      }
      const onOtherKey = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape')
          onKeyDown(event)
      }
      document.addEventListener('keydown', onOtherKey)
      document.addEventListener('keydown', onEscape, true)
      window.addEventListener('blur', onWindowBlur)
      return () => {
        composition.dispose()
        document.removeEventListener('click', onOtherTrigger, true)
        document.removeEventListener('pointerdown', onPointerDown)
        document.removeEventListener('keydown', onOtherKey)
        document.removeEventListener('keydown', onEscape, true)
        window.removeEventListener('blur', onWindowBlur)
      }
    })()
    if (typeof dispose === 'function')
      onCleanup(dispose)
  }, { immediate: true, flush: 'post' })
  watch([() => props.exiting, () => rootRef.value, () => listRef.value], (_v, _p) => {
    (() => {
      if (props.exiting === 'dismiss' && listRef.value?.contains(document.activeElement))
        refocusAnchor()
    })()
  }, { immediate: true, flush: 'post' })
  // A close from selection/Escape/outside click outruns a pending grace close;
  // left armed it would shut a list reopened inside the grace window. Its own
  // effect, not the listener effect above: that one re-runs on every `onClose`
  // identity change and would cancel the grace mid-transit.
  watch([() => props.open, () => cancelClose], (_v, _p) => {
    (() => {
      if (!props.open)
        cancelClose()
    })()
  }, { immediate: true, flush: 'post' })
  const itemColumns = computed(() => menuIconColumns(props.items, props.contextual))
  const footerColumns = computed(() => menuIconColumns(props.footer ?? [], props.contextual))
  const renderEntry = (entry: MenuEntry, columns: ReadonlySet<MenuEntry>) => {
    if ('type' in entry)
      return renderMenuDecoration(entry)
    const hasSub = entry.submenu !== undefined && entry.submenu.length > 0
    return h(MenuRow, { 'key': entry.id, 'icon': entry.icon, 'reserveIcon': columns.has(entry), 'disabled': entry.disabled === true, 'danger': entry.danger === true, 'shortcut': entry.shortcut, 'selected': entry.id === props.selectedId || props.selectedIds?.includes(entry.id) === true, 'selection': props.selection, 'aria-haspopup': hasSub ? 'menu' : undefined, 'aria-expanded': hasSub ? submenu.entry?.id === entry.id && !submenu.hidden : undefined, ...(hasSub ? { wrapperProps: {
      onPointerenter: (event: PointerEvent) => {
        if (!menuHoverAllowed(event) || entry.disabled)
          return
        const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget.querySelector<HTMLButtonElement>('button') : null
        if (trigger !== null)
          submenu.openChild(entry.id, trigger)
      },
      onPointerleave: (event: PointerEvent) => {
        if (menuHoverAllowed(event))
          submenu.leave()
      },
    } } : {}), 'onFocus': hasSub ? (event: FocusEvent) => { if (event.currentTarget instanceof HTMLButtonElement) submenu.focusParent(entry.id, event.currentTarget) } : undefined, 'onClick': (event: MouseEvent) => {
      if (hasSub && event.currentTarget instanceof HTMLButtonElement)
        submenu.openChild(entry.id, event.currentTarget, true)
      else
        props.onSelect?.(entry.id)
    } }, { default: () => [entry.label] })
  }
  return () => {
    const list = props.open && positioned.value && (h(MenuSurface, { 'compact': props.compact, 'id': menuId, 'elementRef': (element) => { listRef.value = element }, 'className': clsx(css.list, props.listClassName, props.dense && css.denseList, props.compact && css.compactList, css.scrollable, submenu.page && css.parentPage, props.portal && css.portal, props.side === 'top' && !props.portal && css.sideTop, props.align === 'end' && !props.portal && css.alignEnd), ...(props.portal ? { style: { positionAnchor:anchorName } } : {}), 'data-anchor-side': props.portal ? props.side : undefined, 'data-anchor-align': props.portal ? props.align : undefined, 'data-match-anchor-width': props.portal && props.minWidthFromAnchor ? '' : undefined, 'role': props.exiting === undefined && !submenu.page ? 'menu' : undefined, 'aria-hidden': props.exiting === undefined && !submenu.page ? undefined : true, 'data-context-menu': props.contextual ? '' : undefined, ...(props.contextual ? { phase: props.exiting ?? 'enter' } : {}), 'onClick': (e: MouseEvent) => {
      e.stopPropagation()
      const row = e.target instanceof Element ? e.target.closest('button[role="menuitem"]') : null
      if (row !== null && row.getAttribute('aria-haspopup') !== 'menu')
        refocusAfterSelection()
    }, 'onContextmenu': props.contextual ? (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      props.onClose()
    } : undefined, 'onPointerover': (event: PointerEvent) => {
      if (menuHoverAllowed(event))
        submenu.collapseFrom(event)
    }, 'onFocusin': submenu.collapseFrom }, { default: () => [submenu.entry !== undefined && h('span', { 'aria-hidden': 'true', 'class': css.submenuAnchor, 'style': { anchorName: submenu.parentAnchor } }, undefined), h('div', { 'class': css.viewport, 'role': 'presentation' }, [props.items.map(entry => renderEntry(entry, itemColumns.value)), slots.default?.()]), props.footer !== undefined && props.footer.length > 0 && (h('div', { 'class': css.footer, 'role': 'presentation' }, [props.footer.map(entry => renderEntry(entry, footerColumns.value))]))] }))
    // Pointer grace lets the pointer cross the gap to the portaled list before dismissal.
    return (h('span', { 'ref': rootRef, 'class': clsx(css.root, props.className), 'style': { anchorName: props.anchorRef === undefined ? anchorName : undefined, ...(point.value === undefined ? {} : {
      position: 'fixed', left: `${point.value.x}px`, top: `${point.value.y}px`, width: 0, height: 0,
    }) }, 'onPointerenter': props.closeOnPointerLeave ? cancelClose : undefined, 'onPointerleave': props.closeOnPointerLeave ? (event: PointerEvent) => {
      if (props.open && menuHoverAllowed(event))
        armClose()
    } : undefined }, [slots.anchor?.(), props.portal ? (list !== false && h(Teleport, { to: document.body }, [list])) : list, props.open && props.exiting === undefined && submenu.entry !== undefined && h(SubmenuPanel, { 'key': submenu.entry.id, 'entry': submenu.entry, 'submenu': submenu, 'compact': props.compact, 'dense': props.dense, 'contextual': props.contextual, 'backLabel': props.submenuBackLabel ?? submenu.entry.label, 'onSelect': props.onSelect, 'onClose': props.onClose, 'afterSelection': refocusAfterSelection }, undefined)]))
  }
} })
