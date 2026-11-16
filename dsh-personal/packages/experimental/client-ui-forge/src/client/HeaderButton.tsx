/** Session header entry that shows or hides the forge tab and marks change requests that need attention. */
import { defineComponent, h } from 'vue';
import { Button, StateDot, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import { ChangeRequestGlyph } from './glyphs.tsx';
import type { NS } from './locales.ts';
import type { PanelSnapshot } from './source.ts';
import { needsAttention } from './status.ts';
import css from './HeaderButton.module.css';
/** Business face of the header entry. */
export interface HeaderButtonInjected {
    /** Panel snapshot and tab visibility of the Session; the renderer binds them as `usePanel` and `useVisible`. */
    readonly hooks: {
        readonly panel: HostObservable<PanelSnapshot>;
        readonly visible: HostObservable<boolean>;
    };
    /**
     * Hide the forge tab when it is visible, otherwise open or reveal it.
     * @param visible - whether the tab is visible now.
     */
    readonly toggle: (visible: boolean) => void;
}
/** Full props of the header entry. */
export type HeaderButtonProps = InjectFace<HeaderButtonInjected> & PropsLocale<typeof NS>;
/**
 * Show the entry once the Session has bound change requests or its directory
 * is known to be inside a Git checkout: after an inspection found one or
 * failed, or while a later inspection runs for a directory whose repository
 * is already known.
 * @param snapshot - panel snapshot.
 * @returns whether the entry shows.
 */
function shown(snapshot: PanelSnapshot): boolean {
    const state = snapshot.state;
    if (state === null)
        return false;
    return state.changeRequests.length > 0 || state.checkout.state === 'ready' || state.checkout.state === 'failed'
        || (state.checkout.state === 'pending' && state.repository !== null);
}
/**
 * Render the header entry.
 * @param props - panel snapshot and visibility hooks, the toggle, and copy.
 * @returns the entry, or nothing outside a Git checkout without bound change requests.
 */
export const HeaderButton = defineComponent((props: HeaderButtonProps) => {
    const visible = props.usePanel(shown);
    const attention = props.usePanel(snapshot => snapshot.state?.changeRequests.some(needsAttention) === true);
    const pressed = props.useVisible(current => current);
    return () => {
        if (!visible.value)
            return null;
        const label = props.t(attention.value ? 'header.attention' : 'header.label');
        return (h(Tooltip, {
            "label": label,
            "side": "bottom"
        }, {
            default: () => [h(Button, {
                    "size": "sm",
                    "className": css.trigger ?? '',
                    "aria-label": label,
                    "aria-pressed": pressed.value,
                    "data-forge-header": "",
                    "onClick": () => { props.toggle(pressed.value); }
                }, {
                    default: () => [h(ChangeRequestGlyph, {
                            "tone": "open",
                            "tinted": false,
                            "size": 16
                        }), attention.value && h(StateDot, {
                            "state": "error",
                            "size": 6,
                            "className": css.dot ?? ''
                        })]
                })]
        }));
    };
}, { name: 'HeaderButton', inheritAttrs: false, props: ["usePanel", "useVisible", "toggle", "t"] });
