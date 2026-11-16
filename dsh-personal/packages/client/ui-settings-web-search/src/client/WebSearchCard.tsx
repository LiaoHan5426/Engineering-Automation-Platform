/**
 * The web search and fetch settings page: one section per capability, each
 * with a provider menu and its explanation. The selected provider's settings
 * below the menu sit in one gray panel: the result count and billing for the
 * DeepSeek Search API, billing for the DeepSeek Fetch API, and the key,
 * endpoint, and search limit for legacy Messages search. A provider with no
 * settings here shows no panel.
 */
import { defineComponent, h, ref, shallowRef, type VNodeChild } from 'vue';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import { Button, IconChevronDownOutlineRegular, Menu, SettingsForm, SettingsSecretField, SettingsValueField, Tag, } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { formLabels, type WebSearchSettingsLocaleKey } from './locales.ts';
import styles from './WebSearchCard.module.css';
import { PROVIDER_IDS, type WebBilling, type WebBillingState, type WebProviderOption, type WebProviderSelection, type WebSearchCardFace, type WebSearchCardState, } from './web-search-card-controller.ts';
/** Props the renderer binds for the web search and fetch page. */
export type WebSearchCardProps = PropsRuntime<'plugins.item'> & PropsLocale<'settings.webSearch'> & InjectFace<WebSearchCardFace>;
type T = WebSearchCardProps['t'];
/** Dictionary names of the official providers; any other provider shows its registered title or id. */
const PROVIDER_LABELS: Record<string, WebSearchSettingsLocaleKey> = {
    [PROVIDER_IDS.apiSearch]: 'providerDeepSeek',
    [PROVIDER_IDS.legacySearch]: 'providerLegacy',
    [PROVIDER_IDS.localFetch]: 'providerLocal',
    [PROVIDER_IDS.apiFetch]: 'providerDeepSeekFetch',
};
/**
 * The menu label of one provider.
 * @param t - the page's locale reader.
 * @param option - the provider entry.
 * @returns the localized name, marked when the Host does not register it.
 */
function providerLabel(t: T, option: WebProviderOption): string {
    const key = PROVIDER_LABELS[option.id];
    const name = key === undefined ? option.title ?? option.id : t(key);
    return option.missing ? t('providerMissing', { id: name }) : name;
}
/**
 * Render the page's one-liner or its settings form, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the one-liner, or the form.
 */
export const WebSearchCard = defineComponent((props: WebSearchCardProps) => {
    const snapshot = props.useWebSearchCard(value => value);
    return () => {
        const { t } = props;
        const state = snapshot.value;
        if (props.view === 'summary')
            return t('description');
        const disabled = !state.writable || state.saving;
        const menuDisabled = disabled || state.selectionBlocked;
        const { search, fetch } = state;
        // The selected provider's own description, in the active language; an empty translation shows nothing.
        const describe = (section: WebSearchCardState['search' | 'fetch']): string | undefined => {
            const description = section.options.find(option => option.id === section.selected)?.description;
            return description === undefined ? undefined : props.resolveText(description) || undefined;
        };
        return (h(SettingsForm, {
            "labels": formLabels(t),
            "state": state,
            "onSave": props.save,
            "onDiscard": props.discard
        }, { default: () => [h("section", {
                    "class": styles.section,
                    "aria-labelledby": "plugin-config-web-search-section"
                }, [h("h4", {
                        "id": "plugin-config-web-search-section",
                        "class": styles.sectionTitle
                    }, [t('searchSection')]), h(ProviderSelect, {
                        "id": "plugin-config-web-search-provider",
                        "labelledBy": "plugin-config-web-search-section",
                        "t": t,
                        "section": search,
                        "disabled": menuDisabled,
                        "field": "searchProvider",
                        "onSelect": props.selectProvider,
                        "providersFailed": state.providersFailed,
                        "onRetry": props.retryProviders,
                        "description": describe(search),
                        "hint": search.kind === 'deepseek'
                            ? h("a", {
                                "class": styles.link,
                                "href": t('searchGuideUrl'),
                                "target": "_blank",
                                "rel": "noopener noreferrer"
                            }, [t('searchGuide')]) : search.kind === 'plugin' ? t('pluginProviderHint') : undefined
                    }), search.kind === 'deepseek' && (h("div", {
                        "class": styles.panel
                    }, [h(SettingsValueField, {
                            "id": "plugin-config-web-search-count",
                            "label": t('count'),
                            "hint": t('countHint'),
                            "numeric": true,
                            "overriddenLabel": t('overridden'),
                            "resetLabel": t('reset'),
                            "invalidLabel": t('invalidCount'),
                            "disabled": disabled,
                            ...state.count,
                            "onEdit": (text) => { props.edit('count', text); },
                            "onReset": () => { props.resetField('count'); }
                        }), state.searchBilling !== undefined && (h(BillingField, {
                            "capability": "search",
                            "t": t,
                            "billing": state.searchBilling,
                            "disabled": disabled,
                            "onSelect": props.selectBilling,
                            "resolveText": props.resolveText
                        }))])), search.kind === 'legacy' && state.legacyKey !== undefined && (h("div", {
                        "class": styles.panel
                    }, [h(SettingsSecretField, {
                            "id": "plugin-config-web-search-key",
                            "label": t('credential'),
                            "hint": t('legacyKeyHint', { ref: state.legacyKey.ref }),
                            "disabled": !state.legacyKey.writable || state.saving,
                            "text": state.legacyKey.text,
                            "configured": state.legacyKey.configured,
                            "stateLabel": state.legacyKey.configured ? t('apiKeySet') : t('apiKeyUnsetApi'),
                            "onEdit": (text) => { props.edit('legacyApiKey', text); }
                        }), h(SettingsValueField, {
                            "id": "plugin-config-web-search-endpoint",
                            "label": t('baseUrl'),
                            "hint": t('baseUrlHint', { path: '/messages' }),
                            "overriddenLabel": t('overridden'),
                            "resetLabel": t('reset'),
                            "invalidLabel": t('invalidNumber'),
                            "disabled": disabled,
                            ...state.messagesBaseURL,
                            "onEdit": (text) => { props.edit('messagesBaseURL', text); },
                            "onReset": () => { props.resetField('messagesBaseURL'); }
                        }), h(SettingsValueField, {
                            "id": "plugin-config-web-search-max-uses",
                            "label": t('maxUses'),
                            "hint": t('maxUsesHint'),
                            "numeric": true,
                            "overriddenLabel": t('overridden'),
                            "resetLabel": t('reset'),
                            "invalidLabel": t('invalidMaxUses'),
                            "disabled": disabled,
                            ...state.maxUses,
                            "onEdit": (text) => { props.edit('maxUses', text); },
                            "onReset": () => { props.resetField('maxUses'); }
                        })]))]), h("section", {
                    "class": styles.section,
                    "aria-labelledby": "plugin-config-web-fetch-section"
                }, [h("h4", {
                        "id": "plugin-config-web-fetch-section",
                        "class": styles.sectionTitle
                    }, [t('fetchSection')]), h(ProviderSelect, {
                        "id": "plugin-config-web-fetch-provider",
                        "labelledBy": "plugin-config-web-fetch-section",
                        "t": t,
                        "section": fetch,
                        "disabled": menuDisabled,
                        "field": "fetchProvider",
                        "onSelect": props.selectProvider,
                        "providersFailed": state.providersFailed,
                        "onRetry": props.retryProviders,
                        "description": describe(fetch),
                        "hint": fetch.kind === 'plugin' ? t('pluginProviderHint') : undefined
                    }), state.fetchBilling !== undefined && (h("div", {
                        "class": styles.panel
                    }, [h(BillingField, {
                            "capability": "fetch",
                            "t": t,
                            "billing": state.fetchBilling,
                            "disabled": disabled,
                            "onSelect": props.selectBilling,
                            "resolveText": props.resolveText
                        })]))])] }));
    };
}, { name: 'WebSearchCard', inheritAttrs: false, props: ['view', 't', 'useWebSearchCard', 'save', 'discard', 'resolveText', 'selectProvider', 'retryProviders', 'edit', 'resetField', 'selectBilling'] });
/** Menu id of the automatic-selection entry, matching a selection that names no provider. */
const AUTO_ID = '';
/**
 * A menu button that shows its current value and opens a list of choices.
 * Its accessible name is the element `labelledBy` names followed by the current
 * value, so the label does not replace the value.
 * @param props - the control id, the id of the element naming it, the entries, the current entry and its
 * label, the lock state, and the selection callback.
 * @returns the anchored menu.
 */
interface DropdownProps {
    id: string;
    labelledBy: string;
    items: readonly {
        id: string;
        label: string;
    }[];
    selectedId: string;
    valueLabel: string;
    disabled: boolean;
    onSelect: (id: string) => void;
}
const Dropdown = defineComponent((props: DropdownProps) => {
    const open = ref(false);
    const trigger = shallowRef<HTMLButtonElement | null>(null);
    return () => {
        const shown = open.value && !props.disabled;
        const valueId = props.id + '-value';
        return h(Menu, {
            open: shown, onClose: () => { open.value = false; }, items: props.items, selectedId: props.selectedId,
            onSelect: (id: string) => {
                trigger.value?.focus({ preventScroll: true });
                open.value = false;
                if (!props.disabled && id !== props.selectedId)
                    props.onSelect(id);
            }, portal: true, autoFocus: true, minWidthFromAnchor: true,
        }, { anchor: () => h('button', {
                ref: trigger, id: props.id, type: 'button', class: styles.selector,
                'aria-haspopup': 'menu', 'aria-expanded': shown,
                'aria-labelledby': props.labelledBy + ' ' + valueId, disabled: props.disabled,
                onClick: () => { if (!props.disabled)
                    open.value = !open.value; },
            }, [h('span', { id: valueId, class: styles.selectorLabel }, props.valueLabel), h(IconChevronDownOutlineRegular, { className: styles.chevron ?? '' })]) });
    };
}, { name: 'WebSearchDropdown', inheritAttrs: false, props: ['id', 'labelledBy', 'items', 'selectedId', 'valueLabel', 'disabled', 'onSelect'] });
/** Dictionary names of each billing and its explanation, in menu order. */
const BILLING_COPY = {
    'auto': { nameKey: 'billingAuto', hintKey: 'billingAutoHint' },
    'account': { nameKey: 'billingAccount', hintKey: 'billingAccountHint' },
    'api-key': { nameKey: 'billingApiKey', hintKey: 'billingApiKeyHint' },
} as const satisfies Record<WebBilling, {
    nameKey: WebSearchSettingsLocaleKey;
    hintKey: WebSearchSettingsLocaleKey;
}>;
/** Billing entries in menu order. */
const BILLINGS: readonly WebBilling[] = ['auto', 'account', 'api-key'];
/** Separator between the field names of the advanced-override tag, by language. */
const FIELD_SEPARATOR = { en: ', ', zh: '、', ja: '、', es: ', ', fr: ', ', de: ', ', ru: ', ', pt: ', ' };
/**
 * One capability's billing menu with the selected billing's explanation. While the capability's own endpoint fields
 * override billing, a tag beside the label names them and the menu is locked.
 * @param props - the capability, locale copy, the billing state, the settings lock, the selection callback, and the
 * locale resolver for the field-name separator.
 * @returns the labelled billing menu.
 */
function BillingField(props: {
    capability: 'search' | 'fetch';
    t: T;
    billing: WebBillingState;
    /** Locks the menu: read-only settings or a save in flight. */
    disabled: boolean;
    onSelect: WebSearchCardFace['selectBilling'];
    resolveText: WebSearchCardFace['resolveText'];
}) {
    const { t, billing, capability } = props;
    const id = `plugin-config-web-${capability}-billing`;
    const labelId = `${id}-label`;
    return (h("div", {
        "class": styles.panelField
    }, [h("div", {
            "class": styles.panelHead
        }, [h("span", {
                "id": labelId,
                "class": styles.panelLabel
            }, [t('billing')]), billing.advancedOverride.length > 0 && (h(Tag, {
                "tone": "neutral"
            }, { default: () => [t('billingAdvancedOverride', { fields: billing.advancedOverride.join(props.resolveText(FIELD_SEPARATOR)) })] }))]), h(Dropdown, {
            "id": id,
            "labelledBy": labelId,
            "items": BILLINGS.map(mode => ({ id: mode, label: t(BILLING_COPY[mode].nameKey) })),
            "selectedId": billing.value,
            "valueLabel": t(BILLING_COPY[billing.value].nameKey),
            "disabled": props.disabled || billing.advancedOverride.length > 0,
            "onSelect": (mode) => { props.onSelect(capability, BILLINGS.find(entry => entry === mode) ?? billing.value); }
        }), h("p", {
            "class": styles.hint
        }, [t(BILLING_COPY[billing.value].hintKey)])]));
}
/**
 * A notice that a list could not be read, with a retry.
 * @param props - the notice copy, the retry label, and the retry callback.
 * @returns the status line.
 */
function ReadFailure(props: {
    message: string;
    retry: string;
    onRetry: () => void;
}) {
    return (h("div", {
        "class": styles.notice,
        "role": "status"
    }, [h("span", {}, [props.message]), h(Button, {
            "variant": "outline",
            "size": "sm",
            "onClick": props.onRetry
        }, { default: () => [props.retry] })]));
}
/**
 * One section's provider menu, with the selected provider's description and
 * the page's own line about it below, and a notice with a retry while the provider list could not be read.
 * @param props - the control id, the id of the section title naming it, the section state, the selection callback, and the list read state.
 * @returns the labelled menu.
 */
function ProviderSelect(props: {
    id: string;
    /** Id of the section title, which names the menu. */
    labelledBy: string;
    t: T;
    section: WebSearchCardState['search' | 'fetch'];
    disabled: boolean;
    field: keyof WebProviderSelection;
    onSelect: WebSearchCardFace['selectProvider'];
    /** The selected provider's registered description, resolved to the active language, if it has one. */
    description: string | undefined;
    /** The page's own line about the selected provider, after its description, if it has one. */
    hint: VNodeChild;
    /** Whether the latest provider list read failed. */
    providersFailed: boolean;
    onRetry: WebSearchCardFace['retryProviders'];
}) {
    const { t, section } = props;
    const current = section.options.find(option => option.id === section.selected);
    const items = [
        ...section.auto ? [{ id: AUTO_ID, label: t('providerAuto') }] : [],
        ...section.options.map(option => ({ id: option.id, label: providerLabel(t, option) })),
    ];
    return (h("div", {
        "class": styles.field
    }, [h(Dropdown, {
            "id": props.id,
            "labelledBy": props.labelledBy,
            "items": items,
            "selectedId": section.selected,
            "valueLabel": current === undefined ? t('providerAuto') : providerLabel(t, current),
            "disabled": props.disabled,
            "onSelect": (id) => { props.onSelect(props.field, id); }
        }), props.description !== undefined && h("p", {
            "class": styles.hint
        }, [props.description]), props.hint !== undefined && h("p", {
            "class": styles.hint
        }, [props.hint]), props.providersFailed && h(ReadFailure, {
            "message": t('providersFailed'),
            "retry": t('retry'),
            "onRetry": props.onRetry
        })]));
}
