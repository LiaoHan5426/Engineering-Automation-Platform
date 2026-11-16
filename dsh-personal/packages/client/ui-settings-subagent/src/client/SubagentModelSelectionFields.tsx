import { defineComponent, h, Fragment } from "vue";
/** User control for model-selectable subagent delegation in new sessions. */
import { Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type {
  SubagentModelCandidate,
  SubagentModelSelectionCardFace,
  SubagentModelSelectionCardState,
} from "./subagent-model-selection-card-controller.ts";
import css from "./SubagentModelSelectionFields.module.css";
/** Plain model state and callbacks supplied by the owning Subagent card. */
export type SubagentModelSelectionFieldsProps = PropsLocale<"settings.subagent"> &
  Pick<SubagentModelSelectionCardFace, "toggleEnabled" | "toggleModel" | "retryCatalog"> & {
    state: SubagentModelSelectionCardState;
  };
/**
 * Render the default-off preference and its exact adapter-route choices.
 * @param props - locale copy, the card snapshot, and its toggle action.
 * @returns the model permission and route choices inside the shared card.
 */
export const SubagentModelSelectionFields = defineComponent(
  (props: SubagentModelSelectionFieldsProps) => {
    return () => {
      const { t, state } = props;
      const availableGroups = new Map<
        string,
        {
          providerName: string;
          candidates: SubagentModelCandidate[];
        }
      >();
      const unavailable: SubagentModelCandidate[] = [];
      for (const candidate of state.candidates) {
        if (!candidate.available) {
          unavailable.push(candidate);
          continue;
        }
        const group = availableGroups.get(candidate.provider);
        if (group === undefined) {
          availableGroups.set(candidate.provider, {
            providerName: candidate.providerName,
            candidates: [candidate],
          });
        } else {
          group.candidates.push(candidate);
        }
      }
      const renderCandidate = (candidate: SubagentModelCandidate) =>
        h("label", { key: candidate.key, class: css.model }, [
          h("input", {
            type: "checkbox",
            checked: candidate.selected,
            disabled: !state.writable || state.saving,
            onChange: () => {
              props.toggleModel(candidate.key);
            },
          }),
          h("span", null, [
            h("span", { class: css.modelName }, [candidate.modelName]),
            h("span", { class: css.route }, [
              `${candidate.providerName} · ${candidate.provider}/${candidate.model}`,
            ]),
          ]),
          !candidate.available
            ? h("span", { class: css.unavailable }, [t("subagentModelSelectionUnavailable")])
            : null,
        ]);
      return h(Fragment, null, [
        h("div", { class: css.permission }, [
          h("div", { class: css.toggleRow }, [
            h("span", { class: css.toggleLabel }, [t("subagentModelSelectionToggle")]),
            h(Switch, {
              checked: state.enabled,
              label: t("subagentModelSelectionToggle"),
              disabled: !state.writable || state.saving,
              onChange: props.toggleEnabled,
            }),
          ]),
          h("p", { class: css.hint }, [
            t(state.enabled ? "subagentModelSelectionChoose" : "subagentModelSelectionOff"),
          ]),
        ]),
        state.enabled
          ? h("div", { class: css.selection }, [
              state.catalogStatus === "loading"
                ? h("p", { class: css.notice, role: "status" }, [
                    t("subagentModelSelectionLoading"),
                  ])
                : null,
              state.catalogStatus === "error"
                ? h("div", { class: css.catalogError, role: "alert" }, [
                    h("span", null, [t("subagentModelSelectionLoadFailed")]),
                    h(
                      "button",
                      { type: "button", disabled: state.saving, onClick: props.retryCatalog },
                      [t("subagentModelSelectionRetry")],
                    ),
                  ])
                : null,
              state.catalogPartial
                ? h("p", { class: css.notice }, [t("subagentModelSelectionPartial")])
                : null,
              state.candidates.length > 0
                ? h("fieldset", { class: css.models }, [
                    h("legend", null, [t("subagentModelSelectionAllowed")]),
                    [...availableGroups].map(([provider, group]) =>
                      h("div", { key: provider, class: css.modelGroup }, [
                        h("div", { class: css.providerName }, [group.providerName]),
                        group.candidates.map(renderCandidate),
                      ]),
                    ),
                    unavailable.length > 0
                      ? h("div", { class: css.modelGroup }, [
                          h("div", { class: css.providerName }, [
                            t("subagentModelSelectionUnavailableGroup"),
                          ]),
                          unavailable.map(renderCandidate),
                        ])
                      : null,
                  ])
                : state.catalogStatus === "ready"
                  ? h("p", { class: css.notice }, [t("subagentModelSelectionEmpty")])
                  : null,
              state.invalid
                ? h("p", { class: css.invalid }, [t("subagentModelSelectionRequired")])
                : null,
            ])
          : null,
        state.conflicted
          ? h("p", { class: css.conflict, role: "status" }, [t("subagentModelSelectionConflict")])
          : null,
      ]);
    };
  },
  { props: ["t", "state", "toggleEnabled", "toggleModel", "retryCatalog"] },
);
