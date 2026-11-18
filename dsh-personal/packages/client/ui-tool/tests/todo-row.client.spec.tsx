// @vitest-environment jsdom
import { shallowRef } from "vue";
import { toolSeats } from "./tool-seats.client.ts";
/** todo_write atomic Tool presentation and its plan-summary model. */
import { h } from "vue";
import { fireEvent, screen } from "@testing-library/dom";
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from "./vue-render.ts";
import { useDisclosure } from "@deepseek-ai/dsh-client-ui-chat/src/client/chat/use-disclosure.ts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { TodoItem } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { ToolResultNode } from "@deepseek-ai/dsh-client-ui-chat/client";
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { zh as commonZh } from "@deepseek-ai/dsh-client-locale/src/locales/zh.ts";
import { TodoRow, todoToolview } from "../src/client/tool/toolviews/todo-row.tsx";
import { planSummary } from "../src/client/tool/toolviews/plan-summary.ts";
import { CONVERSATION_NS as NS } from "../src/client/locale.ts";
import { zh } from "@deepseek-ai/dsh-client-ui-conversation/src/client/locales.ts";
import { PartialArguments } from "@deepseek-ai/dsh-util-values";
type TodoRowProps = InstanceType<typeof TodoRow>["$props"];
const t: TodoRowProps["t"] = makeTranslate(zh, commonZh);
afterEach(cleanup);
const LIST: TodoItem[] = [
  { content: "搭骨架", status: "completed" },
  { content: "写组件", status: "in_progress" },
  { content: "补测试", status: "pending" },
];
const PARALLEL: TodoItem[] = [
  { content: "搭骨架", status: "completed" },
  { content: "写组件", status: "in_progress" },
  { content: "跑后台构建", status: "in_progress" },
  { content: "读源码", status: "in_progress" },
  { content: "补测试", status: "pending" },
];
describe("planSummary", () => {
  it("counts done/total and names the single active item with no extra count", () => {
    expect(planSummary(LIST)).toEqual({
      done: 1,
      total: 3,
      activeContent: "写组件",
      activeExtra: 0,
    });
  });
  it("reports the extra active count separately when several items are in progress", () => {
    expect(planSummary(PARALLEL)).toEqual({
      done: 1,
      total: 5,
      activeContent: "写组件",
      activeExtra: 2,
    });
  });
  it("has no hint when nothing is in progress", () => {
    expect(planSummary([{ content: "都完了", status: "completed" }])).toEqual({
      done: 1,
      total: 1,
      activeContent: null,
      activeExtra: 0,
    });
  });
  it("has no hint when the first active item carries no usable content", () => {
    expect(
      planSummary([{ status: "in_progress" }, { content: "x", status: "in_progress" }]),
    ).toMatchObject({ activeContent: null, activeExtra: 0 });
    expect(planSummary([{ content: 42, status: "in_progress" }]).activeContent).toBeNull();
    expect(planSummary([{ content: "", status: "in_progress" }]).activeContent).toBeNull();
    expect(
      planSummary([
        { content: "   ", status: "in_progress" },
        { content: "x", status: "in_progress" },
      ]),
    ).toMatchObject({ activeContent: null, activeExtra: 0 });
  });
  it("is empty-safe", () => {
    expect(planSummary([])).toEqual({ done: 0, total: 0, activeContent: null, activeExtra: 0 });
  });
});
const resultNode = (argsRaw: string, over?: Partial<ToolResultNode>): ToolResultNode => {
  const call = over?.call === undefined ? { name: "todo_write", argsRaw } : over.call;
  return {
    kind: "tool-result",
    seq: 10,
    time: 2000,
    callTime: 1000,
    callId: "c1",
    name: call?.name ?? "",
    args: call === null ? PartialArguments.EMPTY : PartialArguments.fromText(call.argsRaw),
    call,
    content: [],
    isError: false,
    subCalls: [],
    ...over,
  };
};
function rowProps(block: TodoRowProps["block"]): TodoRowProps {
  return {
    ...toolSeats,
    useDisclosure,
    callId: "c1",
    toolName: "todo_write",
    ...("kind" in block
      ? { phase: "result" as const, block: block }
      : { phase: block.phase, block: block }),
    openFile: vi.fn(),
    sessionId: toolSeats.sessionId,
    useSessions: () => shallowRef(undefined),
    useTodoHistory: () => shallowRef(undefined),
    useSession: () => shallowRef(true),
    t,
  } as TodoRowProps;
}
describe("TodoRow", () => {
  const ARGS = JSON.stringify({ todos: LIST });
  it("summarizes counts and the active item from the call args", async () => {
    await act(async () =>
      render(h(TodoRow, { ...toolSeats, ...rowProps(resultNode(ARGS)) }, undefined)),
    );
    expect(screen.getByText("更新任务清单")).toBeTruthy();
    expect(screen.getByText("1/3 已完成 · 写组件")).toBeTruthy();
  });
  it("reports the extra active count outside the ellipsized summary text", async () => {
    const { container } = await act(async () =>
      render(
        h(
          TodoRow,
          { ...toolSeats, ...rowProps(resultNode(JSON.stringify({ todos: PARALLEL }))) },
          undefined,
        ),
      ),
    );
    const text = screen.getByText("1/5 已完成 · 写组件");
    const extra = screen.getByText("+2");
    expect(text.contains(extra)).toBe(false);
    expect(container.textContent).toContain("1/5 已完成 · 写组件+2");
  });
  it("omits the active clause when no item is in progress and reads running-call args", async () => {
    const args = JSON.stringify({ todos: [{ content: "x", status: "completed" }] });
    await act(async () =>
      render(
        h(
          TodoRow,
          {
            ...toolSeats,
            ...rowProps({
              phase: "start" as const,
              args: PartialArguments.fromText(args),
              callId: "c1",
              name: "todo_write",
              argsRaw: args,
              turn: 1,
              step: 1,
              time: 1000,
              subCalls: [],
            }),
          },
          undefined,
        ),
      ),
    );
    expect(screen.getByText("1/1 已完成")).toBeTruthy();
  });
  it("keeps the counts when an active item has unusable content", async () => {
    const args = JSON.stringify({
      todos: [
        { content: "done", status: "completed" },
        { content: 42, status: "in_progress" },
      ],
    });
    const { container } = await act(async () =>
      render(h(TodoRow, { ...toolSeats, ...rowProps(resultNode(args)) }, undefined)),
    );
    expect(screen.getByText("1/2 已完成")).toBeTruthy();
    expect(container.textContent).not.toContain("+");
  });
  it("keeps non-ok execution states visible through the shared row states", async () => {
    const args = JSON.stringify({ todos: LIST });
    const running = await act(async () =>
      render(
        h(
          TodoRow,
          {
            ...toolSeats,
            ...rowProps({
              phase: "start" as const,
              args: PartialArguments.fromText(args),
              callId: "c1",
              name: "todo_write",
              argsRaw: args,
              turn: 1,
              step: 1,
              time: 1000,
              subCalls: [],
            }),
          },
          undefined,
        ),
      ),
    );
    expect(running.container.querySelector('[data-state="running"]')).not.toBeNull();
    expect(running.container.querySelector('[data-state="running"] svg')).not.toBeNull();
    running.unmount();
    const stopped = await act(async () =>
      render(
        h(
          TodoRow,
          {
            ...toolSeats,
            ...rowProps(
              resultNode(args, {
                isError: true,
                error: { name: "Interrupted", code: "interrupted" },
              }),
            ),
          },
          undefined,
        ),
      ),
    );
    expect(stopped.container.querySelector('[data-state="stopped"]')).not.toBeNull();
  });
  it("falls back to the generic summary on malformed args and marks the error state", async () => {
    const view = await act(async () =>
      render(
        h(
          TodoRow,
          { ...toolSeats, ...rowProps(resultNode("not json", { isError: true })) },
          undefined,
        ),
      ),
    );
    expect(view.container.querySelector('[data-state="error"]')).not.toBeNull();
    expect(view.container.querySelector('[data-state="error"] svg')).not.toBeNull();
    expect(screen.getByText("not json")).toBeTruthy();
  });
  it("falls back when parsed args carry no todos array", async () => {
    await act(async () =>
      render(h(TodoRow, { ...toolSeats, ...rowProps(resultNode('{"other":1}')) }, undefined)),
    );
    expect(screen.getByText('{"other":1}')).toBeTruthy();
  });
  it("leading toggle expands a read-only checklist", async () => {
    await act(async () =>
      render(h(TodoRow, { ...toolSeats, ...rowProps(resultNode(ARGS)) }, undefined)),
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { expanded: false })));
    expect(screen.getByRole("button", { expanded: true })).toBeTruthy();
    expect(screen.getByText("搭骨架")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByLabelText("进行中")).toBeTruthy();
    expect(screen.queryByText("输入")).toBeNull();
  });
  it.each([
    { label: "null root", argsRaw: "null" },
    { label: "non-object root", argsRaw: "42" },
    { label: "null items", argsRaw: '{"todos":[null]}' },
  ])(
    "falls back to the generic summary on valid JSON with an invalid shape ($label)",
    async ({ argsRaw }) => {
      await act(async () =>
        render(h(TodoRow, { ...toolSeats, ...rowProps(resultNode(argsRaw)) }, undefined)),
      );
      expect(screen.getByText(argsRaw)).toBeTruthy();
    },
  );
  it("window-truncated result falls back to the callId summary", async () => {
    await act(async () =>
      render(h(TodoRow, { ...toolSeats, ...rowProps(resultNode("", { call: null })) }, undefined)),
    );
    expect(screen.getByText("c1")).toBeTruthy();
  });
  it("injects the keyed toolview declaration directly", () => {
    expect(todoToolview.name).toBe("todo-toolview");
    expect(todoToolview.inject).toEqual(["slots", "uiConversation"]);
    const register = vi.fn((_spec: unknown, _component: unknown) => () => undefined);
    const inject = vi.fn((_name: string, callback: () => () => void) => callback());
    todoToolview.apply({
      slots: { inject, register },
      uiConversation: { events: { register: vi.fn() }, views: { register: vi.fn() } },
    } as never);
    expect(inject).toHaveBeenCalledWith("tool.call.toolview", expect.any(Function));
    const [spec, component] = register.mock.calls[0] ?? [];
    expect(spec).toMatchObject({ name: "tool.call.toolview", key: "todo_write", locale: NS });
    expect(
      (
        spec as
          | {
              inject?: unknown;
            }
          | undefined
      )?.inject,
    ).toEqual(expect.any(Function));
    expect(component).toBe(TodoRow);
  });
});
