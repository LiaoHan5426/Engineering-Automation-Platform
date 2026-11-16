/**
 * Sidebar shell: column geometry and global panel navigation.
 * Collapse is a slide plus crossfade:
 * content freezes at its expanded width (inline style) and fades out in place
 * while the sliding column (AppFrame grid tracks) clips it — nothing reflows
 * mid-slide. At settle the wide-only content unmounts and the upper
 * controls enter the 56px rail from the same horizontal offset (one icon each,
 * same top-down order) on one fade that ends with the slide. The bottom-pinned
 * settings control only fades. The workspace/session browsing region between
 * global panel rows and the foot is the `sidebar.workspaces` registrant's,
 * and the foot holds `sidebar.settings` plus `sidebar.footer.action`; the shell
 * hands them the wide flag (plus an expand request callback for the browser).
 * Through the browser's hookContext, the shell also hands it the scroller hook
 * that continues wheel scrolling over the sidebar viewport into its list.
 *
 * The column also owns whether the scroll regions nested in it draw a
 * scrollbar at all: the shell tracks the pointer and rebinds ui-theme's
 * scrollbar indirection away while it is elsewhere, so a list the user is not
 * pointing at carries no bar.
 */
import { computed, defineComponent, h, nextTick, onScopeDispose, ref, shallowRef, watch } from 'vue';
import clsx from 'clsx';
import { FishLogo, IconAppsAddOutlineRegular, IconNewChatOutlineMedium, IconNewChatOutlineRegular, IconPanelLeftOutlineRegular, IconPinFillRegular, focusWithoutRing, isBehindModal, isDarwinDesktop, Menu, ShortcutKeys, Toast, Tooltip, useModalLayer, writeClipboard, } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SidebarPanelActionsOwnerProps, SidebarPanelMetadata, SidebarRootComponentProps, SidebarRootInjected, SidebarSectionHookContext, SidebarSectionOwnerProps, } from './contract/slots.ts';
import { FIXED_PANEL_ID } from './panel-pins.ts';
import { createScrollHandoff } from './scroll-handoff.ts';
import css from './SidebarRoot.module.css';
/** Wide-content unmount delay; matches the 150ms wide-content fade-out. */
const COLLAPSE_SETTLE_MS = 150;
/**
 * How long the column's scrollbars stay drawn after the pointer leaves it.
 * The bar is a pointer affordance here, and hiding it on the leave event
 * itself makes it blink out while the pointer is only crossing the column's
 * edge — on the way to the conversation, or around a portalled menu.
 */
const SCROLLBAR_LINGER_MS = 2000;
/** Format complete-build metadata for the local brand badge. */
function localBuildVersion(): string | undefined {
    const version = process.env.DSH_CLIENT_VERSION;
    if (version === undefined)
        return undefined;
    const commit = process.env.DSH_CLIENT_COMMIT_HASH;
    return version
        + (commit === undefined ? '' : `-${commit}`)
        + (process.env.DSH_CLIENT_GIT_DIRTY === 'true' ? '-dirty' : '');
}
type PanelRowProps = Pick<SidebarPanelMetadata, 'id' | 'label'> & Pick<SidebarSectionOwnerProps, 'wide'> & Pick<PropsRuntime<'sidebar'>, 'usePanelInfo'> & Pick<InjectFace<SidebarRootInjected>, 'selectPanel' | 'trackEntryClick' | 'setPinned'> & {
    readonly unpinLabel: string;
    readonly unpinTooltip: string;
    readonly canUnpin: boolean;
} & PropsRenderFactories;
/** Analytics category of an official panel; other panels are never reported. */
function officialEntry(id: string): 'plugin' | 'cron' | undefined {
    if (id === 'plugins')
        return 'plugin';
    return id === 'schedules' ? 'cron' : undefined;
}
/** Each panel row subscribes only to its own selection state. */
const PanelRow = defineComponent((props: PanelRowProps) => {
 const active = props.usePanelInfo(info => info.activePanelId === props.id)
 return () => { return (h("div", {
    "class": clsx(css.panelEntry, props.wide && css.panelEntryWide, active.value && css.panelEntryActive)
}, [
    h(Tooltip, {
        "label": props.label,
        "delayMs": 500,
        "disabled": props.wide
    }, {
        default: () => [
            h("button", {
                "type": "button",
                "class": css.panelRow,
                "aria-label": props.label,
                "aria-current": active.value ? 'page' : undefined,
                "onClick": () => {
                    const entry = officialEntry(props.id);
                    if (entry !== undefined)
                        props.trackEntryClick({ menu_name: entry, position: 'sidebar' });
                    props.selectPanel(props.id);
                }
            }, [
                h("span", {
                    "class": css.panelGlyph,
                    "aria-hidden": "true"
                }, [
                    props.renderFactorySlot('sidebar.panel.icon', { id: props.id, size: props.wide ? 16 : 18, active: active.value })
                ]),
                props.wide && (h("span", {
                    "class": clsx(css.panelTitle, css.wide)
                }, [
                    props.label
                ]))
            ])
        ]
    }),
    props.wide && props.canUnpin && h(Tooltip, {
        "label": props.unpinTooltip,
        "side": "bottom",
        "align": "end",
        "delayMs": 500,
        "portal": true
    }, {
        default: () => [
            h("button", {
                "type": "button",
                "class": css.panelUnpin,
                "aria-label": props.unpinLabel,
                "onClick": (event: MouseEvent) => {
                    // Unpin is rendered only while this navigation also renders More.
                    const navigation = (event.currentTarget as HTMLElement).closest('nav') as HTMLElement;
                    const more = navigation.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
                    focusWithoutRing(more);
                    props.setPinned(props.id, false);
                }
            }, [
                h(IconPinFillRegular, {
                    "size": 14
                })
            ])
        ]
    })
]));
 }
}, { props: ['id','label','wide','unpinLabel','unpinTooltip','canUnpin','usePanelInfo','selectPanel','setPinned','trackEntryClick','renderFactorySlot'], inheritAttrs: false })

type PanelMoreMenuProps = Pick<SidebarSectionOwnerProps, 'wide'> & Omit<SidebarPanelActionsOwnerProps, 'onDismiss'> & PropsRenderSlots<'sidebar.panellist.actions'> & Pick<InjectFace<SidebarRootInjected>, 'trackEntryClick'> & {
    readonly label: string;
};
/** The panel list's More launcher: a panel-row button whose menu rows come from `sidebar.panellist.actions`. */
const PanelMoreMenu = defineComponent((props: PanelMoreMenuProps) => {
 const open = ref(false)
 const onDismiss = () => { open.value = false }
 return () => h(Menu, { open: open.value, onClose: onDismiss, portal: true, autoFocus: true, className: clsx(css.moreAnchor), listClassName: clsx(css.moreMenu) }, {
  anchor: () => h(Tooltip, { label: props.label, delayMs: 500, disabled: props.wide }, { default: () => h('button', {
   type: 'button', class: css.panelRow, 'aria-label': props.label, 'aria-haspopup': 'menu', 'aria-expanded': open.value,
   onClick: () => { props.trackEntryClick({menu_name: 'more', position: 'sidebar'}); open.value = !open.value },
  }, [h('span', {class: css.panelGlyph, 'aria-hidden': true}, [h(IconAppsAddOutlineRegular,{size: props.wide ? 16 : 18})]),
   props.wide && h('span',{class: clsx(css.panelTitle,css.wide)},props.label)]) }),
  default: () => props.renderSlot('sidebar.panellist.actions', { entries: props.entries, onOpen: props.onOpen, onPinnedChange: props.onPinnedChange, onDismiss }),
 })
}, {props: ['wide','label','entries','onOpen','onPinnedChange','trackEntryClick','renderSlot'], inheritAttrs:false})
/**
 * Render the sidebar column shell.
 * @param props - composed slot props (runtime share + injected callbacks, contract/slots.ts).
 * @returns the sidebar element tree.
 */
export const SidebarRoot = defineComponent((props: SidebarRootComponentProps) => {
 const panels = props.usePanels(snapshot => snapshot)
 const unpinned = props.useEntryPins(ids => ids)
 const activePanelId = props.usePanelInfo(info => info.activePanelId)
 const hasEntryActions = props.useEntryActions(registered => registered)
 const shortcut = props.useShortcuts(rows => rows.find(row => row.id === 'sidebar.left.toggle'))
 const newShortcut = props.useShortcuts(rows => rows.find(row => row.id === 'session.new'))
 const canStartSession = props.useRemoteAccess('session/create')
 const toggleLabel = computed(() => props.collapsed ? props.t('toggle.open') : props.t('toggle.collapse'))
 const settled = ref(props.collapsed)
 watch(() => [props.collapsed, props.drawer] as const, ([collapsed, drawer], _old, onCleanup) => {
  if (drawer || !collapsed) { settled.value = collapsed; return }
  const timer = window.setTimeout(() => { settled.value = true }, COLLAPSE_SETTLE_MS)
  onCleanup(() => window.clearTimeout(timer))
 }, {flush: 'sync'})
 const windowsTitlebar = document.documentElement.hasAttribute('data-windows-titlebar')
 const wide = computed(() => props.drawer || (windowsTitlebar ? !props.collapsed : !props.collapsed || !settled.value))
 const scrollHandoff = createScrollHandoff()
 const sectionScroller = shallowRef(scrollHandoff.useSectionScroller())
 const sectionHookContext: SidebarSectionHookContext = { useSectionScroller: () => sectionScroller }
 const openNewSession = () => { props.trackEntryClick({menu_name:'new_session',position:windowsTitlebar && props.collapsed ? 'titlebar':'sidebar'}); props.startSession() }
 const captionTooltipSide = windowsTitlebar ? 'bottom' : 'right'
 let lastWideWidth = props.width
 let animateRail = !props.collapsed
 const column = shallowRef<HTMLDivElement | null>(null)
 let sidebarFocus: Element | null = null
 useModalLayer(column, () => props.drawer && !props.collapsed, () => props.toggleSidebar())
 // Resolve portaled focus ownership before collapsed content and its menus unmount.
  watch([() => props.drawer, () => props.collapsed], ([drawer, collapsed], _previous, onCleanup) => {
   const owner = column.value
   if (!collapsed || owner === null) return
   const doc = owner.ownerDocument
   const focused = doc.activeElement
   const anchors = owner.querySelectorAll('[aria-controls]')
   const controlled = [sidebarFocus, ...anchors].flatMap(control => control?.getAttribute('aria-controls')?.split(/\s+/) ?? [])
   const menus = controlled.flatMap(id => { const menu = doc.getElementById(id); return menu === null ? [] : [menu] })
   if (sidebarFocus !== focused && !menus.some(menu => menu.contains(focused))) return
   let pending = true
   onCleanup(() => { pending = false })
   // The parent inserts the drawer opener later in this same commit.
   void nextTick(() => {
    if (!pending || !doc.hasFocus() || column.value !== owner || !owner.isConnected || props.drawer !== drawer || props.collapsed !== collapsed) return
    const current = doc.activeElement
    if (current !== focused && current !== doc.body && current !== doc.documentElement
     && !(owner.contains(current) && current?.closest('[inert]') !== null)
     && !menus.some(menu => menu.contains(current))) return
    const opener = drawer ? doc.querySelector<HTMLElement>('[data-sidebar-opener]') : owner.querySelector<HTMLElement>('[data-sidebar-toggle]')
    if (opener !== null && opener.isConnected && opener.closest('[inert], [hidden]') === null && !isBehindModal(opener)) focusWithoutRing(opener, {preventScroll: true})
   })
  }, {flush:'pre'})
 const pointerInside = ref(false)
 let lingerTimer: number | undefined
 const cancelLinger = () => { window.clearTimeout(lingerTimer); lingerTimer = undefined }
 const armLinger = () => { if (lingerTimer !== undefined) return; lingerTimer = window.setTimeout(() => { lingerTimer = undefined; pointerInside.value = false }, SCROLLBAR_LINGER_MS) }
 watch(pointerInside, (inside, _old, onCleanup) => {
  if (!inside) return
  const onMove = (event: PointerEvent) => {
   const rect = column.value?.getBoundingClientRect()
   /* v8 ignore next -- pointer listener is owned by the mounted column. */
   if (rect === undefined) return
   if (event.clientX >= rect.left && event.clientX < rect.right && event.clientY >= rect.top && event.clientY < rect.bottom) cancelLinger()
   else armLinger()
  }
  document.addEventListener('pointermove',onMove)
  onCleanup(() => { document.removeEventListener('pointermove',onMove); cancelLinger() })
 }, {flush:'sync'})
 onScopeDispose(cancelLinger)
 const buildVersion = localBuildVersion()
 const copiedToast = ref<number | null>(null)
 const copyVersion = (version: string) => () => { void writeClipboard(version).then(ok => { if (ok) copiedToast.value = (copiedToast.value ?? 0) + 1 }) }
 const darwinDesktop = isDarwinDesktop()
 return () => {
  if (props.drawer || !props.collapsed) { lastWideWidth = props.width; animateRail = !props.collapsed }
 const toggle = (h(Tooltip, {
    "label": toggleLabel.value,
    ...(shortcut.value === undefined ? {} : { shortcutKeys: shortcut.value.keys }),
    "delayMs": 500,
    "side": captionTooltipSide,
    "portal": props.drawer
}, {
    default: () => [
        h("button", {
            "data-sidebar-toggle": "",
            "data-modal-autofocus": props.drawer || undefined,
            "type": "button",
            "class": clsx(css.iconButton, css.toggle),
            "aria-label": toggleLabel.value,
            "aria-keyshortcuts": shortcut.value?.aria,
            "onClick": () => { props.toggleSidebar(); }
        }, [
            !wide.value && !windowsTitlebar && (h("span", {
                "class": css.railMark,
                "aria-hidden": "true"
            }, [
                props.renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: h(FishLogo, {
                        "size": 24
                    }) })
            ])),
            h(IconPanelLeftOutlineRegular, {
                "class": css.panelIcon,
                "size": wide.value || windowsTitlebar ? 16 : 18
            }),
            !wide.value && props.renderSlot('sidebar.toggle.badge', {})
        ])
    ]
}));
return (h("div", {
    "ref": column,
    "onFocusCapture": (event: FocusEvent) => { sidebarFocus = event.target as Element; },
    "role": props.drawer ? 'dialog' : undefined,
    "data-shortcut-modal": props.drawer ? 'sidebar' : undefined,
    "aria-modal": props.drawer && !props.collapsed ? true : undefined,
    "aria-label": props.drawer ? props.t('navigation.label') : undefined,
    "tabindex": props.drawer ? -1 : undefined,
    "class": clsx(css.root, !wide.value && css.collapsed, !wide.value && animateRail && css.railIn, !props.drawer && props.collapsed && wide.value && css.fading, !pointerInside.value && css.quietBars),
    "style": wide.value ? { width: `${!props.drawer && props.collapsed ? lastWideWidth : props.width}px` } : undefined,
    "onPointerenter": () => {
        cancelLinger();
        pointerInside.value = true;
    },
    "onPointerleave": () => { armLinger(); }
}, [
    darwinDesktop && h("div", {
        "class": css.topStrip,
        "data-window-drag": ""
    }, [
        toggle
    ]),
    h("div", {
        "class": css.logoRow,
        "data-window-drag": ""
    }, [
        wide.value && (() => {
            const identity = (h("span", {
                "class": css.brandIdentity,
                "aria-hidden": "true"
            }, [
                h("span", {
                    "class": css.brandMark
                }, [
                    props.renderSlot('sidebar.brand.mark', { size: 24 }, {
                        fallback: buildVersion === undefined
                            ? h(FishLogo, {
                                "size": 24
                            }) : h("span", {
                            "class": css.copyVersion,
                            "data-copy-version": "",
                            "onClick": copyVersion(buildVersion)
                        }, [
                            h(FishLogo, {
                                "size": 24
                            })
                        ]),
                    })
                ]),
                h("span", {
                    "class": css.brandName
                }, [
                    props.renderSlot('sidebar.brand.name', {}, {
                        fallback: buildVersion === undefined
                            ? h("span", {
                                "class": css.fallbackBrandName
                            }, [
                                props.t('brand.localBuild')
                            ]) : (h("span", {
                            "class": clsx(css.localBuildBrand, css.copyVersion),
                            "data-copy-version": "",
                            "onClick": copyVersion(buildVersion)
                        }, [
                            h("span", {
                                "class": css.localBuildTitle
                            }, [
                                props.t('brand.localBuild')
                            ]),
                            h("span", {
                                "class": css.buildVersion
                            }, [
                                buildVersion
                            ])
                        ])),
                    })
                ])
            ]));
            return darwinDesktop || !canStartSession.value
                ? h("span", {
                    "class": clsx(css.brand, css.wide)
                }, [
                    identity
                ]) : (h("button", {
                "type": "button",
                "class": clsx(css.brand, css.wide),
                "aria-label": props.t('session.new.label'),
                "aria-keyshortcuts": newShortcut.value?.aria,
                "onClick": (event: MouseEvent) => {
                    if ((event.target as Element).closest('[data-copy-version]') !== null)
                        return;
                    openNewSession();
                }
            }, [
                identity
            ]));
        })(),
        !darwinDesktop && toggle
    ]),
    canStartSession.value && (h("div", {
        "class": css.newSessionRow
    }, [
        props.renderSlot('sidebar.session.action', { wide: wide.value }, {
            children: (h(Tooltip, {
                "label": props.t('session.new.label'),
                ...(newShortcut.value === undefined ? {} : { shortcutKeys: newShortcut.value.keys }),
                "delayMs": 500,
                "side": captionTooltipSide,
                "disabled": wide.value
            }, {
                default: () => [
                    h("button", {
                        "type": "button",
                        "class": css.newSession,
                        "aria-label": props.t('session.new.label'),
                        "aria-keyshortcuts": newShortcut.value?.aria,
                        "onClick": openNewSession
                    }, [
                        h("span", {
                            "class": css.newSessionLabelMask
                        }, [
                            h("span", {
                                "class": css.newSessionContent
                            }, [
                                wide.value ? h(IconNewChatOutlineMedium, {
                                    "size": 14
                                }) : h(IconNewChatOutlineRegular, {
                                    "size": windowsTitlebar ? 16 : 18
                                }),
                                wide.value && h("span", {
                                    "class": clsx(css.newSessionLabel, css.wide)
                                }, [
                                    props.t('session.new')
                                ])
                            ])
                        ]),
                        wide.value && newShortcut.value !== undefined && newShortcut.value.keys.length > 0 && h("span", {
                            "class": css.newSessionShortcut,
                            "aria-hidden": "true"
                        }, [
                            h(ShortcutKeys, {
                                "keys": newShortcut.value.keys
                            })
                        ])
                    ])
                ]
            })),
        })
    ])),
    h("div", {
        "class": css.scrollRegion
    }, [
        h("div", {
            "ref": element => scrollHandoff.bindViewportRef(element instanceof HTMLElement ? element : null),
            "class": css.scrollArea,
            "data-sidebar-scrollport": wide.value ? '' : undefined
        }, [
            panels.value.length > 0 && (h("nav", {
                "class": css.panelList,
                "aria-label": props.t('panels.label')
            }, [
                panels.value.filter(({ id }) => id === FIXED_PANEL_ID || !hasEntryActions.value || !unpinned.value.includes(id)).map(({ id, label }) => (h(PanelRow, {
                    "key": id,
                    "id": id,
                    "label": label,
                    "wide": wide.value,
                    "unpinLabel": props.t('panels.unpin', { name: label }),
                    "unpinTooltip": props.t('panels.unpinTooltip'),
                    "canUnpin": hasEntryActions.value && id !== FIXED_PANEL_ID,
                    "setPinned": props.setPinned,
                    "usePanelInfo": props.usePanelInfo,
                    "selectPanel": props.selectPanel,
                    "trackEntryClick": props.trackEntryClick,
                    "renderFactorySlot": props.renderFactorySlot
                }))),
                hasEntryActions.value && (h(PanelMoreMenu, {
                    "wide": wide.value,
                    "label": props.t('panels.more'),
                    "entries": panels.value.filter(({ id }) => id !== FIXED_PANEL_ID)
                        .map(({ id, label }) => ({ id, label, pinned: !unpinned.value.includes(id), active: id === activePanelId.value })),
                    "onOpen": (id: string) => {
                        const entry = officialEntry(id);
                        if (entry !== undefined)
                            props.trackEntryClick({ menu_name: entry, position: 'sidebar_more' });
                        const panel = panels.value.find(candidate => candidate.id === id);
                        if (panel !== undefined)
                            props.selectPanel(panel.id);
                    },
                    "onPinnedChange": props.setPinned,
                    "trackEntryClick": props.trackEntryClick,
                    "renderSlot": props.renderSlot
                }))
            ])),
            h("div", {
                "class": css.regionArea
            }, [
                props.renderSlot('sidebar.workspaces', {
                    wide: wide.value,
                    expandSidebar: () => {
                        if (props.collapsed)
                            props.toggleSidebar();
                    },
                }, { hookContext: sectionHookContext })
            ])
        ]),
        h("span", {
            "class": css.scrollFade,
            "aria-hidden": "true"
        })
    ]),
    copiedToast.value !== null && (h(Toast, {
        "key": copiedToast.value,
        "tone": "success",
        "text": props.t('version.copied'),
        "onDone": () => { copiedToast.value = null; }
    })),
    h("div", {
        "class": css.footArea
    }, [
        h("div", {
            "class": css.footerActions
        }, [
            props.renderSlot('sidebar.footer.action', { wide: wide.value })
        ]),
        h("div", {
            "class": css.settingsArea
        }, [
            props.renderSlot('sidebar.settings', { wide: wide.value })
        ])
    ])
]));

 }
}, { props: ['collapsed','width','drawer','startSession','toggleSidebar','selectPanel','setPinned','trackEntryClick','useRemoteAccess','usePanels','useEntryPins','useEntryActions','useShortcuts','usePanelInfo','t','renderSlot','renderFactorySlot',
'useSessions','useSessionRetainInfo','useSessionAccess',], inheritAttrs:false })
