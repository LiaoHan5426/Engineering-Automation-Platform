// @vitest-environment jsdom
import { computed, defineComponent, h, ref, shallowRef } from "vue";
import type { SessionSnapshot } from "@deepseek-ai/dsh-api-session-controller/client";
import type { SessionId } from "@deepseek-ai/dsh-session";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { fireEvent, within } from "@testing-library/dom";
import {
  cleanupVue as cleanup,
  flushVue as act,
  renderVue,
} from "../../../client/ui-primitives/tests/vue-render.ts";
import { QuoteSelectionAction } from "../src/client/QuoteSelection.tsx";
import { brandString } from "@deepseek-ai/dsh-brand";

afterEach(cleanup);
type Props = InstanceType<typeof QuoteSelectionAction>["$props"];
const render = (node: Parameters<typeof renderVue>[0]) => ({
  ...renderVue(node),
  ...within(document.body),
});
function props(enabled = true, subagent: SessionSnapshot["subagent"] = null) {
  const unused = (): never => {
    throw new Error("Unexpected framework seat in quote fixture");
  };
  const inputActions: Props["inputActions"] & {
    insertQuote: ReturnType<typeof vi.fn<() => boolean>>;
  } = {
    insertQuote: vi.fn(() => true),
    captureInsertion: unused,
    insertText: unused,
    setDraft: unused,
    persistDraft: unused,
    addAttachments: unused,
    removeAttachment: unused,
    pruneAttachments: unused,
    submit: unused,
  };
  const snapshot = shallowRef<SessionSnapshot>({
    sessionId: brandString<SessionId>("quote-selection"),
    pendingSubmissions: [],
    running: false,
    removed: !enabled,
    openState: "open",
    openError: null,
    hasMore: false,
    loadingOlder: false,
    historyLoadStatus: "idle",
    historyWasPartial: false,
    promptError: null,
    blank: false,
    subagent,
    lastAgentError: null,
    promptAttempted: true,
    awaitingFirstTurn: false,
  });
  const value: Props = {
    sessionId: snapshot.value.sessionId,
    useProjection: unused,
    useAccess: unused,
    useConversation: unused,
    useInput: unused,
    useChat: unused,
    ...{ useTrajectory: unused },
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
    trigger: "selection",
    dismiss: vi.fn(),
    readText: vi.fn((): string | null => "Hello world"),
    clearSelection: vi.fn(),
    inputActions,
    useSession: <S,>(selector: (value: SessionSnapshot) => S) =>
      computed(() => selector(snapshot.value)),
    t: () => "Quote text",
  };
  return { value, inputActions, snapshot };
}

describe("quote action consumer", () => {
  it("inserts DOM text and clears the browser selection only after success", async () => {
    const fixture = props();
    const view = render(h(QuoteSelectionAction, fixture.value));
    const button = view.getByRole("button", { name: "Quote text" });
    fireEvent.pointerDown(button);
    fixture.inputActions.insertQuote.mockReturnValueOnce(false);
    fireEvent.click(button);
    expect(fixture.value.dismiss).not.toHaveBeenCalled();
    expect(fixture.value.clearSelection).not.toHaveBeenCalled();
    await act(() => fireEvent.click(button));
    expect(fixture.inputActions.insertQuote).toHaveBeenLastCalledWith("Hello world");
    expect(fixture.value.clearSelection).toHaveBeenCalledOnce();
    expect(fixture.value.dismiss).toHaveBeenCalledOnce();
  });

  it("closes an invalidated source without inserting stale text", async () => {
    const fixture = props();
    vi.mocked(fixture.value.readText).mockReturnValue(null);
    const view = render(h(QuoteSelectionAction, fixture.value));
    await act(() => fireEvent.click(view.getByRole("button")));
    expect(fixture.inputActions.insertQuote).not.toHaveBeenCalled();
    expect(fixture.value.dismiss).toHaveBeenCalledOnce();
  });

  it("hides the action when its Session is no longer writable", async () => {
    const fixture = props(false);
    const view = render(h(QuoteSelectionAction, fixture.value));
    await act(() => {});
    expect(view.queryByRole("button")).toBeNull();
    expect(fixture.value.dismiss).toHaveBeenCalledOnce();
  });

  it("allows quoting in continuable subagents and rejects one-shot records", async () => {
    const child = {
      address: {
        parentSessionId: brandString<SessionId>("parent"),
        childSessionId: brandString<SessionId>("quote-selection"),
        mode: "continuable" as const,
      },
    };
    const fixture = props(true, child);
    const view = render(h(QuoteSelectionAction, fixture.value));
    expect(view.queryByRole("button")).not.toBeNull();
    await act(() => {
      fixture.snapshot.value = {
        ...fixture.snapshot.value,
        subagent: { ...child, address: { ...child.address, mode: "one-shot" } },
      };
    });
    expect(view.queryByRole("button")).toBeNull();
  });

  it("dismisses the surface when its Session becomes unwritable without reopening it on recovery", async () => {
    const Surface = defineComponent(
      (input: { value: Props }) => {
        const open = ref(true);
        const dismiss = () => {
          open.value = false;
        };
        return () => (open.value ? h(QuoteSelectionAction, { ...input.value, dismiss }) : null);
      },
      { props: ["value"] },
    );
    const fixture = props();
    const view = render(h(Surface, { value: fixture.value }));
    expect(view.queryByRole("button")).not.toBeNull();
    await act(() => {
      fixture.snapshot.value = { ...fixture.snapshot.value, removed: true };
    });
    expect(view.queryByRole("button")).toBeNull();
    await act(() => {
      fixture.snapshot.value = { ...fixture.snapshot.value, removed: false };
    });
    expect(view.queryByRole("button")).toBeNull();
  });
});
