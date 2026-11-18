// @vitest-environment jsdom
import { h as vueH, Fragment, defineComponent, shallowRef, ref } from "vue";
import { contextMenuHook } from "@deepseek-ai/dsh-client-test-runtime";
import type { GlobalStandardProps } from "@deepseek-ai/dsh-client-ui-slots";
import type {
  ShortcutCatalogEntry,
  ShortcutCommandId,
} from "@deepseek-ai/dsh-client-shortcuts/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { fireEvent, screen, waitFor } from "@testing-library/dom";
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { Menu, Modal, Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
import { allowAllAccess, makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import type { VNodeChild } from "vue";
import type {
  SidebarFooterActionOwnerProps,
  SidebarPanelMetadata,
  SidebarRootComponentProps,
  SidebarSectionHookContext,
  SidebarSectionOwnerProps,
  SidebarSessionActionOwnerProps,
  SidebarSettingsOwnerProps,
} from "../src/client/contract/slots.ts";
import {
  HeaderLeadingControls,
  type HeaderLeadingControlsProps,
} from "../src/client/HeaderLeadingControls.tsx";
import { SidebarRoot } from "../src/client/SidebarRoot.tsx";
import { en } from "../src/client/locales.ts";
import { en as commonEn } from "@deepseek-ai/dsh-client-locale/src/locales/en.ts";
// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => {
  throw new Error("unused resource hook");
}) as GlobalStandardProps["useResource"];
const usePanelInfo: GlobalStandardProps["usePanelInfo"] = (selector) =>
  shallowRef(selector({ activePanelId: null }));
const t: SidebarRootComponentProps["t"] = makeTranslate({ ...commonEn, ...en });
afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.platform;
  vi.unstubAllEnvs();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "clipboard");
});
// The shell never reads the global hooks itself, but they ride the standard
// props share; stub them as never-called functions.
const neverHook = (() => {
  throw new Error("shell must not read global hooks");
}) as never;
type AttentionSnapshot = Parameters<
  Parameters<SidebarRootComponentProps["useSessionStatus"]>[0]
>[0];
const noAttention: AttentionSnapshot = new Map();
const useSessionStatus: SidebarRootComponentProps["useSessionStatus"] = (selector) =>
  shallowRef(selector(noAttention));
function makeHeaderProps(): HeaderLeadingControlsProps {
  return {
    useContextMenu: contextMenuHook(),
    useSessions: neverHook,
    useSessionStatus,
    useSessionRetainInfo: neverHook,
    usePanelInfo,
    useResource,
    useWorkspaces: neverHook,
    ...allowAllAccess,
    usePanels: (selector) => shallowRef(selector([])),
    useShortcuts: (selector) => shallowRef(selector([])),
    useEntryPins: (selector) => shallowRef(selector([])),
    useEntryActions: (selector) => shallowRef(selector(false)),
    selectPanel: vi.fn(),
    setPinned: vi.fn(),
    toggleSidebar: vi.fn(),
    startSession: vi.fn(),
    trackEntryClick: vi.fn(),
    t,
  };
}
function isWideOwner(owner: object): owner is SidebarSettingsOwnerProps {
  return "wide" in owner && typeof owner.wide === "boolean";
}
function isSectionContext(value: unknown): value is SidebarSectionHookContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "useSectionScroller" in value &&
    typeof value.useSectionScroller === "function"
  );
}
function isSectionOwner(owner: object): owner is SidebarSectionOwnerProps {
  return (
    "wide" in owner &&
    typeof owner.wide === "boolean" &&
    "expandSidebar" in owner &&
    typeof owner.expandSidebar === "function"
  );
}
async function mountShell({
  collapsed = false,
  width = 300,
  drawer = false,
  shortcuts = [],
  panels = [],
  content,
  frame,
}: {
  collapsed?: boolean;
  width?: number;
  drawer?: boolean;
  shortcuts?: readonly ShortcutCatalogEntry[];
  panels?: readonly SidebarPanelMetadata[];
  content?: VNodeChild;
  frame?: (
    sidebar: VNodeChild,
    state: { collapsed: boolean; width: number; drawer: boolean },
  ) => VNodeChild;
} = {}) {
  const startSession = vi.fn();
  const toggleSidebar = vi.fn();
  const trackEntryClick = vi.fn<SidebarRootComponentProps["trackEntryClick"]>();
  let regionOwner: SidebarSectionOwnerProps | undefined;
  let regionContext: SidebarSectionHookContext | undefined;
  let settingsOwner: SidebarSettingsOwnerProps | undefined;
  let footerActionOwner: SidebarFooterActionOwnerProps | undefined;
  let sessionActionOwner: SidebarSessionActionOwnerProps | undefined;
  let sessionActionChildren: VNodeChild;
  const brandMark = vueH("span", { "data-testid": "custom-brand-mark" }, ["M"]);
  const brandName = vueH("span", { "data-testid": "custom-brand-name" }, ["Custom Brand"]);
  let current = { collapsed, width, drawer };
  const root = () =>
    vueH(
      SidebarRoot,
      {
        drawer: current.drawer,
        collapsed: current.collapsed,
        width: current.width,
        useSessions: neverHook,
        useSessionStatus: useSessionStatus,
        useSessionRetainInfo: neverHook,
        usePanelInfo: usePanelInfo,
        selectPanel: () => {},
        usePanels: (selector) => shallowRef(selector(panels)),
        useEntryPins: (selector) => shallowRef(selector([])),
        useEntryActions: (selector) => shallowRef(selector(false)),
        setPinned: vi.fn(),
        useShortcuts: (selector) => shallowRef(selector(shortcuts)),
        useContextMenu: contextMenuHook(),
        useResource: useResource,
        useWorkspaces: neverHook,
        ...allowAllAccess,
        startSession: startSession,
        toggleSidebar: toggleSidebar,
        trackEntryClick: trackEntryClick,
        t: t,
        renderFactorySlot: () => null,
        renderSlot: (
          key: string,
          owner: object,
          opts?: {
            hookContext?: unknown;
            children?: VNodeChild;
          },
        ) => {
          if (key === "sidebar.brand.mark") return brandMark;
          if (key === "sidebar.brand.name") return brandName;
          if (key === "sidebar.toggle.badge") return null;
          if (key === "sidebar.panellist") return vueH("span", { "aria-hidden": "true" }, ["P"]);
          if (!isWideOwner(owner)) throw new Error(`Missing sidebar width for ${key}`);
          if (key === "sidebar.settings") {
            settingsOwner = owner;
            return vueH("div", { "data-testid": "settings-seat", "data-wide": owner.wide }, []);
          }
          if (key === "sidebar.footer.action") {
            footerActionOwner = owner;
            return vueH(
              "div",
              { "data-testid": "footer-action-seat", "data-wide": owner.wide },
              [],
            );
          }
          if (key === "sidebar.session.action") {
            sessionActionOwner = owner;
            sessionActionChildren = opts?.children;
            return vueH(Fragment, null, [
              opts?.children,
              vueH("div", { "data-testid": "session-action-seat", "data-wide": owner.wide }, []),
            ]);
          }
          if (!isSectionOwner(owner)) throw new Error(`Missing sidebar section owner for ${key}`);
          regionOwner = owner;
          if (!isSectionContext(opts?.hookContext))
            throw new Error(`Missing sidebar section context for ${key}`);
          regionContext = opts.hookContext;
          return vueH("div", { "data-testid": "region", "data-wide": owner.wide }, [content]);
        },
      },
      { default: () => [] },
    );
  const drawing = () => (frame === undefined ? root() : frame(root(), current));
  const view = render(drawing());
  await act(() => {});
  return {
    unmount: () => {
      view.unmount();
    },
    startSession,
    toggleSidebar,
    trackEntryClick,
    regionOwner: () => {
      if (regionOwner === undefined) throw new Error("region owner not rendered");
      return regionOwner;
    },
    regionContext: () => {
      if (regionContext === undefined) throw new Error("region hookContext not rendered");
      return regionContext;
    },
    settingsOwner: () => {
      if (settingsOwner === undefined) throw new Error("settings owner not rendered");
      return settingsOwner;
    },
    footerActionOwner: () => {
      if (footerActionOwner === undefined) throw new Error("footer action owner not rendered");
      return footerActionOwner;
    },
    sessionActionOwner: () => {
      if (sessionActionOwner === undefined) throw new Error("session action owner not rendered");
      return sessionActionOwner;
    },
    sessionActionChildren: () => sessionActionChildren,
    async rerender(next: Partial<typeof current>) {
      current = { ...current, ...next };
      await view.rerender(drawing());
    },
  };
}
describe("SidebarRoot shell", () => {
  it("puts navigation and workspaces in one viewport without scrolling primary controls or the footer", async () => {
    await mountShell({
      panels: [{ id: "notes" as SidebarPanelMetadata["id"], order: 1, label: "Notes" }],
    });
    const viewport = document.querySelector("[data-sidebar-scrollport]")!;
    expect(viewport.contains(screen.getByRole("navigation"))).toBe(true);
    expect(viewport.contains(screen.getByTestId("region"))).toBe(true);
    for (const button of screen.getAllByRole("button", { name: "New session" })) {
      expect(viewport.contains(button)).toBe(false);
    }
    expect(viewport.contains(screen.getByTestId("settings-seat"))).toBe(false);
    expect(viewport.contains(screen.getByTestId("footer-action-seat"))).toBe(false);
  });
  it("hands the section a stable scroller hook bound to this sidebar viewport", async () => {
    const shell = await mountShell();
    const scroller = shell.regionContext().useSectionScroller();
    await shell.rerender({ width: 320 });
    expect(shell.regionContext().useSectionScroller()).toBe(scroller);
    const viewport = document.querySelector<HTMLDivElement>("[data-sidebar-scrollport]")!;
    const unbound = new WheelEvent("wheel", { deltaY: 40, cancelable: true });
    viewport.dispatchEvent(unbound);
    expect(unbound.defaultPrevented).toBe(false);
    scroller.value.bindScrollerRef(document.createElement("div"));
    const bound = new WheelEvent("wheel", { deltaY: 40, cancelable: true });
    viewport.dispatchEvent(bound);
    expect(bound.defaultPrevented).toBe(true);
  });
  it("advertises the effective new-session binding", async () => {
    const shortcut: ShortcutCatalogEntry = {
      id: "session.new" as ShortcutCommandId,
      label: "New",
      aliases: [],
      binding: null,
      modified: true,
      conflicts: [],
      issue: null,
      keys: ["Ctrl", "N"],
      aria: "Control+N",
    };
    await mountShell({ shortcuts: [shortcut] });
    for (const button of screen.getAllByRole("button", { name: "New session" })) {
      expect(button.getAttribute("aria-keyshortcuts")).toBe("Control+N");
    }
    const expanded = screen
      .getAllByRole("button", { name: "New session" })
      .find((button) => button.querySelector("kbd") !== null)!;
    await act(async () => fireEvent.pointerEnter(expanded));
    await act(async () => fireEvent.focus(expanded));
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(Array.from(expanded.querySelectorAll("kbd"), (key) => key.textContent)).toEqual([
      "Ctrl",
      "N",
    ]);
    cleanup();
    document.documentElement.dataset.platform = "darwin";
    render(
      vueH(
        HeaderLeadingControls,
        {
          toggleSidebar: vi.fn(),
          startSession: vi.fn(),
          selectPanel: vi.fn(),
          trackEntryClick: vi.fn(),
          t: t,
          usePanelInfo: neverHook,
          useSessions: neverHook,
          useSessionStatus: neverHook,
          useSessionRetainInfo: neverHook,
          useContextMenu: contextMenuHook(),
          useResource: useResource,
          useWorkspaces: neverHook,
          ...allowAllAccess,
          usePanels: (select) => shallowRef(select([])),
          useEntryPins: (select) => shallowRef(select([])),
          useEntryActions: (select) => shallowRef(select(false)),
          setPinned: vi.fn(),
          useShortcuts: (select) => shallowRef(select([shortcut])),
        },
        { default: () => [] },
      ),
    );
    await act(() => {});
    const button = screen.getByRole("button", { name: "New session" });
    expect(
      screen.getByRole("button", { name: "Open sidebar" }).hasAttribute("data-sidebar-opener"),
    ).toBe(true);
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Control+N");
    await act(async () => fireEvent.focus(button));
    expect(
      Array.from(screen.getByRole("tooltip").querySelectorAll("kbd"), (key) => key.textContent),
    ).toEqual(["Ctrl", "N"]);
  });
  it("routes New Session (capsule + wordmark) and the column toggle", async () => {
    // Occupied brand slots keep New Session even when the build carries a version.
    vi.stubEnv("DSH_CLIENT_VERSION", "1.2.3");
    const b = await mountShell();
    expect(screen.getByTestId("custom-brand-mark")).toBeTruthy();
    expect(screen.getByTestId("custom-brand-name")).toBeTruthy();
    // Expanded, both the wordmark and the capsule start a session and report a sidebar New Session click first.
    const starters = screen.getAllByRole("button", { name: "New session" });
    expect(starters).toHaveLength(2);
    for (const button of starters) await act(async () => fireEvent.click(button));
    expect(b.startSession).toHaveBeenCalledTimes(2);
    expect(b.trackEntryClick.mock.calls).toEqual([
      [{ menu_name: "new_session", position: "sidebar" }],
      [{ menu_name: "new_session", position: "sidebar" }],
    ]);
    expect(b.trackEntryClick.mock.invocationCallOrder[0]).toBeLessThan(
      b.startSession.mock.invocationCallOrder[0]!,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" })),
    );
    expect(b.toggleSidebar).toHaveBeenCalledOnce();
    expect(b.trackEntryClick).toHaveBeenCalledTimes(2);
  });
  it("reports the collapsed rail New Session as a sidebar click outside the Windows caption", async () => {
    const b = await mountShell({ collapsed: true, width: 56 });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "New session" })));
    expect(b.startSession).toHaveBeenCalledOnce();
    expect(b.trackEntryClick).toHaveBeenCalledExactlyOnceWith({
      menu_name: "new_session",
      position: "sidebar",
    });
  });
  it("offers no New Session control while the access snapshot excludes session/create", async () => {
    const toggleSidebar = vi.fn();
    const startSession = vi.fn();
    const useRemoteAccess = vi.fn((action: Parameters<GlobalStandardProps["useRemoteAccess"]>[0]) =>
      shallowRef(action !== "session/create"),
    );
    render(
      vueH(
        SidebarRoot,
        {
          collapsed: false,
          width: 300,
          drawer: false,
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
          useRemoteAccess: useRemoteAccess,
          startSession: startSession,
          toggleSidebar: toggleSidebar,
          trackEntryClick: vi.fn(),
          t: t,
          renderFactorySlot: () => null,
          renderSlot: (key: string) => {
            if (key === "sidebar.brand.mark")
              return vueH("span", { "data-testid": "brand-mark" }, ["M"]);
            if (key === "sidebar.brand.name")
              return vueH("span", { "data-testid": "brand-name" }, ["Brand"]);
            return null;
          },
        },
        { default: () => [] },
      ),
    );
    await act(() => {});
    // Neither the brand row nor the dedicated button starts a Session; the brand still renders.
    expect(useRemoteAccess).toHaveBeenCalledWith("session/create");
    expect(screen.queryByRole("button", { name: "New session" })).toBeNull();
    expect(screen.getByTestId("brand-mark")).toBeTruthy();
    expect(screen.getByTestId("brand-name")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" })),
    );
    expect(toggleSidebar).toHaveBeenCalledOnce();
    expect(startSession).not.toHaveBeenCalled();
  });
  it("renders generic brand fallbacks when no package fills the slots", () => {
    vi.stubEnv("DSH_CLIENT_COMMIT_HASH", "0123456");
    vi.stubEnv("DSH_CLIENT_GIT_DIRTY", "true");
    vi.stubEnv("DSH_CLIENT_VERSION", "1.2.3-rc.4");
    const { container } = render(
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
          renderSlot: (
            _key: string,
            _owner: unknown,
            options?: {
              fallback?: VNodeChild;
            },
          ) => options?.fallback ?? null,
        },
        { default: () => [] },
      ),
    );
    expect(screen.getByText("DSH Local Build")).toBeTruthy();
    expect(screen.getByText("1.2.3-rc.4-0123456-dirty")).toBeTruthy();
    expect(container.querySelector("svg")).not.toBeNull();
  });
  it.each([
    [{ DSH_CLIENT_VERSION: "1.2.3" }, "1.2.3"],
    [{ DSH_CLIENT_COMMIT_HASH: "abcdef0", DSH_CLIENT_VERSION: "1.2.3" }, "1.2.3-abcdef0"],
  ])("omits unavailable build-version suffixes from %j", async (environment, expected) => {
    for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
    render(
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
          renderSlot: (
            _key: string,
            _owner: unknown,
            options?: {
              fallback?: VNodeChild;
            },
          ) => options?.fallback ?? null,
        },
        { default: () => [] },
      ),
    );
    await act(() => {});
    expect(screen.getByText("DSH Local Build")).toBeTruthy();
    expect(screen.getByText(expected)).toBeTruthy();
  });
  it.each([false, true])(
    "copies the local-build version from the fallback mark and name (darwin=%s)",
    async (darwin) => {
      if (darwin) document.documentElement.dataset.platform = "darwin";
      vi.stubEnv("DSH_CLIENT_COMMIT_HASH", "abcdef0");
      vi.stubEnv("DSH_CLIENT_VERSION", "1.2.3");
      const writeText = vi
        .fn<(text: string) => Promise<void>>()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("denied"))
        .mockResolvedValueOnce(undefined);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
      const startSession = vi.fn();
      const trackEntryClick = vi.fn<SidebarRootComponentProps["trackEntryClick"]>();
      render(
        vueH(
          SidebarRoot,
          {
            collapsed: false,
            width: 300,
            drawer: false,
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
            startSession: startSession,
            toggleSidebar: vi.fn(),
            trackEntryClick: trackEntryClick,
            t: t,
            renderFactorySlot: () => null,
            renderSlot: (
              _key: string,
              _owner: unknown,
              options?: {
                fallback?: VNodeChild;
              },
            ) => options?.fallback ?? null,
          },
          { default: () => [] },
        ),
      );
      await act(() => {});
      vi.useFakeTimers();
      const copiedToasts = () => screen.queryAllByRole("alert").map((toast) => toast.textContent);
      await act(async () => {
        fireEvent.click(screen.getByText("DSH Local Build"));
      });
      expect(writeText).toHaveBeenLastCalledWith("1.2.3-abcdef0");
      await act(() => {});
      expect(copiedToasts()).toEqual(["Version copied"]);
      // The brand itself keeps its title and version.
      expect(screen.getByText("DSH Local Build")).toBeTruthy();
      expect(screen.getByText("1.2.3-abcdef0")).toBeTruthy();
      await act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(copiedToasts()).toEqual([]);
      // A refused write claims no success.
      await act(async () => {
        fireEvent.click(screen.getByText("1.2.3-abcdef0"));
      });
      expect(copiedToasts()).toEqual([]);
      // The fallback mark copies too, and its click still reaches document.
      const documentClick = vi.fn();
      document.addEventListener("click", documentClick);
      const mark = screen
        .getByText("DSH Local Build")
        .closest("[aria-hidden]")!
        .querySelector("svg")!;
      await act(async () => {
        fireEvent.click(mark);
      });
      document.removeEventListener("click", documentClick);
      expect(documentClick).toHaveBeenCalledOnce();
      expect(writeText).toHaveBeenCalledTimes(3);
      await act(() => {});
      expect(copiedToasts()).toEqual(["Version copied"]);
      expect(startSession).not.toHaveBeenCalled();
      // Copying the version is not a New Session click.
      expect(trackEntryClick).not.toHaveBeenCalled();
      // The rest of the brand button still starts and reports a session.
      if (!darwin) {
        await act(async () =>
          fireEvent.click(screen.getAllByRole("button", { name: "New session" })[0]!),
        );
        expect(startSession).toHaveBeenCalledOnce();
        expect(trackEntryClick).toHaveBeenCalledExactlyOnceWith({
          menu_name: "new_session",
          position: "sidebar",
        });
      }
    },
  );
  it("retains the local-build fallback without complete build metadata", async () => {
    render(
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
          renderSlot: (
            _key: string,
            _owner: unknown,
            options?: {
              fallback?: VNodeChild;
            },
          ) => options?.fallback ?? null,
        },
        { default: () => [] },
      ),
    );
    await act(() => {});
    expect(screen.getByText("DSH Local Build")).toBeTruthy();
  });
  it("hands the region its wide flag and clamps expandSidebar to the collapsed state", async () => {
    const b = await mountShell();
    expect(b.regionOwner().wide).toBe(true);
    // The settings seat rides the same wide flag (ui-settings renders the row).
    expect(b.settingsOwner().wide).toBe(true);
    expect(b.footerActionOwner().wide).toBe(true);
    expect(b.sessionActionOwner().wide).toBe(true);
    // The HOC layer receives the New-session row content as its children.
    expect(b.sessionActionChildren()).toBeTruthy();
    // Session actions follow New session inside the same row.
    const newSession = screen.getAllByRole("button", { name: "New session" }).at(-1);
    expect(newSession?.nextElementSibling).toBe(screen.getByTestId("session-action-seat"));
    // Expanded: the request is a no-op (no accidental collapse).
    b.regionOwner().expandSidebar();
    expect(b.toggleSidebar).not.toHaveBeenCalled();
  });
  it("keeps the region mounted through collapse and expands on its request", async () => {
    vi.useFakeTimers();
    const b = await mountShell();
    await b.rerender({ collapsed: true });
    // Wide content survives the crossfade window, then settles into the rail.
    expect(b.regionOwner().wide).toBe(true);
    vi.advanceTimersByTime(200);
    await b.rerender({});
    expect(b.regionOwner().wide).toBe(false);
    expect(b.footerActionOwner().wide).toBe(false);
    expect(b.sessionActionOwner().wide).toBe(false);
    expect(screen.getByTestId("region")).toBeTruthy();
    b.regionOwner().expandSidebar();
    expect(b.toggleSidebar).toHaveBeenCalledOnce();
  });
  it("renders statically collapsed on a cold start (no crossfade classes)", async () => {
    const b = await mountShell({ collapsed: true });
    expect(b.regionOwner().wide).toBe(false);
    expect(screen.getByRole("button", { name: "Open sidebar" })).toBeTruthy();
  });
  it.each([false, true])(
    "returns directly from a closed drawer to the compact layout (previously opened: %s)",
    async (opened) => {
      vi.useFakeTimers();
      const b = await mountShell({ drawer: true, collapsed: !opened, width: 280 });
      if (opened) await b.rerender({ collapsed: true });
      await b.rerender({ drawer: false, collapsed: true, width: 56 });
      expect(b.regionOwner().wide).toBe(false);
      expect(b.settingsOwner().wide).toBe(false);
      expect(screen.getAllByRole("button", { name: "New session" })).toHaveLength(1);
      const root = screen.getByTestId("region").closest<HTMLElement>('[class*="root"]')!;
      expect(root.style.width).toBe("");
      expect(root.className).not.toMatch(/fading|railIn/);
    },
  );
  it("shows only the badge bubble while the rail badge is hovered inside the toggle", async () => {
    vi.useFakeTimers();
    render(
      vueH(
        SidebarRoot,
        {
          drawer: false,
          collapsed: true,
          width: 56,
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
          renderSlot: (key: string) =>
            key === "sidebar.toggle.badge"
              ? vueH(
                  Tooltip,
                  { label: "Update — V1.2.3" },
                  { default: () => [vueH("span", { "data-testid": "badge" }, [])] },
                )
              : null,
        },
        { default: () => [] },
      ),
    );
    await act(() => {});
    const toggle = screen.getByRole("button", { name: "Open sidebar" });
    await act(async () => fireEvent.pointerEnter(toggle));
    await act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip").textContent).toBe("Open sidebar");
    // The badge's own bubble replaces the toggle's rather than stacking on it,
    // even after the toggle's longer hover delay has elapsed.
    await act(async () => fireEvent.pointerEnter(screen.getByTestId("badge")));
    await act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getAllByRole("tooltip").map((bubble) => bubble.textContent)).toEqual([
      "Update — V1.2.3",
    ]);
    await act(async () =>
      fireEvent.pointerLeave(screen.getByTestId("badge"), { relatedTarget: toggle }),
    );
    expect(screen.getByRole("tooltip").textContent).toBe("Open sidebar");
    await act(async () => fireEvent.pointerLeave(toggle));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
it("keeps the macOS sidebar toggle in its top strip", async () => {
  document.documentElement.dataset.platform = "darwin";
  const shell = await mountShell();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: en["toggle.collapse"] })),
  );
  expect(shell.toggleSidebar).toHaveBeenCalledOnce();
  // The brand stays part of the logo row's window-drag surface: no button
  // role (the drag-row controls rule would subtract it); only the dedicated
  // New Session capsule starts a session.
  expect(screen.getAllByRole("button", { name: "New session" })).toHaveLength(1);
  expect(screen.getByTestId("custom-brand-mark")).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "New session" })));
  expect(shell.trackEntryClick).toHaveBeenCalledExactlyOnceWith({
    menu_name: "new_session",
    position: "sidebar",
  });
});
it("wires the shell.leading controls to the shared sidebar actions", async () => {
  document.documentElement.dataset.platform = "darwin";
  const toggleSidebar = vi.fn();
  const startSession = vi.fn();
  const trackEntryClick = vi.fn<HeaderLeadingControlsProps["trackEntryClick"]>();
  // This occupant only consumes its actions, the global access Hook, and locale, not Session hooks.
  const props: HeaderLeadingControlsProps = {
    ...makeHeaderProps(),
    toggleSidebar,
    startSession,
    trackEntryClick,
    useShortcuts: (select) =>
      shallowRef(
        select([
          {
            id: "sidebar.left.toggle" as ShortcutCommandId,
            label: "Toggle sidebar",
            aliases: [],
            binding: null,
            modified: false,
            conflicts: [],
            issue: null,
            keys: ["⌘", "B"],
            aria: "Meta+B",
          },
        ]),
      ),
  };
  render(vueH(HeaderLeadingControls, { ...props }, { default: () => [] }));
  await act(() => {});
  await act(async () => fireEvent.click(screen.getByRole("button", { name: en["toggle.open"] })));
  expect(toggleSidebar).toHaveBeenCalledOnce();
  expect(trackEntryClick).not.toHaveBeenCalled();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: en["session.new.label"] })),
  );
  expect(startSession).toHaveBeenCalledOnce();
  // The window-chrome New Session control reports a titlebar click before starting the Session.
  expect(trackEntryClick).toHaveBeenCalledExactlyOnceWith({
    menu_name: "new_session",
    position: "titlebar",
  });
  expect(trackEntryClick.mock.invocationCallOrder[0]).toBeLessThan(
    startSession.mock.invocationCallOrder[0]!,
  );
  cleanup();
  // A page whose access snapshot excludes starting a Session keeps only the sidebar toggle.
  render(
    vueH(
      HeaderLeadingControls,
      { ...props, useRemoteAccess: (action) => shallowRef(action !== "session/create") },
      { default: () => [] },
    ),
  );
  await act(() => {});
  expect(screen.getByRole("button", { name: en["toggle.open"] })).toBeTruthy();
  expect(screen.queryByRole("button", { name: en["session.new.label"] })).toBeNull();
});
it.each([undefined, "darwin", "win32"] as const)(
  "shows the collapsed-header New Session control only on Desktop (%s)",
  async (platform) => {
    if (platform !== undefined) document.documentElement.dataset.platform = platform;
    const props = makeHeaderProps();
    render(vueH(HeaderLeadingControls, { ...props }, { default: () => [] }));
    await act(() => {});
    expect(screen.getByRole("button", { name: en["toggle.open"] })).toBeTruthy();
    expect(screen.queryByRole("button", { name: en["session.new.label"] }) !== null).toBe(
      platform !== undefined,
    );
  },
);
describe("Windows caption New Session analytics", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-windows-titlebar");
  });
  it("reports the collapsed caption New Session as a titlebar click", async () => {
    document.documentElement.setAttribute("data-windows-titlebar", "");
    const b = await mountShell({ collapsed: true, width: 0 });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "New session" })));
    expect(b.startSession).toHaveBeenCalledOnce();
    expect(b.trackEntryClick).toHaveBeenCalledExactlyOnceWith({
      menu_name: "new_session",
      position: "titlebar",
    });
  });
  it("reports the expanded brand and New Session button as sidebar clicks", async () => {
    document.documentElement.setAttribute("data-windows-titlebar", "");
    const b = await mountShell();
    const starters = screen.getAllByRole("button", { name: "New session" });
    expect(starters).toHaveLength(2);
    for (const button of starters) await act(async () => fireEvent.click(button));
    expect(b.startSession).toHaveBeenCalledTimes(2);
    expect(b.trackEntryClick.mock.calls).toEqual([
      [{ menu_name: "new_session", position: "sidebar" }],
      [{ menu_name: "new_session", position: "sidebar" }],
    ]);
  });
});
describe("Windows caption tooltips", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-windows-titlebar");
  });
  const hover = async (button: HTMLElement): Promise<void> => {
    await act(async () => fireEvent.pointerEnter(button));
    await act(() => {
      vi.advanceTimersByTime(500);
    });
  };
  it.each([false, true])(
    "drops the sidebar toggle bubble below the caption (collapsed=%s)",
    async (collapsed) => {
      vi.useFakeTimers();
      document.documentElement.setAttribute("data-windows-titlebar", "");
      await mountShell({ collapsed, width: collapsed ? 0 : 300 });
      await hover(
        screen.getByRole("button", { name: collapsed ? "Open sidebar" : "Collapse sidebar" }),
      );
      expect(screen.getByRole("tooltip").getAttribute("data-side")).toBe("bottom");
    },
  );
  it("drops the collapsed New Session bubble below the caption as well", async () => {
    vi.useFakeTimers();
    document.documentElement.setAttribute("data-windows-titlebar", "");
    await mountShell({ collapsed: true, width: 0 });
    await hover(screen.getByRole("button", { name: "New session" }));
    expect(screen.getByRole("tooltip").getAttribute("data-side")).toBe("bottom");
  });
  it("keeps the ordinary Web bubble beside its anchor", async () => {
    vi.useFakeTimers();
    await mountShell({ collapsed: true, width: 0 });
    await hover(screen.getByRole("button", { name: "Open sidebar" }));
    expect(screen.getByRole("tooltip").getAttribute("data-side")).toBe("right");
  });
});
it("uses the same effective sidebar binding for hover/focus hints and ARIA", async () => {
  const shortcut = {
    id: "sidebar.left.toggle" as ShortcutCommandId,
    label: "Toggle sidebar",
    aliases: [],
    binding: null,
    modified: false,
    conflicts: [],
    issue: null,
    keys: ["⌘", "B"],
    aria: "Meta+B",
  };
  await mountShell({ shortcuts: [shortcut] });
  const toggle = screen.getByRole("button", { name: en["toggle.collapse"] });
  expect(toggle.getAttribute("aria-keyshortcuts")).toBe("Meta+B");
  await act(async () => fireEvent.focus(toggle));
  expect(
    Array.from(screen.getByRole("tooltip").querySelectorAll("kbd"), (key) => key.textContent),
  ).toEqual(["⌘", "B"]);
});
it("retains drawer content through close and restores focus without entering an editor", async () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  try {
    opener.focus();
    expect(document.activeElement).toBe(opener);
    const h = await mountShell({ drawer: true });
    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("data-shortcut-modal")).toBe("sidebar");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(dialog.contains(document.activeElement)).toBe(true);
    const region = screen.getByTestId("region");
    await act(async () => fireEvent.keyDown(document.activeElement!, { key: "Escape" }));
    expect(h.toggleSidebar).toHaveBeenCalledOnce();
    await h.rerender({ collapsed: true });
    expect(dialog.hasAttribute("aria-modal")).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(screen.getByTestId("region")).toBe(region);
    expect(h.regionOwner().wide).toBe(true);
  } finally {
    opener.remove();
  }
});
it("moves focus into the drawer from a focused SVG element", async () => {
  const opener = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  opener.setAttribute("tabindex", "0");
  document.body.append(opener);
  try {
    opener.focus();
    expect(document.activeElement).toBe(opener);
    await mountShell({ drawer: true });
    expect(
      screen.getByRole("dialog", { name: "Navigation" }).contains(document.activeElement),
    ).toBe(true);
  } finally {
    opener.remove();
  }
});
it("keeps focus in a foreground dialog when the drawer closes behind it", async () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  try {
    opener.focus();
    const h = await mountShell({ drawer: true });
    render(
      vueH(
        Modal,
        { open: true, headless: true, title: "Settings", onClose: vi.fn() },
        { default: () => [vueH("button", null, ["Settings control"])] },
      ),
    );
    await act(() => {});
    const control = screen.getByRole("button", { name: "Settings control" });
    expect(document.activeElement).toBe(control);
    await h.rerender({ collapsed: true });
    expect(document.activeElement).toBe(control);
  } finally {
    opener.remove();
  }
});
it("moves focus to the rail toggle when the drawer opener unmounts", async () => {
  vi.useFakeTimers();
  const opener = document.createElement("button");
  document.body.append(opener);
  try {
    opener.focus();
    const h = await mountShell({ drawer: true });
    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    opener.remove();
    await h.rerender({ drawer: false, collapsed: true, width: 56 });
    await act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getAllByRole("button", { name: "New session" })).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open sidebar" }));
  } finally {
    opener.remove();
  }
});
it("moves focus from drawer search to the rail toggle before wide content unmounts", async () => {
  vi.useFakeTimers();
  const h = await mountShell({
    drawer: true,
    content: vueH("input", { "aria-label": "Search" }, []),
  });
  screen.getByRole("textbox", { name: "Search" }).focus();
  await h.rerender({ drawer: false, collapsed: true, width: 56 });
  await act(() => {
    vi.advanceTimersByTime(150);
  });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open sidebar" }));
});
it.each(["dialog", "outside"] as const)(
  "preserves %s focus when a drawer becomes a rail without its opener",
  async (destination) => {
    vi.useFakeTimers();
    const opener = document.createElement("button");
    const outside = document.createElement("button");
    document.body.append(opener, outside);
    try {
      opener.focus();
      const h = await mountShell({ drawer: true });
      let control: HTMLElement = outside;
      if (destination === "dialog") {
        render(
          vueH(
            Modal,
            { open: true, headless: true, title: "Settings", onClose: vi.fn() },
            { default: () => [vueH("button", null, ["Settings control"])] },
          ),
        );
        await act(() => {});
        control = screen.getByRole("button", { name: "Settings control" });
      } else {
        outside.focus();
      }
      expect(document.activeElement).toBe(control);
      opener.remove();
      await h.rerender({ drawer: false, collapsed: true, width: 56 });
      await act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(document.activeElement).toBe(control);
    } finally {
      opener.remove();
      outside.remove();
    }
  },
);
it("closes a drawer opened from a focused SVG element", async () => {
  const opener = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  opener.setAttribute("tabindex", "0");
  document.body.append(opener);
  try {
    opener.focus();
    expect(document.activeElement).toBe(opener);
    const h = await mountShell({ drawer: true });
    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await h.rerender({ collapsed: true });
    expect(dialog.hasAttribute("aria-modal")).toBe(false);
  } finally {
    opener.remove();
  }
});
it.each(["menu", "outside", "dialog"] as const)(
  "closes an obscured sidebar menu while preserving %s focus",
  async (destination) => {
    // Losing an inert menu's active element does not unfocus the Chromium window.
    const windowFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    try {
      const Content = defineComponent(() => {
        const open = ref(true);
        return () =>
          vueH(Fragment, null, [
            vueH(
              Menu,
              {
                open: open.value,
                onClose: () => {
                  open.value = false;
                },
                portal: true,
                items: [{ id: "flat", label: "Flat list" }],
              },
              { anchor: () => vueH("button", null, "View options") },
            ),
            destination === "dialog"
              ? vueH(
                  Modal,
                  { open: true, title: "Settings", closeLabel: "Close", onClose: vi.fn() },
                  { default: () => vueH("button", null, "Settings control") },
                )
              : null,
          ]);
      });
      render(
        vueH(Fragment, null, [
          vueH("button", { "data-sidebar-opener": true }, ["Open navigation"]),
          vueH("button", null, ["Outside control"]),
        ]),
      );
      await act(() => {});
      const h = await mountShell({
        collapsed: true,
        width: 56,
        content: vueH(Content, null, { default: () => [] }),
      });
      let target: HTMLElement = screen.getByRole("menuitem");
      if (destination === "outside")
        target = screen.getByRole("button", { name: "Outside control" });
      if (destination === "dialog")
        target = screen.getByRole("button", { name: "Settings control" });
      target.focus();
      screen.getByTestId("region").setAttribute("inert", "");
      await h.rerender({ drawer: true });
      await waitFor(() => {
        expect(screen.queryByRole("menuitem")).toBeNull();
      });
      expect(document.activeElement).toBe(
        destination === "menu" ? screen.getByRole("button", { name: "Open navigation" }) : target,
      );
    } finally {
      windowFocus.mockRestore();
    }
  },
);
it.each(["menu", "outside", "dialog"] as const)(
  "returns global context-menu focus on collapse while preserving %s focus",
  async (destination) => {
    render(
      vueH(Fragment, null, [
        vueH("button", { "data-sidebar-opener": true }, ["Open navigation"]),
        vueH("button", null, ["Outside control"]),
      ]),
    );
    await act(() => {});
    const h = await mountShell({
      content: vueH("button", { "aria-controls": "session-menu" }, ["Session actions"]),
    });
    screen.getByRole("button", { name: "Session actions" }).focus();
    render(
      vueH("div", { role: "menu", id: "session-menu" }, [
        vueH("button", { role: "menuitem" }, ["Copy"]),
      ]),
    );
    await act(() => {});
    let target = screen.getByRole("menuitem");
    if (destination === "outside") target = screen.getByRole("button", { name: "Outside control" });
    if (destination === "dialog") {
      render(
        vueH(
          Modal,
          { open: true, title: "Settings", closeLabel: "Close", onClose: vi.fn() },
          { default: () => [vueH("button", null, ["Settings control"])] },
        ),
      );
      await act(() => {});
      target = screen.getByRole("button", { name: "Settings control" });
    }
    target.focus();
    await h.rerender({ drawer: true, collapsed: true });
    expect(document.activeElement).toBe(
      destination === "menu" ? screen.getByRole("button", { name: "Open navigation" }) : target,
    );
  },
);
it.each([false, true])(
  "moves hidden sidebar focus only to an available opener (%s)",
  async (hasOpener) => {
    render(vueH("button", { "data-sidebar-opener": hasOpener || undefined }, ["Open navigation"]));
    await act(() => {});
    const h = await mountShell({ collapsed: true, width: 56 });
    const previous = screen.getByRole("button", { name: "Open sidebar" });
    previous.focus();
    await h.rerender({ drawer: true });
    const expected = hasOpener ? screen.getByRole("button", { name: "Open navigation" }) : previous;
    expect(document.activeElement).toBe(expected);
    if (hasOpener) expect(expected.hasAttribute("data-dsh-automatic-focus")).toBe(true);
  },
);

it.each(["handoff", "outside", "reopen", "dispose", "unfocused"] as const)(
  "captures portaled menu focus before the parent commits its drawer opener: %s",
  async (outcome) => {
    const Content = defineComponent(() => {
      const open = ref(true);
      return () =>
        vueH(
          Menu,
          {
            open: open.value,
            onClose: () => {
              open.value = false;
            },
            portal: true,
            items: [{ id: "flat", label: "Flat list" }],
          },
          { anchor: () => vueH("button", null, "View options") },
        );
    });
    const outside = document.createElement("button");
    document.body.append(outside);
    let afterCommit = () => {};
    let committedOpener: Element | null = null;
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    // Chromium keeps a focused window when inert content loses its active element.
    const windowFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const shell = await mountShell({
      content: vueH(Content),
      frame: (sidebar, state) =>
        vueH("section", null, [
          vueH("div", { inert: state.drawer && state.collapsed ? "" : undefined }, [sidebar]),
          state.drawer
            ? vueH(
                "button",
                {
                  "data-sidebar-opener": true,
                  onVnodeMounted: () => {
                    afterCommit();
                  },
                },
                "Open navigation",
              )
            : null,
        ]),
    });
    try {
      expect(document.querySelector("[data-sidebar-opener]")).toBeNull();
      const menuItem = screen.getByRole("menuitem");
      menuItem.focus();
      expect(document.activeElement).toBe(menuItem);
      afterCommit = () => {
        // Chromium drops focus when the old sidebar becomes inert during this commit.
        committedOpener = document.querySelector("[data-sidebar-opener]");
        menuItem.blur();
        if (outcome === "unfocused") windowFocus.mockReturnValue(false);
        if (outcome === "outside") outside.focus();
        if (outcome === "reopen") void shell.rerender({ drawer: false, collapsed: false });
        if (outcome === "dispose") shell.unmount();
      };
      await shell.rerender({ drawer: true, collapsed: true });
      await act(() => {});
      if (outcome === "handoff") {
        const opener = screen.getByRole("button", { name: "Open navigation" });
        expect(opener.closest("[inert]")).toBeNull();
        expect(document.activeElement).toBe(opener);
      } else if (outcome === "unfocused") {
        expect(document.hasFocus()).toBe(false);
        expect(document.activeElement).toBe(document.body);
        expect(document.querySelector("[data-sidebar-opener]")).toBe(committedOpener);
        expect(focus.mock.contexts).not.toContain(committedOpener);
      } else if (outcome === "outside") {
        expect(focus.mock.contexts).not.toContain(committedOpener);
        expect(document.activeElement).toBe(outside);
      } else {
        expect(focus.mock.contexts).not.toContain(committedOpener);
        expect(document.querySelector("[data-sidebar-opener]")).toBeNull();
        expect(document.activeElement).not.toBe(outside);
      }
    } finally {
      windowFocus.mockRestore();
      focus.mockRestore();
      outside.remove();
    }
  },
);
