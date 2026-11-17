/**
 * Font settings registered into the General section item slot: the text
 * font-size row, whose disclosure button expands a region holding the font
 * row for each role and the code and terminal size rows. The region starts
 * collapsed on every mount.
 */
import { defineComponent, h, ref, useId } from 'vue'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { FontRole } from '../theme-settings.ts'
import type { createFontRowStore } from './settings-store.ts'
import { FontFamilyRow } from './FontFamilyRow.tsx'
import { FontSizeRow, type FontSizeRowExpander } from './FontSizeRow.tsx'
import css from './FontSettingsGroup.module.css'

/** Injected business face: font writes by role. */
export interface FontSettingsInjected {
  /** Change one role's font list (normalized by the theme service). */
  setFontFamily: (role: FontRole, value: string) => void
  /** Change one role's font size (integer px within its FONT_SIZE_SPECS range). */
  setFontSize: (role: FontRole, px: number) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type FontSettingsGroupProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createFontRowStore>>
  & PropsLocale<'settings.theme'> & FontSettingsInjected

/**
 * Render the text font-size row and its expandable font settings.
 * @param props - composed slot props.
 * @returns the text size row and, when expanded, the font rows.
 */
export const FontSettingsGroup = defineComponent((props: FontSettingsGroupProps) => {
  const open = ref(false)
  const regionId = useId()
  const family = (role: FontRole) => h(FontFamilyRow, { ...props, role,
    setFontFamily: (value: string) => { props.setFontFamily(role, value) } })
  const size = (role: FontRole, expander?: FontSizeRowExpander) => h(FontSizeRow, { ...props, role, expander,
    setFontSize: (px: number) => { props.setFontSize(role, px) } })
  return () => h('div', { class: css.group }, [
    size('text', { open: open.value, controls: regionId, onToggle: () => { open.value = !open.value } }),
    open.value ? h('div', { id: regionId }, [family('text'), family('code'), size('code'), family('terminal'), size('terminal')]) : null,
  ])
}, { props: ['t', 'setFontFamily', 'setFontSize', 'useStore', 'actions'], inheritAttrs: false })
