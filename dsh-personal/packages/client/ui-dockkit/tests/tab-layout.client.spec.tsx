// @vitest-environment jsdom
import { h as vueH } from "vue";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { act, cleanup, fireEvent, render } from "./vue-render.client.ts";
type TabLayoutProps = InstanceType<typeof TabLayout>["$props"];
import { TabLayout } from "../src/components/TabLayout.tsx";
import { DockController } from "../src/engine/controller.ts";
import { getNode, getPane } from "../src/engine/tree.ts";
import type { PaneCallbacks } from "../src/components/render.ts";
import type { TabId } from "../src/contract/types.ts";
import { followPointer } from "../src/components/pointer.ts";
import { seededController, TEST_LABELS } from "./fixtures.client.ts";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mounted(controller = seededController(), options: Partial<TabLayoutProps> = {}) {
  const callbacks: PaneCallbacks = {
    onFocusTab: (id) => {
      controller.focusTab(id);
      redraw();
    },
    onFocusPane: (id) => {
      controller.focusPane(id);
      redraw();
    },
    onSplitPane: vi.fn(),
    onAddTab: vi.fn(),
    onCloseTab: vi.fn(),
    onTabPressed: vi.fn(),
    onDividerPressed: vi.fn(),
    splitBlock: () => undefined,
    canAddTab: () => true,
    canCloseTab: () => true,
    dropTarget: undefined,
    draggingTabId: undefined,
    labels: TEST_LABELS,
    renderTab: (tab) => vueH("input", { "data-body": tab.id, value: tab.title }, []),
    renderTabTitle: undefined,
    renderTabMenuItems: undefined,
    chromePaneId: getPane(controller.getSnapshot().state, controller.getSnapshot().state.rootId).id,
    chrome: undefined,
  };
  const props = () => ({
    state: controller.getSnapshot().state,
    callbacks,
    intents: controller,
    preview: undefined,
    ...options,
  });
  const view = render(vueH(TabLayout, { ...props() }, { default: () => [] }));
  function redraw(next: typeof options = {}) {
    options = { ...options, ...next };
    view.rerender(vueH(TabLayout, { ...props() }, { default: () => [] }));
  }
  const node = (selector: string): HTMLElement => {
    const element = view.container.querySelector<HTMLElement>(selector);
    if (element === null) throw new Error(`missing ${selector}`);
    return element;
  };
  return {
    controller,
    view,
    redraw,
    callbacks,
    node,
    body: (id: TabId) => node(`[data-body="${id}"]`),
  };
}
it.each([
  { active: false, targetControl: false },
  { active: true, targetControl: false },
  { active: false, targetControl: true },
  { active: true, targetControl: true },
])(
  "closes a tab by middle click without selecting it first (active: $active, close control: $targetControl)",
  async ({ active, targetControl }) => {
    const controller = seededController();
    const first = controller.openContent({ kind: "file", contentId: "file:a", title: "A" });
    const second = controller.openContent({ kind: "file", contentId: "file:b", title: "B" });
    const h = mounted(controller);
    const focus = vi.spyOn(h.callbacks, "onFocusTab");
    const close = vi.spyOn(h.callbacks, "onCloseTab").mockImplementation((id) => {
      controller.closeTab(id);
      h.redraw();
    });
    const target = active ? second : first;
    const chip = h.node(
      `[data-dockkit-tab="${target}"]${targetControl ? " [data-dockkit-tab-close]" : ""}`,
    );
    await fireEvent.pointerDown(chip, { button: 1, pointerId: 7 });
    expect(await fireEvent.mouseDown(chip, { button: 1 })).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(h.callbacks.onTabPressed).not.toHaveBeenCalled();
    await fireEvent.pointerUp(chip, { button: 1, pointerId: 7 });
    await fireEvent.mouseUp(chip, { button: 1 });
    expect(
      await fireEvent(
        chip,
        new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
      ),
    ).toBe(false);
    expect(close).toHaveBeenCalledExactlyOnceWith(target);
    expect(focus).not.toHaveBeenCalled();
    expect(h.view.container.querySelector(`[data-dockkit-tab="${target}"]`)).toBeNull();
    expect(
      h.node(`[data-dockkit-tab="${active ? first : second}"]`).getAttribute("aria-selected"),
    ).toBe("true");
  },
);
it("keeps an unclosable tab on middle click", async () => {
  const h = mounted();
  vi.spyOn(h.callbacks, "canCloseTab").mockReturnValue(false);
  h.redraw();
  const chip = h.node("[data-dockkit-tab]");
  await fireEvent(chip, new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }));
  expect(h.callbacks.onCloseTab).not.toHaveBeenCalled();
  expect(h.node("[data-dockkit-tab]")).toBe(chip);
});
it("does not treat a middle click inside the tab menu as a click on the tab title", async () => {
  const h = mounted();
  await fireEvent.contextMenu(h.node("[data-dockkit-tab]"));
  const item = h.view.getByRole("menuitem", { name: TEST_LABELS.closeTab });
  await fireEvent(item, new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }));
  expect(h.callbacks.onCloseTab).not.toHaveBeenCalled();
});
it("keeps primary selection and secondary menus separate from middle-click closing", async () => {
  const h = mounted();
  const chip = h.node("[data-dockkit-tab]");
  for (const button of [0, 2]) {
    expect(await fireEvent.mouseDown(chip, { button })).toBe(true);
    await fireEvent.pointerDown(chip, { button, pointerId: 7 });
    expect(
      await fireEvent(
        chip,
        new MouseEvent("auxclick", { button, bubbles: true, cancelable: true }),
      ),
    ).toBe(true);
  }
  expect(h.callbacks.onTabPressed).toHaveBeenCalledTimes(1);
  expect(h.callbacks.onCloseTab).not.toHaveBeenCalled();
});
it("retains visited bodies and hands keyboard focus to the newly selected strip", async () => {
  const controller = seededController();
  controller.setExpanded(true);
  const first = getPane(controller.getSnapshot().state, controller.getSnapshot().state.rootId)
    .tabs[0]!;
  const second = controller.openContent({ kind: "file", contentId: "file:b", title: "B" });
  controller.focusTab(first);
  const h = mounted(controller, { keepMounted: () => true });
  const original = h.body(first);
  expect(h.view.container.querySelector(`[data-body="${second}"]`)).toBeNull();
  const chip = h.node(`[data-dockkit-tab="${second}"]`);
  chip.focus();
  await fireEvent.click(chip);
  expect(document.activeElement).toBe(
    h.node(`[data-dockkit-content="${second}"] [data-dockkit-tab="${second}"]`),
  );
  expect(h.body(first)).toBe(original);
  expect(original.closest("[data-dockkit-host]")).toHaveProperty("hidden", true);
  await fireEvent.click(
    h.node(`[data-dockkit-content="${second}"] [data-dockkit-tab="${second}"]`),
  );
  const body = h.body(second);
  body.focus();
  h.redraw({ active: false });
  expect(body.closest("[data-dockkit-content]")).toHaveProperty("inert", true);
  expect(document.activeElement).not.toBe(body);
  await fireEvent.focus(body);
  h.redraw({ active: true });
  expect(h.body(second)).toBe(body);
  expect(body.closest("[data-dockkit-content]")).toHaveProperty("inert", false);
  await act(() => {
    controller.setExpanded(false);
    h.redraw();
  });
  expect(h.body(second)).toBe(body);
});
it("keeps body ancestors through pane moves, floating, raising and docking", async () => {
  const controller = seededController();
  controller.setExpanded(true);
  const tab = controller.openContent({ kind: "file", contentId: "file:a", title: "A" });
  const h = mounted(controller, { keepMounted: () => true });
  const body = h.body(tab);
  const host = body.closest("[data-dockkit-host]")!;
  await act(() => {
    controller.splitPane();
    h.redraw();
  });
  expect(h.view.container.querySelectorAll("[data-dockkit-pane]")).toHaveLength(2);
  const state = controller.getSnapshot().state;
  const split = getNode(state, state.rootId);
  if (split.kind !== "split") throw new Error("expected a split");
  h.redraw({ preview: { splitId: split.id, sizes: [0.3, 0.7] } });
  expect(h.node("[data-dockkit-split]").style.gridTemplateColumns).toContain("0.3fr");
  await fireEvent.pointerDown(h.node("[data-dockkit-divider]"), { button: 0, pointerId: 1 });
  expect(h.callbacks.onDividerPressed).toHaveBeenCalledOnce();
  h.redraw({ preview: undefined });
  const secondPane = getPane(state, split.children[1]!).id;
  await fireEvent.click(h.node(`[data-dockkit-content="${tab}"] [data-dockkit-tab="${tab}"]`));
  expect(controller.getSnapshot().state.activePaneId).toBe(split.children[0]);
  await act(() => {
    controller.focusPane(secondPane);
    h.redraw();
  });
  await fireEvent.focus(body);
  expect(controller.getSnapshot().state.activePaneId).toBe(split.children[0]);
  await act(() => {
    controller.focusPane(secondPane);
    h.redraw();
  });
  await fireEvent.pointerDown(h.node(`[data-dockkit-content="${tab}"]`), {
    button: 0,
    pointerId: 1,
  });
  await fireEvent.click(body);
  await fireEvent.focus(body);
  expect(controller.getSnapshot().state.activePaneId).toBe(getPane(state, split.children[0]!).id);
  await act(() => {
    controller.placeTab(tab, secondPane, 0);
    h.redraw();
  });
  expect(h.body(tab)).toBe(body);
  expect(body.closest("[data-dockkit-host]")).toBe(host);
  await act(() => {
    controller.floatTab(tab);
    h.redraw();
  });
  const floating = controller.getSnapshot().state.floats[0]!;
  expect(body.closest("[data-dockkit-host]")).toBe(host);
  expect(host.getAttribute("data-dockkit-host")).toBe("float");
  await act(() => {
    controller.setExpanded(false);
    h.redraw();
  });
  expect(body.closest("[data-dockkit-content]")?.getAttribute("aria-hidden")).toBeNull();
  await fireEvent.pointerDown(h.node(`[data-dockkit-float="${floating}"]`), {
    pointerId: 1,
    button: 0,
  });
  await fireEvent.click(h.node(`[data-dockkit-float="${floating}"]`));
  await fireEvent.focus(body);
  const resize = h.node("[data-dockkit-float-resize]");
  await fireEvent.pointerDown(resize, { pointerId: 2, button: 0, clientX: 500, clientY: 400 });
  await fireEvent.pointerMove(window, { pointerId: 2, clientX: 540, clientY: 440 });
  await fireEvent.pointerUp(window, { pointerId: 2, clientX: 540, clientY: 440 });
  await act(() => {
    h.redraw();
    controller.unfloatPane(floating);
    h.redraw();
  });
  expect(h.body(tab)).toBe(body);
  expect(body.closest("[data-dockkit-host]")).toBe(host);
});
it("does not re-render a docked or floating body while a float gesture redraws the layout", async () => {
  const controller = seededController();
  controller.setExpanded(true);
  const tab = controller.openContent({ kind: "file", contentId: "file:a", title: "A" });
  controller.openContent({ kind: "file", contentId: "file:b", title: "B" });
  controller.floatTab(tab, { x: 100, y: 80, width: 300, height: 200 });
  const h = mounted(controller, { keepMounted: () => true });
  const renderTab = vi.fn(h.callbacks.renderTab);
  h.redraw({ callbacks: { ...h.callbacks, renderTab } });
  const rendered = renderTab.mock.calls.length;
  expect(rendered).toBeGreaterThan(0);
  const floating = controller.getSnapshot().state.floats[0]!;
  await fireEvent.pointerDown(
    h.node(`[data-dockkit-float="${floating}"] [data-dockkit-float-grip]`),
    { pointerId: 3, button: 0, clientX: 150, clientY: 90 },
  );
  for (const x of [170, 190, 210])
    await fireEvent.pointerMove(window, { pointerId: 3, clientX: x, clientY: 90 });
  expect(h.node(`[data-dockkit-float="${floating}"]`).style.left).toBe("160px");
  expect(renderTab).toHaveBeenCalledTimes(rendered);
  await fireEvent.pointerUp(window, { pointerId: 3, clientX: 210, clientY: 90 });
  // A new renderer is how an embedder refreshes its bodies.
  const next = vi.fn(h.callbacks.renderTab);
  h.redraw({ callbacks: { ...h.callbacks, renderTab: next } });
  expect(next).toHaveBeenCalledTimes(rendered);
});
it("unmounts unretained bodies and restores focus to their replacement strip", async () => {
  const controller = seededController();
  controller.setExpanded(true);
  const first = getPane(controller.getSnapshot().state, controller.getSnapshot().state.rootId)
    .tabs[0]!;
  const second = controller.openContent({ kind: "file", contentId: "file:b", title: "B" });
  controller.focusTab(first);
  const h = mounted(controller);
  const original = h.body(first);
  await fireEvent.click(h.node(`[data-dockkit-tab="${second}"]`));
  expect(original.isConnected).toBe(false);
  h.redraw({ active: false });
  expect(h.view.container.querySelector("[data-body]")).toBeNull();
  h.redraw({ active: true });
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  await fireEvent.click(h.node(`[data-dockkit-tab="${first}"]`));
  expect(focus).toHaveBeenCalled();
});
it.for(["new-control", "origin-control", "document", "no-focus"] as const)(
  "transfers tab focus without overriding a new owner: %s",
  async (kind, test) => {
    const controller = seededController();
    controller.setExpanded(true);
    const first = getPane(controller.getSnapshot().state, controller.getSnapshot().state.rootId)
      .tabs[0]!;
    const second = controller.openContent({ kind: "file", contentId: "file:b", title: "B" });
    controller.focusTab(first);
    const h = mounted(controller);
    const control = document.createElement("button");
    document.body.append(control);
    test.onTestFinished(() => {
      control.remove();
    });
    if (kind === "origin-control") control.focus();
    vi.spyOn(h.callbacks, "onFocusTab").mockImplementation((id) => {
      if (kind === "new-control") control.focus();
      if (kind === "document" || kind === "no-focus") {
        vi.spyOn(document, "activeElement", "get").mockReturnValue(
          kind === "document" ? document.documentElement : null,
        );
      }
      controller.focusTab(id);
      h.redraw();
    });
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    await fireEvent.click(h.node(`[data-dockkit-tab="${second}"]`));
    if (kind === "new-control") expect(document.activeElement).toBe(control);
    else expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  },
);
it("does not require a docked strip when a selected tab becomes floating in the same update", async () => {
  const controller = seededController();
  controller.setExpanded(true);
  const first = getPane(controller.getSnapshot().state, controller.getSnapshot().state.rootId)
    .tabs[0]!;
  const second = controller.openContent({ kind: "file", contentId: "file:b", title: "B" });
  controller.focusTab(first);
  const h = mounted(controller);
  vi.spyOn(h.callbacks, "onFocusTab").mockImplementation((id) => {
    controller.focusTab(id);
    controller.floatTab(id);
    h.redraw();
  });
  await fireEvent.click(h.node(`[data-dockkit-tab="${second}"]`));
  expect(h.node(`[data-dockkit-content="${second}"]`).hasAttribute("data-dockkit-float")).toBe(
    true,
  );
});
it("renders an empty pane and rejects unsupported docked trees", () => {
  const controller = new DockController();
  controller.setExpanded(true);
  const h = mounted(controller);
  expect(h.node("[data-dockkit-empty]")).toBeDefined();
  controller.openContent({ kind: "file", contentId: "file:a", title: "A" });
  controller.splitPane();
  const state = controller.getSnapshot().state;
  const root = getNode(state, state.rootId);
  if (root.kind !== "split") throw new Error("expected a split");
  vi.spyOn(console, "error").mockImplementation(() => {});
  const suppress = (event: ErrorEvent): void => {
    if (
      event.error instanceof Error &&
      event.error.message === "DockLayout requires one pane or two horizontally split panes"
    ) {
      event.preventDefault();
    }
  };
  window.addEventListener("error", suppress);
  try {
    expect(() => {
      h.redraw({
        state: { ...state, nodes: { ...state.nodes, [root.id]: { ...root, axis: "column" } } },
      });
    }).toThrow("two horizontally split panes");
  } finally {
    window.removeEventListener("error", suppress);
  }
});
it("keeps a superseding gesture marker when an older follower detaches", () => {
  const element = document.createElement("div");
  const followers = { move: vi.fn(), up: vi.fn(), cancel: vi.fn() };
  const first = followPointer(element, 1, followers);
  const second = followPointer(element, 2, followers);
  first();
  expect(element.dataset.dockkitPointer).toBe("2");
  second();
  expect(element.dataset.dockkitPointer).toBeUndefined();
});
/**
 * Give each element its own `scrollLeft`, starting at 0, and log every
 * assignment with the inline `scroll-behavior` it ran under: `auto` jumps,
 * empty leaves the stylesheet's glide.
 */
function stubScrollLeft() {
  const offsets = new WeakMap<Element, number>();
  const writes: (readonly [number, string])[] = [];
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollLeft");
  Object.defineProperty(Element.prototype, "scrollLeft", {
    configurable: true,
    get(this: Element) {
      return offsets.get(this) ?? 0;
    },
    set(this: HTMLElement, value: number) {
      offsets.set(this, value);
      writes.push([value, this.style.scrollBehavior]);
    },
  });
  const restore = (): void => {
    if (descriptor === undefined) Reflect.deleteProperty(Element.prototype, "scrollLeft");
    else Object.defineProperty(Element.prototype, "scrollLeft", descriptor);
  };
  return { offsets, writes, restore };
}
it("continues a selected tab's strip from its pane's last offset and jumps on a first placement", async () => {
  const { writes, restore } = stubScrollLeft();
  const rect = (left: number, width: number): DOMRect => ({
    left,
    right: left + width,
    top: 0,
    bottom: 28,
    x: left,
    y: 0,
    width,
    height: 28,
    toJSON: () => ({}),
  });
  // The chip box spans 0..200; the seeded chip sits at 40..130 and the opened one where `openedAt` says.
  const controller = seededController();
  const seeded = getPane(
    controller.getSnapshot().state,
    controller.getSnapshot().state.activePaneId,
  ).activeTabId;
  if (seeded === undefined) throw new Error("expected the seeded tab");
  const opened = controller.openContent({ kind: "file", contentId: "file:b", title: "B" });
  let openedAt = 250;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute("data-dockkit-strip-tabs")) return rect(0, 200);
    if (this.getAttribute("data-dockkit-tab") === opened) return rect(openedAt, 90);
    if (this.hasAttribute("data-dockkit-tab")) return rect(40, 90);
    return rect(0, 0);
  });
  try {
    const h = mounted(controller);
    // The first strip has no recorded offset: it jumps to the chip.
    expect(writes).toEqual([[164, "auto"]]);
    // The seeded tab's new strip starts where the previous one stood, where its chip is in view.
    await fireEvent.click(h.node(`[data-dockkit-tab="${seeded}"]`));
    expect(writes.slice(1)).toEqual([[164, "auto"]]);
    // Back on the opened tab, now 30 past the left edge: restored, then glided the rest.
    openedAt = -30;
    await fireEvent.click(h.node(`[data-dockkit-tab="${opened}"]`));
    expect(writes.slice(2)).toEqual([
      [164, "auto"],
      [164 - 30 - 24, ""],
    ]);
  } finally {
    restore();
  }
});
it("places a selected tab's strip moved to another pane from that pane's last offset", async () => {
  // jsdom lays every chip and box out at 0x0, so only restores write offsets here.
  const { offsets, writes, restore } = stubScrollLeft();
  try {
    const controller = seededController();
    controller.setExpanded(true);
    const moved = controller.openContent({ kind: "file", contentId: "file:a", title: "A" });
    controller.openContent({ kind: "file", contentId: "file:b", title: "B" });
    const h = mounted(controller);
    await act(() => {
      controller.splitPane();
      h.redraw();
    });
    const state = controller.getSnapshot().state;
    const split = getNode(state, state.rootId);
    if (split.kind !== "split") throw new Error("expected a split");
    const target = getPane(state, split.children[1]!).id;
    await act(() => {
      controller.focusTab(moved);
      h.redraw();
    });
    offsets.set(h.node(`[data-dockkit-strip-tabs="${target}"]`), 70);
    writes.length = 0;
    await act(() => {
      controller.placeTab(moved, target, 0);
      h.redraw();
    });
    expect(
      h
        .node(`[data-dockkit-strip-tabs="${target}"] [data-dockkit-tab="${moved}"]`)
        .getAttribute("aria-selected"),
    ).toBe("true");
    // The moved strip takes the target pane's 70; the source pane's next strip restores the 0 the moved one left there.
    expect([...writes].sort((x, y) => x[0] - y[0])).toEqual([
      [0, "auto"],
      [70, "auto"],
    ]);
  } finally {
    restore();
  }
});
