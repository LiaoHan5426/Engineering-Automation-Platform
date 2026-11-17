/** Permission default for new sessions; current-session switches stay on the composer. */
import { defineComponent, Fragment, h, ref, watchEffect } from 'vue'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutlineRegular, Menu, RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PermissionSettingsState } from './settings-store.ts'
import type { PermissionSettingsKey } from './locales.ts'
import { displayPermissionPreset, FULL_ACCESS_PRESET } from './presentation.ts'
import css from './PermissionRow.module.css'

/** Registration-side business face for the host-backed preference. */
export interface PermissionRowInjected {
  hooks: { permission: SnapshotStore<PermissionSettingsState> }
  load: () => Promise<void>
  select: (preset: string) => Promise<void>
}
/** Full component props. */
export type PermissionRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<'settings.permission'> & InjectFace<PermissionRowInjected>

export const PermissionRow = defineComponent((props: Pick<PermissionRowProps, 'usePermission' | 'load' | 'select' | 't'>) => {
  const state = props.usePermission(snapshot => snapshot)
  const open = ref(false)
  const confirmingFullAccess = ref(false)
  const acknowledged = ref(false)
  watchEffect(() => { void props.load() })
  const close = (): void => {
    acknowledged.value = false
    confirmingFullAccess.value = false
  }
  watchEffect(() => {
    if (state.value.writable && state.value.status !== 'unavailable') return
    open.value = false
    close()
  })
  return () => {
    const snapshot = state.value
    if (snapshot.status === 'unavailable') return null
    const selected = snapshot.options.find(option => option.id === snapshot.currentValue)
    const busy = snapshot.status === 'loading' || snapshot.status === 'saving' || confirmingFullAccess.value
    const optionLabel = (option: PermissionSettingsState['options'][number]): string => displayPermissionPreset(option.id, option.label, props.t)
    const label = selected !== undefined ? optionLabel(selected) : (busy ? props.t('loading') : props.t('unavailable'))
    return h(Fragment, [
      h('div', { class: css.row }, [
        h('div', { class: css.rowText }, [
          h('div', { class: css.title }, props.t('title')),
          h('div', { class: css.desc, role: snapshot.error === null ? undefined : 'alert' }, snapshot.error ?? props.t('description')),
        ]),
        h(Menu, {
          open: open.value, onClose: () => { open.value = false },
          items: snapshot.options.map(option => ({ id: option.id, label: optionLabel(option) })),
          selectedId: snapshot.currentValue,
          onSelect: (id: string) => {
            open.value = false
            if (id === snapshot.currentValue) return
            if (id === FULL_ACCESS_PRESET) {
              acknowledged.value = false
              confirmingFullAccess.value = true
            } else void props.select(id)
          }, align: 'end', portal: true,
        }, { anchor: () => h('button', {
          type: 'button', class: css.selector, 'aria-haspopup': 'menu', 'aria-expanded': open.value,
          disabled: busy || !snapshot.writable || snapshot.options.length === 0,
          onClick: () => { open.value = !open.value },
        }, [label, h(IconChevronDownOutlineRegular, { className: css.chevron ?? '' })]) }),
      ]),
      h(RiskConfirmation, {
        open: confirmingFullAccess.value, title: props.t('confirm.title'), description: props.t('confirm.description'),
        acknowledgeLabel: props.t('confirm.acknowledge'), cancelLabel: props.t('confirm.cancel'),
        closeLabel: props.t('close'), confirmLabel: props.t('confirm.enable'),
        acknowledged: acknowledged.value, disabled: !snapshot.writable || snapshot.status === 'saving',
        onAcknowledgedChange: (value: boolean) => { acknowledged.value = value }, onCancel: close,
        onConfirm: () => { close(); void props.select(FULL_ACCESS_PRESET) },
      }),
    ])
  }
}, { name: 'PermissionRow', inheritAttrs: false, props: ['load', 'select', 'usePermission', 't'] })

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Permission row copy. */
    'settings.permission': PermissionSettingsKey
  }
}
