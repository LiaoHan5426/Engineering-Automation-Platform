import {
  h,
  Fragment,
  defineComponent,
  watchEffect,
  nextTick,
  onUpdated,
  shallowRef,
  onMounted,
} from "vue";
import { fireEvent as dispatchDom, within } from "@testing-library/dom";
// @vitest-environment jsdom
/** Chat scroll composition over the real viewport, reading owner, and fold lifecycle. */
import {
  act,
  cleanup,
  render as mountNative,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMotionHidden, type FlowMotionRows } from "../src/client/chat/flow-motion.ts";
import { useChatScroll, type ChatScrollInput } from "../src/client/chat/use-chat-scroll.ts";
import { presentationPolicyFor } from "../src/client/presentation-policy.ts";
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(async () => {
  try {
    cleanup();
    await Promise.resolve();

    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
const CommitFoldRow = defineComponent(
  (props: { hidden: boolean; motion: FlowMotionRows }) => {
    const row = shallowRef<HTMLDivElement | null>(null);
    useMotionHidden(row, () => props.hidden, props.motion);
    onMounted(() => {
      if (row.value === null) throw new Error("Missing descendant fold row");
      Object.defineProperty(row.value, "offsetHeight", {
        get: () => {
          const element = row.value;
          if (element === null || element.hidden) return 0;
          // The row keeps its painted height during the delayed CSS close, before the batch takes it.
          return element.style.transition === "none" && element.style.height
            ? Number.parseFloat(element.style.height)
            : 80;
        },
      });
    });
    return () => h("div", { ref: row, "data-commit-fold-row": "" }, "Previous process");
  },
  { props: ["hidden", "motion"] },
);
const ScrollHarness = defineComponent(
  (props: {
    afterCommit?: () => void;
    descendantFold?: boolean;
    input: ChatScrollInput;
    onMotion: (motion: FlowMotionRows) => void;
  }) => {
    const state = useChatScroll(() => props.input);
    onUpdated(() => {
      props.afterCommit?.();
    });
    watchEffect(() => {
      props.onMotion(state.motion);
    });
    return () =>
      h(Fragment, null, [
        h(
          "div",
          {
            ref: state.listRef,
            "data-testid": "scrollport",
            "data-initialized": state.initialized.value,
            "data-following-tail": state.followingTail.value,
          },
          [
            h(
              "div",
              {
                ref: state.columnRef,
                "data-testid": "column",
                "data-chat-flow": "",
                ...(props.descendantFold ? { "data-chat-motion": "" } : {}),
              },
              props.descendantFold
                ? [
                    h(CommitFoldRow, {
                      hidden:
                        props.input.lastKey !== null ||
                        presentationPolicyFor(props.input.transcriptView).foldCompletedTurns,
                      motion: state.motion,
                    }),
                  ]
                : [],
            ),
            h("div", { "data-chat-turn-spacer": "" }),
          ],
        ),
        h("button", { type: "button", onClick: state.returnToBottom }, ["Return to bottom"]),
      ]);
  },
  { props: ["input", "onMotion", "afterCommit", "descendantFold"] },
);
async function mountScroll(
  deferCompletedTurns = true,
  initial: Partial<ChatScrollInput> = {},
  descendantFold = false,
) {
  let input: ChatScrollInput = {
    isOpen: true,
    order: [],
    firstSeq: null,
    lastKey: null,
    lastIsUser: false,
    steeringId: null,
    submissionId: null,
    submissionSteers: false,
    running: false,
    deferCompletedTurns,
    transcriptView: "verbose",
    loadedTurns: [],
    hasMore: false,
    loadingOlder: false,
    historyLoadStatus: "idle",
    consumeOlder: vi.fn(() => false),
    loadOlder: vi.fn(),
    loadThrough: vi.fn(async () => {}),
    chatScroll: { read: () => null, save: vi.fn() },
    ...initial,
  };
  const callbacks: {
    motion?: FlowMotionRows;
    resize?: () => void;
  } = {};
  class Observer implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      callbacks.resize = () => {
        callback([], this);
      };
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {
      delete callbacks.resize;
    }
  }
  vi.stubGlobal("ResizeObserver", Observer);
  const onMotion = (motion: FlowMotionRows): void => {
    callbacks.motion = motion;
  };
  const view = await render(h(ScrollHarness, { input: input, onMotion: onMotion, descendantFold }));
  const scroller = within(view.container).getByTestId("scrollport");
  const spacer = scroller.querySelector<HTMLElement>("[data-chat-turn-spacer]");
  if (spacer === null) throw new Error("Missing fold spacer");
  let height = 1000;
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    if (options.behavior === "instant") scroller.scrollTop = options.top ?? scroller.scrollTop;
  });
  Object.defineProperties(scroller, {
    clientHeight: { value: 400 },
    scrollHeight: {
      get: () => {
        const foldingRow = scroller.querySelector<HTMLDivElement>("[data-commit-fold-row]");
        const removed = foldingRow === null ? 0 : 80 - foldingRow.offsetHeight;
        return height - removed + (Number.parseFloat(spacer.style.height) || 0);
      },
    },
    scrollTo: { value: scrollTo },
  });
  const row = document.createElement("div");
  Object.defineProperty(row, "offsetHeight", { value: 80 });
  within(view.container).getByTestId("column").append(row);
  return {
    view,
    scroller,
    scrollTo,
    row,
    resize: async () => {
      await act(async () => {
        await callbacks.resize?.();
      });
    },
    grow: (next: number) => {
      height = next;
    },
    update: async (patch: Partial<ChatScrollInput>, afterCommit?: () => void) => {
      input = { ...input, ...patch };
      await view.rerender(
        h(ScrollHarness, {
          input: input,
          onMotion: onMotion,
          descendantFold,
          ...(afterCommit === undefined ? {} : { afterCommit }),
        }),
      );
    },
    startFold: async () => {
      const motion = callbacks.motion;
      if (motion === undefined) throw new Error("Viewport motion callbacks are not bound");
      await act(() => {
        motion.collapse(row, () => {
          row.hidden = true;
        });
      });
    },
    /** Run the fold's frame clock to its end (a row outside a batch finishes on its transition). */
    finishFold: async () => {
      const event = new Event("transitionend", { bubbles: true });
      Object.defineProperty(event, "propertyName", { value: "height" });
      await act(() => {
        row.dispatchEvent(event);
        vi.advanceTimersByTime(200);
      });
    },
  };
}
/** A scrollport of stacked rows whose boxes follow scrollTop; closing a row clamps like a browser. */
async function mountRows(heights: readonly number[]) {
  const callbacks: {
    motion?: FlowMotionRows;
    resize?: () => void;
  } = {};
  class Observer implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      callbacks.resize = () => {
        callback([], this);
      };
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {
      delete callbacks.resize;
    }
  }
  vi.stubGlobal("ResizeObserver", Observer);
  const input: ChatScrollInput = {
    isOpen: true,
    order: [],
    firstSeq: null,
    lastKey: null,
    lastIsUser: false,
    steeringId: null,
    submissionId: null,
    submissionSteers: false,
    running: false,
    deferCompletedTurns: false,
    transcriptView: "standard",
    loadedTurns: [],
    hasMore: false,
    loadingOlder: false,
    historyLoadStatus: "idle",
    consumeOlder: vi.fn(() => false),
    loadOlder: vi.fn(),
    loadThrough: vi.fn(async () => {}),
    chatScroll: { read: () => null, save: vi.fn() },
  };
  const view = await render(
    h(ScrollHarness, {
      input: input,
      onMotion: (motion) => {
        callbacks.motion = motion;
      },
    }),
  );
  const scroller = within(view.container).getByTestId("scrollport");
  const column = within(view.container).getByTestId("column");
  const spacer = scroller.querySelector<HTMLElement>("[data-chat-turn-spacer]")!;
  const sizes = new Map<HTMLElement, number>();
  const rows = heights.map((height) => {
    const row = document.createElement("div");
    sizes.set(row, height);
    column.append(row);
    return row;
  });
  const sizeOf = (row: HTMLElement): number => (row.hidden ? 0 : (sizes.get(row) ?? 0));
  const docTop = (row: HTMLElement): number => {
    let top = 0;
    for (const each of rows) {
      if (each === row) return top;
      top += sizeOf(each);
    }
    return top;
  };
  const content = (): number => rows.reduce((sum, row) => sum + sizeOf(row), 0);
  const room = (): number => Number.parseFloat(spacer.style.height) || 0;
  const floor = (): number => Math.max(0, content() + room() - 400);
  let top = 0;
  Object.defineProperties(scroller, {
    clientHeight: { value: 400 },
    scrollHeight: { get: () => content() + room() },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, Math.min(value, floor()));
      },
    },
    scrollTo: {
      value: (options: ScrollToOptions) => {
        top = Math.max(0, Math.min(options.top ?? top, floor()));
      },
    },
    getBoundingClientRect: { value: () => ({ top: 0, bottom: 400, height: 400 }) },
  });
  Object.defineProperty(column, "offsetHeight", { get: content });
  for (const row of rows) {
    Object.defineProperty(row, "getBoundingClientRect", {
      value: () => {
        const rowTop = docTop(row) - top;
        return { top: rowTop, bottom: rowTop + sizeOf(row), height: sizeOf(row) };
      },
    });
  }
  const resize = async () => {
    await act(async () => {
      await callbacks.resize?.();
    });
  };
  await resize();
  const row = (index: number): HTMLElement => {
    const found = rows[index];
    if (found === undefined) throw new Error(`no row ${String(index)}`);
    return found;
  };
  return {
    scroller,
    row,
    room,
    resize,
    top: () => top,
    screenTop: (row: HTMLElement) => docTop(row) - top,
    grow: (row: HTMLElement, by: number) => {
      sizes.set(row, (sizes.get(row) ?? 0) + by);
    },
    /** Close rows at once, as completion-time folding does, then let layout clamp and observe. */
    close: async (...closing: HTMLElement[]) => {
      await act(async () => {
        for (const row of closing)
          callbacks.motion?.hideNow?.(row, () => {
            row.hidden = true;
          });
        top = Math.min(top, floor());
        await callbacks.resize?.();
      });
    },
    /** Close one row while the same commit grows another, as a Turn's duration control does. */
    closeGrowing: async (closing: HTMLElement, grown: HTMLElement, by: number) => {
      await act(async () => {
        callbacks.motion?.hideNow?.(closing, () => {
          closing.hidden = true;
        });
        sizes.set(grown, (sizes.get(grown) ?? 0) + by);
        top = Math.min(top, floor());
        await callbacks.resize?.();
      });
    },
  };
}
describe("Chat scroll: a closing shrink keeps the content above still", () => {
  it("keeps the first visible row still and fills the gap below with room", async () => {
    const h = await mountRows([700, 100, 200]);

    expect(h.top()).toBe(600);
    const [first, step, answer] = [h.row(0), h.row(1), h.row(2)];
    await h.close(step);

    expect(h.screenTop(first)).toBe(-600);

    expect(h.screenTop(answer)).toBe(100);

    expect(h.room()).toBe(100);
  });
  it("moves nothing on screen when the closing rows are above the scrollport", async () => {
    const h = await mountRows([200, 300, 500]);
    const [above, visible] = [h.row(0), h.row(2)];
    await h.close(above);

    expect(h.screenTop(visible)).toBe(-100);

    expect(h.room()).toBe(0);
  });
  it("keeps the row that followed a closed first row on screen still", async () => {
    const h = await mountRows([500, 600, 100]);
    const [steps, answer] = [h.row(1), h.row(2)];
    await h.close(steps);

    expect(h.screenTop(answer)).toBe(300);

    expect(h.room()).toBe(0);
  });
  it("keeps the nearest surviving row above when no row followed a closed first row on screen", async () => {
    const h = await mountRows([500, 900]);
    const [earlier, steps] = [h.row(0), h.row(1)];
    await h.close(steps);

    // The earlier row would need more room than half the scrollport; the content end stops at the middle.
    expect(h.screenTop(earlier)).toBe(-300);

    expect(h.room()).toBe(200);
  });
  it("lets later growth take the room before following scrolls", async () => {
    const h = await mountRows([700, 100, 200]);
    const [step, answer] = [h.row(1), h.row(2)];
    await h.close(step);
    h.grow(answer, 60);
    await h.resize();

    expect(h.room()).toBe(40);

    expect(h.top()).toBe(600);
  });
  it("leaves a reader away from the tail to the browser", async () => {
    const h = await mountRows([700, 100, 200]);
    const step = h.row(1);
    await fireEvent.wheel(h.scroller);
    h.scroller.scrollTop = 100;
    await fireEvent.scroll(h.scroller);
    await act(() => {
      vi.advanceTimersByTime(500);
    });
    await h.close(step);

    expect(h.room()).toBe(0);
  });
  it("uses the measurement only for the observation of the commit that closed the rows", async () => {
    const h = await mountRows([700, 100, 200]);
    const [step, answer] = [h.row(1), h.row(2)];
    // Growth in the same commit outweighs the closed row, so nothing shrinks to compensate.
    await h.closeGrowing(step, answer, 100);

    expect(h.room()).toBe(0);
    // A later shrink follows the tail like any other; the stale measurement does not pull the reader.
    h.grow(answer, -150);
    await h.resize();

    expect(h.room()).toBe(0);

    expect(h.top()).toBe(450);
  });
});
const visibleFoldCases = [
  {
    name: "E/E",
    earlier: 2400,
    steps: 1000,
    body: 400,
    viewport: 800,
    top: 800,
    input: 80,
    target: 2080,
    room: 0,
  },
  {
    name: "E/T",
    earlier: 600,
    steps: 1000,
    body: 100,
    viewport: 800,
    top: 200,
    input: 80,
    target: 200,
    room: 220,
  },
  {
    name: "E/B",
    earlier: 500,
    steps: 200,
    body: 400,
    viewport: 800,
    top: 200,
    input: 80,
    target: 200,
    room: 20,
  },
  {
    name: "T/T",
    earlier: 500,
    steps: 2000,
    body: 100,
    viewport: 800,
    top: 900,
    input: 80,
    target: 500,
    room: 620,
  },
  {
    name: "T/B",
    earlier: 500,
    steps: 1200,
    body: 400,
    viewport: 800,
    top: 1200,
    input: 80,
    target: 500,
    room: 320,
  },
  {
    name: "B/B",
    earlier: 2400,
    steps: 1600,
    body: 1000,
    viewport: 800,
    top: 4200,
    input: 80,
    target: 2680,
    room: 0,
  },
  {
    name: "short content",
    earlier: 100,
    steps: 300,
    body: 100,
    viewport: 800,
    top: 0,
    input: 80,
    target: 0,
    room: 0,
  },
  {
    name: "larger input",
    earlier: 2000,
    steps: 300,
    body: 600,
    viewport: 800,
    top: 2100,
    input: 400,
    target: 2200,
    room: 0,
  },
  {
    name: "body fills viewport",
    earlier: 900,
    steps: 300,
    body: 800,
    viewport: 800,
    top: 1200,
    input: 40,
    target: 940,
    room: 0,
  },
  {
    name: "steps fill viewport",
    earlier: 900,
    steps: 800,
    body: 0,
    viewport: 800,
    top: 900,
    input: 0,
    target: 900,
    room: 800,
  },
  {
    name: "input fills visible steps",
    earlier: 900,
    steps: 300,
    body: 500,
    viewport: 800,
    top: 900,
    input: 300,
    target: 900,
    room: 0,
  },
  {
    name: "no steps",
    earlier: 900,
    steps: 0,
    body: 500,
    viewport: 800,
    top: 600,
    input: 40,
    target: 640,
    room: 0,
  },
  {
    name: "input taller than viewport",
    earlier: 900,
    steps: 1200,
    body: 100,
    viewport: 800,
    top: 1400,
    input: 1200,
    target: 1400,
    room: 0,
  },
  {
    name: "small viewport",
    earlier: 200,
    steps: 900,
    body: 100,
    viewport: 300,
    top: 900,
    input: 30,
    target: 200,
    room: 170,
  },
] as const;
async function mountVisibleFold(
  test: (typeof visibleFoldCases)[number],
  reduced: boolean,
  finalSiblingGrowth = 0,
) {
  let inputHeight = 0;
  let submission = 0;
  let top: number = test.top;
  let motion: FlowMotionRows | undefined;
  const onMotion = (value: FlowMotionRows): void => {
    motion = value;
  };
  let input: ChatScrollInput = {
    isOpen: false,
    order: [],
    firstSeq: null,
    lastKey: null,
    lastIsUser: false,
    steeringId: null,
    submissionId: null,
    submissionSteers: false,
    running: false,
    deferCompletedTurns: true,
    transcriptView: "detailed",
    loadedTurns: [],
    hasMore: false,
    loadingOlder: false,
    historyLoadStatus: "idle",
    consumeOlder: vi.fn(() => false),
    loadOlder: vi.fn(),
    loadThrough: vi.fn(async () => {}),
    chatScroll: { read: () => null, save: vi.fn() },
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reduced })),
  );
  const view = await render(h(ScrollHarness, { input: input, onMotion: onMotion }));
  const scroller = within(view.container).getByTestId("scrollport");
  const column = within(view.container).getByTestId("column");
  const spacer = scroller.querySelector<HTMLElement>("[data-chat-turn-spacer]")!;
  const row = document.createElement("div");
  const glyph = document.createElement("span");
  glyph.textContent = "step text";
  row.append(glyph);
  column.append(row);
  const rowHeight = () =>
    row.hidden
      ? 0
      : (row.style.transition !== "" && row.style.transition !== "none") || row.style.height === ""
        ? test.steps
        : Number.parseFloat(row.style.height);
  const room = () => Number.parseFloat(spacer.style.height) || 0;
  const contentHeight = () =>
    test.earlier + rowHeight() + test.body + inputHeight + (row.hidden ? finalSiblingGrowth : 0);
  const floor = () => Math.max(0, contentHeight() + room() - test.viewport);
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    scroller.scrollTop = options.top ?? scroller.scrollTop;
  });
  Object.defineProperties(scroller, {
    clientHeight: { get: () => test.viewport },
    scrollHeight: { get: () => Math.max(test.viewport, contentHeight() + room()) },
    scrollTop: {
      get: () => {
        top = Math.max(0, Math.min(top, floor()));
        return top;
      },
      set: (value: number) => {
        top = Math.max(0, Math.min(value, floor()));
      },
    },
    scrollTo: { value: scrollTo },
    getBoundingClientRect: {
      value: () => ({ top: 0, bottom: test.viewport, height: test.viewport }),
    },
  });
  Object.defineProperties(row, {
    offsetHeight: { get: rowHeight },
    getBoundingClientRect: {
      value: () => ({
        top: test.earlier - top,
        bottom: test.earlier - top + rowHeight(),
        height: rowHeight(),
      }),
    },
  });
  Object.defineProperties(column, {
    offsetHeight: { get: contentHeight },
    getBoundingClientRect: {
      value: () => ({ top: -top, bottom: contentHeight() - top, height: contentHeight() }),
    },
  });
  input = { ...input, isOpen: true };
  await view.rerender(h(ScrollHarness, { input: input, onMotion: onMotion }));
  top = test.top;
  scrollTo.mockClear();
  return {
    scroller,
    row,
    room,
    scrollTo,
    async reopenAll(verbose = false) {
      await act(() => {
        motion?.cancelMotion(row);
      });
      row.hidden = false;
      if (verbose) {
        input = { ...input, transcriptView: "verbose" };
        await view.rerender(h(ScrollHarness, { input: input, onMotion: onMotion }));
      }
    },
    async growDuringFold(height: number, newSubmission: boolean) {
      inputHeight += height;
      input = newSubmission
        ? { ...input, submissionId: "second-distinct-input" }
        : { ...input, order: ["new-stream-content"], running: true };
      await view.rerender(h(ScrollHarness, { input: input, onMotion: onMotion }));
    },
    async cancelReading() {
      await fireEvent.wheel(scroller, { deltaY: -20 });
      scroller.scrollTop -= 20;
      await fireEvent.scroll(scroller);
      return scroller.scrollTop;
    },
    async updateInput() {
      input = { ...input, submissionId: null, lastKey: "durable-input", lastIsUser: true };
      await view.rerender(h(ScrollHarness, { input: input, onMotion: onMotion }));
    },
    bodyTop: () => test.earlier + rowHeight() - top,
    async submit() {
      inputHeight += test.input;
      row.hidden = false;
      submission++;
      await act(() => {
        motion?.collapse(row, () => {
          row.hidden = true;
        });
      });
      input = { ...input, submissionId: `visible-fold-input-${submission}` };
      await view.rerender(h(ScrollHarness, { input: input, onMotion: onMotion }));
    },
  };
}
describe.each([false, true])("visible input-fold matrix (reduced=%s)", (reduced) => {
  it.each(["larger input", "T/B"])(
    "lands on final sibling spacing in the closing frame (%s)",
    async (name) => {
      const test = visibleFoldCases.find((test) => test.name === name)!;
      const h = await mountVisibleFold(test, reduced, 4);
      h.submit();
      await act(async () => {
        await Promise.resolve();
      });
      for (let frame = 0; frame < 24 && !h.row.hidden; frame++) {
        await act(() => {
          vi.advanceTimersByTime(16);
        });
      }

      expect(h.row.hidden).toBe(true);
      const target = test.target + (test.room === 0 ? 4 : 0);

      expect(h.scroller.scrollTop).toBe(target);

      expect(h.room()).toBe(Math.max(0, test.room - 4));
      await act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(h.scroller.scrollTop).toBe(target);
    },
  );
  it.each(visibleFoldCases)("$name lands with only the required visible room", async (test) => {
    const h = await mountVisibleFold(test, reduced);
    const positions = [h.bodyTop()];
    h.submit();
    await act(async () => {
      await Promise.resolve();
    });
    for (let frame = 0; frame < 24; frame++) {
      await act(() => {
        vi.advanceTimersByTime(16);
      });
      positions.push(h.bodyTop());
    }

    expect(h.scroller.scrollTop).toBeCloseTo(test.target, 5);

    expect(h.room()).toBeCloseTo(test.room, 5);
    if (test.steps > 0)
      expect(h.scrollTo.mock.calls.some(([options]) => options.behavior === "smooth")).toBe(false);
    for (let i = 1; i < positions.length; i++)
      expect(positions[i]!).toBeLessThanOrEqual(positions[i - 1]! + 0.01);
    const end = h.bodyTop();
    await act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(h.bodyTop()).toBe(end);
  });
});
it("consumes a prior legal fold deficit instead of accumulating whole steps on the next input", async () => {
  const test = visibleFoldCases.find((test) => test.name === "T/B")!;
  const h = await mountVisibleFold(test, false);
  h.submit();
  await act(async () => {
    await Promise.resolve();
  });
  await act(() => {
    vi.advanceTimersByTime(400);
  });

  expect(h.room()).toBe(320);
  h.submit();
  await act(async () => {
    await Promise.resolve();
  });
  await act(() => {
    vi.advanceTimersByTime(400);
  });

  expect(h.scroller.scrollTop).toBe(500);

  expect(h.room()).toBe(240);

  expect(h.scrollTo).not.toHaveBeenCalled();
});
it("retains the reader position without clamping after an input fold is interrupted", async () => {
  const test = visibleFoldCases.find((test) => test.name === "B/B")!;
  const h = await mountVisibleFold(test, false);
  h.submit();
  await act(async () => {
    await Promise.resolve();
  });
  await act(() => {
    vi.advanceTimersByTime(112);
  });
  const readingTop = await h.cancelReading();
  await act(() => {
    vi.advanceTimersByTime(400);
  });

  expect(h.scroller.scrollTop).toBe(readingTop);

  expect(h.scrollTo.mock.calls.some(([options]) => options.behavior === "smooth")).toBe(false);
});
it.each([false, true])(
  "stops obsolete viewport writes when every closing row reopens (verbose=%s)",
  async (verbose) => {
    const test = visibleFoldCases.find((test) => test.name === "T/B")!;
    const h = await mountVisibleFold(test, false);
    h.submit();
    await act(async () => {
      await Promise.resolve();
    });
    await act(() => {
      vi.advanceTimersByTime(112);
    });
    h.reopenAll(verbose);
    await act(async () => {
      await Promise.resolve();
    });
    const position = h.scroller.scrollTop;
    await act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(h.room()).toBe(0);

    expect(h.scroller.scrollTop).toBe(position);

    expect(h.row.hidden).toBe(false);

    expect(h.row.style.height).toBe("");

    expect(h.scroller.querySelector("[data-input-fold]")).toBeNull();

    expect(h.scrollTo.mock.calls.some(([options]) => options.behavior === "smooth")).toBe(false);
  },
);
it.each([false, true])(
  "absorbs new height before the active fold finishes (new submission=%s)",
  async (newSubmission) => {
    const test = visibleFoldCases.find((test) => test.name === "B/B")!;
    const h = await mountVisibleFold(test, false);
    h.submit();
    await act(async () => {
      await Promise.resolve();
    });
    await act(() => {
      vi.advanceTimersByTime(112);
    });
    h.growDuringFold(320, newSubmission);
    await act(async () => {
      await Promise.resolve();
    });
    const positions = [h.bodyTop()];
    for (let frame = 0; frame < 12; frame++) {
      await act(() => {
        vi.advanceTimersByTime(16);
      });
      positions.push(h.bodyTop());
    }

    expect(h.scroller.scrollTop).toBe(test.target + 320);

    expect(h.room()).toBe(0);
    for (let i = 1; i < positions.length; i++)
      expect(positions[i]!).toBeLessThanOrEqual(positions[i - 1]! + 0.01);
    const settled = h.scroller.scrollTop;
    await act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(h.scroller.scrollTop).toBe(settled);

    expect(h.scrollTo.mock.calls.some(([options]) => options.behavior === "smooth")).toBe(false);
  },
);
it("keeps one active fold when the local echo becomes its durable input", async () => {
  const test = visibleFoldCases.find((test) => test.name === "B/B")!;
  const h = await mountVisibleFold(test, false);
  h.submit();
  await act(async () => {
    await Promise.resolve();
  });
  await act(() => {
    vi.advanceTimersByTime(96);
  });
  const halfway = h.bodyTop();
  h.updateInput();
  await act(async () => {
    await Promise.resolve();
  });
  await act(() => {
    vi.advanceTimersByTime(400);
  });

  expect(h.scroller.scrollTop).toBe(test.target);

  expect(h.room()).toBe(0);

  expect(h.bodyTop()).toBeLessThanOrEqual(halfway);

  expect(h.scrollTo.mock.calls.some(([options]) => options.behavior === "smooth")).toBe(false);
});
describe("Chat scroll collapse timing", () => {
  it.each(["resize", "scroll", "history", "input", "preference"] as const)(
    "waits for initial history before initializing a running view after %s",
    async (change) => {
      const h = await mountScroll(true, { isOpen: false, running: true });

      expect(h.scroller.dataset.initialized).toBe("false");
      if (change === "resize") await h.resize();
      else if (change === "scroll") await fireEvent.scroll(h.scroller);
      else if (change === "history") await h.update({ order: ["history"], lastKey: "history" });
      else if (change === "input") await h.update({ submissionId: "pending-input" });
      else await h.update({ transcriptView: "standard" });

      expect(h.scroller.dataset.initialized).toBe("false");

      expect(h.scroller.scrollTop).toBe(0);

      expect(h.scrollTo).not.toHaveBeenCalled();
      await h.update({ isOpen: true });

      expect(h.scroller.dataset.initialized).toBe("true");

      expect(h.scroller.scrollTop).toBe(600);

      expect(h.scrollTo).not.toHaveBeenCalled();
      h.grow(1200);
      await h.resize();

      expect(h.scroller.scrollTop).toBe(800);
    },
  );
  it("does not defer one viewport's submitted input behind another viewport's fold", async () => {
    const first = await mountScroll();
    const second = await mountScroll();
    await first.startFold();
    await second.update({ submissionId: "second-view-input" });

    expect(second.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 600, behavior: "smooth" });

    expect(second.scroller.style.overflowAnchor).toBe("");
    await first.finishFold();

    expect(second.scrollTo).toHaveBeenCalledTimes(1);

    expect(first.scrollTo).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "follows submitted input with deferCompletedTurns=%s",
    async (deferred) => {
      const h = await mountScroll(deferred);
      await h.update({ submissionId: "first" });
      if (deferred) {
        expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 600, behavior: "smooth" });

        expect(h.scroller.scrollTop).toBe(0);
      } else {
        expect(h.scrollTo).not.toHaveBeenCalled();

        expect(h.scroller.scrollTop).toBe(600);
      }
    },
  );
  it.each([
    ["a local steering echo", { submissionId: "steer", submissionSteers: true }],
    ["a pending steering message", { steeringId: "inbox-steer" }],
  ] as const)("lands %s at once under either fold timing", async (_, change) => {
    for (const deferred of [false, true]) {
      const h = await mountScroll(deferred);
      await h.update(change);

      expect(h.scrollTo).not.toHaveBeenCalled();

      expect(h.scroller.scrollTop).toBe(600);
      h.view.unmount();
    }
  });
  it("coalesces submitted inputs into one frame-owned fold", async () => {
    const h = await mountScroll();
    await h.startFold();
    await h.update({ submissionId: "first" });
    await h.update({ submissionId: "second" });

    expect(h.scrollTo).not.toHaveBeenCalled();

    expect(h.scroller.scrollTop).toBe(0);
    await act(async () => {
      await Promise.resolve();
    });
    // The folded row leaves the committed layout; the landing reads the actual content height.
    h.grow(920);
    await act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(h.scrollTo).not.toHaveBeenCalled();

    expect(h.scroller.scrollTop).toBe(520);

    expect(h.scroller.style.overflowAnchor).toBe("");
  });
  it("keeps only the visible deficit when submitted input is smaller than the fold", async () => {
    const test = visibleFoldCases.find((test) => test.name === "T/B")!;
    const h = await mountVisibleFold(test, false);
    h.submit();
    await act(async () => {
      await Promise.resolve();
    });
    await act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(h.scroller.scrollTop).toBe(500);

    expect(h.room()).toBe(320);

    expect(h.scrollTo).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "clears mode-change bottom space after the fold (reader interrupts=%s)",
    async (interrupt) => {
      const h = await mountScroll();
      await h.resize();
      await h.startFold();
      await h.update({ transcriptView: "standard" });
      await act(async () => {
        await Promise.resolve();
      });
      const spacer = h.scroller.querySelector<HTMLElement>("[data-chat-turn-spacer]")!;

      expect(spacer.style.height).toBe("80px");
      h.grow(920);
      if (interrupt) {
        await fireEvent.wheel(h.scroller, { deltaY: -100 });
        h.scroller.scrollTop = 400;
        await fireEvent.scroll(h.scroller);
      }
      await h.finishFold();

      expect(spacer.style.height).toBe("");

      expect(h.scroller.scrollHeight).toBe(920);

      expect(h.scroller.scrollTop).toBe(interrupt ? 400 : 520);

      expect(h.row.hidden).toBe(true);
      await h.resize();

      expect(spacer.style.height).toBe("");
    },
  );
  it("clears a previous fold reservation on an idle mode change", async () => {
    const h = await mountScroll();
    await h.resize();
    await h.startFold();
    await act(async () => {
      await Promise.resolve();
    });
    h.grow(920);
    await h.finishFold();
    await h.resize();

    expect(h.scroller.querySelector<HTMLElement>("[data-chat-turn-spacer]")!.style.height).toBe(
      "80px",
    );
    await h.update({ transcriptView: "standard" });

    expect(h.scroller.querySelector<HTMLElement>("[data-chat-turn-spacer]")!.style.height).toBe("");

    expect(h.scroller.scrollTop).toBe(520);
  });
  it("keeps the latest mode reset when preferences change before a fold finishes", async () => {
    const h = await mountScroll();
    await h.resize();
    await h.startFold();
    await h.update({ transcriptView: "standard" });
    await act(async () => {
      await Promise.resolve();
    });
    await h.update({ transcriptView: "detailed" });
    h.grow(920);
    await h.finishFold();

    expect(h.scroller.querySelector<HTMLElement>("[data-chat-turn-spacer]")!.style.height).toBe("");

    expect(h.scroller.scrollTop).toBe(520);
  });
  it("combines the remaining input distance with the smaller fold", async () => {
    const test = visibleFoldCases.find((test) => test.name === "larger input")!;
    const h = await mountVisibleFold(test, false);
    h.submit();
    await act(async () => {
      await Promise.resolve();
    });
    await act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(h.scroller.scrollTop).toBe(2200);

    expect(h.room()).toBe(0);

    expect(h.scrollTo).not.toHaveBeenCalled();
  });
  it.each(["wheel", "touchstart", "pointerdown", "keydown"] as const)(
    "cancels queued follow when the reader sends %s input",
    async (intent) => {
      const h = await mountScroll();
      await h.startFold();
      await h.update({ submissionId: "first" });
      await act(async () => {
        await Promise.resolve();
      });
      if (intent === "wheel") await fireEvent.wheel(h.scroller, { deltaY: -80 });
      else if (intent === "touchstart") await fireEvent.touchStart(h.scroller);
      else if (intent === "pointerdown") await fireEvent.pointerDown(h.scroller, { button: 0 });
      else await fireEvent.keyDown(h.scroller, { key: "ArrowUp" });
      await h.finishFold();
      await act(() => {
        vi.runAllTimers();
      });

      expect(h.scrollTo).not.toHaveBeenCalled();

      expect(h.scroller.scrollTop).toBe(0);
    },
  );
  it.each([false, true])(
    "keeps a fold cancelled through resize until new input owns follow (new input=%s)",
    async (newInput) => {
      const h = await mountScroll();
      h.scroller.scrollTop = 500;
      await h.startFold();
      await h.update({ submissionId: "first" });
      await act(async () => {
        await Promise.resolve();
      });
      await fireEvent.wheel(h.scroller, { deltaY: -80 });
      h.scroller.scrollTop = 420;
      await fireEvent.scroll(h.scroller);
      await h.resize();
      await h.update({ order: ["streaming-change"], running: true });
      if (newInput) await h.update({ submissionId: "second" });
      h.grow(920);
      await h.finishFold();
      await act(async () => {
        await Promise.resolve();
      });
      await act(() => {
        vi.advanceTimersByTime(400);
      });
      if (newInput) expect(h.scroller.scrollTop).toBe(520);
      else {
        expect(h.scrollTo).not.toHaveBeenCalled();

        expect(h.scroller.scrollTop).toBe(420);
        await act(() => {
          vi.advanceTimersByTime(500);
        });
        await h.resize();

        expect(h.scrollTo).not.toHaveBeenCalled();

        expect(h.scroller.scrollTop).toBe(420);
      }
    },
  );
  it("keeps intent cancellation through a resize before the first scroll delivery", async () => {
    const h = await mountScroll();
    await h.startFold();
    await h.update({ submissionId: "first" });
    await fireEvent.wheel(h.scroller, { deltaY: -80 });
    await h.resize();
    await h.finishFold();

    expect(h.scrollTo).not.toHaveBeenCalled();
    await h.update({ submissionId: "second" });

    expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 600, behavior: "smooth" });
  });
  it("does not let process-body scrollend settle an outer native follow", async () => {
    const h = await mountScroll();
    const body = document.createElement("div");
    body.dataset.stepProcessBody = "";
    h.row.append(body);
    await h.update({ submissionId: "first" });
    h.scroller.scrollTop = 150;
    await fireEvent.scroll(h.scroller);
    await fireEvent(body, new Event("scrollend", { bubbles: true }));
    h.grow(1200);
    await h.resize();

    expect(h.scrollTo.mock.calls).toEqual([
      [{ top: 600, behavior: "smooth" }],
      [{ top: 800, behavior: "smooth" }],
    ]);
    h.scroller.scrollTop = 800;
    await fireEvent.scroll(h.scroller);
    await fireEvent(h.scroller, new Event("scrollend"));
    h.grow(1300);
    await h.resize();

    expect(h.scroller.scrollTop).toBe(900);
  });
  it("cancels queued follow when the Chat view unmounts", async () => {
    const h = await mountScroll();
    await h.startFold();
    await h.update({ submissionId: "first" });
    h.view.unmount();
    await h.finishFold();
    await act(() => {
      vi.runAllTimers();
    });

    expect(h.scrollTo).not.toHaveBeenCalled();

    expect(h.scroller.scrollTop).toBe(0);

    expect(h.scroller.style.overflowAnchor).toBe("");
  });
  it("does not revive a cancelled follow when delayed timing is re-enabled before the fold ends", async () => {
    const h = await mountScroll();
    await h.startFold();
    await h.update({ submissionId: "first" });
    await h.update({ deferCompletedTurns: false });
    await h.update({ deferCompletedTurns: true });
    await h.finishFold();
    await act(() => {
      vi.runAllTimers();
    });

    expect(h.scrollTo).not.toHaveBeenCalled();

    expect(h.scroller.scrollTop).toBe(0);
    await h.update({ deferCompletedTurns: false, submissionId: "second" });

    expect(h.scroller.scrollTop).toBe(600);

    expect(h.scrollTo).not.toHaveBeenCalled();
  });
  it("returns to bottom immediately and cancels an older fold waiter", async () => {
    const h = await mountScroll();
    await h.startFold();
    // The awaited native commit has installed the fold's temporary bottom room.
    const bottom = h.scroller.scrollHeight - h.scroller.clientHeight;
    await h.update({ submissionId: "first" }, () => {
      dispatchDom.click(h.view.getByRole("button", { name: "Return to bottom" }));
    });

    expect(h.scroller.scrollTop).toBe(bottom);
    h.grow(1200);
    await h.finishFold();

    expect(h.scroller.scrollTop).toBe(bottom);

    expect(h.scrollTo).not.toHaveBeenCalled();
  });
  it("interrupts an active smooth follow when completion timing is restored", async () => {
    const h = await mountScroll();
    await h.update({ submissionId: "first" });
    h.scroller.scrollTop = 150;
    await h.update({ deferCompletedTurns: false });

    expect(h.scrollTo).toHaveBeenLastCalledWith({ top: 150, behavior: "instant" });

    expect(h.scroller.scrollTop).toBe(150);
    await h.update({ submissionId: "second" });

    expect(h.scroller.scrollTop).toBe(600);

    expect(h.scrollTo).toHaveBeenCalledTimes(2);
  });
});
describe("scroll ownership across descendant visibility commits", () => {
  it.each(["fold-owned", "reader", "process-body", "after-fold"] as const)(
    "settles %s scrollend without overriding the descendant fold owner",
    async (owner) => {
      const harness = await mountScroll(true, {}, true);
      await harness.resize();
      harness.grow(1080);
      await harness.update({ lastKey: "user-input", lastIsUser: true, submissionId: "input" });
      expect(harness.scroller.querySelector('[data-chat-motion="collapse"]')).not.toBeNull();

      // A reader delivery remains pending when the next fold frame acknowledges its own position.
      harness.scroller.scrollTop -= 10;
      await fireEvent.scroll(harness.scroller);
      await act(() => {
        vi.advanceTimersByTime(112);
      });
      expect(harness.scroller.querySelector('[data-chat-motion="collapse"]')).not.toBeNull();
      if (owner === "after-fold") {
        await act(() => {
          vi.advanceTimersByTime(200);
        });
        expect(harness.scroller.querySelector('[data-chat-motion="collapse"]')).toBeNull();
      }
      if (owner === "reader" || owner === "after-fold") {
        harness.scroller.scrollTop -= 40;
        await fireEvent.scroll(harness.scroller);
      }
      const before = harness.scroller.scrollTop;
      if (owner === "process-body") {
        const body = document.createElement("div");
        body.dataset.stepProcessBody = "";
        harness.row.append(body);
        await fireEvent(body, new Event("scrollend", { bubbles: true }));
      } else {
        await fireEvent(harness.scroller, new Event("scrollend"));
      }

      if (owner === "process-body") {
        expect(harness.scroller.scrollTop).toBe(
          harness.scroller.scrollHeight - harness.scroller.clientHeight,
        );
      } else {
        expect(harness.scroller.scrollTop).toBe(before);
        expect(harness.scroller.getAttribute("data-following-tail")).toBe(
          owner === "fold-owned" ? "true" : "false",
        );
      }
      await act(() => {
        vi.advanceTimersByTime(400);
      });
      if (owner === "fold-owned") {
        expect(harness.scroller.scrollTop).toBe(
          harness.scroller.scrollHeight - harness.scroller.clientHeight,
        );
        const spacer = harness.scroller.querySelector<HTMLElement>("[data-chat-turn-spacer]");
        expect(Number.parseFloat(spacer?.style.height ?? "") || 0).toBe(0);
      }
    },
  );
  it("does not reconcile an input commit after its owner unmounts in that commit", async () => {
    const harness = await mountScroll(true, {}, true);
    await harness.resize();
    harness.scrollTo.mockClear();
    harness.grow(1080);

    await harness.update({ lastKey: "user-input", lastIsUser: true, submissionId: "input" }, () =>
      harness.view.unmount(),
    );
    await act(() => {
      vi.runAllTimers();
    });

    expect(harness.scrollTo).not.toHaveBeenCalled();
    expect(harness.scroller.isConnected).toBe(false);
  });

  it("follows a submitted input on the descendant fold clock without starting a separate smooth scroll", async () => {
    const harness = await mountScroll(true, {}, true);
    await harness.resize();
    harness.scrollTo.mockClear();
    harness.grow(1080);

    await harness.update({ lastKey: "user-input", lastIsUser: true, submissionId: "input" });

    expect(harness.scroller.querySelector('[data-chat-motion="collapse"]')).not.toBeNull();
    expect(
      harness.scrollTo.mock.calls.filter(([options]) => options.behavior === "smooth"),
    ).toEqual([]);
    await act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(harness.scroller.querySelector('[data-chat-motion="collapse"]')).toBeNull();
    expect(harness.scroller.scrollTop).toBe(
      harness.scroller.scrollHeight - harness.scroller.clientHeight,
    );
  });

  it.each(["compact", "standard", "detailed"] as const)(
    "clears reserved room after %s mode finishes the descendant fold",
    async (transcriptView) => {
      const harness = await mountScroll(true, {}, true);
      await harness.resize();

      await harness.update({ transcriptView });
      expect(harness.scroller.querySelector('[data-chat-motion="collapse"]')).not.toBeNull();
      await act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(harness.scroller.querySelector('[data-chat-motion="collapse"]')).toBeNull();
      const spacer = harness.scroller.querySelector<HTMLElement>("[data-chat-turn-spacer]");
      expect(Number.parseFloat(spacer?.style.height ?? "") || 0).toBe(0);
      expect(harness.scroller.scrollTop).toBe(
        harness.scroller.scrollHeight - harness.scroller.clientHeight,
      );
    },
  );
});
async function render(...args: Parameters<typeof mountNative>) {
  const view = mountNative(...args);
  await nextTick();
  return view;
}
const fireEvent = Object.assign(
  async (...args: Parameters<typeof dispatchDom>) => {
    await nextTick();
    const result = dispatchDom(...args);
    await nextTick();
    return result;
  },
  {
    keyDown: async (...args: Parameters<typeof dispatchDom.keyDown>) => {
      await nextTick();
      const result = dispatchDom.keyDown(...args);
      await nextTick();
      return result;
    },
    pointerDown: async (...args: Parameters<typeof dispatchDom.pointerDown>) => {
      await nextTick();
      const result = dispatchDom.pointerDown(...args);
      await nextTick();
      return result;
    },
    scroll: async (...args: Parameters<typeof dispatchDom.scroll>) => {
      await nextTick();
      const result = dispatchDom.scroll(...args);
      await nextTick();
      return result;
    },
    touchStart: async (...args: Parameters<typeof dispatchDom.touchStart>) => {
      await nextTick();
      const result = dispatchDom.touchStart(...args);
      await nextTick();
      return result;
    },
    wheel: async (...args: Parameters<typeof dispatchDom.wheel>) => {
      await nextTick();
      const result = dispatchDom.wheel(...args);
      await nextTick();
      return result;
    },
  },
);
