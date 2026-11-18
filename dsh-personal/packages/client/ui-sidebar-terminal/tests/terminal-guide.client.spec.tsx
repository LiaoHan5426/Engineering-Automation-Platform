import { h, computed, ref } from "vue";
// @vitest-environment jsdom
import { contextMenuHook } from "@deepseek-ai/dsh-client-test-runtime";
/** Guide shell discovery, direct launch and cancellation stay within the entry lifetime. */
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { fireEvent } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { allowAllAccess, makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import type { TerminalLaunchShells } from "@deepseek-ai/dsh-api-terminal-controller/client";
import type { GlobalStandardProps, SessionStandardProps } from "@deepseek-ai/dsh-client-ui-slots";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { PaneId, TabId } from "@deepseek-ai/dsh-client-ui-dockkit";
import type {
  ShortcutCommandId,
  ShortcutCatalogEntry,
} from "@deepseek-ai/dsh-client-shortcuts/client";
import { TerminalGuide, type TerminalGuideProps } from "../src/client/TerminalGuide.tsx";
import { en } from "../src/client/locales.ts";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const SESSION = "s-terminal-guide" as SessionId;
const unused = (): never => {
  throw new Error("This isolated component does not consume framework hooks");
};
const standard: GlobalStandardProps & SessionStandardProps = {
  sessionId: SESSION,
  useSession: unused,
  useProjection: unused,
  useConversation: unused,
  useInput: unused,
  useChat: unused,
  usePanelInfo: unused,
  useTrajectory: unused,
  useSessions: unused,
  useSessionStatus: unused,
  useSessionRetainInfo: unused,
  useResource: unused,
  useWorkspaces: unused,
  ...allowAllAccess,
  useContextMenu: contextMenuHook(),
  inputActions: {
    insertQuote: () => false,
    captureInsertion: unused,
    insertText: unused,
    setDraft: unused,
    persistDraft: unused,
    addAttachments: unused,
    removeAttachment: unused,
    pruneAttachments: unused,
    submit: unused,
  },
};
const choices: TerminalLaunchShells = {
  shells: [
    { name: "bash", path: "/bin/bash", args: ["-i"] },
    { name: "zsh", path: "/bin/zsh", args: ["-i"] },
  ],
  selectedShell: "/bin/zsh",
};
type GuideShortcut = Pick<ShortcutCatalogEntry, "keys" | "aria">;
const catalogEntry = (shortcut: GuideShortcut): ShortcutCatalogEntry => ({
  id: "terminal.new" as ShortcutCommandId,
  label: en.new,
  aliases: [],
  binding: null,
  modified: false,
  conflicts: [],
  issue: null,
  ...shortcut,
});
function mount(description: string | undefined = en.description, shortcut?: GuideShortcut) {
  const loadShells = vi.fn<TerminalGuideProps["loadShells"]>(async () => choices);
  const selectShell = vi.fn();
  const openTab = vi.fn();
  const shortcuts = ref(shortcut === undefined ? [] : [catalogEntry(shortcut)]);
  const props: TerminalGuideProps = {
    ...standard,
    useShortcuts: <T,>(selector: (entries: readonly ShortcutCatalogEntry[]) => T) =>
      computed(() => selector(shortcuts.value)),
    kind: "terminal",
    title: en.new,
    description,
    t: makeTranslate(en),
    useTabInfo: () =>
      computed(() => ({
        sidebar: { expanded: true, fullscreen: false },
        panel: { id: "pane-guide" as PaneId, isFloating: false },
        tab: {
          id: "tab-guide" as TabId,
          kind: "guide",
          contentId: "sidebar://guide",
          title: "Start",
          visible: true,
          signal: new AbortController().signal,
          navigation: { address: "sidebar://guide", params: undefined, revision: 0 },
          actions: {
            openTab,
            bindCommands: vi.fn(() => vi.fn()),
            openResource: vi.fn(),
            close: vi.fn(),
          },
        },
      })),
    loadShells,
    selectShell,
  };
  const view = render(h(TerminalGuide, { ...props }));
  const open = async () => {
    await act(() => {
      fireEvent.click(view.getByRole("button", { name: en.shell }));
    });
  };
  const setShortcut = async (next: GuideShortcut) => {
    shortcuts.value = [catalogEntry(next)];
    await view.rerender(h(TerminalGuide, { ...props }));
  };
  return { view, props, open, loadShells, selectShell, openTab, setShortcut };
}
it("opens the default shell from the main button without querying a menu", async () => {
  const harness = mount();
  await act(() => {
    fireEvent.click(harness.view.getByRole("button", { name: /^New terminal/u }));
  });
  expect(harness.openTab).toHaveBeenCalledExactlyOnceWith("terminal", { replaceTab: true });
  expect(harness.loadShells).not.toHaveBeenCalled();
  expect(harness.view.container.querySelector("button button")).toBeNull();
});
it.each(["hover", "focus"] as const)(
  "keeps the terminal shortcut inline without a tooltip on %s after rebinding",
  async (trigger) => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query === "(any-hover: hover)" })),
    );
    const harness = mount(en.description, { keys: ["Ctrl", "`"], aria: "Control+`" });
    const button = harness.view.getByRole("button", { name: /^New terminal/u });
    await act(() => {
      fireEvent.pointerDown(document.body, { pointerType: "mouse" });
    });
    if (trigger === "hover")
      await act(() => {
        fireEvent.pointerEnter(button, { pointerType: "mouse" });
      });
    else {
      await act(() => {
        fireEvent.keyDown(document.body, { key: "Tab" });
      });
      await act(() => {
        fireEvent.focus(button);
      });
    }
    expect(harness.view.queryByRole("tooltip", { hidden: true })).toBeNull();
    expect(
      Array.from(harness.view.container.querySelectorAll("kbd"), (key) => key.textContent),
    ).toEqual(["Ctrl", "`"]);
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Control+`");
    await harness.setShortcut({ keys: ["Alt", "T"], aria: "Alt+t" });
    expect(harness.view.queryByRole("tooltip", { hidden: true })).toBeNull();
    expect(
      Array.from(harness.view.container.querySelectorAll("kbd"), (key) => key.textContent),
    ).toEqual(["Alt", "T"]);
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Alt+t");
    await harness.setShortcut({ keys: [], aria: undefined });
    expect(harness.view.queryByRole("tooltip", { hidden: true })).toBeNull();
    expect(button.hasAttribute("aria-keyshortcuts")).toBe(false);
    if (trigger === "hover")
      await act(() => {
        fireEvent.pointerLeave(button, { pointerType: "mouse" });
      });
    else
      await act(() => {
        fireEvent.blur(button);
      });
    expect(harness.view.queryByRole("tooltip", { hidden: true })).toBeNull();
  },
);
it("loads on demand, remembers a selected shell before opening, and cancels on menu dismissal", async () => {
  const harness = mount();
  await harness.open();
  await harness.view.findByRole("menuitem", { name: "zsh" });
  expect(harness.openTab).not.toHaveBeenCalled();
  const signal = harness.loadShells.mock.calls[0]![0];
  harness.selectShell.mockImplementation(() => {
    expect(harness.openTab).not.toHaveBeenCalled();
  });
  await act(() => {
    fireEvent.click(harness.view.getByRole("menuitem", { name: "bash" }));
  });
  expect(harness.selectShell).toHaveBeenCalledExactlyOnceWith("/bin/bash");
  expect(harness.openTab).toHaveBeenCalledExactlyOnceWith("terminal", {
    replaceTab: true,
    params: { shellPath: "/bin/bash" },
  });
  expect(signal.aborted).toBe(true);
  await harness.open();
  await harness.view.findByRole("menuitem", { name: "bash" });
  await act(() => {
    fireEvent.keyDown(harness.view.getByRole("menu"), { key: "Escape" });
  });
  expect(harness.view.queryByRole("menu")).toBeNull();
  expect(harness.loadShells.mock.calls[1]![0].aborted).toBe(true);
});
it.each([new Error("offline"), "offline"])(
  "offers an in-place retry after discovery fails: %s",
  async (error) => {
    const harness = mount();
    harness.loadShells.mockRejectedValueOnce(error);
    await harness.open();
    await harness.view.findByText("Terminal error: offline");
    await act(() => {
      fireEvent.click(harness.view.getByRole("menuitem", { name: en.retry }));
    });
    await harness.view.findByRole("menuitem", { name: "bash" });
    expect(harness.loadShells).toHaveBeenCalledTimes(2);
    expect(harness.openTab).not.toHaveBeenCalled();
  },
);
it("shows empty discovery without opening a terminal and supports title-only cards", async () => {
  const harness = mount();
  const { description: _description, ...titleOnly } = harness.props;
  await harness.view.rerender(h(TerminalGuide, { ...titleOnly }));
  harness.loadShells.mockResolvedValue({ shells: [], selectedShell: undefined });
  await harness.open();
  await harness.view.findByText(en.shellEmpty);
  expect(harness.view.queryByText(en.description)).toBeNull();
  expect(harness.openTab).not.toHaveBeenCalled();
});
it.each(["resolve", "reject"] as const)(
  "ignores a late %s after a loading entry unmounts",
  async (outcome) => {
    const harness = mount();
    const pending = Promise.withResolvers<TerminalLaunchShells>();
    harness.loadShells.mockReturnValue(pending.promise);
    await harness.open();
    expect(harness.view.getByText(en.shellLoading)).toBeDefined();
    const signal = harness.loadShells.mock.calls[0]![0];
    harness.view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      if (outcome === "resolve") pending.resolve(choices);
      else pending.reject(new Error("late failure"));
      await pending.promise.catch((_lateDiscoveryFailure: unknown) => {
        /* The cancelled entry consumes the rejection without publishing it. */
      });
    });
    expect(harness.openTab).not.toHaveBeenCalled();
  },
);
