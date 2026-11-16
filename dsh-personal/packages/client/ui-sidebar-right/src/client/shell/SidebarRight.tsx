import { h, Fragment, defineComponent, computed, shallowRef, ref, watch, watchEffect } from 'vue'
import type { CSSProperties, VNodeChild, ShallowRef } from 'vue'
/**
 * The Sidebar's seat in the frame, and the panel it draws.
 *
 * The frame owns the right column's geometry; this package owns one content
 * tree at the column width or spanning the viewport. A shown wide panel
 * retains its track in fullscreen, preserving the conversation width. Below
 * 768px fullscreen is derived from viewport width, without changing manual mode.
 *
 * Docked content stays mounted while collapsed, translated off the frame's right
 * edge, so opening and closing are one gesture in both presentations: a slide
 * from and to that edge. An item mounted by the opening, such as the first tab
 * of an empty column, starts at that edge, so it joins the slide. Normal
 * presentation moves the frame's tracks with the panel. A fullscreen opening
 * reserves its underlying track only after the panel covers the frame, without
 * animating those hidden columns.
 *
 * The panel has no header of its own: its two controls — presentation switch
 * and collapse — ride the docking kit's chrome seat at the end of the top-right
 * pane's tab strip, so the strip is the panel's whole top edge. The way back in
 * while collapsed is not here either: it is one button in the conversation
 * header (`ExpandButton.tsx`), because it exists only while this panel is
 * hidden. Floating panels remain in the same content tree; untransformed
 * ancestors let their fixed-position frames cross the column and conversation.
 *
 * Tab bodies do not live here. Each one is a registration under its type's kind,
 * dispatched through the keyed `sidebar.right.pane.tab` seat (and a live chip
 * title through `sidebar.right.pane.tab.title`), so a new tab type needs no edit
 * to this file. What a body receives beyond the record — navigation, lifetime
 * signal, actions — is read through the slot-owned useTabInfo hook. The Tab
 * domain follows each session's store commits, including sessions off screen.
 */
import type { ContextMenuTarget } from '@deepseek-ai/dsh-client-ui-context-menu/client';
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client';
import { IconPanelLeftOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore, } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '../contract/slots.ts';
import type { DockIntents, DockMode, DockSurfaceProps, FloatRect, TabId, TabRecord, TabRenderer } from '@deepseek-ai/dsh-client-ui-dockkit';
import { canSplit, dockPaneIds, DockLayout, findPaneContentTab } from '@deepseek-ai/dsh-client-ui-dockkit';
import type { HalvesFit, LayoutState, PaneId } from '@deepseek-ai/dsh-client-ui-dockkit';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { GUIDE_KIND, pageAddress } from '../contract/seed.ts';
import { dockLabels } from '../labels.ts';
import type { SidebarRightFlash, SidebarRightOpenTabOptions } from '../service.ts';
import type { SidebarRightTabDefinition } from '../tab-registry.ts';
import type { createSidebarRightStore, SurfaceState } from '../stores.ts';
import { canCloseTab } from '../stores.ts';
import type { TabOccurrence } from '../tab-domain.ts';
import type { SidebarRightTabNavigation } from '../contract/slots.ts';
import type { TabHookContext } from '../tab-info.ts';
import { flashPane } from './flash.ts';
import css from './SidebarRight.module.css';
/** The store share the seat receives. */
type Store = PropsStore<ReturnType<typeof createSidebarRightStore>>;
/** The child seats this component renders. */
type Children = PropsRenderSlots<'sidebar.right.pane.tab' | 'sidebar.right.pane.tab.title'>;
/** What the panel reports to the frame: drawn or not, and whether it wants a track. */
export interface SidebarRightPresentation {
    /** Whether the panel is drawn at all. */
    readonly shown: boolean;
    /** Whether the drawn panel wants the conversation to make room for it. */
    readonly track: boolean;
    /** Whether the panel fills the viewport, independently of its retained track. */
    readonly fullscreen: boolean;
}
/** What this package needs from its host beyond the framework shares. */
export interface SidebarRightInjected {
    /**
     * Report the panel's presentation to the frame.
     *
     * The frame sizes the track and places the resize handle; this only tells it
     * the composition of the facts this package owns, and is called whenever that
     * composition changes.
     */
    readonly syncPresentation: (presentation: SidebarRightPresentation) => void;
    /**
     * Record this seat's room rule for `ctx.sidebarRight`'s splits, replacing its previous one.
     *
     * The docking kit measures its panes after it renders; the seat forwards each
     * reading, and the service applies it when it splits this seat's Session.
     * @param canSplitPane - whether two working halves of a docked pane would fit; unmeasured panes fit.
     */
    readonly measureRoom: (canSplitPane: (paneId: PaneId) => boolean) => void;
    /**
     * Record whether the frame width this seat renders at presents an expanded panel fullscreen automatically.
     *
     * The fullscreen command reads the latest report: while it holds, the command
     * closes the panel instead of switching its recorded mode.
     * @param autoFullscreen - whether the frame is narrower than the automatic fullscreen width.
     */
    readonly reportAutoFullscreen: (autoFullscreen: boolean) => void;
    /**
     * The navigation face's `openTab`, for the strip's add control: a new tab is
     * the guide opened by kind, through the same path as every other open.
     */
    readonly openTab: (kind: string, options?: SidebarRightOpenTabOptions) => void;
    /** Close through the resource owner's cleanup handler. */
    readonly closeTab: (tabId: TabId) => void;
    /** Split through the same controller as keyboard commands. */
    readonly splitPane: (paneId: PaneId) => void;
    /** Toggle the dock panel using its current display mode. */
    readonly toggleFullscreen: () => void;
    readonly hooks: {
        readonly contextMenuTarget: HostObservable<ContextMenuTarget | null>;
        readonly shortcuts: HostObservable<readonly ShortcutCatalogEntry[]>;
        readonly tabTypes: HostObservable<readonly SidebarRightTabDefinition[]>;
        /** This Session's latest request to make the pane holding a revealed tab glow. */
        readonly flash: HostObservable<SidebarRightFlash | undefined>;
    };
    readonly keyedHooks: {
        readonly tabNavigation: (key: string) => HostObservable<SidebarRightTabNavigation>;
    };
    /** Read a committed record's lifetime; never creates an occurrence. */
    readonly occurrence: (tab: Pick<TabRecord, 'id'>) => TabOccurrence;
}
/** The column seat's props: session scope, so the session arrives as a standard prop. */
export type RightbarSeatProps = PropsRuntime<'rightbar.session'> & Children & Store & PropsLocale<'sidebarRight'> & InjectFace<SidebarRightInjected>;
/** Everything the panel needs, already bound to one session. */
interface PanelProps {
    readonly sessionId: SessionId;
    readonly surface: SurfaceState;
    readonly actions: Store['actions'];
    readonly t: RightbarSeatProps['t'];
    readonly renderSlot: Children['renderSlot'];
    readonly openTab: SidebarRightInjected['openTab'];
    readonly closeTab: SidebarRightInjected['closeTab'];
    readonly getTabTriggerProps: NonNullable<DockSurfaceProps['getTabTriggerProps']>;
    readonly tabMenuOpen: boolean;
    readonly splitPane: SidebarRightInjected['splitPane'];
    readonly toggleFullscreen: SidebarRightInjected['toggleFullscreen'];
    readonly shortcuts: readonly ShortcutCatalogEntry[];
    readonly useTabTypes: RightbarSeatProps['useTabTypes'];
    readonly useTabNavigation: RightbarSeatProps['useTabNavigation'];
    readonly useStore: Store['useStore'];
    readonly useFlash: RightbarSeatProps['useFlash'];
    readonly occurrence: SidebarRightInjected['occurrence'];
    readonly fullscreen: boolean;
    readonly autoFullscreen: boolean;
    readonly active: boolean;
    readonly retainTab: RightbarSeatProps['retainTab'];
    /** Receives the kit's room-rule readings for the service's `split`. */
    readonly reportRoom: (fits: ReadonlyMap<PaneId, HalvesFit>) => void;
}
/** The guide tab one pane holds, if any: a pane holds at most one. */
function guideIn(layout: LayoutState, paneId: PaneId): TabId | undefined {
    return findPaneContentTab(layout, paneId, pageAddress(GUIDE_KIND), GUIDE_KIND);
}
/**
 * Build the kit's intent face for one session out of the store's actions.
 * @param sessionId - the session the seat draws; every action is bound to it.
 * @param actions - the seat's bound store actions.
 * @param openTab - the navigation face's `openTab`, which the strip's add control asks for a guide through.
 * @returns the intents the kit reports gestures to.
 */
export function intentsFor(sessionId: SessionId, actions: Store['actions'], openTab: PanelProps['openTab'], closeTab?: PanelProps['closeTab'], splitPane?: PanelProps['splitPane']): DockIntents {
    return {
        focusTab: (tabId) => { actions.focusTab(sessionId, tabId); },
        focusPane: (paneId) => { actions.focusPane(sessionId, paneId); },
        splitPane: splitPane ?? ((paneId) => { actions.splitPane(sessionId, paneId); }),
        // The guide is unique per pane: the control is drawn only while its pane
        // holds none (`canAddTab` below) and asks for one there without regard to
        // guides in other panes; the store settles the open on a guide the pane
        // already holds, so the ask is idempotent all the same.
        addTab: (paneId) => { openTab(GUIDE_KIND, { paneId, revealIfOpened: false }); },
        closeTab: closeTab ?? ((tabId) => { actions.closeTab(sessionId, tabId); }),
        duplicateTab: (tabId) => { actions.duplicateTab(sessionId, tabId); },
        floatTab: (tabId, rect?: FloatRect) => { actions.floatTab(sessionId, tabId, rect); },
        unfloatPane: (paneId) => { actions.unfloatPane(sessionId, paneId); },
        placeTab: (tabId, toPaneId, index) => { actions.placeTab(sessionId, tabId, toPaneId, index); },
        dropTab: (tabId, paneId, zone) => { actions.dropTab(sessionId, tabId, paneId, zone); },
        moveFloat: (paneId, x, y) => { actions.moveFloat(sessionId, paneId, x, y); },
        resizeFloat: (paneId, rect) => { actions.resizeFloat(sessionId, paneId, rect); },
        resizeSplit: (splitId, sizes) => { actions.resizeSplit(sessionId, splitId, sizes); },
    };
}
/** One tab's slot dispatch: which seat, and what to render when no type registered. */
interface TabSlotProps extends Pick<PanelProps, 'renderSlot' | 'occurrence' | 'useTabTypes' | 'useTabNavigation' | 'useStore' | 'fullscreen' | 'active' | 'retainTab' | 'shortcuts'> {
    readonly tab: TabRecord;
    readonly recordOccurrence: TabOccurrence;
    readonly seat: 'sidebar.right.pane.tab' | 'sidebar.right.pane.tab.title';
    readonly fallback: VNodeChild;
}
/**
 * Dispatch one tab's body or title with stable framework hooks and record lifetime.
 */
const TabSlot = defineComponent((props: TabSlotProps) => {
  const occurrence = computed(() => props.recordOccurrence)
  const definition = props.useTabTypes(types => types.find(definition => definition.kind === props.tab.kind))
  watchEffect(onCleanup => {
    if (props.seat === 'sidebar.right.pane.tab' && definition.value?.keepMounted === true)
      onCleanup(props.retainTab(props.tab.id, occurrence.value.signal))
  })
  const hookContext = computed((): TabHookContext => ({
    tabId: props.tab.id, shortcuts: props.shortcuts, title: props.seat === 'sidebar.right.pane.tab.title',
    fullscreen: props.fullscreen, active: props.active, signal: occurrence.value.signal,
    actions: occurrence.value.tabActions, useStore: props.useStore, useTabNavigation: props.useTabNavigation,
  }))
  return () => h(props.seat === 'sidebar.right.pane.tab.title' ? 'span' : 'div', {
    key: occurrence.value.id, class: props.seat === 'sidebar.right.pane.tab.title' ? css.tabTitle : css.tabBody,
    'data-sidebar-right-tab': props.tab.id, 'data-sidebar-right-occurrence': occurrence.value.id,
  }, [props.renderSlot(props.seat, {}, { entryKey: definition.value?.id ?? props.tab.kind,
    fallback: props.fallback, hookContext: hookContext.value })])
}, { name: 'SidebarTabSlot', props: ['renderSlot', 'occurrence', 'useTabTypes', 'useTabNavigation', 'useStore', 'fullscreen', 'shortcuts', 'active', 'retainTab', 'tab', 'recordOccurrence', 'seat', 'fallback'], inheritAttrs: false })
/**
 * Dispatch a tab's body to its registered type.
 *
 * A kind with no registrant is a real state, not a defect: a session log can
 * carry a tab whose type shipped in a plugin that is no longer mounted. Saying so
 * is better than an empty pane.
 */
function bodiesFor(panel: PanelProps): TabRenderer {
    const { t, ...rest } = panel;
    // Slot dispatch selects a type; the record key separates bodies of that type.
    return tab => (h(TabSlot, {
        "key": tab.id,
        ...rest,
        "tab": tab,
        "recordOccurrence": panel.occurrence(tab),
        "seat": "sidebar.right.pane.tab",
        "fallback": h("p", {
            "class": css.unavailable,
            "data-sidebar-right-unavailable": ""
        }, [
            t('tab.unavailable')
        ])
    }, {
        "default": () => []
    }));
}
/** Dispatch a tab's title to its registered type; without one the chip shows the title captured at open time. */
function titlesFor(panel: PanelProps): TabRenderer {
    return tab => h(TabSlot, {
        "key": tab.id,
        ...panel,
        "tab": tab,
        "recordOccurrence": panel.occurrence(tab),
        "seat": "sidebar.right.pane.tab.title",
        "fallback": tab.title
    }, {
        "default": () => []
    });
}
/** Expand-to-viewport glyph from the shared product artwork. */
function FullscreenGlyph(): VNodeChild {
    return (h("svg", {
        "width": "16",
        "height": "16",
        "viewBox": "0 0 16 16",
        "fill": "none",
        "aria-hidden": "true"
    }, [
        h("path", {
            "d": "M2.33203 10.4054V13.1681C2.33229 13.444 2.55605 13.6681 2.83203 13.6681H5.49512V14.6681H2.83203C2.00376 14.6681 1.33229 13.9963 1.33203 13.1681V10.4054H2.33203ZM14.6689 13.1681C14.6687 13.996 13.9968 14.6676 13.1689 14.6681H10.4951V13.6681H13.1689C13.4445 13.6676 13.6687 13.4437 13.6689 13.1681V10.4054H14.6689V13.1681ZM13.1689 1.33118C13.9969 1.33163 14.6688 2.00315 14.6689 2.83118V5.4054H13.6689V2.83118C13.6688 2.55544 13.4446 2.33162 13.1689 2.33118H10.4951V1.33118H13.1689ZM5.49512 2.33118H2.83203C2.55598 2.33118 2.33218 2.55516 2.33203 2.83118V5.4054H1.33203V2.83118C1.33218 2.00288 2.00369 1.33118 2.83203 1.33118H5.49512V2.33118Z",
            "fill": "currentColor"
        }, [])
    ]));
}
/** Restore-from-fullscreen glyph from the shared product artwork. */
function ExitFullscreenGlyph(): VNodeChild {
    return (h("svg", {
        "width": "16",
        "height": "16",
        "viewBox": "0 0 16 16",
        "fill": "none",
        "aria-hidden": "true"
    }, [
        h("path", {
            "d": "M9 2.5V6C9 6.26522 9.10536 6.51957 9.29289 6.70711C9.48043 6.89464 9.73478 7 10 7H13.5",
            "stroke": "currentColor"
        }, []),
        h("path", {
            "d": "M7 13.5V10C7 9.73478 6.89464 9.48043 6.70711 9.29289C6.51957 9.10536 6.26522 9 6 9H2.5",
            "stroke": "currentColor"
        }, [])
    ]));
}
/** The panel's two controls, placed by the kit at the top-right pane's strip end. */
function PanelChrome({ sessionId, fullscreen, actions, t, shortcuts, toggleFullscreen }: Pick<PanelProps, 'sessionId' | 'actions' | 't' | 'fullscreen' | 'shortcuts' | 'toggleFullscreen'>): VNodeChild {
    const next: DockMode = fullscreen ? 'push' : 'fullscreen';
    const modeLabel = fullscreen ? t('chrome.exitFullscreen') : t('chrome.toFullscreen');
    const mode = shortcuts.find(entry => entry.id === 'pane.fullscreen.toggle');
    const toggle = shortcuts.find(entry => entry.id === 'sidebar.right.toggle');
    return (h(Fragment, null, [
        h(Tooltip, {
            "label": modeLabel,
            ...(mode === undefined ? {} : { shortcutKeys: mode.keys }),
            "side": "bottom",
            "delayMs": 500
        }, {
            "default": () => [
                h("button", {
                    "type": "button",
                    "class": css.iconButton,
                    "aria-label": modeLabel,
                    "aria-keyshortcuts": mode?.aria,
                    "data-sidebar-right-mode": next,
                    "onClick": toggleFullscreen
                }, [
                    fullscreen ? h(ExitFullscreenGlyph, null, {
                        "default": () => []
                    }) : h(FullscreenGlyph, null, {
                        "default": () => []
                    })
                ])
            ]
        }),
        h(Tooltip, {
            "label": t('chrome.collapse'),
            ...(toggle === undefined ? {} : { shortcutKeys: toggle.keys }),
            "side": "bottom",
            "delayMs": 500
        }, {
            "default": () => [
                h("button", {
                    "type": "button",
                    "class": css.iconButton,
                    "aria-label": t('chrome.collapseAria'),
                    "aria-keyshortcuts": toggle?.aria,
                    "data-sidebar-right-toggle": "",
                    "onClick": () => { actions.toggleExpanded(sessionId); }
                }, [
                    h(IconPanelLeftOutlineRegular, {
                        "class": css.collapseGlyph
                    }, {
                        "default": () => []
                    })
                ])
            ]
        })
    ]));
}
/**
 * The panel: the docked surface with the two controls in its top-right strip,
 * anchored to the frame's right edge and slid off it while collapsed.
 */
const SidebarPanel = defineComponent((panel: PanelProps & { width: number; panelRef: ShallowRef<HTMLDivElement | null> }) => {
  const types = panel.useTabTypes(value => value)
  const flash = panel.useFlash(value => value)
  let played = flash.value?.serial
  watchEffect(onCleanup => {
    const request = flash.value
    if (request === undefined || request.serial === played) return
    played = request.serial
    if (panel.active) { const release = flashPane(panel.panelRef.value, request); if (release !== undefined) onCleanup(release) }
  }, { flush: 'post' })
  const opening = ref(false)
  watch(() => [panel.surface.layout.expanded, panel.active] as const, ([expanded, active], [previous]) => {
    if (expanded !== previous) opening.value = expanded && active
    else if (!active) opening.value = false
  }, { flush: 'sync' })
  return () => {
    const { sessionId, surface, actions, t, openTab, width, reportRoom, fullscreen, panelRef } = panel
    const { expanded } = surface.layout
    return (h("div", {
        "ref": panelRef,
        "class": css.panel,
        "style": { width: fullscreen ? 'calc(100vw + 1px)' : `${width}px`,
            '--dsh-sidebar-width': fullscreen ? 'calc(100vw + 1px)' : `${width}px` } as CSSProperties,
        "data-sidebar-right-session": sessionId,
        "data-sidebar-right-panel": fullscreen ? 'fullscreen' : 'push',
        "data-sidebar-right-open": expanded ? '' : undefined,
        "data-sidebar-right-opening": opening.value ? '' : undefined,
        "onTransitionend": opening.value ? () => { opening.value = false; } : undefined,
        "aria-hidden": (!expanded && surface.layout.floats.length === 0) || undefined
    }, [
        h("div", {
            "class": css.panelBody
        }, [
            h(DockLayout, {
                "state": surface.layout,
                "canSplit": canSplit(surface.layout) && dockPaneIds(surface.layout).length < 2,
                "dropZones": "horizontal",
                "minPaneFraction": 0.2,
                "canAddTab": paneId => guideIn(surface.layout, paneId) === undefined,
                "canCloseTab": tabId => canCloseTab(surface, tabId),
                "intents": intentsFor(sessionId, actions, openTab, panel.closeTab, panel.splitPane),
                "labels": dockLabels(t, panel.shortcuts.find(entry => entry.id === 'pane.split'), panel.shortcuts.find(entry => entry.id === 'page.close')),
                "renderTab": bodiesFor(panel),
                "renderTabTitle": titlesFor(panel),
                "active": panel.active,
                "keepMounted": tab => types.value.find(type => type.kind === tab.kind)?.keepMounted === true,
                "getTabTriggerProps": panel.getTabTriggerProps,
                "tabMenuOpen": panel.tabMenuOpen,
                "chrome": h(PanelChrome, {
                    "sessionId": sessionId,
                    "fullscreen": fullscreen,
                    "actions": actions,
                    "t": t,
                    "shortcuts": panel.shortcuts,
                    "toggleFullscreen": panel.toggleFullscreen
                }, {
                    "default": () => []
                }),
                "onRoom": reportRoom
            }, {
                "default": () => []
            })
        ])
    ]));

  }
}, { name: 'SidebarPanel', props: ['sessionId', 'surface', 'actions', 't', 'renderSlot', 'openTab', 'closeTab', 'getTabTriggerProps', 'tabMenuOpen', 'splitPane', 'toggleFullscreen', 'shortcuts', 'useTabTypes', 'useTabNavigation', 'useStore', 'useFlash', 'occurrence', 'fullscreen', 'autoFullscreen', 'active', 'retainTab', 'reportRoom', 'width', 'panelRef'], inheritAttrs: false })
/**
 * The right column's occupant: stable tab containers, docked or floating.
 * It is also where the frame learns the panel's presentation, because this is
 * the seat that knows it. `ctx.sidebarRight` names the on-screen Session
 * itself; this seat reports only what it renders with: the room its kit
 * measured and the automatic fullscreen rule of its frame width.
 */
export const RightbarSeat = defineComponent((props: RightbarSeatProps) => {
  const { getTriggerProps } = props.useContextMenu()
  const getTabTriggerProps: PanelProps['getTabTriggerProps'] = (tab, paneId, handlers) =>
    getTriggerProps({ kind: 'tab', value: { sessionId: props.sessionId, tab, paneId } }, handlers)
  const tabMenuOpen = props.useContextMenuTarget(target => target?.kind === 'tab' && target.value.sessionId === props.sessionId)
  const shortcuts = props.useShortcuts(entries => entries)
  const surface = props.useStore(state => state.bySession[props.sessionId])
  const shown = computed(() => props.active && surface.value !== undefined && surface.value.layout.expanded)
  const autoFullscreen = computed(() => props.viewportWidth < 768)
  const fullscreen = computed(() => autoFullscreen.value || surface.value?.layout.mode === 'fullscreen')
  const track = computed(() => shown.value && !autoFullscreen.value)
  const panelRef = shallowRef<HTMLDivElement | null>(null)
  const reportRoom = (fits: ReadonlyMap<PaneId, HalvesFit>): void => {
    props.measureRoom(paneId => fits.get(paneId)?.row !== false)
  }
  watchEffect(() => {
    if (props.active && surface.value === undefined) props.actions.open(props.sessionId)
  })
  watchEffect(() => {
    if (shown.value && !fullscreen.value && !props.canShow) props.actions.setExpanded(props.sessionId, false)
  })
  watchEffect(() => { props.reportAutoFullscreen(autoFullscreen.value) })
  watchEffect(onCleanup => {
    if (!props.active) return
    const presentation = { shown: shown.value, track: track.value, fullscreen: fullscreen.value }
    const element = panelRef.value
    let disposed = false
    onCleanup(() => { disposed = true })
    const reportWhenCovered = (): void => {
      if (disposed) return
      const entering = presentation.shown && presentation.fullscreen
        ? (element as HTMLDivElement).getAnimations({ subtree: true }).filter(animation =>
          'transitionProperty' in animation && animation.transitionProperty === 'transform'
          && animation.playState !== 'finished' && animation.playState !== 'idle') : []
      if (entering.length === 0) { props.syncPresentation(presentation); return }
      void Promise.allSettled(entering.map(animation => animation.finished)).then(reportWhenCovered)
    }
    reportWhenCovered()
  }, { flush: 'post' })
  watchEffect(onCleanup => {
    if (props.active) onCleanup(() => props.syncPresentation({ shown: false, track: false, fullscreen: false }))
  })
  return () => {
    if (surface.value === undefined) return null
    const panel: PanelProps = {
      sessionId: props.sessionId, actions: props.actions, t: props.t, renderSlot: props.renderSlot,
      surface: surface.value, openTab: props.openTab, closeTab: props.closeTab, getTabTriggerProps,
      tabMenuOpen: tabMenuOpen.value, useTabTypes: props.useTabTypes, useTabNavigation: props.useTabNavigation,
      useStore: props.useStore, useFlash: props.useFlash, occurrence: props.occurrence,
      fullscreen: fullscreen.value, autoFullscreen: autoFullscreen.value, reportRoom,
      active: props.active, retainTab: props.retainTab, shortcuts: shortcuts.value,
      splitPane: props.splitPane, toggleFullscreen: props.toggleFullscreen,
    }
    return h(SidebarPanel, { ...panel, width: props.width, panelRef })
  }
}, { name: 'RightbarSeat', props: ['sessionId', 'width', 'viewportWidth', 'canShow', 'useStore', 'actions', 't', 'renderSlot', '__renders', 'syncPresentation', 'measureRoom', 'reportAutoFullscreen', 'openTab', 'closeTab', 'useContextMenu', 'useContextMenuTarget', 'useTabTypes', 'useTabNavigation', 'occurrence', 'retainTab', 'active', 'useShortcuts', 'splitPane', 'toggleFullscreen', 'useFlash', 'useRemoteAccess', 'useSessions', 'useSessionRetainInfo', 'useSessionAccess', 'usePanelInfo'], inheritAttrs: false })
