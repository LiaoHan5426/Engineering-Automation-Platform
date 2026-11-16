/** The shell executor's settings page: the limits every command the agent runs is bound by. */

import { defineComponent, h } from "vue";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import { SettingsForm, SettingsValueField } from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { formLabels } from "./locales.ts";
import type { ShellCardFace } from "./shell-card-controller.ts";

/** Props the renderer binds for the shell page. */
export type ShellCardProps = PropsRuntime<"plugins.item"> &
  PropsLocale<"settings.shell"> &
  InjectFace<ShellCardFace>;

/** Render the shell executor summary or its editable limits, using one setup-owned selector. */
export const ShellCard = defineComponent(
  (props: ShellCardProps) => {
    const snapshot = props.useShellCard((state) => state);
    return () => {
      const { t } = props;
      const state = snapshot.value;
      if (props.view === "summary") return t("description");
      const disabled = !state.writable;
      return h(
        SettingsForm,
        { labels: formLabels(t), state, onSave: props.save, onDiscard: props.discard },
        {
          default: () => [
            h(SettingsValueField, {
              id: "plugin-config-shell-timeout",
              label: t("timeoutMs"),
              hint: t("timeoutMsHint"),
              overriddenLabel: t("overridden"),
              resetLabel: t("reset"),
              invalidLabel: t("invalidNumber"),
              numeric: true,
              disabled,
              ...state.timeoutMs,
              onEdit: (text: string) => {
                props.edit("timeoutMs", text);
              },
              onReset: () => {
                props.resetField("timeoutMs");
              },
            }),
            h(SettingsValueField, {
              id: "plugin-config-shell-output",
              label: t("maxOutputBytes"),
              hint: t("maxOutputBytesHint"),
              overriddenLabel: t("overridden"),
              resetLabel: t("reset"),
              invalidLabel: t("invalidNumber"),
              numeric: true,
              disabled,
              ...state.maxOutputBytes,
              onEdit: (text: string) => {
                props.edit("maxOutputBytes", text);
              },
              onReset: () => {
                props.resetField("maxOutputBytes");
              },
            }),
          ],
        },
      );
    };
  },
  {
    name: "ShellCard",
    inheritAttrs: false,
    props: ["view", "t", "useShellCard", "save", "discard", "edit", "resetField"],
  },
);
