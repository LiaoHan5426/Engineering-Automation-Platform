import { computed, shallowRef, watch, useId } from 'vue'
import type { Ref } from 'vue'
/** Owns one menu's child layout mode, pointer grace, and focus transitions. */
import type { MenuEntry, MenuItem } from './Menu.tsx'
import { submenuNeedsPage } from './menu-submenu-position.ts'
import { usePointerGrace } from './pointer-grace.ts'

/** Whether a pointer event can request hover interactions.
 * @param event - current pointer, including mixed-input touch events.
 * @returns true for non-touch input with an available hover device.
 */
export function menuHoverAllowed(event: { pointerType: string }): boolean {
  return event.pointerType !== 'touch' && window.matchMedia('(any-hover: hover)').matches
}

interface MenuSubmenu {
  entry: (MenuItem & { submenu: readonly MenuEntry[] }) | undefined
  panelRef: Ref<HTMLDivElement | null>
  /** CSS anchor name of the root card's anchor box; the child card is placed against it. */
  parentAnchor: string
  /** Whether the layout mode for the current child is known; the card stays hidden until it is. */
  measured: boolean
  page: boolean
  hidden: boolean
  contains: (node: Node | null) => boolean
  activeList: (focused: Node | null) => HTMLDivElement | null
  /** Returns false when no visible child can handle the navigation. */
  returnToParent: () => boolean
  openChild: (id: string, target: HTMLButtonElement, enter?: boolean) => void
  focusParent: (id: string, target: HTMLButtonElement) => void
  leave: () => void
  cancelClose: () => void
  collapseFrom: (event: Event) => void
}

/** Manage a single child card without owning the root menu's document listeners.
 * @param read - getter for current entries, root lifetime, and fallback focus destination.
 * @returns child rendering data and narrow interaction operations.
 */
export function useMenuSubmenu(read: () => {
  open: boolean
  items: readonly MenuEntry[]
  footer: readonly MenuEntry[] | undefined
  listRef: Ref<HTMLDivElement | null>
  refocusAnchor: () => void
}): MenuSubmenu {
  const props = computed(read)
  const expanded = shallowRef<{
    id: string
    trigger: HTMLButtonElement
    activated: boolean
  } | null>(null)
  const panelRef = shallowRef<HTMLDivElement | null>(null)
  // A DOM target suppresses its focus-props.value.open handler until focus restoration completes.
  const pendingFocus = shallowRef<'child' | HTMLButtonElement | null>(null)
  const entry = computed(() => [...props.value.items, ...(props.value.footer ?? [])].find((item): item is MenuItem & {
    submenu: readonly MenuEntry[]
  } => !('type' in item) && item.id === expanded.value?.id && item.disabled !== true
    && item.submenu !== undefined && item.submenu.length > 0))
  const trigger = computed(() => expanded.value?.trigger ?? null)
  const anchorId = useId().replaceAll(':', '')
  const parentAnchor = `--dsh-submenu-parent-${anchorId}`
  // Null until the active child has been measured against the layout viewport.
  const needsPage = shallowRef<boolean | null>(null)
  const contains = (node: Node | null): boolean => panelRef.value?.contains(node) === true
  const invalidated = computed(() => expanded.value !== null && entry.value === undefined)
  // Capture ownership before a changed entry or layout removes the focused DOM node.
  const ownedFocus = shallowRef(false)
  const backWasFocused = shallowRef(false)
  watch(() => invalidated.value, (invalid) => {
    if (invalid) ownedFocus.value = contains(document.activeElement) || trigger.value === document.activeElement
  }, { flush: 'sync' })
  watch(() => needsPage.value, () => {
    const active = document.activeElement
    backWasFocused.value = contains(active) && active?.hasAttribute('data-menu-back') === true
  }, { flush: 'sync' })
  const restoreInvalidatedFocus = computed(() => props.value.open && invalidated.value && ownedFocus.value)
  const measured = computed(() => needsPage.value !== null)
  const page = computed(() => entry.value !== undefined && expanded.value?.activated === true && needsPage.value === true)
  const hidden = computed(() => !measured.value || (needsPage.value === true && !page.value))
  // CSS anchors place the card against the parent card. JavaScript selects the layout and
  // supplies two lengths: the card's natural height and the active row's offset from the
  // parent card's top. Both are relative sizes, so page zoom and panning leave them valid.
  const visible = computed(() => props.value.open && entry.value !== undefined)
  watch([() => visible.value, () => entry.value, () => trigger.value, () => props.value.listRef, () =>
    panelRef.value], (_v, _p, onCleanup) => { const dispose = (() => {
    const panel = panelRef.value
    const parent = props.value.listRef.value
    if (!visible.value || panel === null || parent === null || trigger.value === null) {
      needsPage.value = null
      return
    }
    const rowTrigger = trigger.value
    const measureRow = (): void => {
      panel.style.setProperty('--dsh-submenu-row-offset', `${rowTrigger.getBoundingClientRect().top - parent.getBoundingClientRect().top}px`)
    }
    const measure = (): void => {
      const layout = panel.getAttribute('data-submenu-layout')
      panel.removeAttribute('data-submenu-layout')
      const width = panel.offsetWidth
      panel.style.setProperty('--dsh-submenu-height', `${panel.offsetHeight}px`)
      if (layout !== null)
        panel.setAttribute('data-submenu-layout', layout)
      measureRow()
      const viewport = document.documentElement.clientWidth || window.innerWidth
      needsPage.value = submenuNeedsPage(parent.getBoundingClientRect(), width, viewport)
    }
    measure()
    window.addEventListener('resize', measure)
    parent.addEventListener('scroll', measureRow, true)
    const observer = new ResizeObserver(measure)
    for (const element of [parent, trigger.value, panel])
      observer.observe(element)
    return () => {
      window.removeEventListener('resize', measure)
      parent.removeEventListener('scroll', measureRow, true)
      observer.disconnect()
    }
  })(); if (typeof dispose === 'function')
    onCleanup(dispose) }, { immediate: true, flush: 'post' })
  const focusFirstChild = (): void => {
    const panel = panelRef.value
    const first = panel?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled):not([data-menu-back])')
        ?? panel?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    first?.focus()
  }
  const returnToParent = (): void => {
    cancelClose()
    pendingFocus.value = trigger.value
    expanded.value = null
  }
  const collapse = (): void => {
    cancelClose()
    if (contains(document.activeElement))
      returnToParent()
    else
      expanded.value = null
  }
  const { arm: armClose, cancel: cancelClose } = usePointerGrace(() => { if (!page.value)
    collapse() })
  const openChild = (id: string, target: HTMLButtonElement, enter = false): void => {
    cancelClose()
    if (trigger.value !== target && contains(document.activeElement)) {
      pendingFocus.value = target
      target.focus()
      pendingFocus.value = null
    }
    pendingFocus.value = enter ? 'child' : null
    expanded.value = (current => current?.id === id
      ? enter && !current.activated ? { ...current, activated: true } : current
      : { id, trigger: target, activated: enter })(expanded.value)
    if (enter)
      focusFirstChild()
  }
  watch([() => props.value.open, () => entry.value, () => needsPage.value, () => page.value, () => hidden.value, (
  ) => invalidated.value, () => restoreInvalidatedFocus.value, () => backWasFocused.value, () => cancelClose, () =>
    panelRef.value], () => {
    if (!props.value.open || invalidated.value) {
      cancelClose()
      pendingFocus.value = null
      const previousTrigger = trigger.value
      const restoreFocus = restoreInvalidatedFocus.value
      expanded.value = null
      if (restoreFocus && (document.activeElement === document.body || document.activeElement === previousTrigger)) {
        const target = previousTrigger?.isConnected === true && !previousTrigger.disabled ? previousTrigger : props.value.listRef.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        pendingFocus.value = target ?? null
        if (target != null)
          target.focus()
        else
          props.value.refocusAnchor()
        pendingFocus.value = null
      }
      return
    }
    if (entry.value === undefined && pendingFocus.value instanceof HTMLButtonElement) {
      pendingFocus.value.focus()
      pendingFocus.value = null
    }
    if (entry.value === undefined || hidden.value)
      return
    if (pendingFocus.value === 'child' || (page.value && props.value.listRef.value?.contains(document.activeElement)) || (!page.value && backWasFocused.value)) {
      focusFirstChild()
      pendingFocus.value = null
    }
  }, { immediate: true, flush: 'post' })
  const collapseFrom = (event: Event): void => {
    // Native text-node targets belong to their containing menu row.
    const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
    const row = target?.closest('button[role="menuitem"]') ?? null
    if (row === null || row.getAttribute('aria-haspopup') === 'menu')
      return
    if (row.closest('[role="menu"]') === event.currentTarget)
      collapse()
  }
  return {
    get entry() { return entry.value },
    panelRef, parentAnchor,
    get measured() { return measured.value },
    get page() { return page.value },
    get hidden() { return hidden.value },
    contains,
    activeList: (focused: Node | null) => page.value || contains(focused) ? panelRef.value : props.value.listRef.value,
    returnToParent: (): boolean => {
      if (entry.value === undefined || hidden.value)
        return false
      returnToParent()
      return true
    },
    openChild,
    focusParent: (id: string, target: HTMLButtonElement): void => {
      if (pendingFocus.value !== target)
        openChild(id, target)
    },
    leave: (): void => { if (!page.value)
      armClose() },
    cancelClose,
    collapseFrom,
  }

}
