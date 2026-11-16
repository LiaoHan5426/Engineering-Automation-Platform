import { defineComponent, h, shallowRef, watch } from "vue";
import type { InputHTMLAttributes } from "vue";
/** Credential drafts can be revealed; saved keys are represented by a protected mask. */
import type { en } from "./locales.ts";
import styles from "./ModelsSection.module.css";

const EYE_CONTOUR =
  "M1.5 8C2.9 5.25 5.25 3.5 8 3.5C10.75 3.5 13.1 5.25 14.5 8C13.1 10.75 10.75 12.5 8 12.5C5.25 12.5 2.9 10.75 1.5 8Z";
const EYE_PATH = `${EYE_CONTOUR}M10 8C10 9.1 9.1 10 8 10C6.9 10 6 9.1 6 8C6 6.9 6.9 6 8 6C9.1 6 10 6.9 10 8Z`;
const EYE_OFF_PATH = `${EYE_CONTOUR}M2.5 2.5L13.5 13.5`;

/** Input attributes and section copy for the current credential draft. */
interface ApiKeyInputProps extends Omit<
  InputHTMLAttributes,
  "value" | "type" | "class" | "autocomplete"
> {
  /** Unsaved input; stored credentials are never read into this field. */
  readonly value: string;
  /** Server-masked preview and actions; the full stored credential stays on the Host. */
  readonly saved?: {
    readonly masked: string;
    readonly clear?: () => void;
  };
  /** Section copy, including the same reveal labels as SecretText. */
  readonly t: (key: keyof typeof en) => string;
}

/** Reveal only a nonempty draft; saved keys allow whole replacement or deletion. */
export const ApiKeyInput = defineComponent(
  (props: ApiKeyInputProps, { attrs }) => {
    const input = shallowRef<HTMLInputElement | null>(null);
    watch(
      input,
      () => {
        if (attrs["autoFocus"] === true) input.value?.focus();
      },
      { flush: "post" },
    );
    const revealedValue = shallowRef<string>();
    return () => {
      const { value, saved, t } = props;
      const canReveal = saved === undefined && value.length > 0 && props.disabled !== true;
      const revealed = canReveal && revealedValue.value === value;
      return h(
        "div",
        { class: `${styles["keyInput"]} ${saved === undefined ? "" : styles["savedKeyInput"]}` },
        [
          h("input", {
            ...attrs,
            ref: input,
            "data-modal-autofocus": attrs["autoFocus"] === true || undefined,
            ...props,
            saved: undefined,
            t: undefined,
            class: `${styles["input"]} ${canReveal ? styles["keyInputFilled"] : ""}`,
            type: revealed ? "text" : "password",
            autocomplete: "new-password",
            value,
            placeholder: saved === undefined ? props.placeholder : saved.masked,
            onCopy: (event: ClipboardEvent) => {
              if (saved !== undefined) event.preventDefault();
            },
            onCut: (event: ClipboardEvent) => {
              if (saved !== undefined) event.preventDefault();
            },
            onKeydown: (event: KeyboardEvent) => {
              if (saved !== undefined && (event.key === "Backspace" || event.key === "Delete")) {
                event.preventDefault();
                saved.clear?.();
              }
            },
            onInput: (event: InputEvent) => {
              revealedValue.value = undefined;
              props.onInput?.(event);
            },
          }),
          !canReveal
            ? null
            : h(
                "button",
                {
                  type: "button",
                  class: styles["keyToggle"],
                  "aria-label": t(revealed ? "keyHide" : "keyReveal"),
                  "aria-pressed": revealed,
                  onClick: () => {
                    revealedValue.value = revealed ? undefined : value;
                  },
                },
                [
                  h(
                    "svg",
                    {
                      width: 16,
                      height: 16,
                      viewBox: "0 0 16 16",
                      fill: "none",
                      stroke: "currentColor",
                      "stroke-width": 1.3,
                      "stroke-linecap": "round",
                      "aria-hidden": true,
                    },
                    [h("path", { d: revealed ? EYE_OFF_PATH : EYE_PATH })],
                  ),
                ],
              ),
        ],
      );
    };
  },
  {
    inheritAttrs: false,
    props: ["value", "saved", "t", "disabled", "placeholder", "onInput"],
  },
);
