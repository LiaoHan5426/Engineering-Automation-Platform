import { defineComponent, Fragment, h, ref, watchEffect, type Component, type VNodeChild } from 'vue'
import clsx from 'clsx'
import {
  PermissionIconAutoReviewMedium, PermissionIconFullAccessMedium, PermissionIconReadOnlyMedium, PermissionIconWorkspaceWriteMedium,
  IconChevronDownOutlineRegular, Menu, PermissionIconAutoReviewRegular, PermissionIconFullAccessRegular,
  PermissionIconReadOnlyRegular, PermissionIconWorkspaceWriteRegular, RiskConfirmation,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PresetOption } from '@deepseek-ai/dsh-permission-presets/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PermissionCatalogState } from './catalog.ts'
import { PERMISSION_ACCESS_NS } from './locales.ts'
import { AUTO_REVIEW_PRESET as AUTO_REVIEW, displayPermissionPreset, FULL_ACCESS_PRESET as FULL_ACCESS } from './presentation.ts'
import css from './PermissionSelect.module.css'

const permissionGlyphs = new Map<string, { menu: Component; trigger: Component }>([
  ['read-only', { menu: PermissionIconReadOnlyRegular, trigger: PermissionIconReadOnlyMedium }],
  ['workspace-write', { menu: PermissionIconWorkspaceWriteRegular, trigger: PermissionIconWorkspaceWriteMedium }],
  [FULL_ACCESS, { menu: PermissionIconFullAccessRegular, trigger: PermissionIconFullAccessMedium }],
  [AUTO_REVIEW, { menu: PermissionIconAutoReviewRegular, trigger: PermissionIconAutoReviewMedium }],
])
function permissionGlyph(value: string, surface: 'menu' | 'trigger'): VNodeChild {
  const icon = permissionGlyphs.get(value)?.[surface]
  return icon === undefined ? undefined : h(icon)
}
function permissionLabel(value: string, name: string, t: PermissionSelectProps['t']): string {
  return value === AUTO_REVIEW ? t('auto.label') : displayPermissionPreset(value, name, key => t(key))
}
function optionDescription(option: PresetOption, t: PermissionSelectProps['t']): string | undefined {
  return option.value === AUTO_REVIEW ? t('auto.description') : option.description
}
/** Registration-owned catalog and current-session command writer. */
export interface PermissionSelectInjected {
  hooks: { permissionCatalog: HostObservable<PermissionCatalogState> }
  select: (preset: string) => Promise<boolean>
}
/** Complete props derived from the conversation slot, injected hooks, and locale. */
export type PermissionSelectProps = PropsRuntime<'conversation.input.permission'> & InjectFace<PermissionSelectInjected> & PropsLocale<typeof PERMISSION_ACCESS_NS>

export const PermissionSelect = defineComponent((props: PermissionSelectProps) => {
  const selection = props.useProjection('permissions')
  const catalog = props.usePermissionCatalog(state => state.value)
  const pick = ref<string | null>(null)
  const open = ref(false)
  const confirmation = ref<string | null>(null)
  const acknowledged = ref(false)
  watchEffect(() => {
    if (!props.locked && selection.value !== undefined && catalog.value !== null
      && (confirmation.value === null || catalog.value.options.some(option => option.value === confirmation.value))) return
    open.value = false
    acknowledged.value = false
    confirmation.value = null
  })
  const closeConfirmation = (): void => {
    acknowledged.value = false
    confirmation.value = null
  }
  const submit = (id: string): void => {
    pick.value = id
    void props.select(id).catch(() => false).then(() => { pick.value = null })
  }
  const choose = (id: string): void => {
    open.value = false
    if (id === selection.value?.currentValue) return
    if (id === FULL_ACCESS || id === AUTO_REVIEW) {
      acknowledged.value = false
      confirmation.value = id
    } else submit(id)
  }
  return () => {
    const currentSelection = selection.value
    const currentCatalog = catalog.value
    if (currentSelection === undefined || currentCatalog === null) return null
    const currentValue = pick.value !== null && currentCatalog.options.some(option => option.value === pick.value)
      ? pick.value : currentSelection.currentValue
    const current = currentCatalog.options.find(option => option.value === currentValue)
    const label = permissionLabel(currentValue, current?.name ?? currentValue, props.t)
    const items: MenuEntry[] = currentCatalog.options.map((option) => {
      const icon = permissionGlyph(option.value, 'menu')
      const text = permissionLabel(option.value, option.name, props.t)
      const badge = option.value === AUTO_REVIEW ? props.t('auto.badge') : undefined
      return {
        id: option.value,
        label: badge === undefined ? text : h('span', { class: css.optionLabel, 'aria-label': `${text} ${badge}` }, [
          h('span', { class: css.optionLabelText }, text), h('span', { class: css.badge }, badge),
        ]),
        ...(icon === undefined ? {} : { icon }),
      }
    })
    const confirm = confirmation.value
    const key = confirm === AUTO_REVIEW ? 'auto.confirm' : 'confirm'
    return h(Fragment, [
      h(Menu, {
        open: open.value, items, selectedId: currentValue, onSelect: choose,
        onClose: () => { open.value = false }, side: 'top', portal: true,
      }, { anchor: () => {
        const icon = permissionGlyph(currentValue, 'trigger')
        return h('button', {
          type: 'button', class: css.trigger, 'aria-label': props.t('mode', { name: label }),
          title: current === undefined ? undefined : optionDescription(current, props.t),
          disabled: props.locked || pick.value !== null || confirmation.value !== null,
          onClick: () => { open.value = !open.value },
        }, [
          icon === undefined ? null : h('span', { class: css.triggerIcon, 'aria-hidden': true }, [icon]),
          h('span', { class: css.triggerLabel }, label),
          h('span', { class: clsx(css.chevron, open.value && css.chevronOpen), 'aria-hidden': true }, [h(IconChevronDownOutlineRegular)]),
        ])
      } }),
      confirm === null ? null : h(RiskConfirmation, {
        open: true, title: props.t(`${key}.title`), description: props.t(`${key}.description`),
        acknowledgeLabel: props.t(`${key}.acknowledge`), cancelLabel: props.t('confirm.cancel'),
        closeLabel: props.t('close'), confirmLabel: props.t(`${key}.enable`),
        acknowledged: acknowledged.value, disabled: props.locked,
        onAcknowledgedChange: (value: boolean) => { acknowledged.value = value },
        onCancel: closeConfirmation,
        onConfirm: () => { closeConfirmation(); submit(confirm) },
      }),
    ])
  }
}, { name: 'PermissionSelect', inheritAttrs: false, props: ['locked', 'select', 'usePermissionCatalog', 'useProjection', 't'] })
