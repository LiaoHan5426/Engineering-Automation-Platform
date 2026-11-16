import {
  h,
  Teleport,
  useId,
  defineComponent,
  computed,
  shallowRef,
  watch,
  type VNodeChild,
} from "vue";
import clsx from "clsx";
import {
  IconCheckOutlineRegular,
  isMobileDevice,
  useDismissOnOutsidePointer,
} from "@deepseek-ai/dsh-client-ui-primitives";
import css from "./TaskMenu.module.css";
/** Selectable row of a {@link TaskMenu}. */
export interface TaskMenuItem {
  /** Identifier `onSelect` receives when the row is activated. */
  id: string;
  /** Visible row label. */
  label: VNodeChild;
  /** Whether the row cannot be activated, and is not a step of the arrow walk. */
  disabled?: boolean;
  /** Leading icon. */
  icon?: VNodeChild;
  /** Destructive row: error-colored text and icon, and the danger hover fill. */
  danger?: boolean;
}
/** Hairline between item groups (not selectable). */
export interface TaskMenuSeparator {
  type: "separator";
  id: string;
}
/** Non-interactive heading row above a group of items. */
export interface TaskMenuLabel {
  type: "label";
  id: string;
  text: string;
}
/** One TaskMenu entry: a row, a separator, or a heading label. */
export type TaskMenuEntry = TaskMenuItem | TaskMenuSeparator | TaskMenuLabel;
/** Inputs of {@link TaskMenu}. */
export interface TaskMenuProps {
  /** Whether the list is showing (owner-controlled). */
  open: boolean;
  /** The trigger element, rendered in place. */
  anchor: VNodeChild;
  /** Selectable rows and optional separators or heading labels (default none). */
  items?: readonly TaskMenuEntry[];
  /** Row shown as selected, marked with a trailing check. */
  selectedId?: string | undefined;
  /** Row activation callback (not called for disabled rows). */
  onSelect: (id: string) => void;
  /** Invoked on an outside pointer press, Escape, or a window blur that moved focus into an iframe. */
  onClose: () => void;
  /** List alignment against the anchor (default 'start'). */
  align?: "start" | "end";
  /** Render the list into document.body, fixed-positioned by its CSS anchor. */
  portal?: boolean;
  /** Owner content pinned above the scrolling rows. */
  header?: VNodeChild;
  /** Extra class on the anchor wrapper span. */
  className?: string | undefined;
  /** Extra class on the dropdown card itself; the only style hook that reaches a portaled list. */
  listClassName?: string | undefined;
}
/**
 * Whether an entry is a group hairline.
 * @param entry - one menu entry.
 * @returns true for a separator entry.
 */
function isSeparator(entry: TaskMenuEntry): entry is TaskMenuSeparator {
  return "type" in entry && entry.type === "separator";
}
/**
 * Whether an entry is a non-interactive heading.
 * @param entry - one menu entry.
 * @returns true for a heading entry.
 */
function isLabel(entry: TaskMenuEntry): entry is TaskMenuLabel {
  return "type" in entry && entry.type === "label";
}
/**
 * Render an anchored dropdown menu. While the list is open, Tab settles the
 * focused row — from the trigger, Tab enters the list instead — Escape and
 * Shift+Tab close it and return focus to the anchor's first enabled button, and
 * selecting a row does the same.
 * @param props.open - whether the list is showing (owner-controlled).
 * @param props.anchor - the trigger element, rendered in place.
 * @param props.items - selectable rows and optional separators or heading labels.
 * @param props.selectedId - row shown as selected.
 * @param props.onSelect - row activation callback, not called for disabled rows.
 * @param props.onClose - invoked on an outside pointer press, Escape, or a
 * window blur that moved focus into a cross-origin iframe.
 * @param props.align - list alignment against the anchor (default 'start').
 * @param props.portal - render the list into document.body, fixed-positioned
 * by its CSS anchor (follows scroll and resize while open).
 * @param props.header - owner content pinned above the scrolling rows; a control
 * it marks `data-menu-field` takes the keyboard on desktop when opened. Phones and tablets
 * require explicit field focus.
 * @param props.className - extra class on the anchor wrapper span.
 * @param props.listClassName - extra class on the dropdown card itself.
 * @returns the anchor wrapper with the conditional list.
 */
export const TaskMenu = defineComponent(
  (props: TaskMenuProps) => {
    const id = useId();
    const anchorName = computed(() => `--dsh-task-menu-${id.replaceAll(":", "")}`);
    const rootRef = shallowRef<HTMLSpanElement | null>(null);
    const listRef = shallowRef<HTMLDivElement | null>(null);
    const walkIndex = shallowRef<number | null>(null);
    const handedOver = shallowRef(false);
    const dismiss = () => {
      props.onClose();
    };
    useDismissOnOutsidePointer(rootRef, () => props.open, dismiss, listRef);
    const refocusAnchor = (): void => {
      rootRef.value?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    };
    const refocusAfterSelection = (): void => {
      queueMicrotask(() => {
        if (props.open) return;
        const active = document.activeElement;
        if (active === null || active === document.body || listRef.value?.contains(active) === true)
          refocusAnchor();
      });
    };
    /* jscpd:ignore-end */
    // Header fields take focus once per open; mobile fields require an explicit tap.
    watch(
      [() => props.open, () => listRef.value],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (!props.open) {
            handedOver.value = false;
            return;
          }
          if (handedOver.value || isMobileDevice()) return;
          const list = listRef.value;
          /* v8 ignore next -- the list is rendered in the same commit that sets `open`, before this effect runs. */
          if (list === null) return;
          const field = list.querySelector<HTMLElement>("[data-menu-field]");
          if (field === null) return;
          handedOver.value = true;
          field.focus();
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    watch(
      [() => props.open, () => dismiss],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (!props.open) {
            walkIndex.value = null;
            return;
          }
          /* jscpd:ignore-start -- schedule-local copy of the shared ui-primitives Menu; the two owners change independently. */
          const onKeyDown = (e: KeyboardEvent): void => {
            if (e.defaultPrevented) return;
            // Where the keyboard is, computed once: the menu owns it when it holds a
            // row or sits on its anchor region.
            const focused = document.activeElement;
            const insideList = listRef.value?.contains(focused) === true;
            const anchored = rootRef.value?.contains(focused) === true || insideList;
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              // Closing hands the keyboard back when the menu had it.
              dismiss();
              if (anchored) refocusAnchor();
            }
            // Tab settles like Enter and Shift+Tab leaves like Escape, so a menu's
            // keys mean what they mean in the composer. Only a keyboard already on
            // the trigger or inside the list is intercepted: Tab elsewhere on the
            // page keeps the browser's traversal even while a menu is open.
            if (e.key === "Tab") {
              const list = listRef.value;
              /* v8 ignore next -- the list is mounted whenever this effect's `open` is true. */
              if (list === null) return;
              if (!anchored) return;
              if (e.shiftKey) {
                e.preventDefault();
                dismiss();
                refocusAnchor();
                return;
              }
              // Tab settles the row it is on; from the anchor it enters the list. A
              // focused control that is not a row (the header search box) and a list
              // with no enabled row keep the browser's traversal instead.
              if (insideList) {
                if (focused instanceof Element && focused.getAttribute("role") === "menuitem") {
                  e.preventDefault();
                  (focused as HTMLElement).click();
                }
                return;
              }
              const row = list.querySelector<HTMLButtonElement>("button:not(:disabled)");
              if (row === null) return;
              e.preventDefault();
              row.focus();
              walkIndex.value = 0;
              return;
            }
            // Arrows walk the list. A keyboard still on the anchor enters at the end
            // the step comes from — unless it already walked, in which case the walk
            // resumes where it last put focus. The walk resumes from that recorded
            // index, not from `document.activeElement`: a row that refused focus (a
            // hidden portal frame, a detached node) would otherwise re-enter at the
            // near end on every press and the walk would alternate between two rows.
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
            // An embedded search field owns its text-navigation keys. Arrow keys may
            // still enter the result list, while Home and End keep moving its caret.
            if (e.target instanceof HTMLInputElement && (e.key === "Home" || e.key === "End"))
              return;
            const list = listRef.value;
            /* v8 ignore next -- the list is mounted whenever this effect's `open` is true. */
            if (list === null) return;
            if (!anchored) return;
            const buttons = Array.from(
              list.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
            );
            if (buttons.length === 0) return;
            const index = buttons.indexOf(focused as HTMLButtonElement);
            const from = index >= 0 ? index : walkIndex.value;
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? buttons.length - 1
                  : from === null
                    ? e.key === "ArrowDown"
                      ? 0
                      : buttons.length - 1
                    : (from + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
            e.preventDefault();
            walkIndex.value = next;
            buttons[next]?.focus();
          };
          /* jscpd:ignore-end */
          // A pointerdown inside a cross-origin iframe (a sandboxed HTML preview)
          // never reaches this document; the focus move it causes blurs the window
          // instead. Only that case closes: an app or tab switch leaves the
          // document's focus where it was, so activeElement is not an iframe.
          const onWindowBlur = (): void => {
            if (document.activeElement instanceof HTMLIFrameElement) dismiss();
          };
          document.addEventListener("keydown", onKeyDown, true);
          window.addEventListener("blur", onWindowBlur);
          return () => {
            document.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("blur", onWindowBlur);
          };
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    const renderEntry = (entry: TaskMenuEntry) => {
      /* jscpd:ignore-start -- schedule-local copy of the shared ui-primitives Menu; the two owners change independently. */
      if (isSeparator(entry)) {
        return h("div", { key: entry.id, class: css.separator, role: "separator" });
      }
      if (isLabel(entry)) {
        return h("div", { key: entry.id, class: css.label, role: "presentation" }, [entry.text]);
      }
      /* jscpd:ignore-end */
      const selected = entry.id === props.selectedId;
      return h("div", { key: entry.id, class: css.itemWrap }, [
        h(
          "button",
          {
            type: "button",
            role: "menuitem",
            class: clsx(css.item, selected && css.selected, entry.danger === true && css.danger),
            disabled: entry.disabled,
            onClick: () => {
              props.onSelect(entry.id);
            },
          },
          [
            entry.icon !== undefined && h("span", { class: css.itemIcon }, [entry.icon]),
            h("span", { class: css.itemLabel }, [entry.label]),
            selected && h(IconCheckOutlineRegular, { className: css.check! }),
          ],
        ),
      ]);
    };
    const list = computed(
      () =>
        props.open &&
        h(
          "div",
          {
            ref: listRef,
            class: clsx(
              css.list,
              props.listClassName,
              css.scrollable,
              (props.portal ?? false) && css.portal,
              (props.align ?? "start") === "end" && css.alignEnd,
            ),
            style: (props.portal ?? false) ? { positionAnchor: anchorName.value } : undefined,
            role: "menu",
            onClick: (e) => {
              e.stopPropagation();
              /* v8 ignore next -- React dispatches a click from an element target. */
              const row =
                e.target instanceof Element ? e.target.closest('button[role="menuitem"]') : null;
              if (row !== null) refocusAfterSelection();
            },
          },
          [
            props.header !== undefined &&
              h("div", { class: css.header, role: "presentation" }, [props.header]),
            h("div", { class: css.viewport, role: "presentation" }, [
              (props.items ?? []).map(renderEntry),
            ]),
          ],
        ),
    );
    return () => {
      return h(
        "span",
        {
          ref: rootRef,
          style: { anchorName: anchorName.value },
          class: clsx(css.root, props.className),
        },
        [
          props.anchor,
          (props.portal ?? false)
            ? list.value !== false && h(Teleport, { to: document.body }, [list.value])
            : list.value,
        ],
      );
    };
  },
  {
    props: [
      "open",
      "anchor",
      "items",
      "selectedId",
      "onSelect",
      "onClose",
      "align",
      "portal",
      "header",
      "className",
      "listClassName",
    ],
  },
);
