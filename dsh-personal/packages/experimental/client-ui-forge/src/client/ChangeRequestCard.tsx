import { defineComponent, h, shallowRef, useId, Fragment, type VNodeChild } from 'vue'

import clsx from 'clsx';

import { Button, HoverCard, IconCheckCircleOutlineRegular, IconChevronDownOutlineRegular, IconCloseOutlineRegular, IconCopyOutlineRegular, IconEllipsisOutlineRegular, IconFilesDiffOutlineRegular, IconRightUpOutlineRegular, IconTriangleRightFillRegular, Menu, MenuItemButton, StateDot, Tooltip, type MenuEntry, type MenuItem, type StateDotState, } from '@deepseek-ai/dsh-client-ui-primitives';

import type { PanelDetailsProps } from '@deepseek-ai/dsh-client-ui-session-panel/client';

import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import type { ChangeRequestSnapshot, CheckState, ChecksRollup, ForgeFailure, MergeMethod, MergeRequest, } from '@deepseek-ai/dsh-experimental-forge/types';

import type { ForgePanelChangeRequest } from '../types.ts';

import { ChecksRow, IssuesRow, MergeRow, ReviewRow, RowParts, ThreadGlyph, type OverviewActions } from './ChangeRequestOverview.tsx';

import { formatAgo } from './format.ts';

import { ChangeRequestGlyph, CheckGlyph } from './glyphs.tsx';

import type { ForgePanelKey, NS } from './locales.ts';

import type { ForgeChangeRequestCardActionsProps } from './slots.ts';

import { ciSummary, flagOf, numberOf, TONE_LABEL, toneOf, type ChangeRequestTone } from './status.ts';

import css from './Forge.module.css';

type Translate = PropsLocale<typeof NS>['t'];

/**
 * What a card can do; a surface without a Session binding omits `remove`, `markReady`, `merge`, `viewChanges`, and the
 * overview actions.
 */
export interface ChangeRequestActions extends OverviewActions {
    /** Open a URL outside the app. */
    readonly openLink: (url: string) => void;
    /** Copy a URL to the clipboard. */
    readonly copyLink: (url: string) => void;
    /** Read the status again after a failed read. */
    readonly retry: () => void;
    /** Remove the change request from its Session. */
    readonly remove?: ((entry: ForgePanelChangeRequest) => void) | undefined;
    /** Mark a draft ready for review; settles once the outcome is reported. */
    readonly markReady?: ((entry: ForgePanelChangeRequest) => Promise<void>) | undefined;
    /** Merge the change request as `request` describes; settles once the outcome is reported. */
    readonly merge?: ((entry: ForgePanelChangeRequest, request: MergeRequest) => Promise<void>) | undefined;
    /** Load complete check details independently of polling; cancellation follows the open list. */
    readonly readChecks?: ((url: string, headSha: string, signal: AbortSignal) => Promise<ChangeRequestSnapshot>) | undefined;
    /** Open the changes view of the change request. */
    readonly viewChanges?: ((entry: ForgePanelChangeRequest) => void) | undefined;
    /** Draw the icon buttons plugins add to the card's head through `forge.change-request.card.actions`. */
    readonly renderActions?: ((owner: ForgeChangeRequestCardActionsProps) => VNodeChild) | undefined;
    /**
     * Draw the content of the card's hover card, as the Session panel's rows do. A surface without it shows none.
     */
    readonly renderDetails?: ((details: PanelDetailsProps) => VNodeChild) | undefined;
}

/** Props of one change request card. */
export interface ChangeRequestCardProps {
    /** Change request with its latest snapshot and polling result. */
    readonly entry: ForgePanelChangeRequest;
    /** Whether the details show. */
    readonly expanded: boolean;
    /** Show or hide the details. */
    readonly onToggle: () => void;
    /** Current epoch milliseconds for relative times. */
    readonly now: number;
    /** Card actions. */
    readonly actions: ChangeRequestActions;
    /** Active UI language for numeric formatting. */
    readonly locale: string;
    /** Forge panel copy. */
    readonly t: Translate;
}

const REVIEW: Record<ChangeRequestSnapshot['reviewDecision'], ForgePanelKey> = {
    'approved': 'change.review.approved',
    'changes-requested': 'change.review.changesRequested',
    'review-required': 'change.review.required',
    'none': 'change.review.none',
};

const FAILURE: Record<ForgeFailure['code'], ForgePanelKey> = {
    'not-found': 'change.failure.notFound',
    'unauthenticated': 'change.failure.unauthenticated',
    'too-large': 'change.failure.unavailable',
    'stale': 'change.failure.unavailable',
    'unsupported': 'change.failure.unavailable',
    'unavailable': 'change.failure.unavailable',
};

const ROLLUP: Record<ChecksRollup, CheckState> = {
    none: 'neutral',
    pending: 'pending',
    success: 'success',
    failure: 'failure',
};

/** The unresolved thread count, with `+` when the provider counted only some threads. */
function threadCount(snapshot: ChangeRequestSnapshot, locale: string): string {
    const count = snapshot.unresolvedThreads.toLocaleString(locale);
    return snapshot.threadsTruncated ? `${count}+` : count;
}

function failureOf(entry: ForgePanelChangeRequest): ForgeFailure | undefined {
    return entry.update !== null && 'failure' in entry.update ? entry.update.failure : undefined;
}

function DiffSize({ snapshot, locale }: {
    readonly snapshot: ChangeRequestSnapshot;
    readonly locale: string;
}): VNodeChild {
    return (h("span", {
        "class": css.diff
    }, [
        h("span", {
            "class": css.added
        }, [
            `+${snapshot.additions.toLocaleString(locale)}`
        ]),
        h("span", {
            "class": css.deleted
        }, [
            `−${snapshot.deletions.toLocaleString(locale)}`
        ])
    ]));
}

/**
 * The changed lines with the unresolved review thread count, as a row that opens the changes view when the provider
 * serves the change request.
 */
const ChangesRow = defineComponent((props: {
    readonly entry: ForgePanelChangeRequest;
    readonly snapshot: ChangeRequestSnapshot;
    readonly name: string;
    readonly actions: ChangeRequestActions;
    readonly locale: string;
    readonly t: Translate;
}) => {
const described = useId()
return () => {
const {entry,snapshot,name,actions,locale,t} = props

    const { viewChanges } = actions;

    const threads = snapshot.unresolvedThreads > 0 || snapshot.threadsTruncated ? threadCount(snapshot, locale) : undefined;
    const threadsText = threads === undefined ? undefined : t('change.threads', { count: threads });
    const trailing = threadsText === undefined ? undefined : (h(Tooltip, {
        "label": threadsText,
        "side": "top",
        "delayMs": 500
    }, {
        default: () => [
            h("span", {
                "class": css.threads,
                "data-forge-threads": threads,
                "aria-hidden": "true"
            }, [
                h(ThreadGlyph, {
                    "size": 14
                }),
                threads
            ])
        ]
    }));
    const opens = viewChanges !== undefined && entry.ref !== null;
    // The count shows only a number, so the threads are named in full for assistive technology.
    const parts = (h(Fragment, null, [
        h(RowParts, {
            "label": t('change.row.changes'),
            "icon": h(IconFilesDiffOutlineRegular, {
                "size": 16
            }),
            "value": h(DiffSize, {
                "snapshot": snapshot,
                "locale": locale
            }),
            "trailing": trailing,
            "opens": opens
        }),
        threadsText !== undefined && h("span", {
            "id": described,
            "class": css.visuallyHidden
        }, [
            threadsText
        ])
    ]));
    if (!opens)
        return h("div", {
            "class": css.row
        }, [
            parts
        ]);
    return (h("button", {
        "type": "button",
        "class": clsx(css.row, css.rowButton),
        "aria-label": t('change.viewChangesAria', {
            name,
            added: snapshot.additions.toLocaleString(locale),
            deleted: snapshot.deletions.toLocaleString(locale),
        }),
        "aria-describedby": threadsText === undefined ? undefined : described,
        "onClick": () => { viewChanges(entry); }
    }, [
        parts
    ]));

}
}, { props: ["entry","snapshot","name","actions","locale","t"] })

/** The merged or closed fact with its time, such as 已合并到 main · 2 小时前. */
function finished(snapshot: ChangeRequestSnapshot, now: number, t: Translate): string {
    const state = snapshot.state === 'merged' ? t('change.mergedTo', { base: snapshot.baseBranch }) : t('change.state.closed');
    const ago = snapshot.closedAt === null ? undefined : formatAgo(snapshot.closedAt, now, t);
    return ago === undefined ? state : t('time.finished', { state, time: ago });
}

/**
 * The checks outcome after the number: a spinner before the first read, the combined outcome of an open change
 * request that has checks, and nothing for a finished one, whose glyph already says how it ended.
 */
function Mark({ snapshot }: {
    readonly snapshot: ChangeRequestSnapshot | null;
}): VNodeChild {
    if (snapshot === null)
        return h(StateDot, {
            "state": "ongoing",
            "size": 12
        });
    if (snapshot.state !== 'open')
        return null;
    const ci = ciSummary(snapshot);
    if (ci.kind === 'none')
        return null;
    return h(CheckGlyph, {
        "state": ci.kind === 'cancelled' ? 'cancelled' : ROLLUP[snapshot.checksRollup],
        "size": 12
    });
}

/**
 * The status in words: the checks and the most urgent flag of an open change request, or the merge or close time.
 * The card's line shows it as glyphs, so assistive technology and the hover card read it here.
 * @param snapshot - change request status.
 * @param now - current epoch milliseconds for the relative time.
 * @param t - copy.
 * @returns the status text.
 */
function statusText(snapshot: ChangeRequestSnapshot, now: number, t: Translate): string {
    if (snapshot.state !== 'open')
        return finished(snapshot, now, t);
    const ci = ciSummary(snapshot);
    const checks = ci.kind === 'failed'
        ? ci.count > 0 ? t('change.ci.failed', { count: ci.count }) : t('change.ci.failedUnlisted')
        : ci.kind === 'cancelled' ? t('change.ci.cancelled', { count: ci.count }) : t(`change.ci.${ci.kind}`);
    const flag = flagOf(snapshot);
    return flag === undefined ? checks : `${checks} · ${t(`change.flag.${flag}`)}`;
}

/** The state dot of the hover card: red for what needs the user, and a spinner while the checks run. */
function dotOf(tone: ChangeRequestTone, snapshot: ChangeRequestSnapshot): StateDotState {
    if (tone === 'blocked')
        return 'error';
    if (snapshot.state !== 'open')
        return snapshot.state === 'merged' ? 'done' : 'idle';
    return snapshot.checksRollup === 'pending' ? 'ongoing' : snapshot.checksRollup === 'success' ? 'done' : 'idle';
}

/** The hover card's line under the title: the number, draft state, and the head and base branches. */
function identity(number: number | null, snapshot: ChangeRequestSnapshot | null, t: Translate): string[] {
    const parts = [
        ...number === null ? [] : [t('change.number', { number })],
        ...snapshot?.state === 'open' && snapshot.draft ? [t('change.state.draft')] : [],
        ...snapshot === null ? [] : [`${snapshot.headBranch} → ${snapshot.baseBranch}`],
    ];
    return parts.length === 0 ? [] : [parts.join(' · ')];
}

/** The merge button and its menu: a title row, one row per method with the chosen one checked, and the confirmation. */
const MergeMenu = defineComponent((props: {
    readonly snapshot: ChangeRequestSnapshot;
    readonly name: string;
    readonly usual: MergeMethod;
    readonly busy: boolean;
    readonly onMerge: (method: MergeMethod, headSha: string) => void;
    readonly t: Translate;
}) => {
    const open = shallowRef(false);
    const confirmedHead = shallowRef(props.snapshot.headSha);
    const chosen = shallowRef<string>(props.usual);
    return () => {
        const stale = confirmedHead.value !== props.snapshot.headSha;
        const method = props.snapshot.mergeMethods.find(entry => entry === chosen.value) ?? props.usual;
        const close = (): void => { open.value = false; };
        const base = props.snapshot.baseBranch;
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
        ];
        return (h(Menu, {
            'open': open.value,
            'onClose': close,
            'portal': true,
            'align': 'end',
            'items': items,
            'selectedId': method,
            'onSelect': (value: string) => { chosen.value = value; },
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
                        confirmedHead.value = props.snapshot.headSha;
                    open.value = !open.value;
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
                        if (props.busy || confirmedHead.value !== props.snapshot.headSha)
                            return;
                        close();
                        props.onMerge(method, confirmedHead.value);
                    },
                }, {
                    default: () => [props.t(stale ? 'change.mergeChanged' : 'change.mergeConfirm')],
                })],
        }));
    };
}, { name: 'MergeMenu', inheritAttrs: false, props: ['snapshot', 'name', 'usual', 'busy', 'onMerge', 't'] });

const Primary = defineComponent((props: {
    readonly entry: ForgePanelChangeRequest;
    readonly snapshot: ChangeRequestSnapshot;
    readonly name: string;
    readonly actions: ChangeRequestActions;
    readonly t: Translate;
}) => {
const busyRef = shallowRef(false)
const setBusy = (value: boolean): void => { busyRef.value = value }
return () => {
const { entry, snapshot, name, actions, t } = props
const busy = busyRef.value
const run = (action: () => Promise<void>): void => {
    if (busyRef.value) return;
    setBusy(true);
    void action().finally(() => { setBusy(false); });
};
const { merge } = actions;
if (snapshot.state !== 'open' || snapshot.draft)
    return null;
const [usual] = snapshot.mergeMethods;
if (!snapshot.mergeReady || usual === undefined || merge === undefined)
    return null;
return (h("div", {
    "class": css.footer
}, [
    h(MergeMenu, {
        "snapshot": snapshot,
        "name": name,
        "usual": usual,
        "busy": busy,
        "onMerge": (method, headSha) => { run(() => merge(entry, { method, headSha })); },
        "t": t
    })
]));
}
}, { props: ["entry","snapshot","name","actions","t"] })

const CardMenu = defineComponent((props: {
    readonly entry: ForgePanelChangeRequest;
    readonly snapshot: ChangeRequestSnapshot | null;
    readonly name: string;
    readonly url: string;
    readonly actions: ChangeRequestActions;
    readonly t: Translate;
}) => {
const openRef = shallowRef(false)
const setOpen = (value: boolean): void => { openRef.value = value }
const busyRef = shallowRef(false)
const setBusy = (value: boolean): void => { busyRef.value = value }
return () => {
const { entry, snapshot, name, url, actions, t } = props
const open = openRef.value
const busy = busyRef.value
const { remove, markReady, viewChanges } = actions;
const ready = markReady !== undefined && snapshot?.state === 'open' && snapshot.draft
    ? () => {
        if (busyRef.value) return;
        setBusy(true);
        void markReady(entry).finally(() => { setBusy(false); });
    }
    : undefined;
// Each item carries the action it runs, so a selection never reaches another item's action.
const choices: {
    readonly item: MenuItem;
    readonly run: () => void;
}[] = [
    ...viewChanges !== undefined && snapshot !== null && entry.ref !== null ? [{
            item: { id: 'changes', label: t('change.viewChanges'), icon: h(IconFilesDiffOutlineRegular, {
                    "size": 14
                }) },
            run: () => { viewChanges(entry); },
        }] : [],
    { item: { id: 'open', label: t('change.view'), icon: h(IconRightUpOutlineRegular, {
                "size": 14
            }) }, run: () => { actions.openLink(url); } },
    { item: { id: 'copy', label: t('change.copy'), icon: h(IconCopyOutlineRegular, {
                "size": 14
            }) }, run: () => { actions.copyLink(url); } },
    ...ready === undefined ? [] : [{
            item: { id: 'ready', label: t('change.markReady'), icon: h(IconCheckCircleOutlineRegular, {
                    "size": 14
                }), disabled: busy },
            run: ready,
        }],
    ...remove === undefined ? [] : [{
            item: { id: 'remove', label: t('change.remove'), icon: h(IconCloseOutlineRegular, {
                    "size": 14
                }), danger: true },
            run: () => { remove(entry); },
        }],
];
// Removing sits apart from the other actions.
const items: MenuEntry[] = choices.flatMap(({ item }) => item.id === 'remove'
    ? [{ type: 'separator' as const, id: 'remove-separator' }, item] : [item]);
const select = (id: string): void => {
    setOpen(false);
    for (const choice of choices)
        if (choice.item.id === id)
            choice.run();
};
return (h(Menu, {
    "open": open,
    "onClose": () => { setOpen(false); },
    "portal": true,
    "align": "end",
    "items": items,
    "onSelect": select
}, { anchor: () => h("button", {
        "type": "button",
        "aria-label": t('change.actions', { name }),
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "onClick": () => { setOpen(!open); }
    }, [
        h(IconEllipsisOutlineRegular, {
            "size": 16
        })
    ]) }));
}
}, { props: ["entry","snapshot","name","url","actions","t"] })

function Details({ entry, snapshot, name, now, actions, locale, t }: {
    readonly entry: ForgePanelChangeRequest;
    readonly snapshot: ChangeRequestSnapshot;
    readonly name: string;
    readonly now: number;
    readonly actions: ChangeRequestActions;
    readonly locale: string;
    readonly t: Translate;
}): VNodeChild {
    const changes = h(ChangesRow, {
        "entry": entry,
        "snapshot": snapshot,
        "name": name,
        "actions": actions,
        "locale": locale,
        "t": t
    });
    if (snapshot.state !== 'open') {
        return (h("div", {
            "class": css.rows
        }, [
            h("div", {
                "class": css.row
            }, [
                h(RowParts, {
                    "label": undefined,
                    "icon": h(ChangeRequestGlyph, {
                        "tone": snapshot.state,
                        "tinted": false,
                        "size": 16
                    }),
                    "value": finished(snapshot, now, t),
                    "tone": snapshot.state,
                    "opens": false
                })
            ]),
            changes
        ]));
    }
    const review = t(REVIEW[snapshot.reviewDecision]);
    const reviewTone = snapshot.reviewDecision === 'changes-requested' ? 'error' : snapshot.reviewDecision === 'approved' ? 'success' : undefined;
    const merge = snapshot.mergeability === 'mergeable'
        ? t('change.merge.mergeable')
        : snapshot.mergeability === 'conflicting' ? t('change.merge.conflicting', { base: snapshot.baseBranch }) : t('change.merge.unknown');
    return (h("div", {
        "class": css.rows
    }, [
        h(ChecksRow, {
            "key": snapshot.headSha,
            "entry": entry,
            "snapshot": snapshot,
            "openLink": actions.openLink,
            "readChecks": actions.readChecks,
            "rerunChecks": actions.rerunChecks,
            "t": t
        }),
        h(ReviewRow, {
            "entry": entry,
            "snapshot": snapshot,
            "tone": reviewTone,
            "openLink": actions.openLink,
            "value": review,
            "requestReviews": actions.requestReviews,
            "reviewerCandidates": actions.reviewerCandidates,
            "t": t
        }),
        h(MergeRow, {
            "entry": entry,
            "snapshot": snapshot,
            "value": merge,
            "updateBranch": actions.updateBranch,
            "icon": h(ChangeRequestGlyph, {
                "tone": "merged",
                "tinted": false,
                "size": 16
            }),
            "tone": snapshot.mergeability === 'conflicting' ? 'error' : undefined,
            "t": t
        }),
        changes,
        h(IssuesRow, {
            "snapshot": snapshot,
            "openLink": actions.openLink,
            "t": t
        })
    ]));
}

/**
 * Render one change request. A press on the card's line opens the changes view of a change request a provider serves
 * and has read; with the platform's modifier key or the middle button, and for any other change request, it opens
 * the host's page. The line shows its status as glyphs and, while collapsed, reads it in words to assistive
 * technology, which the expanded rows do otherwise; the hover card names the full title, the branches, and that status.
 * @param props - change request, expansion, current time, actions, and copy.
 * @returns the card.
 */
export function ChangeRequestCard({ entry, expanded, onToggle, now, actions, locale, t }: ChangeRequestCardProps): VNodeChild {
    const snapshot = entry.snapshot;
    const number = numberOf(entry);
    const url = snapshot?.url ?? entry.url;
    const failure = failureOf(entry);
    const notice = entry.ref === null ? 'change.unserved' : failure === undefined ? undefined : FAILURE[failure.code];
    const tone = toneOf(snapshot);
    const name = number === null ? snapshot?.title ?? url : t('change.number', { number });
    const title = snapshot?.title ?? url.replace(/^https?:\/\//i, '');
    // A notice replaces the status, so a failed read never reads its stale status beside it.
    const status: PanelDetailsProps['status'] = notice !== undefined
        ? { state: 'warning', label: t(notice) }
        : snapshot === null ? undefined : { state: dotOf(tone, snapshot), label: statusText(snapshot, now, t) };
    const viewChanges = snapshot !== null && entry.ref !== null ? actions.viewChanges : undefined;
    const open = (event: MouseEvent): void => {
        if (viewChanges === undefined || event.metaKey || event.ctrlKey)
            actions.openLink(url);
        else
            viewChanges(entry);
    };
    const head = (h("div", {
        "class": css.changeHead,
        "data-session-panel-row": ""
    }, [
        h("button", {
            "type": "button",
            "data-row-part": "body",
            "data-forge-opens": viewChanges === undefined ? 'link' : 'changes',
            "onClick": open,
            "onAuxclick": (event: MouseEvent) => { if (event.button === 1)
                actions.openLink(url); }
        }, [
            h("span", {
                "data-row-part": "icon"
            }, [
                h(ChangeRequestGlyph, {
                    "tone": tone,
                    "size": 16,
                    "label": t('change.stateAria', { state: t(TONE_LABEL[tone]) })
                })
            ]),
            h("span", {
                "data-row-part": "content"
            }, [
                title
            ])
        ]),
        h("span", {
            "data-row-part": "trailing",
            "class": css.status
        }, [
            number !== null && h("span", {
                "class": css.number
            }, [
                t('change.number', { number })
            ]),
            notice === undefined && h(Mark, {
                "snapshot": snapshot
            }),
            !expanded && notice === undefined && status !== undefined && h("span", {
                "class": css.visuallyHidden
            }, [
                status.label
            ]),
            actions.renderActions?.({ url: entry.url, changeRequestRef: entry.ref, headSha: snapshot?.headSha ?? null, state: snapshot?.state ?? null })
        ]),
        h("span", {
            "data-row-part": "menu"
        }, [
            h(CardMenu, {
                "entry": entry,
                "snapshot": snapshot,
                "name": name,
                "url": url,
                "actions": actions,
                "t": t
            })
        ]),
        h("span", {
            "data-row-part": "trailing",
            "class": css.end
        }, [
            h("button", {
                "type": "button",
                "class": css.expand,
                "aria-expanded": expanded,
                "aria-label": t(expanded ? 'change.collapse' : 'change.expand', { name }),
                "onClick": onToggle
            }, [
                h(IconChevronDownOutlineRegular, {
                    "size": 14,
                    "className": clsx(css.chevron, expanded && css.chevronOpen)
                })
            ])
        ])
    ]));
    const details = actions.renderDetails?.({
        title,
        lines: identity(number, snapshot, t),
        ...status === undefined ? {} : { status },
    });
    return (h("li", {
        "class": css.change,
        "data-forge-change": entry.url,
        "data-expanded": expanded ? '' : undefined
    }, [
        details === undefined ? head : h(HoverCard, { grouped: true }, {
            anchor: () => head,
            default: () => details
        }),
        notice !== undefined && (h("div", {
            "class": css.notice
        }, [
            h("span", null, [
                t(notice)
            ]),
            entry.ref === null
                ? h(Button, {
                    "size": "sm",
                    "variant": "outline",
                    "onClick": () => { actions.openLink(url); }
                }, {
                    default: () => [
                        t('change.view')
                    ]
                }) : h(Button, {
                "size": "sm",
                "variant": "outline",
                "onClick": actions.retry
            }, {
                default: () => [
                    t('retry')
                ]
            })
        ])),
        expanded && snapshot !== null && (h(Details, {
            "entry": entry,
            "snapshot": snapshot,
            "name": name,
            "now": now,
            "actions": actions,
            "locale": locale,
            "t": t
        })),
        expanded && snapshot !== null && h(Primary, {
            "entry": entry,
            "snapshot": snapshot,
            "name": name,
            "actions": actions,
            "t": t
        })
    ]));
}
