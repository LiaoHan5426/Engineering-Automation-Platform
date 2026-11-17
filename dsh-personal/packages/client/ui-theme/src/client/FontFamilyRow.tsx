/**
 * Font-family preference row rendered inside the font settings group, once
 * per font role: title + role description + a text field holding the
 * comma-separated family list. Blur or Enter normalizes and commits the list;
 * an empty field restores the built-in stack. The field shows the persisted
 * list and resets whenever that list changes.
 */
import clsx from 'clsx'
import { defineComponent, h } from 'vue'
import { Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { normalizeFontFamily, type FontRole } from '../theme-settings.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createFontRowStore } from './settings-store.ts'
import rowCss from './FontSizeRow.module.css'
import css from './FontFamilyRow.module.css'

/** Injected business face: the row's font role and its write. */
export interface FontFamilyRowInjected {
  /** Font role this row edits. */
  role: FontRole
  /** Change this role's font list (normalized by the theme service). */
  setFontFamily: (value: string) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type FontFamilyRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createFontRowStore>>
  & PropsLocale<'settings.theme'> & FontFamilyRowInjected

/**
 * Render one font-family row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export const FontFamilyRow = defineComponent((props: FontFamilyRowComponentProps) => {
  const value = props.useStore(s => s.fontFamilies[props.role])
  const commit = (input: HTMLInputElement): void => {
    input.value = normalizeFontFamily(input.value)
    props.setFontFamily(input.value)
  }
  return () => {
    const { t, role } = props
    const title = t(`fontFamily.${role}.title`)
    return h('div', { class: clsx(rowCss.row, rowCss.stacked) }, [
      h('div', { class: rowCss.rowText }, [
        h('div', { class: rowCss.title }, title),
        h('div', { class: rowCss.desc }, t(`fontFamily.${role}.description`)),
      ]),
      h(Input, { key: value.value, className: clsx(css.field), defaultValue: value.value,
        placeholder: t('fontFamily.placeholder'), 'aria-label': title, spellcheck: false, autocomplete: 'off',
        onBlur: (event: FocusEvent) => { commit(event.currentTarget as HTMLInputElement) }, maxlength: 200,
        onKeydown: (event: KeyboardEvent) => {
          // oxlint-disable-next-line typescript/no-deprecated -- Some IMEs report composition only through keyCode 229.
          if (event.isComposing || event.keyCode === 229) return
          if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur()
        },
      }),
    ])
  }
}, { props: ['t', 'role', 'setFontFamily', 'useStore'], inheritAttrs: false })
