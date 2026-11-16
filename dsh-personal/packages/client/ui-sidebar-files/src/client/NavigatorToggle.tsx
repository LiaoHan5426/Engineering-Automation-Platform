/**
 * The navigator's show/hide control, at the end of a document preview's
 * header through its Factory; the `files` page's tree is always
 * shown and has none. It writes the pane's choice, which every file tab of
 * the pane reads, and registers itself with the face, which hands it the
 * keyboard when Escape closes the navigator.
 */
import { computed, defineComponent, h, shallowRef, watchEffect, type ComponentPublicInstance } from 'vue';
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots';
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import { IconFolderCloseRegular, IconFolderOpenRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { FilesInjected } from './face.ts';
import type { createFilesStore } from './store.ts';
import type {} from './locales.ts';
import css from './FilesBody.module.css';
/** The tab whose pane's navigator this control toggles. */
export interface NavigatorToggleInput {
    readonly useTabInfo: UseSidebarRightTabInfo;
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotFactoryMap {
        /** Show or hide the pane's workspace tree; absent without a working directory. */
        'sidebar.files.navigator.toggle': {
            scope: 'session';
            props: NavigatorToggleInput;
            store: ReturnType<typeof createFilesStore>;
            locale: 'sidebarFiles';
            inject: Pick<FilesInjected, 'toggleDrawn'>;
        };
    }
}
/**
 * Show or hide the pane's navigator.
 * @param props - the tab, the pane records, the face's registration, and copy.
 * @returns the toggle, or nothing without a workspace.
 */
export const NavigatorToggle = defineComponent((props: FactoryComponentPropsOf<'sidebar.files.navigator.toggle'>) => {
    const info = props.useTabInfo();
    const selectedCwd = props.useSessions(sessions => sessions.byId[props.sessionId]?.cwd);
    const panes = props.useStore(store => store.byPane);
    const selectedOpen = computed(() => panes.value[info.value.panel.id]?.open);
    const toggleElement = shallowRef<HTMLElement | null>(null);
    const toggleRef = (button: Element | ComponentPublicInstance | null): void => { toggleElement.value = button instanceof HTMLElement ? button : null; };
    watchEffect(onCleanup => {
        const element = toggleElement.value;
        if (element === null) return;
        const paneId = info.value.panel.id;
        props.toggleDrawn(paneId, element);
        onCleanup(() => props.toggleDrawn(paneId, null));
    }, { flush: 'post' });
    return () => {
    const { actions, t } = props;
    const { panel } = info.value;
    const cwd = selectedCwd.value;
    const open = selectedOpen.value === true;
    if (cwd === undefined)
        return null;
    const label = t(open ? 'navigator.hide' : 'navigator.show');
    return (h(Tooltip, {
        "label": label,
        "side": "bottom",
        "delayMs": 500
    }, {
        "default": () => [
            h("button", {
                "ref": toggleRef,
                "type": "button",
                "class": css.tool,
                "aria-label": label,
                "aria-expanded": open,
                "data-files-navigator-toggle": "",
                "onClick": () => { actions.shown(panel.id, !open); }
            }, [
                open ? h(IconFolderOpenRegular, null, {
                    "default": () => []
                }) : h(IconFolderCloseRegular, null, {
                    "default": () => []
                })
            ])
        ]
    }));
    };
}, { name: 'NavigatorToggle', props: ['useTabInfo', 'sessionId', 'useSessions', 'useStore', 'actions', 'toggleDrawn', 't'], inheritAttrs: false });
