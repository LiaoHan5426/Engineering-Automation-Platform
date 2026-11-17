/** General settings row and persistent shell notice for API log uploads. */
import { defineComponent, h } from 'vue'
import { Switch, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UploadMutation, UploadSettings } from './upload-preference.ts'
import css from './UploadRow.module.css'

/** Accepted settings and mutation callbacks supplied by the plugin. */
export interface UploadInjected {
  hooks: {
    upload: ObservableSnapshot<ConfigFormSnapshot<UploadSettings>>
    mutation: ObservableSnapshot<UploadMutation>
  }
  setEnabled(enabled: boolean): Promise<void>
  dismiss(): void
}

type Face = InjectFace<UploadInjected> & PropsLocale<'settings.sessionLog'>

/** Render accepted API upload state, keeping pending writes separate from accepted settings. */
export const UploadRow = defineComponent((props: PropsRuntime<'settings.general.item'> & Face) => {
  const upload = props.useUpload(value => value)
  const busy = props.useMutation(value => value.busy)
  return () => h('div', { class: css.row }, [
    h('div', [h('div', { class: css.title }, props.t('title')), h('div', { class: css.description }, props.t('description'))]),
    h(Switch, {
      checked: upload.value.value?.enabled === true, label: props.t('title'),
      disabled: busy.value || upload.value.status !== 'ready' || !upload.value.writable,
      onChange: (enabled: boolean) => { void props.setEnabled(enabled) },
    }),
  ])
}, { name: 'UploadRow', inheritAttrs: false, props: ['useUpload', 'useMutation', 'setEnabled', 't'] })

/** Keep the sequence-keyed save outcome visible after settings closes. */
export const UploadToast = defineComponent((props: PropsRuntime<'shell.overlay'> & Face) => {
  const state = props.useMutation(value => value)
  return () => state.value.notice === null ? null : h(Toast, {
    key: state.value.sequence, text: props.t(state.value.notice), onDone: props.dismiss,
    ...(state.value.notice === 'saved' ? { tone: 'success' as const } : {}),
  })
}, { name: 'UploadToast', inheritAttrs: false, props: ['useMutation', 'dismiss', 't'] })
