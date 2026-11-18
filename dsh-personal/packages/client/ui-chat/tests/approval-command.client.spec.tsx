import { h, computed } from "vue";
// @vitest-environment jsdom
import type { ChatSnapshot, UseChat } from "@deepseek-ai/dsh-client-ui-chat/client";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { PartialArguments } from "@deepseek-ai/dsh-util-values";
import { render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { screen } from "@testing-library/dom";
import { describe, expect, it } from "vite-plus/test";
import { ApprovalCommand, commandOf } from "../src/client/chat/ApprovalCommand.tsx";
function props(
  nodes: readonly unknown[],
  callId = "call-1",
): PropsRuntime<"conversation.approval.detail"> {
  const snapshot = {
    nodes: { values: () => nodes },
  } as unknown as ChatSnapshot;
  const useChat = ((selector: (value: ChatSnapshot) => unknown) =>
    computed(() => selector(snapshot))) as UseChat;
  return { callId, useChat } as PropsRuntime<"conversation.approval.detail">;
}
describe("commandOf", () => {
  it("accepts only a non-empty string command from valid JSON arguments", async () => {
    expect(commandOf(undefined)).toBeUndefined();
    expect(commandOf({ callId: "c1", name: "bash", argsRaw: "{" })).toBeUndefined();
    expect(commandOf({ callId: "c1", name: "bash", argsRaw: "{}" })).toBeUndefined();
    expect(commandOf({ callId: "c1", name: "bash", argsRaw: '{"command":42}' })).toBeUndefined();
    expect(commandOf({ callId: "c1", name: "bash", argsRaw: '{"command":""}' })).toBeUndefined();
    expect(commandOf({ callId: "c1", name: "bash", argsRaw: '{"command":"pnpm test"}' })).toBe(
      "pnpm test",
    );
  });
  it("reads the text typed into a terminal as its command", async () => {
    expect(
      commandOf({
        callId: "c1",
        name: "terminal_send",
        argsRaw: '{"sessionId":"pty-1","text":"pnpm run dev"}',
      }),
    ).toBe("pnpm run dev");
    expect(
      commandOf({
        callId: "c1",
        name: "terminal_send",
        argsRaw: '{"sessionId":"pty-1","text":"","submit":true}',
      }),
    ).toBeUndefined();
    expect(
      commandOf({ callId: "c1", name: "write", argsRaw: '{"path":"notes.md","text":"draft"}' }),
    ).toBeUndefined();
  });
});
describe("ApprovalCommand", () => {
  it("renders the running correlated Tool command", async () => {
    render(
      h(ApprovalCommand, {
        ...props([
          { kind: "assistant-step", data: {} },
          {
            kind: "tool-call",
            data: {
              root: {
                phase: "start",
                args: PartialArguments.fromText('{"command":"wrong"}'),
                callId: "other",
                name: "bash",
                argsRaw: '{"command":"wrong"}',
              },
            },
          },
          {
            kind: "tool-call",
            data: {
              root: {
                phase: "start",
                args: PartialArguments.fromText('{"command":"pnpm test"}'),
                callId: "call-1",
                name: "bash",
                argsRaw: '{"command":"pnpm test"}',
              },
            },
          },
        ] as never),
      }),
    );
    expect(screen.getByText("pnpm test")).toBeTruthy();
  });
  it("omits absent, uncorrelated, preparing, and settled Tool calls", async () => {
    const view = render(
      h(ApprovalCommand, {
        ...props([
          { kind: "assistant-step", data: {} },
          { kind: "tool-call", data: { root: undefined } },
          {
            kind: "tool-call",
            data: {
              root: {
                phase: "start",
                args: PartialArguments.fromText("{}"),
                callId: "other",
                argsRaw: "{}",
              },
            },
          },
          {
            kind: "tool-call",
            data: {
              root: {
                phase: "preparing",
                args: PartialArguments.EMPTY,
                callId: "call-1",
                name: "bash",
              },
            },
          },
          {
            kind: "tool-call",
            data: {
              root: { kind: "tool-result", callId: "call-1", argsRaw: '{"command":"ignored"}' },
            },
          },
        ] as never),
      }),
    );
    expect(view.container.textContent).toBe("");
    await view.rerender(
      h(ApprovalCommand, {
        ...props([
          {
            kind: "tool-call",
            data: {
              root: {
                phase: "start",
                args: PartialArguments.fromText("{}"),
                callId: "call-1",
                argsRaw: "{}",
              },
            },
          },
        ] as never),
      }),
    );
    expect(view.container.textContent).toBe("");
  });
});
