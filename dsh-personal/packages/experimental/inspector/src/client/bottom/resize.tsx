import { defineComponent, h, shallowRef } from "vue";
/** Pointer-captured resizing keeps the Inspector and main content within the viewport. */
import css from "./page.module.css";
const MIN_HEIGHT = 20;
const MAX_HEIGHT = 80;
/**
 * Render the top divider; height is a percentage of the viewport, retained by its panel.
 * @param props - current height, resize callback, localized label, and controlled panel id.
 * @returns the pointer- and keyboard-operable horizontal divider.
 */
export const InspectorResizeHandle = defineComponent(
  (props: {
    height: number;
    onResize: (height: number) => void;
    label: string;
    panelId: string;
  }) => {
    const drag = shallowRef<
      | {
          pointerId: number;
          y: number;
          height: number;
        }
      | undefined
    >(undefined);
    const resize = (value: number): void => {
      props.onResize(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, value)));
    };
    const move = (event: PointerEvent): void => {
      const start = drag.value;
      if (start?.pointerId !== event.pointerId) return;
      resize(start.height + ((start.y - event.clientY) / window.innerHeight) * 100);
    };
    const end = (event: PointerEvent): void => {
      if (drag.value?.pointerId !== event.pointerId) return;
      drag.value = undefined;
      if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId))
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    };
    return () => {
      return h("div", {
        class: css.resize,
        role: "separator",
        tabindex: 0,
        "aria-label": props.label,
        "aria-orientation": "horizontal",
        "aria-controls": props.panelId,
        "aria-valuemin": MIN_HEIGHT,
        "aria-valuemax": MAX_HEIGHT,
        "aria-valuenow": Math.round(props.height),
        onPointerdown: (event) => {
          if (event.button !== 0 || drag.value !== undefined) return;
          event.preventDefault();
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          drag.value = { pointerId: event.pointerId, y: event.clientY, height: props.height };
        },
        onPointermove: move,
        onPointerup: (event) => {
          move(event);
          end(event);
        },
        onPointercancel: end,
        onLostpointercapture: end,
        onKeydown: (event) => {
          const next = {
            ArrowUp: props.height + 5,
            ArrowDown: props.height - 5,
            Home: MIN_HEIGHT,
            End: MAX_HEIGHT,
          }[event.key];
          if (next === undefined) return;
          event.preventDefault();
          resize(next);
        },
      });
    };
  },
  { props: ["height", "onResize", "label", "panelId"] },
);
