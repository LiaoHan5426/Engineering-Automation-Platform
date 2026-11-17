import { defineComponent, h } from 'vue'
/** General Settings row for Chat HTTP(S) link destinations. */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { LinkOpening } from '../../chat-settings.ts'
import { PreferenceRow } from './PreferenceRow.tsx'

/** Registration-side link-opening preference. */
export interface LinkOpeningRowInjected {
  hooks: {
    /** Current destination, bound as useLinkOpening. */
    linkOpening: ObservableSnapshot<LinkOpening>
    /** Whether the built-in browser is registered, bound as useBrowserAvailable. */
    browserAvailable: ObservableSnapshot<boolean>
  }
  /** Change the default destination for Chat HTTP(S) links. */
  setLinkOpening: (destination: LinkOpening) => void
}

/** Full Settings-row props. */
export type LinkOpeningRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'chat'>
  & InjectFace<LinkOpeningRowInjected>

/**
 * Render the link-opening destination selector.
 * @param props - Composed Settings slot props.
 * @returns The preference row.
 */
export const LinkOpeningRow = defineComponent((props: LinkOpeningRowProps) => {
  const destination = props.useLinkOpening(value => value)
  const available = props.useBrowserAvailable(value => value)
  return () => available.value ? h(PreferenceRow, {
    title: props.t('settings.links.title'), description: props.t('settings.links.description'), value: destination.value,
    selectedLabel: props.t(destination.value === 'sidebar' ? 'settings.links.sidebar' : 'settings.links.newTab'),
    options: [{ id: 'sidebar', label: props.t('settings.links.sidebar') }, { id: 'new-tab', label: props.t('settings.links.newTab') }],
    onSelect: (value: string) => { if (value === 'sidebar' || value === 'new-tab') props.setLinkOpening(value) },
  }) : null
}, { name: 'LinkOpeningRow', inheritAttrs: false, props: ['useLinkOpening', 'useBrowserAvailable', 'setLinkOpening', 't'] })
