/** Provider-owned preparation steps and persisted recognition preferences. */
import { defineComponent, h, Fragment, shallowRef, watch } from "vue";
import {
  Button,
  DisclosureRow,
  IconChevronDownOutlineRegular,
  StateDot,
  type StateDotState,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type {
  SpeechPreparationState,
  SpeechProviderId,
  SpeechProviderView,
  SpeechSelectionPatch,
} from "@deepseek-ai/dsh-experimental-speech-to-text/types";
import type { VoiceInputInjected } from "./VoiceInput.tsx";
import { MicrophonePicker } from "./MicrophonePicker.tsx";
import { NS } from "./locales.ts";
import css from "./VoiceInput.module.css";
/** One recognizer's resource readiness and explicit preparation controls. */
export type PreparationCardProps = Pick<
  InjectFace<VoiceInputInjected>,
  "prepare" | "cancelPreparation"
> &
  PropsLocale<typeof NS> & {
    readonly provider: SpeechProviderView;
    readonly connected: boolean;
  };
function preparationTone(state: SpeechPreparationState): StateDotState {
  if (state.phase === "ready" || state.phase === "standby") return "done";
  if (state.phase === "failed") return "error";
  if (state.phase === "unprepared" || state.phase === "cancelled") return "idle";
  return "ongoing";
}
function byteText(
  state: Extract<
    SpeechPreparationState,
    {
      phase: "downloading";
    }
  >,
  t: PropsLocale<typeof NS>["t"],
): string {
  return state.totalBytes === undefined
    ? t("downloadUnknown", { completed: (state.completedBytes / 1000000).toFixed(1) })
    : t("downloadBytes", {
        completed: (state.completedBytes / 1000000).toFixed(1),
        total: (state.totalBytes / 1000000).toFixed(1),
        percent: String(Math.floor((state.completedBytes / state.totalBytes) * 100)),
      });
}
function DownloadProgress({
  state,
  t,
}: {
  state: SpeechPreparationState;
} & PropsLocale<typeof NS>) {
  return state.phase === "downloading" && state.totalBytes !== undefined
    ? h(
        "progress",
        {
          class: css.progress,
          "aria-label": t("downloadProgress"),
          value: state.completedBytes,
          max: state.totalBytes,
        },
        undefined,
      )
    : null;
}
function PreparationFailure({
  state,
  t,
}: {
  state: Extract<
    SpeechPreparationState,
    {
      phase: "failed";
    }
  >;
} & PropsLocale<typeof NS>) {
  const failure = state.download;
  if (!failure)
    return h("p", { class: css.preparationError, role: "alert" }, [
      t("preparationFailed", { message: state.message }),
    ]);
  return h("div", { class: css.downloadFailure, role: "alert" }, [
    h("p", { class: css.preparationError }, [
      t(`download.${failure.reason}`, {
        resource: failure.resource,
        status: String(failure.status),
      }),
    ]),
    h("p", undefined, [t(`downloadAdvice.${failure.reason}`)]),
    h("small", { class: css.metric }, [t("downloadSource", { source: failure.source })]),
    failure.code && h("small", { class: css.metric }, [t("downloadCode", { code: failure.code })]),
  ]);
}
/** Render a collapsed current-step summary or all Host-owned preparation steps. */
export const PreparationCard = defineComponent(
  (props: PreparationCardProps) => {
    const expanded = shallowRef(false),
      now = shallowRef(Date.now()),
      error = shallowRef("");
    const source = shallowRef(""),
      submitting = shallowRef(false);
    watch(
      () => {
        const state = props.provider.preparation;
        const current = state.steps?.find(
          (step) =>
            step.status === "running" || step.status === "failed" || step.status === "cancelled",
        );
        return [
          preparationTone(state) === "ongoing",
          current?.startedAt ?? ("startedAt" in state ? state.startedAt : undefined),
        ] as const;
      },
      ([preparing, startedAt], _previous, onCleanup) => {
        if (!preparing || startedAt === undefined) return;
        const timer = setInterval(() => {
          now.value = Date.now();
        }, 1000);
        onCleanup(() => clearInterval(timer));
      },
      { immediate: true },
    );
    const run = async (action: () => Promise<unknown>): Promise<void> => {
      error.value = "";
      submitting.value = true;
      try {
        await action();
      } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
      } finally {
        submitting.value = false;
      }
    };
    return () => {
      const { provider, connected, prepare, cancelPreparation, t } = props;
      const state = provider.preparation;
      const sources = provider.downloadSources ?? [];
      const [firstSource = ""] = sources;
      const selectedSource = sources.includes(source.value)
        ? source.value
        : sources.length === 1
          ? firstSource
          : "";
      const canPrepare = ["unprepared", "cancelled", "failed"].includes(state.phase);
      const current = state.steps?.find(
        (step) =>
          step.status === "running" || step.status === "failed" || step.status === "cancelled",
      );
      const preparing = preparationTone(state) === "ongoing";
      const startedAt = current?.startedAt ?? ("startedAt" in state ? state.startedAt : undefined);
      const metric =
        state.phase === "downloading"
          ? byteText(state, t)
          : preparing && startedAt !== undefined
            ? t("elapsed", {
                seconds: String(Math.max(0, Math.floor((now.value - startedAt) / 1000))),
              })
            : "";
      const summary = !connected
        ? t("reconnecting")
        : preparing && current
          ? t(`step.${current.kind}`, { name: provider.name })
          : state.phase === "downloading"
            ? t("short.downloading")
            : state.phase === "failed"
              ? t("short.failed")
              : state.phase === "ready" && provider.location === "cloud"
                ? t("cloudReady")
                : t(`preparation.${state.phase}`, { name: provider.name });
      return h("section", { class: css.preparation, "data-speech-provider": provider.id }, [
        h("strong", undefined, [provider.name]),
        state.phase === "unprepared" &&
          provider.location === "host-local" &&
          provider.setupEstimate &&
          h("div", { class: css.setupEstimate }, [
            h("p", undefined, [t("setup.local")]),
            h("dl", undefined, [
              h("div", undefined, [
                h("dt", undefined, [t("setup.disk")]),
                h("dd", undefined, [
                  t("setup.diskValue", {
                    gb: String(provider.setupEstimate.recommendedDiskBytes / 1000000000),
                  }),
                ]),
              ]),
              h("div", undefined, [
                h("dt", undefined, [t("setup.memory")]),
                h("dd", undefined, [
                  t("setup.memoryValue", {
                    gb: String(provider.setupEstimate.expectedMemoryBytes / 1000000000),
                  }),
                ]),
              ]),
              h("div", undefined, [
                h("dt", undefined, [t("setup.time")]),
                h("dd", undefined, [
                  t("setup.timeValue", {
                    min: String(provider.setupEstimate.minimumMinutes),
                    max: String(provider.setupEstimate.maximumMinutes),
                  }),
                ]),
              ]),
            ]),
            h("small", undefined, [t("setup.estimateNote")]),
          ]),
        h(
          DisclosureRow,
          {
            icon: h(
              StateDot,
              { state: preparationTone(state), size: 16, appearance: "step" },
              undefined,
            ),
            title: expanded.value ? t("preparationSteps") : summary,
            open: expanded.value,
            expandable: (state.steps?.length ?? 0) > 0,
            expandOnRowClick: true,
            previewChevron: false,
            onToggle: () => {
              expanded.value = !expanded.value;
            },
            rowClassName: css.summaryRow,
            titleClassName: css.summaryTitle,
            collapsedContent: h(Fragment, undefined, [
              h("span", { class: css.metric, role: "status" }, [metric]),
              state.steps && h(IconChevronDownOutlineRegular, undefined, undefined),
            ]),
          },
          {
            default: () => [
              h("ol", { class: css.steps }, [
                state.steps?.map((step) =>
                  h(
                    "li",
                    {
                      key: step.kind,
                      "data-step": step.kind,
                      "data-step-state": step.status,
                      "aria-label": `${t(`step.${step.kind}`, { name: provider.name })} · ${t(`stepStatus.${step.status}`)}`,
                    },
                    [
                      h(
                        StateDot,
                        {
                          appearance: "step",
                          size: 16,
                          state:
                            step.status === "complete"
                              ? "done"
                              : step.status === "running"
                                ? "ongoing"
                                : step.status === "failed"
                                  ? "error"
                                  : "idle",
                        },
                        undefined,
                      ),
                      h("div", { class: css.stepBody }, [
                        h("span", undefined, [t(`step.${step.kind}`, { name: provider.name })]),
                        step.status === "running" &&
                          h("div", { class: css.stepProgress }, [
                            h("span", { class: css.metric, role: "status" }, [metric]),
                            h(DownloadProgress, { state: state, t: t }, undefined),
                            state.phase === "downloading" &&
                              h("small", undefined, [state.resource]),
                          ]),
                      ]),
                    ],
                  ),
                ),
              ]),
            ],
          },
        ),
        !expanded.value && h(DownloadProgress, { state: state, t: t }, undefined),
        state.phase === "failed" && h(PreparationFailure, { state: state, t: t }, undefined),
        canPrepare &&
          sources.length > 0 &&
          h("div", { class: css.sourceChoice }, [
            h("label", undefined, [
              t("sourceChoice"),
              h(
                "select",
                {
                  "aria-label": t("sourceChoice"),
                  value: selectedSource,
                  disabled: !connected || submitting.value || sources.length === 1,
                  onChange: (event) => {
                    source.value = (event.target as HTMLSelectElement).value;
                  },
                },
                [
                  sources.length > 1 && h("option", { value: "" }, [t("sourceAuto")]),
                  sources.map((origin) =>
                    h("option", { key: origin, value: origin }, [
                      origin === "https://huggingface.co"
                        ? t("sourceHuggingFace")
                        : origin === "https://hf-mirror.com"
                          ? t("sourceMirror")
                          : origin,
                    ]),
                  ),
                ],
              ),
            ]),
            h("small", { class: css.metric }, [
              t(selectedSource === "" ? "sourceAutoHelp" : "sourceManualHelp"),
            ]),
          ]),
        h("div", { class: css.preparationActions }, [
          canPrepare &&
            h(
              Button,
              {
                variant: "outline",
                size: "sm",
                disabled: !connected || submitting.value,
                onClick: () => {
                  void run(() =>
                    selectedSource === ""
                      ? prepare(provider.id)
                      : prepare(provider.id, { downloadSource: selectedSource }),
                  );
                },
              },
              { default: () => [t(state.phase === "unprepared" ? "prepare" : "retryPrepare")] },
            ),
          preparing &&
            state.phase !== "waking" &&
            h(
              Button,
              {
                variant: "ghost",
                size: "sm",
                disabled: !connected || submitting.value || state.phase === "cancelling",
                onClick: () => {
                  void run(() => cancelPreparation(provider.id));
                },
              },
              { default: () => [t("cancelPrepare")] },
            ),
        ]),
        error.value &&
          h("p", { class: css.preparationError, role: "alert" }, [
            t("failed", { message: error.value }),
          ]),
      ]);
    };
  },
  { props: ["provider", "connected", "prepare", "cancelPreparation", "t"], inheritAttrs: false },
);
/** Recognition preferences and preparation cards shared by plugin details and Settings. */
type VoicePreparationProps = Pick<
  InjectFace<VoiceInputInjected>,
  | "useSpeechReadiness"
  | "configure"
  | "prepare"
  | "cancelPreparation"
  | "createRecording"
  | "useMicrophoneDevice"
  | "selectMicrophone"
> &
  PropsLocale<typeof NS>;
export const VoicePreparation = defineComponent(
  (props: VoicePreparationProps) => {
    const readinessSource = props.useSpeechReadiness((value) => value);
    const saving = shallowRef(false),
      error = shallowRef("");
    const configure = async (patch: SpeechSelectionPatch): Promise<void> => {
      saving.value = true;
      error.value = "";
      try {
        await props.configure(patch);
      } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
      } finally {
        saving.value = false;
      }
    };
    return () => {
      const readiness = readinessSource.value,
        catalog = readiness.catalog;
      const selected = catalog?.providers.find(
        (provider) => provider.id === catalog.selection.providerId,
      );
      const languageNames: Readonly<Record<string, string>> = {
        auto: props.t("auto"),
        zh: props.t("zh"),
        en: props.t("en"),
        yue: props.t("yue"),
        ja: props.t("ja"),
        es: props.t("es"),
        fr: props.t("fr"),
        de: props.t("de"),
        ru: props.t("ru"),
        pt: props.t("pt"),
        ko: props.t("ko"),
      };
      return h("div", undefined, [
        catalog &&
          h("div", { class: css.preferences }, [
            h(MicrophonePicker, { ...props }, undefined),
            h("label", undefined, [
              props.t("provider"),
              h(
                "select",
                {
                  value: catalog.selection.providerId,
                  disabled: !readiness.connected || saving.value,
                  onChange: (event) => {
                    void configure({
                      providerId: (event.target as HTMLSelectElement).value as SpeechProviderId,
                    });
                  },
                },
                [
                  catalog.providers.map((provider) =>
                    h("option", { key: provider.id, value: provider.id }, [provider.name]),
                  ),
                ],
              ),
            ]),
            h("label", undefined, [
              props.t("language"),
              h(
                "select",
                {
                  value: catalog.selection.language,
                  disabled: !readiness.connected || saving.value,
                  onChange: (event) => {
                    void configure({ language: (event.target as HTMLSelectElement).value });
                  },
                },
                [
                  selected?.languages.map((language) =>
                    h("option", { key: language, value: language }, [
                      languageNames[language] ?? language,
                    ]),
                  ),
                ],
              ),
            ]),
            h("p", undefined, [props.t(selected?.location === "cloud" ? "cloud" : "local")]),
            error.value && h("p", { role: "alert" }, [props.t("failed", { message: error.value })]),
          ]),
        catalog?.providers.map((provider) =>
          h(
            PreparationCard,
            { key: provider.id, provider: provider, connected: readiness.connected, ...props },
            undefined,
          ),
        ),
        !catalog && h("p", { role: "status" }, [props.t("loading")]),
        readiness.error &&
          h("p", { role: "alert" }, [props.t("failed", { message: readiness.error })]),
      ]);
    };
  },
  {
    props: [
      "useSpeechReadiness",
      "configure",
      "prepare",
      "cancelPreparation",
      "createRecording",
      "useMicrophoneDevice",
      "selectMicrophone",
      "t",
    ],
    inheritAttrs: false,
  },
);
