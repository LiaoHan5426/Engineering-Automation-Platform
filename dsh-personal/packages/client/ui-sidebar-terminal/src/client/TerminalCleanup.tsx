import { h, defineComponent } from 'vue'
/** Failed background cleanup remains actionable after the originating tab disappears. */
import type { TerminalCloseFailure } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TerminalCleanup.module.css'
/** The model owns cleanup; this seat only shows failures and requests retries. */
export interface TerminalCleanupInjected {
  readonly hooks: {
    readonly closeFailures: HostObservable<readonly TerminalCloseFailure[]>
  }
  /** @param id - failed cleanup identity. */
  readonly retryClose: (id: WebTerminalId) => void
}
/**
 * Render failed cleanup tasks without recreating or blocking any sidebar tab.
 * @param props - root overlay hooks, retry command and localized copy.
 * @returns a compact alert stack, empty when no close has failed.
 */
export const TerminalCleanup = defineComponent((props: PropsRuntime<'shell.overlay'> & PropsLocale<'sidebarTerminal'> & InjectFace<TerminalCleanupInjected>) => {
  const failuresRef = props.useCloseFailures(value => value)
  return () => {
    const { retryClose, t } = props
    const failures = failuresRef.value
    if (failures.length === 0)
      return null
    return h('div', { 'class': css.stack }, [
      failures.map(failure => h('div', { 'key': failure.id, 'class': css.notice, 'role': 'alert' }, [
        h('span', null, [
          t('cleanupFailed', { title: failure.title, message: failure.message }),
        ]),
        h('button', { 'type': 'button', 'onClick': () => { retryClose(failure.id) } }, [
          t('retry'),
        ]),
      ])),
    ])
  }
}, { props: ['useCloseFailures', 'retryClose', 't'], inheritAttrs: false })
