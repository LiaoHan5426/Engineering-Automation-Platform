import { defineComponent, computed, shallowRef, h } from "vue";
import type { Context } from "@deepseek-ai/cordis";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
// The domain's client-namespace pure-type outlet: one import edge delivers
// the `todos` projection-key merge (single source, no consumer-side restated
// declare) and the payload type. Type-only by construction — the outlet is
// free of host value imports, so no host Context merge enters this program.
import type { TodoItem } from "@deepseek-ai/dsh-tool-todo/client";
import {
  IconChecklistOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
  StateDot,
  type StateDotState,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { NS } from "../locales.ts";
import css from "./TodoPanel.module.css";
export interface TodoPanelProps {
  /** The session's current plan (empty renders nothing) — selected by the dock adapter. */
  todos: readonly TodoItem[];
  /** The dock entry's locale seat, passed down as a plain prop. */
  t: TodoDockProps["t"];
}
/** Local exhaustiveness helper — client packages do not depend on `dsh-llm`. */
/* v8 ignore next 3 -- closed-union backstop; only reached if status is forged */
function assertNever(value: never): never {
  throw new Error(`unreachable todo status: ${String(value)}`);
}
/** Map Todo lifecycle state onto the shared compact status language. */
function statusDotState(status: TodoItem["status"]): StateDotState {
  switch (status) {
    case "completed":
      return "done";
    case "in_progress":
      return "ongoing";
    case "pending":
      return "idle";
    /* v8 ignore next -- closed TodoItem status union */
    default:
      return assertNever(status);
  }
}
/** Return the localized status announced beside one decorative marker. */
function statusLabel(status: TodoItem["status"], t: TodoPanelProps["t"]): string {
  switch (status) {
    case "completed":
      return t("todo.status.completed");
    case "in_progress":
      return t("todo.status.inProgress");
    case "pending":
      return t("todo.status.pending");
    /* v8 ignore next -- closed TodoItem status union */
    default:
      return assertNever(status);
  }
}
/** Header summary: "·"-joined per-status counts; zero-count segments are omitted as noise (a non-empty list keeps at least one). */
function progressLabel(todos: readonly TodoItem[], t: TodoPanelProps["t"]): string {
  const done = todos.filter((item) => item.status === "completed").length;
  const active = todos.filter((item) => item.status === "in_progress").length;
  const pending = todos.length - done - active;
  // En spaces (U+2002): HTML collapses runs of ASCII spaces, so widening the
  // separator breathing room needs a literal wide space.
  return [
    ...(done > 0 ? [t("todo.progress.done", { done })] : []),
    ...(active > 0 ? [t("todo.progress.active", { active })] : []),
    ...(pending > 0 ? [t("todo.progress.pending", { pending })] : []),
  ].join("\u2002·\u2002");
}
export const TodoPanel = defineComponent(
  (props: TodoPanelProps) => {
    const todos = computed(() => props.todos);
    const t = computed(() => props.t);
    const collapsed = shallowRef(true);
    const setCollapsed = (
      next: typeof collapsed.value | ((previous: typeof collapsed.value) => typeof collapsed.value),
    ) => {
      collapsed.value = typeof next === "function" ? next(collapsed.value) : next;
    };
    return () => {
      if (todos.value.length === 0) return null;
      return h(
        "section",
        {
          class: css.root,
          "data-testid": "todo-panel",
          "aria-label": t.value("todo.title"),
        },
        [
          h(
            "div",
            {
              class: css.body,
            },
            [
              h(
                "button",
                {
                  type: "button",
                  class: css.header,
                  "aria-expanded": !collapsed.value,
                  onClick: () => {
                    setCollapsed((v) => !v);
                  },
                },
                [
                  h(
                    "span",
                    {
                      class: css.lead,
                      "aria-hidden": true,
                    },
                    [h(IconChecklistOutlineRegular, null)],
                  ),
                  h(
                    "span",
                    {
                      class: css.title,
                    },
                    [t.value("todo.title")],
                  ),
                  h(
                    "span",
                    {
                      class: css.progress,
                    },
                    [progressLabel(todos.value, t.value)],
                  ),
                  h(
                    "span",
                    {
                      class: css.chevron,
                      "aria-hidden": true,
                    },
                    [
                      collapsed.value
                        ? h(IconChevronUpOutlineRegular, null)
                        : h(IconChevronDownOutlineRegular, null),
                    ],
                  ),
                ],
              ),
              !collapsed.value &&
                h(
                  "ul",
                  {
                    class: css.list,
                  },
                  [
                    todos.value.map((item) =>
                      h(
                        "li",
                        {
                          key: item.content,
                          class: css.item,
                          "data-status": item.status,
                        },
                        [
                          h(
                            "span",
                            {
                              class: css.glyph,
                              role: "img",
                              "aria-label": statusLabel(item.status, t.value),
                            },
                            [
                              h(StateDot, {
                                state: statusDotState(item.status),
                              }),
                            ],
                          ),
                          h(
                            "span",
                            {
                              class: css.content,
                            },
                            [item.content],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      );
    };
  },
  {
    props: ["todos", "t"],
    inheritAttrs: false,
  },
);
/** Props for the projected todo dock. */
export type TodoDockProps = PropsRuntime<"conversation.input.dock"> & PropsLocale<"conversation">;
/** Renders the current todo projection, or nothing when it is absent. */
export const TodoDock = defineComponent(
  (props: TodoDockProps) => {
    const useProjection = computed(() => props.useProjection);
    const t = computed(() => props.t);
    const todos = useProjection.value("todos");
    return () =>
      h(TodoPanel, {
        todos: todos.value ?? [],
        t: t.value,
      });
  },
  {
    props: ["useProjection", "t"],
    inheritAttrs: false,
  },
);
/** Registers the projected todo dock. */
export const todoDockEntry = {
  name: "conversation-todo-dock",
  inject: ["slots"],
  apply(ctx: Context): void {
    ctx.slots.inject("conversation.input.dock", () =>
      ctx.slots.register(
        { name: "conversation.input.dock", id: "todo", order: 0, locale: NS },
        TodoDock,
      ),
    );
  },
};
