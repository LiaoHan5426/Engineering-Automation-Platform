import { defineComponent, h, computed, shallowRef, type VNodeChild } from 'vue'
/** The changes toolbar's More menu, which holds the view controls a narrow toolbar folds out of its row. */
import clsx from 'clsx'
import {
  IconEllipsisOutlineRegular,
  Menu,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import { foldOf } from './toolbar-fold.ts'
import { lensEntries, lensOfRow, NO_LENS, type LensChoice } from './LensFilter.tsx'
import css from './ChangesTab.module.css'
/** Toolbar state and actions the menu repeats. */
export interface ViewOptions {
  /** Whether any shown file is expanded, so the expansion row collapses them all. */
  readonly anyExpanded: boolean
  /** Whether any file shows, so the expansion row has files to change. */
  readonly hasFiles: boolean
  readonly toggleExpansion: () => void
  readonly split: boolean
  readonly toggleSplit: () => void
  readonly wrap: boolean
  readonly toggleWrap: () => void
  /** Whether test files hide, or undefined when the toolbar offers no test switch. */
  readonly hideTests: boolean | undefined
  readonly toggleTests: () => void
  readonly refresh: () => void
  /** Lenses the menu offers while the lens menu folds, empty while a lens is chosen and its menu stays in the row. */
  readonly lenses: readonly LensChoice[]
  readonly chooseLens: (lens: string | null) => void
  /** Draw the `MenuItemButton` rows of plugin toolbar entries, which fold first; `close` closes the menu. */
  readonly plugins: (close: () => void) => VNodeChild
}
/**
 * Render the More button and its menu, which lists the controls of the toolbar's fold level when it opens (see
 * `observeToolbarFold`), then the rows of plugin toolbar entries; the toolbar's styles hide the button while nothing folds.
 * @param props - the toolbar state and actions, whether the owning tab is visible, and copy.
 * @returns the button and its portalled menu.
 */
export const ViewOptionsMenu = defineComponent(
  (
    props: PropsLocale<typeof NS> & {
      readonly options: ViewOptions
      readonly visible: boolean
    },
  ) => {
    const fold = shallowRef<number | null>(null)
    const setFold = (
      next: typeof fold.value | ((previous: typeof fold.value) => typeof fold.value),
    ) => {
      fold.value = typeof next === 'function' ? next(fold.value) : next
    }
    const open = computed(() => props.visible && fold.value !== null)
    return () => {
      const entries: MenuEntry[] = []
      if (fold.value !== null) {
        entries.push(
          {
            id: 'expansion',
            label: props.t(props.options.anyExpanded ? 'diff.collapseAll' : 'diff.expandAll'),
            disabled: !props.options.hasFiles,
          },
          { id: 'split', label: props.t('diff.splitAria') },
          { id: 'wrap', label: props.t('diff.wrapAria') },
        )
        if (fold.value >= 2 && props.options.hideTests !== undefined)
          entries.push(
            { type: 'separator', id: 'tests-separator' },
            { id: 'tests', label: props.t('tests.hide') },
          )
        if (fold.value >= 2 && props.options.lenses.length > 0)
          entries.push(
            { type: 'separator', id: 'lens-separator' },
            ...lensEntries(props.options.lenses, props.t),
          )
        if (fold.value >= 3)
          entries.push(
            { type: 'separator', id: 'refresh-separator' },
            { id: 'refresh', label: props.t('diff.refresh') },
          )
      }
      const selected = [
        props.options.split && 'split',
        props.options.wrap && 'wrap',
        props.options.hideTests === true && 'tests',
        props.options.lenses.length > 0 && NO_LENS,
      ].filter(item => item !== false)
      const run = (id: string): void => {
        const lens = lensOfRow(id)
        if (lens !== undefined) {
          props.options.chooseLens(lens)
          return
        }
        switch (id) {
          case 'expansion':
            props.options.toggleExpansion()
            break
          case 'split':
            props.options.toggleSplit()
            break
          case 'wrap':
            props.options.toggleWrap()
            break
          case 'tests':
            props.options.toggleTests()
            break
          case 'refresh':
            props.options.refresh()
            break
          /* v8 ignore next -- the menu offers only the rows above */
          default:
            break
        }
      }
      return h(
        Menu,
        {
          open: open.value,
          portal: true,
          dense: true,
          align: 'end',
          autoFocus: true,
          items: entries,
          selectedIds: selected,
          onClose: () => {
            setFold(null)
          },
          onSelect: (id) => {
            setFold(null)
            run(id)
          },
        },
        {
          anchor: () =>
            h(
              Tooltip,
              { label: props.t('diff.moreOptions'), side: 'bottom' },
              {
                default: () => [
                  h(
                    'button',
                    {
                      type: 'button',
                      class: clsx(css.tool, css.more),
                      'aria-label': props.t('diff.moreOptions'),
                      'aria-haspopup': 'menu',
                      'aria-expanded': open.value,
                      'data-forge-view-options': '',
                      onClick: (event) => {
                        setFold(
                          fold.value === null ? foldOf(event.currentTarget as HTMLElement) : null,
                        )
                      },
                    },
                    [h(IconEllipsisOutlineRegular, null)],
                  ),
                ],
              },
            ),
          default: () => [
            fold.value !== null &&
              h('div', { class: css.menuPlugins }, [
                props.options.plugins(() => {
                  setFold(null)
                }),
              ]),
          ],
        },
      )
    }
  },
  { props: ['options', 'visible', 't'] },
)
