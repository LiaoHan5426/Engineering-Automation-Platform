import { h, defineComponent, ref } from 'vue'
import clsx from 'clsx'
/**
 * The guide tab's body: a chain host, and the guide it falls back to.
 *
 * The chain is the replacement seam. A product with its own idea of what an
 * empty sidebar should say registers into `sidebar.right.tab.guide`, and its entry
 * takes the whole body; with no entry, or with every entry declining, the guide
 * below renders. The shipped guide is the owner's fallback rather than a chain
 * entry of its own, so there is always exactly one body and the shipped one
 * cannot be outvoted by accident.
 *
 * The shipped guide is a muted compass over the pinned entry capsules every
 * registered type contributed, centred in the body, with no heading, as a
 * browser start page shows its doors without a caption. While at most four
 * capsules are visible, a capsule with a description shows it under the title;
 * a longer list drops every description to stay light. A More card follows
 * while `sidebar.right.tab.guide.actions` has registrations.
 * Picking one opens that type as a page
 * in this tab's place, so the guide is a doorway rather than a page that stays
 * open.
 */
import { Menu, ShortcutKeys } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client';
import type { VNodeChild } from 'vue';
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { ChainRenderOpts, HookContextOf, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, } from '@deepseek-ai/dsh-client-ui-slots';
import type { SidebarRightGuideActionsOwnerProps } from '../../contract/slots.ts';
import type { SidebarRightGuideBox } from '../../tab-registry.ts';
import { CompassGlyph, CubeGlyph } from './GuideTitle.tsx';
import { GuideMoreIcon } from './GuideMoreIcon.tsx';
import { FIXED_GUIDE_KIND, guideEntryId } from './guide-pins.ts';
import css from './GuideBody.module.css';
/** What the guide body needs from its host beyond the framework shares. */
export interface GuideInjected {
    /** The registry's guide entries in `order`; observable, so a type registering later appears. */
    readonly hooks: {
        readonly shortcuts: ObservableSnapshot<readonly ShortcutCatalogEntry[]>;
        readonly guideEntries: ObservableSnapshot<readonly SidebarRightGuideBox[]>;
        /** Unpinned `kind:id` card ids held in memory until plugin reload. */
        readonly entryPins: ObservableSnapshot<readonly string[]>;
        /** Whether `sidebar.right.tab.guide.actions` has registrations. */
        readonly entryActions: ObservableSnapshot<boolean>;
    };
    /**
     * Show or unpin one guide card; cards of kind `files` are ignored.
     * @param id - `kind:id` card id.
     * @param pinned - Whether the card shows on the guide.
     */
    readonly setPinned: (id: string, pinned: boolean) => void;
}
/** The guide body's composed props: the tab it draws, its chain child, and the entries. */
export type GuideBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsRenderSlots<'sidebar.right.tab.guide' | 'sidebar.right.tab.guide.entry' | 'sidebar.right.tab.guide.actions'> & InjectFace<GuideInjected> & PropsLocale<'sidebarRight'>;
/** Entry count past which the guide drops the capsules' descriptions to stay light. */
const MAX_DESCRIBED_ENTRIES = 4;
/** One entry capsule: the contributing type's glyph and title, and its description while the guide is short. */
function EntryBox({ entry, described, onPick, shortcut }: {
    shortcut: ShortcutCatalogEntry | undefined;
    entry: SidebarRightGuideBox;
    described: boolean;
    onPick: (entry: SidebarRightGuideBox) => void;
}): VNodeChild {
    const Icon = entry.icon ?? CubeGlyph;
    const description = described ? entry.description?.() : undefined;
    return (h("button", {
        "type": "button",
        "class": css.entry,
        "data-sidebar-right-guide-entry": entry.kind,
        "aria-keyshortcuts": shortcut?.aria,
        "onClick": () => { onPick(entry); }
    }, [
        h("span", {
            "class": css.entryIcon
        }, [
            h(Icon, {
                "size": description === undefined ? 22 : 26,
                "className": clsx(entry.icon === undefined && css.placeholderInk)
            }, {
                "default": () => []
            })
        ]),
        h("span", {
            "class": css.entryText
        }, [
            h("span", {
                "class": css.entryTitle
            }, [
                entry.title()
            ]),
            description !== undefined && h("span", {
                "class": css.entryDescription
            }, [
                description
            ])
        ]),
        shortcut !== undefined && shortcut.keys.length > 0 && h(ShortcutKeys, {
            "keys": shortcut.keys
        }, {
            "default": () => []
        })
    ]));
}
type GuideMoreMenuProps = Omit<SidebarRightGuideActionsOwnerProps, 'onDismiss'> & Pick<GuideBodyProps, 'renderSlot'> & {
    readonly label: string;
};
/** The guide's More card; its menu rows come from `sidebar.right.tab.guide.actions` and span at least the card width. */
const GuideMoreMenu = defineComponent((props: GuideMoreMenuProps) => {
  const open = ref(false)
  const onDismiss = (): void => { open.value = false }
  return () => h(Menu, { open: open.value, onClose: onDismiss, portal: true, autoFocus: true,
    minWidthFromAnchor: true, align: 'end', className: clsx(css.moreAnchor), listClassName: clsx(css.moreMenu) }, {
    anchor: () => h('button', { type: 'button', class: css.entry, 'aria-label': props.label,
      'aria-haspopup': 'menu', 'aria-expanded': open.value, onClick: () => { open.value = !open.value } }, [
      h('span', { class: css.entryIcon }, h(GuideMoreIcon)),
      h('span', { class: css.entryText }, h('span', { class: css.entryTitle }, props.label)),
    ]),
    default: () => props.renderSlot('sidebar.right.tab.guide.actions', { entries: props.entries,
      onOpen: props.onOpen, onPinnedChange: props.onPinnedChange, onDismiss }),
  })
}, { name: 'GuideMoreMenu', props: ['label', 'entries', 'onOpen', 'onPinnedChange', 'renderSlot'], inheritAttrs: false })
/** The shipped guide: the tab's own compass over the doors out of the column. */
const ShippedGuide = defineComponent((_props, { slots }) => () => h('div', { class: css.guide, 'data-sidebar-right-guide': '' }, [
  h('span', { class: css.hero, 'aria-hidden': 'true' }, h(CompassGlyph, { size: 56 })), slots.default?.(),
]))
/** The guide tab's body, replaceable through its chain child. */
export const GuideBody = defineComponent((props: GuideBodyProps) => {
  const shortcuts = props.useShortcuts(entries => entries)
  const info = props.useTabInfo()
  const entries = props.useGuideEntries(entries => entries)
  const unpinned = props.useEntryPins(ids => ids)
  const hasEntryActions = props.useEntryActions(registered => registered)
  return () => {
    const { useTabInfo, renderSlot, renderSlotChain, setPinned, t } = props
    // A new page replaces the guide; a page already in its pane is revealed, and the guide then closes itself.
    const open = (kind: string): void => {
        const actions = info.value.tab.actions;
        actions.openTab(kind, { replaceTab: true });
        actions.close();
    };
    const visibleEntries = entries.value.filter(entry => entry.kind === FIXED_GUIDE_KIND || !unpinned.value.includes(guideEntryId(entry)));
    const options = {
        hookContext: useTabInfo,
        fallback: (h(ShippedGuide, null, {
            "default": () => [
                visibleEntries.map((entry) => {
                    const described = visibleEntries.length <= MAX_DESCRIBED_ENTRIES;
                    const description = described ? entry.description?.() : undefined;
                    return h("div", {
                        "key": JSON.stringify([entry.providerId, entry.id]),
                        "class": css.entryCell
                    }, [
                        renderSlot('sidebar.right.tab.guide.entry', {
                            entryId: entry.id, kind: entry.kind, title: entry.title(),
                            ...description === undefined ? {} : { description },
                        }, {
                            entryKey: entry.providerId, hookContext: useTabInfo,
                            fallback: h(EntryBox, {
                                "entry": entry,
                                "described": described,
                                "shortcut": shortcuts.value.find(shortcut => shortcut.id === entry.commandId),
                                "onPick": (selected) => { open(selected.kind); }
                            }, {
                                "default": () => []
                            }),
                        })
                    ]);
                }),
                hasEntryActions.value && (h(GuideMoreMenu, {
                    "label": t('tab.guide.more'),
                    "entries": entries.value.filter(entry => entry.kind !== FIXED_GUIDE_KIND)
                        .map(entry => ({ id: guideEntryId(entry), label: entry.title(), pinned: !unpinned.value.includes(guideEntryId(entry)) })),
                    "onOpen": (id) => {
                        const entry = entries.value.find(candidate => guideEntryId(candidate) === id);
                        if (entry !== undefined)
                            open(entry.kind);
                    },
                    "onPinnedChange": setPinned,
                    "renderSlot": renderSlot
                }, {
                    "default": () => []
                }))
            ]
        })),
    } satisfies ChainRenderOpts & {
        hookContext: HookContextOf<'sidebar.right.tab.guide'>;
    };
    return renderSlotChain('sidebar.right.tab.guide', {}, options);

  }
}, { name: 'GuideBody', props: ['useTabInfo', 'useGuideEntries', 'renderSlot', 'renderSlotChain', '__renders', 'useShortcuts', 'useEntryPins', 'useEntryActions', 'setPinned', 't', 'useRemoteAccess', 'useSessions', 'useSessionRetainInfo', 'useSessionAccess', 'usePanelInfo'], inheritAttrs: false })
