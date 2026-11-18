/**
 * The `files` page: a file browser with no file chosen yet.
 *
 * Its header spans the page: the workspace root's path, the tree's reload,
 * the search-bar toggle, and the directory actions. The pane's navigator fills the page below it and
 * stays shown, so the page draws no navigator toggle; picking a file leaves this page as
 * it is and opens the file where the right Sidebar places it by default
 * (`FileNavigator`).
 */
import { computed, defineComponent, h, watchEffect } from 'vue'
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { IconPauseOutlineRegular, IconPlayOutlineRegular, IconRefreshOutlineRegular, IconSearchOutlineRegular, PathLabel, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FilesInjected } from './face.ts'
import type {} from './FileNavigator.tsx'
import type {} from './locales.ts'
import type { createFilesStore } from './store.ts'
import css from './FilesBody.module.css'
/** The page's composed props: the tab it draws, its directory-actions seat, the pane records and the tree's face, and copy. */
export type FilesBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsRenderSlots<'sidebar.right.tab.files.actions'> & PropsRenderFactories & PropsStore<ReturnType<typeof createFilesStore>> & InjectFace<FilesInjected> & PropsLocale<'sidebarFiles'>
/**
 * The `files` page body.
 * @param props - composed slot props.
 * @returns the header above the pane's navigator, or the workspace line.
 */
export const FilesBody = defineComponent((props: FilesBodyProps) => {
  const info = props.useTabInfo()
  const { getTriggerProps } = props.useContextMenu()
  const onOpen = (address: string): void => {
    const { tab, panel } = info.value
    if (panel.isFloating) tab.actions.openResource(address)
    else tab.actions.openResource(address, { paneId: panel.id })
  }
  watchEffect((onCleanup) => { const { tab, panel } = info.value; onCleanup(tab.actions.bindCommands({ refresh: (
  ) => { props.refresh(panel.id) } })) })
  const selectedCwd = props.useSessions(sessions => sessions.byId[props.sessionId]?.cwd)
  const panes = props.useStore(store => store.byPane)
  const selectedAutoRefresh = computed(() => {
    const tree = panes.value[info.value.panel.id]?.tree
    return tree?.root === selectedCwd.value ? tree?.autoRefresh : undefined
  })
  const selectedSearchBar = computed(() => panes.value[info.value.panel.id]?.searchBarOpen)
  watchEffect((onCleanup) => { if (selectedCwd.value !== undefined) onCleanup(props.placeBeside(info.value.tab.id)) })
  return () => {
    const { useTabInfo, sessionId, actions, refresh, focus, setAutoRefresh, renderSlot, renderFactorySlot, t } = props
    const { tab, panel } = info.value
    const cwd = selectedCwd.value
    const autoRefresh = selectedAutoRefresh.value
    const searchBarOpen = selectedSearchBar.value === true
    if (cwd === undefined) {
      return (h('div', {
        'class': css.status,
        'data-files-state': 'no-workspace',
      }, [
        h('p', {
          'class': css.statusLine,
        }, [
          t('noWorkspace'),
        ]),
      ]))
    }
    const automatic = autoRefresh ?? true
    const navigator = renderFactorySlot('sidebar.files.navigator', { useTabInfo, page: true, onOpen })
    return (h('div', {
      'class': css.page,
      'data-files-page': '',
    }, [
      h('div', {
        'class': css.header,
      }, [
        h(PathLabel, {
          'path': cwd,
          'class': css.path,
          'data-files-path': '',
          ...getTriggerProps({ kind: 'directory', value: { sessionId, path: cwd } }),
        }, {
          'default': () => [],
        }),
        h('span', {
          'hidden': true,
        }, [
          h('button', {
            'type': 'button',
            'class': css.tool,
            'aria-label': t('autoRefresh'),
            'aria-pressed': automatic,
            'disabled': autoRefresh === undefined,
            'data-files-auto-refresh': '',
            'title': t(automatic ? 'autoRefresh.disable' : 'autoRefresh.enable'),
            'onClick': () => { setAutoRefresh(panel.id, !automatic) },
          }, [
            automatic ? h(IconPauseOutlineRegular, null, {
              'default': () => [],
            }) : h(IconPlayOutlineRegular, null, {
              'default': () => [],
            }),
          ]),
        ]),
        h(Tooltip, {
          'label': t('reload'),
          ...(tab.refreshShortcut === undefined ? {} : { shortcutKeys: tab.refreshShortcut.keys }),
          'side': 'bottom',
          'delayMs': 500,
        }, {
          'default': () => [
            h('button', {
              'type': 'button',
              'class': css.tool,
              'aria-label': t('reload'),
              'aria-keyshortcuts': tab.refreshShortcut?.aria,
              'data-files-reload': '',
              'onClick': () => { refresh(panel.id) },
            }, [
              h(IconRefreshOutlineRegular, null, {
                'default': () => [],
              }),
            ]),
          ],
        }),
        h(Tooltip, {
          'label': t('search.placeholder'),
          'side': 'bottom',
          'delayMs': 500,
        }, {
          'default': () => [
            h('button', {
              'type': 'button',
              'class': css.tool,
              'aria-label': t('search.placeholder'),
              'aria-expanded': searchBarOpen,
              'data-files-search-toggle': '',
              'onClick': (event: MouseEvent) => {
                if (searchBarOpen) {
                  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
                  actions.searchBarShown(panel.id, false)
                }
                else
                  focus(panel.id)
              },
            }, [
              h(IconSearchOutlineRegular, null, {
                'default': () => [],
              }),
            ]),
          ],
        }),
        h('div', { class: css.externalActions }, [renderSlot('sidebar.right.tab.files.actions', { absolutePath: cwd })]),
      ]),
      h('div', {
        'class': css.content,
        'data-files-content': '',
        'data-files-navigator-row': '',
      }, [
        navigator,
      ]),
    ]))
  }
}, { name: 'FilesBody', props: ['useTabInfo', 'sessionId', 'useSessions', 'useStore', 'actions', 'refresh', 'focus', 'placeBeside', 'setAutoRefresh', 'renderSlot', 'renderFactorySlot', 't', 'useContextMenu'], inheritAttrs: false })
