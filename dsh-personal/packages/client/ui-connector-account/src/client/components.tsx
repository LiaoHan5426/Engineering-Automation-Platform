import { defineComponent, Fragment, h, shallowRef, watch } from 'vue'
import { Button, IconWarningOutlineRegular, Modal, StateDot, Tag, Toast, type StateDotState, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime, Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { ConnectorAccountButton, ConnectorAccountCommand, ConnectorAccountEntry, ConnectorAccountPhase } from '../types.ts'
import css from './ConnectorAccount.module.css'
import type { ConnectorAccountKey } from './locales.ts'
import { openAuthorizationPage } from './state.ts'
import type { ConnectorAccountFace, ConnectorAccountsState, ConnectorBundleAccountFace } from './types.ts'
type FaceProps = InjectFace<ConnectorAccountFace> & { t: Translate<ConnectorAccountKey> }
type BundleFaceProps = InjectFace<ConnectorBundleAccountFace> & { t: Translate<ConnectorAccountKey> }
const TONE: Record<ConnectorAccountPhase, StateDotState> = { checking: 'ongoing', connecting: 'ongoing', connected: 'done', disconnected: 'idle', unavailable: 'warning' }
const BADGE_TONE: Record<ConnectorAccountPhase, TagTone> = { checking: 'outline', connecting: 'info', connected: 'success', disconnected: 'outline', unavailable: 'warning' }
function useAccountCommand(face: Pick<FaceProps, 'useConnectorAccounts' | 'start' | 'cancel' | 'follow' | 'failed'>) {
  const busy = shallowRef(false)
  const linked = face.useConnectorAccounts(s => s.linked)
  const call = (operation: () => Promise<boolean>) => {
    if (busy.value) return
    busy.value = true
    void operation().then(accepted => { if (!accepted) face.failed() }).catch(() => face.failed()).finally(() => { busy.value = false })
  }
  const run = (entry: ConnectorAccountEntry, command: ConnectorAccountCommand): void => {
    const { key } = entry
    switch (command.kind) {
      case 'start': call(async () => { const started = await face.start(key, command.operation); if (started.ok) face.follow(key, started.value); return started.ok }); return
      case 'cancel': if (entry.operation !== undefined) { const id = entry.operation.id; call(async () => (await face.cancel(key, id)).ok) }; return
      case 'open': openAuthorizationPage(entry.operation?.authorizationUrl); return
      default: assertNever(command)
    }
  }
  return { busy, linked, run }
}
const bundleProps = ['useConnectorAccounts', 'account', 'resolveText', 't', 'start', 'cancel', 'follow', 'failed'] as const
/** Bundle account configuration, including confirmation before external changes. */
export const ConnectorAccountSectionEntry = defineComponent((p: BundleFaceProps) => {
  const command = useAccountCommand(p)
  const confirming = shallowRef<ConnectorAccountButton>()
  const selectedEntry = p.useConnectorAccounts(s => s.accounts.get(p.account))
  return () => {
    const entry = selectedEntry.value
    if (entry === undefined) return null
    const d = entry.display, disabled = command.busy.value || !command.linked.value
    const button = (item: ConnectorAccountButton) => h(Button, { key: p.resolveText(item.label), variant: item.variant ?? 'outline', size: 'sm', disabled, onClick: () => { if (item.confirm === undefined) command.run(entry, item.command); else confirming.value = item } }, { default: () => p.resolveText(item.label) })
    const confirm = confirming.value?.confirm
    return h('div', { class: css.section, 'data-connector-account': d.phase, 'data-connector-account-key': entry.key }, [
      h('h4', { class: css.title }, p.resolveText(entry.copy.title)),
      h('div', { class: css.status }, [h(StateDot, { state: TONE[d.phase] }), h('span', { class: css.label }, p.resolveText(d.status)), h('div', { class: css.actions }, d.buttons.map(button))]),
      d.detail === undefined ? null : h('p', { class: css.detail }, p.resolveText(d.detail)),
      ...d.notes.map(note => h('div', { key: p.resolveText(note.text), class: css.status }, [h('span', { class: css.detail }, p.resolveText(note.text)), note.button === undefined ? null : h('div', { class: css.actions }, [button(note.button)])])),
      d.failure === undefined ? null : h('p', { class: css.failure, role: 'alert' }, [p.resolveText(d.failure.text), (d.failure.details ?? []).length ? ' ' + p.t('failure.details', { details: d.failure.details!.join(' · ') }) : null]),
      h('p', { class: css.hint }, p.resolveText(entry.copy.hint)),
      confirm === undefined ? null : h(Modal, { open: true, title: p.resolveText(confirm.title), closeLabel: p.t('close'), onClose: () => { confirming.value = undefined } }, { footer: () => h(Fragment, null, [h(Button, { variant: 'ghost', onClick: () => { confirming.value = undefined } }, { default: () => p.t('action.cancel') }), h(Button, { variant: 'primary', 'data-modal-autofocus': '', disabled, onClick: () => { const selected = confirming.value; confirming.value = undefined; if (selected !== undefined) command.run(entry, selected.command) } }, { default: () => p.resolveText(confirm.label) })]), default: () => h('p', null, p.resolveText(confirm.body)) }),
    ])
  }
}, { props: [...bundleProps] })
function accountOf(state: ConnectorAccountsState, packageName: string): ConnectorAccountEntry | undefined { for (const entry of state.accounts.values()) if (entry.packageName === packageName) return entry; return undefined }
/** Status badge on an enabled bundle or one of its rows. */
export const ConnectorAccountBadgeEntry = defineComponent((p: FaceProps & Pick<PropsRuntime<'plugins.detail.badge'>, 'subject'>) => {
  const selectedEntry = p.useConnectorAccounts(s => {
    const packageName = p.subject.kind === 'item' || !p.subject.pkg.enabled ? undefined : p.subject.pkg.name
    return packageName === undefined ? undefined : accountOf(s, packageName)
  })
  return () => {
    const entry = selectedEntry.value
    const badge = entry?.display.badge
    if (entry === undefined || badge === undefined) return null
    return h(Tag, { tone: BADGE_TONE[entry.display.phase] }, { default: () => p.resolveText(badge) })
  }
}, { props: ['useConnectorAccounts', 'resolveText', 'subject', 't', 'start', 'cancel', 'follow', 'failed'] })
/** Activation prompt; connected and unavailable accounts dismiss it. */
export const ConnectorAccountActivationEntry = defineComponent((p: BundleFaceProps & Pick<PropsRuntime<'plugins.bundle.activation'>, 'onDismiss' | 'onOpenDetails'>) => {
  const command = useAccountCommand(p)
  const entry = p.useConnectorAccounts(s => s.accounts.get(p.account))
  watch(() => entry.value?.display.phase, phase => { if (phase === 'connected' || phase === 'unavailable') p.onDismiss() }, { immediate: true })
  return () => {
    const e = entry.value
    if (e === undefined) return null
    return h(Modal, { open: e.display.phase === 'disconnected', title: p.resolveText(e.copy.activation.title), closeLabel: p.t('close'), onClose: p.onDismiss }, { footer: () => h(Fragment, null, [h(Button, { variant: 'ghost', onClick: p.onDismiss }, { default: () => p.t('activation.later') }), h(Button, { variant: 'primary', 'data-modal-autofocus': '', disabled: !command.linked.value, onClick: () => { p.onOpenDetails(); if (e.display.connect !== undefined) command.run(e, e.display.connect) } }, { default: () => p.resolveText(e.copy.activation.connect) })]), default: () => h('p', null, p.resolveText(e.copy.activation.body)) })
  }
}, { props: [...bundleProps, 'onDismiss', 'onOpenDetails'] })
/** Account outcomes outlive the Plugins page. */
export const ConnectorAccountToastEntry = defineComponent((p: FaceProps) => {
  const selectedNotice = p.useConnectorAccounts(s => s.notice)
  return () => {
    const notice = selectedNotice.value
    if (notice === undefined) return null
    return h(Toast, { key: notice.seq, text: notice.kind === 'action-failed' ? p.t('notice.action-failed') : p.resolveText(notice.text), ...(notice.kind === 'action-failed' ? { icon: h(IconWarningOutlineRegular) } : {}), onDone: p.dismissNotice })
  }
}, { props: ['useConnectorAccounts', 'resolveText', 'dismissNotice', 't', 'start', 'cancel', 'follow', 'failed'] })
