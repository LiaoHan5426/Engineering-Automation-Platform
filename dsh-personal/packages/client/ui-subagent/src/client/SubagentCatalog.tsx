/** Subagent catalog tree shared by the Session panel section and the breadcrumb switcher. */
import { defineComponent, ref, shallowRef, watchEffect, h, Fragment, type VNodeChild } from "vue";
import type { SessionListState, SessionProjectionMap, SessionProjectionSnapshot, SessionSummary, } from "@deepseek-ai/dsh-api-session-controller/client";
import type { SessionStatusSnapshot } from "@deepseek-ai/dsh-client-ui-session-status/client";
import type { SubagentAddress } from "@deepseek-ai/dsh-subagent/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { HoverCard, IconCheckOutlineRegular, IconChevronRightOutlineRegular, IconRefreshOutlineRegular, StateDot, Tooltip, } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PanelDetailsProps } from "@deepseek-ai/dsh-client-ui-session-panel/client";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import type { NS } from "./locales.ts";
import type {} from "@deepseek-ai/dsh-token-meter/client";
import css from "./SubagentCatalog.module.css";
/** One Session's direct subagents with their live activity. */
export type SubagentCatalogSnapshot = Omit<SessionProjectionSnapshot, "values" | "state"> & {
    state: "idle" | "loading" | "ready" | "migration-required" | "error";
    entries: (SessionProjectionMap["subagentCatalog"][number] & {
        activity: "running" | "inactive";
    })[];
};
/** Catalogs of every Session whose projections the Client holds. */
export type Catalogs = Readonly<Record<SessionId, SubagentCatalogSnapshot>>;
/** Business actions supplied by the slot registrations. */
export type SubagentCatalogInjected = {
    openChild: (address: SubagentAddress) => void;
    openChildAside: (address: SubagentAddress) => void;
    refreshProjection: (parentSessionId: SessionId) => void;
    /** Read this catalog and its direct children after explicit activation or retry. */
    prepareCatalog: (parentSessionId: SessionId) => Promise<void>;
};
interface CatalogRowsProps {
    parentSessionId: SessionId;
    currentSessionId: SessionId | undefined;
    catalog: SubagentCatalogSnapshot;
    catalogs: Catalogs;
    summaries: Readonly<Record<SessionId, SessionSummary>>;
    expanded: ReadonlySet<SessionId>;
    level: number;
    openChild: (address: SubagentAddress) => void;
    openChildAside: (address: SubagentAddress) => void;
    refreshProjection: (parentSessionId: SessionId) => void;
    toggleBranch: (childSessionId: SessionId) => void;
    closeCatalog: () => void;
    panelDetails: CatalogTreeProps["panelDetails"];
}
/**
 * List the focusable rows of a catalog tree in display order.
 * @param root - the tree or an element that contains it.
 * @returns the rows that accept focus.
 */
export function treeItems(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>("[role=\"treeitem\"]:not([aria-disabled=\"true\"])"));
}
/** Compact token count shared in shape with the conversation stats strip. */
function formatTokens(value: number, t: TranslateNS<typeof NS>): string {
    const scaled = (next: number): string => next >= 100
        ? String(Math.round(next))
        : String(Math.round(next * 10) / 10);
    if (value < 1000)
        return String(value);
    if (value < 1000000)
        return t("tokens.thousand", {
            value: scaled(value / 1000)
        });
    return t("tokens.million", {
        value: scaled(value / 1000000)
    });
}
/** Sum the four disjoint durable provider-usage buckets. */
function tokenTotal(usage: SessionProjectionMap["tokenUsage"] | undefined): number | undefined {
    return usage === undefined
        ? undefined
        : usage.uncachedInputTokens + usage.outputTokens
            + usage.cacheReadTokens + usage.cacheWriteTokens;
}
/** Exact whole-second active-turn duration for one catalog row. */
function activityDuration(summary: SessionSummary | undefined, activity: "running" | "inactive", now: number): number | undefined {
    if (summary === undefined)
        return undefined;
    const timing: SessionProjectionMap["subagentTiming"] | undefined = summary.projectionValues?.subagentTiming;
    if (timing === undefined)
        return undefined;
    if (timing.active === undefined)
        return timing.settledMs;
    const end = activity === "running"
        ? now
        : timing.active.through;
    return timing.settledMs + Math.max(0, end - timing.active.since);
}
interface DurationParts {
    seconds: number;
    minutes: number;
    hours: number;
    days: number;
    totalMinutes: number;
    totalHours: number;
}
function splitDuration(ms: number): DurationParts {
    const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    return {
        seconds: totalSeconds % 60,
        minutes: totalMinutes % 60,
        hours: totalHours % 24,
        days: Math.floor(totalHours / 24),
        totalMinutes,
        totalHours
    };
}
/** Format a duration with decreasing visual precision at larger scales. */
function formatDuration(ms: number, t: TranslateNS<typeof NS>): string {
    const { seconds, minutes, hours, days, totalMinutes, totalHours } = splitDuration(ms);
    if (days >= 365) {
        const years = Math.floor(days / 365);
        const months = Math.floor((days % 365) / 30);
        return months === 0
            ? t("duration.years", {
                years
            })
            : t("duration.yearsMonths", {
                years, months
            });
    }
    if (days >= 30) {
        const months = Math.floor(days / 30);
        const remainingDays = days % 30;
        return remainingDays === 0
            ? t("duration.months", {
                months
            })
            : t("duration.monthsDays", {
                months, days: remainingDays
            });
    }
    if (days > 0) {
        return hours === 0
            ? t("duration.days", {
                days
            })
            : t("duration.daysHours", {
                days, hours
            });
    }
    if (totalHours > 0) {
        return t("duration.hours", {
            hours: totalHours,
            minutes: String(minutes).padStart(2, "0"),
            seconds: String(seconds).padStart(2, "0")
        });
    }
    if (totalMinutes > 0) {
        return t("duration.minutes", {
            minutes: totalMinutes,
            seconds: String(seconds).padStart(2, "0")
        });
    }
    return t("duration.seconds", {
        seconds
    });
}
/** Preserve exact whole seconds for hover and accessible naming. */
function formatExactDuration(ms: number, t: TranslateNS<typeof NS>): string {
    const { seconds, minutes, hours, days } = splitDuration(ms);
    return days === 0
        ? formatDuration(ms, t)
        : t("duration.exactDays", {
            days,
            hours: String(hours).padStart(2, "0"),
            minutes: String(minutes).padStart(2, "0"),
            seconds: String(seconds).padStart(2, "0")
        });
}
/** Render catalog loading without inventing child membership. */
function CatalogLoadingRows({ t }: {
    t: TranslateNS<typeof NS>;
}) {
    return h("div", {
        "class": css.notice
    }, [
        t("loading.label")
    ]);
}
/** Only confirmed child membership exposes a branch disclosure. */
function canExpandCatalog(entry: SubagentCatalogSnapshot["entries"][number], catalogs: Catalogs, summaries: CatalogRowsProps["summaries"]): boolean {
    return entry.mode !== "external" && (catalogs[entry.id]?.entries.length ?? 0) > 0
        && summaries[entry.id]?.formatStatus !== "migration-required"
        && catalogs[entry.id]?.state !== "migration-required";
}
/** The agent name unique among the row's siblings, or the Session ID for entries recorded without one. */
/**
 * Name a catalog entry when it has no description.
 * @param entry - catalog entry.
 * @returns the entry's display name.
 */
export function entryName(entry: SubagentCatalogSnapshot["entries"][number]): string {
    return entry.mode === "continuable" || entry.mode === "external" ? entry.name ?? entry.id : entry.id;
}
/** Only a local child's last closed, normally completed turn receives the completed marker. */
function completedEntry(entry: SubagentCatalogSnapshot["entries"][number], summary: SessionSummary | undefined): boolean {
    return entry.mode !== "external" && entry.activity === "inactive"
        && summary?.projectionValues?.subagentTiming?.lastTurnCompleted === true;
}
/** Count direct catalog members without treating external or other inactive entries as completed. */
function catalogProgress(entries: SubagentCatalogSnapshot["entries"], summaries: CatalogRowsProps["summaries"], t: TranslateNS<typeof NS>): string {
    let completed = 0;
    let active = 0;
    let inactive = 0;
    let external = 0;
    for (const entry of entries) {
        if (entry.mode === "external")
            external++;
        else if (entry.activity === "running")
            active++;
        else if (completedEntry(entry, summaries[entry.id]))
            completed++;
        else
            inactive++;
    }
    return [
        ...completed > 0 ? [
            t("progress.completed", {
                count: completed
            })
        ] : [],
        ...active > 0 ? [
            t("progress.active", {
                count: active
            })
        ] : [],
        ...inactive > 0 ? [
            t("progress.inactive", {
                count: inactive
            })
        ] : [],
        ...external > 0 ? [
            t("progress.external", {
                count: external
            })
        ] : []
    ].join("\u2002\u00B7\u2002");
}
/** Render one catalog level and recurse only through explicitly expanded rows. */
const CatalogRows = defineComponent((props: CatalogRowsProps & {
    t: TranslateNS<typeof NS>;
}) => {
    const now = ref(Date.now());
    watchEffect(cleanup => {
        if (!props.catalog.entries.some(entry => entry.activity === "running"))
            return;
        const timer = setInterval(() => {
            now.value = Date.now();
        }, 1000);
        cleanup(() => {
            clearInterval(timer);
        });
    });
    return (): VNodeChild => {
        const { parentSessionId, currentSessionId, catalog, catalogs, summaries, expanded, level, openChild, openChildAside, refreshProjection, toggleBranch, closeCatalog, panelDetails, t, } = props;
        const dense = panelDetails !== undefined;
        const emptyLoading = catalog.state === "loading" && catalog.entries.length === 0;
        const reserveDisclosure = catalog.entries.some(entry => canExpandCatalog(entry, catalogs, summaries));
        return (h(Fragment, {}, [
            catalog.state === "idle" && catalog.entries.length === 0 && (h("div", {
                "class": css.notice
            }, [
                t("load.idle")
            ])),
            emptyLoading && (h(CatalogLoadingRows, {
                "t": t
            }, undefined)),
            catalog.state === "error" && (h("div", {
                "class": css.error
            }, [
                h("span", {}, [
                    catalog.error?.message ?? t("load.error")
                ]),
                h("button", {
                    "type": "button",
                    "class": css.refresh,
                    "onClick": () => {
                        refreshProjection(parentSessionId);
                    }
                }, [
                    h(IconRefreshOutlineRegular, {
                        "size": 14
                    }, undefined),
                    t("retry")
                ])
            ])),
            catalog.entries.map((entry) => {
                const external = entry.mode === "external";
                const childCatalog = catalogs[entry.id];
                const isCurrent = entry.id === currentSessionId;
                const requiresOpening = summaries[entry.id]?.formatStatus === "migration-required"
                    || childCatalog?.state === "migration-required";
                const canExpand = canExpandCatalog(entry, catalogs, summaries);
                const isExpanded = canExpand && expanded.has(entry.id);
                const summary = summaries[entry.id];
                const description = entry.label || summary?.title;
                const name = entryName(entry);
                const primaryLabel = description || name;
                const secondaryLabel = description ? name : undefined;
                const mode = external ? t("mode.external") : entry.mode === "unknown" ? t("mode.unknown")
                    : entry.mode === "one-shot" ? t("mode.oneShot") : t("mode.continuable");
                const completed = completedEntry(entry, summary);
                const activity = external ? undefined : entry.activity === "running"
                    ? t("activity.running")
                    : completed
                        ? t("activity.completed")
                        : t("activity.inactive");
                const secondary = [
                    secondaryLabel, mode, activity
                ].filter(value => value !== undefined)
                    .join(" \u00B7 ");
                const totalTokens = tokenTotal(summary?.projectionValues?.tokenUsage);
                const durationMs = activityDuration(summary, entry.activity, now.value);
                const tokenMetric = totalTokens === undefined
                    ? undefined
                    : t("tokens.total", {
                        value: formatTokens(totalTokens, t)
                    });
                const durationMetric = durationMs === undefined
                    ? undefined
                    : {
                        compact: formatDuration(durationMs, t),
                        exact: formatExactDuration(durationMs, t)
                    };
                const metrics = [
                    tokenMetric, durationMetric?.exact
                ].filter(value => value !== undefined)
                    .join(" \u00B7 ");
                const dotState = entry.activity === "running" ? "ongoing" : completed ? "done" : "idle";
                const open = (): void => {
                    if (external)
                        return;
                    openChild({
                        parentSessionId,
                        childSessionId: entry.id,
                        mode: entry.mode
                    });
                    closeCatalog();
                };
                const handleKey = (event: KeyboardEvent & {
                    currentTarget: HTMLDivElement;
                }): void => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        open();
                    }
                    else if ((event.key === "ArrowRight" && canExpand && !isExpanded)
                        || (event.key === "ArrowLeft" && isExpanded)) {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleBranch(entry.id);
                    }
                };
                const toggle = (event: MouseEvent & {
                    currentTarget: HTMLButtonElement;
                }): void => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleBranch(entry.id);
                };
                const row = (h("div", {
                    "role": "treeitem",
                    "tabIndex": external ? -1 : 0,
                    "aria-disabled": external || undefined,
                    "aria-level": level,
                    "aria-current": isCurrent || undefined,
                    "aria-label": [
                        primaryLabel, secondary, metrics
                    ].filter(value => value !== "").join(" "),
                    ...canExpand ? {
                        "aria-expanded": isExpanded
                    } : {},
                    "class": css.row,
                    "onClick": open,
                    "onKeydown": handleKey
                }, [
                    !canExpand
                        ? reserveDisclosure && h("span", {
                            "class": css.disclosureSpace
                        }, undefined)
                        : (h("button", {
                            "type": "button",
                            "tabIndex": -1,
                            "class": `${css.disclosure} ${isExpanded ? css.disclosureOpen : ""}`,
                            "aria-label": t(isExpanded ? "branch.collapse" : "branch.expand", {
                                label: primaryLabel
                            }),
                            "onClick": toggle
                        }, [
                            h(IconChevronRightOutlineRegular, {}, undefined)
                        ])),
                    h("div", {
                        "class": css.clickarea
                    }, [
                        h("span", {
                            "class": css.rowActivitySlot
                        }, [
                            h(StateDot, {
                                "state": dotState
                            }, undefined)
                        ]),
                        h("span", {
                            "class": css.content
                        }, [
                            h("span", {
                                "class": `${css.label} ${isCurrent ? css.currentLabel : ""}`
                            }, [
                                primaryLabel
                            ]),
                            !dense && secondaryLabel !== undefined && (h("span", {
                                "class": css.secondaryLabel
                            }, [
                                secondaryLabel
                            ]))
                        ]),
                        dense
                            ? durationMetric !== undefined && h("span", {
                                "class": css.duration
                            }, [
                                durationMetric.compact
                            ])
                            : metrics !== "" && (h("span", {
                                "class": css.metrics
                            }, [
                                tokenMetric !== undefined && h("span", {
                                    "class": css.metricToken
                                }, [
                                    tokenMetric
                                ]),
                                durationMetric !== undefined && (h("span", {
                                    "class": css.metricDuration
                                }, [
                                    durationMetric.compact
                                ]))
                            ])),
                        isCurrent
                            ? (h("span", {
                                "class": `${css.sidebarSpace} ${css.currentCheck}`,
                                "aria-hidden": true,
                                "data-subagent-current": true
                            }, [
                                h(IconCheckOutlineRegular, {
                                    "size": 16
                                }, undefined)
                            ]))
                            : external ? h("span", {
                                "class": css.sidebarSpace
                            }, undefined) : (h(Tooltip, {
                                "label": t("open.sidebar"),
                                "delayMs": 500,
                                "side": "bottom",
                                "align": "end"
                            }, { default: () => [
                                    h("button", {
                                        "type": "button",
                                        "class": css.sidebarButton,
                                        "aria-label": t("open.sidebar.aria", {
                                            label: primaryLabel
                                        }),
                                        "onClick": (event: MouseEvent) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            openChildAside({
                                                parentSessionId, childSessionId: entry.id, mode: entry.mode
                                            });
                                            closeCatalog();
                                        },
                                        "onKeydown": (event: KeyboardEvent & { currentTarget: HTMLDivElement }) => {
                                            event.stopPropagation();
                                        }
                                    }, [
                                        h(IconChevronRightOutlineRegular, {}, undefined)
                                    ])
                                ] }))
                    ])
                ]));
                const details = panelDetails?.({
                    title: primaryLabel,
                    lines: secondaryLabel === undefined ? [] : [
                        t("hover.owner", {
                            name: secondaryLabel
                        })
                    ],
                    status: {
                        state: dotState, label: [
                            activity, mode
                        ].filter(value => value !== undefined).join(" \u00B7 ")
                    },
                    facts: [
                        ...tokenMetric === undefined ? [] : [
                            {
                                kind: "tokens" as const, label: tokenMetric
                            }
                        ],
                        ...durationMetric === undefined ? [] : [
                            {
                                kind: "duration" as const, label: durationMetric.exact
                            }
                        ]
                    ]
                });
                return (h("div", {
                    "key": entry.id,
                    "class": css.node
                }, [
                    dense ? h(HoverCard, { grouped: true }, { anchor: () => row, default: () => details }) : row,
                    !isExpanded && !external && !requiresOpening && childCatalog?.state === "error" && (h("div", {
                        "class": css.error,
                        "role": "alert"
                    }, [
                        h("span", {}, [
                            t("load.error")
                        ]),
                        h("button", {
                            "type": "button",
                            "class": css.refresh,
                            "onClick": () => {
                                refreshProjection(entry.id);
                            }
                        }, [
                            h(IconRefreshOutlineRegular, {
                                "size": 14
                            }, undefined),
                            t("retry")
                        ])
                    ])),
                    childCatalog !== undefined && isExpanded && (h("div", {
                        "role": "group",
                        "class": css.children
                    }, [
                        h(CatalogRows, {
                            "parentSessionId": entry.id,
                            "currentSessionId": currentSessionId,
                            "catalog": childCatalog,
                            "catalogs": catalogs,
                            "summaries": summaries,
                            "expanded": expanded,
                            "level": level + 1,
                            "openChild": openChild,
                            "openChildAside": openChildAside,
                            "refreshProjection": refreshProjection,
                            "toggleBranch": toggleBranch,
                            "closeCatalog": closeCatalog,
                            "panelDetails": panelDetails,
                            "t": t
                        }, undefined)
                    ]))
                ]));
            })
        ]));
    };
}, {
    props: [
        "parentSessionId",
        "currentSessionId",
        "catalog",
        "catalogs",
        "summaries",
        "expanded",
        "level",
        "openChild",
        "openChildAside",
        "refreshProjection",
        "toggleBranch",
        "closeCatalog",
        "panelDetails",
        "t"
    ]
});
/**
 * Build every held Session's catalog from its projection and live status.
 * @param projections - projection snapshots by Session.
 * @param summaries - Session list rows by id.
 * @param statuses - live Session statuses.
 * @returns catalogs keyed by parent Session.
 */
export function deriveCatalogs(projections: SessionListState["projectionsBySession"], summaries: SessionListState["byId"], statuses: SessionStatusSnapshot): Catalogs {
    return Object.fromEntries(Object.entries(projections).map(([id, snapshot]) => {
        const projected = snapshot.values.subagentCatalog;
        const state = snapshot.state === "idle"
            ? projected === undefined ? "idle" : "ready"
            : snapshot.state === "migration-required" && projected !== undefined ? "ready" : snapshot.state;
        return [
            id, {
                state,
                error: snapshot.error,
                entries: (projected ?? []).map(entry => ({
                    ...entry,
                    activity: (statuses.get(entry.id)?.running ?? summaries[entry.id]?.running) === true
                        ? "running" as const : "inactive" as const
                }))
            } satisfies SubagentCatalogSnapshot
        ];
    }));
}
/**
 * The direct subagents of `catalog`'s Session plus progress, as one phrase such as "2 of 3 done".
 * @param catalog - catalog whose entries are counted.
 * @param summaries - Session list rows by id.
 * @param t - subagent copy.
 * @returns the progress phrase, or an empty string without entries.
 */
export function progressOf(catalog: SubagentCatalogSnapshot, summaries: CatalogRowsProps["summaries"], t: TranslateNS<typeof NS>): string {
    return catalogProgress(catalog.entries, summaries, t);
}
/**
 * Bind catalog preparation as a fire-and-forget level read; a rejection is
 * logged, and the next activation or retry prepares the level again.
 * @param prepareCatalog - the injected catalog action.
 * @returns a callback that prepares one level.
 */
export function levelPreparer(prepareCatalog: SubagentCatalogInjected["prepareCatalog"]): (sessionId: SessionId) => void {
    return (sessionId) => {
        void prepareCatalog(sessionId).catch((error: unknown) => {
            console.error("[ui-subagent] catalog discovery failed:", error);
        });
    };
}
/** Props of one subagent tree. */
export interface CatalogTreeProps {
    /** Session whose direct catalog roots the tree. */
    rootSessionId: SessionId;
    /** Selected descendant highlighted in the tree. */
    currentSessionId?: SessionId | undefined;
    catalog: SubagentCatalogSnapshot;
    catalogs: Catalogs;
    summaries: CatalogRowsProps["summaries"];
    openChild: (address: SubagentAddress) => void;
    openChildAside: (address: SubagentAddress) => void;
    /** Read a level's catalog and its direct children; the tree calls it on branch expansion and retry. */
    prepareLevel: (parentSessionId: SessionId) => void;
    /** Called after a row opened a Session, so a surrounding popover or overlay can close. */
    onOpened: () => void;
    /** Focus the first row on mount, as a keyboard-opened popover does. */
    focusFirst?: boolean;
    /**
     * Renders the Session panel's row details. With it the tree lists one-line
     * rows, as the Session panel does, and each row shows its name, owner,
     * state, and measures in a hover card.
     */
    panelDetails?: ((details: PanelDetailsProps) => VNodeChild) | undefined;
    t: TranslateNS<typeof NS>;
}
/**
 * Render a subagent tree with expandable branches and roving arrow-key focus.
 * A row offers expansion only after its own catalog has entries; expanding it
 * prepares that level, and collapsing a branch also collapses its descendants.
 * @param props - catalog data, actions, and copy.
 * @returns the tree.
 */
export const CatalogTree = defineComponent((props: CatalogTreeProps) => {
    const expanded = shallowRef<ReadonlySet<SessionId>>(new Set());
    const setExpanded = (update: (current: ReadonlySet<SessionId>) => ReadonlySet<SessionId>) => {
        expanded.value = update(expanded.value);
    };
    const treeRef = shallowRef<HTMLDivElement | null>(null);
    watchEffect(() => {
        if (props.focusFirst && treeRef.value)
            treeItems(treeRef.value)[0]?.focus();
    }, {
        flush: "post"
    });
    return (): VNodeChild => {
        const { rootSessionId, currentSessionId, catalog, catalogs, summaries, openChild, openChildAside, prepareLevel, onOpened, panelDetails, t } = props;
        const closeBranch = (root: SessionId): void => {
            const closing = new Set<SessionId>();
            const visit = (parentSessionId: SessionId): void => {
                if (closing.has(parentSessionId) || !expanded.value.has(parentSessionId))
                    return;
                closing.add(parentSessionId);
                for (const entry of catalogs[parentSessionId]?.entries ?? [])
                    visit(entry.id);
            };
            visit(root);
            setExpanded(current => new Set([
                ...current
            ].filter(id => !closing.has(id))));
        };
        const toggleBranch = (childSessionId: SessionId): void => {
            if (expanded.value.has(childSessionId)) {
                closeBranch(childSessionId);
                return;
            }
            setExpanded(current => new Set(current).add(childSessionId));
            prepareLevel(childSessionId);
        };
        const navigate = (event: KeyboardEvent & {
            currentTarget: HTMLDivElement;
        }): void => {
            const items = treeItems(event.currentTarget);
            const index = items.indexOf(document.activeElement as HTMLElement);
            const focusAt = (next: number): void => {
                items[(next + items.length) % items.length]?.focus();
            };
            if (items.length === 0)
                return;
            if (event.key === "Home")
                focusAt(0);
            else if (event.key === "End")
                focusAt(items.length - 1);
            else if (event.key === "ArrowDown")
                focusAt(index + 1);
            else if (event.key === "ArrowUp")
                focusAt(index < 0 ? items.length - 1 : index - 1);
            else
                return;
            event.preventDefault();
        };
        return (h("div", {
            "ref": treeRef,
            "role": "tree",
            "aria-label": t("tree.aria"),
            "onKeydown": navigate
        }, [
            h(CatalogRows, {
                "parentSessionId": rootSessionId,
                "currentSessionId": currentSessionId,
                "catalog": catalog,
                "catalogs": catalogs,
                "summaries": summaries,
                "expanded": expanded.value,
                "level": 1,
                "openChild": openChild,
                "openChildAside": openChildAside,
                "refreshProjection": prepareLevel,
                "toggleBranch": toggleBranch,
                "closeCatalog": onOpened,
                "panelDetails": panelDetails,
                "t": t
            }, undefined)
        ]));
    };
}, {
    props: [
        "rootSessionId",
        "currentSessionId",
        "catalog",
        "catalogs",
        "summaries",
        "openChild",
        "openChildAside",
        "prepareLevel",
        "onOpened",
        "focusFirst",
        "panelDetails",
        "t"
    ]
});
