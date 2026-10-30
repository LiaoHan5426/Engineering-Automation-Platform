import { nextTick, onBeforeUnmount, onMounted, type Ref } from "vue";

/**
 * Staged for `@eap/hooks`. Dialog and ConfirmBox are the current callers.
 * Extract the package when a feature needs the same trap.
 */
const FOCUSABLE =
  "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

export function useEscClose(onEscape: () => void) {
  return function onKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onEscape();
  };
}

export function useFocusTrap(
  root: Ref<HTMLElement | null>,
  options: {
    onEscape?: () => void;
    initial?: (node: HTMLElement) => HTMLElement | null | undefined;
  } = {},
) {
  let previousFocus: HTMLElement | null = null;
  const close = options.onEscape ? useEscClose(options.onEscape) : null;

  onMounted(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void nextTick(() => {
      const node = root.value;
      if (!node) return;
      (options.initial?.(node) ?? node).focus();
    });
  });

  onBeforeUnmount(() => {
    if (previousFocus?.isConnected) previousFocus.focus();
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      close?.(event);
      return;
    }
    if (event.key !== "Tab" || !root.value) return;
    const controls = Array.from(root.value.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { onKeydown };
}
