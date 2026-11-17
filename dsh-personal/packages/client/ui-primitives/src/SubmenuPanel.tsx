import { h, Teleport, Fragment } from 'vue'
import type { CSSProperties, VNodeChild } from 'vue'
/** Portaled child menu presentation; interaction state belongs to useMenuSubmenu. */
import clsx from 'clsx'
import { menuHoverAllowed, type useMenuSubmenu } from './useMenuSubmenu.ts'
import { menuIconColumns, MenuRow, renderMenuDecoration } from './MenuRow.tsx'
import { IconChevronLeftOutlineRegular } from './icons/index.tsx'
import { MenuSurface } from './MenuSurface.tsx'
import css from './Menu.module.css'
/** Name the parent card anchor, and hide the child card until its layout is known. */
function anchors(submenu: ReturnType<typeof useMenuSubmenu>, hidden: boolean): CSSProperties & Record<`--dsh-submenu-${string}`, string> {
  return { '--dsh-submenu-parent': submenu.parentAnchor, ...hidden ? { visibility: 'hidden' } : {} }
}
/** Render one child list with a non-selecting back row in single-page placement.
 * @param props - active entry, submenu operations, and shared row presentation options.
 * @returns a body portal that preserves child DOM identity across placement changes.
 */
export function SubmenuPanel({ entry, submenu, compact, dense, contextual, backLabel, onSelect, onClose, afterSelection }: {
  entry: NonNullable<ReturnType<typeof useMenuSubmenu>['entry']>
  submenu: ReturnType<typeof useMenuSubmenu>
  compact: boolean
  dense: boolean
  contextual: boolean
  backLabel: VNodeChild
  onSelect: ((id: string) => void) | undefined
  onClose: () => void
  afterSelection: () => void
}) {
  const columns = menuIconColumns(entry.submenu, contextual)
  return h(Teleport, { to:document.body }, [h(MenuSurface, { 'elementRef': (element) => { submenu.panelRef.value = element }, 'compact': compact, 'className': clsx(css.submenu, css.scrollable, dense && css.denseList, compact && css.compactList), 'style': anchors(submenu, submenu.hidden), 'data-submenu-layout': submenu.measured ? submenu.page ? 'page' : 'side' : undefined, 'data-contextual': contextual ? '' : undefined, 'role': 'menu', 'onPointerenter': submenu.cancelClose, 'onPointerleave': (event: PointerEvent) => { if (menuHoverAllowed(event))
    submenu.leave() }, 'onContextmenu': contextual ? (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); onClose() } : undefined, 'onClick': (event: MouseEvent) => { event.stopPropagation() } }, { default: () => [submenu.page && h(Fragment, null, [h(MenuRow, { 'data-menu-back': '', 'icon': h(IconChevronLeftOutlineRegular, { 'className': css.check ?? '' }, undefined), 'onClick': submenu.returnToParent }, { default: () => [backLabel] }), h('div', { 'class': css.separator, 'role': 'separator' }, undefined)]), h('div', { 'class': css.viewport, 'role': 'presentation' }, [entry.submenu.map(sub => 'type' in sub ? renderMenuDecoration(sub)
    : h(MenuRow, { 'key': sub.id, 'icon': sub.icon, 'reserveIcon': columns.has(sub), 'disabled': sub.disabled === true, 'danger': sub.danger === true, 'shortcut': sub.shortcut, 'onClick': () => { onSelect?.(sub.id); afterSelection() } }, { default: () => [sub.label] }))])] })])
}
