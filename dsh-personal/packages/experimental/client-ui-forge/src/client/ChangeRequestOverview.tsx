import {
  type Ref,
  type VNodeChild,
  onScopeDispose,
  defineComponent,
  computed,
  shallowRef,
  watch,
  h,
  Fragment,
  onMounted,
} from 'vue'
import clsx from 'clsx'
import {
  Button,
  IconChevronRightOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconSearchOutlineRegular,
  IconUserOutlineRegular,
  Input,
  Menu,
  MenuItemButton,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BranchUpdateRequest,
  ChangeRequestCheck,
  ChangeRequestIssue,
  ChangeRequestReviewer,
  ChangeRequestSnapshot,
  ForgeRerunRequest,
  ForgeReviewerCandidate,
  ReviewVerdict,
} from '@deepseek-ai/dsh-experimental-forge/types'
import type { ForgePanelChangeRequest } from '../types.ts'
import { formatDuration } from './format.ts'
import { CheckGlyph } from './glyphs.tsx'
import type { ForgePanelKey, NS } from './locales.ts'
import { checkCounts, checkDuration } from './status.ts'
import { searchFieldKeyDown } from './menu-search.ts'
import css from './ForgeTab.module.css'
import overview from './ChangeRequestOverview.module.css'
type Translate = PropsLocale<typeof NS>['t']
/** Milliseconds between the last keystroke of a reviewer search and the listing it reads. */
const SEARCH_DELAY_MS = 150
/** Avatars the review row shows before it counts the rest. */
const AVATARS = 3
/** Requests reviews of a change request from more reviewers; settles once the outcome is reported. */
type RequestReviews = (
  entry: ForgePanelChangeRequest,
  reviewers: readonly Pick<ChangeRequestReviewer, 'kind' | 'login'>[],
) => Promise<void>
/** Lists the accounts a review of the change request at `url` can be requested from. */
type ListCandidates = (
  url: string,
  query: string,
  signal: AbortSignal,
) => Promise<readonly ForgeReviewerCandidate[]>
/** Overview actions of a card; a surface without a Session binding omits them. */
export interface OverviewActions {
  /** Rerun the failed checks; settles once the outcome is reported. */
  readonly rerunChecks?:
    | ((entry: ForgePanelChangeRequest, request: ForgeRerunRequest) => Promise<void>)
    | undefined
  /** Request reviews from more reviewers; settles once the outcome is reported. */
  readonly requestReviews?: RequestReviews | undefined
  /** List accounts a review can be requested from; rejects with the host's reason. */
  readonly reviewerCandidates?: ListCandidates | undefined
  /** Bring the base branch's new commits into the head branch; settles once the outcome is reported. */
  readonly updateBranch?:
    | ((entry: ForgePanelChangeRequest, request: BranchUpdateRequest) => Promise<void>)
    | undefined
}
/** One action at a time per control: it stays disabled until the previous action settles. */
function useBusy(): readonly [Readonly<Ref<boolean>>, (action: () => Promise<void>) => void] {
  const busy = shallowRef(false)
  let active = true
  onScopeDispose(() => {
    active = false
  })
  return [
    busy,
    (action) => {
      if (!active || busy.value) return
      busy.value = true
      void action().finally(() => {
        if (active) busy.value = false
      })
    },
  ]
}
/**
 * The parts of one fact row: its glyph, its one-line value after the fact's name, which only assistive technology
 * reads unless the value names the fact itself, an optional trailing part, and the chevron of a row that opens something.
 * @param props - the fact's name for assistive technology, the glyph, the value with its tone, the trailing part, and
 * whether the row opens something.
 * @returns the row's cells.
 */
export function RowParts({
  label,
  icon,
  value,
  tone,
  trailing,
  opens,
}: {
  readonly label: string | undefined
  readonly icon: VNodeChild
  readonly value: VNodeChild
  readonly tone?: string | undefined
  readonly trailing?: VNodeChild
  readonly opens: boolean
}): VNodeChild {
  return h(Fragment, null, [
    h(
      'span',
      {
        class: css.rowIcon,
      },
      [icon],
    ),
    h(
      'span',
      {
        class: css.rowValue,
        'data-tone': tone,
      },
      [
        label !== undefined &&
          h(
            'span',
            {
              class: css.visuallyHidden,
            },
            [label],
          ),
        h(
          'span',
          {
            class: css.ellipsis,
          },
          [value],
        ),
      ],
    ),
    trailing !== undefined &&
      h(
        'span',
        {
          class: css.rowTrailing,
        },
        [trailing],
      ),
    opens &&
      h(IconChevronRightOutlineRegular, {
        size: 12,
        className: css.rowChevron ?? '',
      }),
  ])
}
type CheckGroup = 'failed' | 'running' | 'cancelled' | 'passed' | 'other'
/** Groups that need attention, listed whenever the menu opens. */
const ATTENTION: readonly CheckGroup[] = ['failed', 'running', 'cancelled']
/** Groups the menu lists only on request. */
const QUIET: readonly CheckGroup[] = ['passed', 'other']
const GROUP_LABEL: Record<CheckGroup, ForgePanelKey> = {
  failed: 'checks.group.failed',
  running: 'checks.group.running',
  cancelled: 'checks.group.cancelled',
  passed: 'checks.group.passed',
  other: 'checks.group.other',
}
function groupOf(check: ChangeRequestCheck): CheckGroup {
  switch (check.state) {
    case 'failure':
      return 'failed'
    case 'pending':
      return 'running'
    case 'success':
      return 'passed'
    case 'cancelled':
      return 'cancelled'
    case 'neutral':
    case 'skipped':
      return 'other'
  }
}
function checkTime(check: ChangeRequestCheck, t: Translate): string {
  if (check.state === 'pending')
    return t(check.startedAt === null ? 'change.check.queued' : 'change.check.running')
  const elapsed = checkDuration(check)
  return elapsed === undefined ? '' : formatDuration(elapsed, t)
}
/** The checks outcome in a few words: what needs attention, else that all passed. */
function checksValue(snapshot: ChangeRequestSnapshot, t: Translate): string {
  if (snapshot.checksTruncated)
    return t('change.checks.truncated', { count: snapshot.checks.length })
  const counts = checkCounts(snapshot.checks)
  const parts = [
    ...(counts.failed > 0 ? [t('change.checks.failed', { count: counts.failed })] : []),
    ...(counts.running > 0 ? [t('change.checks.running', { count: counts.running })] : []),
    ...(counts.cancelled > 0 ? [t('change.checks.cancelled', { count: counts.cancelled })] : []),
  ]
  return parts.length > 0
    ? parts.join(' · ')
    : t('checks.allPassed', { count: counts.passed + counts.other })
}
type CheckRead =
  | {
    readonly kind: 'idle' | 'loading'
  }
  | {
    readonly kind: 'ready'
    readonly snapshot: ChangeRequestSnapshot
  }
  | {
    readonly kind: 'failed'
    readonly message: string
  }
/** Props of the checks row. */
export interface ChecksRowProps {
  readonly entry: ForgePanelChangeRequest
  readonly snapshot: ChangeRequestSnapshot
  readonly openLink: (url: string) => void
  /** Load complete check details independently of polling; cancellation follows the open menu. */
  readonly readChecks:
    | ((url: string, headSha: string, signal: AbortSignal) => Promise<ChangeRequestSnapshot>)
    | undefined
  readonly rerunChecks: OverviewActions['rerunChecks']
  readonly t: Translate
}
/**
 * Whether a failed check names a rerun that none of the checks sharing it still waits for, as a rerun of checks in
 * progress cannot start.
 * @param checks - the checks of the head commit.
 * @returns whether a rerun of failed checks can start.
 */
function rerunnable(checks: readonly ChangeRequestCheck[]): boolean {
  const running = new Set(
    checks.flatMap(check =>
      check.state === 'pending' && check.rerun !== null ? [check.rerun] : [],
    ),
  )
  return checks.some(
    check => check.state === 'failure' && check.rerun !== null && !running.has(check.rerun),
  )
}
/**
 * Render the checks outcome as a row whose menu lists the failed, running, and cancelled checks by group, offers to
 * rerun the failed ones, and lists the passed and skipped ones on request. A list the poll read only in part is
 * completed while the menu is open.
 * @param props - the change request, its snapshot, the link and read actions, the rerun action, and copy.
 * @returns the row with its menu.
 */
export const ChecksRow = defineComponent(
  (props: ChecksRowProps) => {
    const entry = computed(() => props.entry)
    const snapshot = computed(() => props.snapshot)
    const openLink = computed(() => props.openLink)
    const readChecks = computed(() => props.readChecks)
    const rerunChecks = computed(() => props.rerunChecks)
    const t = computed(() => props.t)
    const open = shallowRef(false)
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === 'function' ? next(open.value) : next
    }
    const quiet = shallowRef(false)
    const setQuiet = (
      next: typeof quiet.value | ((previous: typeof quiet.value) => typeof quiet.value),
    ) => {
      quiet.value = typeof next === 'function' ? next(quiet.value) : next
    }
    const read = shallowRef<CheckRead>({ kind: 'idle' })
    const setRead = (next: CheckRead | ((previous: CheckRead) => CheckRead)) => {
      read.value = typeof next === 'function' ? next(read.value) : next
    }
    const attempt = shallowRef(0)
    const setAttempt = (
      next: typeof attempt.value | ((previous: typeof attempt.value) => typeof attempt.value),
    ) => {
      attempt.value = typeof next === 'function' ? next(attempt.value) : next
    }
    const [busy, run] = useBusy()
    const derived1 = computed(() => snapshot.value)
    const url = computed(() => derived1.value.url)
    const headSha = computed(() => derived1.value.headSha)
    const checksTruncated = computed(() => derived1.value.checksTruncated)
    const displayed = computed(() =>
      read.value.kind === 'ready' && read.value.snapshot.headSha === headSha.value
        ? read.value.snapshot
        : snapshot.value,
    )
    const counts = computed(() => checkCounts(displayed.value.checks))
    const rerun = computed(() =>
      displayed.value.state === 'open' &&
      displayed.value.canRerunChecks &&
      rerunnable(displayed.value.checks)
        ? rerunChecks.value
        : undefined,
    )
    const groups = (
      list: readonly CheckGroup[],
    ): {
      readonly group: CheckGroup
      readonly checks: ChangeRequestCheck[]
    }[] =>
      list
        .map(group => ({
          group,
          checks: displayed.value.checks.filter(check => groupOf(check) === group),
        }))
        .filter(({ checks }) => checks.length > 0)
    const quietCount = computed(() => counts.value.passed + counts.value.other)
    const close = (): void => {
      setOpen(false)
      setQuiet(false)
    }
    const rows = (list: readonly CheckGroup[]): VNodeChild =>
      groups(list).map(({ group, checks }) =>
        h(
          'div',
          {
            key: group,
            role: 'group',
            'aria-label': t.value(GROUP_LABEL[group]),
            'data-forge-check-group': group,
          },
          [
            h(
              'div',
              {
                class: overview.menuLabel,
                role: 'presentation',
              },
              [`${t.value(GROUP_LABEL[group])} · ${checks.length}`],
            ),
            checks.map((check, index) => {
              const link = check.url
              return h(
                MenuItemButton,
                {
                  key: index,
                  icon: h(CheckGlyph, {
                    state: check.state,
                    size: 14,
                  }),
                  disabled: link === null,
                  onSelect:
                    link === null
                      ? close
                      : () => {
                        close()
                        openLink.value(link)
                      },
                },
                {
                  default: () => [
                    h(
                      'span',
                      {
                        class: overview.check,
                        'data-forge-check-item': check.state,
                      },
                      [
                        h(
                          'span',
                          {
                            class: css.ellipsis,
                          },
                          [check.name],
                        ),
                        h(
                          'span',
                          {
                            class: overview.checkTime,
                          },
                          [checkTime(check, t.value)],
                        ),
                      ],
                    ),
                  ],
                },
              )
            }),
          ],
        ),
      )
    const rollup = computed(() =>
      displayed.value.checksRollup === 'none' ? 'neutral' : displayed.value.checksRollup,
    )
    onMounted(() =>
      watch(
        [
          () => open.value,
          () => url.value,
          () => headSha.value,
          () => checksTruncated.value,
          () => readChecks.value,
          () => attempt.value,
        ],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (!open.value || !checksTruncated.value || readChecks.value === undefined) {
              setRead({ kind: 'idle' })
              return
            }
            const readCurrent = readChecks.value
            const controller = new AbortController()
            setRead({ kind: 'loading' })
            void (async () => {
              try {
                const result = await readCurrent(url.value, headSha.value, controller.signal)
                if (!controller.signal.aborted) setRead({ kind: 'ready', snapshot: result })
              } catch (error) {
                if (!controller.signal.aborted)
                  setRead({
                    kind: 'failed',
                    message: error instanceof Error ? error.message : String(error),
                  })
              }
            })()
            return () => {
              controller.abort()
            }
          })()
          if (typeof cleanup === 'function') onCleanup(cleanup)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    return () => {
      if (displayed.value.checks.length === 0 && !displayed.value.checksTruncated) {
        return h(
          'div',
          {
            class: css.row,
          },
          [
            h(RowParts, {
              label: t.value('change.row.checks'),
              icon: h(CheckGlyph, {
                state: 'neutral',
              }),
              value: t.value('change.ci.none'),
              opens: false,
            }),
          ],
        )
      }
      return h(
        Menu,
        {
          open: open.value,
          onClose: close,
          portal: true,
          dense: true,
          align: 'end',
          className: overview.rowAnchor ?? '',
          listClassName: overview.menu ?? '',
        },
        {
          default: () => [
            rerun.value !== undefined &&
              h(
                MenuItemButton,
                {
                  icon: h(IconRefreshOutlineRegular, {
                    size: 14,
                  }),
                  disabled: busy.value,
                  onSelect: () => {
                    close()
                    const action = rerun.value
                    if (action) run(() => action(entry.value, { headSha: headSha.value }))
                  },
                },
                {
                  default: () => [t.value('checks.rerunFailed')],
                },
              ),
            rows(ATTENTION),
            quiet.value
              ? rows(QUIET)
              : quietCount.value > 0 &&
                h(
                  MenuItemButton,
                  {
                    separatorBefore:
                      counts.value.failed + counts.value.running + counts.value.cancelled > 0,
                    icon: h(CheckGlyph, {
                      state: counts.value.passed > 0 ? 'success' : 'skipped',
                      size: 14,
                    }),
                    onSelect: () => {
                      setQuiet(true)
                    },
                  },
                  {
                    default: () => [t.value('checks.showQuiet', { count: quietCount.value })],
                  },
                ),
            read.value.kind === 'loading' &&
              h(
                'div',
                {
                  class: overview.menuStatus,
                  role: 'status',
                },
                [
                  h(StateDot, {
                    state: 'ongoing',
                    size: 12,
                  }),
                  t.value('change.checks.loading'),
                ],
              ),
            read.value.kind === 'failed' &&
              h(
                'div',
                {
                  class: overview.menuStatus,
                  role: 'status',
                },
                [
                  h('span', null, [
                    t.value('change.checks.loadFailed', { message: read.value.message }),
                  ]),
                  h(
                    Button,
                    {
                      size: 'sm',
                      variant: 'outline',
                      onClick: () => {
                        setAttempt(value => value + 1)
                      },
                    },
                    {
                      default: () => [t.value('change.checks.retry')],
                    },
                  ),
                ],
              ),
          ],
          anchor: () =>
            h(
              'button',
              {
                type: 'button',
                class: clsx(css.row, css.rowButton),
                'aria-haspopup': 'menu',
                'aria-expanded': open.value,
                'data-forge-checks': '',
                onClick: () => {
                  if (open.value) close()
                  else setOpen(true)
                },
              },
              [
                h(RowParts, {
                  label: t.value('change.row.checks'),
                  icon: h(CheckGlyph, {
                    state: rollup.value,
                  }),
                  value: checksValue(displayed.value, t.value),
                  opens: true,
                  tone:
                    !displayed.value.checksTruncated && counts.value.failed > 0
                      ? 'error'
                      : undefined,
                }),
              ],
            ),
        },
      )
    }
  },
  {
    props: ['entry', 'snapshot', 'openLink', 'readChecks', 'rerunChecks', 't'],
    inheritAttrs: false,
  },
)
const VERDICT: Record<
  ReviewVerdict,
  {
    readonly key: ForgePanelKey
    readonly tone: string | undefined
  }
> = {
  approved: { key: 'reviewers.approved', tone: 'success' },
  'changes-requested': { key: 'reviewers.changesRequested', tone: 'error' },
  commented: { key: 'reviewers.commented', tone: undefined },
  dismissed: { key: 'reviewers.dismissed', tone: undefined },
}
const Avatar = defineComponent(
  (props: { readonly url: string | null; readonly login: string; readonly size?: number }) => {
    const url = computed(() => props.url)
    const login = computed(() => props.login)
    const size = computed(() => props.size ?? 20)
    const broken = shallowRef(false)
    const setBroken = (
      next: typeof broken.value | ((previous: typeof broken.value) => typeof broken.value),
    ) => {
      broken.value = typeof next === 'function' ? next(broken.value) : next
    }
    const style = computed(() => ({ width: size.value, height: size.value }))
    return () => {
      if (url.value === null || broken.value) {
        return h(
          'span',
          {
            class: overview.avatar,
            style: style.value,
            'aria-hidden': 'true',
          },
          [
            login.value
              .replace(/^[^a-z0-9]*/i, '')
              .slice(0, 1)
              .toUpperCase(),
          ],
        )
      }
      return h('img', {
        class: overview.avatar,
        style: style.value,
        src: url.value,
        alt: '',
        loading: 'eager',
        onError: () => {
          setBroken(true)
        },
      })
    }
  },
  {
    props: ['url', 'login', 'size'],
    inheritAttrs: false,
  },
)
/** Props of the review row. */
export interface ReviewRowProps {
  readonly entry: ForgePanelChangeRequest
  readonly snapshot: ChangeRequestSnapshot
  /** The aggregate review outcome. */
  readonly value: string
  /** Tone of the aggregate outcome. */
  readonly tone: string | undefined
  readonly requestReviews: OverviewActions['requestReviews']
  readonly reviewerCandidates: OverviewActions['reviewerCandidates']
  readonly openLink: (url: string) => void
  readonly t: Translate
}
/**
 * Render the review decision as a row with the first reviewers' avatars. Its menu lists each reviewer with their
 * latest outcome or that their review is requested, and, when the signed-in user may request reviews, offers to ask a
 * reviewer again and to request a review from someone else through a search.
 * @param props - the change request, its snapshot, the aggregate outcome, the review request actions, and copy.
 * @returns the row with its menu.
 */
export const ReviewRow = defineComponent(
  (props: ReviewRowProps) => {
    const entry = computed(() => props.entry)
    const snapshot = computed(() => props.snapshot)
    const value = computed(() => props.value)
    const tone = computed(() => props.tone)
    const requestReviews = computed(() => props.requestReviews)
    const reviewerCandidates = computed(() => props.reviewerCandidates)
    const openLink = computed(() => props.openLink)
    const t = computed(() => props.t)
    const open = shallowRef(false)
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === 'function' ? next(open.value) : next
    }
    const searching = shallowRef(false)
    const setSearching = (
      next: typeof searching.value | ((previous: typeof searching.value) => typeof searching.value),
    ) => {
      searching.value = typeof next === 'function' ? next(searching.value) : next
    }
    const [busy, run] = useBusy()
    const derived1 = computed(() => snapshot.value)
    const reviewers = computed(() => derived1.value.reviewers)
    const ask = computed(() =>
      snapshot.value.canRequestReviews && reviewerCandidates.value !== undefined
        ? requestReviews.value
        : undefined,
    )
    const canRequest = computed(() => ask.value !== undefined)
    const avatars = computed(() =>
      reviewers.value.length === 0
        ? undefined
        : h(
          'span',
          {
            class: overview.avatars,
            'aria-hidden': 'true',
          },
          [
            reviewers.value.slice(0, AVATARS).map(reviewer =>
              h(Avatar, {
                key: `${reviewer.kind}:${reviewer.login}`,
                url: reviewer.avatarUrl,
                login: reviewer.login,
                size: 18,
              }),
            ),
            reviewers.value.length > AVATARS &&
                h(
                  'span',
                  {
                    class: overview.moreCount,
                  },
                  [`+${reviewers.value.length - AVATARS}`],
                ),
          ],
        ),
    )
    const opens = computed(() => reviewers.value.length > 0 || canRequest.value)
    const parts = computed(() =>
      h(RowParts, {
        label: t.value('change.row.review'),
        icon: h(IconUserOutlineRegular, {
          size: 16,
        }),
        value: value.value,
        tone: tone.value,
        trailing: avatars.value,
        opens: opens.value,
      }),
    )
    const close = (): void => {
      setOpen(false)
      setSearching(false)
    }
    const request = computed(() =>
      ask.value === undefined
        ? undefined
        : (reviewer: Pick<ChangeRequestReviewer, 'kind' | 'login'>): void => {
          close()
          const action = ask.value
          if (action) run(() => action(entry.value, [reviewer]))
        },
    )
    const again = computed(() =>
      reviewers.value.filter(
        reviewer => reviewer.kind !== 'bot' && !reviewer.requested && reviewer.verdict !== null,
      ),
    )
    return () => {
      if (!opens.value)
        return h(
          'div',
          {
            class: css.row,
          },
          [parts.value],
        )
      return h(
        Menu,
        {
          open: open.value,
          onClose: close,
          portal: true,
          dense: true,
          align: 'end',
          className: overview.rowAnchor ?? '',
          listClassName: overview.menu ?? '',
        },
        {
          default: () => [
            searching.value && request.value !== undefined && reviewerCandidates.value !== undefined
              ? h(ReviewerSearch, {
                url: snapshot.value.url,
                list: reviewerCandidates.value,
                choose: (login) => {
                  request.value?.({ kind: 'user', login })
                },
                t: t.value,
              })
              : h(Fragment, null, [
                reviewers.value.length === 0 &&
                    h(
                      'div',
                      {
                        class: overview.menuStatus,
                      },
                      [t.value('reviewers.none')],
                    ),
                reviewers.value.map(reviewer =>
                  h(ReviewerLine, {
                    key: `${reviewer.kind}:${reviewer.login}`,
                    reviewer: reviewer,
                    headSha: snapshot.value.headSha,
                    t: t.value,
                  }),
                ),
                snapshot.value.reviewersTruncated &&
                    h(
                      MenuItemButton,
                      {
                        onSelect: () => {
                          close()
                          openLink.value(snapshot.value.url)
                        },
                      },
                      {
                        default: () => [t.value('reviewers.truncated')],
                      },
                    ),
                request.value !== undefined &&
                    again.value.map((reviewer, index) =>
                      h(
                        MenuItemButton,
                        {
                          key: `${reviewer.kind}:${reviewer.login}`,
                          separatorBefore: index === 0,
                          icon: h(IconRefreshOutlineRegular, {
                            size: 14,
                          }),
                          onSelect: () => {
                            request.value?.(reviewer)
                          },
                        },
                        {
                          default: () => [
                            t.value('reviewers.rerequestAria', { login: reviewer.login }),
                          ],
                        },
                      ),
                    ),
                canRequest.value &&
                    h(
                      MenuItemButton,
                      {
                        separatorBefore: again.value.length === 0,
                        icon: h(IconPlusOutlineRegular, {
                          size: 14,
                        }),
                        onSelect: () => {
                          setSearching(true)
                        },
                      },
                      {
                        default: () => [t.value('reviewers.requestMore')],
                      },
                    ),
              ]),
          ],
          anchor: () =>
            h(
              'button',
              {
                type: 'button',
                class: clsx(css.row, css.rowButton),
                'aria-haspopup': 'menu',
                'aria-expanded': open.value,
                'data-forge-review': '',
                disabled: busy.value,
                onClick: () => {
                  if (open.value) close()
                  else setOpen(true)
                },
              },
              [parts.value],
            ),
        },
      )
    }
  },
  {
    props: [
      'entry',
      'snapshot',
      'value',
      'tone',
      'requestReviews',
      'reviewerCandidates',
      'openLink',
      't',
    ],
    inheritAttrs: false,
  },
)
/** One reviewer in the review menu: avatar, login, what kind of reviewer, and their latest outcome or pending request. */
function ReviewerLine({
  reviewer,
  headSha,
  t,
}: {
  readonly reviewer: ChangeRequestReviewer
  readonly headSha: string
  readonly t: Translate
}): VNodeChild {
  const verdict = reviewer.verdict === null ? undefined : VERDICT[reviewer.verdict]
  // A shown outcome older than the head; a requested review hides the outcome.
  const older =
    !reviewer.requested &&
    reviewer.verdict !== null &&
    reviewer.reviewedSha !== null &&
    reviewer.reviewedSha.toLowerCase() !== headSha.toLowerCase()
  const kind = reviewer.codeOwner
    ? t('reviewers.codeOwner')
    : reviewer.kind === 'team'
      ? t('reviewers.team')
      : reviewer.kind === 'bot'
        ? t('reviewers.bot')
        : undefined
  return h(
    'div',
    {
      class: overview.reviewer,
      role: 'presentation',
      'data-forge-reviewer': reviewer.login,
    },
    [
      h(Avatar, {
        url: reviewer.avatarUrl,
        login: reviewer.login,
      }),
      h(
        'span',
        {
          class: overview.who,
        },
        [
          h(
            'span',
            {
              class: css.ellipsis,
            },
            [reviewer.login],
          ),
          kind !== undefined &&
            h(
              'span',
              {
                class: overview.kind,
              },
              [kind],
            ),
        ],
      ),
      h(
        'span',
        {
          class: overview.outcome,
        },
        [
          reviewer.requested
            ? h(
              'span',
              {
                'data-tone': 'pending',
              },
              [t('reviewers.pending')],
            )
            : verdict !== undefined &&
              h(
                'span',
                {
                  'data-tone': verdict.tone,
                },
                [t(verdict.key)],
              ),
          older &&
            h(
              'span',
              {
                class: overview.older,
              },
              [t('reviewers.older')],
            ),
        ],
      ),
    ],
  )
}
/** The accounts a reviewer search listed for `query`, or that the listing failed. */
type Listing = {
  readonly query: string
} & (
  | {
    readonly ok: true
    readonly value: readonly ForgeReviewerCandidate[]
  }
  | {
    readonly ok: false
  }
)
const ReviewerSearch = defineComponent(
  (props: {
    readonly url: string
    readonly list: ListCandidates
    readonly choose: (login: string) => void
    readonly t: Translate
  }) => {
    const url = computed(() => props.url)
    const list = computed(() => props.list)
    const choose = computed(() => props.choose)
    const t = computed(() => props.t)
    const query = shallowRef('')
    const setQuery = (
      next: typeof query.value | ((previous: typeof query.value) => typeof query.value),
    ) => {
      query.value = typeof next === 'function' ? next(query.value) : next
    }
    const attempt = shallowRef(0)
    const setAttempt = (
      next: typeof attempt.value | ((previous: typeof attempt.value) => typeof attempt.value),
    ) => {
      attempt.value = typeof next === 'function' ? next(attempt.value) : next
    }
    const listing = shallowRef<Listing | null>(null)
    const setListing = (
      next: (Listing | null) | ((previous: Listing | null) => Listing | null),
    ) => {
      listing.value = typeof next === 'function' ? next(listing.value) : next
    }
    const search = shallowRef<HTMLInputElement | null>(null)
    const current = computed(() =>
      listing.value !== null && listing.value.query === query.value ? listing.value : null,
    )
    const candidates = computed(() =>
      current.value !== null && current.value.ok ? current.value.value : [],
    )
    onMounted(() =>
      watch(
        [() => url.value, () => query.value, () => attempt.value, () => list.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            const controller = new AbortController()
            const queryNow = query.value
            const urlNow = url.value
            const listNow = list.value
            const timer = setTimeout(
              () => {
                listNow(urlNow, queryNow, controller.signal).then(
                  (value) => {
                    if (!controller.signal.aborted)
                      setListing({ query: queryNow, ok: true, value })
                  },
                  () => {
                    if (!controller.signal.aborted) setListing({ query: queryNow, ok: false })
                  },
                )
              },
              query.value === '' ? 0 : SEARCH_DELAY_MS,
            )
            return () => {
              clearTimeout(timer)
              controller.abort()
            }
          })()
          if (typeof cleanup === 'function') onCleanup(cleanup)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return
            const frame = requestAnimationFrame(() => {
              search.value?.focus()
            })
            return () => {
              cancelAnimationFrame(frame)
            }
          })()
          if (typeof cleanup === 'function') onCleanup(cleanup)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    return () => {
      let body: VNodeChild
      if (current.value === null) {
        body = h(
          'div',
          {
            class: overview.menuStatus,
            role: 'status',
          },
          [
            h(StateDot, {
              state: 'ongoing',
            }),
            t.value('reviewers.loading'),
          ],
        )
      } else if (!current.value.ok) {
        body = h(
          'div',
          {
            class: overview.menuStatus,
            role: 'status',
          },
          [
            h('span', null, [t.value('reviewers.loadFailed')]),
            h(
              Button,
              {
                size: 'sm',
                variant: 'outline',
                onClick: () => {
                  setAttempt(value => value + 1)
                },
              },
              {
                default: () => [t.value('retry')],
              },
            ),
          ],
        )
      } else if (candidates.value.length === 0) {
        body = h(
          'div',
          {
            class: overview.menuStatus,
          },
          [t.value('reviewers.empty')],
        )
      } else {
        body = candidates.value.map(candidate =>
          h(
            MenuItemButton,
            {
              key: candidate.login,
              icon: h(Avatar, {
                url: candidate.avatarUrl,
                login: candidate.login,
                size: 16,
              }),
              onSelect: () => {
                choose.value(candidate.login)
              },
            },
            {
              default: () => [
                h(
                  'span',
                  {
                    class: overview.candidate,
                  },
                  [
                    h(
                      'span',
                      {
                        class: css.ellipsis,
                      },
                      [candidate.login],
                    ),
                    candidate.name !== null &&
                      candidate.name !== candidate.login &&
                      h(
                        'span',
                        {
                          class: overview.kind,
                        },
                        [candidate.name],
                      ),
                    candidate.suggested &&
                      h(
                        'span',
                        {
                          class: overview.badge,
                        },
                        [t.value('reviewers.suggested')],
                      ),
                  ],
                ),
              ],
            },
          ),
        )
      }
      const first = candidates.value[0]
      return h(Fragment, null, [
        h(
          'div',
          {
            class: overview.menuSearch,
          },
          [
            h(Input, {
              elementRef: (element: HTMLInputElement | null) => {
                search.value = element
              },
              icon: h(IconSearchOutlineRegular, {
                size: 14,
              }),
              value: query.value,
              'aria-label': t.value('reviewers.search'),
              placeholder: t.value('reviewers.search'),
              onInput: (event: Event) => {
                if (event.currentTarget instanceof HTMLInputElement)
                  setQuery(event.currentTarget.value)
              },
              onKeydown: (event: KeyboardEvent) => {
                searchFieldKeyDown(
                  event,
                  first === undefined
                    ? undefined
                    : () => {
                      choose.value(first.login)
                    },
                )
              },
            }),
          ],
        ),
        h(
          'div',
          {
            class: overview.menuRows,
          },
          [body],
        ),
      ])
    }
  },
  {
    props: ['url', 'list', 'choose', 't'],
    inheritAttrs: false,
  },
)
/** Props of the merge row. */
export interface MergeRowProps {
  readonly entry: ForgePanelChangeRequest
  readonly snapshot: ChangeRequestSnapshot
  /** Glyph of the row. */
  readonly icon: VNodeChild
  /** The merge conflict status. */
  readonly value: string
  /** Tone of the conflict status. */
  readonly tone: string | undefined
  readonly updateBranch: OverviewActions['updateBranch']
  readonly t: Translate
}
/**
 * Render the merge state as a row: the conflict status and whether the head is behind its base. While the signed-in
 * user can update the head branch, the row opens the update menu: a title, one row per method, and the confirmation,
 * which is refused once the head moved after the menu opened.
 * @param props - the change request, its snapshot, the row glyph and status, the update action, and copy.
 * @returns the row, with its menu when the branch can be updated.
 */
export const MergeRow = defineComponent(
  (props: MergeRowProps) => {
    const entry = computed(() => props.entry)
    const snapshot = computed(() => props.snapshot)
    const icon = computed(() => props.icon)
    const value = computed(() => props.value)
    const tone = computed(() => props.tone)
    const updateBranch = computed(() => props.updateBranch)
    const t = computed(() => props.t)
    const open = shallowRef(false)
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === 'function' ? next(open.value) : next
    }
    const confirmedHead = shallowRef(snapshot.value.headSha)
    const setConfirmedHead = (
      next:
        | typeof confirmedHead.value
        | ((previous: typeof confirmedHead.value) => typeof confirmedHead.value),
    ) => {
      confirmedHead.value = typeof next === 'function' ? next(confirmedHead.value) : next
    }
    const usual = computed(() => snapshot.value.branchUpdates[0] ?? 'merge')
    const chosen = shallowRef<string>(usual.value)
    const setChosen = (next: string | ((previous: string) => string)) => {
      chosen.value = typeof next === 'function' ? next(chosen.value) : next
    }
    const [busy, run] = useBusy()
    const behind = computed(() => snapshot.value.branchUpdates.length > 0)
    const text = computed(() =>
      behind.value
        ? `${value.value} · ${t.value('branch.behind', { base: snapshot.value.baseBranch })}`
        : value.value,
    )
    const stale = computed(() => confirmedHead.value !== snapshot.value.headSha)
    const method = computed(
      () =>
        snapshot.value.branchUpdates.find(candidate => candidate === chosen.value) ?? usual.value,
    )
    const base = computed(() => snapshot.value.baseBranch)
    const items = computed(() => [
      {
        type: 'label' as const,
        id: 'title',
        text: t.value('branch.updateTitle', { head: snapshot.value.headBranch, base: base.value }),
      },
      ...snapshot.value.branchUpdates.map(candidate => ({
        id: candidate,
        label: h(
          'span',
          {
            class: css.method,
          },
          [
            h('span', null, [t.value(`branch.method.${candidate}`)]),
            h(
              'span',
              {
                class: css.methodNote,
              },
              [t.value(`branch.note.${candidate}`, { base: base.value })],
            ),
          ],
        ),
      })),
    ])
    return () => {
      if (!behind.value || updateBranch.value === undefined) {
        return h(
          'div',
          {
            class: css.row,
          },
          [
            h(RowParts, {
              label: t.value('change.row.merge'),
              icon: icon.value,
              value: text.value,
              tone: tone.value,
              opens: false,
            }),
          ],
        )
      }
      return h(
        Menu,
        {
          open: open.value,
          onClose: () => {
            setOpen(false)
          },
          portal: true,
          align: 'end',
          className: overview.rowAnchor ?? '',
          items: items.value,
          selectedId: method.value,
          onSelect: setChosen,
        },
        {
          default: () => [
            h(
              MenuItemButton,
              {
                separatorBefore: true,
                disabled: stale.value,
                onSelect: () => {
                  const action = updateBranch.value
                  if (action === undefined || stale.value) return
                  setOpen(false)
                  run(() =>
                    action(entry.value, { method: method.value, headSha: confirmedHead.value }),
                  )
                },
              },
              {
                default: () => [t.value(stale.value ? 'branch.changed' : 'branch.confirm')],
              },
            ),
          ],
          anchor: () =>
            h(
              'button',
              {
                type: 'button',
                class: clsx(css.row, css.rowButton),
                'aria-haspopup': 'menu',
                'aria-expanded': open.value,
                disabled: busy.value,
                'data-forge-update-branch': '',
                onClick: () => {
                  if (!open.value) setConfirmedHead(snapshot.value.headSha)
                  setOpen(!open.value)
                },
              },
              [
                h(RowParts, {
                  label: t.value('change.row.merge'),
                  icon: icon.value,
                  value: text.value,
                  tone: tone.value,
                  opens: true,
                  trailing: h(
                    'span',
                    {
                      class: overview.action,
                    },
                    [t.value('branch.update')],
                  ),
                }),
              ],
            ),
        },
      )
    }
  },
  {
    props: ['entry', 'snapshot', 'icon', 'value', 'tone', 'updateBranch', 't'],
    inheritAttrs: false,
  },
)
/**
 * A speech bubble, the glyph of review threads.
 * @param props - glyph size in pixels.
 * @returns the decorative glyph.
 */
export function ThreadGlyph({ size = 14 }: { readonly size?: number }): VNodeChild {
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      'aria-hidden': 'true',
    },
    [
      h('path', {
        d: 'M3 4.2C3 3.5 3.5 3 4.2 3h7.6c.7 0 1.2.5 1.2 1.2v5.4c0 .7-.5 1.2-1.2 1.2H7.3L4.6 13v-2.2h-.4C3.5 10.8 3 10.3 3 9.6z',
        stroke: 'currentColor',
        strokeWidth: 1.2,
        strokeLinejoin: 'round',
      }),
    ],
  )
}
/** An issue: a ring around a dot. */
function IssueGlyph(): VNodeChild {
  return h(
    'svg',
    {
      width: 16,
      height: 16,
      viewBox: '0 0 16 16',
      fill: 'none',
      'aria-hidden': 'true',
    },
    [
      h('circle', {
        cx: '8',
        cy: '8',
        r: '6',
        stroke: 'currentColor',
        strokeWidth: 1.3,
      }),
      h('circle', {
        cx: '8',
        cy: '8',
        r: '1.5',
        fill: 'currentColor',
      }),
    ],
  )
}
/** The issue's label: `#n` within the change request's repository, else `owner/name#n`. */
function issueLabel(issue: ChangeRequestIssue, snapshot: ChangeRequestSnapshot): string {
  const { owner, name } = snapshot.ref.repository
  const same =
    issue.repository.owner.toLowerCase() === owner.toLowerCase() &&
    issue.repository.name.toLowerCase() === name.toLowerCase()
  return same
    ? `#${issue.number}`
    : `${issue.repository.owner}/${issue.repository.name}#${issue.number}`
}
/**
 * Render the issues linked to the change request, which the host closes once it merges, as one row of links, each
 * named by its number with its title in a tooltip, or nothing without one. More issues than the provider read end the
 * row with a note.
 * @param props - the snapshot, the link action, and copy.
 * @returns the row, or null.
 */
export function IssuesRow({
  snapshot,
  openLink,
  t,
}: {
  readonly snapshot: ChangeRequestSnapshot
  readonly openLink: (url: string) => void
  readonly t: Translate
}): VNodeChild {
  if (snapshot.closingIssues.length === 0) return null
  const links = snapshot.closingIssues.map((issue, index) => {
    const label = issueLabel(issue, snapshot)
    return h(
      'span',
      {
        key: issue.url,
      },
      [
        index > 0 && t('issues.separator'),
        h(
          Tooltip,
          {
            label: issue.title,
            side: 'top',
          },
          {
            default: () => [
              h(
                'a',
                {
                  class: overview.issue,
                  href: issue.url,
                  target: '_blank',
                  rel: 'noreferrer',
                  'data-state': issue.state,
                  'aria-label': t('issues.aria', { label, title: issue.title }),
                  onClick: (event) => {
                    event.preventDefault()
                    openLink(issue.url)
                  },
                },
                [label],
              ),
            ],
          },
        ),
      ],
    )
  })
  return h(
    'div',
    {
      class: css.row,
      'data-forge-closing-issues': '',
    },
    [
      h(RowParts, {
        label: undefined,
        icon: h(IssueGlyph, null),
        opens: false,
        value: h(Fragment, null, [
          t('issues.label'),
          ' ',
          links,
          snapshot.closingIssuesTruncated && t('issues.more'),
        ]),
      }),
    ],
  )
}
RowParts.inheritAttrs = false
ReviewerLine.inheritAttrs = false
ThreadGlyph.inheritAttrs = false
IssueGlyph.inheritAttrs = false
IssuesRow.inheritAttrs = false
