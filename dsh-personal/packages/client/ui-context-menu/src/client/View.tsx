/** Shared Web renderer for Client menu contributions. */
import { defineComponent, h, Fragment, type DefineSetupFnComponent } from 'vue'
import { Menu, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsStore, PropsRenderSlots, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Shortcuts, ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { createMenuStore } from './store.ts'
import type { MenuActionView } from './types.ts'
import { isContextMenuTrigger } from './external-trigger.ts'

/**
 * @param actions - plain presentation.
 * @param catalog - effective user shortcuts.
 * @param renderSlot - owner-authorized keyed icon renderer.
 * @returns Existing Menu entries.
 */
export function menuEntries(
  actions: readonly MenuActionView[], catalog: readonly ShortcutCatalogEntry[],
  renderSlot: PropsRenderSlots<'contextMenu.icon'>['renderSlot'],
): MenuEntry[] {
  return actions.flatMap((action) => {
    const shortcut = catalog.find(entry => entry.id === action.commandId)
    const item: MenuEntry = { id: action.id, label: action.label,
      ...(shortcut === undefined ? {} : { shortcut }),
      ...(action.disabled === undefined ? {} : { disabled: action.disabled }),
      ...(action.danger === undefined ? {} : { danger: action.danger }),
      ...(action.icon === undefined ? {} : {
        icon: renderSlot('contextMenu.icon', { icon: action.icon }, { entryKey: action.icon.key }),
      }),
      ...(action.children === undefined ? {} : { submenu: menuEntries(action.children, catalog, renderSlot) }),
    }
    return action.separatorBefore ? [{ type: 'separator', id: `${action.id}:separator` }, item] : [item]
  })
}

/** Shared overlay callbacks. */
export interface MenuOverlayInjected {
  hooks: { catalog: Shortcuts['catalog'] }
  close: () => void
  returnFocus?: () => HTMLElement | null
  select: (id: string) => void
}
type Props = PropsStore<ReturnType<typeof createMenuStore>>
  & PropsRenderSlots<'contextMenu.content' | 'contextMenu.icon'> & InjectFace<MenuOverlayInjected> & PropsLocale<'contextMenu'>

/** @param props - registered state, target-specific legacy rows, and actions. @returns one menu and persistent feedback. */
export const MenuOverlay: DefineSetupFnComponent<Props> = defineComponent((props: Props) => {
  const catalog = props.useCatalog(value => value)
  const state = props.useStore(value => value)
  return () => {
    const { target, point, items, notice, occurrence, closing, replacing } = state.value
    return h(Fragment, null, [
      h(Menu, {
        key: occurrence, open: target !== null, anchor: null, portal: true, autoFocus: true, contextual: true,
        ...(props.returnFocus === undefined ? {} : { returnFocus: props.returnFocus }),
        submenuBackLabel: props.t('back'), isExternalTrigger: isContextMenuTrigger,
        ...(closing ? { exiting: replacing ? 'replace' as const : 'dismiss' as const } : {}),
        anchorPoint: point,
        items: menuEntries(items.filter(item => !item.afterContent), catalog.value, props.renderSlot),
        footer: menuEntries(items.filter(item => item.afterContent), catalog.value, props.renderSlot),
        onClose: props.close, onSelect: props.select,
      }, { default: () => target !== null ? props.renderSlot('contextMenu.content', { target, dismiss: props.close }, { entryKey: target.kind }) : null }),
      notice === null ? null : h(Toast, {
        key: notice.id, text: notice.text,
        ...(notice.action === undefined ? {} : { actions: [notice.action] }),
        ...(notice.success ? { tone: 'success' as const } : {}),
        onDone: () => { props.actions.notify(null) },
      }),
    ])
  }
}, { props: ['useStore', 'actions', 'renderSlot', 'close', 'select', 'returnFocus', 'useCatalog', 't'] })
