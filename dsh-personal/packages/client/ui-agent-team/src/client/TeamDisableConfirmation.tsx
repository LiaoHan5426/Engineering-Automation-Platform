import { defineComponent, Fragment, h, ref } from 'vue';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type { NS } from './locales.ts';
import css from './TeamDisableConfirmation.module.css';
/** The originating Session remains the target while the dialog is open. */
export interface TeamDisableRequest {
    sessionId: SessionId;
}
/** Confirmation request and Session-bound selection callbacks supplied by the plugin. */
export interface TeamDisableConfirmationInjected {
    hooks: {
        disableRequest: HostObservable<TeamDisableRequest | null>;
    };
    cancelDisable: (sessionId: SessionId) => void;
    disableTeam: (sessionId: SessionId) => Promise<string | null>;
}
/** Root overlay props, independent of the model menu lifetime. */
export type TeamDisableConfirmationProps = PropsRuntime<'shell.overlay'> & InjectFace<TeamDisableConfirmationInjected> & PropsLocale<typeof NS>;
/**
 * Render the requested confirmation outside the model menu.
 * @param props - request observation, command callbacks, and localized text.
 * @returns the confirmation, or nothing when no request is pending.
 */
export const TeamDisableConfirmation = defineComponent((props: TeamDisableConfirmationProps) => {
    const request = props.useDisableRequest(value => value);
    return () => {
        if (request.value === null)
            return null;
        return h(DisableConfirmationForm, { "key": request.value.sessionId, "sessionId": request.value.sessionId, ...props });
    };
}, { name: "TeamDisableConfirmation", inheritAttrs: false, props: ["useDisableRequest", "cancelDisable", "disableTeam", "t"] });
const DisableConfirmationForm = defineComponent((props: {
    sessionId: SessionId;
    cancelDisable: TeamDisableConfirmationInjected['cancelDisable'];
    disableTeam: TeamDisableConfirmationInjected['disableTeam'];
    t: TeamDisableConfirmationProps['t'];
}) => {
    const state = ref<{
        kind: 'ready';
    } | {
        kind: 'saving';
    } | {
        kind: 'failed';
        message: string;
    }>({ kind: 'ready' });
    return () => {
        const { sessionId, cancelDisable, disableTeam, t } = props;
        const saving = state.value.kind === 'saving';
        const cancel = (): void => {
            if (state.value.kind !== 'saving')
                cancelDisable(sessionId);
        };
        const confirm = (): void => {
            if (state.value.kind === 'saving')
                return;
            state.value = { kind: 'saving' };
            void disableTeam(sessionId).then((failure) => {
                if (failure === null)
                    cancelDisable(sessionId);
                else
                    state.value = { kind: 'failed', message: failure };
            }, (error: unknown) => {
                state.value = { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
            });
        };
        return (h(Modal, { "open": true, "tone": "warning", "title": t('disable.title'), "closeLabel": t('disable.close'), "onClose": cancel, "className": css.dialog ?? '', "contentClassName": css.content ?? '' }, { footer: () => (h(Fragment, null, [
                h(Button, { "variant": "outline", "disabled": saving, "data-modal-autofocus": true, "onClick": cancel }, { default: () => [
                        t('disable.cancel')
                    ] }),
                h(Button, { "variant": "primary", "disabled": saving, "onClick": confirm }, { default: () => [
                        t('disable.confirm')
                    ] })
            ])), default: () => [
                h("div", { "class": css.copy }, [
                    h("p", null, [
                        t('disable.description')
                    ]),
                    h("p", null, [
                        t('disable.warning')
                    ])
                ]),
                state.value.kind === 'failed' && h("p", { "role": "alert", "class": css.error }, [
                    t('mode.failed', { message: state.value.message })
                ])
            ] }));
    };
}, { name: "DisableConfirmationForm", inheritAttrs: false, props: ["sessionId", "cancelDisable", "disableTeam", "t"] });
