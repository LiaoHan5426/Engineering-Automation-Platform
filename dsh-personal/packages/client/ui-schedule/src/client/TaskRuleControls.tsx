import { h, defineComponent, type CSSProperties } from "vue";
import clsx from "clsx";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import {
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
  Pill,
} from "@deepseek-ai/dsh-client-ui-primitives";
import css from "./TaskManagerPage.module.css";
type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const WEEKDAY_LABELS = {
  1: "frequency.weekday.1",
  2: "frequency.weekday.2",
  3: "frequency.weekday.3",
  4: "frequency.weekday.4",
  5: "frequency.weekday.5",
  6: "frequency.weekday.6",
  7: "frequency.weekday.7",
} as const;
/**
 * Render the weekly rule's Weekday row: one pill per weekday, named by the row's
 * label and toggled in the rule the caller is editing.
 * @param props.weekdays - weekdays the rule currently selects, as ISO weekday numbers (Monday is 1).
 * @param props.disabled - whether the rule's controls are read-only.
 * @param props.t - frequency translator owning the weekday labels.
 * @param props.rowId - id builder for the row's label, which names the pill group.
 * @param props.onToggle - toggle one weekday in the rule being edited.
 * @returns the labelled Weekday row.
 */
export const RuleWeekdayRow = defineComponent(
  (props: {
    weekdays: readonly number[];
    disabled: boolean;
    t: PropsLocale<"schedule.manager">["t"];
    rowId: (name: string) => string;
    onToggle: (weekday: Weekday) => void;
  }) => {
    return () => {
      return h("div", { class: css.ruleRow }, [
        h("span", { class: css.ruleLabel, id: props.rowId("weekday") }, [props.t("rule.weekday")]),
        h(
          "div",
          {
            class: clsx(css.ruleWeekdays, css.ruleControl),
            role: "group",
            "aria-labelledby": props.rowId("weekday"),
          },
          [
            WEEKDAYS.map((weekday) => {
              const selected = props.weekdays.includes(weekday);
              return h(
                Pill,
                {
                  key: weekday,
                  className: css.ruleControl!,
                  active: selected,
                  disabled: props.disabled,
                  "aria-pressed": selected,
                  "aria-label": props.t("rule.weekdayOption", {
                    weekday: props.t(WEEKDAY_LABELS[weekday]),
                  }),
                  onClick: () => {
                    props.onToggle(weekday);
                  },
                },
                { default: () => [props.t(WEEKDAY_LABELS[weekday])] },
              );
            }),
          ],
        ),
      ]);
    };
  },
  { props: ["weekdays", "disabled", "t", "rowId", "onToggle"] },
);
/** Inputs of one whole-number stepper of the task rule form. */
interface RuleStepperProps {
  /** Id the row's label points at. */
  readonly id: string;
  /** Smallest value the field accepts. */
  readonly min: number;
  /** Largest value the field accepts. */
  readonly max: number;
  /** Staged value. */
  readonly value: number;
  /** Whether every edit is blocked. */
  readonly disabled: boolean;
  /** Accessible name of the up arrow. */
  readonly increaseLabel: string;
  /** Accessible name of the down arrow. */
  readonly decreaseLabel: string;
  /** Stage one clamped whole value. */
  readonly onChange: (value: number) => void;
}
/**
 * One whole-number stepper of the task rule form, such as the repeat interval or
 * the day of the month. Values clamp to the field's bounds, and an emptied or
 * fractional input stages nothing, so the staged rule stays valid on every edit.
 * @param props - bounds, staged value, blocking state, arrow labels, and callback.
 * @returns the stepper pill.
 */
export const RuleStepper = defineComponent(
  (props: RuleStepperProps) => {
    const clamp = (next: number): number => Math.min(props.max, Math.max(props.min, next));
    return () => {
      return h(
        "span",
        {
          class: css.ruleIntervalStepper,
          style: { "--interval-digits": String(props.value).length } as CSSProperties,
        },
        [
          h("input", {
            id: props.id,
            class: clsx(css.ruleInput, css.ruleControl, css.ruleIntervalInput),
            type: "number",
            min: props.min,
            max: props.max,
            step: 1,
            disabled: props.disabled,
            value: props.value,
            onInput: (event) => {
              const next = Number((event.currentTarget as HTMLInputElement).value);
              if (
                (event.currentTarget as HTMLInputElement).value === "" ||
                !Number.isSafeInteger(next)
              ) {
                (event.currentTarget as HTMLInputElement).value = String(props.value);
                return;
              }
              (event.currentTarget as HTMLInputElement).value = String(clamp(next));
              props.onChange(clamp(next));
            },
          }),
          h("span", { class: css.ruleIntervalArrows }, [
            h(
              "button",
              {
                type: "button",
                class: css.ruleIntervalArrow,
                "aria-label": props.increaseLabel,
                disabled: props.disabled || props.value >= props.max,
                onClick: () => {
                  props.onChange(clamp(props.value + 1));
                },
              },
              [h(IconChevronUpOutlineRegular, { size: 9 })],
            ),
            h(
              "button",
              {
                type: "button",
                class: css.ruleIntervalArrow,
                "aria-label": props.decreaseLabel,
                disabled: props.disabled || props.value <= props.min,
                onClick: () => {
                  props.onChange(clamp(props.value - 1));
                },
              },
              [h(IconChevronDownOutlineRegular, { size: 9 })],
            ),
          ]),
        ],
      );
    };
  },
  {
    props: ["id", "min", "max", "value", "disabled", "increaseLabel", "decreaseLabel", "onChange"],
  },
);
