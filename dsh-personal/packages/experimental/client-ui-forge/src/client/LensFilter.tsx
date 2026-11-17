import { defineComponent, h, Fragment, shallowRef, type VNodeChild } from 'vue'
/** The changes toolbar's filter lens menu: the Host's lenses with the files each keeps among the shown files. */
import {
  IconChevronDownOutlineRegular,
  IconLayersOutlineRegular,
  IconLoadingOutlineRegular,
  Menu,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { LensRun } from './lens-filter.ts'
import type { NS } from './locales.ts'
import css from './LensFilter.module.css'
/** One lens the view offers. */
export interface LensChoice {
  /** Identity of the Host lens. */
  readonly id: string
  /** Title in the current language, or the identity when no Client plugin describes it. */
  readonly title: string
  /** Files the lens keeps among the shown files, or null before it ran for them. */
  readonly count: number | null
}
/** Menu row identity of choosing no lens. */
export const NO_LENS = 'lens:none'
/**
 * Menu row identity of choosing a lens.
 * @param id - the lens identity.
 * @returns the row identity.
 */
export function lensRowId(id: string): string {
  return `lens:${id}`
}
/**
 * Read the lens a menu row chooses.
 * @param row - a row identity.
 * @returns the lens identity, null for no lens, or undefined for a row that chooses no lens.
 */
export function lensOfRow(row: string): string | null | undefined {
  if (row === NO_LENS) return null
  return row.startsWith('lens:') ? row.slice('lens:'.length) : undefined
}
/**
 * The rows that choose a lens: a heading, No lens, and each lens with its count.
 * @param lenses - the lenses offered.
 * @param t - forge panel copy.
 * @returns the menu entries.
 */
export function lensEntries(
  lenses: readonly LensChoice[],
  t: PropsLocale<typeof NS>['t'],
): MenuEntry[] {
  return [
    { type: 'label', id: 'lens:heading', text: t('filterLens.heading') },
    { id: NO_LENS, label: t('filterLens.none') },
    ...lenses.map((lens): MenuEntry => ({
      id: lensRowId(lens.id),
      label: h('span', { class: css.row }, [
        h('span', { class: css.rowLabel }, [lens.title]),
        h('span', { class: css.rowCount }, [lens.count ?? '—']),
      ]),
    })),
  ]
}
/**
 * Render the lens menu button: Lens while none is chosen; the chosen lens's title, tinted, with the files it keeps, or
 * its progress while it runs.
 * @param props - the offered lenses, the chosen one, its run, the choose action, whether the owning tab is visible, and copy.
 * @returns the trigger with its portalled menu.
 */
export const LensFilterMenu = defineComponent(
  (
    props: PropsLocale<typeof NS> & {
      readonly lenses: readonly LensChoice[]
      readonly chosen: LensChoice | null
      readonly run: LensRun
      readonly choose: (lens: string | null) => void
      readonly visible: boolean
    },
  ) => {
    const open = shallowRef(false)
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === 'function' ? next(open.value) : next
    }
    return () => {
      let status: VNodeChild = null
      if (props.run.kind === 'running') {
        status = h(Fragment, null, [
          h(IconLoadingOutlineRegular, { size: 12, className: css.spin ?? '' }),
          props.run.done !== null &&
            props.run.total !== null &&
            h('span', { class: css.count }, [
              props.t('filterLens.progress', {
                done: String(props.run.done),
                total: String(props.run.total),
              }),
            ]),
        ])
      } else if (props.chosen?.count !== null && props.chosen?.count !== undefined) {
        status = h('span', { class: css.count }, [props.chosen.count])
      }
      return h(
        Menu,
        {
          open: props.visible && open.value,
          portal: true,
          dense: true,
          align: 'start',
          autoFocus: true,
          items: lensEntries(props.lenses, props.t),
          selectedId: props.chosen === null ? NO_LENS : lensRowId(props.chosen.id),
          onClose: () => {
            setOpen(false)
          },
          onSelect: (row) => {
            setOpen(false)
            const lens = lensOfRow(row)
            /* v8 ignore next -- the menu offers only rows that choose a lens */
            if (lens === undefined) return
            props.choose(lens)
          },
        },
        {
          anchor: () =>
            h(
              'button',
              {
                type: 'button',
                class: css.trigger,
                'aria-haspopup': 'menu',
                'aria-expanded': props.visible && open.value,
                'aria-label':
                  props.chosen === null
                    ? props.t('filterLens.aria')
                    : props.t('filterLens.chosenAria', { lens: props.chosen.title }),
                'data-active': props.chosen === null ? undefined : '',
                'data-forge-filter-lens': props.chosen?.id ?? '',
                onClick: () => {
                  setOpen(value => !value)
                },
              },
              [
                h(IconLayersOutlineRegular, { size: 14 }),
                h('span', { class: css.label }, [
                  props.chosen === null ? props.t('filterLens.label') : props.chosen.title,
                ]),
                status,
                h(IconChevronDownOutlineRegular, { size: 12 }),
              ],
            ),
        },
      )
    }
  },
  { props: ['lenses', 'chosen', 'run', 'choose', 'visible', 't'] },
)
