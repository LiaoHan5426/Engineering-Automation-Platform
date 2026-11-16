import {
  watchPostEffect,
  onMounted,
  h,
  defineComponent,
  computed,
  shallowRef,
  watch,
  type Ref,
} from "vue";
import clsx from "clsx";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import { PickerPopover } from "./PickerPopover.tsx";
import type { TaskManagerKey } from "./task-manager-locales.ts";
import css from "./ClockPicker.module.css";
/** Row copy of the task manager namespace, as the pickers receive it. */
type Translate = PropsLocale<"schedule.manager">["t"];
/** Padded two-digit clock values from zero through `count - 1`. */
function padded(count: number): readonly string[] {
  return Array.from({ length: count }, (_value, index) => String(index).padStart(2, "0"));
}
/** The picker's columns in display order, each with the label row copy names it by. */
const COLUMNS = [
  { label: "timing.hour", options: padded(24) },
  { label: "timing.minute", options: padded(60) },
  { label: "timing.second", options: padded(60) },
] as const satisfies readonly {
  readonly label: TaskManagerKey;
  readonly options: readonly string[];
}[];
/** Leading hour and minute of a clock, with its optional whole seconds. */
const CLOCK = /^(\d{2}):(\d{2})(?::(\d{2}))?/;
/**
 * The `HH:MM:SS` clock a pick composes onto.
 *
 * A clock without seconds gains `:00`, and fractional seconds drop. A value
 * that states no clock at all starts from midnight, so the first pick still
 * submits one complete clock rather than leaving a row empty.
 * @param value - staged clock text.
 * @returns its whole-second clock, or midnight when it states none.
 */
function clockBase(value: string): string {
  const match = CLOCK.exec(value);
  return match === null ? "00:00:00" : `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
}
/** One column's position in display order. */
type ClockColumnIndex = 0 | 1 | 2;
/** The picker's columns in display order, by position. */
const COLUMN_INDICES: readonly ClockColumnIndex[] = [0, 1, 2];
/**
 * Index of one column's option for one clock.
 * @param clock - whole-second clock text.
 * @param column - column index in display order.
 * @returns that column's option index, or the first option for a value the column does not list.
 */
function columnIndex(clock: string, column: ClockColumnIndex): number {
  const options = COLUMNS[column].options;
  const start = column === 0 ? 0 : column * 3;
  return Math.max(0, options.indexOf(clock.slice(start, start + 2)));
}
/** One option the panel shows as highlighted and holds the keyboard on. */
interface ClockCursor {
  /** Column the keyboard is in, in display order. */
  readonly column: number;
  /** Option index inside that column. */
  readonly index: number;
}
/** Inputs of the clock picker. */
export interface ClockPickerProps {
  /** Whether the panel is showing. */
  readonly open: boolean;
  /** The row's trigger button, which anchors the panel. */
  readonly anchorRef: Ref<HTMLButtonElement | null>;
  /** CSS anchor name assigned to the row trigger. */
  readonly anchorName: string;
  /** The staged clock text. */
  readonly value: string;
  /** Stage one picked `HH:MM:SS` clock. */
  readonly onPick: (time: string) => void;
  /** Dismiss the panel. */
  readonly onClose: () => void;
  /**
   * Whether the panel offers the seconds column (default true). A daily rule
   * names only its hour and minute, so its form hides the column; a pick then
   * keeps the staged clock's own seconds.
   */
  readonly seconds?: boolean;
  /** Row copy. */
  readonly t: Translate;
}
/**
 * Render the clock panel: hours, minutes, and optionally seconds, one scrolling column each.
 * @param props - open state, the trigger, the staged clock, the pick and close callbacks, the seconds-column switch, and row copy.
 * @returns the anchored panel while open, and nothing while closed.
 */
export const ClockPicker = defineComponent(
  (props: ClockPickerProps) => {
    const columns = computed(() => ((props.seconds ?? true) ? COLUMNS : COLUMNS.slice(0, 2)));
    const refs = shallowRef(new Map<string, HTMLDivElement>());
    const base = computed(() => clockBase(props.value));
    onMounted(() => {
      if (props.open)
        for (const column of COLUMN_INDICES)
          refs.value
            .get(`${column}:${columnIndex(clockBase(props.value), column)}`)
            ?.scrollIntoView({ block: "nearest" });
    });
    const picked = computed(() => [
      base.value.slice(0, 2),
      base.value.slice(3, 5),
      base.value.slice(6, 8),
    ]);
    const columnIndices = computed(() =>
      COLUMN_INDICES.map((column) => columnIndex(base.value, column)),
    );
    const cursor = shallowRef<ClockCursor>({ column: 0, index: columnIndex(base.value, 0) });
    // Opening starts on the clock the row shows, with every column scrolled to
    // that value: the first arrow key then walks from the current time in the
    // column the keyboard enters rather than from midnight.
    watch(
      [() => props.open],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (!props.open) return;
          cursor.value = { column: 0, index: columnIndex(clockBase(props.value), 0) };
          for (const column of COLUMN_INDICES) {
            refs.value
              .get(`${column}:${columnIndex(clockBase(props.value), column)}`)
              ?.scrollIntoView({ block: "nearest" });
          }
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    // The cursor owns the keyboard: a pick, an arrow, or the open itself moves the
    // highlight and takes focus with it, so the panel keeps the keyboard until it
    // closes.
    watchPostEffect(() => {
      if (props.open) refs.value.get(`${cursor.value.column}:${cursor.value.index}`)?.focus();
    });
    const pick = (column: number, option: string, index: number): void => {
      cursor.value = { column, index };
      const next = [...picked.value];
      next[column] = option;
      props.onPick(next.join(":"));
    };
    const onOptionKeyDown = (
      event: KeyboardEvent,
      column: number,
      index: number,
      option: string,
      count: number,
    ): void => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        pick(column, option, index);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const next = columns.value[column + (event.key === "ArrowRight" ? 1 : -1)];
        if (next === undefined) return;
        // Columns hold different counts, so the row carried across stays inside
        // the target column.
        const target = columns.value.indexOf(next);
        cursor.value = { column: target, index: Math.min(index, next.options.length - 1) };
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        cursor.value = { column, index: event.key === "Home" ? 0 : count - 1 };
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      cursor.value = { column, index: Math.min(Math.max(index + step, 0), count - 1) };
    };
    return () => {
      return h(
        PickerPopover,
        {
          open: props.open,
          anchorRef: props.anchorRef,
          anchorName: props.anchorName,
          label: props.t("timing.time"),
          className: css.clock!,
          onClose: props.onClose,
        },
        {
          default: () => [
            columns.value.map((column, at) =>
              h(
                "div",
                {
                  key: column.label,
                  role: "listbox",
                  "aria-label": props.t(column.label),
                  class: css.column,
                },
                [
                  column.options.map((option, index) =>
                    h(
                      "div",
                      {
                        key: option,
                        ref: (element) => {
                          const key = `${at}:${index}`;
                          if (element === null) refs.value.delete(key);
                          else if (element instanceof HTMLDivElement) refs.value.set(key, element);
                        },
                        role: "option",
                        "aria-selected": option === picked.value[at],
                        tabindex:
                          (cursor.value.column === at
                            ? cursor.value.index
                            : columnIndices.value[at]) === index
                            ? 0
                            : -1,
                        class: clsx(css.option, option === picked.value[at] && css.selected),
                        onClick: () => {
                          pick(at, option, index);
                        },
                        onKeydown: (event) => {
                          onOptionKeyDown(event, at, index, option, column.options.length);
                        },
                      },
                      [h("span", { class: css.optionLabel }, [option])],
                    ),
                  ),
                ],
              ),
            ),
          ],
        },
      );
    };
  },
  { props: ["open", "anchorRef", "anchorName", "value", "onPick", "onClose", "seconds", "t"] },
);
