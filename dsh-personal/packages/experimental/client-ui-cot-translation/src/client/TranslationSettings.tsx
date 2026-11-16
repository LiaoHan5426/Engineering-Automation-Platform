import { defineComponent, computed, watch, h, Fragment, useId, onMounted } from "vue";
/** Provider, language, and external-service disclosure on the Plugins page. */
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import type { TranslationProvider } from "@deepseek-ai/dsh-experimental-translator/types";
import {
  Button,
  SettingsForm,
  SettingsValueField,
  Tag,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from "@deepseek-ai/dsh-client-ui-slots";
import { NS, formLabels } from "./locales.ts";
import type { TranslationFormInjected } from "./preferences-form.ts";
import css from "./Translation.module.css";
/** Settings snapshots and explicit refresh callback supplied by the Host mirror. */
export interface TranslationSettingsInjected extends TranslationFormInjected {
  hooks: TranslationFormInjected["hooks"] & {
    availableProviders: HostObservable<readonly TranslationProvider[]>;
  };
  /** Refresh native route eligibility without sending reasoning or starting inference. */
  refreshProviders: () => void;
}
export type TranslationSettingsProps = PropsRuntime<"plugins.bundle.config"> &
  PropsLocale<typeof NS> &
  InjectFace<TranslationSettingsInjected>;
function providerLabel(provider: string, t: TranslationSettingsProps["t"]): string {
  switch (provider) {
    case "bing":
      return t("bing");
    case "google":
      return t("google");
    case "deepseek-account":
      return t("deepseekAccount");
    case "deepseek-official":
      return t("deepseekOfficial");
    default:
      return provider;
  }
}
/**
 * Render staged translation preferences and name which text leaves the Host.
 * @param props - current draft fields, accepted-value metadata, and save actions.
 * @returns the bundle's translation preferences.
 */
export const TranslationSettings = defineComponent(
  (props: TranslationSettingsProps) => {
    const t = computed(() => props.t);
    const providerId = useId();
    const languageId = useId();
    const state = props.useTranslationForm((value) => value);
    const availableProviders = props.useAvailableProviders((value) => value);
    const missingProvider = computed(
      () =>
        state.value.provider.text !== "" &&
        !availableProviders.value.some((provider) => provider === state.value.provider.text),
    );
    const paid = computed(
      () =>
        state.value.provider.text === "deepseek-account" ||
        state.value.provider.text === "deepseek-official",
    );
    const disabled = computed(() => !state.value.writable || state.value.saving);
    onMounted(() =>
      watch(
        [() => props.refreshProviders],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            props.refreshProviders();
          })();
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    return () =>
      h(
        SettingsForm,
        {
          labels: formLabels(t.value),
          state: state.value,
          onSave: props.save,
          onDiscard: props.discard,
        },
        {
          default: () => [
            h(
              "p",
              {
                class: css.notice,
              },
              [t.value("privacy")],
            ),
            h(
              "p",
              {
                class: css.notice,
              },
              [t.value(paid.value ? "paidNotice" : "anonymousNotice")],
            ),
            h(
              "div",
              {
                class: css.field,
              },
              [
                h(
                  "div",
                  {
                    class: css.toolbar,
                  },
                  [
                    h(
                      "label",
                      {
                        htmlFor: providerId,
                      },
                      [t.value("provider")],
                    ),
                    state.value.provider.overridden &&
                      h(Fragment, null, [
                        h(
                          Tag,
                          {
                            tone: "neutral",
                          },
                          {
                            default: () => [t.value("overridden")],
                          },
                        ),
                        h(
                          Button,
                          {
                            size: "sm",
                            disabled: disabled.value,
                            onClick: () => {
                              props.resetField("provider");
                            },
                          },
                          {
                            default: () => [t.value("reset")],
                          },
                        ),
                      ]),
                  ],
                ),
                h(
                  "select",
                  {
                    id: providerId,
                    value: state.value.provider.text,
                    disabled: disabled.value,
                    "aria-invalid": state.value.provider.invalid || undefined,
                    onChange: (event: Event) => {
                      if (event.target instanceof HTMLSelectElement)
                        props.edit("provider", event.target.value);
                    },
                  },
                  [
                    missingProvider.value &&
                      h(
                        "option",
                        {
                          value: state.value.provider.text,
                          disabled: true,
                        },
                        [
                          t.value("providerUnavailableOption", {
                            provider: providerLabel(state.value.provider.text, t.value),
                          }),
                        ],
                      ),
                    availableProviders.value.map((provider) =>
                      h(
                        "option",
                        {
                          key: provider,
                          value: provider,
                        },
                        [providerLabel(provider, t.value)],
                      ),
                    ),
                  ],
                ),
                state.value.provider.invalid &&
                  h(
                    "p",
                    {
                      role: "status",
                    },
                    [t.value("invalidProvider")],
                  ),
                missingProvider.value &&
                  !state.value.provider.invalid &&
                  h(
                    "p",
                    {
                      role: "status",
                      class: css.notice,
                    },
                    [t.value("providerUnavailable")],
                  ),
              ],
            ),
            h(SettingsValueField, {
              id: languageId,
              label: t.value("targetLanguage"),
              hint: t.value("targetLanguageHint"),
              ...state.value.targetLanguage,
              overriddenLabel: t.value("overridden"),
              resetLabel: t.value("reset"),
              invalidLabel: t.value("invalidLanguage"),
              disabled: disabled.value,
              onEdit: (value) => {
                props.edit("targetLanguage", value);
              },
              onReset: () => {
                props.resetField("targetLanguage");
              },
            }),
          ],
        },
      );
  },
  {
    props: [
      "t",
      "useTranslationForm",
      "useAvailableProviders",
      "refreshProviders",
      "save",
      "discard",
      "resetField",
      "edit",
    ],
    inheritAttrs: false,
  },
);
