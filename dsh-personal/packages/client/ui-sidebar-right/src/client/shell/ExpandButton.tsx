/**
 * The way into a hidden panel: one button in the conversation header's corner
 * seat, visible only while the panel is collapsed.
 *
 * It lives in the conversation's own header rather than in the frame's right
 * column so that a collapsed Sidebar costs the conversation nothing — no rail,
 * no width, and the transcript's scrollbar stays at the column's edge. The
 * corner seat is its own, past the utilities' edge, so the button never joins
 * the utilities row. On mobile devices, the disabled button stays mounted
 * and hidden while the panel is shown, preserving the title's width during
 * the overlay slide. Desktop devices collapse the seat while the panel is shown.
 * It shares the panel's per-session store because both seats are session-scoped.
 *
 * The glyph is the left sidebar's collapse icon mirrored: the same affordance,
 * on the other edge.
 */
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { InjectFace, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { defineComponent, h } from 'vue'
import clsx from 'clsx'
import { Button, IconPanelLeftOutlineRegular, isMobileDevice, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { createSidebarRightStore } from '../stores.ts'
import css from './ExpandButton.module.css'

/** The button's props: the header corner seat, the shared store, and copy. */
export type ExpandButtonProps =
  & PropsRuntime<'conversation.session.header.corner'>
  & PropsStore<ReturnType<typeof createSidebarRightStore>>
  & PropsLocale<'sidebarRight'>
  & InjectFace<{ hooks: { shortcuts: HostObservable<readonly ShortcutCatalogEntry[]> } }>

/** Opens a collapsed panel; when expanded, hides and disables on mobile devices and renders nothing on desktop devices. */
export const ExpandButton = defineComponent((props: ExpandButtonProps) => {
  const shortcut = props.useShortcuts(entries => entries.find(entry => entry.id === 'sidebar.right.toggle'))
  const expanded = props.useStore(state => state.bySession[props.sessionId]?.layout.expanded ?? false)
  return () => {
    if (expanded.value && !isMobileDevice()) return null
    return h(Tooltip, {
      label: props.t('chrome.expand'),
      ...(shortcut.value?.keys === undefined ? {} : { shortcutKeys: shortcut.value.keys }),
      side: 'bottom', delayMs: 500, disabled: expanded.value,
    }, { default: () => h(Button, {
      size: 'sm', className: clsx(css.button, expanded.value && css.expanded),
      disabled: expanded.value, 'aria-label': props.t('chrome.expandAria'),
      'aria-keyshortcuts': shortcut.value?.aria, 'data-sidebar-right-expand': '',
      onClick: () => props.actions.setExpanded(props.sessionId, true),
    }, { default: () => h(IconPanelLeftOutlineRegular, { className: clsx(css.icon) }) }) })
  }
}, { name: 'ExpandButton', props: ['sessionId', 'useStore', 'actions', 't', 'useShortcuts', 'useRemoteAccess', 'useSessions', 'useSessionRetainInfo', 'useSessionAccess', 'usePanelInfo'], inheritAttrs: false })
