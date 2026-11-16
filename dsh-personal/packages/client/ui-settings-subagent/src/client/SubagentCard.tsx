import { defineComponent, h, useId } from "vue";
/** One settings card for Subagent delegation limits and model authorization. */
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { SettingsForm } from "@deepseek-ai/dsh-client-ui-primitives";
import { formLabels } from "./locales.ts";
import { SubagentLimitsFields } from "./SubagentLimitsFields.tsx";
import { SubagentModelSelectionFields } from "./SubagentModelSelectionFields.tsx";
import { subagentCardShell, type SubagentCardFace } from "./subagent-card-controller.ts";
import css from "./SubagentCard.module.css";
/** Framework-derived props for the shared Subagent settings card. */
export type SubagentCardProps = PropsRuntime<"plugins.item"> &
  PropsLocale<"settings.subagent"> &
  InjectFace<SubagentCardFace>;
/**
 * Render the available Subagent settings with one configuration page and save footer.
 * @param props - Locale, both form snapshots, and their shared actions.
 * @returns The summary or the available settings form.
 */
export const SubagentCard = defineComponent(
  (props: SubagentCardProps) => {
    const limits = props.useSubagentLimitsCard((snapshot) => snapshot);
    const models = props.useSubagentModelSelectionCard((snapshot) => snapshot);
    const headingId = useId();
    return () => {
      const { t } = props;
      if (props.view === "summary") return t("subagentDescription");
      const state = subagentCardShell(limits.value, models.value);
      return h(
        SettingsForm,
        { labels: formLabels(t), state: state, onSave: props.save, onDiscard: props.discard },
        {
          default: () => [
            limits.value.available
              ? h("section", { class: css.section, "aria-labelledby": `${headingId}-limits` }, [
                  h("h3", { class: css.heading, id: `${headingId}-limits` }, [
                    t("subagentLimitsTitle"),
                  ]),
                  h(SubagentLimitsFields, {
                    t: t,
                    state: { ...limits.value, saving: state.saving },
                    edit: props.editLimit,
                    resetField: props.resetLimit,
                  }),
                ])
              : null,
            models.value.available
              ? h("section", { class: css.section, "aria-labelledby": `${headingId}-models` }, [
                  h("h3", { class: css.heading, id: `${headingId}-models` }, [
                    t("subagentModelSelectionTitle"),
                  ]),
                  h(SubagentModelSelectionFields, {
                    t: t,
                    state: { ...models.value, saving: state.saving },
                    toggleEnabled: props.toggleEnabled,
                    toggleModel: props.toggleModel,
                    retryCatalog: props.retryCatalog,
                  }),
                ])
              : null,
          ],
        },
      );
    };
  },
  {
    props: [
      "view",
      "t",
      "useSubagentLimitsCard",
      "useSubagentModelSelectionCard",
      "save",
      "discard",
      "editLimit",
      "resetLimit",
      "toggleEnabled",
      "toggleModel",
      "retryCatalog",
    ],
  },
);
