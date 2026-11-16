/** General Settings control for shared developer-tool visibility and previews. */
import { h, defineComponent, shallowRef } from "vue";
import { Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ObservableSnapshot } from "@deepseek-ai/dsh-client-store";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import css from "./DeveloperToolsRow.module.css";
/** Accepted setting and ordered mutation supplied by the settings owner. */
export interface DeveloperToolsRowInjected {
  hooks: {
    developerTools: ObservableSnapshot<boolean>;
  };
  setEnabled(enabled: boolean): Promise<void>;
}
type DeveloperToolsRowProps = PropsRuntime<"settings.general.item"> &
  PropsLocale<"settings"> &
  InjectFace<DeveloperToolsRowInjected>;
/**
 * Render the developer-tool toggle.
 * @param props - accepted preference, writer and localized copy.
 * @returns the General Settings row.
 */
export const DeveloperToolsRow = defineComponent(
  (props: DeveloperToolsRowProps) => {
    const enabled = props.useDeveloperTools((value) => value);
    const busy = shallowRef(false);
    const failed = shallowRef(false);
    return () =>
      h("div", { class: css.row }, [
        h("div", [
          h("div", { class: css.title }, [props.t("developerTools.title")]),
          h("div", { class: css.description }, [props.t("developerTools.description")]),
          failed.value ? h("div", { role: "alert" }, [props.t("developerTools.error")]) : null,
        ]),
        h(Switch, {
          checked: enabled.value,
          disabled: busy.value,
          label: props.t("developerTools.title"),
          onChange: (next: boolean) => {
            failed.value = false;
            busy.value = true;
            void props
              .setEnabled(next)
              .catch(() => {
                failed.value = true;
              })
              .finally(() => {
                busy.value = false;
              });
          },
        }),
      ]);
  },
  { inheritAttrs: false, props: ["useDeveloperTools", "setEnabled", "t"] },
);
