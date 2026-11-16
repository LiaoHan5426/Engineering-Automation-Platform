import { defineComponent, h, ref, useId } from 'vue';
/** Session-owned Agent Teams summary and settings inside the model menu. */
import { IconChevronRightOutlineRegular, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type {} from '@deepseek-ai/dsh-agent-team/client';
import type {} from '@deepseek-ai/dsh-agent';
import type { NS } from './locales.ts';
import css from './TeamModeToggle.module.css';
/** Session selection callbacks supplied to the Team settings pane. */
export interface TeamModePaneInjected {
    /** Save the selection; null means success, otherwise the string describes the failure. */
    selectTeamMode: (enabled: boolean) => Promise<string | null>;
    /** Open a Session-targeted confirmation outside this menu. */
    requestDisableConfirmation: () => void;
}
/** Full props of the model-menu Team summary. */
export type TeamModeToggleProps = PropsRuntime<'conversation.input.model.options'> & PropsLocale<typeof NS>;
/** Full props of the model-menu Team settings pane. */
export type TeamModePaneProps = PropsRuntime<'conversation.input.model.pane'> & PropsLocale<typeof NS> & TeamModePaneInjected;
/**
 * Show the saved Team state and open its settings without changing the mode.
 * @param props - Session projection, pane navigation, and locale.
 * @returns the summary when Team mode is available on a root Session.
 */
export const TeamModeToggle = defineComponent((props: TeamModeToggleProps) => {
    const addressedChild = props.useSession(snapshot => snapshot.subagent !== null);
    const listedChild = props.useSessions(state => state.byId[props.sessionId]?.origin === 'subagent');
    return () => {
        if (addressedChild.value || listedChild.value)
            return null;
        return h(RootTeamModeSummary, { ...props });
    };
}, { name: "TeamModeToggle", inheritAttrs: false, props: ["useSession", "useSessions", "sessionId", "useProjection", "locked", "openPane", "t"] });
const RootTeamModeSummary = defineComponent((props: TeamModeToggleProps) => {
    const mode = props.useProjection('agentTeam');
    return () => {
        const { locked, openPane, t } = props;
        if (mode.value === undefined)
            return null;
        return (h("button", { "type": "button", "role": "menuitem", "class": css.summary, "data-model-menu-pane": "agent-team", "disabled": locked, "onClick": () => { if (props.locked) return; openPane({ key: 'agent-team', title: t('command.title') }); } }, [
            h("span", { "class": css.summaryLabel }, [
                t('command.title')
            ]),
            h("span", { "class": css.state }, [
                t(mode.value.enabled ? 'mode.on' : 'mode.off')
            ]),
            h(IconChevronRightOutlineRegular, { "className": css.chevron ?? '', "aria-hidden": "true" })
        ]));
    };
}, { name: "RootTeamModeSummary", inheritAttrs: false, props: ["useProjection", "locked", "openPane", "t"] });
/**
 * Present the explanation and persisted Team switch for a root Session.
 * @param props - Session projections, mode operations, menu dismissal, and locale.
 * @returns the Team settings content when its projection is available.
 */
export const TeamModePane = defineComponent((props: TeamModePaneProps) => {
    const addressedChild = props.useSession(snapshot => snapshot.subagent !== null);
    const listedChild = props.useSessions(state => state.byId[props.sessionId]?.origin === 'subagent');
    return () => {
        if (addressedChild.value || listedChild.value)
            return null;
        return h(RootTeamModePane, { ...props });
    };
}, { name: "TeamModePane", inheritAttrs: false, props: ["useSession", "useSessions", "sessionId", "useProjection", "locked", "dismiss", "reportFailure", "selectTeamMode", "requestDisableConfirmation", "t"] });
const RootTeamModePane = defineComponent((props: TeamModePaneProps) => {
    const mode = props.useProjection('agentTeam');
    const modelSelection = props.useProjection('modelSelection');
    const pending = ref(false);
    const descriptionId = useId();
    return () => {
        const { locked, dismiss, reportFailure, selectTeamMode, requestDisableConfirmation, t } = props;
        if (mode.value === undefined)
            return null;
        const select = (enabled: boolean): void => {
 if(props.locked || pending.value) return;
            if (!enabled && modelSelection.value !== undefined && modelSelection.value.lastUsed !== null) {
                dismiss();
                requestDisableConfirmation();
                return;
            }
            pending.value = true;
            void selectTeamMode(enabled).then((failure) => {
                if (failure !== null)
                    reportFailure(t('mode.failed', { message: failure }));
            }, (error: unknown) => {
                reportFailure(t('mode.failed', { message: error instanceof Error ? error.message : String(error) }));
            }).finally(() => { pending.value = false; });
        };
        return (h("div", { "class": css.pane }, [
            h("div", { "class": css.row }, [
                h("span", { "class": css.label }, [
                    t('mode.label')
                ]),
                h(Switch, { "className": css.toggle ?? '', "checked": mode.value.enabled, "disabled": locked || pending.value || modelSelection.value === undefined, "label": t('mode.label'), "onChange": select, "autoFocus": true, "describedBy": descriptionId })
            ]),
            h("p", { "id": descriptionId, "class": css.description }, [
                t('mode.description')
            ])
        ]));
    };
}, { name: "RootTeamModePane", inheritAttrs: false, props: ["useProjection", "locked", "dismiss", "reportFailure", "selectTeamMode", "requestDisableConfirmation", "t"] });
