// @vitest-environment jsdom
import { h as vueH } from "vue";
/** The process row reads the card title from the recorded arguments and expands only a refused call. */
import { cleanup, fireEvent, render } from "./vue-render.client.ts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { StartedToolCall, ToolResultNode } from "@deepseek-ai/dsh-client-ui-chat/client";
import { brandString } from "@deepseek-ai/dsh-brand";
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { PartialArguments } from "@deepseek-ai/dsh-util-values";
import { ProposeRow } from "../src/client/ProposeRow.tsx";
import { en } from "../src/client/locales.ts";
afterEach(cleanup);
type Props = InstanceType<typeof ProposeRow>["$props"];
const argsRaw = JSON.stringify({
  action: "test_action",
  title: "Counter",
  brief: "Keep count.",
  details: {},
});
const running: StartedToolCall = {
  phase: "start",
  args: PartialArguments.fromText(argsRaw),
  callId: "c",
  name: "propose_action",
  argsRaw,
  turn: 1,
  step: 1,
  time: 1,
  subCalls: [],
};
const settled: ToolResultNode = {
  kind: "tool-result",
  seq: 2,
  time: 2,
  callId: "c",
  name: "propose_action",
  args: PartialArguments.fromText(argsRaw),
  call: { name: "propose_action", argsRaw },
  callTime: 1,
  content: [
    { type: "text", text: "Card shown below your answer. Do not restate it. Invite the user." },
  ],
  isError: false,
  subCalls: [],
};
function props(block: Props["block"], inspect?: () => void): Props {
  const unused = (): never => {
    throw new Error("Unexpected framework read in process row");
  };
  const shared = {
    callId: "c",
    toolName: "propose_action",
    openFile: vi.fn(),
    inspect,
    t: makeTranslate(en),
    useDisclosure: unused,
    loadImage: unused,
    useSession: unused,
    sessionId: brandString<Props["sessionId"]>("session-row"),
    useProjection: unused,
    useAccess: unused,
    useConversation: unused,
    useInput: unused,
    inputActions: new Proxy({} as Props["inputActions"], { get: unused }),
    useChat: unused,
    useTrajectory: unused,
    useRemoteAccess: unused,
    useSessions: unused,
    useSessionRetainInfo: unused,
    useSessionAccess: unused,
    usePanelInfo: unused,
    useContextMenu: unused,
    useSessionStatus: unused,
    useWorkspaces: unused,
    useResource: unused,
    useWorkspaceAccess: unused,
  };
  if ("kind" in block) return { ...shared, phase: "result", block } as Props;
  if (block.phase === "start") return { ...shared, phase: "start", block } as Props;
  return { ...shared, phase: "preparing", block } as Props;
}
it("shows a proposed card on one line without exposing the model-facing result", () => {
  const view = render(vueH(ProposeRow, { ...props(settled) }));
  expect(
    view.container.querySelector('[data-tool="propose_action"]')?.getAttribute("data-state"),
  ).toBe("ok");
  expect(view.getByText("Proposed")).toBeTruthy();
  expect(view.getByText("Counter")).toBeTruthy();
  expect(view.queryByRole("button")).toBeNull();
  expect(view.container.textContent).not.toContain(
    "Card shown below your answer. Do not restate it. Invite the user.",
  );
});
it("explains a refused call and offers call inspection", async () => {
  const inspect = vi.fn();
  const view = render(
    vueH(ProposeRow, {
      ...props(
        {
          ...settled,
          isError: true,
          content: [
            { type: "text", text: "Error: Load skill test-skill first, then call propose_action." },
            { type: "reasoning", text: "hidden" },
          ],
        },
        inspect,
      ),
    }),
  );
  expect(view.getByText("Not shown")).toBeTruthy();
  const row = view.getByRole("button");
  await fireEvent.click(row);
  expect(view.container.querySelector("pre")?.textContent).toBe(
    "Error: Load skill test-skill first, then call propose_action.",
  );
  await fireEvent.click(view.getByRole("button", { name: "Inspect call" }));
  expect(inspect).toHaveBeenCalledOnce();
  await fireEvent.click(row);
  expect(row.getAttribute("aria-expanded")).toBe("false");
});
it.each([
  [
    "preparing",
    {
      phase: "preparing",
      args: PartialArguments.EMPTY,
      callId: "c",
      name: "propose_action",
      turn: 1,
      step: 1,
      time: 1,
      subCalls: [],
    },
    "Preparing a card",
  ],
  ["running", running, "Proposing"],
  [
    "stopped",
    { ...settled, isError: true, content: [], error: { name: "Interrupted", code: "interrupted" } },
    "Interrupted",
  ],
] as const)("renders the %s call stage without claiming a card", (state, block, label) => {
  const view = render(vueH(ProposeRow, { ...props(block) }));
  expect(
    view.container.querySelector('[data-tool="propose_action"]')?.getAttribute("data-state"),
  ).toBe(state);
  expect(view.getAllByText(label).length).toBeGreaterThan(0);
  expect(view.queryByText("Proposed")).toBeNull();
  expect(view.queryByRole("button")).toBeNull();
});
