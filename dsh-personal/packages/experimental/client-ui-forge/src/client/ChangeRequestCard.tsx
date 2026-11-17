/**
 * One change request as a card: its title links to the host, a one-line
 * summary shows while collapsed, and while expanded one sentence per fact
 * (checks, review, merge state, the changed lines, which open its changes, and
 * the linked issues) above the ready-for-review or merge action.
 */
import { defineComponent, h, Fragment, shallowRef, useId, type VNodeChild } from 'vue'
import clsx from 'clsx'
import { Button, IconChevronDownOutlineRegular, IconCloseOutlineRegular, IconCopyOutlineRegular, IconListPenOutlineRegular, IconRightUpOutlineRegular, IconTriangleRightFillRegular, Menu, MenuItemButton, StateDot, Tooltip, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChangeRequestSnapshot, CheckState, ChecksRollup, ForgeFailure, MergeMethod, MergeRequest } from '@deepseek-ai/dsh-experimental-forge/types'
import type { ForgePanelChangeRequest } from '../types.ts'
import { ChecksRow, IssuesRow, MergeRow, ReviewRow, RowParts, ThreadGlyph, type OverviewActions } from './ChangeRequestOverview.tsx'
import { formatAgo } from './format.ts'
import { ChangeRequestGlyph, CheckGlyph } from './glyphs.tsx'
import type { ForgePanelKey, NS } from './locales.ts'
import type { ForgeChangeRequestCardActionsProps } from './slots.ts'
import { ciSummary, flagOf, numberOf, TONE_LABEL, toneOf } from './status.ts'
import css from './ForgeTab.module.css'
type Translate = PropsLocale<typeof NS>['t']
/**
 * What a card can do; a surface without a Session binding omits `remove`, `markReady`, `merge`, `viewChanges`, and the
 * overview actions.
 */
export interface ChangeRequestActions extends OverviewActions {
  /** Open a URL outside the app. */
  readonly openLink: (url: string) => void
  /** Copy a URL to the clipboard. */
  readonly copyLink: (url: string) => void
  /** Read the status again after a failed read. */
  readonly retry: () => void
  /** Remove the change request from its Session. */
  readonly remove?: ((entry: ForgePanelChangeRequest) => void) | undefined
  /** Mark a draft ready for review; settles once the outcome is reported. */
  readonly markReady?: ((entry: ForgePanelChangeRequest) => Promise<void>) | undefined
  /** Merge the change request as `request` describes; settles once the outcome is reported. */
  readonly merge?: ((entry: ForgePanelChangeRequest, request: MergeRequest) => Promise<void>) | undefined
  /** Load complete check details independently of polling; cancellation follows the open list. */
  readonly readChecks?: ((url: string, headSha: string, signal: AbortSignal) => Promise<ChangeRequestSnapshot>) | undefined
  /** Open the changes view of the change request. */
  readonly viewChanges?: ((entry: ForgePanelChangeRequest) => void) | undefined
  /** Draw the icon buttons plugins add to the card's head through `forge.change-request.card.actions`. */
  readonly renderActions?: ((owner: ForgeChangeRequestCardActionsProps) => VNodeChild) | undefined
}
/** Props of one change request card. */
export interface ChangeRequestCardProps {
  /** Change request with its latest snapshot and polling result. */
  readonly entry: ForgePanelChangeRequest
  /** Whether the details show. */
  readonly expanded: boolean
  /** Show or hide the details. */
  readonly onToggle: () => void
  /** Current epoch milliseconds for relative times. */
  readonly now: number
  /** Card actions. */
  readonly actions: ChangeRequestActions
  /** Active UI language for numeric formatting. */
  readonly locale: string
  /** Forge panel copy. */
  readonly t: Translate
}
const REVIEW: Record<ChangeRequestSnapshot['reviewDecision'], ForgePanelKey> = {
  'approved': 'change.review.approved',
  'changes-requested': 'change.review.changesRequested',
  'review-required': 'change.review.required',
  'none': 'change.review.none',
}
const FAILURE: Record<ForgeFailure['code'], ForgePanelKey> = {
  'not-found': 'change.failure.notFound',
  'unauthenticated': 'change.failure.unauthenticated',
  'too-large': 'change.failure.unavailable',
  'stale': 'change.failure.unavailable',
  'unsupported': 'change.failure.unavailable',
  'unavailable': 'change.failure.unavailable',
}
const ROLLUP: Record<ChecksRollup, CheckState> = {
  none: 'neutral',
  pending: 'pending',
  success: 'success',
  failure: 'failure',
}
/** The unresolved thread count, with `+` when the provider counted only some threads. */
function threadCount(snapshot: ChangeRequestSnapshot, locale: string): string {
  const count = snapshot.unresolvedThreads.toLocaleString(locale)
  return snapshot.threadsTruncated ? `${count}+` : count
}
function failureOf(entry: ForgePanelChangeRequest): ForgeFailure | undefined {
  return entry.update !== null && 'failure' in entry.update ? entry.update.failure : undefined
}
function DiffSize({ snapshot, locale }: {
  readonly snapshot: ChangeRequestSnapshot
  readonly locale: string
}): VNodeChild {
  return (h('span', {
    'class': css.diff,
  }, [h('span', {
    'class': css.added,
  }, [`+${snapshot.additions.toLocaleString(locale)}`]), h('span', {
    'class': css.deleted,
  }, [`−${snapshot.deletions.toLocaleString(locale)}`])]))
}
/**
 * The changed lines with the unresolved review thread count, as a row that opens the changes view when the provider
 * serves the change request.
 */
const ChangesRow = defineComponent((props: {
  readonly entry: ForgePanelChangeRequest
  readonly snapshot: ChangeRequestSnapshot
  readonly name: string
  readonly actions: ChangeRequestActions
  readonly locale: string
  readonly t: Translate
}) => {
  const described = useId()
  return () => {
    const { viewChanges } = props.actions
    const threads = props.snapshot.unresolvedThreads > 0 || props.snapshot.threadsTruncated ? threadCount(
      props.snapshot, props.locale) : undefined
    const threadsText = threads === undefined ? undefined : props.t('change.threads', { count: threads })
    const trailing = threadsText === undefined ? undefined : (h(Tooltip, {
      'label': threadsText,
      'side': 'top',
    }, {
      default: () => [h('span', {
        'class': css.threads,
        'data-forge-threads': threads,
        'aria-hidden': 'true',
      }, [h(ThreadGlyph, {
        'size': 14,
      }), threads])],
    }))
    const opens = viewChanges !== undefined && props.entry.ref !== null
    const parts = (h(Fragment, null, [h(RowParts, {
      'label': props.t('change.row.changes'),
      'icon': h(IconListPenOutlineRegular, {
        'size': 16,
      }),
      'value': h(DiffSize, {
        'snapshot': props.snapshot,
        'locale': props.locale,
      }),
      'trailing': trailing,
      'opens': opens,
    }), threadsText !== undefined && h('span', {
      'id': described,
      'class': css.visuallyHidden,
    }, [threadsText])]))
    if (!opens)
      return h('div', {
        'class': css.row,
      }, [parts])
    return (h('button', {
      'type': 'button',
      'class': clsx(css.row, css.rowButton),
      'aria-label': props.t('change.viewChangesAria', {
        name: props.name,
        added: props.snapshot.additions.toLocaleString(props.locale),
        deleted: props.snapshot.deletions.toLocaleString(props.locale),
      }),
      'aria-describedby': threadsText === undefined ? undefined : described,
      'onClick': () => { viewChanges(props.entry) },
    }, [parts]))
  }
}, { name: 'ChangesRow', inheritAttrs: false, props: ['entry', 'snapshot', 'name', 'actions', 'locale', 't'] })
/** The merged or closed fact with its time, such as 已合并到 main · 2 小时前. */
function finished(snapshot: ChangeRequestSnapshot, now: number, t: Translate): string {
  const state = snapshot.state === 'merged' ? t('change.mergedTo', { base: snapshot.baseBranch }) : t('change.state.closed')
  const ago = snapshot.closedAt === null ? undefined : formatAgo(snapshot.closedAt, now, t)
  return ago === undefined ? state : t('time.finished', { state, time: ago })
}
/** Collapsed status after the number: checks and the most urgent flag, the merge or close time, or a read in progress. */
function Summary({ snapshot, now, t }: {
  readonly snapshot: ChangeRequestSnapshot | null
  readonly now: number
  readonly t: Translate
}): VNodeChild {
  if (snapshot === null)
    return h(StateDot, {
      'state': 'ongoing',
      'size': 11,
    })
  if (snapshot.state !== 'open') {
    return h('span', {
      'class': css.finished,
      'data-tone': snapshot.state,
    }, [finished(snapshot, now, t)])
  }
  const ci = ciSummary(snapshot)
  const flag = flagOf(snapshot)
  return (h(Fragment, null, [h('span', {
    'class': css.ci,
    'data-tone': ci.kind === 'failed' ? 'error' : undefined,
  }, [ci.kind !== 'none' && h(CheckGlyph, {
    'state': ci.kind === 'cancelled' ? 'cancelled' : ROLLUP[snapshot.checksRollup],
    'size': 12,
  }), ci.kind === 'failed'
    ? ci.count > 0 ? t('change.ci.failed', { count: ci.count }) : t('change.ci.failedUnlisted')
    : ci.kind === 'cancelled' ? t('change.ci.cancelled', { count: ci.count }) : t(`change.ci.${ci.kind}`)]), flag !== undefined && h('span', {
    'class': css.flag,
    'data-flag': flag,
  }, [t(`change.flag.${flag}`)])]))
}
/** Expanded identity after the number: draft state and the head and base branches. */
function Target({ snapshot, t }: {
  readonly snapshot: ChangeRequestSnapshot
  readonly t: Translate
}): VNodeChild {
  return (h(Fragment, null, [snapshot.state === 'open' && snapshot.draft && h('span', {}, [t('change.state.draft')]), h('span', {
    'class': css.ellipsis,
  }, [`${snapshot.headBranch} → ${snapshot.baseBranch}`])]))
}
/** The merge button and its menu: a title row, one row per method with the chosen one checked, and the confirmation. */
const MergeMenu = defineComponent((props: {
  readonly snapshot: ChangeRequestSnapshot
  readonly name: string
  readonly usual: MergeMethod
  readonly busy: boolean
  readonly onMerge: (method: MergeMethod, headSha: string) => void
  readonly t: Translate
}) => {
  const open = shallowRef(false)
  const confirmedHead = shallowRef(props.snapshot.headSha)
  const chosen = shallowRef<string>(props.usual)
  return () => {
    const stale = confirmedHead.value !== props.snapshot.headSha
    const method = props.snapshot.mergeMethods.find(entry => entry === chosen.value) ?? props.usual
    const close = (): void => { open.value = false }
    const base = props.snapshot.baseBranch
    const items: MenuEntry[] = [
      { type: 'label', id: 'title', text: props.t('change.mergeTitle', { name: props.name, base }) },
      ...props.snapshot.mergeMethods.map(entry => ({
        id: entry,
        label: (h('span', {
          'class': css.method,
        }, [h('span', {}, [props.t(`change.mergeMethod.${entry}`)]), h('span', {
          'class': css.methodNote,
        }, [props.t(`change.mergeNote.${entry}`, { base })])])),
      })),
    ]
    return (h(Menu, {
      'open': open.value,
      'onClose': close,
      'portal': true,
      'align': 'end',
      'items': items,
      'selectedId': method,
      'onSelect': (value: string) => { chosen.value = value },
    }, {
      anchor: () => (h(Button, {
        'size': 'sm',
        'variant': 'primary',
        'className': clsx(css.primaryAction, css.mergeAction),
        'aria-haspopup': 'menu',
        'aria-expanded': open.value,
        'disabled': props.busy,
        'onClick': () => {
          if (!open.value)
            confirmedHead.value = props.snapshot.headSha
          open.value = !open.value
        },
      }, {
        default: () => [props.t('change.merge'), h(IconTriangleRightFillRegular, {
          'size': 10,
          'className': clsx(css.mergeCaret, open.value && css.mergeCaretOpen),
        })],
      })),
      default: () => [h(MenuItemButton, {
        'separatorBefore': true,
        'disabled': stale,
        'onSelect': () => {
          if (props.busy || confirmedHead.value !== props.snapshot.headSha) return
          close()
          props.onMerge(method, confirmedHead.value)
        },
      }, {
        default: () => [props.t(stale ? 'change.mergeChanged' : 'change.mergeConfirm')],
      })],
    }))
  }
}, { name: 'MergeMenu', inheritAttrs: false, props: ['snapshot', 'name', 'usual', 'busy', 'onMerge', 't'] })
/** The footer with the action of an open change request: mark a draft ready, or merge one the host would merge now. */
const Primary = defineComponent((props: {
  readonly entry: ForgePanelChangeRequest
  readonly snapshot: ChangeRequestSnapshot
  readonly name: string
  readonly actions: ChangeRequestActions
  readonly t: Translate
}) => {
  const busy = shallowRef(false)
  return () => {
    const run = (action: () => Promise<void>): void => {
      if (busy.value) return
      busy.value = true
      void action().finally(() => { busy.value = false })
    }
    const { markReady, merge } = props.actions
    if (props.snapshot.state !== 'open')
      return null
    if (props.snapshot.draft) {
      if (markReady === undefined)
        return null
      return (h('div', {
        'class': css.footer,
      }, [h(Button, {
        'size': 'sm',
        'variant': 'outline',
        'className': css.primaryAction ?? '',
        'disabled': busy.value,
        'onClick': () => { run(() => markReady(props.entry)) },
      }, {
        default: () => [props.t('change.markReady')],
      })]))
    }
    const [usual] = props.snapshot.mergeMethods
    if (!props.snapshot.mergeReady || usual === undefined || merge === undefined)
      return null
    return (h('div', {
      'class': css.footer,
    }, [h(MergeMenu, {
      'snapshot': props.snapshot,
      'name': props.name,
      'usual': usual,
      'busy': busy.value,
      'onMerge': (method, headSha) => { run(() => merge(props.entry, { method, headSha })) },
      't': props.t,
    })]))
  }
}, { name: 'Primary', inheritAttrs: false, props: ['entry', 'snapshot', 'name', 'actions', 't'] })
function Details({ entry, snapshot, name, now, actions, locale, t }: {
  readonly entry: ForgePanelChangeRequest
  readonly snapshot: ChangeRequestSnapshot
  readonly name: string
  readonly now: number
  readonly actions: ChangeRequestActions
  readonly locale: string
  readonly t: Translate
}): VNodeChild {
  const changes = h(ChangesRow, {
    'entry': entry,
    'snapshot': snapshot,
    'name': name,
    'actions': actions,
    'locale': locale,
    't': t,
  })
  if (snapshot.state !== 'open') {
    return (h('div', {
      'class': css.rows,
    }, [h('div', {
      'class': css.row,
    }, [h(RowParts, {
      'label': undefined,
      'icon': h(ChangeRequestGlyph, {
        'tone': snapshot.state,
        'tinted': false,
        'size': 16,
      }),
      'value': finished(snapshot, now, t),
      'tone': snapshot.state,
      'opens': false,
    })]), changes]))
  }
  const review = t(REVIEW[snapshot.reviewDecision])
  const reviewTone = snapshot.reviewDecision === 'changes-requested' ? 'error' : snapshot.reviewDecision === 'approved' ? 'success' : undefined
  const merge = snapshot.mergeability === 'mergeable'
    ? t('change.merge.mergeable')
    : snapshot.mergeability === 'conflicting' ? t('change.merge.conflicting', { base: snapshot.baseBranch }) : t('change.merge.unknown')
  return (h('div', {
    'class': css.rows,
  }, [h(ChecksRow, {
    'key': snapshot.headSha,
    'entry': entry,
    'snapshot': snapshot,
    'openLink': actions.openLink,
    'readChecks': actions.readChecks,
    'rerunChecks': actions.rerunChecks,
    't': t,
  }), h(ReviewRow, {
    'entry': entry,
    'snapshot': snapshot,
    'tone': reviewTone,
    'openLink': actions.openLink,
    'value': review,
    'requestReviews': actions.requestReviews,
    'reviewerCandidates': actions.reviewerCandidates,
    't': t,
  }), h(MergeRow, {
    'entry': entry,
    'snapshot': snapshot,
    'value': merge,
    'updateBranch': actions.updateBranch,
    'icon': h(ChangeRequestGlyph, {
      'tone': 'merged',
      'tinted': false,
      'size': 16,
    }),
    'tone': snapshot.mergeability === 'conflicting' ? 'error' : undefined,
    't': t,
  }), changes, h(IssuesRow, {
    'snapshot': snapshot,
    'openLink': actions.openLink,
    't': t,
  })]))
}
/**
 * Render one change request.
 * @param props - change request, expansion, current time, actions, and copy.
 * @returns the card.
 */
export function ChangeRequestCard({ entry, expanded, onToggle, now, actions, locale, t }: ChangeRequestCardProps): VNodeChild {
  const snapshot = entry.snapshot
  const number = numberOf(entry)
  const url = snapshot?.url ?? entry.url
  const failure = failureOf(entry)
  const notice = entry.ref === null ? 'change.unserved' : failure === undefined ? undefined : FAILURE[failure.code]
  const tone = toneOf(snapshot)
  const name = number === null ? snapshot?.title ?? url : t('change.number', { number })
  // A notice replaces the collapsed summary, so a failed read never shows its stale status beside it.
  const meta = expanded
    ? snapshot === null ? null : h(Target, {
      'snapshot': snapshot,
      't': t,
    })
    : notice === undefined ? h(Summary, {
      'snapshot': snapshot,
      'now': now,
      't': t,
    }) : null
  const { remove } = actions
  return (h('li', {
    'class': css.change,
    'data-forge-change': entry.url,
    'data-expanded': expanded ? '' : undefined,
  }, [h('div', {
    'class': css.changeHead,
  }, [h(ChangeRequestGlyph, {
    'tone': tone,
    'size': 16,
    'label': t('change.stateAria', { state: t(TONE_LABEL[tone]) }),
  }), h('div', {
    'class': css.headText,
  }, [h('a', {
    'class': css.changeTitle,
    'href': url,
    'target': '_blank',
    'rel': 'noreferrer',
    'onClick': (event) => {
      event.preventDefault()
      actions.openLink(url)
    },
  }, [snapshot?.title ?? url.replace(/^https?:\/\//i, '')]), (number !== null || meta !== null) && (h('div', {
    'class': css.meta,
  }, [number !== null && h('span', {}, [t('change.number', { number })]), number !== null && meta !== null && h('span', {
    'aria-hidden': 'true',
  }, ['\u00B7']), meta]))]), actions.renderActions?.({ url: entry.url, changeRequestRef: entry.ref, headSha: snapshot?.headSha ?? null, state: snapshot?.state ?? null }), h(Tooltip, {
    'label': t('change.view'),
    'side': 'top',
  }, {
    default: () => [h('button', {
      'type': 'button',
      'class': css.iconButton,
      'aria-label': t('change.view'),
      'onClick': () => { actions.openLink(url) },
    }, [h(IconRightUpOutlineRegular, {
      'size': 14,
    })])],
  }), h(Tooltip, {
    'label': t('change.copy'),
    'side': 'top',
  }, {
    default: () => [h('button', {
      'type': 'button',
      'class': css.iconButton,
      'aria-label': t('change.copy'),
      'onClick': () => { actions.copyLink(url) },
    }, [h(IconCopyOutlineRegular, {
      'size': 14,
    })])],
  }), remove !== undefined && (h(Tooltip, {
    'label': t('change.remove'),
    'side': 'top',
  }, {
    default: () => [h('button', {
      'type': 'button',
      'class': css.iconButton,
      'aria-label': t('change.removeAria', { name }),
      'onClick': () => { remove(entry) },
    }, [h(IconCloseOutlineRegular, {
      'size': 14,
    })])],
  })), h('button', {
    'type': 'button',
    'class': css.iconButton,
    'aria-expanded': expanded,
    'aria-label': t(expanded ? 'change.collapse' : 'change.expand', { name }),
    'onClick': onToggle,
  }, [h(IconChevronDownOutlineRegular, {
    'size': 12,
    'className': clsx(css.chevron, expanded && css.chevronOpen),
  })])]), notice !== undefined && (h('div', {
    'class': css.notice,
  }, [h('span', {}, [t(notice)]), entry.ref === null
    ? h(Button, {
      'size': 'sm',
      'variant': 'outline',
      'onClick': () => { actions.openLink(url) },
    }, {
      default: () => [t('change.view')],
    }) : h(Button, {
      'size': 'sm',
      'variant': 'outline',
      'onClick': actions.retry,
    }, {
      default: () => [t('retry')],
    })])), expanded && snapshot !== null && (h(Details, {
    'entry': entry,
    'snapshot': snapshot,
    'name': name,
    'now': now,
    'actions': actions,
    'locale': locale,
    't': t,
  })), expanded && snapshot !== null && h(Primary, {
    'entry': entry,
    'snapshot': snapshot,
    'name': name,
    'actions': actions,
    't': t,
  })]))
}
