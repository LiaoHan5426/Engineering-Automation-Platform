/** Slot-owned tab information derived from framework-bound store and navigation hooks. */
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import { computed } from 'vue'
import { findTabPane } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { KeyedSnapshotSelectorHook, PropsStore, SlotHookFactory } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightTabActions, SidebarRightTabNavigation, UseSidebarRightTabInfo } from './contract/slots.ts'
import type { createSidebarRightStore } from './stores.ts'

/** Stable dispatch identity and framework hooks; never passed as tab component props. */
export interface TabHookContext {
  readonly shortcuts: readonly ShortcutCatalogEntry[]
  readonly tabId: TabId
  readonly title: boolean
  readonly fullscreen: boolean
  readonly active: boolean
  readonly signal: AbortSignal
  readonly actions: SidebarRightTabActions
  readonly useStore: PropsStore<ReturnType<typeof createSidebarRightStore>>['useStore']
  readonly useTabNavigation: KeyedSnapshotSelectorHook<SidebarRightTabNavigation>
}

/**
 * Bind a tab occurrence without subscribing or creating records during factory evaluation.
 * @param standard - framework session identity.
 * @param context - stable record lifetime and framework-bound readers.
 * @returns the tab information hook.
 */
export const tabInfoFactory: SlotHookFactory<'sidebar.right.pane.tab', UseSidebarRightTabInfo> = (standard, context) => {
  const { sessionId } = standard
  const { tabId, title, fullscreen, active, signal, actions, useStore, useTabNavigation, shortcuts } = context
  return function useTabInfo() {
    const layout = useStore(state => state.bySession[sessionId]?.layout)
    const navigation = useTabNavigation(tabId)
    return computed(() => {
      const currentLayout = layout.value
      const currentNavigation = navigation.value
      const tab = currentLayout?.tabs[tabId]
      if (currentLayout === undefined || tab === undefined || currentNavigation === undefined) {
        throw new Error(`sidebarRight: tab "${tabId}" is not committed in session "${sessionId}"`)
      }
      const pane = findTabPane(currentLayout, tabId)
      return {
        sidebar: { expanded: currentLayout.expanded, fullscreen },
        panel: { id: pane.id, isFloating: pane.host === 'float' },
        tab: {
          ...tab,
          visible: active && (pane.host === 'float' || (currentLayout.expanded && (title || pane.activeTabId === tabId))),
          navigation: currentNavigation,
          signal,
          actions,
          refreshShortcut: shortcuts.find(row => row.id === 'page.refresh'),
        },
      }
    })
  }
}

/**
 * Forward the framework-bound tab hook to guide content.
 * @param _standard - the guide's framework standard props.
 * @param useTabInfo - the enclosing tab's framework-bound reader.
 * @returns the same reader for the replacement.
 */
export const guideTabInfoFactory =
  (_standard: unknown, useTabInfo: UseSidebarRightTabInfo): UseSidebarRightTabInfo => useTabInfo
