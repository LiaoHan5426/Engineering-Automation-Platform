import { normalizeClass, computed, defineComponent, h, onMounted, shallowRef, watch } from "vue";
import type { Ref } from "vue";
/** Work-purpose selection with controlled, independently selectable cards. */
import {
  Button,
  FileTypeIcon,
  IconCheckOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { OnboardingPurpose } from "../onboarding-settings.ts";
import type { DesktopOnboardingProps } from "./onboarding-contract.ts";
import officeIcon from "./assets/onboarding-office.svg";
import codeIcon from "./assets/onboarding-code.svg";
import css from "./DesktopOnboarding.module.css";
/** @param props - selected purposes, localized copy and persistence callbacks. @returns the purpose step. */
export const OnboardingPurposeStep = defineComponent(
  (
    componentProps: Pick<DesktopOnboardingProps, "t"> & {
      heading: Ref<HTMLHeadingElement | null>;
      busy: boolean;
      purpose: OnboardingPurpose | null;
      onSelect: (value: OnboardingPurpose | null) => void;
      onContinue: () => void;
    },
  ) => {
    const selected = (value: "office" | "development") =>
      componentProps.purpose === value || componentProps.purpose === "both";
    const toggle = (value: "office" | "development") => {
      if (componentProps.busy) return;
      const office = value === "office" ? !selected("office") : selected("office");
      const development =
        value === "development" ? !selected("development") : selected("development");
      componentProps.onSelect(
        office && development ? "both" : office ? "office" : development ? "development" : null,
      );
    };
    return () => {
      const render_prop_heading = componentProps.heading;
      const render_prop_t = componentProps.t;
      const render_prop_purpose = componentProps.purpose;
      const render_prop_busy = componentProps.busy;
      const render_prop_onContinue = componentProps.onContinue;
      return h("div", { class: `${css.content} ${css.purpose}` }, [
        h("div", { class: css.copy }, [
          h("h1", { id: "desktop-onboarding-title", ref: render_prop_heading, tabIndex: -1 }, [
            render_prop_t("onboardingPurposePrefix"),
            " ",
            h("em", { class: css.brand }, [render_prop_t("onboardingBrand")]),
            " ",
            render_prop_t("onboardingPurposeSuffix"),
          ]),
          h("p", { class: css.subtitle }, [render_prop_t("onboardingPurposeDescription")]),
        ]),
        h("div", { class: css.purposeCards }, [
          (["office", "development"] as const).map((value) =>
            h(PurposeCard, {
              key: value,
              purpose: value,
              checked: selected(value),
              t: render_prop_t,
              onToggle: () => {
                toggle(value);
              },
            }),
          ),
        ]),
        h("div", { class: css.primaryAction }, [
          render_prop_purpose !== null &&
            h(
              Button,
              {
                className: normalizeClass(css.action),
                variant: "primary",
                "aria-disabled": render_prop_busy,
                onClick: () => {
                  if (!render_prop_busy) render_prop_onContinue();
                },
              },
              {
                default: () => render_prop_t("onboardingContinue"),
              },
            ),
        ]),
      ]);
    };
  },
  { inheritAttrs: false, props: ["t", "heading", "busy", "purpose", "onSelect", "onContinue"] },
);
const PurposeCard = defineComponent(
  (componentProps: {
    purpose: "office" | "development";
    checked: boolean;
    t: DesktopOnboardingProps["t"];
    onToggle: () => void;
  }) => {
    const previous = shallowRef(componentProps.checked);
    const enteringRef = shallowRef(false);
    const setEntering = (
      value:
        | typeof enteringRef.value
        | ((previous: typeof enteringRef.value) => typeof enteringRef.value),
    ): void => {
      enteringRef.value = typeof value === "function" ? value(enteringRef.value) : value;
    };
    onMounted(() => {
      watch(
        () => [componentProps.checked],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            setEntering(componentProps.checked && !previous.value);
            previous.value = componentProps.checked;
          })();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    const titleKeyRef = computed(() =>
      componentProps.purpose === "office" ? "onboardingOffice" : "onboardingDevelopment",
    );
    return () => {
      const render_enteringRef = enteringRef.value;
      const render_titleKeyRef = titleKeyRef.value;
      const render_prop_checked = componentProps.checked;
      const render_prop_purpose = componentProps.purpose;
      const render_prop_t = componentProps.t;
      const render_prop_onToggle = componentProps.onToggle;
      return h(
        "div",
        {
          class: `${css.card} ${render_prop_checked ? css.selected : ""} ${render_prop_purpose === "office" ? css.officeCard : ""}`,
        },
        [
          h("div", { class: css.cardTop }, [
            render_prop_checked
              ? h(
                  "span",
                  {
                    class: `${css.fileIcons} ${render_enteringRef ? css.iconsEntering : ""}`,
                    "aria-hidden": "true",
                  },
                  [
                    (render_prop_purpose === "office"
                      ? (["word", "ppt", "excel", "pdf", "image"] as const)
                      : (["typescript", "javascript", "sql", "python", "cpp"] as const)
                    ).map((kind) => h(FileTypeIcon, { key: kind, kind: kind, size: 28 })),
                  ],
                )
              : h("img", {
                  src: render_prop_purpose === "office" ? officeIcon : codeIcon,
                  width: 40,
                  height: 40,
                  alt: "",
                }),
            h("label", { class: css.cardCheckbox }, [
              h("input", {
                type: "checkbox",
                "aria-label": render_prop_t(render_titleKeyRef),
                checked: render_prop_checked,
                onChange: render_prop_onToggle,
              }),
              h("span", { class: css.indicator, "aria-hidden": "true" }, [
                h(IconCheckOutlineRegular, null),
              ]),
            ]),
          ]),
          h("span", { class: css.cardTitle }, [render_prop_t(render_titleKeyRef)]),
          h("span", { class: css.cardDescription }, [
            render_prop_t(
              render_prop_purpose === "office"
                ? "onboardingOfficeDescription"
                : "onboardingDevelopmentDescription",
            ),
          ]),
        ],
      );
    };
  },
  { inheritAttrs: false, props: ["purpose", "checked", "t", "onToggle"] },
);
