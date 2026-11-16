/**
 * One pane's workspace navigator: the search bar, the tree, and the edge that
 * resizes it. The `files` page draws it below its header; beside a preview the
 * preview's own header is the only one. Everything it shows lives in the store
 * and face, keyed by pane, so a remount on a tab switch or replacement draws it
 * unchanged, keyboard focus included when the tree held it. Its layout
 * follows `PUSH_FROM`, `FILL_BELOW`, and `FULLSCREEN_QUERY`; the package
 * README describes its behavior, search included.
 */
import { defineComponent, h, Fragment, computed, ref, shallowRef, watch, type CSSProperties, type ComponentPublicInstance, type VNodeChild } from 'vue';
import clsx from 'clsx';
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client';
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type { TreeEntry } from './FileTree.tsx';
import type { FactoryComponentPropsOf, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { Button, IconCloseOutlineRegular, IconEyeOffOutlineRegular, IconEyeOutlineRegular, IconInfoOutlineRegular, IconSearchOutlineRegular, StateDot, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path';
import type { FilesInjected } from './face.ts';
import type { SidebarFilesKey } from './locales.ts';
import { SearchSettings } from './SearchSettings.tsx';
import { defaultSearchPreferences, type ExclusionRule } from './search-rules.ts';
import { DEFAULT_NAVIGATOR_WIDTH, PUSH_FROM, locateFile, navigatorGeometry, relativeFileOf, type createFilesStore } from './store.ts';
import type { FilesSearchResult } from './store.ts';
import { failureLine, parentOf, searchDirectories, treeRootOf, workspaceDirectories, workspaceEntries } from './workspace-tree.ts';
import { FILL_BELOW } from './navigator-layout.ts';
import css from './FilesBody.module.css';
/** What a navigator occurrence is drawn for. */
export interface FileNavigatorInput {
    /** The tab the navigator is drawn beside, and its pane. */
    readonly useTabInfo: UseSidebarRightTabInfo;
    /** Drawn for the `files` page: always shown and filling the page. */
    readonly page: boolean;
    /** Ask the containing plugin to open a file. @param address - the file's resource address. */
    readonly onOpen: (address: string) => void;
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotFactoryMap {
        /**
         * One pane's workspace tree with its width and show/hide state. The host renders it as a direct child of
         * the content row it shares with the body, and that row carries `data-files-navigator-row`, which the
         * filled layout needs to hide the covered body.
         */
        'sidebar.files.navigator': {
            scope: 'session';
            props: FileNavigatorInput;
            store: ReturnType<typeof createFilesStore>;
            locale: 'sidebarFiles';
            inject: FilesInjected;
        };
    }
}
/** One keyboard resize step. */
const RESIZE_STEP = 20;
/**
 * How a preview's navigator shares its row with the body: beside it, taking
 * width from it (`push`); floating over its right part (`overlay`); or
 * covering the whole row (`fill`).
 */
type NavigatorMode = 'push' | 'overlay' | 'fill';
/**
 * The layout a preview's navigator takes in a row; `FULLSCREEN_QUERY` makes every layout fill in CSS.
 * @param rowWidth - the row's width measured by the face; `undefined` before it is measured.
 * @returns `overlay` until measured, then the layout for the width.
 */
function navigatorMode(rowWidth: number | undefined): NavigatorMode {
    if (rowWidth === undefined)
        return 'overlay';
    return rowWidth >= PUSH_FROM ? 'push' : rowWidth >= FILL_BELOW ? 'overlay' : 'fill';
}
/**
 * Why an empty result may still hide matches.
 * @param result - a settled search with no entries.
 * @returns the hint's key, or `undefined` when the search left nothing out.
 */
function emptyHint(result: SearchFilters): SidebarFilesKey | undefined {
    const { hiddenLeftOut: hidden, excluded, ignored } = result;
    if (hidden && excluded)
        return ignored ? 'search.emptyHint.all' : 'search.emptyHint.both';
    if (hidden)
        return ignored ? 'search.emptyHint.hiddenIgnored' : 'search.emptyHint.hidden';
    if (excluded)
        return ignored ? 'search.emptyHint.excludedIgnored' : 'search.emptyHint.excluded';
    return ignored ? 'search.emptyHint.ignored' : undefined;
}
/**
 * Move keyboard focus one step along the search field and the drawn rows,
 * in document order: ↓ from the field enters the first row, and ↑ on the
 * first row returns to the field. A key that composes text in an input method,
 * or that something in the navigator already handled, stays where it is.
 * @param event - a key pressed in the navigator.
 */
function moveAlongRows(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing)
        return;
    if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
    if (!(event.currentTarget instanceof HTMLElement)) return;
    const stops = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-files-search], [data-files-body] [data-files-path] > div > button')];
    const at = stops.findIndex(stop => stop === event.target);
    const next = at === -1 ? undefined : stops[at + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next === undefined)
        return;
    event.preventDefault();
    next.focus();
}
/** Which filters a search applied, and so which of them an empty result may owe its emptiness to. */
type SearchFilters = {
    readonly hiddenLeftOut: boolean;
    readonly excluded: boolean;
    readonly ignored: boolean;
};
/**
 * What the results area shows below a search's result tree: that nothing
 * matched, with an information button whose tooltip names the filters that
 * left entries out, that only the first matches are drawn, and that the
 * result may be incomplete.
 */
function SearchNotes({ result, t }: {
    result: Extract<FilesSearchResult, {
        kind: 'found';
    }>;
    t: TranslateNS<'sidebarFiles'>;
}): VNodeChild {
    const hint = result.count > 0 ? undefined : emptyHint(result);
    return (h(Fragment, null, [
        result.count === 0 && (h("p", {
            "class": clsx(css.note, css.emptyNote),
            "data-files-row": "search-empty"
        }, [
            h("span", null, [
                t('search.empty')
            ]),
            hint !== undefined && (h(Tooltip, {
                "label": t(hint),
                "side": "bottom",
                "delayMs": 300,
                "maxWidth": 300,
                "portal": true,
                "openOnClick": true
            }, {
                "default": () => [
                    h(Button, {
                        "variant": "ghost",
                        "size": "sm",
                        "class": css.infoButton,
                        "aria-label": t('search.emptyHint.label'),
                        "data-files-search-hint": ""
                    }, {
                        "default": () => [
                            h(IconInfoOutlineRegular, {
                                "size": 11,
                                "aria-hidden": "true"
                            }, {
                                "default": () => []
                            })
                        ]
                    })
                ]
            }))
        ])),
        result.truncated && (h("p", {
            "class": css.note,
            "data-files-row": "search-truncated"
        }, [
            t('search.truncated', { count: String(result.count) })
        ])),
        result.incomplete && h("p", {
            "class": css.note,
            "data-files-row": "search-incomplete"
        }, [
            t('search.incomplete')
        ])
    ]));
}
/**
 * What the results area shows for a search the Host could not run: why, and a control that runs it again.
 * @param props.failure - the failed search's Remote failure.
 * @param props.onRetry - runs the search again.
 * @param props.t - namespace-bound translate.
 * @returns the notice.
 */
function SearchFailure({ failure, onRetry, t }: {
    readonly failure: RemoteFailure;
    readonly onRetry: () => void;
    readonly t: TranslateNS<'sidebarFiles'>;
}): VNodeChild {
    return (h("div", {
        "class": css.searchFailure,
        "data-files-row": "search-failed"
    }, [
        h("p", {
            "class": css.note,
            "role": "alert"
        }, [
            t('search.failed', { message: failureLine(t, failure) })
        ]),
        h(Button, {
            "variant": "outline",
            "size": "sm",
            "class": css.searchRetry,
            "data-files-search-retry": "",
            "onClick": onRetry
        }, {
            "default": () => [
                t('search.retry')
            ]
        })
    ]));
}
/**
 * The navigator Factory's component.
 * @param props - the tab it is drawn for, the pane's store records, the tree's face, and copy.
 * @returns the navigator, or nothing while hidden or without a workspace.
 */
export const FileNavigator = defineComponent((props: FactoryComponentPropsOf<'sidebar.files.navigator'>) => {
    const info = props.useTabInfo();
    const { getTriggerProps } = props.useContextMenu();
    const selectedCwd = props.useSessions(sessions => sessions.byId[props.sessionId]?.cwd);
    const panes = props.useStore(store => store.byPane);
    const selectedState = computed(() => panes.value[info.value.panel.id]);
    // The measured element owns this key; a pane move rebinds it at DOM commit.
    const measuredPane = shallowRef<string>();
    const selectedWidth = props.useRowWidth(measuredPane);
    const selectedCanOpen = props.useCanOpen(check => check);
    const selectedPreferences = props.useSearchPreferences(computed(() => selectedCwd.value ?? ''));
    const selectedTree = computed(() => selectedState.value?.tree?.root === selectedCwd.value ? selectedState.value?.tree : undefined);
    const selectedEntries = computed(() => selectedTree.value === undefined ? undefined : workspaceEntries(selectedTree.value.levels, (selectedPreferences.value ?? defaultSearchPreferences()).showHidden));
    const selectedDirectories = computed(() => selectedTree.value === undefined ? undefined : workspaceDirectories(selectedTree.value, props.t, (selectedPreferences.value ?? defaultSearchPreferences()).showHidden));
    const selectedFound = computed(() => selectedState.value?.search?.result?.kind === 'found' ? selectedState.value.search.result : undefined);
    const selectedResultTree = computed(() => { const found = selectedFound.value; return found !== undefined && found.count > 0 ? found.tree : undefined; });
    const selectedResultEntries = computed(() => selectedResultTree.value === undefined ? undefined : workspaceEntries(selectedResultTree.value.levels, (selectedPreferences.value ?? defaultSearchPreferences()).showHidden));
    const selectedResultDirectories = computed(() => selectedResultTree.value === undefined ? undefined : searchDirectories(selectedResultTree.value));
    const draggingState = ref(false);
    const draftState = shallowRef<readonly ExclusionRule[]>();
    const setDragging = (value: boolean): void => { draggingState.value = value; };
    const setDraft = (value: readonly ExclusionRule[] | undefined): void => { draftState.value = value; };
    const drag = shallowRef<{ readonly x: number; readonly width: number }>();
    const input = shallowRef<HTMLInputElement | null>(null);
    const trigger = shallowRef<HTMLButtonElement | null>(null);
    const held = computed(() => props.page || selectedState.value?.open === true);
    const resultsDrawn = computed(() => selectedState.value?.search !== undefined);
    const navigatorElement = shallowRef<HTMLElement | null>(null);
    const bodyElement = shallowRef<HTMLDivElement | null>(null);
    const currentElement = shallowRef<HTMLElement | null>(null);
    let navigatorBinding: object | undefined;
    const navigatorRef = (element: Element | ComponentPublicInstance | null, paneId: string, binding: object): void => {
        if (element instanceof HTMLElement) {
            navigatorBinding = binding;
            measuredPane.value = paneId;
            navigatorElement.value = element;
        } else if (navigatorBinding === binding) {
            navigatorBinding = undefined;
            navigatorElement.value = null;
            measuredPane.value = undefined;
        }
    };
    let currentNavigatorRef: { readonly paneId: string; readonly callback: (element: Element | ComponentPublicInstance | null) => void } | undefined;
    const navigatorRefFor = (paneId: string): (element: Element | ComponentPublicInstance | null) => void => {
        if (currentNavigatorRef?.paneId !== paneId) {
            const binding = {};
            currentNavigatorRef = { paneId, callback: element => navigatorRef(element, paneId, binding) };
        }
        return currentNavigatorRef.callback;
    };
    const bodyRef = (element: Element | ComponentPublicInstance | null): void => { bodyElement.value = element instanceof HTMLDivElement ? element : null; };
    const inputRef = (element: Element | ComponentPublicInstance | null): void => { input.value = element instanceof HTMLInputElement ? element : null; };
    const currentRef = (row: HTMLElement | null): void => { currentElement.value = row; };
    // The face reads ancestors and geometry only after Vue inserts the drawing.
    watch([() => navigatorElement.value, () => info.value.panel.id, () => props.page, () => props.navigatorDrawn],
        ([element, pane, page, drawn], _previous, onCleanup) => {
            if (element === null) return;
            drawn(pane, element, !page);
            onCleanup(() => drawn(pane, null, !page));
        }, { flush: 'post', immediate: true });
    watch([() => bodyElement.value, () => info.value.panel.id, () => info.value.tab.contentId, () => resultsDrawn.value, () => props.bodyDrawn],
        ([element, pane, contentId, _results, drawn], _previous, onCleanup) => {
            if (element === null) return;
            drawn(pane, contentId, element);
            onCleanup(() => drawn(pane, contentId, null));
        }, { flush: 'post', immediate: true });
    watch([() => input.value, () => info.value.panel.id, () => props.searchDrawn],
        ([element, pane, drawn], _previous, onCleanup) => {
            if (element === null) return;
            drawn(pane, element);
            onCleanup(() => drawn(pane, null));
        }, { flush: 'post', immediate: true });
    watch([() => currentElement.value, () => info.value.panel.id, () => props.currentDrawn],
        ([element, pane, drawn], _previous, onCleanup) => {
            if (element === null) return;
            drawn(pane, element);
            onCleanup(() => drawn(pane, null));
        }, { flush: 'post', immediate: true });
    watch([() => info.value.panel.id, () => info.value.tab.id, () => info.value.tab.signal, () => props.attach],
        ([pane, tabId, signal, attach], _previous, onCleanup) => { onCleanup(attach(pane, tabId, signal)); }, { immediate: true });
    watch([() => props.page, () => selectedCwd.value, () => info.value.tab.id, () => props.placeBeside],
        ([page, cwd, tabId, placeBeside], _previous, onCleanup) => { if (!page && cwd !== undefined) onCleanup(placeBeside(tabId)); }, { immediate: true });
    watch([() => selectedCwd.value, () => held.value, () => info.value.panel.id, () => props.hold],
        ([cwd, held, pane, hold], _previous, onCleanup) => { if (cwd !== undefined && held) onCleanup(hold(pane, cwd)); }, { immediate: true });
    return () => {
    const { page, onOpen, sessionId, actions, toggle, scrolled, setQuery, toggleSearch, retrySearch, setSearchPreferences, t, renderFactorySlot } = props;
    const { tab, panel } = info.value;
    const paneId = panel.id;
    const cwd = selectedCwd.value; const state = selectedState.value; const rowWidth = selectedWidth.value;
    const canOpen = selectedCanOpen.value;
    const open = page || state?.open === true;
    const mode = navigatorMode(rowWidth);
    const tree = selectedTree.value;
    const preferences = selectedPreferences.value ?? defaultSearchPreferences();
    const query = state?.query ?? '';
    const searchBarOpen = !page || state?.searchBarOpen === true;
    const search = state?.search; const pending = search?.pending === true; const result = search?.result;
    const found = selectedFound.value;
    const dragging = draggingState.value; const draft = draftState.value; const settings = draft !== undefined;
    const resultsShown = search !== undefined;
    const relativePath = tree === undefined ? undefined : relativeFileOf(tab.contentId, sessionId, tree.root);
    const location = tree === undefined || relativePath === undefined ? undefined : locateFile(tree, relativePath);
    const entries = selectedEntries.value; const directories = selectedDirectories.value;
    const resultTree = selectedResultTree.value;
    const resultCurrent = resultTree === undefined || relativePath === undefined ? undefined : locateFile(resultTree, relativePath).current;
    const resultEntries = selectedResultEntries.value; const resultDirectories = selectedResultDirectories.value;
    const view = tree === undefined ? undefined : {
        root: treeRootOf(tree.root), expanded: tree.expanded,
        onToggle: (entry: TreeEntry) => { toggle(paneId, parentOf(tree, entry.path), entry.path, tree.expanded); },
        onOpen: (entry: TreeEntry) => { onOpen(fileAddressFor(sessionId, tree.root, entry.path)); },
        canOpen: (entry: TreeEntry) => canOpen(fileAddressFor(sessionId, tree.root, entry.path)),
        rowTriggerProps: (entry: TreeEntry, kind: 'file' | 'directory') => getTriggerProps(kind === 'directory' ? { kind, value: { sessionId, path: entry.path } } : { kind, value: { sessionId, path: entry.path, paneId } }),
    };
    const resultView = view === undefined || resultTree === undefined ? undefined : { ...view, expanded: resultTree.expanded, onToggle: (entry: TreeEntry) => { toggleSearch(paneId, entry.path); } };
    const closeSettings = (rules: readonly ExclusionRule[], refocus: boolean): void => {
        setDraft(undefined); if (refocus) trigger.value?.focus();
        if (cwd !== undefined && rules !== preferences.rules) setSearchPreferences(cwd, { rules });
    };
    if (cwd === undefined || !open)
        return null;
    const geometry = navigatorGeometry(rowWidth, state?.width ?? DEFAULT_NAVIGATOR_WIDTH);
    // The page's tree always fills the page; a preview's follows its row.
    const shown = page ? undefined : mode;
    const clamp = (next: number): number => Math.min(Math.max(next, geometry.minimum), geometry.maximum);
    const clear = (): void => {
        setQuery(paneId, cwd, '');
        input.value?.focus();
    };
    return (h("aside", {
        "ref": navigatorRefFor(paneId),
        "class": clsx(css.navigator, shown === undefined ? css.wholePage : css[shown], dragging && css.dragging),
        "style": page ? undefined : { '--files-navigator-width': `${geometry.width}px` } as CSSProperties,
        "aria-label": t('guide.title'),
        "data-files-navigator": paneId,
        "data-files-navigator-mode": shown,
        "data-files-state": "tree",
        "data-files-root": cwd,
        "onKeydown": (event: KeyboardEvent) => {
            moveAlongRows(event);
            // A settings panel keeps its own Escape; a menu or anything else that prevented it keeps it too.
            if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || query === '')
                return;
            event.preventDefault();
            event.stopPropagation();
            if (!searchBarOpen && event.currentTarget instanceof HTMLElement)
                event.currentTarget.querySelector<HTMLElement>('[data-files-body]')?.focus();
            clear();
        }
    }, [
        shown !== undefined && shown !== 'fill' && (h("div", {
            "class": css.separator,
            "role": "separator",
            "aria-orientation": "vertical",
            "aria-label": t('navigator.resize'),
            "aria-valuemin": geometry.minimum,
            "aria-valuemax": geometry.maximum,
            "aria-valuenow": geometry.width,
            "tabindex": 0,
            "data-files-navigator-resize": "",
            "onKeydown": (event: KeyboardEvent) => {
                const next = event.key === 'ArrowLeft' ? geometry.width + RESIZE_STEP
                    : event.key === 'ArrowRight' ? geometry.width - RESIZE_STEP
                        : event.key === 'Home' ? geometry.minimum
                            : event.key === 'End' ? geometry.maximum
                                : undefined;
                if (next === undefined)
                    return;
                event.preventDefault();
                actions.resized(paneId, clamp(next));
            },
            "onPointerdown": (event: PointerEvent) => {
                // Only the primary button drags; a secondary press leaves the context menu to the browser.
                if (event.button !== 0)
                    return;
                event.preventDefault();
                if (event.currentTarget instanceof HTMLElement) event.currentTarget.setPointerCapture(event.pointerId);
                drag.value = { x: event.clientX, width: geometry.width };
                setDragging(true);
            },
            "onPointermove": (event: PointerEvent) => {
                const origin = drag.value;
                if (origin === undefined)
                    return;
                actions.resized(paneId, clamp(origin.width + origin.x - event.clientX));
            },
            "onPointerup": (event: PointerEvent) => {
                if (event.currentTarget instanceof HTMLElement) event.currentTarget.releasePointerCapture(event.pointerId);
            },
            "onLostpointercapture": () => {
                drag.value = undefined;
                setDragging(false);
            }
        }, [])),
        searchBarOpen && h("div", {
            "class": css.searchBar
        }, [
            h("div", {
                "class": css.searchField
            }, [
                h(Tooltip, {
                    "label": t('search.settings'),
                    "side": "bottom",
                    "portal": true
                }, {
                    "default": () => [
                        h("button", {
                            "ref": trigger,
                            "type": "button",
                            "class": clsx(css.tool, css.searchTool),
                            "aria-label": t('search.settings'),
                            "aria-haspopup": "dialog",
                            "aria-expanded": settings,
                            "data-files-search-settings-toggle": "",
                            "onMousedown": (event: MouseEvent) => { if (settings)
                                event.preventDefault(); },
                            "onClick": () => {
                                if (draft === undefined)
                                    setDraft(preferences.rules);
                                else
                                    closeSettings(draft, true);
                            }
                        }, [
                            h(IconSearchOutlineRegular, null, {
                                "default": () => []
                            })
                        ])
                    ]
                }),
                h("input", {
                    "ref": inputRef,
                    "class": css.searchInput,
                    "type": "search",
                    "value": query,
                    "placeholder": t('search.placeholder'),
                    "aria-label": t('search.placeholder'),
                    "autocomplete": "off",
                    "spellcheck": false,
                    "data-files-search": "",
                    "onInput": (event: Event) => { if (event.target instanceof HTMLInputElement) setQuery(paneId, cwd, event.target.value); }
                }, []),
                h(Tooltip, {
                    "label": t('search.showHidden'),
                    "side": "bottom",
                    "portal": true
                }, {
                    "default": () => [
                        h("button", {
                            "type": "button",
                            "class": clsx(css.tool, css.searchTool),
                            "aria-pressed": preferences.showHidden,
                            "aria-label": t('search.showHidden'),
                            "data-files-show-hidden": "",
                            "onClick": () => { setSearchPreferences(cwd, { showHidden: !preferences.showHidden }); }
                        }, [
                            preferences.showHidden ? h(IconEyeOutlineRegular, null, {
                                "default": () => []
                            }) : h(IconEyeOffOutlineRegular, null, {
                                "default": () => []
                            })
                        ])
                    ]
                }),
                query !== '' && (h(Tooltip, {
                    "label": t('search.clear'),
                    "side": "bottom",
                    "portal": true
                }, {
                    "default": () => [
                        h("button", {
                            "type": "button",
                            "class": clsx(css.tool, css.searchTool),
                            "aria-label": t('search.clear'),
                            "data-files-search-clear": "",
                            "onClick": clear
                        }, [
                            h(IconCloseOutlineRegular, null, {
                                "default": () => []
                            })
                        ])
                    ]
                }))
            ])
        ]),
        h("p", {
            "class": clsx(css.searchStatus, search === undefined && css.searchStatusIdle),
            "aria-live": "polite",
            "data-files-search-status": ""
        }, [
            found !== undefined && h("span", {
                "class": css.searchStatusLine
            }, [
                t('search.results', { count: String(found.count) })
            ]),
            pending && h(StateDot, {
                "state": "ongoing",
                "size": 12,
                "class": css.searchSpinner
            }, {
                "default": () => []
            })
        ]),
        h("div", {
            "ref": bodyRef,
            "class": css.body,
            "tabindex": -1,
            "data-files-body": "",
            "data-files-view": resultsShown ? 'search' : 'tree',
            "aria-busy": pending,
            "onScroll": (event: Event) => { if (event.currentTarget instanceof HTMLElement) scrolled(paneId, event.currentTarget.scrollTop); }
        }, [
            view === undefined || entries === undefined || directories === undefined
                ? h("p", {
                    "class": css.note,
                    "data-files-row": "loading"
                }, [
                    t('loading')
                ]) : search !== undefined
                ? result?.kind === 'failed'
                    ? h(SearchFailure, {
                        "failure": result.failure,
                        "onRetry": () => { retrySearch(paneId); },
                        "t": t
                    }, {
                        "default": () => []
                    }) : found !== undefined && (h(Fragment, null, [
                    resultView !== undefined && resultEntries !== undefined && resultDirectories !== undefined
                        && renderFactorySlot('sidebar.files.tree', {
                            ...resultView, entries: resultEntries, directories: resultDirectories, highlight: found.query,
                            current: resultCurrent, currentRef,
                        }),
                    h(SearchNotes, {
                        "result": found,
                        "t": t
                    }, {
                        "default": () => []
                    })
                ]))
                : renderFactorySlot('sidebar.files.tree', { ...view, entries, directories, current: location?.current, currentRef })
        ]),
        searchBarOpen && draft !== undefined && (h(SearchSettings, {
            "rules": draft,
            "trigger": trigger,
            "onChange": setDraft,
            "respectGitignore": preferences.respectGitignore,
            "onRespectGitignore": (respectGitignore: boolean) => { setSearchPreferences(cwd, { respectGitignore }); },
            "onClose": (refocus: boolean) => { closeSettings(draft, refocus); },
            "t": t
        }, {
            "default": () => []
        }))
    ]));
    };
}, { name: 'FileNavigator', props: ['useTabInfo', 'page', 'onOpen', 'sessionId', 'useSessions', 'useStore', 'actions', 'useRowWidth', 'useCanOpen', 'useSearchPreferences', 'attach', 'placeBeside', 'hold', 'toggle', 'scrolled', 'bodyDrawn', 'currentDrawn', 'navigatorDrawn', 'setQuery', 'toggleSearch', 'retrySearch', 'setSearchPreferences', 'searchDrawn', 't', 'renderFactorySlot', 'useContextMenu'], inheritAttrs: false });
