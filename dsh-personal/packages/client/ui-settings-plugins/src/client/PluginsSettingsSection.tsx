/** Plugins settings section: localized tabs around feature-owned pages. */
import { defineComponent, Fragment, h, ref, useId, watchEffect } from 'vue'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRenderSlots,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginsSettingsLocaleKey } from './locales.ts'
import css from './PluginsSettingsSection.module.css'
/** One tab projected from a `settings.plugins.tab` contribution. */
export interface PluginsSettingsTabEntry {
  id: string
  order: number
  label: string
}
/** Registration-side business face for the section. */
export interface PluginsSettingsSectionInjected {
  hooks: {
    /** Ordered, locale-aware projection of the Plugins tab ledger. */
    tabs: HostObservable<readonly PluginsSettingsTabEntry[]>
  }
}
/** Props the renderer binds for the section. */
export type PluginsSettingsSectionProps = PropsRuntime<'settings.section'> &
  PropsLocale<'settings.plugins'> &
  PropsRenderSlots<'settings.plugins.tab'> &
  InjectFace<PluginsSettingsSectionInjected>
/** Render one Plugins page whose contents arrive from feature-owned tabs; one contribution shows as the page itself. */
export const PluginsSettingsSection = defineComponent(
  (props: PluginsSettingsSectionProps) => {
    const tabsId = useId()
    const tabRefs: Array<HTMLButtonElement | null> = []
    const tabRows = props.useTabs(value => value)
    const activeId = ref<string>()
    const visitedIds = new Set<string>()
    watchEffect(
      () => {
        const rows = tabRows.value
        const active = rows.find(row => row.id === activeId.value)?.id ?? rows[0]?.id
        if (active !== undefined) visitedIds.add(active)
      },
      { flush: 'sync' },
    )
    return () => {
      const { t, renderSlot } = props
      const rows = tabRows.value
      const active = rows.find(row => row.id === activeId.value)?.id ?? rows[0]?.id
      const single = rows.length === 1 ? rows[0] : undefined
      return h(
        'div',
        {
          class: css.section,
        },
        [
          h(
            'h2',
            {
              class: css.heading,
            },
            [t('title')],
          ),
          h(
            'p',
            {
              class: css.intro,
            },
            [t('intro')],
          ),
          rows.length === 0
            ? h(
              'p',
              {
                class: css.empty,
              },
              [t('empty')],
            )
            : single !== undefined
              ? h(
                'div',
                {
                  class: css.panel,
                },
                [renderSlot('settings.plugins.tab', {}, { only: single.id })],
              )
              : h(Fragment, null, [
                h(
                  'div',
                  {
                    class: css.tabs,
                    role: 'tablist',
                    'aria-label': t('tabs'),
                  },
                  [
                    rows.map((row, index) => {
                      const selected = row.id === active
                      return h(
                        'button',
                        {
                          key: row.id,
                          ref: (element) => {
                            tabRefs[index] =
                              element instanceof HTMLButtonElement ? element : null
                          },
                          id: `${tabsId}-tab-${row.id}`,
                          type: 'button',
                          role: 'tab',
                          class: css.tab,
                          'aria-selected': selected,
                          'aria-controls': `${tabsId}-panel-${row.id}`,
                          'data-active': selected ? 'true' : undefined,
                          tabindex: selected ? 0 : -1,
                          onClick: () => {
                            activeId.value = row.id
                          },
                          onKeydown: (event: KeyboardEvent) => {
                            let nextIndex: number
                            switch (event.key) {
                              case 'ArrowRight':
                                nextIndex = (index + 1) % rows.length
                                break
                              case 'ArrowLeft':
                                nextIndex = (index - 1 + rows.length) % rows.length
                                break
                              case 'Home':
                                nextIndex = 0
                                break
                              case 'End':
                                nextIndex = rows.length - 1
                                break
                              default:
                                return
                            }
                            event.preventDefault()
                            const nextRow = rows[nextIndex] as PluginsSettingsTabEntry
                            const nextTab = tabRefs[nextIndex] as HTMLButtonElement
                            activeId.value = nextRow.id
                            nextTab.focus()
                          },
                        },
                        [row.label],
                      )
                    }),
                  ],
                ),
                rows
                  .filter(row => row.id === active || visitedIds.has(row.id))
                  .map((row) => {
                    const selected = row.id === active
                    return h(
                      'div',
                      {
                        key: row.id,
                        id: `${tabsId}-panel-${row.id}`,
                        class: css.panel,
                        role: 'tabpanel',
                        'aria-labelledby': `${tabsId}-tab-${row.id}`,
                        hidden: !selected,
                      },
                      [renderSlot('settings.plugins.tab', {}, { only: row.id })],
                    )
                  }),
              ]),
        ],
      )
    }
  },
  { name: 'PluginsSettingsSection', props: ['t', 'renderSlot', 'useTabs'] },
)
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Built-in plugins section and plugin configuration page copy. */
    'settings.plugins': PluginsSettingsLocaleKey
  }
}
