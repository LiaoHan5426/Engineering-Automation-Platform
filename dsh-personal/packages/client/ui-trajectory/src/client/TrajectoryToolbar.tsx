import { defineComponent, h } from 'vue';
/** Trajectory toolbar: timeline and ledger fold controls. */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { NS } from './locales.ts';
import css from './TrajectoryToolbar.module.css';
export interface TrajectoryToolbarProps {
    /** Whether timeline blocks use recorded durations instead of equal widths. */
    actualDuration: boolean;
    /** Select recorded-duration or equal-width blocks. */
    onActualDurationChange: (actualDuration: boolean) => void;
    /** Whether recorded timing retains idle gaps between operations. */
    actualTime: boolean;
    /** Select complete wall-clock timing or idle-compressed timing. */
    onActualTimeChange: (actualTime: boolean) => void;
    /** Whether every collapsible turn is currently folded. */
    allTurnsCollapsed: boolean;
    /** Fold or expand every collapsible turn. */
    onToggleAllTurns: () => void;
    /** Whether every collapsible assistant's tool calls are currently folded. */
    allAssistantsCollapsed: boolean;
    /** Fold or expand tool calls under every collapsible assistant. */
    onToggleAllAssistants: () => void;
    /** Whether every tool's nested calls are currently folded. */
    allSubCallsCollapsed: boolean;
    /** Fold or expand nested calls under every tool. */
    onToggleAllSubCalls: () => void;
    /** Current live ledger search query. */
    searchQuery: string;
    /** Update the live ledger search query. */
    onSearchQueryChange: (query: string) => void;
    /** Translate a toolbar dictionary key. */
    t: TranslateNS<typeof NS>;
}
/**
 * Render the sticky trajectory toolbar.
 * @param props - rendered counts and whole-list fold state.
 * @returns the toolbar element.
 */
export const TrajectoryToolbar = defineComponent((props: TrajectoryToolbarProps) => {
    return () => {
        const { actualDuration, onActualDurationChange, actualTime, onActualTimeChange, allTurnsCollapsed, onToggleAllTurns, allAssistantsCollapsed, onToggleAllAssistants, allSubCallsCollapsed, onToggleAllSubCalls, searchQuery, onSearchQueryChange, t } = props;
        return (h("div", { "class": css.root, "role": "toolbar", "aria-label": t('toolbar.aria') }, [
            h("div", { "class": css.inner }, [
                h("div", { "class": css.actions }, [
                    h("button", { "type": "button", "class": css.toggle, "aria-label": t('toolbar.useActualDuration'), "aria-pressed": actualDuration, "title": actualDuration ? t('toolbar.useEqualWidth') : t('toolbar.useActualDuration'), "onClick": () => { onActualDurationChange(!actualDuration); } }, [
                        h("svg", { "class": css.toggleIcon, "viewBox": "0 0 16 16", "fill": "none", "aria-hidden": "true" }, [
                            h("circle", { "cx": "8", "cy": "8", "r": "5.25" }),
                            h("path", { "d": "M8 4.75V8l2.25 1.5" })
                        ]),
                        t('toolbar.duration')
                    ]),
                    h("button", { "type": "button", "class": css.control, "role": "switch", "aria-checked": actualTime, "hidden": true, "onClick": () => { onActualTimeChange(!actualTime); } }, [
                        h("span", null, [
                            t('toolbar.actualTime')
                        ]),
                        h("span", { "class": css.controlTrack, "data-on": actualTime || undefined, "aria-hidden": "true" }, [
                            h("span", { "class": css.controlThumb })
                        ])
                    ]),
                    h("button", { "type": "button", "class": css.action, "aria-label": allTurnsCollapsed ? t('toolbar.expandTurns') : t('toolbar.collapseTurns'), "aria-pressed": allTurnsCollapsed, "title": allTurnsCollapsed ? t('toolbar.expandTurns') : t('toolbar.collapseTurns'), "onClick": onToggleAllTurns }, [
                        h("span", { "class": css.actionIcon, "aria-hidden": "true" }, [
                            allTurnsCollapsed ? '⊞' : '⊟'
                        ]),
                        t('toolbar.turns')
                    ]),
                    h("button", { "type": "button", "class": css.action, "aria-label": allAssistantsCollapsed ? t('toolbar.expandCalls') : t('toolbar.collapseCalls'), "aria-pressed": allAssistantsCollapsed, "title": allAssistantsCollapsed ? t('toolbar.expandCalls') : t('toolbar.collapseCalls'), "onClick": onToggleAllAssistants }, [
                        h("span", { "class": css.actionIcon, "aria-hidden": "true" }, [
                            allAssistantsCollapsed ? '⊞' : '⊟'
                        ]),
                        t('toolbar.calls')
                    ]),
                    h("button", { "type": "button", "class": css.action, "aria-label": allSubCallsCollapsed ? t('toolbar.expandSubCalls') : t('toolbar.collapseSubCalls'), "aria-pressed": allSubCallsCollapsed, "title": allSubCallsCollapsed ? t('toolbar.expandSubCalls') : t('toolbar.collapseSubCalls'), "onClick": onToggleAllSubCalls }, [
                        h("span", { "class": css.actionIcon, "aria-hidden": "true" }, [
                            allSubCallsCollapsed ? '⊞' : '⊟'
                        ]),
                        t('toolbar.subCalls')
                    ])
                ]),
                h("div", { "class": css.search }, [
                    h(IconSearchOutlineRegular, { "size": 11, "className": css.searchIcon ?? "" }),
                    h("input", { "type": "search", "class": css.searchInput, "aria-label": t('toolbar.search'), "placeholder": t('toolbar.searchPlaceholder'), "value": searchQuery, "onInput": (event: Event & {
                            currentTarget: HTMLInputElement;
                        }) => { onSearchQueryChange(event.currentTarget.value); } })
                ])
            ])
        ]));
    };
}, { name: "TrajectoryToolbar", inheritAttrs: false, props: ["actualDuration", "onActualDurationChange", "actualTime", "onActualTimeChange", "allTurnsCollapsed", "onToggleAllTurns", "allAssistantsCollapsed", "onToggleAllAssistants", "allSubCallsCollapsed", "onToggleAllSubCalls", "searchQuery", "onSearchQueryChange", "t"] });
