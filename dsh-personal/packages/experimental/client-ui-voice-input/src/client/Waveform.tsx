/** Live microphone amplitude history; animation updates SVG geometry without component updates. */
import { defineComponent, h, shallowRef, watch } from "vue";
import type { Recording } from "./audio.ts";
import css from "./VoiceInput.module.css";
/** Render recent measured microphone levels; silent audio remains a dotted baseline. */
export const Waveform = defineComponent(
  (props: { readonly recording: Recording | undefined; readonly label: string }) => {
    const svg = shallowRef<SVGSVGElement | null>(null);
    watch(
      [svg, () => props.recording],
      ([element, recording], _previous, onCleanup) => {
        if (!element) return;
        const bars = Array.from(element.querySelectorAll("line"))
          .reverse()
          .map((element) => ({ element, level: 0 }));
        let frame: number,
          previous = -Infinity;
        const draw = (now: number): void => {
          if (now - previous >= 50) {
            previous = now;
            let next = recording?.amplitude() ?? 0;
            for (const bar of bars) {
              const previousLevel = bar.level;
              bar.level = next;
              next = previousLevel;
              const height = 1 + Math.min(1, bar.level * 5) * 17;
              bar.element.setAttribute("y1", String(20 - height));
              bar.element.setAttribute("y2", String(20 + height));
            }
          }
          frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        onCleanup(() => {
          cancelAnimationFrame(frame);
        });
      },
      { immediate: true, flush: "post" },
    );
    return () =>
      h(
        "svg",
        {
          ref: svg,
          class: css.waveform,
          viewBox: "0 0 640 40",
          preserveAspectRatio: "none",
          role: "img",
          "aria-label": props.label,
        },
        [
          Array.from({ length: 80 }, (_, index) =>
            h(
              "line",
              {
                key: index,
                x1: index * 8 + 4,
                x2: index * 8 + 4,
                y1: "19",
                y2: "21",
                stroke: "currentColor",
                "stroke-width": "3",
                "stroke-linecap": "round",
                opacity: 0.25 + index / 120,
              },
              undefined,
            ),
          ),
        ],
      );
  },
  { props: ["recording", "label"], inheritAttrs: false },
);
