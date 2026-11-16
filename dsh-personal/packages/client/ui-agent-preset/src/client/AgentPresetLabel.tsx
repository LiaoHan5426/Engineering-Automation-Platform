import { defineComponent, h, watch } from "vue";
/**
 * The session header's agent-preset label.
 *
 * Read-only by construction: a session's composition is fixed once its
 * conversation starts, and a header is only worth reading after that. Offering
 * a control here would promise a switch the host refuses; naming what the
 * session runs is the honest affordance, and the choice itself lives on the
 * new-session screen ({@link AgentPresetSeat}).
 */
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { IconAgentPresetOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import type { AgentPresetSettingsState } from "./settings-store.ts";
import { presetDisplayText } from "./locales.ts";
import css from "./AgentPresetLabel.module.css";
/** Registration-side business face for the header label. */
export interface AgentPresetLabelInjected {
  hooks: {
    /** Roster snapshot bound by the renderer as useAgentPresets. */
    agentPresets: SnapshotStore<AgentPresetSettingsState>;
  };
  /** Read the roster, so the label can show a name rather than an id. */
  load: () => Promise<void>;
}
/** Full component props. */
export type AgentPresetLabelProps = PropsRuntime<"conversation.session.header.actions"> &
  PropsLocale<"settings.agentPreset"> &
  InjectFace<AgentPresetLabelInjected>;
/**
 * Render this session's agent-preset name beside its title.
 * @param props - composed slot props.
 * @returns the label, or null when the session records no preset.
 */
export const AgentPresetLabel = defineComponent(
  (props: AgentPresetLabelProps) => {
    const { useSessions, useAgentPresets } = props;
    const preset = useSessions((state) => {
      const value = state.byId[props.sessionId]?.projectionValues?.agentPreset;
      return typeof value === "string" ? value : undefined;
    });
    const options = useAgentPresets((state) => state.options);
    watch(
      () => [preset.value, props.load],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          // Deployments that compose no presets never label anything, so the roster
          // is only worth a request once a session reports one.
          if (preset.value !== undefined) void props.load();
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
    return () => {
      const { t } = props;
      if (preset.value === undefined) return null;
      const option = options.value.find((entry) => entry.id === preset.value);
      const text = option === undefined ? undefined : presetDisplayText(option, t);
      return h("span", { class: css.label, title: text?.description ?? t("headerHint") }, [
        h(IconAgentPresetOutlineRegular, { size: 14, className: css.icon ?? "" }),
        text?.name ?? preset.value,
      ]);
    };
  },
  { props: ["sessionId", "useSessions", "useAgentPresets", "load", "t"] },
);
