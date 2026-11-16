/** Device selection owns microphone previews while its page is active. */
import { defineComponent, h, shallowRef, watch } from "vue";
import type { InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { VoiceInputInjected } from "./VoiceInput.tsx";
import { RecordingError, type Recording } from "./audio.ts";
import type { MicrophoneDevice } from "./microphone-device.ts";
import { failureText } from "./failure-text.ts";
import { NS } from "./locales.ts";
import css from "./VoiceInput.module.css";
interface DeviceChoice extends MicrophoneDevice {
  unavailable?: boolean;
}
const InputLevel = defineComponent(
  (props: { recording: Recording; label: string }) => {
    const meter = shallowRef<HTMLSpanElement | null>(null);
    watch(
      [meter, () => props.recording],
      ([element, recording], _previous, onCleanup) => {
        if (!element) return;
        const bars = Array.from(element.children);
        let frame: number;
        const draw = (): void => {
          const decibels = 20 * Math.log10(Math.max(recording.amplitude(), 0.00001));
          const count = Math.ceil(Math.max(0, Math.min(1, (decibels + 60) / 60)) * bars.length);
          for (const [index, bar] of bars.entries())
            bar.setAttribute("data-active", String(index < count));
          frame = requestAnimationFrame(draw);
        };
        draw();
        onCleanup(() => {
          cancelAnimationFrame(frame);
        });
      },
      { immediate: true, flush: "post" },
    );
    return () =>
      h("span", { ref: meter, class: css.inputLevel, role: "img", "aria-label": props.label }, [
        Array.from({ length: 8 }, (_, index) => h("span", { key: index }, undefined)),
      ]);
  },
  { props: ["recording", "label"], inheritAttrs: false },
);
/** Render the selected input and preview its measured level without recording audio. */
type MicrophonePickerProps = Pick<
  InjectFace<VoiceInputInjected>,
  "useMicrophoneDevice" | "selectMicrophone" | "createRecording"
> &
  PropsLocale<typeof NS>;
export const MicrophonePicker = defineComponent(
  (props: MicrophonePickerProps) => {
    const selectedSource = props.useMicrophoneDevice((value) => value);
    const devices = shallowRef<DeviceChoice[]>([
      {
        id: selectedSource.value.id,
        label: selectedSource.value.id === "" ? "" : selectedSource.value.label,
      },
    ]);
    const preview = shallowRef<Recording>(),
      error = shallowRef<{
        failure: unknown;
      }>();
    watch(
      [() => selectedSource.value.id, () => props.createRecording],
      (_values, _previous, onCleanup) => {
        const selected = selectedSource.value;
        const media = (navigator as Partial<Navigator>).mediaDevices;
        const lifetime = new AbortController();
        let capture: Recording | undefined,
          enumeration = 0;
        const release = (): void => {
          if (capture) void capture.dispose().catch(() => undefined);
          capture = undefined;
        };
        preview.value = undefined;
        error.value = undefined;
        const fail = (failure: unknown): void => {
          if (lifetime.signal.aborted) return;
          error.value = { failure };
        };
        const acquire = async (): Promise<void> => {
          const recording = props.createRecording();
          capture = recording;
          const interrupted = (failure: RecordingError): void => {
            if (capture !== recording || lifetime.signal.aborted) return;
            release();
            preview.value = undefined;
            fail(failure);
            void refresh();
          };
          try {
            await recording.preview(interrupted);
            if (capture !== recording || lifetime.signal.aborted) return;
            preview.value = recording;
            error.value = undefined;
            void refresh();
          } catch (failure) {
            if (capture !== recording || lifetime.signal.aborted) return;
            release();
            preview.value = undefined;
            fail(failure);
          }
        };
        const refresh = async (): Promise<void> => {
          const request = ++enumeration;
          try {
            if (!media) throw new RecordingError("unavailable");
            const inputs = (await media.enumerateDevices()).filter(
              (device) => device.kind === "audioinput",
            );
            if (lifetime.signal.aborted || request !== enumeration) return;
            // Before permission, browsers may hide device ids and labels; absence then does not establish disconnection.
            const known = inputs.length === 0 || inputs.some((device) => device.label !== "");
            const missing =
              selected.id === ""
                ? inputs.length === 0
                : known && !inputs.some((device) => device.deviceId === selected.id);
            const system = inputs.find((device) => device.deviceId === "default");
            const activeDefault = selected.id === "" ? capture?.deviceInfo() : undefined;
            const groupId = activeDefault?.groupId || system?.groupId;
            const physicalDefault = groupId
              ? inputs.find(
                  (device) =>
                    device.groupId === groupId &&
                    device.deviceId !== "default" &&
                    device.deviceId !== "communications",
                )
              : undefined;
            const defaultLabel =
              physicalDefault?.label || activeDefault?.label || system?.label || "";
            // Our system row replaces default; communications keeps the OS's separate default communications input.
            const choices: DeviceChoice[] = [
              { id: "", label: defaultLabel, unavailable: inputs.length === 0 },
              ...inputs
                .filter((device) => device.deviceId !== "" && device.deviceId !== "default")
                .map((device) => ({
                  id: device.deviceId,
                  label: device.label,
                })),
            ];
            devices.value = (() => {
              const previous = devices.value;
              const next = [...choices];
              if (selected.id !== "" && !next.some((device) => device.id === selected.id)) {
                const knownDevice = previous.find((device) => device.id === selected.id);
                next.splice(
                  Math.max(
                    1,
                    previous.findIndex((device) => device.id === selected.id),
                  ),
                  0,
                  { id: selected.id, label: knownDevice?.label ?? "", unavailable: missing },
                );
              }
              return next;
            })();
            if (missing) {
              release();
              preview.value = undefined;
              error.value = undefined;
            } else if (!document.hidden && !capture) void acquire();
          } catch (failure) {
            if (request === enumeration) fail(failure);
          }
        };
        const changed = (): void => {
          void refresh();
        };
        const hidden = (): void => {
          if (document.hidden) {
            release();
            preview.value = undefined;
          } else changed();
        };
        media?.addEventListener("devicechange", changed, { signal: lifetime.signal });
        document.addEventListener("visibilitychange", hidden, { signal: lifetime.signal });
        changed();
        onCleanup(() => {
          lifetime.abort();
          release();
        });
      },
      { immediate: true, flush: "sync" },
    );
    return () => {
      const selected = selectedSource.value;
      const choices = devices.value.filter(
        (device) => !device.unavailable || device.id === selected.id || device.id === "",
      );
      const missing = choices.find((device) => device.id === selected.id)?.unavailable;
      const deviceName = (device: MicrophoneDevice, index: number): string => {
        if (device.id === "")
          return device.label
            ? props.t("systemMicrophoneNamed", { name: device.label })
            : props.t("systemMicrophone");
        return (
          device.label ||
          (device.id === selected.id ? selected.label : "") ||
          (index > 0
            ? props.t("unnamedMicrophone", { number: String(index) })
            : props.t("unnamedSelectedMicrophone"))
        );
      };
      return h("div", { class: css.deviceRow, "data-voice-input-device": true }, [
        h("label", { for: "voice-input-device" }, [props.t("inputDevice")]),
        h("span", { class: css.deviceField }, [
          h(
            "select",
            {
              id: "voice-input-device",
              value: selected.id,
              class: preview.value ? css.deviceSelectMeter : undefined,
              onChange: (event) => {
                const device = choices.find(
                  (item) => item.id === (event.target as HTMLSelectElement).value,
                ) as DeviceChoice;
                props.selectMicrophone({
                  id: device.id,
                  label: device.id === "" ? "" : device.label,
                });
              },
            },
            [
              choices.map((device, index) =>
                h("option", { key: device.id, value: device.id, disabled: device.unavailable }, [
                  deviceName(device, index),
                  device.unavailable ? ` — ${props.t("deviceUnavailable")}` : "",
                ]),
              ),
            ],
          ),
          preview.value &&
            !missing &&
            h("span", { class: css.deviceMeter }, [
              h(InputLevel, { recording: preview.value, label: props.t("inputLevel") }, undefined),
            ]),
        ]),
        error.value &&
          h("span", { class: css.deviceError, role: "alert" }, [
            failureText(error.value.failure, props.t),
          ]),
      ]);
    };
  },
  {
    props: ["useMicrophoneDevice", "selectMicrophone", "createRecording", "t"],
    inheritAttrs: false,
  },
);
