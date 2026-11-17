/** Optional settings-header action for opening a file-backed Host document. */
import { h, defineComponent } from 'vue'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsDocumentStore } from './settings-document-store.ts'
import css from './SettingsDocumentAction.module.css'
/** Registrant-owned dependencies of {@link SettingsDocumentAction}. */
export interface SettingsDocumentActionInjected {
  /** Provider metadata and action state owner. */
  controller: SettingsDocumentStore
  hooks: {
    /** Controller snapshot bound by the UI renderer as useSnapshot. */
    snapshot: SettingsDocumentStore['store']
  }
}
/** Header-action owner share, localized copy, and the registrant's state face. */
export type SettingsDocumentActionProps = PropsRuntime<'settings.action'> &
  PropsLocale<'settings'> &
  InjectFace<SettingsDocumentActionInjected>
/**
 * Render the open-document action only after Host metadata confirms document availability.
 * @param props - header owner props, localized copy, and injected document state.
 * @returns the action, or null while unavailable or unresolved.
 */
export const SettingsDocumentAction = defineComponent(
  (props: SettingsDocumentActionProps) => {
    const state = props.useSnapshot(snapshot => snapshot)
    void props.controller.load()
    return () =>
      state.value.status !== 'ready'
        ? null
        : h('div', { class: css.action }, [
          state.value.error === null
            ? null
            : h('span', { class: css.error, role: 'alert' }, [props.t('openDocument.error')]),
          h(
            Button,
            {
              variant: 'outline',
              size: 'sm',
              disabled: state.value.opening,
              onClick: () => {
                void props.controller.open()
              },
            },
            { default: () => props.t('openDocument') },
          ),
        ])
  },
  { inheritAttrs: false, props: ['controller', 'useSnapshot', 't'] },
)
