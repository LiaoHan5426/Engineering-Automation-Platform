/**
 * Language preference row registered into the General section item slot
 * (figma 501:30011 'Setting-Cell'): title + selector pill opening the locale
 * menu. Registered by this package — the locale feature owns its own
 * settings surface.
 */
import { defineComponent, h, ref } from 'vue'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createLanguageRowStore } from './settings-store.ts'
import css from './LanguageRow.module.css'

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface LanguageRowInjected {
  /** Switch the active locale (a registered locale id). */
  setLocale: (id: string) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type LanguageRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createLanguageRowStore>>
  & PropsLocale<'settings.locale'> & LanguageRowInjected

/**
 * Render the Language row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export const LanguageRow = defineComponent((props: LanguageRowComponentProps) => {
  const active = props.useStore(s => s.active)
  const options = props.useStore(s => s.options)
  const open = ref(false)

  return () => {
    const activeLabel = options.value.find(option => option.id === active.value)?.label ?? active.value
    return h('div', { class: css.row }, [
      h('div', { class: css.rowText }, [h('div', { class: css.title }, props.t('language.title'))]),
      h(Menu, {
        open: open.value,
        onClose: () => { open.value = false },
        items: options.value.map(option => ({ id: option.id, label: option.label })),
        selectedId: active.value,
        onSelect: (id: string) => {
          props.setLocale(id)
          open.value = false
        },
        align: 'end',
        portal: true,
      }, {
        anchor: () => h('button', {
          type: 'button',
          class: css.selector,
          'aria-haspopup': 'menu',
          'aria-expanded': open.value,
          onClick: () => { open.value = !open.value },
        }, [activeLabel, h(IconChevronDownOutlineRegular, { className: css.chevron ?? '' })]),
      }),
    ])
  }
}, {
  name: 'LanguageRow',
  inheritAttrs: false,
  props: ['t', 'setLocale', 'useStore'],
})
