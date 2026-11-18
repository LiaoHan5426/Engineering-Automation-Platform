import { defineComponent, h, computed, shallowRef, type VNodeChild } from 'vue'
/** Base branch picker of the local changes view's `branch` scope: the automatic fork point, then remote-tracking and local branches. */
import clsx from 'clsx'
import {
  IconBranchOutlineRegular,
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconSearchOutlineRegular,
  IconWarningTriangleOutlineRegular,
  Input,
  Menu,
  MenuItemButton,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ForgeBaseBranch, ForgeBaseBranches } from '../types.ts'
import type { NS } from './locales.ts'
import { searchFieldKeyDown } from './menu-search.ts'
import { useBranchSearch, branchSearchStatus } from './branch-search.tsx'
import css from './BaseMenu.module.css'
/** Props of the base branch picker. */
export interface BaseMenuProps extends PropsLocale<typeof NS> {
  /** Chosen branch, or null for the automatic fork point. */
  readonly chosen: ForgeBaseBranch | null
  /** Name the trigger shows: the chosen branch, the automatic fork point, or the automatic choice's own name. */
  readonly label: string
  /** Whether the chosen branch no longer exists. */
  readonly missing: boolean
  /** Whether the owning tab is visible; a hidden tab keeps the menu closed. */
  readonly visible: boolean
  /** Read the branches whose names contain `query`; `signal` aborts the read. */
  readonly list: (query: string, signal: AbortSignal) => Promise<RemoteResult<ForgeBaseBranches>>
  /** Compare with a branch, or with the automatic fork point for null. */
  readonly choose: (base: ForgeBaseBranch | null) => void
}
/** One selectable row: a branch, or the automatic fork point. */
interface BaseOption {
  readonly key: string
  readonly name: string
  readonly base: ForgeBaseBranch | null
  readonly tag?: string
}
/**
 * Render the trigger and, while open, the searchable menu. Opening and each
 * search read the branches again; rows already shown follow the search at once
 * until the new listing arrives.
 * @param props - the choice, the trigger label, the listing read, the choose action, and copy.
 * @returns the trigger with its portalled menu.
 */
export const BaseMenu = defineComponent(
  (props: BaseMenuProps) => {
    const open = shallowRef(false)
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === 'function' ? next(open.value) : next
    }
    const shown = computed(() => props.visible && open.value)
    const { query, listing, field, setQuery, retry, reset } = useBranchSearch(() => shown.value, (text, signal) => props.list(text, signal))
    return () => {
      const close = (): void => {
        setOpen(false)
        reset()
      }
      const pick = (base: ForgeBaseBranch | null): void => {
        close()
        if ((base?.ref ?? null) !== (props.chosen?.ref ?? null)) props.choose(base)
      }
      const value = listing.value?.ok === true ? listing.value.value : null
      const needle = query.value.trim().toLowerCase()
      const matches = (name: string): boolean => name.toLowerCase().includes(needle)
      const automatic = value?.automatic ?? null
      const groups: {
        readonly id: string
        readonly label: string
        readonly options: readonly BaseOption[]
      }[] = [
        {
          id: 'automatic',
          label: props.t('diff.base.automatic'),
          options:
            automatic === null || !matches(automatic.name)
              ? []
              : [
                {
                  key: 'automatic',
                  name: automatic.name,
                  base: null,
                  tag: props.t(automatic.worktree ? 'diff.base.worktree' : 'diff.base.automatic'),
                },
              ],
        },
        {
          id: 'remote',
          label: props.t('diff.base.remote'),
          // The automatic fork point of a code host's default branch is the same comparison as choosing that branch.
          options: (value?.remote ?? [])
            .filter(
              branch =>
                matches(branch.name) &&
                (automatic === null || automatic.worktree || branch.name !== automatic.name),
            )
            .map(branch => ({ key: branch.ref, name: branch.name, base: branch })),
        },
        {
          id: 'local',
          label: props.t('diff.base.local'),
          options: (value?.local ?? [])
            .filter(branch => matches(branch.name))
            .map(branch => ({ key: branch.ref, name: branch.name, base: branch })),
        },
      ].filter(group => group.options.length > 0)
      const first = groups[0]?.options[0]
      const body: VNodeChild = branchSearchStatus({ listing: listing.value, empty: groups.length === 0, retry, className: css.status, t: props.t }) ?? groups.map(group =>
          h('div', { key: group.id, role: 'group', 'aria-label': group.label }, [
            group.id !== 'automatic' &&
              h('div', { class: css.label, role: 'presentation' }, [group.label]),
            group.options.map((option) => {
              const selected = (option.base?.ref ?? null) === (props.chosen?.ref ?? null)
              return h(
                MenuItemButton,
                {
                  key: option.key,
                  current: selected,
                  onSelect: () => {
                    pick(option.base)
                  },
                },
                {
                  icon: () => h(IconBranchOutlineRegular, { size: 14 }),
                  default: () => [
                    h('span', { class: css.option }, [
                      h('span', { class: css.name }, [option.name]),
                      option.tag !== undefined && h('span', { class: css.tag }, [option.tag]),
                      selected &&
                        h(IconCheckOutlineRegular, { size: 14, className: css.check ?? '' }),
                    ]),
                  ],
                },
              )
            }),
          ]),
        )

      return h(
        Menu,
        {
          open: shown.value,
          portal: true,
          dense: true,
          align: 'start',
          className: css.anchor ?? '',
          listClassName: css.menu ?? '',
          onClose: close,
        },
        {
          anchor: () =>
            h(
              Tooltip,
              {
                label: props.t('diff.base.aria', { base: props.label }),
                side: 'bottom',
                portal: true,
                delayMs: 500,
              },
              {
                default: () => [
                  h(
                    'button',
                    {
                      type: 'button',
                      class: clsx(css.trigger, props.missing && css.missing),
                      'aria-haspopup': 'menu',
                      'aria-expanded': shown.value,
                      'aria-label': props.t('diff.base.aria', { base: props.label }),
                      'data-forge-base': props.chosen?.ref ?? '',
                      onClick: () => {
                        if (shown.value) close()
                        else setOpen(true)
                      },
                    },
                    [
                      props.missing &&
                        h(IconWarningTriangleOutlineRegular, {
                          size: 12,
                          className: css.warning ?? '',
                        }),
                      h('span', { class: css.triggerName }, [props.label]),
                      h(IconChevronDownOutlineRegular, { size: 12 }),
                    ],
                  ),
                ],
              },
            ),
          default: () => [
            h('div', { class: css.root, 'data-forge-base-menu': '' }, [
              h('div', { class: css.search }, [
                h(Input, {
                  elementRef: (element: HTMLInputElement | null) => {
                    field.value = element
                  },
                  className: clsx(css.searchInput),
                  icon: h(IconSearchOutlineRegular, { size: 14 }),
                  value: query.value,
                  'aria-label': props.t('diff.base.search'),
                  placeholder: props.t('diff.base.search'),
                  onInput: (event: Event) => {
                    setQuery((event.currentTarget as HTMLInputElement).value)
                  },
                  onKeydown: (event: KeyboardEvent) => {
                    searchFieldKeyDown(
                      event,
                      first === undefined
                        ? undefined
                        : () => {
                          pick(first.base)
                        },
                    )
                  },
                }),
              ]),
              h('div', { class: css.rows }, [body]),
              h('div', { class: css.note }, [props.t('diff.base.note')]),
            ]),
          ],
        },
      )
    }
  },
  { props: ['chosen', 'label', 'missing', 'visible', 'list', 'choose', 't'] },
)
