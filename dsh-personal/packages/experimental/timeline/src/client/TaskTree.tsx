import { computed, defineComponent, Fragment, h, shallowRef, type VNodeChild } from 'vue';
import { Button, IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconChevronLeftOutlineRegular, IconEllipsisOutlineRegular, IconDownloadOutlineRegular, IconPlusOutlineRegular, IconTrashOutlineRegular, IconQuestionOutlineRegular, Menu, Tag, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { Task, Tree, TimelineView } from '../records.ts';
import { measureAll, prioritiesOf } from '../tasks.ts';
import type { ViewState } from './store.ts';
import { Progress, formatProgress } from './Progress.tsx';
import { MINUTE_MS } from '../policy.ts';
import type { ProgressPrecision } from '../policy.ts';
import { formatDuration } from '../periods.ts';
import { statusTones } from './status.ts';
import { TaskActions } from './TaskActions.tsx';
import type { PlaybackState } from './TaskActions.tsx';
import type { TaskRequest } from './actions.ts';
import { TreeTransfer, exportTree } from './TreeTransfer.tsx';
import type { TreeTransferActions } from './TreeTransfer.tsx';
interface TaskTreeProps extends PropsLocale<'timeline'>, TreeTransferActions {
    sessionId: string;
    view: TimelineView;
    state: ViewState;
    now: number;
    decimals: ProgressPrecision;
    segmented?: boolean;
    update: (patch: Partial<ViewState>) => void;
    toggle: (tree: Tree['id'], id: Task['id']) => void;
    openTask: (tree: Tree['id'], task: Task['id']) => void;
    requestTask: (request: TaskRequest) => Promise<void>;
    playback: PlaybackState;
    running: boolean;
}
/** Whole minutes in the units of formatDuration; less than one minute reads `<1m`. */
function formatMinutes(minutes: number): string {
    return minutes < 1 ? '<1m' : minutes < 60 ? `${minutes}m` : formatDuration(minutes * MINUTE_MS);
}
/** Expandable task hierarchy with host-native semantic status tags. */
export const TaskTree = defineComponent((props: TaskTreeProps) => {
    const menuButton = shallowRef<HTMLButtonElement | null>(null);
    const menuOpen = shallowRef(false);
    const transfer = shallowRef<'import' | 'remove' | null>(null);
    const deleteTarget = shallowRef<Tree | undefined>();
    const message = shallowRef<string | null>(null);
    const tree = computed(() => props.view.trees.find(item => item.id === (props.state.tree ?? props.view.activeTreeId)));
    const missing = computed(() => {
        const treeSnapshot = tree.value;
        return props.state.tree !== null && treeSnapshot === undefined;
    });
    const treeIndex = computed(() => {
        const treeSnapshot = tree.value;
        return props.view.trees.findIndex(item => item.id === treeSnapshot?.id);
    });
    const single = computed(() => {
        const treeSnapshot = tree.value;
        return props.view.trees.length === 1 && treeSnapshot !== undefined;
    });
    const previous = computed(() => props.view.trees[treeIndex.value - 1]);
    const next = computed(() => props.view.trees[treeIndex.value + 1]);
    const select = computed(() => (tree: Tree) => {
        props.update({ tree: tree.id });
        menuOpen.value = false;
    });
    const measures = computed(() => {
        const treeSnapshot = tree.value;
        return measureAll(treeSnapshot?.tasks ?? [], (props.segmented ?? true));
    });
    const priorities = computed(() => {
        const treeSnapshot = tree.value;
        return prioritiesOf(treeSnapshot?.tasks ?? []);
    });
    const parents = computed(() => {
        const treeSnapshot = tree.value;
        return new Set(treeSnapshot?.tasks.filter(task => task.status !== 'retired').map(task => task.parent));
    });
    const overall = computed(() => measures.value.get(null));
    const leaves = computed(() => {
        const treeSnapshot = tree.value;
        return treeSnapshot?.tasks.filter(item => item.status !== 'retired' && !parents.value.has(item.id)) ?? [];
    });
    const done = computed(() => leaves.value.filter(item => item.status === 'done').length);
    const working = computed(() => overall.value?.status === 'active' && props.running);
    const observedAt = computed(() => {
        const treeSnapshot = tree.value;
        return !working.value && treeSnapshot !== undefined
            ? Math.max(treeSnapshot.createdAt, ...treeSnapshot.tasks.map(item => item.updatedAt))
            : props.now;
    });
    const elapsed = computed(() => {
        const treeSnapshot = tree.value;
        return treeSnapshot === undefined ? 0 : Math.max(0, observedAt.value - treeSnapshot.createdAt);
    });
    const remaining = computed(() => overall.value === undefined || overall.value.progress <= 0
        ? null
        : (elapsed.value * (1 - overall.value.progress)) / overall.value.progress);
    const remainingText = computed(() => remaining.value === null ? props.t('unknown') : `≈${formatMinutes(Math.max(1, Math.round(remaining.value / MINUTE_MS)))}`);
    const estimateHint = computed(() => `${props.t('estimateCalculated')}: ${remainingText.value}\n\n${props.t('estimateHint')}`);
    const collapsed = computed(() => {
        const treeSnapshot = tree.value;
        return treeSnapshot !== undefined && Object.hasOwn(props.state.collapsed, treeSnapshot.id) ? props.state.collapsed[treeSnapshot.id] : undefined;
    });
    const rows = computed(() => {
        const treeSnapshot = tree.value;
        return (parent: Task['id'] | null): VNodeChild => treeSnapshot?.tasks
            .filter(item => item.parent === parent && item.status !== 'retired')
            .map((item) => {
            // Rows are reached through the same non-retired branches as measureAll.
            // oxlint-disable-next-line typescript/no-non-null-assertion
            const measure = measures.value.get(item.id)!;
            const nested = parents.value.has(item.id);
            const expanded = !collapsed.value?.includes(item.id);
            const status = measure.status;
            const priority = priorities.value.get(item.id) ?? null;
            return (h("li", { "key": item.id }, [
                h("div", { "class": "timeline-task", "data-status": status }, [
                    nested ? (h("button", { "class": "timeline-disclosure", "aria-label": item.title, "aria-expanded": expanded, "onClick": () => { props.toggle(treeSnapshot.id, item.id); } }, [
                        h("span", { "class": "timeline-caret", "data-expanded": expanded }, [
                            h(IconChevronRightOutlineRegular, { "size": 14 })
                        ])
                    ])) : (h("span", { "class": "timeline-leaf", "data-status": status, "aria-hidden": "true" }, [
                        status === 'done' ? (h(IconCheckOutlineRegular, { "size": 14 })) : (h("span", { "class": "timeline-status-dot" }))
                    ])),
                    h("button", { "class": "timeline-task-title", "data-tree-id": treeSnapshot.id, "data-task-id": item.id, "onClick": () => { props.openTask(treeSnapshot.id, item.id); } }, [
                        h("span", null, [
                            item.title
                        ]),
                        h("small", null, [
                            h(Tag, { "tone": statusTones[status] }, { default: () => [
                                    props.t(status)
                                ] }),
                            priority === null ? null : (h("span", { "class": "timeline-priority-badge", "data-priority": priority }, [
                                priority
                            ])),
                            item.note ? h("span", { "class": "timeline-task-note" }, [
                                item.note
                            ]) : null
                        ])
                    ]),
                    h(Progress, { "label": `${item.title} ${props.t('progress')}`, "value": measure.progress, "status": status, "decimals": props.decimals, "parts": measure.parts, "t": props.t }),
                    h("span", { "class": "timeline-percent" }, [
                        formatProgress(measure.progress, props.decimals),
                        "%"
                    ])
                ]),
                nested && expanded ? h("ul", null, [
                    rows.value(item.id)
                ]) : null
            ]));
        });
    });
    return () => {
        const treeSnapshot = tree.value;
        return (h("section", { "class": "timeline-task-tree", "aria-label": props.t('tasks') }, [
            h("nav", { "class": "timeline-tree-navigation", "aria-label": props.t('taskTreeChoice'), "data-single": single.value || undefined }, [
                props.view.trees.length === 0 || missing.value ? null : (h(Fragment, null, [
                    single.value ? null : (h(Button, { "className": "timeline-icon-button", "aria-label": props.t('previousTree'), "title": props.t('previousTree'), "disabled": previous.value === undefined, "onClick": previous.value === undefined ? undefined : () => { if (previous.value !== undefined)
                            select.value(previous.value); } }, { default: () => [
                            h(IconChevronLeftOutlineRegular, { "size": 18 })
                        ] })),
                    h("div", { "class": "timeline-tree-label" }, [
                        h("div", { "class": "timeline-tree-picker" }, [
                            h("select", { "aria-label": props.t('taskTreeChoice'), "value": treeSnapshot?.id ?? '', "onChange": (event: Event & {
                                    currentTarget: HTMLInputElement;
                                }) => {
                                    const selected = props.view.trees.find(item => item.id === event.currentTarget.value);
                                    if (selected !== undefined)
                                        select.value(selected);
                                } }, [
                                props.view.trees.map(item => (h("option", { "key": item.id, "value": item.id }, [
                                    item.title
                                ])))
                            ])
                        ]),
                        single.value ? null : (h("small", null, [
                            treeIndex.value + 1,
                            " / ",
                            props.view.trees.length
                        ]))
                    ]),
                    single.value ? null : (h(Button, { "className": "timeline-icon-button", "aria-label": props.t('nextTree'), "title": props.t('nextTree'), "disabled": next.value === undefined, "onClick": next.value === undefined ? undefined : () => { if (next.value !== undefined)
                            select.value(next.value); } }, { default: () => [
                            h(IconChevronRightOutlineRegular, { "size": 18 })
                        ] }))
                ])),
                h("div", { "class": "timeline-tree-actions" }, [
                    h(Menu, {
                        "open": menuOpen.value, "onClose": () => { menuOpen.value = false; }, "align": "end", "portal": true, "compact": true, "autoFocus": true,
                        "items": [
                            ...(treeSnapshot?.tasks.some(task => parents.value.has(task.id))
                                ? [
                                    {
                                        id: 'expand',
                                        label: props.t('expandAll'),
                                        icon: h(IconChevronDownOutlineRegular, { "size": 16 }),
                                    },
                                    {
                                        id: 'collapse',
                                        label: props.t('collapseAll'),
                                        icon: h(IconChevronRightOutlineRegular, { "size": 16 }),
                                    },
                                ]
                                : []),
                            {
                                id: 'import',
                                label: props.t('importTree'),
                                icon: h(IconPlusOutlineRegular, { "size": 16 }),
                                disabled: props.running,
                            },
                            ...(treeSnapshot === undefined
                                ? []
                                : [
                                    {
                                        id: 'export',
                                        label: props.t('exportTree'),
                                        icon: h(IconDownloadOutlineRegular, { "size": 16 }),
                                    },
                                    {
                                        id: 'remove',
                                        label: props.t('deleteTree'),
                                        icon: h(IconTrashOutlineRegular, { "size": 16 }),
                                        danger: true,
                                        disabled: props.running,
                                    },
                                ]),
                        ], "onSelect": (id) => {
                            menuOpen.value = false;
                            message.value = null;
                            if (id === 'import' || id === 'remove') {
                                menuButton.value?.focus({ preventScroll: true });
                                if (id === 'remove')
                                    deleteTarget.value = treeSnapshot;
                                transfer.value = id;
                                return;
                            }
                            // Every remaining menu item is registered only for a selected tree.
                            // oxlint-disable-next-line typescript/no-non-null-assertion
                            const selected = treeSnapshot!;
                            if (id === 'export') {
                                try {
                                    exportTree(selected, props.view.annotations, props.sessionId);
                                }
                                catch (caught: unknown) {
                                    message.value = caught instanceof Error ? caught.message : props.t('treeTransferFailed');
                                }
                                return;
                            }
                            props.update({
                                collapsed: {
                                    ...props.state.collapsed,
                                    [selected.id]: id === 'expand'
                                        ? []
                                        : selected.tasks.filter(task => parents.value.has(task.id)).map(task => task.id),
                                },
                            });
                            menuOpen.value = false;
                        }
                    }, { anchor: () => h(Button, { "elementRef": (element: HTMLButtonElement | null) => { menuButton.value = element; }, "className": "timeline-icon-button", "aria-label": props.t('treeActions'), "title": props.t('treeActions'), "aria-haspopup": "menu", "aria-expanded": menuOpen.value, "onClick": () => { menuOpen.value = !menuOpen.value; } }, { default: () => [
                                h(IconEllipsisOutlineRegular, { "size": 18 })
                            ] }) })
                ])
            ]),
            message.value === null ? null : (h("p", { "class": "timeline-error", "role": "alert" }, [
                message.value
            ])),
            h(TreeTransfer, { "key": transfer.value ?? "closed", "sessionId": props.sessionId, "mode": transfer.value, "tree": transfer.value === 'remove'
                    ? (props.view.trees.find(item => item.id === deleteTarget.value?.id) ?? deleteTarget.value ?? undefined)
                    : treeSnapshot, "view": props.view, "running": props.running, "decimals": props.decimals, "t": props.t, "close": () => { transfer.value = null; }, "importTree": props.importTree, "removeTree": props.removeTree, "imported": (id, warning) => {
                    props.update({ tree: id, tab: 'tasks', details: { ...props.state.details, tasks: [] } });
                    message.value = warning ? props.t('treeNotifyUnknown') : null;
                }, "removed": (warning) => {
                    message.value = warning ? props.t('treeNotifyUnknown') : null;
                } }),
            treeSnapshot === undefined ? (h("div", { "class": "timeline-empty" }, [
                missing.value ? (h(Fragment, null, [
                    h("p", { "role": "status" }, [
                        props.t('treeUnavailable')
                    ]),
                    props.view.activeTreeId === null ? null : (h(Button, { "variant": "outline", "onClick": () => { props.update({ tree: null }); } }, { default: () => [
                            props.t('openActiveTree')
                        ] }))
                ])) : (h(Fragment, null, [
                    h("p", null, [
                        props.t('emptyTasks')
                    ]),
                    h("p", { "class": "timeline-muted" }, [
                        props.t('planHint')
                    ]),
                    h(Button, { "variant": "outline", "disabled": props.running, "title": props.running ? props.t('treeIdleRequired') : undefined, "onClick": () => { transfer.value = 'import'; } }, { default: () => [
                            props.t('importTree')
                        ] })
                ]))
            ])) : (h(Fragment, null, [
                h("div", { "class": "timeline-overview", "data-status": overall.value?.status ?? 'pending' }, [
                    h("div", { "class": "timeline-overview-title" }, [
                        h("strong", null, [
                            props.t('progress')
                        ]),
                        h(Tag, { "tone": statusTones[overall.value?.status ?? 'pending'] }, { default: () => [
                                props.t(overall.value?.status ?? 'pending')
                            ] })
                    ]),
                    h(TaskActions, { "playback": props.playback, "key": treeSnapshot.id, "tree": treeSnapshot, "status": overall.value?.status ?? 'pending', "request": props.requestTask, "t": props.t }, { default: () => [
                            h(Progress, { "label": props.t('progress'), "value": overall.value?.progress ?? 0, "status": overall.value?.status ?? 'pending', "decimals": props.decimals, "parts": overall.value?.parts, "t": props.t }),
                            h("strong", null, [
                                formatProgress(overall.value?.progress ?? 0, props.decimals),
                                h("span", null, [
                                    "%"
                                ])
                            ])
                        ] }),
                    h("div", { "class": "timeline-task-stats" }, [
                        h("span", null, [
                            done.value,
                            "/",
                            leaves.value.length,
                            " ",
                            props.t('leafTasks')
                        ]),
                        h("span", null, [
                            props.t('elapsed'),
                            ": ",
                            formatMinutes(Math.floor(elapsed.value / MINUTE_MS)),
                            working.value ? (h(Fragment, null, [
                                ' · ',
                                h("span", { "class": "timeline-eta" }, [
                                    props.t('remaining'),
                                    ": ",
                                    remainingText.value,
                                    h(Tooltip, { "label": estimateHint.value, "side": "top", "maxWidth": 320, "portal": true, "openOnClick": true }, { default: () => [
                                            h(Button, { "className": "timeline-icon-button timeline-estimate-help", "aria-label": props.t('estimateHelp') }, { default: () => [
                                                    h(IconQuestionOutlineRegular, { "size": 14 })
                                                ] })
                                        ] })
                                ])
                            ])) : null
                        ])
                    ])
                ]),
                h("ul", { "class": "timeline-tasks" }, [
                    rows.value(null)
                ])
            ]))
        ]));
    };
}, { name: "TaskTree", inheritAttrs: false, props: ["sessionId", "view", "state", "now", "decimals", "segmented", "update", "toggle", "openTask", "requestTask", "playback", "running", "importTree", "removeTree", "t"] });
