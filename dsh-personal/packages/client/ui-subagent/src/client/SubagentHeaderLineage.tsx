/** Breadcrumb switcher for subagent Sessions: the current title opens its siblings' tree. */
import { defineComponent, computed, ref, shallowRef, watchEffect, onScopeDispose, useId, h, Fragment, Teleport, type VNodeChild } from "vue";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { MenuSurface } from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import { NS } from "./locales.ts";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import { CatalogTree, deriveCatalogs, entryName, levelPreparer, treeItems, type SubagentCatalogInjected, type SubagentCatalogSnapshot, } from "./SubagentCatalog.tsx";
import css from "./SubagentCatalog.module.css";
export type { SubagentCatalogInjected } from "./SubagentCatalog.tsx";
/** Full props for the session-header lineage renderer. */
export type SubagentHeaderLineageProps = PropsRuntime<"conversation.session.header.lineage"> & InjectFace<SubagentCatalogInjected> & PropsLocale<typeof NS>;
function SubagentSwitcherIcon() {
    return (h("svg", {
        "width": "16",
        "height": "16",
        "viewBox": "0 0 20 20",
        "fill": "none",
        "aria-hidden": "true"
    }, [
        h("path", {
            "d": "M5.99951 12.7L8.95546 14.9478C9.40011 15.2859 9.62244 15.455 9.87526 15.488C9.95774 15.4988 10.0413 15.4988 10.1238 15.488C10.3766 15.455 10.5989 15.2859 11.0436 14.9478L13.9995 12.7",
            "stroke": "currentColor",
            "strokeWidth": "1.5"
        }, undefined),
        h("path", {
            "d": "M13.9995 7.7417L11.0436 5.49387C10.5989 5.15574 10.3766 4.98668 10.1238 4.95362C10.0413 4.94283 9.95775 4.94283 9.87527 4.95362C9.62245 4.98668 9.40012 5.15574 8.95547 5.49387L5.99952 7.7417",
            "stroke": "currentColor",
            "strokeWidth": "1.5"
        }, undefined)
    ]));
}
interface SwitcherProps extends InjectFace<SubagentCatalogInjected> {
    /** Parent Session whose direct catalog roots the tree. */
    rootSessionId: SessionId;
    /** Selected descendant highlighted in the tree. */
    currentSessionId: SessionId;
    /** Visible title included in the switcher's hover target. */
    displayTitle: string;
    /** Optional ancestor navigation when the combined title is clicked. */
    openTitle?: () => void;
    useSessions: SubagentHeaderLineageProps["useSessions"];
    useSessionStatus: SubagentHeaderLineageProps["useSessionStatus"];
    t: TranslateNS<typeof NS>;
}
/**
 * Title-and-chevron dropdown over the parent's subagent tree. Hover opens it
 * after 150ms and leaving both surfaces closes it after 120ms; a click pins it
 * until an outside press or Escape. With `openTitle`, a click navigates to the
 * ancestor instead. Hovering reads nothing; a pinning click or ArrowDown
 * prepares the parent's level.
 * @param props - tree root, current Session, title, Session hooks, actions, and copy.
 * @returns the switcher.
 */
const Switcher = defineComponent((props: SwitcherProps) => {
    const projections = props.useSessions(state => state.projectionsBySession);
    const summariesRef = props.useSessions(state => state.byId);
    const statuses = props.useSessionStatus(value => value);
    const catalogsRef = computed(() => deriveCatalogs(projections.value, summariesRef.value, statuses.value));
    const open = ref<"closed" | "hover" | "pinned" | "keyboard">("closed");
    const setOpen = (value: typeof open.value) => {
        open.value = value;
    };
    const rootRef = shallowRef<HTMLDivElement | null>(null);
    const triggerRef = shallowRef<HTMLButtonElement | null>(null);
    const menuRef = shallowRef<HTMLDivElement | null>(null);
    const anchorName = "--dsh-subagents-" + useId().replaceAll(":", "");
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelHover = (): void => {
        clearTimeout(hoverTimer);
        hoverTimer = undefined;
    };
    const close = (restoreFocus = false): void => {
        cancelHover();
        setOpen("closed");
        if (restoreFocus)
            queueMicrotask(() => {
                triggerRef.value?.focus();
            });
    };
    watchEffect(cleanup => {
        if (open.value === "closed")
            return;
        const closeOutside = (event: PointerEvent) => {
            if (event.target instanceof Node && !rootRef.value?.contains(event.target) && !menuRef.value?.contains(event.target))
                close();
        };
        const dismiss = (event: KeyboardEvent) => {
            if (event.key !== "Escape")
                return;
            event.preventDefault();
            close(menuRef.value?.contains(document.activeElement) === true);
        };
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("keydown", dismiss);
        cleanup(() => {
            document.removeEventListener("pointerdown", closeOutside);
            document.removeEventListener("keydown", dismiss);
        });
    });
    onScopeDispose(cancelHover);
    const hoverIn = (pointerType: string): void => {
        if (pointerType === "touch")
            return;
        cancelHover();
        if (open.value !== "closed")
            return;
        hoverTimer = setTimeout(() => {
            setOpen("hover");
        }, 150);
    };
    const hoverOut = (): void => {
        cancelHover();
        if (open.value !== "hover")
            return;
        hoverTimer = setTimeout(() => {
            setOpen("closed");
        }, 120);
    };
    return (): VNodeChild => {
        const { rootSessionId, currentSessionId, displayTitle, openTitle, openChild, openChildAside, prepareCatalog, t } = props;
        const catalogs = catalogsRef.value, summaries = summariesRef.value;
        const catalog: SubagentCatalogSnapshot = catalogs[rootSessionId] ?? {
            entries: [], state: "idle", error: null
        };
        const prepareLevel = levelPreparer(prepareCatalog);
        const currentEntry = catalog.entries.find(entry => entry.id === currentSessionId);
        const title = currentEntry !== undefined ? currentEntry.label || entryName(currentEntry) : displayTitle;
        const shown = open.value !== "closed";
        return (h("div", {
            "class": `${css.root} ${css.switcherRoot}`,
            "ref": rootRef,
            "data-subagent-action": true,
            "onPointerleave": hoverOut
        }, [
            h("button", {
                "ref": triggerRef,
                "style": {
                    anchorName
                },
                "type": "button",
                "class": `${css.switcherTrigger} ${openTitle !== undefined ? css.ancestorSwitcherTrigger : ""}`,
                "aria-haspopup": "dialog",
                "aria-expanded": shown,
                "aria-label": t("switcher.aria", {
                    title
                }),
                "onPointerenter": (event: PointerEvent) => {
                    hoverIn(event.pointerType);
                },
                "onClick": () => {
                    cancelHover();
                    if (openTitle !== undefined) {
                        close();
                        openTitle();
                        return;
                    }
                    setOpen("pinned");
                    prepareLevel(rootSessionId);
                    queueMicrotask(() => {
                        menuRef.value?.focus();
                    });
                },
                "onKeydown": (event: KeyboardEvent & { currentTarget: HTMLDivElement }) => {
                    if (event.key !== "ArrowDown")
                        return;
                    event.preventDefault();
                    // The menu may have opened before its rows loaded, leaving focus here; the key then moves it into the menu.
                    const menu = menuRef.value;
                    if (shown && menu !== null) {
                        (treeItems(menu)[0] ?? menu).focus();
                        return;
                    }
                    setOpen("keyboard");
                    prepareLevel(rootSessionId);
                }
            }, [
                h("span", {
                    "class": css.switcherTitle
                }, [
                    title
                ]),
                h(SubagentSwitcherIcon, {}, undefined)
            ]),
            shown && createPortal((h(MenuSurface, {
                "elementRef": (element: HTMLDivElement | null) => { menuRef.value = element },
                "class": css.menu,
                "style": {
                    positionAnchor: anchorName
                },
                "role": "dialog",
                "tabIndex": -1,
                "aria-label": t("tree.aria"),
                "data-subagent-panel": true,
                "onKeydown": (event: KeyboardEvent & { currentTarget: HTMLDivElement }) => {
                    // A pinned menu takes focus itself; the tree handles keys once a row has focus.
                    if (event.target !== event.currentTarget)
                        return;
                    const items = treeItems(event.currentTarget);
                    const row = event.key === "ArrowDown" || event.key === "Home" ? items[0]
                        : event.key === "ArrowUp" || event.key === "End" ? items.at(-1) : undefined;
                    if (row === undefined)
                        return;
                    event.preventDefault();
                    row.focus();
                },
                "onPointerenter": (event: PointerEvent) => {
                    if (event.pointerType !== "touch")
                        cancelHover();
                },
                "onPointerleave": hoverOut
            }, { default: () => [
                    h("div", {
                        "class": css.menuBody
                    }, [
                        h(CatalogTree, {
                            "rootSessionId": rootSessionId,
                            "currentSessionId": currentSessionId,
                            "catalog": catalog,
                            "catalogs": catalogs,
                            "summaries": summaries,
                            "openChild": openChild,
                            "openChildAside": openChildAside,
                            "prepareLevel": prepareLevel,
                            "onOpened": () => {
                                close();
                            },
                            "focusFirst": open.value === "keyboard",
                            "t": t
                        }, undefined)
                    ])
                ] })), document.body)
        ]));
    };
}, {
    inheritAttrs: false, props: [
        "rootSessionId",
        "currentSessionId",
        "displayTitle",
        "openTitle",
        "useSessions",
        "useSessionStatus",
        "openChild",
        "openChildAside",
        "refreshProjection",
        "prepareCatalog",
        "t"
    ]
});
export const SubagentHeaderLineage = defineComponent((props: SubagentHeaderLineageProps) => {
    const address = props.useSession(session => session.subagent?.address);
    const parentId = props.useSessions((state) => {
        if (address.value?.childSessionId === props.lineageSessionId)
            return address.value.parentSessionId;
        for (const [parentId, snapshot] of Object.entries(state.projectionsBySession)) {
            if (snapshot.values.subagentCatalog?.some(entry => entry.id === props.lineageSessionId))
                return parentId as SessionId;
        }
        const summary = state.byId[props.lineageSessionId];
        return summary?.origin === "subagent" ? summary.parentId : undefined;
    });
    return () => {
        const { lineageSessionId, displayTitle, openTitle, useSessions, useSessionStatus, openChild, openChildAside, refreshProjection, prepareCatalog, t } = props;
        const shared = {
            useSessions, useSessionStatus, openChild, openChildAside, refreshProjection, prepareCatalog, t
        };
        // Root sessions list their descendants in the Session panel.
        if (parentId.value === undefined)
            return null;
        return (h(Fragment, null, [
            h(Switcher, {
                "key": `switcher:${lineageSessionId}`, "rootSessionId": parentId.value, "currentSessionId": lineageSessionId, "displayTitle": displayTitle, ...openTitle === undefined ? {} : {
                    openTitle
                }, ...shared
            })
        ]));
    };
}, {
    name: "SubagentHeaderLineage", inheritAttrs: false, props: [
        "lineageSessionId",
        "displayTitle",
        "openTitle",
        "useSessions",
        "useSession",
        "useSessionStatus",
        "openChild",
        "openChildAside",
        "refreshProjection",
        "prepareCatalog",
        "t"
    ]
});
function createPortal(content: VNodeChild, target: Element): VNodeChild {
    return h(Teleport, {
        to: target
    }, [
        content
    ]);
}
