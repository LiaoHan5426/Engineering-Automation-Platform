/**
 * Appearance preference row registered into the General section item slot
 * (figma 501:30012 'Frame 2117131228'): title + three preference cubes.
 * Registered by this package — the theme feature owns its own settings
 * surface. Selection follows the persisted preference, never the resolved
 * active theme.
 */
import clsx from 'clsx'
import { defineComponent, h } from 'vue'
import {
  IconDarkOutlineMedium, IconFollowsystemOutlineMedium, IconLightOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemePreference } from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceRow.module.css'

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface AppearanceRowInjected {
  /** Switch the theme preference. */
  setTheme: (id: ThemePreference) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type AppearanceRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.theme'> & AppearanceRowInjected

/** Cube order and icons (figma 501:30015-30017: Light, Dark, System). */
const CUBES: readonly { id: ThemePreference; labelKey: ThemeKey; Icon: typeof IconLightOutlineMedium }[] = [
  { id: 'light', labelKey: 'appearance.light', Icon: IconLightOutlineMedium },
  { id: 'dark', labelKey: 'appearance.dark', Icon: IconDarkOutlineMedium },
  { id: 'system', labelKey: 'appearance.system', Icon: IconFollowsystemOutlineMedium },
]

/**
 * Render the Appearance row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export const AppearanceRow = defineComponent((props: AppearanceRowComponentProps) => {
  const preference = props.useStore(s => s.preference)
  return () => h('div', { class: css.group }, [
    h('div', { class: css.title }, props.t('appearance.title')),
    h('div', { class: css.cubeRow }, CUBES.map(({ id, labelKey, Icon }) => h('button', {
      key: id, type: 'button', class: clsx(css.themeCube, preference.value === id && css.selected),
      'aria-pressed': preference.value === id, onClick: () => { props.setTheme(id) },
    }, [h(Icon), props.t(labelKey)]))),
  ])
}, { props: ['t', 'setTheme', 'useStore'], inheritAttrs: false })
