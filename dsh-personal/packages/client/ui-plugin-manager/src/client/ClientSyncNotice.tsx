/** Client synchronization progress and retryable failures. */
import { defineComponent, h, Fragment } from 'vue'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientEntryState } from '@deepseek-ai/dsh-client-modules/client'
import type { Translate } from './presentation.ts'
import css from './PluginManagerPage.module.css'
/** Show the current page's synchronization state. */
export const ClientSyncNotice = defineComponent((props: { readonly sync: ClientEntryState; readonly t: Translate; readonly retry: () => void }) => () => h(Fragment, null, [
  props.sync.syncing ? h('p', { class: [css.status, css.statusWithDot], role: 'status' }, [h(StateDot, { state: 'ongoing' }), props.t('clientSyncing')]) : null,
  props.sync.failures.length === 0 ? null : h('div', { class: css.failure, 'data-client-sync-failure': '' }, [
    h('p', { class: css.statusWithDot, role: 'alert' }, [h(StateDot, { state: 'error' }), props.t('clientSyncFailed')]),
    h('ul', null, props.sync.failures.map(failure => h('li', { key: failure.id }, failure.id + ': ' + failure.message))),
    h(Button, { variant: 'outline', size: 'sm', disabled: props.sync.syncing, onClick: props.retry }, { default: () => props.t('clientSyncRetry') }),
  ]),
]), { props: ['sync', 't', 'retry'] })
