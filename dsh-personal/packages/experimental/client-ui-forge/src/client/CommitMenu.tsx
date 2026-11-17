import { defineComponent, h, Fragment, computed, shallowRef, watch, type VNodeChild } from 'vue'
/**
 * Commit picker of the changes header: every commit, or one commit, or with Shift a run of consecutive commits of a
 * change request or of the local `branch` scope, listed oldest first like the code host's commit list. A run is
 * accepted only when each of its commits has the one listed before it as its first parent.
 */
import clsx from 'clsx'
import {
  Button,
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  Menu,
  MenuItemButton,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ForgeCommitList } from '@deepseek-ai/dsh-experimental-forge/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { rangeStart } from '../commit-range.ts'
import type { ForgeCommitRange, ForgeLocalCommits } from '../types.ts'
import { formatAgo } from './format.ts'
import type { NS } from './locales.ts'
import css from './CommitMenu.module.css'
/** Characters of a commit object name the picker shows. */
const SHORT = 7
/** Props of the commit picker. */
export interface CommitMenuProps extends PropsLocale<typeof NS> {
  /** Commits shown, or null for all of them. */
  readonly chosen: ForgeCommitRange | null
  /** Whether the owning tab is visible; a hidden tab keeps the menu closed. */
  readonly visible: boolean
  /** Read the commits; null means the source cannot show single commits. `signal` aborts the read. */
  readonly list: (
    signal: AbortSignal,
  ) => Promise<RemoteResult<ForgeCommitList | ForgeLocalCommits | null>>
  /** Which commits a truncated list keeps: a change request lists its oldest ones, the local branch its newest ones. */
  readonly kept: 'oldest' | 'newest'
  /** Changes when the commits may have changed, such as a new head commit or a refresh; the commits are read once per value. */
  readonly version: string
  /** Show consecutive commits, or every commit for null. */
  readonly choose: (commits: ForgeCommitRange | null) => void
}
/**
 * Name the shown commits on the trigger.
 * @param chosen - the shown commits, or null for all of them.
 * @param t - forge panel copy.
 * @returns the label.
 */
export function commitsLabel(
  chosen: ForgeCommitRange | null,
  t: PropsLocale<typeof NS>['t'],
): string {
  if (chosen === null) return t('commits.all')
  if (chosen.from === chosen.to) return chosen.from.slice(0, SHORT)
  return t('commits.range', { from: chosen.from.slice(0, SHORT), to: chosen.to.slice(0, SHORT) })
}
/**
 * Render the trigger and, while open, the commit list. A click shows one commit; a Shift click shows the commits
 * from the last commit clicked without Shift to the clicked one.
 * @param props - the shown commits, the listing read, the choose action, and copy.
 * @returns the trigger with its portalled menu, or nothing when the source cannot show single commits.
 */
export const CommitMenu = defineComponent(
  (props: CommitMenuProps) => {
    const open = shallowRef(false)
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === 'function' ? next(open.value) : next
    }
    const attempt = shallowRef(0)
    const setAttempt = (
      next: typeof attempt.value | ((previous: typeof attempt.value) => typeof attempt.value),
    ) => {
      attempt.value = typeof next === 'function' ? next(attempt.value) : next
    }
    const rejected = shallowRef(false)
    const setRejected = (
      next: typeof rejected.value | ((previous: typeof rejected.value) => typeof rejected.value),
    ) => {
      rejected.value = typeof next === 'function' ? next(rejected.value) : next
    }
    const listing = shallowRef<{
      readonly key: string
      readonly result: RemoteResult<ForgeCommitList | ForgeLocalCommits | null>
    } | null>(null)
    const setListing = (
      next: typeof listing.value | ((previous: typeof listing.value) => typeof listing.value),
    ) => {
      listing.value = typeof next === 'function' ? next(listing.value) : next
    }
    const shift = shallowRef(false)
    const anchor = shallowRef<string | null>(props.chosen?.from ?? null)
    const loaded = shallowRef<string | null>(null)
    const shown = computed(() => props.visible && open.value)
    const key = computed(() => `${props.version}\n${String(attempt.value)}`)
    const current = computed(() =>
      listing.value?.key === key.value ? listing.value.result : null,
    )
    // The list is read once per version, which also tells whether the source has commits to pick, and again on a retry.
    watch(
      () => [props.visible, key.value, props.list],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          if (!props.visible || loaded.value === key.value) return
          const requestKey = key.value
          const controller = new AbortController()
          void props.list(controller.signal).then((result) => {
            if (controller.signal.aborted) return
            loaded.value = requestKey
            setListing({ key: requestKey, result })
          })
          return () => {
            controller.abort()
          }
        })()
        if (typeof dispose === 'function') onCleanup(dispose)
      },
      { immediate: true, flush: 'post' },
    )
    return () => {
      if (current.value?.ok === true && current.value.value === null) return null
      const commits =
        current.value?.ok === true && current.value.value !== null ? current.value.value : null
      const close = (): void => {
        setOpen(false)
        setRejected(false)
      }
      const pick = (sha: string | null): void => {
        if (sha === null || commits === null) {
          close()
          anchor.value = null
          if (props.chosen !== null) props.choose(null)
          return
        }
        const order = commits.commits.map(commit => commit.sha)
        const start =
          shift.value && anchor.value !== null && order.includes(anchor.value) ? anchor.value : sha
        const [from, to] = order.indexOf(start) <= order.indexOf(sha) ? [start, sha] : [sha, start]
        // Two ends cannot name a run that leaves the first-parent line, so the menu stays open and says why.
        if (rangeStart(commits.commits, { from, to }) === 'not-linear') {
          setRejected(true)
          return
        }
        close()
        if (!shift.value || start === sha) anchor.value = sha
        if (from !== props.chosen?.from || to !== props.chosen.to) props.choose({ from, to })
      }
      const inChosen = (index: number): boolean => {
        if (props.chosen === null || commits === null) return false
        const order = commits.commits.map(commit => commit.sha)
        return (
          index >= order.indexOf(props.chosen.from) &&
          index <= order.indexOf(props.chosen.to) &&
          order.includes(props.chosen.from)
        )
      }
      let body: VNodeChild
      if (current.value === null) {
        body = h('div', { class: css.status, role: 'status' }, [
          h(StateDot, { state: 'ongoing' }),
          props.t('commits.loading'),
        ])
      } else if (!current.value.ok || commits === null) {
        body = h('div', { class: css.status, role: 'status' }, [
          h('span', null, [props.t('commits.failed')]),
          h(
            Button,
            {
              size: 'sm',
              variant: 'outline',
              onClick: () => {
                setAttempt(count => count + 1)
              },
            },
            { default: () => [props.t('retry')] },
          ),
        ])
      } else {
        const now = Date.now()
        body = h(Fragment, null, [
          h(
            MenuItemButton,
            {
              current: props.chosen === null,
              onSelect: () => {
                pick(null)
              },
            },
            {
              default: () => [
                h('span', { class: css.option }, [
                  h('span', { class: css.allTitle }, [props.t('commits.all')]),
                  h('span', { class: css.meta }, [
                    props.t('commits.count', { count: commits.commits.length }),
                  ]),
                  props.chosen === null &&
                    h(IconCheckOutlineRegular, { size: 14, className: css.check ?? '' }),
                ]),
              ],
            },
          ),
          commits.commits.length > 0 &&
            h('div', { class: css.label, role: 'presentation' }, [props.t('commits.shiftHint')]),
          commits.commits.map((commit, index) => {
            const selected = inChosen(index)
            return h(
              MenuItemButton,
              {
                key: commit.sha,
                current: selected,
                onSelect: () => {
                  pick(commit.sha)
                },
              },
              {
                default: () => [
                  h('span', { class: css.option, 'data-forge-commit': commit.sha }, [
                    h('span', { class: css.sha }, [commit.sha.slice(0, SHORT)]),
                    h('span', { class: css.title }, [commit.title]),
                    h('span', { class: css.meta }, [
                      formatAgo(commit.authoredAt, now, props.t) ?? '',
                    ]),
                    h('span', { class: clsx(css.check, !selected && css.unchecked) }, [
                      h(IconCheckOutlineRegular, { size: 14 }),
                    ]),
                  ]),
                ],
              },
            )
          }),
          commits.truncated &&
            h('div', { class: css.note }, [
              props.t(
                props.kept === 'oldest' ? 'commits.truncatedOldest' : 'commits.truncatedNewest',
                { count: commits.commits.length },
              ),
            ]),
        ])
      }
      const label = commitsLabel(props.chosen, props.t)
      return h(
        Menu,
        {
          open: shown.value,
          portal: true,
          dense: true,
          align: 'end',
          className: css.anchor ?? '',
          listClassName: css.menu ?? '',
          onClose: close,
        },
        {
          anchor: () =>
            h(
              Tooltip,
              {
                label: props.t('commits.aria', { commits: label }),
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
                      class: clsx(css.trigger, props.chosen !== null && css.chosen),
                      'aria-haspopup': 'menu',
                      'aria-expanded': shown.value,
                      'aria-label': props.t('commits.aria', { commits: label }),
                      'data-forge-commits':
                        props.chosen === null ? '' : `${props.chosen.from}..${props.chosen.to}`,
                      onClick: () => {
                        setOpen(value => !value)
                        setRejected(false)
                      },
                    },
                    [
                      h('span', { class: css.triggerName }, [label]),
                      h(IconChevronDownOutlineRegular, { size: 12 }),
                    ],
                  ),
                ],
              },
            ),
          default: () => [
            h(
              'div',
              {
                class: css.rows,
                'data-forge-commit-menu': '',
                onClickCapture: (event: MouseEvent) => {
                  shift.value = event.shiftKey
                },
                onKeydownCapture: (event: KeyboardEvent) => {
                  shift.value = event.shiftKey
                },
              },
              [body],
            ),
            rejected.value &&
              h('div', { class: css.rejected, role: 'status' }, [props.t('commits.notLinear')]),
          ],
        },
      )
    }
  },
  { props: ['chosen', 'visible', 'list', 'kept', 'version', 'choose', 't'] },
)
