import { defineComponent, h } from 'vue'
/** Window-chrome controls for the fully hidden sidebar (frame shell.leading seat). */
import { IconNewChatOutlineRegular, IconPanelLeftOutlineRegular, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
// Type-only: pulls the frame's shell.leading slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type { SidebarRootInjected } from './contract/slots.ts';
import css from './HeaderLeadingControls.module.css';
/** Full props of the shell.leading occupant. */
export type HeaderLeadingControlsProps = PropsRuntime<'shell.leading'> & InjectFace<SidebarRootInjected> & PropsLocale<'sidebar'>;
/**
 * Sidebar-open and New Session controls in the frame's window-chrome seat.
 * The frame mounts this seat for hidden sidebars and owns its placement.
 * Web shows only the sidebar opener; Desktop also retains New Session.
 * @param props - Injected sidebar actions, the global access Hook, and the sidebar locale seat.
 * @returns the sidebar toggle, plus New Session on Desktop while access allows `session/create`.
 */
export const HeaderLeadingControls = defineComponent((props: HeaderLeadingControlsProps) => {
    // A page whose access snapshot excludes starting a Session keeps only the sidebar toggle here.
    const canStartSession = props.useRemoteAccess('session/create');
    const desktop = document.documentElement.hasAttribute('data-platform');
    const shortcut = props.useShortcuts(rows => rows.find(row => row.id === 'sidebar.left.toggle'));
    const newShortcut = props.useShortcuts(rows => rows.find(row => row.id === 'session.new'));
return () => (h("div", {
    "class": css.controls
}, [
    h(Tooltip, {
        "label": props.t('toggle.open'),
        ...(shortcut.value === undefined ? {} : { shortcutKeys: shortcut.value.keys }),
        "delayMs": 500
    }, {
        default: () => [
            h("button", {
                "data-sidebar-opener": "",
                "type": "button",
                "class": css.iconButton,
                "aria-label": props.t('toggle.open'),
                "aria-keyshortcuts": shortcut.value?.aria,
                "onClick": () => { props.toggleSidebar(); }
            }, [
                h(IconPanelLeftOutlineRegular, {
                    "size": 16
                })
            ])
        ]
    }),
    desktop && canStartSession.value && (h(Tooltip, {
        "label": props.t('session.new.label'),
        ...(newShortcut.value === undefined ? {} : { shortcutKeys: newShortcut.value.keys }),
        "delayMs": 500
    }, {
        default: () => [
            h("button", {
                "type": "button",
                "class": css.iconButton,
                "aria-label": props.t('session.new.label'),
                "aria-keyshortcuts": newShortcut.value?.aria,
                "onClick": () => {
                    props.trackEntryClick({ menu_name: 'new_session', position: 'titlebar' });
                    props.startSession();
                }
            }, [
                h(IconNewChatOutlineRegular, {
                    "size": 16
                })
            ])
        ]
    }))
]));

}, {props: ['toggleSidebar','startSession','trackEntryClick','useRemoteAccess','useShortcuts','t','useSessions','usePanelInfo','useSessionRetainInfo','useSessionAccess','usePanels','useEntryPins','useEntryActions','selectPanel','setPinned'], inheritAttrs:false})
