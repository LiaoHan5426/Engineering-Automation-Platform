/**
 * The search settings panel edits the navigator's draft of excluded directories.
 * The navigator saves it when the panel closes, including through the magnifier.
 * The `.gitignore` choice above the list is saved as soon as it changes, as
 * the hidden-entry control in the search bar is.
 *
 * It floats over the navigator below the search field. The field that adds a
 * directory stays above the list, which alone scrolls; a new rule goes to the
 * top. The header's restore control appears while the list differs from the
 * default list in any way, order included, and replaces it with that list. The close control, Escape, and focus leaving the panel request
 * closure; focus moving to the magnifier leaves closure to its click.
 */
import { defineComponent, h, useId, ref, onMounted, type ShallowRef } from 'vue';
import clsx from 'clsx';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { IconCloseOutlineRegular, IconPlusOutlineRegular, IconRefreshOutlineRegular, IconTrashOutlineRegular, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import type {} from './locales.ts';
import { addRule, defaultRules, isDefaultRules, removeRule, setRuleEnabled, type ExclusionRule, type RuleInvalidReason, } from './search-rules.ts';
import css from './FilesBody.module.css';
/**
 * The settings panel.
 * @param props.rules - the navigator's current draft.
 * @param props.respectGitignore - whether the workspace's search leaves out entries `.gitignore` ignores.
 * @param props.onRespectGitignore - saves a new `.gitignore` choice at once.
 * @param props.trigger - the control that opens and closes the panel; focus moving to it leaves the closing to its click.
 * @param props.onChange - replaces the draft without saving preferences.
 * @param props.onClose - saves and closes the draft, returning focus to the trigger when requested.
 * @param props.t - namespace-bound translate.
 * @returns the panel.
 */
interface SearchSettingsProps {
    readonly rules: readonly ExclusionRule[];
    readonly respectGitignore: boolean;
    readonly onRespectGitignore: (respectGitignore: boolean) => void;
    readonly trigger: Readonly<ShallowRef<HTMLElement | null>>;
    readonly onChange: (rules: readonly ExclusionRule[]) => void;
    readonly onClose: (refocus: boolean) => void;
    readonly t: TranslateNS<'sidebarFiles'>;
}
/** Native search settings editor with a private text draft. */
export const SearchSettings = defineComponent((props: SearchSettingsProps) => {
    const textState = ref('');
    const invalidState = ref<RuleInvalidReason>();
    const setText = (value: string): void => { textState.value = value; };
    const setInvalid = (value: RuleInvalidReason | undefined): void => { invalidState.value = value; };
    const add = ref<HTMLInputElement | null>(null);
    onMounted(() => { add.value?.focus(); });
    const title = useId();
    const error = useId();
    // A control that is about to disappear hands the keyboard to the add field first, so the panel keeps it.
    const keepFocus = (): void => { add.value?.focus(); };
    return () => {
    const { rules, respectGitignore, onRespectGitignore, trigger, onChange, onClose, t } = props;
    const text = textState.value; const invalid = invalidState.value;
    return (h("section", {
        "class": css.settings,
        "role": "dialog",
        "aria-labelledby": title,
        "tabindex": -1,
        "data-files-search-settings": "",
        "onKeydown": (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.isComposing)
                return;
            // Kept from the navigator's own Escape and the overlay's close on the document.
            event.preventDefault();
            event.stopPropagation();
            onClose(true);
        },
        "onFocusout": (event: FocusEvent) => {
            const next = event.relatedTarget;
            if (next instanceof Node && ((event.currentTarget instanceof HTMLElement && event.currentTarget.contains(next)) || trigger.value?.contains(next) === true))
                return;
            onClose(false);
        }
    }, [
        h("div", {
            "class": css.settingsHeader
        }, [
            h("span", {
                "id": title,
                "class": css.settingsTitle
            }, [
                t('settings.title')
            ]),
            !isDefaultRules(rules) && (h(Tooltip, {
                "label": t('settings.restore'),
                "side": "bottom",
                "portal": true
            }, {
                "default": () => [
                    h("button", {
                        "type": "button",
                        "class": css.tool,
                        "aria-label": t('settings.restore'),
                        "data-files-settings-restore": "",
                        "onClick": () => {
                            keepFocus();
                            onChange(defaultRules());
                        }
                    }, [
                        h(IconRefreshOutlineRegular, null, {
                            "default": () => []
                        })
                    ])
                ]
            })),
            h(Tooltip, {
                "label": t('settings.close'),
                "side": "bottom",
                "portal": true
            }, {
                "default": () => [
                    h("button", {
                        "type": "button",
                        "class": css.tool,
                        "aria-label": t('settings.close'),
                        "onClick": () => { onClose(true); }
                    }, [
                        h(IconCloseOutlineRegular, null, {
                            "default": () => []
                        })
                    ])
                ]
            })
        ]),
        h("p", {
            "class": css.settingsDescription
        }, [
            t('settings.description')
        ]),
        h("div", {
            "class": clsx(css.rule, css.settingsOption)
        }, [
            h("label", {
                "class": css.ruleLabel
            }, [
                h("input", {
                    "type": "checkbox",
                    "class": css.ruleCheck,
                    "checked": respectGitignore,
                    "data-files-respect-gitignore": "",
                    "onChange": (event: Event) => { onRespectGitignore((event.target as HTMLInputElement).checked); }
                }, []),
                h("span", {
                    "class": css.ruleName
                }, [
                    t('settings.respectGitignore')
                ])
            ])
        ]),
        h("div", {
            "class": clsx(css.rule, css.addRule)
        }, [
            h(IconPlusOutlineRegular, {
                "class": css.icon
            }, {
                "default": () => []
            }),
            h("input", {
                "ref": add,
                "class": css.ruleInput,
                "type": "text",
                "value": text,
                "placeholder": t('settings.add'),
                "aria-label": t('settings.add'),
                "aria-invalid": invalid !== undefined,
                "aria-describedby": invalid === undefined ? undefined : error,
                "autocomplete": "off",
                "spellcheck": false,
                "autofocus": true,
                "onInput": (event: Event) => {
                    setText((event.target as HTMLInputElement).value);
                    setInvalid(undefined);
                },
                "onKeydown": (event: KeyboardEvent) => {
                    if (event.key !== 'Enter' || event.isComposing)
                        return;
                    event.preventDefault();
                    const added = addRule(rules, text);
                    if (added.kind === 'invalid') {
                        setInvalid(added.reason);
                        return;
                    }
                    onChange(added.rules);
                    setText('');
                }
            }, [])
        ]),
        invalid !== undefined && h("p", {
            "id": error,
            "class": css.settingsError,
            "role": "alert"
        }, [
            t(`settings.invalid.${invalid}`)
        ]),
        h("ul", {
            "class": css.rules
        }, [
            rules.map(rule => (h("li", {
                "key": rule.path,
                "class": clsx(css.rule, !rule.enabled && css.ruleOff),
                "data-files-rule": rule.path
            }, [
                h("label", {
                    "class": css.ruleLabel
                }, [
                    h("input", {
                        "type": "checkbox",
                        "class": css.ruleCheck,
                        "checked": rule.enabled,
                        "aria-label": t('settings.toggle', { path: rule.path }),
                        "onChange": (event: Event) => { onChange(setRuleEnabled(rules, rule.path, (event.target as HTMLInputElement).checked)); }
                    }, []),
                    h("span", {
                        "class": css.ruleName
                    }, [
                        rule.path
                    ])
                ]),
                h(Tooltip, {
                    "label": t('settings.remove', { path: rule.path }),
                    "side": "bottom",
                    "portal": true
                }, {
                    "default": () => [
                        h("button", {
                            "type": "button",
                            "class": css.tool,
                            "aria-label": t('settings.remove', { path: rule.path }),
                            "onClick": () => {
                                keepFocus();
                                onChange(removeRule(rules, rule.path));
                            }
                        }, [
                            h(IconTrashOutlineRegular, null, {
                                "default": () => []
                            })
                        ])
                    ]
                })
            ])))
        ])
    ]));
    };
}, { name: 'SearchSettings', props: ['rules', 'respectGitignore', 'onRespectGitignore', 'trigger', 'onChange', 'onClose', 't'], inheritAttrs: false });
