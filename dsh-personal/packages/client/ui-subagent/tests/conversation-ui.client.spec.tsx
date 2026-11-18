// @vitest-environment jsdom
import { contextMenuHook } from "@deepseek-ai/dsh-client-test-runtime";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { act, cleanup, render as nativeRender } from "../../../test-support/client-runtime/src/vue-test.ts";
import { fireEvent as nativeFireEvent, screen, within } from "@testing-library/dom";
import { h, Fragment, defineComponent, computed, shallowRef, type Component, type ComputedRef } from "vue";
import { allowAllAccess, bindSnapshotSelector, makeTranslate, RemoteError, sessionSnapshot } from "@deepseek-ai/dsh-client-test-runtime";
import type { SessionListState, SessionSummary, SessionSnapshot, } from "@deepseek-ai/dsh-api-session-controller/client";
import type { SubagentAddress, SubagentCatalogEntry } from "@deepseek-ai/dsh-subagent/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { SessionStatusSnapshot } from "@deepseek-ai/dsh-client-ui-session-status/client";
import { SubagentHeaderLineage as NativeSubagentHeaderLineage, type SubagentHeaderLineageProps as NativeSubagentHeaderLineageProps } from "../src/client/SubagentHeaderLineage.tsx";
import { SubagentsProgress as NativeSubagentsProgress, SubagentsRunningIndicator as NativeSubagentsRunningIndicator, SubagentsSection as NativeSubagentsSection, type SubagentsProgressProps as NativeSubagentsProgressProps, type SubagentsRunningIndicatorProps as NativeSubagentsRunningIndicatorProps, type SubagentsSectionProps as NativeSubagentsSectionProps, } from "../src/client/SubagentsSection.tsx";
import { SubagentReadOnlyComposer } from "../src/client/SubagentReadOnlyComposer.tsx";
import { createSubagentsSectionStore } from "../src/client/subagents-store.ts";
import { en, zh } from "../src/client/locales.ts";
import type { PanelDetailsProps, PanelFoldProps } from "@deepseek-ai/dsh-client-ui-session-panel/client";
const fireEvent = {
 ...nativeFireEvent,
 click(...args: Parameters<typeof nativeFireEvent.click>) { if (vi.isFakeTimers()) vi.advanceTimersByTime(1); return nativeFireEvent.click(...args) },
}
const fixtureRevision = shallowRef(0)
function render(element: Parameters<typeof nativeRender>[0]) {
 const view = nativeRender(element)
 return { ...view, rerender: async (next: Parameters<typeof nativeRender>[0]) => { fixtureRevision.value++; await view.rerender(next) } }
}
type RawHooks = {
    useSessions<T>(select: (state: SessionListState) => T): T;
    useSession<T>(select: (state: SessionSnapshot) => T): T;
    useSessionStatus<T>(select: (state: SessionStatusSnapshot) => T): T;
};
type RawProps<P> = Omit<P, keyof RawHooks> & RawHooks;
type SubagentHeaderLineageProps = RawProps<NativeSubagentHeaderLineageProps>;
type SubagentsSectionProps = RawProps<NativeSubagentsSectionProps>;
type SubagentsProgressProps = RawProps<NativeSubagentsProgressProps>;
type SubagentsRunningIndicatorProps = RawProps<NativeSubagentsRunningIndicatorProps>;
/** Bind each scenario's snapshots through live native selector seats. */
function withRawHooks(component: Component) {
    return defineComponent({
        inheritAttrs: false, setup(_, { attrs }) {
            const current = shallowRef(attrs);
            const hooks = Object.fromEntries([
                "useSessions",
                "useSession",
                "useSessionStatus"
            ].map(name => [
                name,
                (select: (state: never) => unknown): ComputedRef<unknown> => computed(() => { fixtureRevision.value; return (current.value[name] as (select: (state: never) => unknown) => unknown)(select) })
            ]));
            return () => {
                current.value = {
                    ...attrs
                };
                return h(component, {
                    ...attrs, ...hooks
                });
            };
        }
    });
}
const SubagentHeaderLineage = withRawHooks(NativeSubagentHeaderLineage);
const SubagentsProgress = withRawHooks(NativeSubagentsProgress);
const SubagentsRunningIndicator = withRawHooks(NativeSubagentsRunningIndicator);
const SubagentsSection = withRawHooks(NativeSubagentsSection);
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
const PARENT = "parent" as SessionId;
const CHILD = "child" as SessionId;
const GRANDCHILD = "grandchild" as SessionId;
const t: SubagentHeaderLineageProps["t"] = makeTranslate(zh);
/** One Session's section store, as the registration mints it. */
type SectionStore = ReturnType<ReturnType<typeof createSubagentsSectionStore>["create"]>;
type HeaderCatalogProps = SubagentHeaderLineageProps & {
    dismissOverlay?: () => void;
    store?: SectionStore | undefined;
};
type CatalogFixtureEntry<Entry = SubagentCatalogEntry> = Entry extends SubagentCatalogEntry ? Omit<Entry, "createdAt"> & {
    activity: "running" | "inactive";
} : never;
type CatalogFixture = {
    entries: readonly CatalogFixtureEntry[];
    state: SessionListState["projectionsBySession"][SessionId]["state"];
    error: SessionListState["projectionsBySession"][SessionId]["error"];
};
function catalog(over: Partial<CatalogFixture> = {}): CatalogFixture {
    return {
        entries: [
            {
                id: CHILD, mode: "continuable", label: "worker",
                activity: "running"
            },
            {
                id: "child-2" as SessionId, mode: "one-shot",
                label: "reviewer", activity: "inactive"
            }
        ],
        state: "ready",
        error: null,
        ...over
    };
}
function props(value: CatalogFixture | undefined, nested: Readonly<Record<SessionId, CatalogFixture>> = {}, summaries?: Readonly<Record<SessionId, SessionSummary>>, boundAddress?: SubagentAddress) {
    const catalogs = value === undefined ? nested : {
        [PARENT]: value, ...nested
    };
    const statuses: SessionStatusSnapshot = new Map();
    const state = {
        ids: [
            CHILD
        ],
        byId: summaries ?? {
            ...Object.fromEntries(Object.values(catalogs).flatMap(catalog => catalog.entries.map(entry => [
                entry.id,
                {
                    id: entry.id, displayTitle: entry.label ?? entry.id, running: entry.activity === "running", blank: false, updatedAt: 1, retainedBy: {}
                }
            ]))),
            [CHILD]: {
                id: CHILD,
                title: "\u6B63\u5728\u626B\u63CF\u9879\u76EE\u6587\u4EF6",
                displayTitle: "worker",
                running: Object.values(catalogs).some(catalog => catalog.entries.some(entry => entry.id === CHILD && entry.activity === "running")),
                retainedBy: {},
                blank: false,
                updatedAt: Date.now()
            }
        },
        phase: "ready",
        projectionsBySession: Object.fromEntries(Object.entries(catalogs).map(([id, catalog]) => [
            id,
            {
                state: catalog.state, error: catalog.error,
                values: {
                    subagentCatalog: catalog.entries.map(({ activity: _activity, ...entry }) => ({
                        ...entry, createdAt: 1
                    }))
                }
            }
        ]))
    } satisfies SessionListState;
    function useSessions<T>(select: (snapshot: SessionListState) => T): T {
        return select(state);
    }
    const snapshot: SessionSnapshot = {
        ...sessionSnapshot(PARENT),
        subagent: boundAddress === undefined ? null : {
            address: boundAddress
        }
    };
    const unused = (): never => {
        throw new Error("Subagent header fixture does not provide this slot source or action");
    };
    const standard = {
        usePanelInfo: unused,
        useSessionRetainInfo: unused,
        useWorkspaces: unused,
        useResource: unused,
        ...allowAllAccess,
        useContextMenu: contextMenuHook(),
        useProjection: unused,
        useConversation: unused,
        useInput: unused,
        useChat: unused,
        useTrajectory: unused,
        inputActions: {
            insertQuote: () => false,
            captureInsertion: unused,
            insertText: unused,
            setDraft: unused,
            persistDraft: unused,
            addAttachments: unused,
            removeAttachment: unused,
            pruneAttachments: unused,
            submit: unused
        }
    };
    return {
        ...standard,
        sessionId: PARENT,
        useSessions,
        useSessionStatus: <T,>(select: (snapshot: SessionStatusSnapshot) => T): T => select(statuses),
        useSession: <T,>(select: (snapshot: SessionSnapshot) => T): T => select(snapshot),
        openChild: vi.fn(),
        openChildAside: vi.fn(),
        refreshProjection: vi.fn(),
        prepareCatalog: vi.fn<(id: SessionId) => Promise<void>>().mockResolvedValue(),
        lineageSessionId: PARENT,
        displayTitle: "Parent title",
        t
    } satisfies HeaderCatalogProps;
}
function summary(id: SessionId, updatedAt: number): SessionSummary {
    return {
        id,
        displayTitle: id,
        running: false,
        retainedBy: {},
        blank: false,
        updatedAt
    };
}
async function hoverCatalog(trigger: HTMLElement): Promise<void> {
    if (!vi.isFakeTimers()) vi.useFakeTimers();
    await act(() => fireEvent.pointerEnter(trigger));
    await act(() => {
        vi.advanceTimersByTime(150);
    });
}
function enableTooltips(): void {
    class TooltipObserver implements ResizeObserver {
        constructor(private readonly callback: ResizeObserverCallback) {
        }
        observe(target: Element): void {
            const size = {
                inlineSize: 160, blockSize: 30
            };
            this.callback([
                {
                    target, borderBoxSize: [
                        size
                    ], contentBoxSize: [
                        size
                    ], devicePixelContentBoxSize: [
                        size
                    ], contentRect: new DOMRect()
                }
            ], this);
        }
        unobserve(): void {
        }
        disconnect(): void {
        }
    }
    vi.stubGlobal("ResizeObserver", TooltipObserver);
    vi.stubGlobal("matchMedia", vi.fn(() => ({
        matches: true
    })));
}
/**
 * Rest the pointer on a Session panel row past the hover card's 500ms dwell and
 * read the card's parts in order, then leave it.
 * @param row - the row's treeitem.
 * @returns the card's lines, or null while no card shows.
 */
async function hoverDetailsOf(row: HTMLElement): Promise<string[] | null> {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
        matches: query === "(any-hover: hover)"
    })));
    const anchor = row.parentElement as HTMLElement;
    await act(() => fireEvent.pointerEnter(anchor, {
        pointerType: "mouse"
    }));
    await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
    });
    const card = document.querySelector("[data-session-panel-details]");
    const lines = card === null ? null : [
        ...card.children
    ].map(child => child.textContent ?? "");
    await act(() => fireEvent.pointerLeave(anchor, {
        pointerType: "mouse"
    }));
    await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
    });
    return lines;
}
/**
 * The two surfaces as the real page composes them: the breadcrumb switcher
 * (child sessions, lineage slot) and the Session panel section listing the
 * Session's own subagents. The section sees the same Session the lineage renders.
 */
function HeaderCatalog({ store, ...props }: HeaderCatalogProps) {
    return (h(Fragment, {}, [
        h(SubagentHeaderLineage, {
            ...props
        }, undefined),
        h(Section, {
            ...props,
            "sessionId": props.lineageSessionId,
            "store": store
        }, undefined)
    ]));
}
/**
 * The Session panel's Factories as these suites render them: the fold control as a button with its state, name, and
 * label, and a row's details as one element per part in order. ui-session-panel's own suite owns their markup.
 */
function renderPanelFactory(name: string, input: object) {
    if (name === "conversation.session.panel.details") {
        const { title, lines = [], status, facts = [] } = input as PanelDetailsProps;
        return (h("div", {
            "data-session-panel-details": ""
        }, [
            title !== undefined && h("div", {}, [
                title
            ]),
            lines.map(line => h("div", {
                "key": line
            }, [
                line
            ])),
            status !== undefined && h("div", {
                "data-state": status.state
            }, [
                status.label
            ]),
            facts.length > 0 && h("div", {}, [
                facts.map(fact => h("span", {
                    "key": fact.kind,
                    "data-fact": fact.kind
                }, [
                    fact.label
                ]))
            ])
        ]));
    }
    const fold = input as PanelFoldProps;
    return h("button", {
        "type": "button",
        "data-fold": "",
        "aria-expanded": fold.expanded,
        "aria-label": fold.name,
        "onClick": fold.onToggle
    }, [
        fold.label
    ]);
}
/** The section with the panel owner values, its Session's store (a fresh one unless given), and the fold control. */
const Section = defineComponent((input: Omit<HeaderCatalogProps, "lineageSessionId" | "displayTitle">) => {
    const own = input.store ?? createSubagentsSectionStore().create();
    const useStore = bindSnapshotSelector(own);
    return () => {
        const { store: _store, dismissOverlay, ...props } = input;
        const sectionProps = {
            ...props, presentation: "docked", dismissOverlay: dismissOverlay ?? vi.fn(), useStore, actions: own.actions, renderFactorySlot: renderPanelFactory
        } as SubagentsSectionProps;
        return h(SubagentsSection, {
            ...sectionProps
        }, undefined);
    };
}, {
    inheritAttrs: false, props: [
        "store",
        "dismissOverlay",
        "sessionId",
        "useSessions",
        "useSession",
        "useSessionStatus",
        "useResource",
        "useContextMenu",
        "t",
        "openChild",
        "openChildAside",
        "prepareCatalog",
        "useProjection",
        "useConversation",
        "useInput",
        "useChat",
        "useTrajectory",
        "inputActions",
        "usePanelInfo",
        "useSessionRetainInfo",
        "useWorkspaces",
        "useAccess"
    ]
});
describe("SubagentHeaderLineage", () => {
    it("omits section headings from a catalog of members", () => {
        render(h(HeaderCatalog, {
            ...props(catalog())
        }, undefined));
        expect(screen.getByRole("tree")).toBeTruthy();
        expect(screen.queryByRole("heading")).toBeNull();
        expect(document.querySelector("[data-subagent-section-header]")).toBeNull();
    });
    it.each([
        undefined,
        ""
    ])("keeps a single ID line when the creation description is %s", (label) => {
        const input = props(catalog({
            entries: [
                {
                    id: CHILD, mode: "one-shot", ...label === undefined ? {} : {
                        label
                    }, activity: "running"
                }
            ]
        }), {}, {
            [CHILD]: {
                ...summary(CHILD, 1), running: true
            }
        });
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        const row = screen.getByRole("treeitem", {
            name: new RegExp(CHILD)
        });
        expect(within(row).getAllByText(CHILD)).toHaveLength(1);
        expect(row.getAttribute("aria-label")).toMatch(new RegExp(`^${CHILD}`));
    });
    it("shows agent names in place of Session ids while navigation keeps the Session id", async () => {
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        const external = "external-id" as SessionId;
        const input = props(catalog({
            entries: [
                {
                    id: CHILD, mode: "continuable", label: "Review the diff", name: "reviewer", activity: "running"
                },
                {
                    id: GRANDCHILD, mode: "continuable", label: "", name: "checker", activity: "inactive"
                },
                {
                    id: external, mode: "external", name: "outside", activity: "inactive"
                }
            ]
        }), {}, {
            [CHILD]: {
                ...summary(CHILD, 1), running: true
            }
        });
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        const named = screen.getByRole("treeitem", {
            name: /^Review the diff reviewer/
        });
        // The panel row shows one line; its hover card names the agent as the owner.
        expect(within(named).queryByText("reviewer")).toBeNull();
        expect(within(named).queryByText(CHILD)).toBeNull();
        expect(await hoverDetailsOf(named)).toEqual([
            "Review the diff",
            "\u8D1F\u8D23\u4EBA\uFF1Areviewer",
            "\u6B63\u5728\u8FD0\u884C \u00B7 \u53EF\u7EE7\u7EED"
        ]);
        const undescribed = screen.getByRole("treeitem", {
            name: /^checker/
        });
        expect(within(undescribed).getAllByText("checker")).toHaveLength(1);
        expect(within(undescribed).queryByText(GRANDCHILD)).toBeNull();
        expect(screen.getByRole("treeitem", {
            name: /^outside/
        }).getAttribute("aria-disabled")).toBe("true");
        await act(() => fireEvent.click(named));
        expect(input.openChild).toHaveBeenCalledExactlyOnceWith({
            parentSessionId: PARENT, childSessionId: CHILD, mode: "continuable"
        });
    });
    it("leaves Escape from outside focus alone", async () => {
        const input = props(catalog());
        render(h(Fragment, {}, [
            h("textarea", {
                "aria-label": "Composer"
            }, undefined),
            h(HeaderCatalog, {
                ...input
            }, undefined)
        ]));
        const composer = screen.getByRole("textbox");
        composer.focus();
        await act(() => fireEvent.keyDown(composer, {
            key: "Escape"
        }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(composer);
    });
    it("keeps switcher chevrons and suppresses the total-count tooltip for switchers", async () => {
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        enableTooltips();
        const input = props(catalog(), {}, {
            [CHILD]: {
                ...summary(CHILD, 1), parentId: PARENT, origin: "subagent"
            }
        });
        render(h(HeaderCatalog, {
            ...input,
            "sessionId": CHILD,
            "lineageSessionId": CHILD
        }, undefined));
        const trigger = screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1Aworker"
        });
        expect(trigger.querySelector("[data-subagent-count]")).toBeNull();
        expect(trigger.querySelector("svg")).toBeTruthy();
        await act(() => fireEvent.keyDown(document.body, {
            key: "Tab"
        }));
        await act(() => fireEvent.focus(trigger));
        expect(screen.queryByRole("tooltip")).toBeNull();
        await act(() => fireEvent.pointerEnter(trigger));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
        });
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(screen.queryByRole("tooltip")).toBeNull();
    });
    it("removes the disclosure column from branchless catalog levels", () => {
        render(h(HeaderCatalog, {
            ...props(catalog({
                entries: catalog().entries.slice(0, 1)
            }), {
                [CHILD]: catalog({
                    entries: []
                })
            })
        }, undefined));
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        expect(screen.getByRole("treeitem", {
            name: /worker/
        }).children).toHaveLength(1);
    });
    it("aligns a known leaf with siblings whose child catalog contains descendants", () => {
        render(h(HeaderCatalog, {
            ...props(catalog(), {
                [CHILD]: catalog({
                    entries: []
                }),
                ["child-2" as SessionId]: catalog({
                    entries: [
                        {
                            id: GRANDCHILD, mode: "continuable", label: "nested", activity: "inactive"
                        }
                    ]
                })
            })
        }, undefined));
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        expect(screen.getByRole("treeitem", {
            name: /worker/
        }).children).toHaveLength(2);
        expect(screen.getByRole("button", {
            name: /展开 reviewer/
        })).toBeTruthy();
    });
    it("keeps unknown catalog children clickable by their durable parent address", async () => {
        const input = props(catalog({
            entries: [
                {
                    id: CHILD, mode: "unknown", activity: "inactive"
                }
            ]
        }));
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        const row = screen.getByRole("treeitem", {
            name: new RegExp(CHILD)
        });
        expect(row.getAttribute("aria-label")).toContain("\u6A21\u5F0F\u672A\u77E5");
        await act(() => fireEvent.keyDown(row, {
            key: "Enter"
        }));
        expect(input.openChild).toHaveBeenCalledWith({
            parentSessionId: PARENT, childSessionId: CHILD, mode: "unknown"
        });
    });
    it("ticks expanded running grandchildren under an idle child and releases their clock on collapse", async () => {
        const now = 2000000000000;
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        vi.setSystemTime(now);
        const input = props(catalog({
            entries: [
                {
                    id: CHILD, mode: "continuable", label: "worker", activity: "inactive"
                }
            ]
        }), {
            [CHILD]: catalog({
                entries: [
                    {
                        id: GRANDCHILD, mode: "continuable", label: "indexer", activity: "running"
                    }
                ]
            })
        }, {
            [GRANDCHILD]: {
                ...summary(GRANDCHILD, now),
                parentId: CHILD,
                origin: "subagent",
                running: true,
                projectionValues: {
                    subagentTiming: {
                        settledMs: 0, active: {
                            since: now - 5000, through: now
                        }
                    }
                }
            }
        });
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        const beforeExpand = vi.getTimerCount();
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(screen.getByRole("treeitem", {
            name: /indexer.*5秒/
        })).toBeTruthy();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        expect(screen.getByRole("treeitem", {
            name: /indexer.*6秒/
        })).toBeTruthy();
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u6536\u8D77 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(vi.getTimerCount()).toBe(beforeExpand);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(screen.getByRole("treeitem", {
            name: /indexer.*7秒/
        })).toBeTruthy();
    });
    it("lazily expands and collapses descendant catalogs with direct-parent navigation", async () => {
        const childCatalog = catalog({
            entries: [
                {
                    id: GRANDCHILD, mode: "continuable",
                    label: "indexer", activity: "inactive"
                }
            ]
        });
        const grandchildCatalog = catalog({
            entries: []
        });
        const input = props(catalog(), {
            [CHILD]: childCatalog,
            [GRANDCHILD]: grandchildCatalog
        });
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(input.prepareCatalog).toHaveBeenLastCalledWith(CHILD);
        expect(input.refreshProjection).not.toHaveBeenCalled();
        const nested = screen.getByRole("treeitem", {
            name: /indexer/
        });
        expect(nested.getAttribute("aria-level")).toBe("2");
        await act(() => fireEvent.click(nested));
        expect(input.openChild).toHaveBeenCalledWith({
            parentSessionId: CHILD,
            childSessionId: GRANDCHILD, mode: "continuable"
        });
    });
    it("reveals cold descendants only when shared catalog data arrives", async () => {
        const secondGrandchild = "grandchild-2" as SessionId;
        const summaries = {
            [CHILD]: {
                ...summary(CHILD, 1), running: true
            },
            [GRANDCHILD]: {
                ...summary(GRANDCHILD, 1), parentId: CHILD, origin: "subagent" as const
            },
            [secondGrandchild]: {
                ...summary(secondGrandchild, 1), parentId: CHILD, origin: "subagent" as const,
                running: true
            }
        };
        const deferred = props(catalog(), {}, summaries);
        const initial = deferred.useSessions(state => state);
        let state: SessionListState = {
            ...initial, ids: [
                CHILD, GRANDCHILD, secondGrandchild
            ]
        };
        const current = {
            ...deferred, useSessions: <T,>(select: (snapshot: SessionListState) => T): T => select(state)
        };
        const view = render(h(HeaderCatalog, {
            ...current
        }, undefined));
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        expect(screen.queryByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })).toBeNull();
        expect(deferred.refreshProjection).not.toHaveBeenCalled();
        expect(screen.getByRole("treeitem", {
            name: /worker/
        }).getAttribute("aria-busy")).toBeNull();
        expect(screen.queryByText("\u6B63\u5728\u52A0\u8F7D\u5B50\u667A\u80FD\u4F53\u2026")).toBeNull();
        expect(screen.queryByRole("treeitem", {
            name: "\u6B63\u5728\u52A0\u8F7D\u5B50\u667A\u80FD\u4F53"
        })).toBeNull();
        expect(screen.queryByRole("treeitem", {
            name: /grandchild/
        })).toBeNull();
        expect(screen.queryByText(/模式未知/)).toBeNull();
        state = {
            ...state,
            projectionsBySession: {
                ...state.projectionsBySession,
                [CHILD]: {
                    state: "loading", error: null, values: {}
                }
            }
        };
        await view.rerender(h(HeaderCatalog, {
            ...current
        }, undefined));
        expect(screen.queryByText("\u6B63\u5728\u52A0\u8F7D\u5B50\u667A\u80FD\u4F53\u2026")).toBeNull();
        expect(screen.queryByRole("treeitem", {
            name: /grandchild/
        })).toBeNull();
        expect(screen.queryByText(/模式未知/)).toBeNull();
        const ready = props(catalog(), {
            [CHILD]: catalog({
                entries: [
                    {
                        id: GRANDCHILD, mode: "continuable",
                        label: "indexer", activity: "inactive"
                    },
                    {
                        id: secondGrandchild, mode: "one-shot",
                        label: "critic", activity: "running"
                    }
                ]
            })
        }, summaries);
        state = {
            ...state, projectionsBySession: ready.useSessions(value => value.projectionsBySession)
        };
        await view.rerender(h(HeaderCatalog, {
            ...current
        }, undefined));
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(screen.getByRole("group").getAttribute("aria-busy")).toBeNull();
        expect(screen.getByRole("treeitem", {
            name: /indexer/
        }).querySelector("[data-state=\"idle\"]")).not.toBeNull();
        expect(screen.getByRole("treeitem", {
            name: /critic/
        }).querySelector("[data-state=\"ongoing\"]")).not.toBeNull();
        expect(screen.queryByText("\u6B63\u5728\u52A0\u8F7D\u5B50\u667A\u80FD\u4F53\u2026")).toBeNull();
        expect(screen.queryByText(/模式未知/)).toBeNull();
        expect(deferred.refreshProjection).not.toHaveBeenCalled();
        expect(deferred.openChild).not.toHaveBeenCalled();
    });
    it.each([
        "ready",
        "migration-required"
    ] as const)("keeps an explicitly empty %s catalog as a leaf despite listed descendants", (state) => {
        const input = props(catalog(), {
            [CHILD]: catalog({
                entries: [], state
            })
        }, {
            [CHILD]: {
                ...summary(CHILD, 1), running: true
            },
            [GRANDCHILD]: {
                ...summary(GRANDCHILD, 1), parentId: CHILD, origin: "subagent"
            }
        });
        const initial = input.useSessions(state => state);
        render(h(HeaderCatalog, {
            ...input,
            "useSessions": select => select({
                ...initial, ids: [
                    CHILD, GRANDCHILD
                ]
            })
        }, undefined));
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        expect(screen.queryByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })).toBeNull();
        expect(screen.queryByRole("treeitem", {
            name: /grandchild/
        })).toBeNull();
    });
    it("collapses expanded descendants whose catalog is removed before their parent closes", async () => {
        const input = props(catalog(), {
            [CHILD]: catalog({
                entries: [
                    {
                        id: GRANDCHILD, mode: "continuable", label: "indexer", activity: "inactive"
                    }
                ]
            }),
            [GRANDCHILD]: catalog({
                entries: [
                    {
                        id: "great-grandchild" as SessionId, mode: "continuable", label: "deep", activity: "inactive"
                    }
                ]
            })
        });
        let state = input.useSessions(value => value);
        const current = {
            ...input, useSessions: <T,>(select: (value: SessionListState) => T): T => select(state)
        };
        const view = render(h(HeaderCatalog, {
            ...current
        }, undefined));
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 indexer \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        const { [GRANDCHILD]: _projection, ...projectionsBySession } = state.projectionsBySession;
        const { [GRANDCHILD]: _summary, ...byId } = state.byId;
        state = {
            ...state, projectionsBySession, byId
        };
        await view.rerender(h(HeaderCatalog, {
            ...current
        }, undefined));
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u6536\u8D77 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(screen.queryByRole("treeitem", {
            name: /indexer/
        })).toBeNull();
        state = input.useSessions(value => value);
        await view.rerender(h(HeaderCatalog, {
            ...current
        }, undefined));
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(screen.getByRole("treeitem", {
            name: /indexer/
        }).getAttribute("aria-expanded")).toBe("false");
    });
    it("closes a branch whose visible descendants have no catalog of their own", async () => {
        const input = props(catalog(), {
            [CHILD]: catalog({
                entries: [
                    {
                        id: GRANDCHILD, mode: "continuable",
                        label: "indexer", activity: "running"
                    }
                ]
            })
        });
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(screen.queryByRole("button", {
            name: "\u5C55\u5F00 indexer \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })).toBeNull();
        expect(screen.getByRole("treeitem", {
            name: /indexer/
        }).getAttribute("aria-busy")).toBeNull();
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u6536\u8D77 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(screen.queryByRole("treeitem", {
            name: /indexer/
        })).toBeNull();
    });
    it("hides an arrived empty catalog and exposes retry for a failed one", async () => {
        const absent = render(h(HeaderCatalog, {
            ...props(undefined)
        }, undefined));
        expect(screen.queryByRole("button")).toBeNull();
        absent.unmount();
        const empty = props(catalog({
            entries: []
        }));
        const view = render(h(HeaderCatalog, {
            ...empty
        }, undefined));
        expect(screen.queryByRole("button")).toBeNull();
        await view.unmount();
        const failed = props(catalog({
            entries: [],
            state: "error",
            error: new RemoteError("gateway/internal", "index down", {})
        }));
        render(h(HeaderCatalog, {
            ...failed
        }, undefined));
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        expect(screen.getByText("index down")).toBeTruthy();
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: /重试/
        })));
        expect(failed.prepareCatalog).toHaveBeenCalledExactlyOnceWith(PARENT);
        expect(failed.refreshProjection).not.toHaveBeenCalled();
    });
    it.each([
        "absent",
        "idle",
        "loading",
        "ready"
    ] as const)("does not expose header-only descendants when the projection read is %s", (state) => {
        const second = "child-2" as SessionId;
        const summaries = {
            [CHILD]: {
                ...summary(CHILD, 1), parentId: PARENT, origin: "subagent" as const
            },
            [second]: {
                ...summary(second, 1), parentId: PARENT, origin: "subagent" as const, running: true
            }
        };
        const absent = props(undefined, {}, summaries);
        const initial = absent.useSessions(value => value);
        render(h(HeaderCatalog, {
            ...absent,
            "useSessions": select => select({
                ...initial,
                projectionsBySession: state === "absent" ? {} : {
                    [PARENT]: {
                        state, error: null, values: {}
                    }
                }
            })
        }, undefined));
        expect(screen.queryByRole("button")).toBeNull();
        expect(absent.refreshProjection).not.toHaveBeenCalled();
    });
    it("closes every observed catalog when the root becomes empty", async () => {
        const populated = props(catalog(), {
            [CHILD]: catalog({
                entries: [
                    {
                        id: GRANDCHILD, mode: "continuable",
                        label: "indexer", activity: "inactive"
                    }
                ]
            })
        });
        const view = render(h(HeaderCatalog, {
            ...populated
        }, undefined));
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        const empty = props(catalog({
            entries: []
        }));
        await view.rerender(h(HeaderCatalog, {
            ...empty
        }, undefined));
        expect(screen.queryByRole("button")).toBeNull();
    });
    it("prefers the creation description in the breadcrumb while keeping the row ID and navigation actions", async () => {
        const sibling = "child-2" as SessionId;
        const entries = catalog().entries;
        const input = {
            ...props(catalog({
                entries
            }), {}, {
                [CHILD]: {
                    ...summary(CHILD, 1), parentId: PARENT, origin: "subagent" as const
                },
                [sibling]: {
                    ...summary(sibling, 1), parentId: PARENT, origin: "subagent" as const
                }
            }),
            sessionId: CHILD,
            lineageSessionId: CHILD,
            displayTitle: "worker"
        };
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        const switcher = screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1Aworker"
        });
        expect(switcher.className).toContain("switcherTrigger");
        expect(within(switcher).getByText("worker")).toBeTruthy();
        expect(switcher.querySelector("svg")).not.toBeNull();
        const switcherIcon = switcher.querySelector("svg");
        expect(switcherIcon?.getAttribute("width")).toBe("16");
        expect(switcherIcon?.getAttribute("height")).toBe("16");
        await hoverCatalog(switcher);
        expect(input.refreshProjection).not.toHaveBeenCalled();
        const current = screen.getByRole("treeitem", {
            name: /^worker child /
        });
        expect(current.getAttribute("aria-current")).toBe("true");
        expect(within(current).getByText("worker").className).toContain("currentLabel");
        expect(within(current).queryByRole("button", {
            name: "\u5728\u4FA7\u8FB9\u680F\u6253\u5F00 worker"
        })).toBeNull();
        const selectedMark = current.querySelector("[data-subagent-current]");
        expect(selectedMark?.getAttribute("aria-hidden")).toBe("true");
        expect(selectedMark?.querySelector("[data-icon=\"dsw-icon-check-outline-regular\"]")).toBeTruthy();
        const other = screen.getByRole("treeitem", {
            name: /reviewer/
        });
        expect(other.querySelector("[data-subagent-current]")).toBeNull();
        expect(within(other).getByRole("button", {
            name: "\u5728\u4FA7\u8FB9\u680F\u6253\u5F00 reviewer"
        })).toBeTruthy();
        await act(() => fireEvent.click(other));
        expect(input.openChild).toHaveBeenCalledWith({
            parentSessionId: PARENT,
            childSessionId: sibling, mode: "one-shot"
        });
    });
    it("keeps header-derived breadcrumb identity without inventing catalog rows", async () => {
        const input = {
            ...props(undefined, {}, {
                [CHILD]: {
                    ...summary(CHILD, 1), parentId: PARENT, origin: "subagent" as const
                }
            }),
            lineageSessionId: CHILD,
            displayTitle: "worker"
        };
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        const switcher = screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1Aworker"
        });
        await hoverCatalog(switcher);
        expect(input.prepareCatalog).not.toHaveBeenCalled();
        expect(screen.getByText("\u5C1A\u672A\u52A0\u8F7D\u5B50\u667A\u80FD\u4F53")).toBeTruthy();
        expect(screen.queryByText("\u6B63\u5728\u52A0\u8F7D\u5B50\u667A\u80FD\u4F53\u2026")).toBeNull();
        expect(screen.queryAllByRole("treeitem")).toEqual([]);
        expect(input.refreshProjection).not.toHaveBeenCalled();
    });
    it.each([
        undefined,
        ""
    ])("uses the Session id in the breadcrumb when the creation description is %s", async (label) => {
        const input = props(catalog({
            entries: [
                {
                    id: CHILD, mode: "one-shot", activity: "inactive", ...label === undefined ? {} : {
                        label
                    }
                }
            ]
        }), {}, {
            [CHILD]: {
                ...summary(CHILD, 1), parentId: PARENT, origin: "subagent"
            }
        });
        render(h(HeaderCatalog, {
            ...input,
            "sessionId": CHILD,
            "lineageSessionId": CHILD
        }, undefined));
        const switcher = screen.getByRole("button", {
            name: `切换子智能体：${CHILD}`
        });
        await act(() => fireEvent.click(switcher));
        expect(screen.getByRole("treeitem", {
            name: new RegExp(CHILD)
        })).toBeTruthy();
        expect(screen.queryByRole("heading")).toBeNull();
    });
    it("falls back to the catalog session id when the selected row has no label", () => {
        const input = {
            ...props(catalog({
                entries: [
                    {
                        id: CHILD, mode: "one-shot",
                        activity: "inactive"
                    }
                ]
            }), {}, {
                [CHILD]: {
                    ...summary(CHILD, 1), parentId: PARENT, origin: "subagent" as const
                }
            }),
            sessionId: CHILD,
            lineageSessionId: CHILD,
            displayTitle: "summary title"
        };
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        expect(screen.getByRole("button", {
            name: `切换子智能体：${CHILD}`
        })).toBeTruthy();
    });
    it("names the breadcrumb by the agent name when the selected row has an empty description", () => {
        const input = {
            ...props(catalog({
                entries: [
                    {
                        id: CHILD, mode: "continuable", label: "", name: "reviewer", activity: "inactive"
                    }
                ]
            }), {}, {
                [CHILD]: {
                    ...summary(CHILD, 1), parentId: PARENT, origin: "subagent" as const
                }
            }),
            sessionId: CHILD,
            lineageSessionId: CHILD,
            displayTitle: "summary title"
        };
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        expect(screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1Areviewer"
        }).textContent).toBe("reviewer");
    });
    it.each([
        [
            "ancestor",
            vi.fn()
        ],
        [
            "current",
            undefined
        ]
    ] as const)("keeps the %s title switcher while catalog and list metadata are absent", async (_kind, openTitle) => {
        const input = {
            ...props(undefined, {}, {}, {
                parentSessionId: PARENT, childSessionId: CHILD, mode: "continuable"
            }),
            lineageSessionId: CHILD,
            displayTitle: "\u6B63\u5728\u626B\u63CF\u9879\u76EE\u6587\u4EF6",
            ...(openTitle === undefined ? {} : {
                openTitle
            })
        };
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        const switcher = screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1A\u6B63\u5728\u626B\u63CF\u9879\u76EE\u6587\u4EF6"
        });
        expect(input.refreshProjection).not.toHaveBeenCalled();
        await hoverCatalog(switcher);
        expect(input.prepareCatalog).not.toHaveBeenCalled();
        expect(screen.getByText("\u5C1A\u672A\u52A0\u8F7D\u5B50\u667A\u80FD\u4F53")).toBeTruthy();
        expect(screen.queryByText("\u6B63\u5728\u52A0\u8F7D\u5B50\u667A\u80FD\u4F53\u2026")).toBeNull();
        expect(screen.queryAllByRole("treeitem")).toEqual([]);
        expect(input.refreshProjection).not.toHaveBeenCalled();
    });
    it.each([
        "idle",
        "loading"
    ] as const)("shows the actual %s state of an empty title menu", async (state) => {
        const input = {
            ...props(undefined, {}, {}, {
                parentSessionId: PARENT, childSessionId: CHILD, mode: "continuable"
            }),
            lineageSessionId: CHILD,
            displayTitle: "worker"
        };
        const initial = input.useSessions(value => value);
        render(h(HeaderCatalog, {
            ...input,
            "useSessions": select => select({
                ...initial,
                projectionsBySession: {
                    [PARENT]: {
                        state, error: null, values: {}
                    }
                }
            })
        }, undefined));
        await hoverCatalog(screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1Aworker"
        }));
        expect(screen.getByText(state === "idle" ? zh["load.idle"] : zh["loading.label"])).toBeTruthy();
        expect(screen.queryByText(state === "idle" ? zh["loading.label"] : zh["load.idle"])).toBeNull();
        expect(input.prepareCatalog).not.toHaveBeenCalled();
    });
    it("keeps a nested title switcher scoped to its direct-parent catalog", async () => {
        const input = {
            ...props(catalog(), {
                [CHILD]: catalog({
                    entries: [
                        {
                            id: GRANDCHILD, mode: "continuable",
                            label: "indexer", activity: "inactive"
                        }
                    ]
                })
            }, {
                [CHILD]: {
                    ...summary(CHILD, 1), parentId: PARENT, origin: "subagent" as const
                },
                [GRANDCHILD]: {
                    ...summary(GRANDCHILD, 1), parentId: CHILD, origin: "subagent" as const
                }
            }),
            sessionId: GRANDCHILD,
            lineageSessionId: GRANDCHILD,
            displayTitle: "indexer"
        };
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        await hoverCatalog(screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1Aindexer"
        }));
        expect(input.refreshProjection).not.toHaveBeenCalled();
        const current = screen.getByRole("treeitem", {
            name: /indexer/
        });
        expect(current.getAttribute("aria-current")).toBe("true");
        expect(within(current).getByText("indexer").className).toContain("currentLabel");
        expect(screen.queryByRole("treeitem", {
            name: /reviewer/
        })).toBeNull();
    });
});
describe("SubagentsSection", () => {
    it("shows the description on one line, the Session id in its hover card, and opens the row without a description toggle", async () => {
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        const description = "Check the construction and all bounds. ".repeat(20).trim();
        const input = props(catalog({
            entries: [
                {
                    id: CHILD, mode: "continuable", label: description, activity: "running"
                }
            ]
        }));
        const dismissOverlay = vi.fn();
        render(h(HeaderCatalog, {
            ...input,
            "dismissOverlay": dismissOverlay
        }, undefined));
        const row = screen.getByRole("treeitem", {
            name: new RegExp(CHILD)
        });
        const primary = within(row).getByText(description);
        expect(within(row).queryByText(CHILD)).toBeNull();
        expect((await hoverDetailsOf(row))?.slice(0, 2)).toEqual([
            description, `负责人：${CHILD}`
        ]);
        expect(row.getAttribute("aria-label")).toMatch(/^Check the construction/);
        expect(primary.tagName).toBe("SPAN");
        expect(primary.getAttribute("aria-expanded")).toBeNull();
        expect(primary.querySelector("svg")).toBeNull();
        expect(within(row).queryByRole("button", {
            name: /描述/
        })).toBeNull();
        await act(() => fireEvent.click(primary));
        expect(input.openChild).toHaveBeenCalledExactlyOnceWith({
            parentSessionId: PARENT, childSessionId: CHILD, mode: "continuable"
        });
        // Opening a subagent closes the panel overlay; the section keeps its tree.
        expect(dismissOverlay).toHaveBeenCalledOnce();
        expect(screen.getByRole("treeitem")).toBeTruthy();
    });
    it("shows current catalog-only child status before Host list discovery", () => {
        const input = props(catalog({
            entries: [
                {
                    id: CHILD, mode: "continuable", label: "worker", activity: "inactive"
                }
            ]
        }));
        const initial = input.useSessions(state => state);
        const statuses: SessionStatusSnapshot = new Map([
            [
                CHILD,
                {
                    running: true, completionUnread: false, completionFailed: false, pendingInteraction: undefined
                }
            ]
        ]);
        render(h(HeaderCatalog, {
            ...input,
            "useSessions": select => select({
                ...initial, ids: []
            }),
            "useSessionStatus": select => select(statuses)
        }, undefined));
        expect(screen.getByRole("treeitem", {
            name: /worker.*正在运行/
        })).toBeTruthy();
    });
    it("shows retained children while an idle projection awaits refresh", async () => {
        const injected = props(catalog());
        const initial = injected.useSessions(state => state);
        let projections: SessionListState["projectionsBySession"] = {
            [PARENT]: {
                state: "idle", error: null, values: {}
            }
        };
        const current: HeaderCatalogProps = {
            ...injected,
            useSessions: select => select({
                ...initial, projectionsBySession: projections
            })
        };
        const view = render(h(HeaderCatalog, {
            ...current
        }, undefined));
        expect(screen.queryByRole("tree")).toBeNull();
        projections = {
            [PARENT]: {
                ...initial.projectionsBySession[PARENT]!, state: "idle"
            }
        };
        await view.rerender(h(HeaderCatalog, {
            ...current
        }, undefined));
        expect(screen.getByRole("treeitem", {
            name: /worker/
        })).toBeTruthy();
        expect(screen.getByRole("treeitem", {
            name: /reviewer/
        })).toBeTruthy();
    });
    it("renders stable rows and catalog-addressed navigation", async () => {
        const input = props(catalog());
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        expect(input.refreshProjection).not.toHaveBeenCalled();
        expect(screen.getAllByRole("treeitem")).toHaveLength(2);
        expect(screen.getByText("worker")).toBeTruthy();
        expect(screen.queryByText("\u6B63\u5728\u626B\u63CF\u9879\u76EE\u6587\u4EF6")).toBeNull();
        expect(screen.getByRole("treeitem", {
            name: /reviewer child-2 · 一次性 · 当前未运行/
        })).toBeTruthy();
        expect(screen.queryByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })).toBeNull();
        expect(screen.queryByRole("button", {
            name: "\u5C55\u5F00 reviewer \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })).toBeNull();
        const sidebarButton = within(screen.getByRole("treeitem", {
            name: /worker/
        }))
            .getByRole("button", {
            name: "\u5728\u4FA7\u8FB9\u680F\u6253\u5F00 worker"
        });
        await act(() => fireEvent.keyDown(sidebarButton, {
            key: "Enter"
        }));
        await act(() => fireEvent.click(sidebarButton));
        expect(input.openChildAside).toHaveBeenCalledWith({
            parentSessionId: PARENT, childSessionId: CHILD, mode: "continuable"
        });
        await act(() => fireEvent.click(screen.getByRole("treeitem", {
            name: /worker/
        })));
        expect(input.openChild).toHaveBeenCalledWith({
            parentSessionId: PARENT,
            childSessionId: CHILD, mode: "continuable"
        });
    });
    it("covers fallback labels and keyboard row activation", async () => {
        const unlabeled = "unlabeled" as SessionId;
        const input = props(catalog({
            entries: [
                {
                    id: CHILD, mode: "continuable", label: "worker",
                    activity: "running"
                },
                {
                    id: unlabeled, mode: "one-shot",
                    activity: "inactive"
                }
            ]
        }));
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        await act(() => fireEvent.keyDown(screen.getByRole("treeitem", {
            name: /worker/
        }), {
            key: "Enter"
        }));
        expect(input.openChild).toHaveBeenLastCalledWith({
            parentSessionId: PARENT,
            childSessionId: CHILD, mode: "continuable"
        });
        await act(() => fireEvent.keyDown(screen.getByRole("treeitem", {
            name: /unlabeled/
        }), {
            key: " "
        }));
        expect(input.openChild).toHaveBeenLastCalledWith({
            parentSessionId: PARENT,
            childSessionId: unlabeled, mode: "one-shot"
        });
    });
    it("shows durable completion and token totals, ticks active duration, and freezes inactive rows", async () => {
        const now = 2000000000000;
        const minute = 60000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        vi.setSystemTime(now);
        const rows = [
            [
                "running",
                "running",
                65000, now - 5000, now - 1000, now
            ],
            [
                "finished",
                "inactive",
                3723000, undefined, undefined, now - 60000
            ],
            [
                "interrupted",
                "inactive",
                2000, now - 7000, now - 3000, now + 60000
            ],
            [
                "days",
                "inactive",
                12 * day + 5 * hour + 6 * minute + 7000, undefined, undefined, now
            ],
            [
                "whole-day",
                "inactive",
                day, undefined, undefined, now
            ],
            [
                "months",
                "inactive",
                192 * day, undefined, undefined, now
            ],
            [
                "whole-month",
                "inactive",
                30 * day, undefined, undefined, now
            ],
            [
                "years",
                "inactive",
                832 * day, undefined, undefined, now
            ],
            [
                "whole-year",
                "inactive",
                365 * day, undefined, undefined, now
            ]
        ] as const;
        const usageById = {
            running: {
                uncachedInputTokens: 1000,
                outputTokens: 200,
                cacheReadTokens: 3000,
                cacheWriteTokens: 400
            },
            finished: {
                uncachedInputTokens: 123,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0
            },
            interrupted: {
                uncachedInputTokens: 123000000,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0
            }
        } as const;
        const entries = rows.map(([id, activity]) => ({
            id: id as SessionId,
            mode: "continuable" as const,
            label: id,
            activity
        }));
        const summaries = Object.fromEntries(rows.map(([id, activity, settledMs, activeSince, activeThrough, updatedAt,]) => {
            const childId = id as SessionId;
            return [
                id,
                {
                    ...summary(childId, updatedAt),
                    parentId: PARENT,
                    origin: "subagent" as const,
                    running: activity === "running",
                    projectionValues: {
                        subagentTiming: {
                            settledMs,
                            ...(id === "finished"
                                ? {
                                    lastTurnCompleted: true
                                } : id === "interrupted"
                                ? {
                                    lastTurnCompleted: false
                                } : {}),
                            ...(activeSince === undefined || activeThrough === undefined
                                ? {} : {
                                active: {
                                    since: activeSince, through: activeThrough
                                }
                            })
                        },
                        tokenUsage: id in usageById
                            ? usageById[id as keyof typeof usageById]
                            : undefined
                    }
                }
            ];
        })) as Record<SessionId, SessionSummary>;
        const input = props(catalog({
            entries
        }), {}, summaries);
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        // Nine rows fold to five; this case reads every row's measures.
        await act(() => fireEvent.click(document.querySelector("[data-fold]") as HTMLElement));
        const runningRow = screen.getByRole("treeitem", {
            name: /running.*4\.6K tok · 1分10秒/
        });
        // The row keeps only the compact duration; the tokens and exact duration show in its hover card.
        expect(within(runningRow).queryByText("4.6K tok")).toBeNull();
        expect(within(runningRow).getByText("1\u520610\u79D2")).toBeTruthy();
        const finishedRow = screen.getByRole("treeitem", {
            name: /finished.*已完成.*123 tok · 1小时02分03秒/
        });
        expect(finishedRow.querySelector("[data-state=\"done\"]")).not.toBeNull();
        const interruptedRow = screen.getByRole("treeitem", {
            name: /interrupted.*当前未运行.*123M tok · 6秒/
        });
        expect(interruptedRow.querySelector("[data-state=\"idle\"]")).not.toBeNull();
        for (const row of [
            runningRow, finishedRow, interruptedRow
        ]) {
            expect(row.querySelector("[data-state]")?.parentElement?.className).toContain("rowActivitySlot");
        }
        expect(screen.getByRole("treeitem", {
            name: /days.*12天05小时06分07秒/
        })).toBeTruthy();
        // The exact duration reaches the row's accessible name; the compact cell carries no native title.
        expect(screen.getByText("12\u59295\u5C0F\u65F6").hasAttribute("title")).toBe(false);
        expect(screen.getByText("1\u5929")).toBeTruthy();
        expect(screen.getByText("\u7EA66\u4E2A\u670812\u5929")).toBeTruthy();
        expect(screen.getByText("\u7EA61\u4E2A\u6708")).toBeTruthy();
        expect(screen.getByText("\u7EA62\u5E743\u4E2A\u6708")).toBeTruthy();
        expect(screen.getByText("\u7EA61\u5E74")).toBeTruthy();
        await vi.advanceTimersByTimeAsync(1000);
        expect(screen.getByRole("treeitem", {
            name: /running.*4\.6K tok · 1分11秒/
        })).toBeTruthy();
        expect(screen.getByRole("treeitem", {
            name: /finished.*已完成.*123 tok · 1小时02分03秒/
        })).toBeTruthy();
        expect(screen.getByRole("treeitem", {
            name: /interrupted.*当前未运行.*123M tok · 6秒/
        })).toBeTruthy();
        // Hovering lets the clock run, so the running row's card is read last.
        expect(await hoverDetailsOf(finishedRow)).toEqual([
            "finished",
            "\u8D1F\u8D23\u4EBA\uFF1Afinished",
            "\u5DF2\u5B8C\u6210 \u00B7 \u53EF\u7EE7\u7EED",
            "123 tok1\u5C0F\u65F602\u520603\u79D2"
        ]);
        const live = await hoverDetailsOf(screen.getByRole("treeitem", {
            name: /^running/
        }));
        expect(live?.slice(0, 3)).toEqual([
            "running",
            "\u8D1F\u8D23\u4EBA\uFF1Arunning",
            "\u6B63\u5728\u8FD0\u884C \u00B7 \u53EF\u7EE7\u7EED"
        ]);
        expect(live?.[3]).toMatch(/^4\.6K tok1分1\d秒$/);
    });
    it.each([
        false, true
    ])("keeps legacy rows navigable without a migration notice, with cached descendants=%s", async (cached) => {
        const input = props(catalog(), cached ? {
            [CHILD]: catalog({
                entries: [
                    {
                        id: GRANDCHILD, mode: "continuable", label: "indexer", activity: "inactive"
                    }
                ]
            })
        } : {}, {
            [CHILD]: {
                ...summary(CHILD, 1), formatStatus: "migration-required", running: true
            }
        });
        let state = input.useSessions(value => value);
        const current = {
            ...input, useSessions: <T,>(select: (value: SessionListState) => T): T => select(state)
        };
        const view = render(h(HeaderCatalog, {
            ...current
        }, undefined));
        const child = screen.getByRole("treeitem", {
            name: /worker/
        });
        expect(within(child).queryByText(/需要迁移/)).toBeNull();
        expect(child.getAttribute("aria-label")).not.toContain("\u9700\u8981\u8FC1\u79FB");
        expect(within(child).queryByRole("button", {
            name: /下级子智能体/
        })).toBeNull();
        await act(() => fireEvent.keyDown(child, {
            key: "ArrowRight"
        }));
        expect(input.refreshProjection).not.toHaveBeenCalled();
        await act(() => fireEvent.click(child));
        expect(input.openChild).toHaveBeenCalledExactlyOnceWith({
            parentSessionId: PARENT, childSessionId: CHILD, mode: "continuable"
        });
        state = {
            ...state, byId: {
                ...state.byId, [CHILD]: {
                    ...state.byId[CHILD]!, formatStatus: "current"
                }
            }
        };
        await view.rerender(h(HeaderCatalog, {
            ...current
        }, undefined));
        expect(screen.queryByText(/需要迁移/)).toBeNull();
        if (cached) {
            await act(() => fireEvent.click(screen.getByRole("button", {
                name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
            })));
            expect(input.prepareCatalog).toHaveBeenLastCalledWith(CHILD);
        }
        else {
            expect(screen.queryByRole("button", {
                name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
            })).toBeNull();
        }
        expect(input.refreshProjection).not.toHaveBeenCalled();
    });
    it.each([
        "ready",
        "migration-required"
    ] as const)("stops at a migration-required child until its real catalog arrives with %s read state", async (readState) => {
        const fork = "ordinary-fork" as SessionId;
        const summaries = {
            [CHILD]: {
                ...summary(CHILD, 1), running: true, parentId: PARENT, origin: "subagent" as const
            },
            [GRANDCHILD]: {
                ...summary(GRANDCHILD, 1), parentId: CHILD, origin: "subagent" as const
            },
            [fork]: {
                ...summary(fork, 1), parentId: CHILD
            }
        };
        const input = props(catalog(), {}, summaries);
        const initial = input.useSessions(state => state);
        let state: SessionListState = {
            ...initial,
            ids: [
                CHILD, GRANDCHILD, fork
            ],
            projectionsBySession: {
                ...initial.projectionsBySession,
                [CHILD]: {
                    state: "loading", error: null, values: {}
                }
            }
        };
        const current = {
            ...input, useSessions: <T,>(select: (snapshot: SessionListState) => T): T => select(state)
        };
        const view = render(h(HeaderCatalog, {
            ...current
        }, undefined));
        expect(screen.queryByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })).toBeNull();
        expect(screen.queryByRole("treeitem", {
            name: /grandchild/
        })).toBeNull();
        state = {
            ...state,
            projectionsBySession: {
                ...state.projectionsBySession,
                [CHILD]: {
                    state: "migration-required", error: null, values: {}
                }
            }
        };
        await view.rerender(h(HeaderCatalog, {
            ...current
        }, undefined));
        expect(screen.queryByRole("treeitem", {
            name: /grandchild/
        })).toBeNull();
        expect(screen.queryByRole("treeitem", {
            name: /ordinary-fork/
        })).toBeNull();
        const child = screen.getByRole("treeitem", {
            name: /worker/
        });
        expect(within(child).queryByText(/需要迁移/)).toBeNull();
        expect(child.getAttribute("aria-label")).not.toContain("\u9700\u8981\u8FC1\u79FB");
        expect(within(child).queryByText(/模式未知/)).toBeNull();
        expect(child.hasAttribute("aria-expanded")).toBe(false);
        expect(within(child).queryByRole("button", {
            name: /下级子智能体/
        })).toBeNull();
        expect(screen.queryByRole("group")).toBeNull();
        expect(screen.queryByText("\u6B63\u5728\u52A0\u8F7D\u5B50\u667A\u80FD\u4F53\u2026")).toBeNull();
        await act(() => fireEvent.keyDown(child, {
            key: "ArrowRight"
        }));
        expect(input.refreshProjection).not.toHaveBeenCalled();
        expect(input.openChild).not.toHaveBeenCalled();
        await act(() => fireEvent.click(child));
        expect(input.openChild).toHaveBeenCalledExactlyOnceWith({
            parentSessionId: PARENT, childSessionId: CHILD, mode: "continuable"
        });
        expect(input.openChildAside).not.toHaveBeenCalled();
        const projected = props(catalog(), {
            [CHILD]: catalog({
                state: readState,
                entries: [
                    {
                        id: GRANDCHILD, mode: "continuable", label: "indexer", activity: "inactive"
                    }
                ]
            })
        }, summaries);
        state = {
            ...state, projectionsBySession: projected.useSessions(value => value.projectionsBySession)
        };
        await view.rerender(h(HeaderCatalog, {
            ...current
        }, undefined));
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(screen.queryByText(/需要迁移/)).toBeNull();
        expect(screen.queryByText(/模式未知/)).toBeNull();
        expect(screen.getByRole("treeitem", {
            name: /indexer grandchild/
        })).toBeTruthy();
        await act(() => fireEvent.click(screen.getByRole("treeitem", {
            name: /indexer/
        })));
        expect(input.openChild).toHaveBeenLastCalledWith({
            parentSessionId: CHILD, childSessionId: GRANDCHILD, mode: "continuable"
        });
        expect(input.openChild).toHaveBeenCalledTimes(2);
    });
    it.each([
        "pending",
        "ready"
    ] as const)("opens a migration-required child through keyboard and aside while the Session list is %s", async (phase) => {
        const input = props(catalog(), {}, {
            [CHILD]: {
                ...summary(CHILD, 1), running: true, parentId: PARENT, origin: "subagent"
            },
            [GRANDCHILD]: {
                ...summary(GRANDCHILD, 1), parentId: CHILD, origin: "subagent"
            }
        });
        const initial = input.useSessions(state => state);
        const state: SessionListState = {
            ...initial,
            ids: [
                CHILD, GRANDCHILD
            ],
            phase,
            projectionsBySession: {
                ...initial.projectionsBySession,
                [CHILD]: {
                    state: "migration-required", error: null, values: {}
                }
            }
        };
        const current = {
            ...input, useSessions: <T,>(select: (snapshot: SessionListState) => T): T => select(state)
        };
        render(h(HeaderCatalog, {
            ...current
        }, undefined));
        const child = screen.getByRole("treeitem", {
            name: /worker/
        });
        await act(() => fireEvent.keyDown(child, {
            key: "ArrowRight"
        }));
        await act(() => fireEvent.keyDown(child, {
            key: "ArrowRight"
        }));
        expect(input.refreshProjection).not.toHaveBeenCalled();
        expect(within(child).queryByText(/需要迁移/)).toBeNull();
        expect(child.getAttribute("aria-label")).not.toContain("\u9700\u8981\u8FC1\u79FB");
        expect(within(child).queryByText(/模式未知/)).toBeNull();
        expect(child.hasAttribute("aria-expanded")).toBe(false);
        expect(within(child).queryByRole("button", {
            name: /下级子智能体/
        })).toBeNull();
        expect(screen.queryByRole("treeitem", {
            name: /grandchild/
        })).toBeNull();
        expect(screen.queryByText("\u6B63\u5728\u52A0\u8F7D\u5B50\u667A\u80FD\u4F53\u2026")).toBeNull();
        expect(screen.queryByRole("group")).toBeNull();
        expect(input.openChild).not.toHaveBeenCalled();
        await act(() => fireEvent.keyDown(child, {
            key: "Enter"
        }));
        expect(input.openChild).toHaveBeenCalledExactlyOnceWith({
            parentSessionId: PARENT, childSessionId: CHILD, mode: "continuable"
        });
        expect(input.openChildAside).not.toHaveBeenCalled();
        const aside = within(screen.getByRole("treeitem", {
            name: /worker/
        }))
            .getByRole("button", {
            name: "\u5728\u4FA7\u8FB9\u680F\u6253\u5F00 worker"
        });
        await act(() => fireEvent.keyDown(aside, {
            key: "Enter"
        }));
        await act(() => fireEvent.click(aside));
        expect(input.openChildAside).toHaveBeenCalledExactlyOnceWith({
            parentSessionId: PARENT, childSessionId: CHILD, mode: "continuable"
        });
        expect(input.openChild).toHaveBeenCalledOnce();
        expect(input.refreshProjection).not.toHaveBeenCalled();
    });
    it("uses ArrowRight and ArrowLeft for branch disclosure", async () => {
        const input = props(catalog(), {
            [CHILD]: catalog({
                entries: [
                    {
                        id: GRANDCHILD, mode: "continuable",
                        label: "indexer", activity: "running"
                    }
                ]
            })
        });
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        await Promise.resolve();
        const worker = screen.getByRole("treeitem", {
            name: /worker/
        });
        await act(() => fireEvent.keyDown(worker, {
            key: "ArrowRight"
        }));
        expect(screen.getByRole("treeitem", {
            name: /indexer/
        })).toBeTruthy();
        await act(() => fireEvent.keyDown(worker, {
            key: "ArrowLeft"
        }));
        expect(screen.queryByRole("treeitem", {
            name: /indexer/
        })).toBeNull();
    });
    it("hides a bare loading catalog and keeps the error fallback without focusable rows", async () => {
        // A loading snapshot without evidence of children must not flash the action in.
        const loading = props(catalog({
            entries: [], state: "loading"
        }));
        const view = render(h(HeaderCatalog, {
            ...loading
        }, undefined));
        expect(screen.queryByRole("tree")).toBeNull();
        expect(document.querySelector("[data-subagents-section]")).toBeNull();
        await view.unmount();
        const failed = props(catalog({
            entries: [], state: "error", error: null
        }));
        render(h(HeaderCatalog, {
            ...failed
        }, undefined));
        expect(screen.getByText("\u65E0\u6CD5\u52A0\u8F7D\u5B50\u667A\u80FD\u4F53")).toBeTruthy();
        await Promise.resolve();
        expect(screen.getByRole("tree")).toBeTruthy();
        await act(() => fireEvent.keyDown(screen.getByRole("tree"), {
            key: "ArrowUp"
        }));
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: /重试/
        })));
        expect(failed.prepareCatalog).toHaveBeenCalledWith(PARENT);
        expect(failed.refreshProjection).not.toHaveBeenCalled();
    });
    it("reads nothing when the section shows and prepares only the branch the reader expands", async () => {
        const input = props(catalog(), {
            [CHILD]: catalog({
                entries: [
                    {
                        id: GRANDCHILD, mode: "continuable", label: "indexer", activity: "inactive"
                    }
                ]
            })
        });
        let state = input.useSessions(value => value);
        const current = {
            ...input, useSessions: <T,>(select: (value: SessionListState) => T): T => select(state)
        };
        const view = render(h(HeaderCatalog, {
            ...current
        }, undefined));
        const added = props(catalog({
            entries: [
                ...catalog().entries,
                {
                    id: "child-3" as SessionId, mode: "one-shot", label: "critic", activity: "running"
                }
            ]
        }));
        const addedParent = added.useSessions(value => value.projectionsBySession[PARENT])!;
        state = {
            ...state, projectionsBySession: {
                ...state.projectionsBySession, [PARENT]: addedParent
            }
        };
        await view.rerender(h(HeaderCatalog, {
            ...current
        }, undefined));
        expect(screen.getByRole("treeitem", {
            name: /critic/
        })).toBeTruthy();
        expect(input.prepareCatalog).not.toHaveBeenCalled();
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(input.prepareCatalog.mock.calls).toEqual([
            [
                CHILD
            ]
        ]);
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u6536\u8D77 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(input.prepareCatalog).toHaveBeenCalledOnce();
        expect(input.refreshProjection).not.toHaveBeenCalled();
    });
    it.each([
        {
            running: true, completed: false, dot: "ongoing"
        },
        {
            running: false, completed: true, dot: "done"
        },
        {
            running: false, completed: false, dot: "idle"
        }
    ])("preserves the $dot activity marker while an unknown directory loads", async ({ running, completed, dot }) => {
        const input = props(catalog({
            entries: [
                {
                    id: CHILD, mode: "continuable", label: "worker", activity: running ? "running" : "inactive"
                }
            ]
        }), {}, {
            [CHILD]: {
                ...summary(CHILD, 1), running,
                projectionValues: {
                    subagentTiming: {
                        settledMs: 0, lastTurnCompleted: completed
                    }
                }
            }
        });
        let state = input.useSessions(value => value);
        const current = {
            ...input, useSessions: <T,>(select: (value: SessionListState) => T): T => select(state)
        };
        const view = render(h(HeaderCatalog, {
            ...current
        }, undefined));
        const row = screen.getByRole("treeitem", {
            name: /worker/
        });
        const marker = row.querySelector(`[data-state="${dot}"]`);
        expect(marker).not.toBeNull();
        expect(row.children).toHaveLength(1);
        state = {
            ...state, projectionsBySession: {
                ...state.projectionsBySession, [CHILD]: {
                    state: "loading", error: null, values: {}
                }
            }
        };
        await view.rerender(h(HeaderCatalog, {
            ...current
        }, undefined));
        expect(screen.getByRole("treeitem", {
            name: /worker/
        })).toBe(row);
        expect(row.querySelector(`[data-state="${dot}"]`)).toBe(marker);
        expect(screen.queryByText("\u6B63\u5728\u52A0\u8F7D\u5B50\u667A\u80FD\u4F53\u2026")).toBeNull();
        expect(row.hasAttribute("aria-busy")).toBe(false);
        expect(row.hasAttribute("aria-expanded")).toBe(false);
        expect(within(row).getByRole("button", {
            name: "\u5728\u4FA7\u8FB9\u680F\u6253\u5F00 worker"
        }).hasAttribute("disabled")).toBe(false);
        expect(input.refreshProjection).not.toHaveBeenCalled();
    });
    it("retries a collapsed child whose catalog failed to load", async () => {
        const input = props(catalog(), {}, {
            [CHILD]: summary(CHILD, 1)
        });
        let state = input.useSessions(value => value);
        const current = {
            ...input, useSessions: <T,>(select: (value: SessionListState) => T): T => select(state)
        };
        const view = render(h(HeaderCatalog, {
            ...current
        }, undefined));
        expect(screen.queryByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })).toBeNull();
        state = {
            ...state, projectionsBySession: {
                ...state.projectionsBySession,
                [CHILD]: {
                    state: "error", values: {}, error: new RemoteError("gateway/internal", "private diagnostic", {})
                }
            }
        };
        await view.rerender(h(HeaderCatalog, {
            ...current
        }, undefined));
        expect(screen.getByRole("alert").textContent).toContain("\u65E0\u6CD5\u52A0\u8F7D\u5B50\u667A\u80FD\u4F53");
        expect(screen.queryByText("private diagnostic")).toBeNull();
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u91CD\u8BD5"
        })));
        expect(input.prepareCatalog.mock.calls.at(-1)).toEqual([
            CHILD
        ]);
        expect(input.refreshProjection).not.toHaveBeenCalled();
        expect(input.openChild).not.toHaveBeenCalled();
        state = {
            ...state, projectionsBySession: {
                ...state.projectionsBySession, [CHILD]: {
                    state: "ready", values: {
                        subagentCatalog: []
                    }, error: null
                }
            }
        };
        await view.rerender(h(HeaderCatalog, {
            ...current
        }, undefined));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.queryByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })).toBeNull();
    });
    it("updates disclosure when a visible leaf gains children", async () => {
        const input = props(catalog());
        let state = input.useSessions(value => value);
        const current = {
            ...input, useSessions: <T,>(select: (value: SessionListState) => T): T => select(state)
        };
        const view = render(h(HeaderCatalog, {
            ...current
        }, undefined));
        const worker = screen.getByRole("treeitem", {
            name: /worker/
        });
        expect(worker.hasAttribute("aria-expanded")).toBe(false);
        state = {
            ...state, projectionsBySession: {
                ...state.projectionsBySession, [CHILD]: {
                    state: "idle", error: null, values: {
                        subagentCatalog: [
                            {
                                id: GRANDCHILD, createdAt: 1, mode: "continuable", label: "indexer"
                            }
                        ]
                    }
                }
            }
        };
        await view.rerender(h(HeaderCatalog, {
            ...current
        }, undefined));
        expect(screen.getByRole("treeitem", {
            name: /worker/
        })).toBe(worker);
        expect(worker.getAttribute("aria-expanded")).toBe("false");
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(screen.getByRole("treeitem", {
            name: /indexer/
        })).toBeTruthy();
        expect(input.refreshProjection).not.toHaveBeenCalled();
    });
    it("prepares the parent level from the switcher only on a pinning click or ArrowDown", async () => {
        const input = {
            ...props(catalog(), {}, {
                [CHILD]: {
                    ...summary(CHILD, 1), parentId: PARENT, origin: "subagent" as const
                }
            }),
            sessionId: CHILD,
            lineageSessionId: CHILD,
            displayTitle: "worker"
        };
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        const switcher = screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1Aworker"
        });
        await hoverCatalog(switcher);
        expect(input.prepareCatalog).not.toHaveBeenCalled();
        await act(() => fireEvent.click(switcher));
        expect(input.prepareCatalog.mock.calls).toEqual([
            [
                PARENT
            ]
        ]);
        await act(() => fireEvent.keyDown(document, {
            key: "Escape"
        }));
        await act(() => fireEvent.keyDown(switcher, {
            key: "ArrowDown"
        }));
        expect(input.prepareCatalog.mock.calls).toEqual([
            [
                PARENT
            ],
            [
                PARENT
            ]
        ]);
    });
    it("reports an unexpected catalog preparation failure", async () => {
        const input = props(catalog(), {
            [CHILD]: catalog({
                entries: [
                    {
                        id: GRANDCHILD, mode: "continuable", label: "indexer", activity: "inactive"
                    }
                ]
            })
        });
        const failure = new Error("projection reader failed");
        input.prepareCatalog.mockRejectedValueOnce(failure);
        const report = vi.spyOn(console, "error").mockImplementation(() => {
        });
        try {
            render(h(HeaderCatalog, {
                ...input
            }, undefined));
            await act(() => fireEvent.click(screen.getByRole("button", {
                name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
            })));
            await vi.waitFor(() => {
                expect(report).toHaveBeenCalledWith("[ui-subagent] catalog discovery failed:", failure);
            });
        }
        finally {
            report.mockRestore();
        }
    });
    it("moves focus through the tree with Home, End, and the arrow keys", async () => {
        const input = props(catalog());
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        const tree = screen.getByRole("tree");
        const worker = screen.getByRole("treeitem", {
            name: /worker/
        });
        const reviewer = screen.getByRole("treeitem", {
            name: /reviewer/
        });
        await act(() => fireEvent.keyDown(tree, {
            key: "ArrowUp"
        }));
        expect(document.activeElement).toBe(reviewer);
        await act(() => fireEvent.keyDown(reviewer, {
            key: "ArrowDown"
        }));
        expect(document.activeElement).toBe(worker);
        await act(() => fireEvent.keyDown(worker, {
            key: "End"
        }));
        expect(document.activeElement).toBe(reviewer);
        await act(() => fireEvent.keyDown(reviewer, {
            key: "Home"
        }));
        expect(document.activeElement).toBe(worker);
        await act(() => fireEvent.keyDown(worker, {
            key: "ArrowUp"
        }));
        expect(document.activeElement).toBe(reviewer);
        await act(() => fireEvent.keyDown(reviewer, {
            key: "a"
        }));
        expect(document.activeElement).toBe(reviewer);
    });
    it("shows external membership without an execution status or child Session navigation", async () => {
        const input = props(catalog({
            entries: [
                {
                    id: CHILD, mode: "external", label: "External review", activity: "inactive"
                }
            ]
        }));
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        const row = screen.getByRole("treeitem", {
            name: /External review.*外部任务/
        });
        expect(row.getAttribute("aria-disabled")).toBe("true");
        expect(row.hasAttribute("aria-expanded")).toBe(false);
        expect(row.getAttribute("aria-label")).not.toMatch(/已完成|未运行|结果待定/);
        await act(() => fireEvent.click(row));
        expect(input.openChild).not.toHaveBeenCalled();
        expect(input.openChildAside).not.toHaveBeenCalled();
    });
    it("collapses a branch together with its expanded descendants", async () => {
        const input = props(catalog(), {
            [CHILD]: catalog({
                entries: [
                    {
                        id: GRANDCHILD, mode: "continuable", label: "indexer", activity: "inactive"
                    }
                ]
            }),
            [GRANDCHILD]: catalog({
                entries: [
                    {
                        id: "great" as SessionId, mode: "continuable", label: "great", activity: "inactive"
                    }
                ]
            })
        });
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 indexer \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(screen.getByRole("treeitem", {
            name: /great/
        })).toBeTruthy();
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u6536\u8D77 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(screen.queryByRole("treeitem", {
            name: /indexer/
        })).toBeNull();
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5C55\u5F00 worker \u7684\u4E0B\u7EA7\u5B50\u667A\u80FD\u4F53"
        })));
        expect(screen.queryByRole("treeitem", {
            name: /great/
        })).toBeNull();
    });
    /** A catalog entry named by its id. */
    const member = (id: string, activity: "running" | "inactive" = "inactive"): CatalogFixtureEntry => ({
        id: id as SessionId, mode: "continuable", label: id, activity
    });
    /** Summaries that give a running subagent the start of its open turn and another one its last update. */
    const timed = (rows: Readonly<Record<string, {
        running?: number;
        updated?: number;
    }>>): Record<SessionId, SessionSummary> => Object.fromEntries(Object.entries(rows).map(([id, { running, updated }]) => [
        id,
        {
            ...summary(id as SessionId, updated ?? 0),
            running: running !== undefined,
            ...running === undefined
                ? {} : {
                projectionValues: {
                    subagentTiming: {
                        settledMs: 0, active: {
                            since: running, through: running
                        }
                    }
                }
            }
        }
    ]));
    /** The rows' names in display order; a row's accessible name starts with its label. */
    const shownRows = (): string[] => screen.getAllByRole("treeitem").map(row => (row.getAttribute("aria-label") ?? "").split(" ")[0] ?? "");
    const fold = (): HTMLElement | null => document.querySelector("[data-fold]");
    it("lists running subagents first by latest start, then the others by latest update, and a subagent without either by its creation", () => {
        const entries = [
            member("old-done"), member("early-run", "running"), member("new-done"), member("late-run", "running"), member("unlisted"), member("unknown")
        ];
        render(h(HeaderCatalog, {
            ...props(catalog({
                entries
            }), {}, timed({
                "old-done": {
                    updated: 10
                }, "early-run": {
                    running: 100, updated: 999
                },
                "new-done": {
                    updated: 30
                }, "late-run": {
                    running: 200, updated: 5
                },
                // The stand-in row of a Session outside the Host list carries no update time.
                "unlisted": {
                    updated: 0
                }
            }))
        }, undefined));
        // `unlisted` has no update time and `unknown` no summary: both sort by the fixture's creation time, 1, in catalog order.
        expect(shownRows()).toEqual([
            "late-run",
            "early-run",
            "new-done",
            "old-done",
            "unlisted",
            "unknown"
        ]);
        expect(fold()).toBeNull();
    });
    it("sorts a running subagent whose turn timing is not read yet by its creation", () => {
        const entries = [
            member("timed", "running"), member("untimed", "running")
        ];
        render(h(HeaderCatalog, {
            ...props(catalog({
                entries
            }), {}, {
                ...timed({
                    timed: {
                        running: 0
                    }
                }),
                ["untimed" as SessionId]: {
                    ...summary("untimed" as SessionId, 50), running: true
                }
            })
        }, undefined));
        // `untimed` falls back to the fixture's creation time, 1, which is later than the other row's turn start.
        expect(shownRows()).toEqual([
            "untimed",
            "timed"
        ]);
    });
    it("keeps catalog order among rows that tie", () => {
        const entries = [
            member("a"), member("b", "running"), member("c"), member("d", "running")
        ];
        const summaries = timed({
            a: {
                updated: 7
            }, b: {
                running: 3
            }, c: {
                updated: 7
            }, d: {
                running: 3
            }
        });
        render(h(HeaderCatalog, {
            ...props(catalog({
                entries
            }), {}, summaries)
        }, undefined));
        expect(shownRows()).toEqual([
            "b",
            "d",
            "a",
            "c"
        ]);
    });
    it("shows six rows in full and holds two back from seven, behind a fold control that shows them and folds again", async () => {
        const six = [
            "a",
            "b",
            "c",
            "d",
            "e",
            "f"
        ].map(id => member(id));
        const full = render(h(HeaderCatalog, {
            ...props(catalog({
                entries: six
            }))
        }, undefined));
        expect(shownRows()).toHaveLength(6);
        expect(fold()).toBeNull();
        full.unmount();
        render(h(HeaderCatalog, {
            ...props(catalog({
                entries: [
                    ...six, member("g")
                ]
            }))
        }, undefined));
        expect(shownRows()).toEqual([
            "a",
            "b",
            "c",
            "d",
            "e"
        ]);
        const control = fold() as HTMLElement;
        expect([
            control.textContent, control.getAttribute("aria-label"), control.getAttribute("aria-expanded")
        ])
            .toEqual([
            "\u663E\u793A\u5176\u4F59 2 \u4E2A",
            "\u663E\u793A\u5176\u4F59 2 \u4E2A\uFF08\u5B50\u667A\u80FD\u4F53\uFF09",
            "false"
        ]);
        // The control follows the tree instead of joining it, so the tree holds only its rows.
        expect(screen.getByRole("tree").contains(control)).toBe(false);
        await act(() => fireEvent.click(control));
        expect(shownRows()).toEqual([
            "a",
            "b",
            "c",
            "d",
            "e",
            "f",
            "g"
        ]);
        expect([
            fold()?.textContent, fold()?.getAttribute("aria-label"), fold()?.getAttribute("aria-expanded")
        ])
            .toEqual([
            "\u6536\u8D77",
            "\u6536\u8D77\uFF08\u5B50\u667A\u80FD\u4F53\uFF09",
            "true"
        ]);
        await act(() => fireEvent.click(fold() as HTMLElement));
        expect(shownRows()).toHaveLength(5);
    });
    it("holds back running subagents too once more than five run, counting every row behind the control", () => {
        const entries = [
            ...Array.from({
                length: 8
            }, (_, index) => member(`run-${index}`, "running")), member("done-0"), member("done-1")
        ];
        render(h(HeaderCatalog, {
            ...props(catalog({
                entries
            }), {}, timed(Object.fromEntries(entries.map((entry, index) => [
                entry.id, entry.activity === "running" ? {
                    running: index
                } : {
                    updated: index
                }
            ]))))
        }, undefined));
        expect(shownRows()).toEqual([
            "run-7",
            "run-6",
            "run-5",
            "run-4",
            "run-3"
        ]);
        expect(fold()?.textContent).toBe("\u663E\u793A\u5176\u4F59 5 \u4E2A");
    });
    it("keeps the fold in the Session store while the section is unmounted", async () => {
        const store = createSubagentsSectionStore().create();
        const entries = Array.from({
            length: 9
        }, (_, index) => member(`s-${index}`));
        const first = render(h(HeaderCatalog, {
            ...props(catalog({
                entries
            })),
            "store": store
        }, undefined));
        await act(() => fireEvent.click(fold() as HTMLElement));
        expect(store.getSnapshot()).toEqual({
            unfolded: true
        });
        first.unmount();
        render(h(HeaderCatalog, {
            ...props(catalog({
                entries
            })),
            "store": store
        }, undefined));
        expect(shownRows()).toHaveLength(9);
        expect(fold()?.getAttribute("aria-expanded")).toBe("true");
    });
    it.each(Object.entries({
        zh, en
    }))("names the fold control with its visible text first in %s", (_locale, copy) => {
        for (const label of [
            copy["list.more"].replace("{count}", "3"), copy["list.less"]
        ]) {
            expect(copy["list.foldName"].replace("{label}", label).startsWith(label)).toBe(true);
        }
    });
    it("renders nothing without subagents or a failed read, and keeps a failed read reachable", () => {
        const empty = render(h(HeaderCatalog, {
            ...props(catalog({
                entries: []
            }))
        }, undefined));
        expect(document.querySelector("[data-subagents-section]")).toBeNull();
        empty.unmount();
        const absent = render(h(Section, {
            ...props(undefined)
        }, undefined));
        expect(absent.container.textContent).toBe("");
        absent.unmount();
        render(h(HeaderCatalog, {
            ...props(catalog({
                entries: [], state: "error", error: new RemoteError("gateway/internal", "read failed", {})
            }))
        }, undefined));
        expect(document.querySelector("[data-subagents-section]")).not.toBeNull();
    });
    it("shows a named running dot while direct subagents run and the panel does not show them", () => {
        const indicator = (over: Parameters<typeof catalog>[0], panelShown: boolean, summaries?: Record<SessionId, SessionSummary>) => {
            const input = props(catalog(over), {}, summaries);
            const dotProps = {
                ...input, sessionId: PARENT, panelShown
            } as SubagentsRunningIndicatorProps;
            return render(h(SubagentsRunningIndicator, {
                ...dotProps
            }, undefined));
        };
        const external = "external" as SessionId;
        const running = {
            entries: [
                {
                    id: CHILD, mode: "continuable", label: "worker", activity: "running"
                },
                {
                    id: external, mode: "external", label: "external", activity: "running"
                }
            ]
        } satisfies Parameters<typeof catalog>[0];
        const summaries = {
            [CHILD]: {
                ...summary(CHILD, 1), running: true
            }, [external]: {
                ...summary(external, 1), running: true
            }
        };
        const shown = indicator(running, false, summaries);
        // External tasks never count as running.
        expect(shown.container.querySelector("[data-subagents-running]")?.textContent).toBe(zh["indicator.running"].replace("{count}", "1"));
        shown.unmount();
        expect(indicator(running, true, summaries).container.textContent).toBe("");
        cleanup();
        const idle = {
            entries: [
                {
                    id: CHILD, mode: "continuable", label: "worker", activity: "inactive"
                }
            ]
        } satisfies Parameters<typeof catalog>[0];
        expect(indicator(idle, false).container.textContent).toBe("");
        cleanup();
        const noCatalog = props(undefined);
        const absent = {
            ...noCatalog, sessionId: PARENT, panelShown: false
        } as SubagentsRunningIndicatorProps;
        expect(render(h(SubagentsRunningIndicator, {
            ...absent
        }, undefined)).container.textContent).toBe("");
    });
    it("shows direct-member progress beside the section title and omits zero counts", async () => {
        const finished = "finished" as SessionId;
        const paused = "paused" as SessionId;
        const external = "external" as SessionId;
        const entries: CatalogFixture["entries"] = [
            {
                id: CHILD, mode: "continuable", label: "worker", activity: "running"
            },
            {
                id: finished, mode: "continuable", label: "finished", activity: "inactive"
            },
            {
                id: paused, mode: "continuable", label: "paused", activity: "inactive"
            },
            {
                id: external, mode: "external", label: "external", activity: "running"
            }
        ];
        const summaries: Record<SessionId, SessionSummary> = {
            [CHILD]: {
                ...summary(CHILD, 1), running: true
            },
            [finished]: {
                ...summary(finished, 1), projectionValues: {
                    subagentTiming: {
                        settledMs: 0, lastTurnCompleted: true
                    }
                }
            },
            [paused]: {
                ...summary(paused, 1), projectionValues: {
                    subagentTiming: {
                        settledMs: 0, lastTurnCompleted: false
                    }
                }
            },
            [external]: {
                ...summary(external, 1), running: true
            }
        };
        const input = props(catalog({
            entries
        }), {}, summaries);
        const progressProps: SubagentsProgressProps = {
            ...input, sessionId: PARENT
        };
        const view = render(h(SubagentsProgress, {
            ...progressProps
        }, undefined));
        expect(view.container.textContent).toBe("1 \u5DF2\u5B8C\u6210\u2002\u00B7\u20021 \u8FDB\u884C\u4E2D\u2002\u00B7\u20021 \u672A\u8FD0\u884C\u2002\u00B7\u20021 \u5916\u90E8\u4EFB\u52A1");
        await view.rerender(h(SubagentsProgress, {
            ...progressProps,
            "t": makeTranslate(en)
        }, undefined));
        expect(view.container.textContent).toBe("1 completed\u2002\u00B7\u20021 in progress\u2002\u00B7\u20021 not running\u2002\u00B7\u20021 external");
        const done = props(catalog({
            entries: [
                {
                    id: finished, mode: "continuable", label: "finished", activity: "inactive"
                }
            ]
        }), {}, summaries);
        await view.rerender(h(SubagentsProgress, {
            ...done,
            "sessionId": PARENT
        }, undefined));
        expect(view.container.textContent).toBe("1 \u5DF2\u5B8C\u6210");
        const running = props(catalog());
        await view.rerender(h(SubagentsProgress, {
            ...running,
            "sessionId": PARENT
        }, undefined));
        expect(view.container.textContent).toBe("1 \u8FDB\u884C\u4E2D\u2002\u00B7\u20021 \u672A\u8FD0\u884C");
        const none = props(undefined);
        await view.rerender(h(SubagentsProgress, {
            ...none,
            "sessionId": PARENT
        }, undefined));
        expect(view.container.textContent).toBe("");
    });
});
describe("breadcrumb switcher", () => {
    function childInput(openTitle?: () => void) {
        const input = props(catalog(), {}, {
            [CHILD]: {
                ...summary(CHILD, 1), parentId: PARENT, origin: "subagent" as const
            }
        });
        return {
            ...input, sessionId: CHILD, lineageSessionId: CHILD, ...openTitle === undefined ? {} : {
                openTitle
            }
        };
    }
    it("opens on hover, survives the crossing into the menu, and closes after leaving both", async () => {
        render(h(HeaderCatalog, {
            ...childInput()
        }, undefined));
        const switcher = screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1Aworker"
        });
        await act(() => fireEvent.pointerEnter(switcher, {
            pointerType: "touch"
        }));
        if (!vi.isFakeTimers()) vi.useFakeTimers();
        await act(() => fireEvent.pointerEnter(switcher, {
            pointerType: "mouse"
        }));
        await act(() => {
            vi.advanceTimersByTime(150);
        });
        const menu = screen.getByRole("dialog");
        await act(() => fireEvent.pointerEnter(switcher, {
            pointerType: "mouse"
        }));
        await act(() => fireEvent.pointerLeave(switcher.parentElement as HTMLElement));
        await act(() => fireEvent.pointerEnter(menu, {
            pointerType: "touch"
        }));
        await act(() => fireEvent.pointerEnter(menu, {
            pointerType: "mouse"
        }));
        await act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(screen.getByRole("dialog")).toBe(menu);
        await act(() => fireEvent.pointerLeave(menu));
        await act(() => {
            vi.advanceTimersByTime(120);
        });
        expect(screen.queryByRole("dialog")).toBeNull();
    });
    it("pins on click until an outside press, and keeps the menu through presses inside it", async () => {
        render(h(HeaderCatalog, {
            ...childInput()
        }, undefined));
        const switcher = screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1Aworker"
        });
        await act(() => fireEvent.click(switcher));
        await act(async () => {
            await Promise.resolve();
        });
        const menu = screen.getByRole("dialog");
        expect(document.activeElement).toBe(menu);
        await act(() => fireEvent.pointerLeave(menu));
        await act(() => fireEvent.pointerDown(menu));
        expect(screen.getByRole("dialog")).toBe(menu);
        await act(() => fireEvent.keyDown(document, {
            key: "Tab"
        }));
        expect(screen.getByRole("dialog")).toBe(menu);
        await act(() => fireEvent.pointerDown(document.body));
        expect(screen.queryByRole("dialog")).toBeNull();
    });
    it("opens with ArrowDown on the first row and returns focus on Escape from inside", async () => {
        render(h(HeaderCatalog, {
            ...childInput()
        }, undefined));
        const switcher = screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1Aworker"
        });
        await act(() => fireEvent.keyDown(switcher, {
            key: "Enter"
        }));
        expect(screen.queryByRole("dialog")).toBeNull();
        await act(() => fireEvent.keyDown(switcher, {
            key: "ArrowDown"
        }));
        const tree = within(screen.getByRole("dialog")).getByRole("tree");
        expect(document.activeElement).toBe(within(tree).getAllByRole("treeitem")[0]);
        await act(() => fireEvent.keyDown(document.activeElement as HTMLElement, {
            key: "Escape"
        }));
        expect(screen.queryByRole("dialog")).toBeNull();
        await act(async () => {
            await Promise.resolve();
        });
        expect(document.activeElement).toBe(switcher);
    });
    it("keeps the two-line rows in the menu, with whichever measures each child has", async () => {
        const tokensOnly = "tokens-only" as SessionId;
        const durationOnly = "duration-only" as SessionId;
        const input = props(catalog({
            entries: [
                {
                    id: CHILD, mode: "continuable", label: "worker", name: "worker-agent", activity: "inactive"
                },
                {
                    id: tokensOnly, mode: "continuable", label: "tokens", activity: "inactive"
                },
                {
                    id: durationOnly, mode: "continuable", label: "duration", activity: "inactive"
                }
            ]
        }), {}, {
            [CHILD]: {
                ...summary(CHILD, 1), parentId: PARENT, origin: "subagent"
            },
            [tokensOnly]: {
                ...summary(tokensOnly, 1), parentId: PARENT, origin: "subagent", projectionValues: {
                    tokenUsage: {
                        uncachedInputTokens: 1200, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0
                    }
                }
            },
            [durationOnly]: {
                ...summary(durationOnly, 1), parentId: PARENT, origin: "subagent", projectionValues: {
                    subagentTiming: {
                        settledMs: 3000
                    }
                }
            }
        });
        render(h(HeaderCatalog, {
            ...input,
            "sessionId": CHILD,
            "lineageSessionId": CHILD
        }, undefined));
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: /^切换子智能体：/
        })));
        await act(async () => {
            await Promise.resolve();
        });
        const menu = within(screen.getByRole("dialog"));
        const worker = menu.getByRole("treeitem", {
            name: /^worker/
        });
        expect(within(worker).getByText("worker-agent")).toBeTruthy();
        expect(within(worker).queryByText(/tok|秒/)).toBeNull();
        const tokens = menu.getByRole("treeitem", {
            name: /^tokens/
        });
        expect([
            within(tokens).getByText("1.2K tok").nextElementSibling
        ]).toEqual([
            null
        ]);
        const duration = menu.getByRole("treeitem", {
            name: /^duration/
        });
        expect(within(duration).getByText("3\u79D2").previousElementSibling).toBeNull();
    });
    it("moves focus into an open menu with ArrowDown once its rows have loaded", async () => {
        const loading = {
            ...childInput(), ...props(catalog({
                entries: [], state: "loading"
            }), {}, {
                [CHILD]: {
                    ...summary(CHILD, 1), parentId: PARENT, origin: "subagent" as const
                }
            }), sessionId: CHILD, lineageSessionId: CHILD
        };
        const view = render(h(HeaderCatalog, {
            ...loading
        }, undefined));
        // Until the catalog loads, the switcher names the Session by its own title.
        const switcher = screen.getByRole("button", {
            name: /^切换子智能体：/
        });
        switcher.focus();
        await act(() => fireEvent.keyDown(switcher, {
            key: "ArrowDown"
        }));
        const menu = screen.getByRole("dialog");
        expect(within(menu).queryAllByRole("treeitem")).toEqual([]);
        expect(document.activeElement).toBe(switcher);
        // Before any row exists, the key moves focus to the menu, whose own keys then reach the rows.
        await act(() => fireEvent.keyDown(switcher, {
            key: "ArrowDown"
        }));
        expect(document.activeElement).toBe(menu);
        switcher.focus();
        await view.rerender(h(HeaderCatalog, {
            ...childInput()
        }, undefined));
        await act(() => fireEvent.keyDown(switcher, {
            key: "ArrowDown"
        }));
        expect(document.activeElement).toBe(within(screen.getByRole("dialog")).getAllByRole("treeitem")[0]);
    });
    it("moves focus from a pinned menu into the tree with the arrow, Home, and End keys", async () => {
        render(h(HeaderCatalog, {
            ...childInput()
        }, undefined));
        await act(() => fireEvent.click(screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1Aworker"
        })));
        await act(async () => {
            await Promise.resolve();
        });
        const menu = screen.getByRole("dialog");
        const rows = within(menu).getAllByRole("treeitem");
        expect(document.activeElement).toBe(menu);
        await act(() => fireEvent.keyDown(menu, {
            key: "Enter"
        }));
        expect(document.activeElement).toBe(menu);
        for (const [key, row] of [
            [
                "ArrowDown",
                rows[0]
            ],
            [
                "End",
                rows.at(-1)
            ],
            [
                "Home",
                rows[0]
            ],
            [
                "ArrowUp",
                rows.at(-1)
            ]
        ] as const) {
            menu.focus();
            await act(() => fireEvent.keyDown(menu, {
                key
            }));
            expect(document.activeElement).toBe(row);
        }
        // Keys from a row stay with the tree's own navigation.
        await act(() => fireEvent.keyDown(rows.at(-1) as HTMLElement, {
            key: "Home"
        }));
        expect(document.activeElement).toBe(rows[0]);
    });
    it("closes on Escape from the page without moving focus, and after a row opens a Session", async () => {
        const input = childInput();
        render(h(HeaderCatalog, {
            ...input
        }, undefined));
        const switcher = screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1Aworker"
        });
        await act(() => fireEvent.click(switcher));
        await act(() => fireEvent.keyDown(document, {
            key: "Escape"
        }));
        expect(screen.queryByRole("dialog")).toBeNull();
        await act(() => fireEvent.click(switcher));
        await act(() => fireEvent.click(within(screen.getByRole("dialog")).getByRole("treeitem", {
            name: /reviewer/
        })));
        expect(input.openChild).toHaveBeenCalledWith({
            parentSessionId: PARENT, childSessionId: "child-2", mode: "one-shot"
        });
        expect(screen.queryByRole("dialog")).toBeNull();
    });
    it("navigates to the ancestor when the title is clickable", async () => {
        const openTitle = vi.fn();
        render(h(HeaderCatalog, {
            ...childInput(openTitle)
        }, undefined));
        const switcher = screen.getByRole("button", {
            name: "\u5207\u6362\u5B50\u667A\u80FD\u4F53\uFF1Aworker"
        });
        expect(switcher.className).toContain("ancestorSwitcherTrigger");
        await act(() => fireEvent.click(switcher));
        expect(openTitle).toHaveBeenCalledOnce();
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
describe("SubagentReadOnlyComposer", () => {
    it("keeps an unknown child read-only until its descriptor is available", () => {
        render(h(SubagentReadOnlyComposer, {
            "matched": {
                reason: "unknown"
            },
            "t": t
        }, undefined));
        expect(screen.getByRole("status").textContent).toContain("\u8BFB\u53D6\u5B50\u4F1A\u8BDD\u540E\u624D\u80FD\u786E\u5B9A\u662F\u5426\u53EF\u7EE7\u7EED");
    });
    it("explains that one-shot histories never accept follow-ups", () => {
        render(h(SubagentReadOnlyComposer, {
            "matched": {
                reason: "one-shot"
            },
            "t": t
        }, undefined));
        expect(screen.getByRole("status").textContent).toContain("\u4E00\u6B21\u6027\u4EFB\u52A1\u4E0D\u652F\u6301\u540E\u7EED\u6D88\u606F");
    });
});
