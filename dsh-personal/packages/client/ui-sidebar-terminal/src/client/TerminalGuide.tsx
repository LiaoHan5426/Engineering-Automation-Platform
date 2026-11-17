import { h, ref, shallowRef, defineComponent, watch } from 'vue'
/** Shell launch menu owned by the terminal provider's guide entry. */
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { PluginArtworkTerminal, ShortcutKeys, Button, IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TerminalLaunchShells } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TerminalGuide.module.css'
/** Provider-owned discovery and browser preference writes. */
export interface TerminalGuideInjected {
  readonly hooks: {
    readonly shortcuts: HostObservable<readonly ShortcutCatalogEntry[]>
  }
  /** @param signal - open menu lifetime. @returns current Host choices and browser preference. */
  readonly loadShells: (signal: AbortSignal) => Promise<TerminalLaunchShells>
  /** @param path - Host-discovered shell selected for the next terminal. */
  readonly selectShell: (path: string) => void
}
/** Session guide owner props, framework hooks and terminal actions. */
export type TerminalGuideProps = Pick<PropsRuntime<'sidebar.right.tab.guide.entry'>, 'title' | 'description' | 'kind' | 'useTabInfo'> & PropsLocale<'sidebarTerminal'> & InjectFace<TerminalGuideInjected>
type MenuState = {
  phase: 'loading'
} | {
  phase: 'ready'
  choices: TerminalLaunchShells
} | {
  phase: 'failed'
  message: string
}
/**
 * Open the remembered shell from the card or choose another shell from its menu.
 * The card displays its effective shortcut; the shell menu sits beside the title.
 * @param props - guide copy, enclosing tab actions and cancellable discovery.
 * @returns separate launch and menu buttons within one guide card.
 */
export const TerminalGuide = defineComponent((props: TerminalGuideProps) => {
  const shortcutRef = props.useShortcuts(entries => entries.find(entry => entry.id === 'terminal.new'))
  const tabInfo = props.useTabInfo()
  const open = ref(false), attempt = ref(0)
  const menu = shallowRef<MenuState>({ phase: 'loading' })
  watch([open, attempt, () => props.loadShells], (_values, _old, cleanup) => {
    if (!open.value)
      return
    const lifetime = new AbortController()
    cleanup(() => { lifetime.abort() })
    void props.loadShells(lifetime.signal).then((choices) => {
      if (!lifetime.signal.aborted)
        menu.value = { phase: 'ready', choices }
    }, (error: unknown) => {
      if (!lifetime.signal.aborted)
        menu.value = { phase: 'failed', message: error instanceof Error ? error.message : String(error) }
    })
  })
  return () => {
    const { title, description, kind, t, selectShell } = props
    const state = menu.value, shortcut = shortcutRef.value, tab = tabInfo.value.tab
    const items = state.phase === 'ready'
      ? state.choices.shells.map(shell => ({ id: shell.path, label: shell.name }))
      : state.phase === 'loading'
        ? [{ id: 'loading', label: t('shellLoading'), disabled: true }]
        : [{ id: 'error', label: t('failed', { message: state.message }), disabled: true }, { id: 'retry', label: t('retry') }]
    return h('div', { 'class': css.entry, 'data-sidebar-right-guide-entry': kind }, [
      h(Button, { 'variant': 'ghost', 'className': css.main ?? '', 'aria-label': description === undefined ? title : `${title} ${description}`, 'aria-keyshortcuts': shortcut?.aria, 'onClick': () => { tab.actions.openTab('terminal', { replaceTab: true }) } }),
      h('span', { 'class': css.icon, 'aria-hidden': 'true' }, [
        h(PluginArtworkTerminal, { 'size': description === undefined ? 22 : 26 }),
      ]),
      h('span', { 'class': css.text }, [
        h('span', { 'class': css.titleRow }, [
          h('span', { 'class': css.title, 'aria-hidden': 'true' }, [
            title,
          ]),
          h(Menu, { 'open': open.value, 'portal': true, 'autoFocus': true, 'align': 'end', 'className': css.menu ?? '', 'items': items.length === 0 ? [{ id: 'empty', label: t('shellEmpty'), disabled: true }] : items, ...(state.phase === 'ready' && state.choices.selectedShell !== undefined ? { selectedId: state.choices.selectedShell } : {}), 'onClose': () => { open.value = false }, 'onSelect': (path: string) => {
            if (state.phase === 'failed') {
              menu.value = { phase: 'loading' }
              attempt.value++
              return
            }
            selectShell(path)
            open.value = false
            tab.actions.openTab('terminal', { replaceTab: true, params: { shellPath: path } })
          } }, { anchor: () => h(Button, { 'variant': 'ghost', 'className': css.trigger ?? '', 'aria-label': t('shell'), 'aria-haspopup': 'menu', 'aria-expanded': open.value, 'onClick': () => { menu.value = { phase: 'loading' }; open.value = !open.value } }, { default: () => [
            h(IconChevronDownOutlineRegular, null),
          ] }) }),
        ]),
        description !== undefined && h('span', { 'class': css.description, 'aria-hidden': 'true' }, [
          description,
        ]),
      ]),
      shortcut !== undefined && shortcut.keys.length > 0 && h(ShortcutKeys, { 'keys': shortcut.keys, 'className': css.shortcut ?? '' }),
    ])
  }
}, { props: ['title', 'description', 'kind', 'useTabInfo', 'loadShells', 'selectShell', 't', 'useShortcuts'], inheritAttrs: false })
