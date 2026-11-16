/** Click-to-record toolbar activity; transcripts remain in the original Session draft. */
import { computed, defineComponent, Fragment, h, shallowRef, watch } from "vue";
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from "@deepseek-ai/dsh-client-ui-slots";
import type { TokenSpan } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { TranscriptionRequest } from "@deepseek-ai/dsh-experimental-api-speech-to-text/types";
import type {
  SpeechPreparationOptions,
  SpeechProviderId,
  SpeechSelection,
  SpeechSelectionPatch,
  Transcript,
} from "@deepseek-ai/dsh-experimental-speech-to-text/types";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import { audioBase64, type Recording } from "./audio.ts";
import { failureText } from "./failure-text.ts";
import type { MicrophoneDevice } from "./microphone-device.ts";
import type { SpeechReadiness } from "./readiness.ts";
import { Waveform } from "./Waveform.tsx";
import { VoiceSetupDialog } from "./VoiceSetupDialog.tsx";
import { NS } from "./locales.ts";
import {
  Button,
  IconCloseOutlineRegular,
  IconStopFillRegular,
  IconMicrophoneOutlineRegular,
  StateDot,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import css from "./VoiceInput.module.css";
/** Host calls injected without exposing a Cordis Context to components. */
export interface VoiceInputActions {
  /** Open the voice bundle details without starting preparation. */
  openSettings: () => void;
  /** @returns one microphone operation owned by the plugin lifecycle. */
  createRecording: () => Recording;
  /** Remember the browser microphone used by previews and subsequent recordings. */
  selectMicrophone: (device: MicrophoneDevice) => void;
  transcribe: (
    request: TranscriptionRequest,
    signal: AbortSignal,
  ) => Promise<RemoteResult<Transcript>>;
  prepare: (providerId: SpeechProviderId, options?: SpeechPreparationOptions) => Promise<void>;
  cancelPreparation: (providerId: SpeechProviderId) => Promise<void>;
  configure: (patch: SpeechSelectionPatch) => Promise<void>;
}
/** Entry-injected Host readiness and microphone operations. */
export interface VoiceInputInjected extends VoiceInputActions {
  hooks: {
    speechReadiness: HostObservable<SpeechReadiness>;
    microphoneDevice: HostObservable<MicrophoneDevice>;
    /** Whether the Plugins page navigation service is present; the setup dialog offers the details only while it is. */
    pluginNavigation: HostObservable<boolean>;
  };
}
/** Composer-owned expansion and draft actions; preferences stay in plugin settings. */
export type VoiceInputProps = Pick<
  PropsRuntime<"conversation.input.activity">,
  "sessionId" | "inputActions" | "locked" | "onActiveChange"
> &
  PropsLocale<typeof NS> &
  InjectFace<VoiceInputInjected>;
type Phase = "idle" | "requesting" | "recording" | "transcribing" | "feedback";
interface ActiveRecording {
  readonly capture: Recording;
  readonly abort: AbortController;
  readonly span: TokenSpan;
  readonly selection: SpeechSelection;
  readonly maxDurationSeconds: number;
  readonly maxAudioBytes: number;
  phase: "requesting" | "recording" | "transcribing";
  timer?: ReturnType<typeof setTimeout> | undefined;
}
async function disposeRecording(capture: Recording): Promise<void> {
  try {
    await capture.dispose();
  } catch (_error) {
    // Tracks stop before AudioContext.close(); a close failure must not hide the recording result.
  }
}
/** Render a compact microphone or an expanded capture, transcription, or retry row. */
export const VoiceInput = defineComponent(
  (props: VoiceInputProps) => {
    const readiness = props.useSpeechReadiness((value) => value),
      catalog = computed(() => readiness.value.catalog);
    const navigable = props.usePluginNavigation((present) => present);
    const provider = computed(() =>
      catalog.value?.providers.find((item) => item.id === catalog.value?.selection.providerId),
    );
    const usable = computed(
      () =>
        readiness.value.connected &&
        (provider.value?.preparation.phase === "ready" ||
          provider.value?.preparation.phase === "standby" ||
          provider.value?.preparation.phase === "waking"),
    );
    const phase = shallowRef<Phase>("idle"),
      message = shallowRef(""),
      pending = shallowRef("");
    const setupOpen = shallowRef(false);
    watch(usable, (value) => {
      if (value) setupOpen.value = false;
    });
    const current: {
        current: ActiveRecording | undefined;
      } = { current: undefined },
      generation = { current: 0 };
    const expanded = computed(() => phase.value !== "idle");
    watch(
      [expanded, () => props.onActiveChange],
      ([active, publish], _previous, cleanup) => {
        publish(active);
        cleanup(() => publish(false));
      },
      { immediate: true, flush: "sync" },
    );
    const cancel = (): void => {
      generation.current++;
      const active = current.current;
      current.current = undefined;
      if (active) {
        clearTimeout(active.timer);
        active.abort.abort();
        void disposeRecording(active.capture);
      }
      pending.value = "";
      message.value = "";
      phase.value = "idle";
      setupOpen.value = false;
    };
    watch(
      () => props.sessionId,
      (_session, _previous, onCleanup) => {
        pending.value = "";
        message.value = "";
        phase.value = "idle";
        setupOpen.value = false;
        const blur = (): void => {
          if (current.current?.phase === "recording") cancel();
        };
        const visibility = (): void => {
          if (document.hidden && current.current && current.current.phase !== "transcribing")
            cancel();
        };
        const escape = (event: KeyboardEvent): void => {
          if (event.key === "Escape" && current.current) {
            event.preventDefault();
            cancel();
          }
        };
        window.addEventListener("blur", blur);
        document.addEventListener("visibilitychange", visibility);
        document.addEventListener("keydown", escape);
        onCleanup(() => {
          window.removeEventListener("blur", blur);
          document.removeEventListener("visibilitychange", visibility);
          document.removeEventListener("keydown", escape);
          generation.current++;
          const active = current.current;
          current.current = undefined;
          if (active) {
            clearTimeout(active.timer);
            active.abort.abort();
            void disposeRecording(active.capture);
          }
        });
      },
      { immediate: true },
    );
    const feedback = (text: string): void => {
      message.value = text;
      phase.value = "feedback";
    };
    const finish = async (): Promise<void> => {
      const active = current.current;
      if (!active || active.phase !== "recording") return;
      active.phase = "transcribing";
      const run = generation.current;
      clearTimeout(active.timer);
      phase.value = "transcribing";
      try {
        const audio = await active.capture.stop(active.maxDurationSeconds);
        if (run !== generation.current) return;
        if (audio.byteLength > active.maxAudioBytes) {
          feedback(props.t("tooLarge"));
          return;
        }
        const result = await props.transcribe(
          { audioBase64: audioBase64(audio), ...active.selection },
          active.abort.signal,
        );
        if (run !== generation.current) return;
        if (!result.ok) {
          feedback(props.t("failed", { message: result.error.message }));
          return;
        }
        if (result.value.text === "") {
          feedback(props.t("empty"));
          return;
        }
        if (!props.inputActions.insertText(result.value.text, active.span)) {
          pending.value = result.value.text;
          feedback(props.t("conflict"));
          return;
        }
        phase.value = "idle";
      } catch (failure) {
        await disposeRecording(active.capture);
        if (run === generation.current) feedback(failureText(failure, props.t));
      } finally {
        if (run === generation.current) current.current = undefined;
      }
    };
    const start = async (): Promise<void> => {
      if (!catalog.value || !usable.value || props.locked || current.current) return;
      const run = ++generation.current;
      const active: ActiveRecording = {
        capture: props.createRecording(),
        abort: new AbortController(),
        span: props.inputActions.captureInsertion(),
        selection: catalog.value.selection,
        maxDurationSeconds: catalog.value.maxDurationSeconds,
        maxAudioBytes: catalog.value.maxAudioBytes,
        phase: "requesting",
      };
      current.current = active;
      message.value = "";
      pending.value = "";
      phase.value = "requesting";
      try {
        await active.capture.start((failure) => {
          if (
            run !== generation.current ||
            current.current !== active ||
            active.phase === "transcribing"
          )
            return;
          current.current = undefined;
          clearTimeout(active.timer);
          active.abort.abort();
          feedback(failureText(failure, props.t));
        });
        if (run !== generation.current || current.current !== active) return;
        active.phase = "recording";
        phase.value = "recording";
        active.timer = setTimeout(() => {
          void finish();
        }, active.maxDurationSeconds * 1000);
      } catch (failure) {
        await disposeRecording(active.capture);
        if (run === generation.current) {
          current.current = undefined;
          feedback(failureText(failure, props.t));
        }
      }
    };
    return () => {
      if (!expanded.value)
        return h(Fragment, undefined, [
          h(
            Tooltip,
            { label: props.t("dictate"), disabled: !usable.value, side: "top", portal: true },
            {
              default: () => [
                h("span", { class: css.triggerAnchor }, [
                  h(
                    Button,
                    {
                      className: css.trigger ?? "",
                      size: "sm",
                      disabled: props.locked,
                      "aria-label": props.t(usable.value ? "start" : "setupPrompt.trigger"),
                      "aria-haspopup": usable.value ? undefined : "dialog",
                      onMousedown: (event: MouseEvent) => {
                        event.preventDefault();
                      },
                      onClick: () => {
                        if (usable.value) void start();
                        else setupOpen.value = true;
                      },
                    },
                    { default: () => [h(IconMicrophoneOutlineRegular, { size: 18 }, undefined)] },
                  ),
                ]),
              ],
            },
          ),
          h(
            VoiceSetupDialog,
            {
              open: setupOpen.value && !usable.value,
              needsInstallation:
                readiness.value.connected &&
                provider.value?.location === "host-local" &&
                provider.value.preparation.phase === "unprepared",
              onDismiss: () => {
                setupOpen.value = false;
              },
              onOpenDetails: navigable.value
                ? () => {
                    setupOpen.value = false;
                    props.openSettings();
                  }
                : undefined,
              t: props.t,
            },
            undefined,
          ),
        ]);
      return h("div", { class: css.captureRow, "data-voice-activity": phase.value }, [
        h(
          Button,
          {
            type: "button",
            className: css.roundButton ?? "",
            size: "sm",
            "aria-label": props.t(pending.value ? "discard" : "cancel"),
            onClick: cancel,
          },
          { default: () => [h(IconCloseOutlineRegular, { size: 14 }, undefined)] },
        ),
        phase.value === "recording"
          ? h(
              Waveform,
              { recording: current.current?.capture, label: props.t("recording") },
              undefined,
            )
          : h(
              "span",
              { class: css.activityMessage, role: "status", title: pending.value || message.value },
              [
                (phase.value === "requesting" || phase.value === "transcribing") &&
                  h(StateDot, { state: "ongoing" }, undefined),
                phase.value === "feedback"
                  ? message.value
                  : props.t(
                      phase.value === "requesting"
                        ? "requesting"
                        : provider.value?.preparation.phase === "waking"
                          ? "wakingShort"
                          : "transcribingShort",
                    ),
              ],
            ),
        phase.value === "recording" &&
          h(
            Button,
            {
              type: "button",
              className: css.roundButton ?? "",
              size: "sm",
              "aria-label": props.t("stop"),
              onClick: () => {
                void finish();
              },
            },
            { default: () => [h(IconStopFillRegular, { size: 14 }, undefined)] },
          ),
        phase.value === "feedback" &&
          (pending.value
            ? h(
                Button,
                {
                  className: css.inlineAction ?? "",
                  size: "sm",
                  type: "button",
                  onClick: () => {
                    if (
                      props.inputActions.insertText(
                        pending.value,
                        props.inputActions.captureInsertion(),
                      )
                    ) {
                      pending.value = "";
                      phase.value = "idle";
                    }
                  },
                },
                { default: () => [props.t("insert")] },
              )
            : h(
                Button,
                {
                  className: css.roundButton ?? "",
                  size: "sm",
                  type: "button",
                  "aria-label": props.t("retryRecording"),
                  disabled: !usable.value || props.locked,
                  onClick: () => {
                    void start();
                  },
                },
                { default: () => [h(IconMicrophoneOutlineRegular, { size: 18 }, undefined)] },
              )),
      ]);
    };
  },
  {
    props: [
      "sessionId",
      "inputActions",
      "locked",
      "onActiveChange",
      "createRecording",
      "transcribe",
      "openSettings",
      "useSpeechReadiness",
      "usePluginNavigation",
      "t",
    ],
    inheritAttrs: false,
  },
);
