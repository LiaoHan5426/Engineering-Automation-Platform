/** Folded Conversation Views, plugin discovery while reachable, and creation. */
import { computed, defineComponent, h } from 'vue'
import {
  Button, IconCheckOutlineRegular, IconPinOutlineRegular, IconPluginPinwheelOutlineRegular, IconPlusOutlineRegular, MenuItemButton, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './EntryMenu.module.css'

/** Navigation region whose More menu hosts one registration. */
export type EntryRegion = 'sidebar' | 'conversation' | 'rightbar'

/** Region identity and footer actions injected into each registration. */
export interface EntryMenuInjected {
  /** Region of this registration; selects analytics attributes and the Creator prompt. */
  readonly region: EntryRegion
  readonly hooks: {
    /** Whether the Plugins page navigation service is present; the discovery row shows only while it is. */
    readonly pluginNavigation: HostObservable<boolean>
  }
  /** Open the Plugins main list. */
  readonly browsePlugins: () => void
  /** Start a Creator draft with this region's prompt without sending it. */
  readonly createPlugin: () => void
}

// The three region owners declare the same fields; the sidebar's slot names them.
type EntryMenuContentProps = PropsRuntime<'sidebar.panellist.actions'>
  & PropsRenderFactories & PropsLocale<'entryCustomization'> & InjectFace<EntryMenuInjected>

/** Native rows for the region's More menu, bound to navigation presence once during setup. */
export const EntryMenuContent = defineComponent((props: EntryMenuContentProps) => {
  const moreEntries = computed(() => props.region === 'sidebar' ? props.entries.filter(entry => !entry.pinned) : props.region === 'conversation' ? props.entries : [])
  const browsable = props.usePluginNavigation(present => present)
  return () => [
    ...moreEntries.value.map(entry => h('div', { key: entry.id, class: props.region === 'sidebar' ? css.sidebarEntry : undefined }, [
      h(MenuItemButton, {
        current: entry.active === true,
        ...(props.region === 'sidebar' ? { icon: h('span', { class: css.entryIcon, 'aria-hidden': 'true' }, [props.renderFactorySlot('sidebar.panel.icon', { id: entry.id, size: 16, active: entry.active === true })]) } : {}),
        onSelect: () => { props.onDismiss(); props.onOpen(entry.id) },
      }, { default: () => h('span', { class: css.entryName }, [
        h('span', { class: css.entryTitle }, entry.label),
        entry.active === true ? h(IconCheckOutlineRegular, { size: 16, className: css.activeMark ?? '' }) : null,
      ]) }),
      props.region === 'sidebar' ? h('span', { class: css.pinAnchor }, [
        h(Tooltip, { label: props.t('pinTooltip'), side: 'bottom', align: 'end', delayMs: 500, portal: true }, {
          default: () => h(Button, {
            size: 'sm', role: 'menuitem', className: css.pinButton ?? '', 'aria-label': props.t('pin', { name: entry.label }),
            onClick: () => { props.onDismiss(); props.onPinnedChange(entry.id, true) },
          }, { default: () => h(IconPinOutlineRegular, { size: 14 }) }),
        }),
      ]) : null,
    ])),
    browsable.value ? h(MenuItemButton, {
      separatorBefore: moreEntries.value.length > 0, icon: h(IconPluginPinwheelOutlineRegular, { size: 16 }),
      onSelect: () => { props.onDismiss(); props.browsePlugins() },
    }, { default: () => props.t('install') }) : null,
    h(MenuItemButton, {
      icon: h(IconPlusOutlineRegular, { size: 16 }), separatorBefore: !browsable.value && moreEntries.value.length > 0,
      onSelect: () => { props.onDismiss(); props.createPlugin() },
    }, { default: () => props.t('create') }),
  ]
}, { name: 'EntryMenuContent', inheritAttrs: false, props: ['entries', 'onOpen', 'onPinnedChange', 'region', 'onDismiss', 'usePluginNavigation', 'browsePlugins', 'createPlugin', 't', 'renderFactorySlot'] })
