import { defineComponent, h, watch } from "vue";
/** Create a plugin through the existing Creator flow from the Add plugin menu. */
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import {
  IconAgentPresetOutlineRegular,
  MenuItemButton,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { AgentPresetSettingsState } from "./settings-store.ts";
import css from "./CreatePluginMenuItem.module.css";
/** Roster and navigation supplied by the preset plugin. */
export interface CreatePluginMenuItemInjected {
  hooks: {
    agentPresets: SnapshotStore<AgentPresetSettingsState>;
  };
  load: () => Promise<void>;
  startCreatorDraft: () => void;
}
type CreatePluginMenuItemProps = PropsRuntime<"plugins.add.actions"> &
  PropsLocale<"settings.agentPreset"> &
  InjectFace<CreatePluginMenuItemInjected>;
/**
 * Close the Add plugin menu before opening Creator without sending a message.
 * @param props - locale, roster, dismissal and navigation callbacks.
 * @returns a stable menu item that explains why Creator is unavailable.
 */
export const CreatePluginMenuItem = defineComponent(
  (props: CreatePluginMenuItemProps) => {
    const { useAgentPresets } = props;
    const roster = useAgentPresets((state) => state);
    watch(
      () => [props.load],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          void props.load();
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
    return () => {
      const { t, onDismiss, startCreatorDraft } = props;
      const enabled =
        roster.value.status === "ready" &&
        roster.value.options.some((option) => option.id === "cordis");
      let description = t("createPluginDescription");
      if (roster.value.status === "idle" || roster.value.status === "loading")
        description = t("createPluginChecking");
      else if (roster.value.status === "error" || roster.value.status === "unavailable")
        description = t("createPluginUnavailable");
      else if (!enabled) description = t("createPluginMissing");
      return h(
        MenuItemButton,
        {
          disabled: !enabled,
          onSelect: () => {
            if (!enabled) return;
            onDismiss();
            startCreatorDraft();
          },
        },
        {
          icon: () => h(IconAgentPresetOutlineRegular, { size: 14 }),
          default: () => [
            h("span", { class: css.copy }, [
              h("span", null, [t("createPlugin")]),
              h("span", { class: css.description, title: description }, [description]),
            ]),
          ],
        },
      );
    };
  },
  { props: ["t", "useAgentPresets", "load", "onDismiss", "startCreatorDraft"] },
);
