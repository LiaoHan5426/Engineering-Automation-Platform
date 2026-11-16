/** The worktree service's row page on the Plugins page: the archive cleanup switch. */
import { defineComponent, h, useId } from "vue";
import { SettingsForm, Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import type { SettingsFormLabels } from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import type { NS } from "./locales.ts";
import type { WorktreeSettingsInjected } from "./worktree-settings-form.ts";
import css from "./WorktreeSettings.module.css";
export type WorktreeSettingsProps = PropsRuntime<"plugins.row.config"> &
  PropsLocale<typeof NS> &
  InjectFace<WorktreeSettingsInjected>;
function formLabels(t: WorktreeSettingsProps["t"]): SettingsFormLabels {
  return {
    unavailable: t("settings.unavailable"),
    readOnly: t("settings.readOnly"),
    saveFailed: t("settings.saveFailed"),
    save: t("settings.save"),
    saving: t("settings.saving"),
  };
}
/**
 * Render the worktree row's configuration: one switch that keeps every
 * checkout when its Session is archived. The summary view names the switch.
 * @param props - the Plugins page view, the staged form, and its actions.
 * @returns the row page's form, or the summary line.
 */
export const WorktreeSettings = defineComponent(
  (props: WorktreeSettingsProps) => {
    const state = props.useWorktreeForm((value) => value);
    const id = useId();
    return () => {
      const { t } = props;
      if (props.view === "summary") return t("settings.retainOnArchive.title");
      const disabled = !state.value.writable || state.value.saving;
      return h(
        SettingsForm,
        { labels: formLabels(t), state: state.value, onSave: props.save, onDiscard: props.discard },
        {
          default: () => [
            h("div", { class: css.row }, [
              h("div", { class: css.text }, [
                h("label", { class: css.title, for: id }, [t("settings.retainOnArchive.title")]),
                h("p", { class: css.description }, [t("settings.retainOnArchive.description")]),
              ]),
              h(
                Switch,
                {
                  checked: state.value.retainOnArchive.text === "true",
                  disabled: disabled,
                  label: t("settings.retainOnArchive.title"),
                  onChange: (next) => {
                    props.edit("retainOnArchive", next ? "true" : "false");
                  },
                },
                undefined,
              ),
            ]),
          ],
        },
      );
    };
  },
  { props: ["view", "t", "useWorktreeForm", "save", "discard", "edit"], inheritAttrs: false },
);
