import { computed, defineComponent, Fragment, h, useId, shallowRef } from 'vue';
import { Button, IconPlusOutlineRegular, IconQuestionOutlineRegular, IconTrashOutlineRegular, Switch, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ObservableSnapshot, PropsStore } from '@deepseek-ai/dsh-client-store';
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { Config } from '../config.ts';
import defaults from '../defaults.ts';
import type { createSettingsStore } from './store.ts';
import { formatPeriod, reportPeriods, validReportPeriods } from '../periods.ts';
import { HISTORY_MS, languages, languageText, outputLanguages, MINUTE_MS, PROMPT_LIMIT, progressPrecisions } from '../policy.ts';
export type EditableSettings = Pick<Config, 'language' | 'progressDecimals' | 'segmentedProgress' | 'allowTodo' | 'autoOpenSidebar' | 'reminderIterations' | 'reportsEnabled' | 'taskPrompt' | 'summaryPrompt' | 'levelPrompts'> & {
    periods: number[];
};
export interface SettingsInjected {
    hooks: {
        locale: ObservableSnapshot<{
            active: string;
        }>;
        settings: ObservableSnapshot<ConfigFormSnapshot<Config>>;
    };
    save: (value: EditableSettings, revision: number | undefined) => Promise<boolean>;
}
type SettingsProps = PropsRuntime<'plugins.bundle.config'> & PropsLocale<'timeline'> & PropsStore<ReturnType<typeof createSettingsStore>> & InjectFace<SettingsInjected>;
/** Materialize previous per-rollup overrides before saving level-specific instructions. */
export function editableSettings(value: Config): EditableSettings {
    const periods = reportPeriods(value);
    return {
        language: value.language,
        progressDecimals: value.progressDecimals,
        segmentedProgress: value.segmentedProgress,
        allowTodo: value.allowTodo,
        autoOpenSidebar: value.autoOpenSidebar,
        reminderIterations: value.reminderIterations,
        reportsEnabled: value.reportsEnabled,
        taskPrompt: value.taskPrompt,
        summaryPrompt: value.summaryPrompt,
        periods,
        levelPrompts: periods.map((_, index) => {
            return value.levelPrompts[index] ?? '';
        }),
    };
}
const OptionHelp = defineComponent((props: {
    text: string;
}) => {
    return () => {
        return (h(Tooltip, { "label": props.text, "side": "top", "maxWidth": 280, "portal": true, "openOnClick": true }, { default: () => [
                h("button", { "type": "button", "class": "timeline-option-help", "aria-label": props.text }, [
                    h(IconQuestionOutlineRegular, { "size": 14 })
                ])
            ] }));
    };
}, { name: "OptionHelp", inheritAttrs: false, props: ["text"] });
const PromptCount = defineComponent((props: {
    length: number;
    locale: string;
}) => {
    return () => {
        return (h("div", { "class": "timeline-prompt-foot timeline-muted" }, [
            props.length.toLocaleString(props.locale),
            " / ",
            PROMPT_LIMIT.toLocaleString(props.locale)
        ]));
    };
}, { name: "PromptCount", inheritAttrs: false, props: ["length", "locale"] });
/**
 * Edit Timeline settings from its plugin detail page.
 * @param props Localized settings, draft store and save action.
 * @returns The settings form.
 */
export const Settings = defineComponent((props: Pick<SettingsProps, 'useSettings' | 'useLocale' | 'useStore' | 'actions' | 'save' | 't'>) => {
    const field = useId();
    const locale = props.useLocale(value => value.active);
    const source = props.useSettings(value => value);
    const state = props.useStore(value => value);
    const pending = shallowRef(false);
    const draft = computed(() => state.value.draft);
    const value = computed(() => state.value.draft ?? (source.value.value === undefined ? undefined : editableSettings(source.value.value)));
    const periods = computed(() => {
        return value.value?.periods ?? [];
    });
    const lastPeriod = computed(() => periods.value.at(-1) ?? 0);
    const level = computed(() => Math.min(state.value.level, periods.value.length - 1));
    const selectedPeriod = computed(() => periods.value[level.value]);
    const summaryPrompt = computed(() => {
        return (level.value < 0 ? value.value?.summaryPrompt : value.value?.levelPrompts[level.value]) ?? '';
    });
    const unitAt = computed(() => (index: number, period: number): 'minute' | 'hour' => state.value.units[index] ?? (period >= 3600000 && period % 3600000 === 0 ? 'hour' : 'minute'));
    const edit = computed(() => (value: EditableSettings, patch: Partial<EditableSettings>) => {
        props.actions.update({
            draft: { ...value, ...patch },
            revision: state.value.draft === null ? source.value.revision : state.value.revision,
            messageKey: null,
        });
    });
    const submit = computed(() => async (draft: EditableSettings) => {
        if (pending.value)
            return;
        pending.value = true;
        props.actions.update({ saving: true, messageKey: null });
        try {
            const accepted = await props.save(draft, state.value.revision);
            props.actions.update(accepted ? { draft: null, messageKey: 'saved' } : { messageKey: 'saveFailed' });
        }
        catch {
            props.actions.update({ messageKey: 'saveFailed' });
        }
        finally {
            pending.value = false;
            props.actions.update({ saving: false });
        }
    });
    const invalidReminder = computed(() => {
        return value.value !== undefined && (!Number.isSafeInteger(value.value.reminderIterations) || value.value.reminderIterations < 1);
    });
    const invalid = computed(() => {
        return value.value !== undefined &&
            (invalidReminder.value ||
                !languages.includes(value.value.language) ||
                !progressPrecisions.includes(value.value.progressDecimals) ||
                !validReportPeriods(periods.value) ||
                value.value.taskPrompt.length > PROMPT_LIMIT ||
                !value.value.summaryPrompt.trim() ||
                value.value.summaryPrompt.length > PROMPT_LIMIT ||
                value.value.levelPrompts.some(prompt => prompt.length > PROMPT_LIMIT));
    });
    return () => {
        const periodsRendered = periods.value;
        const levelRendered = level.value;
        const selectedPeriodRendered = selectedPeriod.value;
        const summaryPromptRendered = summaryPrompt.value;
        const lastPeriodRendered = lastPeriod.value;
        const settingsValue = value.value;
        const settingsDraft = draft.value;
        return (h("div", { "class": "dsh-timeline timeline-settings" }, [
            h("header", { "class": "timeline-page-header" }, [
                h("div", { "class": "timeline-page-title" }, [
                    h("h2", null, [
                        props.t('settings')
                    ]),
                    h("div", { "class": "timeline-save-actions" }, [
                        h("span", { "role": "status", "class": state.value.messageKey === 'saveFailed' ? 'timeline-error' : 'timeline-muted' }, [
                            settingsValue === undefined
                                ? ''
                                : state.value.messageKey === null
                                    ? state.value.draft === null
                                        ? props.t('upToDate')
                                        : props.t('unsaved')
                                    : props.t(state.value.messageKey)
                        ]),
                        state.value.draft === null ? null : (h(Button, { "disabled": state.value.saving, "onClick": () => { props.actions.update({ draft: null, messageKey: null }); } }, { default: () => [
                                props.t('discard')
                            ] })),
                        h(Button, { "className": "timeline-primary", "disabled": state.value.draft === null || state.value.saving || invalid.value || !source.value.writable, "onClick": settingsDraft === null ? undefined : () => { void submit.value(settingsDraft); } }, { default: () => [
                                props.t(state.value.saving ? 'saving' : 'save')
                            ] })
                    ])
                ])
            ]),
            settingsValue === undefined ? (h("p", { "role": "status" }, [
                props.t(source.value.status === 'loading' ? 'loading' : 'settingsUnavailable')
            ])) : (h(Fragment, null, [
                h("section", { "class": "timeline-settings-section", "aria-label": props.t('general') }, [
                    h("h2", null, [
                        props.t('general')
                    ]),
                    h("div", { "class": "timeline-config-controls" }, [
                        h("div", { "class": "timeline-setting" }, [
                            h("div", { "class": "timeline-setting-label" }, [
                                h("label", { "htmlFor": `${field}-language` }, [
                                    props.t('language')
                                ]),
                                h(OptionHelp, { "text": props.t('languageHint') })
                            ]),
                            h("select", { "id": `${field}-language`, "value": settingsValue.language, "disabled": state.value.saving || !source.value.writable, "onInput": (event: Event & {
                                    currentTarget: HTMLInputElement;
                                }) => {
                                    const language = languages.find(item => item === event.currentTarget.value);
                                    if (language !== undefined)
                                        edit.value(settingsValue, { language });
                                } }, [
                                h("option", { "value": "ui" }, [
                                    props.t('followAppLanguage')
                                ]),
                                outputLanguages.map(language => (h("option", { "key": language, "value": language }, [
                                    languageText[language].label
                                ])))
                            ])
                        ]),
                        h("div", { "class": "timeline-setting" }, [
                            h("div", { "class": "timeline-setting-label" }, [
                                h("label", { "htmlFor": `${field}-decimals` }, [
                                    props.t('progressDecimals')
                                ]),
                                h(OptionHelp, { "text": props.t('progressDecimalsHint') })
                            ]),
                            h("select", { "id": `${field}-decimals`, "value": settingsValue.progressDecimals, "disabled": state.value.saving || !source.value.writable, "onInput": (event: Event & {
                                    currentTarget: HTMLInputElement;
                                }) => {
                                    const progressDecimals = progressPrecisions.find(precision => String(precision) === event.currentTarget.value);
                                    if (progressDecimals !== undefined)
                                        edit.value(settingsValue, { progressDecimals });
                                } }, [
                                progressPrecisions.map(precision => (h("option", { "key": precision, "value": precision }, [
                                    precision
                                ])))
                            ])
                        ]),
                        h("div", { "class": "timeline-switch-control" }, [
                            h("div", { "class": "timeline-setting-label" }, [
                                h("span", null, [
                                    props.t('segmentedProgress')
                                ]),
                                h(OptionHelp, { "text": props.t('segmentedProgressHint') })
                            ]),
                            h("div", { "class": "timeline-switch-row" }, [
                                h(Switch, { "checked": settingsValue.segmentedProgress, "label": props.t('segmentedProgress'), "disabled": state.value.saving || !source.value.writable, "onChange": (segmentedProgress) => { edit.value(settingsValue, { segmentedProgress }); } })
                            ])
                        ])
                    ])
                ]),
                h("section", { "class": "timeline-settings-section", "aria-label": props.t('taskTracking') }, [
                    h("h2", null, [
                        props.t('taskTracking')
                    ]),
                    h("div", { "class": "timeline-config-controls" }, [
                        h("div", { "class": "timeline-switch-control" }, [
                            h("div", { "class": "timeline-setting-label" }, [
                                h("span", null, [
                                    props.t('replaceTodo')
                                ]),
                                h(OptionHelp, { "text": props.t('replaceTodoHint') })
                            ]),
                            h("div", { "class": "timeline-switch-row" }, [
                                h(Switch, { "checked": !settingsValue.allowTodo, "label": props.t('replaceTodo'), "disabled": state.value.saving || !source.value.writable, "onChange": (replaceTodo) => { edit.value(settingsValue, { allowTodo: !replaceTodo }); } })
                            ])
                        ]),
                        h("div", { "class": "timeline-switch-control" }, [
                            h("div", { "class": "timeline-setting-label" }, [
                                h("span", null, [
                                    props.t('autoOpenSidebar')
                                ]),
                                h(OptionHelp, { "text": props.t('autoOpenSidebarHint') })
                            ]),
                            h("div", { "class": "timeline-switch-row" }, [
                                h(Switch, { "checked": settingsValue.autoOpenSidebar, "label": props.t('autoOpenSidebar'), "disabled": state.value.saving || !source.value.writable, "onChange": (autoOpenSidebar) => { edit.value(settingsValue, { autoOpenSidebar }); } })
                            ])
                        ]),
                        h("div", { "class": "timeline-setting" }, [
                            h("div", { "class": "timeline-setting-label" }, [
                                h("label", { "htmlFor": `${field}-reminder` }, [
                                    props.t('reminderIterations')
                                ]),
                                h(OptionHelp, { "text": props.t('reminderHint') })
                            ]),
                            h("span", { "class": "timeline-reminder-input" }, [
                                h("input", { "id": `${field}-reminder`, "type": "number", "min": 1, "max": Number.MAX_SAFE_INTEGER, "step": 1, "value": settingsValue.reminderIterations, "aria-invalid": invalidReminder.value, "disabled": state.value.saving || !source.value.writable, "onInput": (event: Event & {
                                        currentTarget: HTMLInputElement;
                                    }) => { edit.value(settingsValue, { reminderIterations: Number(event.currentTarget.value) }); } }),
                                h("span", null, [
                                    props.t('iterations')
                                ])
                            ])
                        ])
                    ])
                ]),
                invalid.value ? (h("p", { "role": "alert", "class": "timeline-error" }, [
                    props.t(invalidReminder.value ? 'invalidReminder' : 'invalidSettings')
                ])) : null,
                !source.value.writable ? (h("p", { "role": "status", "class": "timeline-muted" }, [
                    props.t('settingsReadOnly')
                ])) : null,
                h("section", { "class": "timeline-settings-section", "aria-label": props.t('progressReports') }, [
                    h("h2", null, [
                        props.t('progressReports')
                    ]),
                    h("div", { "class": "timeline-switch-control" }, [
                        h("div", { "class": "timeline-setting-label" }, [
                            h("span", null, [
                                props.t('reportsEnabled')
                            ]),
                            h(OptionHelp, { "text": props.t('reportsEnabledHint') })
                        ]),
                        h("div", { "class": "timeline-switch-row" }, [
                            h(Switch, { "checked": settingsValue.reportsEnabled, "label": props.t('reportsEnabled'), "disabled": state.value.saving || !source.value.writable, "onChange": (reportsEnabled) => { edit.value(settingsValue, { reportsEnabled }); } })
                        ])
                    ]),
                    h("div", { "class": "timeline-config-layout" }, [
                        h("section", { "class": "timeline-levels", "aria-label": props.t('hierarchy') }, [
                            h("h3", { "class": "timeline-setting-label" }, [
                                props.t('hierarchy'),
                                h(OptionHelp, { "text": props.t('hierarchyHint') })
                            ]),
                            h("button", { "class": "timeline-global-choice", "aria-pressed": levelRendered === -1, "onClick": () => { props.actions.update({ level: -1 }); } }, [
                                h("strong", null, [
                                    props.t('globalPrompt')
                                ]),
                                h("small", null, [
                                    props.t('globalPromptHint')
                                ])
                            ]),
                            h("div", { "class": "timeline-level-list" }, [
                                periodsRendered.map((period, index) => (h("div", { "class": "timeline-level-row", "data-level": index, "key": index }, [
                                    h("button", { "class": "timeline-level-choice", "aria-pressed": levelRendered === index, "onClick": () => { props.actions.update({ level: index }); } }, [
                                        h("span", { "class": "timeline-level-marker", "aria-hidden": "true" }, [
                                            index + 1
                                        ]),
                                        h("span", null, [
                                            h("strong", null, [
                                                formatPeriod(period)
                                            ]),
                                            h("small", null, [
                                                props.t('level'),
                                                " ",
                                                index + 1
                                            ])
                                        ])
                                    ]),
                                    h("div", { "class": "timeline-period-input" }, [
                                        h("input", { "aria-label": `${props.t('period')} ${index + 1}`, "type": "number", "min": unitAt.value(index, period) === 'hour' ? 1 / 60 : 1, "step": "any", "value": period / (unitAt.value(index, period) === 'hour' ? 3600000 : MINUTE_MS), "disabled": state.value.saving || !source.value.writable, "onInput": (event: Event & {
                                                currentTarget: HTMLInputElement;
                                            }) => {
                                                edit.value(settingsValue, {
                                                    periods: periodsRendered.map((item, position) => position === index
                                                        ? Math.round(Number(event.currentTarget.value) *
                                                            (unitAt.value(index, period) === 'hour' ? 3600000 : MINUTE_MS))
                                                        : item),
                                                });
                                            } }),
                                        h("select", { "aria-label": `${props.t('unit')} ${index + 1}`, "value": unitAt.value(index, period), "disabled": state.value.saving || !source.value.writable, "onInput": (event: Event & {
                                                currentTarget: HTMLInputElement;
                                            }) => {
                                                const unit = event.currentTarget.value === 'hour' ? 'hour' : 'minute';
                                                props.actions.update({
                                                    units: periodsRendered.map((period, position) => position === index ? unit : unitAt.value(position, period)),
                                                });
                                            } }, [
                                            h("option", { "value": "minute" }, [
                                                props.t('minutes')
                                            ]),
                                            h("option", { "value": "hour" }, [
                                                props.t('hours')
                                            ])
                                        ])
                                    ]),
                                    h(Button, { "className": "timeline-icon-button timeline-delete", "aria-label": `${props.t('removeLevel')} ${index + 1}`, "title": `${props.t('removeLevel')} ${index + 1}`, "disabled": periodsRendered.length <= 1 || state.value.saving || !source.value.writable, "onClick": () => {
                                            edit.value(settingsValue, {
                                                periods: periodsRendered.filter((_, position) => position !== index),
                                                levelPrompts: settingsValue.levelPrompts.filter((_, position) => position !== index),
                                            });
                                            props.actions.update({
                                                level: levelRendered === index ? -1 : levelRendered > index ? levelRendered - 1 : levelRendered,
                                                units: periodsRendered.map((period, position) => unitAt.value(position, period))
                                                    .filter((_, position) => position !== index),
                                            });
                                        } }, { default: () => [
                                            h(IconTrashOutlineRegular, { "size": 17 })
                                        ] })
                                ]))),
                                h("button", { "class": "timeline-add-level", "aria-label": props.t('addLevel'), "title": props.t('addLevel'), "disabled": periodsRendered.length >= 5 ||
                                        lastPeriodRendered >= HISTORY_MS || invalid.value ||
                                        state.value.saving ||
                                        !source.value.writable, "onClick": () => {
                                        edit.value(settingsValue, {
                                            periods: [...periodsRendered, Math.min(lastPeriodRendered * 2, HISTORY_MS)],
                                            levelPrompts: [...settingsValue.levelPrompts, ''],
                                        });
                                        props.actions.update({ level: periodsRendered.length });
                                    } }, [
                                    h(IconPlusOutlineRegular, { "size": 20 })
                                ])
                            ])
                        ]),
                        h("section", { "class": "timeline-prompt-editor", "aria-label": props.t('prompt') }, [
                            h("div", { "class": "timeline-heading" }, [
                                h("div", null, [
                                    h("h3", null, [
                                        selectedPeriodRendered === undefined
                                            ? props.t('globalPrompt')
                                            : `${props.t('levelSummary', { level: levelRendered + 1, period: formatPeriod(selectedPeriodRendered) })} ${props.t('levelPrompt')}`
                                    ])
                                ]),
                                h(Button, { "disabled": state.value.saving || !source.value.writable, "title": levelRendered < 0 ? props.t('resetPrompt') : props.t('resetLevelHint'), "onClick": () => {
                                        edit.value(settingsValue, levelRendered < 0
                                            ? { summaryPrompt: defaults.summaryPrompt }
                                            : {
                                                levelPrompts: settingsValue.levelPrompts.map((prompt, index) => index === levelRendered ? '' : prompt),
                                            });
                                    } }, { default: () => [
                                        props.t('resetPrompt')
                                    ] })
                            ]),
                            h("p", { "class": "timeline-muted" }, [
                                props.t(levelRendered < 0 ? 'basePromptHint' : 'rollupPromptHint')
                            ]),
                            h("textarea", { "aria-label": props.t('prompt'), "spellCheck": false, "maxLength": PROMPT_LIMIT, "value": summaryPromptRendered, "placeholder": levelRendered < 0 ? undefined : props.t('levelPromptPlaceholder'), "disabled": state.value.saving || !source.value.writable, "onInput": (event: Event & {
                                    currentTarget: HTMLInputElement;
                                }) => {
                                    edit.value(settingsValue, levelRendered < 0
                                        ? { summaryPrompt: event.currentTarget.value }
                                        : {
                                            levelPrompts: settingsValue.levelPrompts.map((prompt, index) => index === levelRendered ? event.currentTarget.value : prompt),
                                        });
                                } }),
                            h(PromptCount, { "locale": locale.value, "length": summaryPromptRendered.length })
                        ])
                    ])
                ]),
                h("section", { "class": "timeline-settings-section timeline-task-prompt", "aria-label": props.t('taskPrompt') }, [
                    h("div", { "class": "timeline-heading" }, [
                        h("h2", null, [
                            props.t('taskPrompt')
                        ]),
                        h(Button, { "aria-label": `${props.t('resetPrompt')}: ${props.t('taskPrompt')}`, "disabled": state.value.saving || !source.value.writable, "onClick": () => { edit.value(settingsValue, { taskPrompt: defaults.taskPrompt }); } }, { default: () => [
                                props.t('resetPrompt')
                            ] })
                    ]),
                    h("p", { "class": "timeline-muted" }, [
                        props.t('taskPromptHint')
                    ]),
                    h("div", null, [
                        h("textarea", { "aria-label": props.t('taskPrompt'), "rows": 4, "spellCheck": false, "maxLength": PROMPT_LIMIT, "value": settingsValue.taskPrompt, "disabled": state.value.saving || !source.value.writable, "onInput": (event: Event & {
                                currentTarget: HTMLInputElement;
                            }) => { edit.value(settingsValue, { taskPrompt: event.currentTarget.value }); } }),
                        h(PromptCount, { "locale": locale.value, "length": settingsValue.taskPrompt.length })
                    ])
                ])
            ]))
        ]));
    };
}, { name: "Settings", inheritAttrs: false, props: ["useSettings", "useLocale", "useStore", "actions", "save", "t"] });
