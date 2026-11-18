import { h, shallowRef, nextTick } from "vue";
// @vitest-environment jsdom
import { render, cleanup, act } from "@deepseek-ai/dsh-client-test-runtime/src/vue-test.ts";
import { fireEvent, screen } from "@testing-library/dom";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { StartedToolCall, ToolResultNode } from "@deepseek-ai/dsh-client-ui-chat/client";
import type { ToolCallOwnerProps } from "@deepseek-ai/dsh-client-ui-tool/client";
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { zh as commonZh } from "@deepseek-ai/dsh-client-locale/src/locales/zh.ts";
import { PartialArguments } from "@deepseek-ai/dsh-util-values";
import { SkillRow } from "../src/client/SkillRow.tsx";
import { zh } from "../src/client/locales.ts";
type SkillRowProps = InstanceType<typeof SkillRow>["$props"];
const t: SkillRowProps["t"] = makeTranslate(zh, commonZh);
afterEach(cleanup);
function settled(over: Partial<ToolResultNode> = {}): ToolResultNode {
  const call =
    over.call === undefined
      ? { name: "skill", argsRaw: '{"name":"dsh-manage-issues"}' }
      : over.call;
  return {
    kind: "tool-result",
    seq: 3,
    time: 3000,
    callId: "call-skill",
    name: call?.name ?? "",
    args: call === null ? PartialArguments.EMPTY : PartialArguments.fromText(call.argsRaw),
    call,
    callTime: 2000,
    content: [{ type: "text", text: "Follow the issue workflow.\nKeep project fields in sync." }],
    isError: false,
    subCalls: [],
    ...over,
  };
}
function running(argsRaw = '{"name":"dsh-manage-issues"}'): StartedToolCall {
  return {
    phase: "start" as const,
    args: PartialArguments.fromText(argsRaw),
    callId: "call-skill",
    name: "skill",
    argsRaw,
    turn: 1,
    step: 1,
    time: 2000,
    subCalls: [],
  };
}
function props(block: SkillRowProps["block"], inspect?: () => void): SkillRowProps {
  const owner: ToolCallOwnerProps = {
    callId: block.callId,
    toolName: "skill",
    ...("kind" in block
      ? { phase: "result" as const, block }
      : block.phase === "preparing"
        ? { phase: "preparing" as const, block }
        : { phase: "start" as const, block }),
    useDisclosure: () => shallowRef({ expanded: false, setExpanded: vi.fn(), toggle: vi.fn() }),
    loadImage: vi.fn<ToolCallOwnerProps["loadImage"]>(),
    openFile: vi.fn(),
    inspect,
  };
  return { ...owner, t } as SkillRowProps;
}
describe("SkillRow", () => {
  it("shows preparation without arguments, instructions, or disclosure", async () => {
    const view = render(
      h(SkillRow, {
        ...props({
          phase: "preparing",
          args: PartialArguments.EMPTY,
          callId: "call-skill",
          name: "skill",
          turn: 1,
          step: 1,
          time: 1,
          subCalls: [],
        }),
      }),
    );
    await nextTick();
    expect(view.getByText("准备加载技能")).toBeTruthy();
    expect(view.container.querySelector("svg")).not.toBeNull();
    expect(view.queryByRole("button")).toBeNull();
    expect(view.container.querySelector("pre")).toBeNull();
  });
  it("renders a compact Bash-shaped summary and discloses the exact instructions", async () => {
    const inspect = vi.fn();
    const view = render(h(SkillRow, { ...props(settled(), inspect) }));
    await nextTick();
    const row = screen.getByRole("button", { name: "加载技能dsh-manage-issues" });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(view.container.querySelector('[data-tool="skill"]')?.getAttribute("data-state")).toBe(
      "ok",
    );
    expect(view.container.querySelector('[data-tool="skill"] svg')?.getAttribute("width")).toBe(
      "14",
    );
    expect(screen.queryByLabelText("说明")).toBeNull();
    await act(() => {
      fireEvent.click(row);
    });
    expect(row.getAttribute("aria-expanded")).toBe("true");
    const card = screen.getByLabelText("说明");
    expect(card.textContent).toBe("说明Follow the issue workflow.\nKeep project fields in sync.");
    expect(view.container.textContent).not.toContain('{"name":"dsh-manage-issues"}');
    await act(() => {
      fireEvent.click(screen.getByRole("button", { name: "查看" }));
    });
    expect(inspect).toHaveBeenCalledTimes(1);
    await act(() => {
      fireEvent.click(row);
    });
    expect(row.getAttribute("aria-expanded")).toBe("false");
  });
  it("supports Enter and Space while ignoring unrelated keys", async () => {
    render(h(SkillRow, { ...props(settled()) }));
    await nextTick();
    const row = screen.getByRole("button");
    await act(() => {
      fireEvent.keyDown(row, { key: "Escape" });
    });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    await act(() => {
      fireEvent.keyDown(row, { key: "Enter" });
    });
    expect(row.getAttribute("aria-expanded")).toBe("true");
    await act(() => {
      fireEvent.keyDown(row, { key: " " });
    });
    expect(row.getAttribute("aria-expanded")).toBe("false");
  });
  it("keeps a running call compact and announces its state", async () => {
    const view = render(h(SkillRow, { ...props(running()) }));
    await nextTick();
    const row = view.container.querySelector('[data-tool="skill"] > div')!;
    expect(row.getAttribute("role")).toBeNull();
    expect(view.container.textContent).toContain("正在加载 skill");
    expect(view.container.textContent).toContain("dsh-manage-issues");
    expect(
      view.container.querySelector('svg[data-icon="dsw-icon-skill-outline-regular"]'),
    ).not.toBeNull();
  });
  it("uses the first failure line in the summary and exposes the full error", async () => {
    const view = render(
      h(SkillRow, {
        ...props(
          settled({
            content: [{ type: "text", text: "SkillError: missing resource\nCheck SKILL.md." }],
            isError: true,
            error: { name: "SkillError", code: "missing" },
          }),
        ),
      }),
    );
    await nextTick();
    const row = screen.getByRole("button", {
      name: "skill 加载失败加载技能SkillError: missing resource",
    });
    expect(view.container.querySelector('[data-tool="skill"]')?.getAttribute("data-state")).toBe(
      "error",
    );
    expect(view.container.querySelector('[data-tool="skill"] [role="button"] svg')).not.toBeNull();
    expect(view.container.querySelector('[data-tool="skill"] [data-state]')).toBeNull();
    expect(row.textContent).not.toContain("Check SKILL.md.");
    await act(() => {
      fireEvent.click(row);
    });
    const output = view.container.querySelector("pre")!;
    expect(output.textContent).toBe("SkillError: missing resource\nCheck SKILL.md.");
    expect(output.getAttribute("data-error")).toBe("true");
  });
  it("renders stopped, structured, and structured-error durable outcomes", async () => {
    const stoppedView = render(
      h(SkillRow, {
        ...props(
          settled({
            error: { name: "InterruptedError", code: "interrupted" },
          }),
        ),
      }),
    );
    await nextTick();
    const stoppedSummary = stoppedView.getByText("skill 加载已中止");
    expect(stoppedSummary.parentElement?.className).toContain("stoppedSummary");
    expect(
      stoppedView.container.querySelector('[data-tool="skill"] [role="button"] svg'),
    ).not.toBeNull();
    expect(stoppedView.container.querySelector('[data-tool="skill"] [data-state]')).toBeNull();
    cleanup();
    const structuredView = render(
      h(SkillRow, {
        ...props(
          settled({
            content: [{ type: "reasoning", text: "structured instruction note" }],
          }),
        ),
      }),
    );
    await nextTick();
    await act(() => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(structuredView.container.textContent).toContain('"type": "reasoning"');
    cleanup();
    render(
      h(SkillRow, {
        ...props(
          settled({
            content: [],
            isError: true,
            error: { name: "SkillError", code: "missing" },
          }),
        ),
      }),
    );
    await nextTick();
    const errorRow = screen.getByRole("button", {
      name: "skill 加载失败加载技能SkillError: missing",
    });
    await act(() => {
      fireEvent.click(errorRow);
    });
    expect(screen.getAllByText("SkillError: missing")).toHaveLength(2);
  });
  it("falls back to durable args or call id when the skill name is unavailable", async () => {
    const invalid = render(h(SkillRow, { ...props(running('{"name":\n')) }));
    await nextTick();
    expect(invalid.container.textContent).toContain('{"name":');
    cleanup();
    const scalar = render(h(SkillRow, { ...props(running('"raw-name"')) }));
    await nextTick();
    expect(scalar.container.textContent).toContain('"raw-name"');
    cleanup();
    const emptyName = render(h(SkillRow, { ...props(running('{"name":""}')) }));
    await nextTick();
    expect(emptyName.container.textContent).toContain('{"name":""}');
    cleanup();
    const blank = render(h(SkillRow, { ...props(settled({ call: null, content: [] })) }));
    await nextTick();
    expect(blank.container.textContent).toContain("call-skill");
    expect(blank.container.querySelector('[role="button"]')).toBeNull();
    expect(blank.container.textContent).not.toContain("正在加载 skill");
  });
});
