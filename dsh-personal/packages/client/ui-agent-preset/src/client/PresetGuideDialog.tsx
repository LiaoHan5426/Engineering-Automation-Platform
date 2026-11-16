import { defineComponent, h, shallowRef, watch, useId, nextTick } from "vue";
/** Read-only help stays local to Settings and never changes the selected preset. */
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import {
  Button,
  IconCloseOutlineRegular,
  IconListPenOutlineRegular,
  MarkdownText,
  Modal,
  SegmentedTabs,
  Tag,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { AgentPresetSettingsKey } from "./locales.ts";
import css from "./PresetGuideDialog.module.css";
export type PresetGuidePage = "explanation" | "usage";
/** Locale references for one known, shipped preset. */
interface PresetGuide {
  name: AgentPresetSettingsKey;
  intro: AgentPresetSettingsKey;
  explanation: AgentPresetSettingsKey;
  usage: AgentPresetSettingsKey;
}
const guides = new Map<string, PresetGuide>([
  [
    "standard",
    {
      name: "presetStandardName",
      intro: "guideStandardIntro",
      explanation: "guideStandardExplanation",
      usage: "guideStandardUsage",
    },
  ],
  [
    "ptc",
    {
      name: "presetPtcName",
      intro: "guidePtcIntro",
      explanation: "guidePtcExplanation",
      usage: "guidePtcUsage",
    },
  ],
  [
    "minimal",
    {
      name: "presetMinimalName",
      intro: "guideMinimalIntro",
      explanation: "guideMinimalExplanation",
      usage: "guideMinimalUsage",
    },
  ],
  [
    "cordis",
    {
      name: "presetCordisName",
      intro: "guideCordisIntro",
      explanation: "guideCordisExplanation",
      usage: "guideCordisUsage",
    },
  ],
]);
/**
 * Look up help only for known, shipped presets.
 * @param id - preset identifier from the roster.
 * @param trust - roster source; custom presets own their capability claims.
 * @returns the shipped guide, or undefined for unknown and custom presets.
 */
export function presetGuide(id: string, trust: string): PresetGuide | undefined {
  return trust === "system" ? guides.get(id) : undefined;
}
/** Keep keyboard focus inside a preset reader while Tab moves through its controls.
 * @param event Keyboard event from the active reader.
 */
export function trapPresetReaderTab(event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const targets = Array.from(
    (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]',
    ),
  ).filter((element) => !element.closest("[hidden]"));
  const first = targets[0];
  const last = targets[targets.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
/** Curated usage dictionaries contain only level-three example sections. */
const GuideUsage = defineComponent(
  (props: { text: string; t: TranslateNS<"settings.agentPreset"> }) => {
    return () => {
      const { text, t } = props;
      const labels = {
        code: {
          copyLabel: t("guideCopy"),
          copiedLabel: t("guideCopied"),
          toolbarLabels: {
            codeLabel: t("codeBlock.title"),
            wrapLabel: t("codeBlock.wrap"),
            unwrapLabel: t("codeBlock.unwrap"),
          },
        },
        footnotes: t("guideFootnotes"),
      };
      return text.split(/(?=^### )/m).map((section) => {
        const headingEnd = section.indexOf("\n");
        const title = section.slice(4, headingEnd);
        return h("section", { key: title, class: css.guideExample }, [
          h("div", { class: css.guideExampleHeader }, [
            h("h3", null, [title]),
            h(
              Tag,
              { tone: "neutral", className: css.guideExampleTag ?? "" },
              {
                default: () => [h(IconListPenOutlineRegular, { size: 12 }), t("guideExampleTask")],
              },
            ),
          ]),
          h(MarkdownText, { text: section.slice(headingEnd + 1), labels: labels }),
        ]);
      });
    };
  },
  { props: ["text", "t"] },
);
/**
 * Open read-only help without changing the selected preset.
 * @param props - localized guide, initial page, and close callback.
 * @returns the modal reader with independent scroll positions for each page.
 */
export const PresetGuideDialog = defineComponent(
  (props: {
    guide: PresetGuide;
    initialPage: PresetGuidePage;
    t: TranslateNS<"settings.agentPreset">;
    onClose: () => void;
  }) => {
    const { initialPage, onClose } = props;
    const page = shallowRef(initialPage);
    const setPage = (
      next: typeof page.value | ((previous: typeof page.value) => typeof page.value),
    ) => {
      page.value = typeof next === "function" ? next(page.value) : next;
    };
    const guideId = useId();
    const content = shallowRef<HTMLDivElement | null>(null);
    watch(
      () => content.value,
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          if (content.value !== null)
            void nextTick(() =>
              content.value
                ?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
                ?.focus(),
            );
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
    // This reader sits above Settings. Keep keyboard navigation in the reader,
    // and let Escape dismiss only this layer before returning to its trigger.
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else trapPresetReaderTab(event);
    };
    return () => {
      const { guide, t, onClose } = props;
      return h(
        Modal,
        {
          open: true,
          headless: true,
          onClose: onClose,
          title: t(guide.name),
          className: (css.guideDialog ?? "") as string,
        },
        {
          default: () => [
            h(
              "div",
              {
                ref: content,
                class: css.guideLayout,
                role: "presentation",
                onKeydownCapture: onKeydown,
              },
              [
                h("div", { class: css.guideHeader }, [
                  h("div", { class: css.guideTitleRow }, [
                    h("h2", { class: css.guideTitle }, [t(guide.name)]),
                    h(
                      Button,
                      {
                        variant: "ghost",
                        className: css.guideClose ?? "",
                        "aria-label": t("close"),
                        onClick: onClose,
                      },
                      { default: () => [h(IconCloseOutlineRegular, { size: 18 })] },
                    ),
                  ]),
                  h("p", { class: css.guideIntro }, [t(guide.intro)]),
                ]),
                h(SegmentedTabs, {
                  className: css.guideTabs ?? "",
                  label: t("guideSections"),
                  value: page.value,
                  onChange: (value: string) => {
                    if (value === "explanation" || value === "usage") setPage(value);
                  },
                  items: [
                    {
                      value: "explanation",
                      label: t("modeExplanation"),
                      id: `${guideId}-explanation-tab`,
                      panelId: `${guideId}-explanation-panel`,
                    },
                    {
                      value: "usage",
                      label: t("howToUse"),
                      id: `${guideId}-usage-tab`,
                      panelId: `${guideId}-usage-panel`,
                    },
                  ],
                }),
                (["explanation", "usage"] as const).map((section) =>
                  h(
                    "div",
                    {
                      key: section,
                      id: `${guideId}-${section}-panel`,
                      role: "tabpanel",
                      "aria-labelledby": `${guideId}-${section}-tab`,
                      class: css.guidePanel,
                      "data-guide-page": section,
                      hidden: page.value !== section,
                      tabIndex: 0,
                    },
                    [
                      section === "usage"
                        ? h(GuideUsage, { text: t(guide.usage), t: t })
                        : h(MarkdownText, {
                            text: t(guide.explanation),
                            labels: {
                              code: {
                                copyLabel: t("guideCopy"),
                                copiedLabel: t("guideCopied"),
                                toolbarLabels: {
                                  codeLabel: t("codeBlock.title"),
                                  wrapLabel: t("codeBlock.wrap"),
                                  unwrapLabel: t("codeBlock.unwrap"),
                                },
                              },
                              footnotes: t("guideFootnotes"),
                            },
                          }),
                    ],
                  ),
                ),
              ],
            ),
          ],
        },
      );
    };
  },
  { props: ["guide", "initialPage", "t", "onClose"] },
);
