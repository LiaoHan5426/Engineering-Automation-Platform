import { defineComponent, h } from 'vue'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionMarkdownCopyState } from './copy-controller.ts'
import { NS } from './locales.ts'

/** Copy state and dismissal bound into the root overlay entry. */
export interface SessionMarkdownCopyToastInjected {
  hooks: { sessionMarkdownCopy: ObservableSnapshot<SessionMarkdownCopyState> }
  dismiss: () => void
}

/** Props of the root overlay copy notice. */
export type SessionMarkdownCopyToastProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & InjectFace<SessionMarkdownCopyToastInjected>

type ToastViewProps = Pick<SessionMarkdownCopyToastProps, 'useSessionMarkdownCopy' | 'dismiss' | 't'>

/**
 * Show the settled copy outcome outside the Session Header and menu lifetime.
 * @param props - copy notice hook, dismissal action, and localized copy.
 * @returns the success or failure toast, or null while no notice shows.
 */
export const SessionMarkdownCopyToast = defineComponent((props: ToastViewProps) => {
  const notice = props.useSessionMarkdownCopy(state => state.notice)
  return () => {
    const current = notice.value
    if (current === null) return null
    return current.kind === 'success'
      ? h(Toast, { key: current.seq, text: props.t('toast.copied'), tone: 'success', onDone: props.dismiss })
      : h(Toast, {
        key: current.seq,
        text: props.t(current.kind === 'preparationFailed' ? 'toast.preparationFailed' : 'toast.clipboardFailed'),
        icon: h(IconWarningOutlineRegular), onDone: props.dismiss,
      })
  }
}, { name: 'SessionMarkdownCopyToast', inheritAttrs: false, props: ['useSessionMarkdownCopy', 'dismiss', 't'] })
