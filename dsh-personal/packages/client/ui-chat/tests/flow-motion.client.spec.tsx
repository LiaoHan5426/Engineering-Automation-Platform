import { h, Fragment, defineComponent, shallowRef, nextTick } from "vue";
// @vitest-environment jsdom
/** Chat row motion with instance-owned geometry and a controlled transition clock. */
import {
  act,
  cleanup,
  render as mountNative,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vite-plus/test";
import {
  createFlowMotion,
  hiddenOrCollapsing,
  motionEnabled,
  useFlowHidden,
  useMotionHidden,
  type FlowMotion,
  type FlowMotionRows,
  type InputFoldBox,
  type InputFoldDriver,
} from "../src/client/chat/flow-motion.ts";
const ownedRows = new Set<HTMLElement>();
const subscriptions = new Set<() => void>();
let motion: FlowMotion;
let driver: Mock<() => InputFoldDriver | null>;
let changed: Mock<(active: boolean) => void>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  // Without a driver, rows keep their CSS transitions; batch tests supply one.
  driver = vi.fn<() => InputFoldDriver | null>(() => null);
  changed = vi.fn<(active: boolean) => void>();
  motion = createFlowMotion(driver, changed);
});
function batchDriver(travelling: readonly HTMLElement[] = []) {
  const calls = {
    begin: vi.fn<(boxes: readonly InputFoldBox[]) => ReadonlySet<HTMLElement>>(
      () => new Set(travelling),
    ),
    prepare: vi.fn<(progress: number, cancelled: boolean) => void>(),
    frame: vi.fn<(progress: number, cancelled: boolean) => number>(() => -20),
    finish: vi.fn<(cancelled: boolean) => void>(),
  };
  driver.mockReturnValue(calls);
  return calls;
}
afterEach(async () => {
  try {
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions.clear();
    cleanup();
    for (const row of ownedRows) {
      motion.cancelMotion(row);
      row.remove();
    }
    ownedRows.clear();
    motion.clear();
    await Promise.resolve();

    expect(motion.foldActive()).toBe(false);

    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
function rowWithHeight(height: number, parent: HTMLElement = document.body): HTMLElement {
  const row = document.createElement("div");
  Object.defineProperty(row, "offsetHeight", { value: height, configurable: true });
  parent.append(row);
  ownedRows.add(row);
  return row;
}
function transitionEnd(row: HTMLElement, propertyName: string): void {
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: propertyName });
  row.dispatchEvent(event);
}
async function expectCleared(row: HTMLElement) {
  expect(row.hasAttribute("data-chat-motion")).toBe(false);
  for (const property of ["height", "marginTop", "opacity", "overflow", "transition"] as const) {
    expect(row.style[property]).toBe("");
  }
}
interface HiddenRowProps {
  readonly motion: FlowMotionRows;
  readonly hidden: boolean;
  readonly onReveal: () => void;
}
const PlainHiddenRow = defineComponent(
  (props: HiddenRowProps) => {
    const ref = shallowRef<HTMLDivElement | null>(null);
    useMotionHidden(ref, () => props.hidden, props.motion);
    return () => h("div", { ref: ref, "data-testid": "motion-row" }, ["Content"]);
  },
  { props: ["hidden", "onReveal", "motion"] },
);
const UnboundHiddenRow = defineComponent(
  (props: { motion: FlowMotionRows }) => {
    const ref = shallowRef<HTMLDivElement | null>(null);
    useMotionHidden(ref, true, props.motion);
    return () => null;
  },
  { props: ["motion"] },
);
const SearchableHiddenRow = defineComponent(
  (props: HiddenRowProps) => {
    const ref = useFlowHidden(
      () => props.hidden,
      () => {
        props.onReveal();
      },
      props.motion,
    );
    return () => h("div", { ref: ref, "data-testid": "motion-row" }, ["Content"]);
  },
  { props: ["hidden", "onReveal", "motion"] },
);
describe("flow motion", () => {
  it("requires an enabled scope and respects reduced motion", async () => {
    const scope = rowWithHeight(0);
    const row = rowWithHeight(80, scope);

    expect(motionEnabled(row)).toBe(false);
    scope.dataset.chatMotion = "";

    expect(motionEnabled(row)).toBe(true);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );

    expect(motionEnabled(row)).toBe(false);
  });
  it("finishes a zero-size collapse synchronously without a timer or reservation", async () => {
    const row = rowWithHeight(0);
    const done = vi.fn();
    motion.collapse(row, done);

    expect(done).toHaveBeenCalledTimes(1);

    expect(motion.foldActive()).toBe(false);

    expect(vi.getTimerCount()).toBe(0);
    await Promise.resolve();

    expect(driver).not.toHaveBeenCalled();
    await expectCleared(row);
  });
  it("commits hidden state before idle notification and finishes only on its own height transition", async () => {
    const row = rowWithHeight(80);
    const child = rowWithHeight(20, row);
    const done = vi.fn(() => {
      row.setAttribute("hidden", "until-found");
    });
    const idle = vi.fn(async () => {
      await nextTick();
      await nextTick();
      await nextTick();
      await nextTick();
      await nextTick();
      await nextTick();
      expect(row.getAttribute("hidden")).toBe("until-found");
    });
    motion.collapse(row, done);
    let pendingIdle: Promise<void> | undefined;
    subscriptions.add(
      motion.onFoldIdle(() => {
        pendingIdle = idle();
      }),
    );

    expect(motion.foldActive()).toBe(true);

    expect(hiddenOrCollapsing(row)).toBe(true);

    expect(row.hasAttribute("hidden")).toBe(false);

    expect(row.style.opacity).toBe("0");

    expect(row.style.height).toBe("0px");
    await Promise.resolve();

    expect(driver).toHaveBeenCalledTimes(1);
    transitionEnd(row, "opacity");
    transitionEnd(child, "height");

    expect(done).not.toHaveBeenCalled();

    expect(idle).not.toHaveBeenCalled();
    transitionEnd(row, "height");

    expect(done).toHaveBeenCalledTimes(1);

    expect(idle).toHaveBeenCalledTimes(1);

    expect(motion.foldActive()).toBe(false);

    expect(hiddenOrCollapsing(row)).toBe(true);
    await expectCleared(row);
    await pendingIdle;
    transitionEnd(row, "height");
    vi.runAllTimers();

    expect(done).toHaveBeenCalledTimes(1);
  });
  it("finishes a collapse when no transition event arrives", async () => {
    const row = rowWithHeight(80);
    const done = vi.fn();
    motion.collapse(row, done);

    expect(done).not.toHaveBeenCalled();
    vi.runAllTimers();

    expect(done).toHaveBeenCalledTimes(1);

    expect(motion.foldActive()).toBe(false);
    await expectCleared(row);
  });
  it("emits one active interval across overlapping folds and lets an idle waiter cancel", async () => {
    const first = rowWithHeight(80);
    const second = rowWithHeight(90);
    const cancelled = vi.fn();
    const idle = vi.fn();
    motion.collapse(first, vi.fn());
    motion.collapse(second, vi.fn());
    const cancelWaiter = motion.onFoldIdle(cancelled);
    subscriptions.add(cancelWaiter);
    subscriptions.add(motion.onFoldIdle(idle));
    cancelWaiter();

    expect(changed).toHaveBeenCalledExactlyOnceWith(true);
    transitionEnd(first, "height");

    expect(motion.foldActive()).toBe(true);

    expect(idle).not.toHaveBeenCalled();
    transitionEnd(second, "height");

    expect(changed.mock.calls).toEqual([[true], [false]]);

    expect(idle).toHaveBeenCalledTimes(1);

    expect(cancelled).not.toHaveBeenCalled();
  });
  it("runs an idle callback immediately without retaining a second invocation", async () => {
    const idle = vi.fn();
    const cancel = motion.onFoldIdle(idle);
    cancel();

    expect(idle).toHaveBeenCalledTimes(1);
    const row = rowWithHeight(80);
    motion.collapse(row, vi.fn());
    motion.cancelMotion(row);

    expect(idle).toHaveBeenCalledTimes(1);
  });
  it("cancels before the batch starts without hiding the row or retaining callbacks", async () => {
    const row = rowWithHeight(80);
    const done = vi.fn();
    motion.collapse(row, done);
    motion.cancelMotion(row);
    motion.cancelMotion(row);

    expect(motion.foldActive()).toBe(false);

    expect(hiddenOrCollapsing(row)).toBe(false);
    await expectCleared(row);
    await Promise.resolve();

    expect(driver).not.toHaveBeenCalled();
    transitionEnd(row, "height");
    vi.runAllTimers();

    expect(done).not.toHaveBeenCalled();

    expect(row.hasAttribute("hidden")).toBe(false);
  });
  it("drives non-nested closing and revealing boxes in document order on one batch", async () => {
    const calls = batchDriver();
    const parent = rowWithHeight(180);
    const child = rowWithHeight(80, parent);
    const sibling = rowWithHeight(50);
    const opening = rowWithHeight(30);
    motion.collapse(child, vi.fn());
    motion.collapse(parent, vi.fn());
    motion.collapse(sibling, vi.fn());
    motion.reveal(opening);
    // A fresh reveal has not grown yet when the batch measures it.
    Object.defineProperty(opening, "offsetHeight", { value: 0, configurable: true });
    await Promise.resolve();

    expect(calls.begin).toHaveBeenCalledTimes(1);

    expect(
      calls.begin.mock.calls[0]?.[0].map((box) => [box.element, box.height, box.closing]),
    ).toEqual([
      [parent, 180, true],
      [sibling, 50, true],
      [opening, 30, false],
    ]);

    expect(motion.inputActive()).toBe(true);
  });
  it("leaves a reveal-only commit to its CSS transition", async () => {
    batchDriver();
    const row = rowWithHeight(30);
    motion.reveal(row);
    await Promise.resolve();

    expect(driver).not.toHaveBeenCalled();

    expect(row.dataset.chatMotion).toBe("reveal");
    vi.runAllTimers();
  });
  it("lands a batch on its frame clock and notifies idle after the final geometry", async () => {
    vi.useFakeTimers();
    const calls = batchDriver();
    const row = rowWithHeight(180);
    const order: string[] = [];
    const done = vi.fn(() => {
      order.push("hidden");
      row.setAttribute("hidden", "");
    });
    calls.finish.mockImplementation(() => {
      order.push("finish");
    });
    motion.collapse(row, done);
    subscriptions.add(
      motion.onFoldIdle(() => {
        order.push("idle");
      }),
    );
    await Promise.resolve();
    vi.advanceTimersByTime(96);

    expect(row.style.translate).toBe("0 -20px");

    expect(Number.parseFloat(row.style.height)).toBeLessThan(180);
    vi.advanceTimersByTime(400);

    expect(order).toEqual(["hidden", "finish", "idle"]);

    expect(calls.finish).toHaveBeenCalledExactlyOnceWith(false);

    expect(changed.mock.calls).toEqual([[true], [false]]);

    expect(motion.inputActive()).toBe(false);
    await expectCleared(row);
  });
  it("keeps a travelling box opaque and in the flow while it shrinks", async () => {
    vi.useFakeTimers();
    const row = rowWithHeight(180);
    const nested = rowWithHeight(60, row);
    batchDriver([row]);
    motion.collapse(nested, vi.fn());
    motion.collapse(row, vi.fn());
    await Promise.resolve();

    expect(nested.style.height).toBe("60px");

    expect(nested.style.transition).toBe("none");
    vi.advanceTimersByTime(96);

    expect(row.style.opacity).toBe("1");

    expect(row.style.translate).toBe("");

    expect(nested.style.opacity).toBe("1");
    vi.advanceTimersByTime(400);
  });
  it("freezes a box that starts travelling after the batch began", async () => {
    vi.useFakeTimers();
    const travelling = new Set<HTMLElement>();
    const calls = batchDriver();
    calls.begin.mockReturnValue(travelling);
    const row = rowWithHeight(180);
    const nested = rowWithHeight(60, row);
    motion.collapse(nested, vi.fn());
    motion.collapse(row, vi.fn());
    await Promise.resolve();
    vi.advanceTimersByTime(96);

    expect(row.style.translate).toBe("0 -20px");
    travelling.add(row);
    vi.advanceTimersByTime(16);

    expect(row.style.opacity).toBe("1");

    expect(row.style.translate).toBe("");

    expect(nested.style.height).toBe("60px");

    expect(nested.style.transition).toBe("none");
    vi.advanceTimersByTime(400);
  });
  it("reports a batch as input-owned while it is scheduled or running, not for reveals alone", async () => {
    vi.useFakeTimers();
    batchDriver();
    const opening = rowWithHeight(30);
    motion.reveal(opening);

    expect(motion.inputActive()).toBe(false);
    const row = rowWithHeight(180);
    motion.collapse(row, vi.fn());

    expect(motion.inputActive()).toBe(true);
    await Promise.resolve();

    expect(motion.inputActive()).toBe(true);
    vi.advanceTimersByTime(400);

    expect(motion.inputActive()).toBe(false);
    motion.resumeInput();

    expect(motion.inputActive()).toBe(false);
  });
  it("does not report a batch when every closing row sits inside an ancestor that closes on its own", async () => {
    const calls = batchDriver();
    const parent = rowWithHeight(180);
    // The ancestor's motion is not owned by this batch, so its descendants cannot start one.
    parent.dataset.chatMotion = "collapse";
    const child = rowWithHeight(60, parent);
    motion.collapse(child, vi.fn());

    expect(motion.inputActive()).toBe(false);
    await Promise.resolve();

    expect(calls.begin).not.toHaveBeenCalled();
    motion.cancelMotion(child);
    delete parent.dataset.chatMotion;
  });
  it("holds a row that closes during a batch in place and drives it in the next batch", async () => {
    vi.useFakeTimers();
    const calls = batchDriver();
    const first = rowWithHeight(180);
    const idle = vi.fn();
    motion.collapse(first, vi.fn());
    await Promise.resolve();
    subscriptions.add(motion.onFoldIdle(idle));
    vi.advanceTimersByTime(32);
    const late = rowWithHeight(60);
    const lateDone = vi.fn();
    motion.collapse(late, lateDone);

    expect(late.style.transition).toBe("none");

    expect(late.style.height).toBe("60px");

    expect(late.style.opacity).toBe("");
    await Promise.resolve();

    expect(calls.begin).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);

    expect(calls.begin).toHaveBeenCalledTimes(2);

    expect(calls.begin.mock.calls[1]?.[0].map((box) => box.element)).toEqual([late]);

    expect(idle).not.toHaveBeenCalled();

    expect(motion.inputActive()).toBe(true);
    vi.advanceTimersByTime(400);

    expect(lateDone).toHaveBeenCalledTimes(1);

    expect(idle).toHaveBeenCalledTimes(1);

    expect(calls.finish).toHaveBeenCalledTimes(2);
  });
  it("finishes a held row at once when the next flush has no driver", async () => {
    vi.useFakeTimers();
    batchDriver();
    const first = rowWithHeight(180);
    motion.collapse(first, vi.fn());
    await Promise.resolve();
    vi.advanceTimersByTime(32);
    const late = rowWithHeight(60);
    const lateDone = vi.fn();
    motion.collapse(late, lateDone);
    driver.mockReturnValue(null);
    vi.advanceTimersByTime(400);

    expect(lateDone).toHaveBeenCalledTimes(1);
    await expectCleared(late);
  });
  it("takes over a closing row at its current size and finishes one that no longer has any", async () => {
    vi.useFakeTimers();
    const moving = rowWithHeight(180);
    motion.collapse(moving, vi.fn());
    await Promise.resolve();
    // No driver yet: the row closes on its own transition and shrinks to 120 before a batch takes it over.
    Object.defineProperty(moving, "offsetHeight", { value: 120, configurable: true });
    const calls = batchDriver();
    const gone = rowWithHeight(60);
    const goneDone = vi.fn();
    motion.collapse(gone, goneDone);
    // Before the batch starts, the row's ancestor finished closing, so the row has no size left.
    Object.defineProperty(gone, "offsetHeight", { value: 0, configurable: true });

    expect(goneDone).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(goneDone).toHaveBeenCalledTimes(1);
    await expectCleared(gone);

    expect(calls.begin.mock.calls[0]?.[0].map((box) => [box.element, box.height])).toEqual([
      [moving, 120],
    ]);
    vi.advanceTimersByTime(400);
  });
  it("counts only the remaining growth of a reveal a batch takes over mid-transition", async () => {
    vi.useFakeTimers();
    const opening = rowWithHeight(120);
    motion.reveal(opening);
    await Promise.resolve();
    // The reveal ran alone on its own transition and reached 45px before a closing row starts a batch.
    Object.defineProperty(opening, "offsetHeight", { value: 45, configurable: true });
    const calls = batchDriver();
    const closing = rowWithHeight(80);
    motion.collapse(closing, vi.fn());
    await Promise.resolve();

    expect(
      calls.begin.mock.calls[0]?.[0].map((box) => [box.element, box.height, box.closing]),
    ).toEqual([
      [opening, 75, false],
      [closing, 80, true],
    ]);

    expect(opening.style.height).toBe("45px");
    vi.advanceTimersByTime(400);
  });
  it("holds a row revealed during a batch and starts its own transition when no batch follows", async () => {
    vi.useFakeTimers();
    batchDriver();
    const closing = rowWithHeight(180);
    motion.collapse(closing, vi.fn());
    await Promise.resolve();
    vi.advanceTimersByTime(32);
    const opening = rowWithHeight(40);
    motion.reveal(opening);

    expect(opening.style.transition).toBe("none");

    expect(opening.style.height).toBe("0px");
    vi.advanceTimersByTime(200);

    expect(opening.style.transition).toContain("height");

    expect(opening.style.height).toBe("40px");
    vi.runAllTimers();
    await expectCleared(opening);
  });
  it("finishes a held row whose ancestor finished closing instead of driving it in another batch", async () => {
    vi.useFakeTimers();
    const calls = batchDriver();
    const parent = rowWithHeight(180);
    const idle = vi.fn();
    motion.collapse(parent, () => {
      parent.setAttribute("hidden", "until-found");
    });
    await Promise.resolve();
    subscriptions.add(motion.onFoldIdle(idle));
    vi.advanceTimersByTime(32);
    // A box under a `hidden="until-found"` ancestor keeps reporting its own size in the browser.
    const child = rowWithHeight(60, parent);
    const childDone = vi.fn();
    motion.collapse(child, childDone);
    vi.advanceTimersByTime(400);

    expect(calls.begin).toHaveBeenCalledTimes(1);

    expect(calls.finish).toHaveBeenCalledTimes(1);

    expect(childDone).toHaveBeenCalledTimes(1);
    await expectCleared(child);

    expect(idle).toHaveBeenCalledTimes(1);
  });
  it("starts a held reveal on its own transition when no held closing row still occupies the flow", async () => {
    vi.useFakeTimers();
    const calls = batchDriver();
    const parent = rowWithHeight(180);
    motion.collapse(parent, () => {
      parent.setAttribute("hidden", "until-found");
    });
    await Promise.resolve();
    vi.advanceTimersByTime(32);
    motion.collapse(rowWithHeight(60, parent), vi.fn());
    const opening = rowWithHeight(40);
    motion.reveal(opening);

    expect(opening.style.height).toBe("0px");
    vi.advanceTimersByTime(200);

    expect(calls.begin).toHaveBeenCalledTimes(1);

    expect(opening.style.transition).toContain("height");

    expect(opening.style.height).toBe("40px");
    vi.runAllTimers();
    await expectCleared(opening);
  });
  it("reports reader cancellation to the driver and lets a newer request resume the target", async () => {
    vi.useFakeTimers();
    const calls = batchDriver();
    const row = rowWithHeight(180);
    motion.cancelInput();
    motion.collapse(row, vi.fn());
    await Promise.resolve();
    motion.cancelInput();
    vi.advanceTimersByTime(96);

    expect(calls.frame.mock.calls.at(-1)?.[1]).toBe(true);
    motion.resumeInput();
    vi.advanceTimersByTime(16);

    expect(calls.frame.mock.calls.at(-1)?.[1]).toBe(false);
    motion.cancelInput();
    vi.advanceTimersByTime(400);

    expect(calls.finish).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("finishes a batch synchronously under reduced motion", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    const calls = batchDriver();
    const row = rowWithHeight(180);
    const done = vi.fn();
    motion.collapse(row, done);
    await Promise.resolve();

    expect(done).toHaveBeenCalledTimes(1);

    expect(calls.finish).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("does not rewrite a reopened row after its batch is cancelled", async () => {
    vi.useFakeTimers();
    const calls = batchDriver();
    const row = rowWithHeight(180);
    const done = vi.fn();
    motion.collapse(row, done);
    await Promise.resolve();
    vi.advanceTimersByTime(96);
    motion.cancelMotion(row);
    await expectCleared(row);

    expect(calls.finish).toHaveBeenCalledExactlyOnceWith(true);
    vi.advanceTimersByTime(400);
    await expectCleared(row);

    expect(row.style.translate).toBe("");

    expect(done).not.toHaveBeenCalled();
  });
  it("cancels a running batch with its owner", async () => {
    vi.useFakeTimers();
    const calls = batchDriver();
    const row = rowWithHeight(180);
    motion.collapse(row, vi.fn());
    await Promise.resolve();
    vi.advanceTimersByTime(32);
    motion.clear();

    expect(calls.finish).toHaveBeenCalledExactlyOnceWith(true);

    expect(motion.inputActive()).toBe(false);
    await expectCleared(row);
  });
  it("clears pending reservations and idle work with its owner", async () => {
    const row = rowWithHeight(80);
    const idle = vi.fn();
    motion.collapse(row, vi.fn());
    motion.onFoldIdle(idle);
    motion.clear();
    await Promise.resolve();

    expect(driver).not.toHaveBeenCalled();

    expect(idle).not.toHaveBeenCalled();
    await expectCleared(row);
  });
  it.each(["transition", "timeout", "cancel"] as const)(
    "clears reveal styles and detaches completion on %s",
    async (finish) => {
      const row = rowWithHeight(80);
      motion.reveal(row);

      expect(row.dataset.chatMotion).toBe("reveal");

      expect(motion.foldActive()).toBe(false);
      if (finish === "transition") transitionEnd(row, "height");
      else if (finish === "timeout") vi.runAllTimers();
      else motion.cancelMotion(row);
      await expectCleared(row);

      expect(vi.getTimerCount()).toBe(0);
      row.style.height = "120px";
      transitionEnd(row, "height");
      vi.runAllTimers();

      expect(row.style.height).toBe("120px");
    },
  );
  it("keeps a reveal active through opacity and descendant height transitions", async () => {
    const row = rowWithHeight(80);
    const child = rowWithHeight(20, row);
    motion.reveal(row);
    transitionEnd(row, "opacity");
    transitionEnd(child, "height");

    expect(row.dataset.chatMotion).toBe("reveal");

    expect(vi.getTimerCount()).toBe(1);
    transitionEnd(row, "height");
    await expectCleared(row);

    expect(vi.getTimerCount()).toBe(0);
  });
  it("leaves a zero-height reveal unchanged", async () => {
    const row = rowWithHeight(0);
    motion.reveal(row);
    await expectCleared(row);

    expect(vi.getTimerCount()).toBe(0);
  });
  it("leaves an unbound visibility ref idle through unmount", async () => {
    const view = await render(h(UnboundHiddenRow, { motion: motion }));

    expect(motion.foldActive()).toBe(false);

    expect(vi.getTimerCount()).toBe(0);
    view.unmount();

    expect(motion.foldActive()).toBe(false);

    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the original close clock when the reveal callback changes", async () => {
    const view = await render(
      h("div", { "data-chat-motion": "" }, [
        h(SearchableHiddenRow, { motion: motion, hidden: false, onReveal: vi.fn() }),
      ]),
    );
    const row = view.getByTestId("motion-row");
    Object.defineProperty(row, "offsetHeight", { value: 80 });
    await view.rerender(
      h("div", { "data-chat-motion": "" }, [
        h(SearchableHiddenRow, { motion: motion, hidden: true, onReveal: vi.fn() }),
      ]),
    );
    await Promise.resolve();
    await act(() => {
      vi.advanceTimersByTime(100);
    });
    await view.rerender(
      h("div", { "data-chat-motion": "" }, [
        h(SearchableHiddenRow, { motion: motion, hidden: true, onReveal: vi.fn() }),
      ]),
    );

    expect(changed.mock.calls).toEqual([[true]]);

    expect(driver).toHaveBeenCalledTimes(1);
    await act(() => {
      vi.advanceTimersByTime(140);
    });

    expect(row.getAttribute("hidden")).toBe("until-found");

    expect(changed.mock.calls).toEqual([[true], [false]]);
    await expectCleared(row);

    expect(view.getByTestId("motion-row")).toBe(row);
  });
  it("retains initially hidden content through Fragment scope lifecycle without starting motion", async () => {
    const view = await render(
      h(Fragment, null, [
        h("div", { "data-chat-motion": "" }, [
          h(PlainHiddenRow, { motion: motion, hidden: true, onReveal: vi.fn() }),
        ]),
      ]),
    );
    const row = view.getByTestId("motion-row");

    expect(row.getAttribute("hidden")).toBe("");
    await expectCleared(row);

    expect(changed).not.toHaveBeenCalled();

    expect(vi.getTimerCount()).toBe(0);
  });
});
describe.each([
  { name: "plain hidden", Component: PlainHiddenRow, hiddenValue: "" },
  { name: "searchable hidden", Component: SearchableHiddenRow, hiddenValue: "until-found" },
])("$name lifecycle", ({ Component, hiddenValue }) => {
  it("applies initial visibility without animating", async () => {
    const view = await render(
      h("div", { "data-chat-motion": "" }, [
        h(Component, { motion: motion, hidden: true, onReveal: vi.fn() }),
      ]),
    );
    const row = view.getByTestId("motion-row");

    expect(row.getAttribute("hidden")).toBe(hiddenValue);
    await expectCleared(row);

    expect(motion.foldActive()).toBe(false);

    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([false, true])(
    "hides before the next paint when reduced motion is %s",
    async (reduced) => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: reduced })),
      );
      const onReveal = vi.fn();
      const view = await render(
        h("div", { "data-chat-motion": reduced ? "" : undefined }, [
          h(Component, { motion: motion, hidden: false, onReveal: onReveal }),
        ]),
      );
      const row = view.getByTestId("motion-row");
      Object.defineProperty(row, "offsetHeight", { value: 80 });
      await view.rerender(
        h("div", { "data-chat-motion": reduced ? "" : undefined }, [
          h(Component, { motion: motion, hidden: true, onReveal: onReveal }),
        ]),
      );
      await act(async () => {
        await Promise.resolve();
      });

      expect(row.getAttribute("hidden")).toBe(hiddenValue);
      await expectCleared(row);

      expect(motion.foldActive()).toBe(false);
    },
  );
  it("cancels an unfinished collapse on unmount without delivering its hidden state", async () => {
    const onReveal = vi.fn();
    const view = await render(
      h("div", { "data-chat-motion": "" }, [
        h(Component, { motion: motion, hidden: false, onReveal: onReveal }),
      ]),
    );
    const row = view.getByTestId("motion-row");
    Object.defineProperty(row, "offsetHeight", { value: 80 });
    await view.rerender(
      h("div", { "data-chat-motion": "" }, [
        h(Component, { motion: motion, hidden: true, onReveal: onReveal }),
      ]),
    );

    expect(motion.foldActive()).toBe(true);
    const startedBeforeUnmount = driver.mock.calls.length;
    view.unmount();

    expect(motion.foldActive()).toBe(false);
    await expectCleared(row);
    await Promise.resolve();

    expect(driver).toHaveBeenCalledTimes(startedBeforeUnmount);
    await act(() => {
      vi.runAllTimers();
    });
    transitionEnd(row, "height");

    expect(row.hasAttribute("hidden")).toBe(false);

    expect(onReveal).not.toHaveBeenCalled();
  });
  it("cancels a stale hide when the same row becomes visible again", async () => {
    const onReveal = vi.fn();
    const view = await render(
      h("div", { "data-chat-motion": "" }, [
        h(Component, { motion: motion, hidden: false, onReveal: onReveal }),
      ]),
    );
    const row = view.getByTestId("motion-row");
    Object.defineProperty(row, "offsetHeight", { value: 80 });
    await view.rerender(
      h("div", { "data-chat-motion": "" }, [
        h(Component, { motion: motion, hidden: true, onReveal: onReveal }),
      ]),
    );

    expect(motion.foldActive()).toBe(true);
    await view.rerender(
      h("div", { "data-chat-motion": "" }, [
        h(Component, { motion: motion, hidden: false, onReveal: onReveal }),
      ]),
    );

    expect(motion.foldActive()).toBe(false);
    await act(() => {
      vi.runAllTimers();
    });
    transitionEnd(row, "height");

    expect(row.hasAttribute("hidden")).toBe(false);
    await expectCleared(row);

    expect(view.getByTestId("motion-row")).toBe(row);
  });
});
async function render(...args: Parameters<typeof mountNative>) {
  const view = mountNative(...args);
  await nextTick();
  return view;
}
