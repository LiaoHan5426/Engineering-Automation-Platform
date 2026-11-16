// @vitest-environment jsdom
import { h as vueH } from "vue";
/**
 * Floating-panel edge recovery through the rendered layer: resistance while a
 * move is past an edge, one legal `moveFloat` per release, the spring back to
 * it, cancellation, reduced motion, and the viewport projection. Frames and
 * the clock are driven by hand so every trajectory is deterministic.
 */
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "./vue-render.client.ts";
import { FloatLayer } from "../src/components/FloatLayer.tsx";
import type { DockIntents } from "../src/contract/adapter.ts";
import type { FloatRect, PaneId } from "../src/contract/types.ts";
import { floatRect, getPane } from "../src/engine/tree.ts";
import { seededController, TEST_LABELS } from "./fixtures.client.ts";
let now = 0;
let queued = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
beforeEach(() => {
  now = 0;
  queued = new Map();
  nextFrame = 1;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    queued.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    queued.delete(id);
  });
  viewport(1024, 768);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
/** Set the window size the layer reads. */
function viewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}
/** Advance the clock and run every frame callback that was waiting. */
async function frame(ms = 16) {
  now += ms;
  const due = [...queued.values()];
  queued.clear();
  await act(() => {
    for (const callback of due) callback(now);
  });
}
/** Run frames until no callback is waiting; returns the elapsed time. */
async function runOut() {
  const started = now;
  for (let guard = 0; queued.size > 0; guard++) {
    if (guard > 200) throw new Error("animation never ended");
    await frame();
  }
  return now - started;
}
/** One floating panel over a live controller whose recorded moves redraw the layer. */
function mounted(rect: FloatRect = { x: 100, y: 80, width: 300, height: 200 }) {
  const controller = seededController();
  const tabId = controller.openContent({
    contentId: "dsh-resource://file/session/s/a.txt",
    title: "a.txt",
    kind: "file",
  });
  const paneId = controller.floatTab(tabId, rect);
  const renderTab = vi.fn(() => null);
  const redraw = (): void => {
    view.rerender(
      vueH(
        FloatLayer,
        {
          state: controller.getSnapshot().state,
          intents: intents,
          labels: TEST_LABELS,
          renderTab: renderTab,
        },
        { default: () => [] },
      ),
    );
  };
  const moveFloat = vi.fn((id: PaneId, x: number, y: number) => {
    controller.moveFloat(id, x, y);
    redraw();
  });
  const resizeFloat = vi.fn((id: PaneId, next: FloatRect) => {
    controller.resizeFloat(id, next);
    redraw();
  });
  const focusPane = vi.fn((id: PaneId) => {
    controller.focusPane(id);
    redraw();
  });
  const intents: DockIntents = {
    focusTab: vi.fn(),
    focusPane,
    splitPane: vi.fn(),
    addTab: vi.fn(),
    closeTab: vi.fn(),
    duplicateTab: vi.fn(),
    floatTab: vi.fn(),
    unfloatPane: vi.fn(),
    placeTab: vi.fn(),
    dropTab: vi.fn(),
    moveFloat,
    resizeFloat,
    resizeSplit: vi.fn(),
  };
  const view = render(
    vueH(
      FloatLayer,
      {
        state: controller.getSnapshot().state,
        intents: intents,
        labels: TEST_LABELS,
        renderTab: renderTab,
      },
      { default: () => [] },
    ),
  );
  const panel = (): HTMLElement =>
    view.container.querySelector<HTMLElement>(`[data-dockkit-float="${paneId}"]`) as HTMLElement;
  const grip = (): HTMLElement =>
    panel().querySelector<HTMLElement>("[data-dockkit-float-grip]") as HTMLElement;
  // A lifted panel writes left and top inline; a resting one publishes them to the `.float` rule.
  const drawn = (side: "left" | "top", axis: "x" | "y"): number =>
    Number.parseFloat(
      panel().style.getPropertyValue(side) ||
        panel().style.getPropertyValue(`--dsh-dockkit-float-${axis}`),
    );
  const left = (): number => drawn("left", "x");
  const top = (): number => drawn("top", "y");
  const stored = (): FloatRect => floatRect(getPane(controller.getSnapshot().state, paneId));
  const corner = (): HTMLElement =>
    panel().querySelector<HTMLElement>("[data-dockkit-float-resize]") as HTMLElement;
  return {
    controller,
    tabId,
    paneId,
    view,
    redraw,
    renderTab,
    intents,
    moveFloat,
    resizeFloat,
    focusPane,
    left,
    top,
    grip,
    corner,
    stored,
  };
}
/** Press the grip at `from`, move to `to`, and optionally release there. */
async function drag(
  grip: HTMLElement,
  from: readonly [number, number],
  to: readonly [number, number],
  release = true,
) {
  await fireEvent.pointerDown(grip, {
    clientX: from[0],
    clientY: from[1],
    pointerId: 7,
    button: 0,
  });
  await fireEvent.pointerMove(window, { pointerId: 7, clientX: to[0], clientY: to[1] });
  if (release) await fireEvent.pointerUp(window, { pointerId: 7, clientX: to[0], clientY: to[1] });
}
describe("dragging past an edge", () => {
  it("draws the panel with resistance, records one legal move, and springs there", async () => {
    const h = mounted();
    // The panel's legal x tops out at 1024 - 300 = 724; the pointer asks for 120 px beyond it.
    await drag(h.grip(), [150, 90], [150 + 744, 90], false);
    expect(h.left()).toBeCloseTo(784);
    await fireEvent.pointerUp(window, { pointerId: 7, clientX: 894, clientY: 90 });
    expect(h.moveFloat).toHaveBeenCalledTimes(1);
    expect(h.moveFloat).toHaveBeenCalledWith(h.paneId, 724, 80);
    expect(h.stored()).toMatchObject({ x: 724, y: 80 });
    expect(h.left()).toBeCloseTo(784);
    const trail: number[] = [];
    for (let guard = 0; queued.size > 0 && guard < 100; guard++) {
      await frame();
      trail.push(h.left());
    }
    expect(queued.size).toBe(0);
    expect(now).toBeLessThan(900);
    expect(h.left()).toBe(724);
    // The return overshoots inward by a few pixels, never back outside.
    expect(Math.min(...trail)).toBeLessThan(724);
    expect(Math.min(...trail)).toBeGreaterThan(724 - 120 * 0.06);
    expect(h.top()).toBe(80);
  });
  it("does not re-render the body through the drag and the return, and re-renders it for a new renderer", async () => {
    const h = mounted();
    const rendered = h.renderTab.mock.calls.length;
    await drag(h.grip(), [150, 90], [150 + 744, 90]);
    await runOut();
    expect(h.left()).toBe(724);
    // The release's moveFloat redraws the layer, but the tab record and the renderer stay the same.
    expect(h.renderTab).toHaveBeenCalledTimes(rendered);
    const next = vi.fn(() => null);
    h.view.rerender(
      vueH(
        FloatLayer,
        {
          state: h.controller.getSnapshot().state,
          intents: h.intents,
          labels: TEST_LABELS,
          renderTab: next,
        },
        { default: () => [] },
      ),
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
  it("undoes the whole gesture in one step", async () => {
    const h = mounted();
    await drag(h.grip(), [150, 90], [150 - 400, 90]);
    await runOut();
    expect(h.stored().x).toBe(0);
    expect(h.controller.undo()).toBe(true);
    expect(h.stored().x).toBe(100);
  });
  it("carries a fling: a fast release outward keeps travelling before it turns back", async () => {
    const fast = mounted();
    await fireEvent.pointerDown(fast.grip(), {
      clientX: 150,
      clientY: 90,
      pointerId: 7,
      button: 0,
    });
    now += 50;
    await fireEvent.pointerMove(window, { pointerId: 7, clientX: 850, clientY: 90 });
    now += 20;
    await fireEvent.pointerUp(window, { pointerId: 7, clientX: 894, clientY: 90 });
    const released = fast.left();
    await frame();
    expect(fast.left()).toBeGreaterThan(released);
    await runOut();
    expect(fast.left()).toBe(724);
  });
  it("starts a fling at the drawn speed, so even the fastest one stays within the resistance limit", async () => {
    const h = mounted();
    await fireEvent.pointerDown(h.grip(), { clientX: 150, clientY: 90, pointerId: 7, button: 0 });
    // A long push that ends in a fast flick: the samples older than the velocity window drop out.
    for (let x = 150; x <= 850; x += 50) {
      now += 50;
      await fireEvent.pointerMove(window, { pointerId: 7, clientX: x, clientY: 90 });
    }
    now += 10;
    await fireEvent.pointerMove(window, { pointerId: 7, clientX: 3000, clientY: 90 });
    await fireEvent.pointerUp(window, { pointerId: 7, clientX: 3000, clientY: 90 });
    const trail = [h.left()];
    for (let guard = 0; queued.size > 0 && guard < 100; guard++) {
      await frame();
      trail.push(h.left());
    }
    expect(Math.max(...trail)).toBeLessThan(724 + 120);
    expect(h.left()).toBe(724);
  });
  it("draws above the top edge while dragged and springs back below it", async () => {
    const h = mounted();
    await drag(h.grip(), [150, 90], [150, 90 - 200], false);
    expect(h.top()).toBeLessThan(0);
    await fireEvent.pointerUp(window, { pointerId: 7, clientX: 150, clientY: -110 });
    expect(h.moveFloat).toHaveBeenCalledWith(h.paneId, 100, 0);
    await runOut();
    expect(h.top()).toBe(0);
  });
  it("springs straight back after a slow push, which has no release velocity", async () => {
    const h = mounted();
    await drag(h.grip(), [150, 90], [150 + 744, 90]);
    const released = h.left();
    await frame();
    expect(h.left()).toBeLessThan(released);
  });
  it("leaves a release inside the viewport where it landed, with no animation", async () => {
    const h = mounted();
    await drag(h.grip(), [150, 90], [170, 110]);
    expect(h.moveFloat).toHaveBeenCalledWith(h.paneId, 120, 100);
    expect(queued.size).toBe(0);
    expect(h.left()).toBe(120);
  });
  it("records nothing for a push that ends where the panel already was, yet still springs back", async () => {
    const h = mounted({ x: 724, y: 80, width: 300, height: 200 });
    await drag(h.grip(), [800, 90], [900, 90]);
    expect(h.moveFloat).not.toHaveBeenCalled();
    expect(queued.size).toBe(1);
    await runOut();
    expect(h.left()).toBe(724);
  });
});
describe("interrupting a return", () => {
  it("stops on a new press and picks the panel up where it is drawn", async () => {
    const h = mounted();
    await drag(h.grip(), [150, 90], [150 + 744, 90]);
    await frame();
    await frame();
    const drawn = h.left();
    expect(drawn).toBeGreaterThan(724);
    await fireEvent.pointerDown(h.grip(), { clientX: 800, clientY: 90, pointerId: 8, button: 0 });
    expect(queued.size).toBe(0);
    await fireEvent.pointerMove(window, { pointerId: 8, clientX: 800, clientY: 90 });
    expect(h.left()).toBeCloseTo(drawn, 6);
    // Released in place, outside the viewport: no second move, and the spring resumes.
    await fireEvent.pointerUp(window, { pointerId: 8, clientX: 800, clientY: 90 });
    expect(h.moveFloat).toHaveBeenCalledTimes(1);
    await runOut();
    expect(h.left()).toBe(724);
  });
  it("ends at the target when the frames stall", async () => {
    const h = mounted();
    await drag(h.grip(), [150, 90], [150 + 744, 90]);
    await frame(300);
    expect(queued.size).toBe(0);
    expect(h.left()).toBe(724);
  });
  it("ends at the target at the deadline even while still moving", async () => {
    const h = mounted();
    await drag(h.grip(), [150, 90], [150 + 744, 90]);
    // Each 200 ms frame advances the spring by the 64 ms frame cap, so it is still moving at 900 ms.
    for (let elapsed = 0; elapsed < 800; elapsed += 200) await frame(200);
    expect(queued.size).toBe(1);
    await frame(200);
    expect(queued.size).toBe(0);
    expect(h.left()).toBe(724);
  });
  it("yields to an undo: the panel draws at the restored record at once", async () => {
    const h = mounted();
    await drag(h.grip(), [150, 90], [150 + 744, 90]);
    await frame();
    await act(() => {
      h.controller.undo();
      h.redraw();
    });
    await frame();
    expect(queued.size).toBe(0);
    expect(h.left()).toBe(100);
  });
  it("picks the panel up where it is drawn on a corner press, and a release in place resumes the return", async () => {
    const h = mounted({ x: 0, y: 80, width: 300, height: 200 });
    await drag(h.grip(), [150, 90], [150 - 400, 90]);
    await frame();
    const drawn = h.left();
    expect(drawn).toBeLessThan(0);
    await fireEvent.pointerDown(h.corner(), {
      clientX: 250,
      clientY: 275,
      pointerId: 8,
      button: 0,
    });
    expect(queued.size).toBe(0);
    expect(h.left()).toBe(drawn);
    await fireEvent.pointerMove(window, { pointerId: 8, clientX: 250, clientY: 275 });
    expect(h.left()).toBe(drawn);
    await fireEvent.pointerUp(window, { pointerId: 8, clientX: 250, clientY: 275 });
    expect(h.left()).toBe(drawn);
    expect(h.resizeFloat).not.toHaveBeenCalled();
    await runOut();
    expect(h.left()).toBe(0);
  });
  it("resizes a panel caught during a return from where it is drawn, then springs it inside", async () => {
    const h = mounted({ x: 0, y: 80, width: 300, height: 200 });
    await drag(h.grip(), [150, 90], [150 - 400, 90]);
    await frame();
    const drawn = h.left();
    await fireEvent.pointerDown(h.corner(), {
      clientX: 250,
      clientY: 275,
      pointerId: 8,
      button: 0,
    });
    await fireEvent.pointerMove(window, { pointerId: 8, clientX: 270, clientY: 295 });
    // The origin stays where it was drawn; only the size follows the corner.
    expect(h.left()).toBe(drawn);
    await fireEvent.pointerUp(window, { pointerId: 8, clientX: 270, clientY: 295 });
    expect(h.resizeFloat).toHaveBeenCalledWith(h.paneId, { x: 0, y: 80, width: 320, height: 220 });
    expect(h.left()).toBe(drawn);
    await runOut();
    expect(h.left()).toBe(0);
  });
  it("yields when its panel closes", async () => {
    const h = mounted();
    await drag(h.grip(), [150, 90], [150 + 744, 90]);
    await act(() => {
      h.controller.closeTab(h.tabId);
      h.redraw();
    });
    await frame();
    expect(queued.size).toBe(0);
  });
  it("ends at its target when another panel is pressed", async () => {
    const h = mounted();
    const other = h.controller.floatTab(
      h.controller.openContent({
        contentId: "dsh-resource://file/session/s/b.txt",
        title: "b.txt",
        kind: "file",
      }),
      { x: 100, y: 400, width: 300, height: 200 },
    );
    await act(() => {
      h.redraw();
    });
    await drag(h.grip(), [150, 90], [150 + 744, 90]);
    await frame();
    expect(h.left()).toBeGreaterThan(724);
    const otherGrip = h.view.container.querySelector<HTMLElement>(
      `[data-dockkit-float="${other}"] [data-dockkit-float-grip]`,
    ) as HTMLElement;
    await fireEvent.pointerDown(otherGrip, { clientX: 150, clientY: 410, pointerId: 8, button: 0 });
    expect(queued.size).toBe(0);
    expect(h.left()).toBe(724);
    await fireEvent.pointerUp(window, { pointerId: 8, clientX: 150, clientY: 410 });
  });
  it("cancels its frame when the layer unmounts", async () => {
    const h = mounted();
    await drag(h.grip(), [150, 90], [150 + 744, 90]);
    expect(queued.size).toBe(1);
    h.view.unmount();
    expect(queued.size).toBe(0);
  });
});
describe("reduced motion", () => {
  it("clamps at the edge with no resistance and never schedules a frame", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
    }));
    const h = mounted();
    await drag(h.grip(), [150, 90], [150 + 744, 90], false);
    expect(h.left()).toBe(724);
    await fireEvent.pointerUp(window, { pointerId: 7, clientX: 894, clientY: 90 });
    expect(h.moveFloat).toHaveBeenCalledWith(h.paneId, 724, 80);
    expect(queued.size).toBe(0);
  });
  it("draws a resize at its legal rectangle, so a viewport that shrank past its origin animates nothing", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
    }));
    const h = mounted({ x: 700, y: 80, width: 300, height: 200 });
    await fireEvent.pointerDown(h.corner(), {
      clientX: 1000,
      clientY: 280,
      pointerId: 7,
      button: 0,
    });
    viewport(500, 768);
    await act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await fireEvent.pointerMove(window, { pointerId: 7, clientX: 990, clientY: 280 });
    expect(h.left()).toBe(280);
    await fireEvent.pointerUp(window, { pointerId: 7, clientX: 990, clientY: 280 });
    expect(h.resizeFloat).toHaveBeenCalledWith(h.paneId, {
      x: 280,
      y: 80,
      width: 220,
      height: 200,
    });
    expect(queued.size).toBe(0);
  });
  it("keeps the resistance when the platform states no preference", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const h = mounted();
    await drag(h.grip(), [150, 90], [150 + 744, 90], false);
    expect(h.left()).toBeCloseTo(784);
  });
});
describe("the viewport projection", () => {
  it("pushes a panel in when the window shrinks and returns it when the window grows, recording nothing", async () => {
    const h = mounted();
    viewport(350, 768);
    await act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(h.left()).toBe(50);
    viewport(1024, 768);
    await act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(h.left()).toBe(100);
    expect(h.moveFloat).not.toHaveBeenCalled();
    expect(h.focusPane).not.toHaveBeenCalled();
  });
  it("ends a running return at its recorded rectangle when the window resizes", async () => {
    const h = mounted();
    await drag(h.grip(), [150, 90], [150 + 744, 90]);
    await frame();
    await act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(queued.size).toBe(0);
    expect(h.left()).toBe(724);
  });
  it("treats a click on a projected panel as a raise, keeping its record for a larger window", async () => {
    const h = mounted();
    viewport(350, 768);
    await act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(h.left()).toBe(50);
    await drag(h.grip(), [100, 90], [100, 90]);
    await drag(h.corner(), [340, 270], [340, 270]);
    expect(h.moveFloat).not.toHaveBeenCalled();
    expect(h.resizeFloat).not.toHaveBeenCalled();
    viewport(1024, 768);
    await act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(h.left()).toBe(100);
  });
  it("bounds a gesture by the viewport the window resized to mid-gesture", async () => {
    const h = mounted();
    await fireEvent.pointerDown(h.corner(), {
      clientX: 400,
      clientY: 280,
      pointerId: 7,
      button: 0,
    });
    await fireEvent.pointerMove(window, { pointerId: 7, clientX: 800, clientY: 280 });
    viewport(500, 768);
    await act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await fireEvent.pointerUp(window, { pointerId: 7, clientX: 800, clientY: 280 });
    expect(h.resizeFloat).toHaveBeenCalledWith(h.paneId, {
      x: 100,
      y: 80,
      width: 400,
      height: 200,
    });
  });
  it("keeps a resize origin inside a viewport that shrank past it mid-gesture", async () => {
    const h = mounted({ x: 700, y: 80, width: 300, height: 200 });
    await fireEvent.pointerDown(h.corner(), {
      clientX: 1000,
      clientY: 280,
      pointerId: 7,
      button: 0,
    });
    await fireEvent.pointerMove(window, { pointerId: 7, clientX: 990, clientY: 280 });
    viewport(500, 768);
    await act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await fireEvent.pointerUp(window, { pointerId: 7, clientX: 990, clientY: 280 });
    expect(h.resizeFloat).toHaveBeenCalledWith(h.paneId, {
      x: 280,
      y: 80,
      width: 220,
      height: 200,
    });
  });
  it("keeps the 20px floor on a Windows root that publishes no caption height", () => {
    document.documentElement.setAttribute("data-windows-titlebar", "");
    onTestFinished(() => {
      document.documentElement.removeAttribute("data-windows-titlebar");
    });
    const h = mounted({ x: 100, y: 0, width: 300, height: 200 });
    expect(h.top()).toBe(20);
  });
  it("draws a stored rectangle from outside the viewport inside it", () => {
    const h = mounted({ x: 2000, y: 900, width: 300, height: 200 });
    expect(h.left()).toBe(724);
    expect(h.top()).toBe(568);
  });
});
