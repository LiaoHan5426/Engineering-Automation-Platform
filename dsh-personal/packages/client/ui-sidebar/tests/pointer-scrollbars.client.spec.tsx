// @vitest-environment jsdom
import { h as vueH, shallowRef } from "vue";
import { contextMenuHook } from "@deepseek-ai/dsh-client-test-runtime";
/**
 * Pointer-revealed scrollbars, the shell's half: which class state the column
 * carries as the pointer crosses it. The stylesheet rule that state drives is
 * asserted in scrollbar-quiet-styles.spec.ts (node environment — a jsdom spec
 * has no file: module URL to read the sheet through).
 */
import type { GlobalStandardProps } from "@deepseek-ai/dsh-client-ui-slots";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { fireEvent } from "@testing-library/dom";
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { allowAllAccess } from "@deepseek-ai/dsh-client-test-runtime";
import type {
  SidebarRootComponentProps,
  SidebarSectionOwnerProps,
} from "../src/client/contract/slots.ts";
import { SidebarRoot } from "../src/client/SidebarRoot.tsx";
import { en } from "../src/client/locales.ts";
// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => {
  throw new Error("unused resource hook");
}) as GlobalStandardProps["useResource"];
const usePanelInfo: GlobalStandardProps["usePanelInfo"] = (selector) =>
  shallowRef(selector({ activePanelId: null }));
/** Pinned column box; the shell compares pointer coordinates against it. */
const COLUMN_WIDTH = 280;
const COLUMN_HEIGHT = 600;
const t: SidebarRootComponentProps["t"] = (key) => (en as Record<string, string>)[key] ?? key;
/** The shell never reads the global hooks; the props share carries them regardless. */
const neverHook = (() => {
  throw new Error("shell must not read global hooks");
}) as never;
type AttentionSnapshot = Parameters<
  Parameters<SidebarRootComponentProps["useSessionStatus"]>[0]
>[0];
const noAttention: AttentionSnapshot = new Map();
const useSessionStatus: SidebarRootComponentProps["useSessionStatus"] = (selector) =>
  shallowRef(selector(noAttention));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
/**
 * Render the shell and expose its column element.
 * @returns the column element and whether it currently carries the quiet state.
 */
function mountColumn(): {
  column: HTMLElement;
  quiet: () => boolean;
} {
  const view = render(
    vueH(
      SidebarRoot,
      {
        drawer: false,
        collapsed: false,
        width: 300,
        useSessions: neverHook,
        useSessionStatus: useSessionStatus,
        useSessionRetainInfo: neverHook,
        usePanelInfo: usePanelInfo,
        selectPanel: () => {},
        usePanels: (selector) => shallowRef(selector([])),
        useEntryPins: (selector) => shallowRef(selector([])),
        useEntryActions: (selector) => shallowRef(selector(false)),
        setPinned: vi.fn(),
        useShortcuts: (selector) => shallowRef(selector([])),
        useContextMenu: contextMenuHook(),
        useResource: useResource,
        useWorkspaces: neverHook,
        ...allowAllAccess,
        startSession: vi.fn(),
        toggleSidebar: vi.fn(),
        trackEntryClick: vi.fn(),
        t: t,
        renderFactorySlot: () => null,
        renderSlot: ((_key: string, owner: SidebarSectionOwnerProps) =>
          vueH(
            "div",
            { "data-testid": "region", "data-wide": owner.wide },
            [],
          )) as SidebarRootComponentProps["renderSlot"],
      },
      { default: () => [] },
    ),
  );
  const column = view.container.firstElementChild;
  if (!(column instanceof HTMLElement)) throw new Error("sidebar column not rendered");
  // jsdom lays nothing out, and the leave decision is geometric: pin the box
  // the shell reads so a coordinate can be inside or outside it.
  Object.defineProperty(column, "getBoundingClientRect", {
    value: () => ({
      left: 0,
      top: 0,
      right: COLUMN_WIDTH,
      bottom: COLUMN_HEIGHT,
      x: 0,
      y: 0,
      width: COLUMN_WIDTH,
      height: COLUMN_HEIGHT,
      toJSON: () => ({}),
    }),
  });
  // CSS-module locals are hashed in this bench, so the state is read as a
  // substring of the class list rather than as an exact local name.
  return { column, quiet: () => [...column.classList].some((name) => name.includes("quietBars")) };
}
/**
 * Cross the pointer into or out of the column. React synthesizes
 * `pointerenter`/`pointerleave` from `pointerover`/`pointerout`, so the raw
 * enter and leave events it does not listen to would assert nothing.
 * @param column - the sidebar column element.
 * @param direction - `in` to enter the column, `out` to leave it.
 */
async function movePointer(column: HTMLElement, direction: "in" | "out") {
  const outside = document.body;
  if (direction === "in")
    await act(async () => fireEvent.pointerEnter(column, { relatedTarget: outside }));
  else await act(async () => fireEvent.pointerLeave(column, { relatedTarget: outside }));
}
/**
 * Move the pointer over the document, as a pointer crossing a fixed overlay
 * that is a DOM descendant of the column does.
 * @param x - client x coordinate.
 * @param y - client y coordinate.
 */
async function movePointerOverDocument(x: number, y: number) {
  await act(async () => fireEvent.pointerMove(document, { clientX: x, clientY: y }));
}
describe("SidebarRoot pointer-revealed scrollbars", () => {
  it("draws them only while the pointer is inside, and lingers on the way out", async () => {
    vi.useFakeTimers();
    const { column, quiet } = mountColumn();
    // At rest — the pointer has never been over the column — the bars are off.
    expect(quiet()).toBe(true);
    await movePointer(column, "in");
    expect(quiet()).toBe(false);
    await movePointer(column, "out");
    // The linger: still drawn just before the window closes, gone just after.
    await act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(quiet()).toBe(false);
    await act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(quiet()).toBe(true);
  });
  it("cancels a pending hide when the pointer comes back", async () => {
    vi.useFakeTimers();
    const { column, quiet } = mountColumn();
    await movePointer(column, "in");
    await movePointer(column, "out");
    await act(() => {
      vi.advanceTimersByTime(1000);
    });
    await movePointer(column, "in");
    // The first leave's timer would fire here; a cancelled one leaves the bars
    // drawn, which is what keeps a pointer skirting the edge from blinking them.
    await act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(quiet()).toBe(false);
  });
  it("hides when the pointer moves outside the column box without leaving its subtree", async () => {
    // ui-settings renders its full-viewport panel as a fixed-position
    // DESCENDANT of the column, so DOM containment reports the pointer as
    // still inside while it is visually somewhere else entirely.
    vi.useFakeTimers();
    const { column, quiet } = mountColumn();
    await movePointer(column, "in");
    expect(quiet()).toBe(false);
    await movePointerOverDocument(COLUMN_WIDTH + 400, 300);
    await act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(quiet()).toBe(true);
  });
  it("does not restart the window when the pointer keeps moving outside", async () => {
    vi.useFakeTimers();
    const { column, quiet } = mountColumn();
    await movePointer(column, "in");
    await movePointer(column, "out");
    await act(() => {
      vi.advanceTimersByTime(1500);
    });
    // A pending hide is left alone rather than re-armed: otherwise a pointer
    // resting outside the column would keep pushing the bars' disappearance
    // out, one move at a time.
    await movePointerOverDocument(COLUMN_WIDTH + 400, 300);
    await act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(quiet()).toBe(true);
  });
  it("keeps them drawn while the pointer moves inside the column box", async () => {
    vi.useFakeTimers();
    const { column, quiet } = mountColumn();
    await movePointer(column, "in");
    await movePointer(column, "out");
    // A move landing back inside the box cancels the pending hide, the same
    // way re-entering the element does.
    await movePointerOverDocument(COLUMN_WIDTH - 10, 300);
    await act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(quiet()).toBe(false);
  });
  it("drops the pending hide when the column unmounts", async () => {
    vi.useFakeTimers();
    const { column } = mountColumn();
    await movePointer(column, "in");
    await movePointer(column, "out");
    cleanup();
    // A timer surviving the unmount would call setState on a dead component.
    expect(() => {
      vi.advanceTimersByTime(5000);
    }).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
