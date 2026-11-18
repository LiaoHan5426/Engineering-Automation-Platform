// @vitest-environment jsdom
import { h as vueH, Fragment, computed, defineComponent } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { act, cleanup, fireEvent, render, screen, within } from "./vue-render.client.ts";
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import type {
  JobsSnapshot,
  JobView,
  ObservedJob,
} from "@deepseek-ai/dsh-api-job-controller/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import {
  JobListAction as NativeJobListAction,
  type JobListActionProps,
} from "../src/client/JobListAction.tsx";
import { zh, en, ja, es, fr, de, ru, pt } from "../src/client/locales.ts";
beforeEach(() => {
  class TooltipObserver implements ResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      const size = { inlineSize: 160, blockSize: 30 };
      this.callback(
        [
          {
            target,
            borderBoxSize: [size],
            contentBoxSize: [size],
            devicePixelContentBoxSize: [size],
            contentRect: new DOMRect(),
          },
        ],
        this,
      );
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal("ResizeObserver", TooltipObserver);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
});
beforeEach(() => {
  vi.stubGlobal("CSS", { supports: (property: string) => property === "-webkit-backdrop-filter" });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const JobListAction = defineComponent(
  (p: JobListActionProps) => {
    const useJobs: JobListActionProps["useJobs"] = (select) =>
      computed(() => p.useJobs(select).value);
    return () => vueH(NativeJobListAction, { ...p, useJobs });
  },
  { props: ["sessionId", "useJobs", "watchRows", "observe", "killJob", "t"] },
);
const SESSION = "session" as SessionId;
const t: JobListActionProps["t"] = makeTranslate(zh);
/** A running job with nothing retained yet. */
function job(over: Partial<JobView> = {}): JobView {
  return {
    id: "bash-1" as JobView["id"],
    kind: "bash",
    label: "pnpm run build",
    status: "running",
    startedAt: 1700000000000,
    output: { total: 0, earliest: 0 },
    ...over,
  };
}
/** A job that left retained output behind, so its row offers a panel even once settled. */
function outputJob(over: Partial<JobView> = {}): JobView {
  return job({ output: { total: 12, earliest: 0 }, ...over });
}
function props(
  jobs: readonly JobView[],
  observe: JobListActionProps["observe"] = () => () => {},
  observed: Readonly<Record<string, ObservedJob>> = {},
  killJob: JobListActionProps["killJob"] = async () => true,
  watchRows: JobListActionProps["watchRows"] = () => () => {},
): JobListActionProps {
  const jobsState: JobsSnapshot = { rows: jobs.length > 0 ? { [SESSION]: jobs } : {}, observed };
  function useJobs<T>(select: (value: JobsSnapshot) => T) {
    return computed(() => select(jobsState));
  }
  return { sessionId: SESSION, useJobs, watchRows, observe, killJob, t } as JobListActionProps;
}
async function openList(): Promise<void> {
  await fireEvent.click(screen.getAllByRole("button")[0]!);
}
describe("JobListAction count copy", () => {
  it.each([
    [zh, "1 个后台任务", "2 个后台任务"],
    [en, "1 background job", "2 background jobs"],
    [ja, "バックグラウンドジョブ 1 件", "バックグラウンドジョブ 2 件"],
    [es, "Tareas en segundo plano: 1", "Tareas en segundo plano: 2"],
    [fr, "Tâches en arrière-plan : 1", "Tâches en arrière-plan : 2"],
    [de, "Hintergrundaufgaben: 1", "Hintergrundaufgaben: 2"],
    [ru, "Фоновые задачи: 1", "Фоновые задачи: 2"],
    [pt, "Tarefas em segundo plano: 1", "Tarefas em segundo plano: 2"],
  ] as const)(
    "uses neutral count copy for live and settled jobs in locale %#",
    async (dictionary, one, two) => {
      const translate: JobListActionProps["t"] = makeTranslate(dictionary);
      const settled = job({
        id: "settled" as JobView["id"],
        status: "completed",
        finishedAt: 1700000003000,
      });
      const mountedView1 = render(
        vueH(JobListAction, { ...props([job(), settled]), t: translate }),
      );
      const rerender = (...args: Parameters<typeof mountedView1.rerender>) => {
        mountedView1.rerender(...args);
      };
      expect(
        screen.getByRole("button", { name: one, description: dictionary["section.live"] }),
      ).toBeDefined();
      await act(() => {
        rerender(
          vueH(JobListAction, { ...props([job({ status: "stopping" }), settled]), t: translate }),
        );
      });
      expect(
        screen.getByRole("button", { name: one, description: dictionary["section.live"] }),
      ).toBeDefined();
      await act(() => {
        rerender(
          vueH(JobListAction, { ...props([job({ status: "completed" }), settled]), t: translate }),
        );
      });
      expect(screen.getByRole("button", { name: two, description: "" })).toBeDefined();
    },
  );
});
describe("JobListAction visibility", () => {
  it("renders nothing while the session sees no jobs", () => {
    const { container } = render(vueH(JobListAction, { ...props([]) }));
    expect(container.children.length).toBe(0);
  });
  it("watches the session roster while mounted and releases it on unmount", () => {
    const stop = vi.fn();
    const watchRows = vi.fn(() => stop);
    const mountedView2 = render(
      vueH(JobListAction, { ...props([], undefined, {}, undefined, watchRows) }),
    );
    const unmount = (...args: Parameters<typeof mountedView2.unmount>) => {
      mountedView2.unmount(...args);
    };
    expect(watchRows).toHaveBeenCalledWith(SESSION);
    expect(stop).not.toHaveBeenCalled();
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("counts live jobs on the trigger", () => {
    render(
      vueH(JobListAction, {
        ...props([
          outputJob(),
          job({ id: "subagent-1" as JobView["id"], kind: "subagent", label: "explore" }),
        ]),
      }),
    );
    expect(screen.getByRole("button", { name: "2 个后台任务" })).toBeDefined();
  });
  it("retains the compact Layers icon through running, stopping, and idle states without a root chevron", async () => {
    const mountedView3 = render(vueH(JobListAction, { ...props([job()]) }));
    const rerender = (...args: Parameters<typeof mountedView3.rerender>) => {
      mountedView3.rerender(...args);
    };
    const trigger = screen.getByRole("button");
    expect(trigger.querySelector('[data-icon="dsw-icon-layers-outline-regular"]')).not.toBeNull();
    expect(trigger.querySelector('[data-state="ongoing"]')).not.toBeNull();
    expect(trigger.querySelector('[data-icon="dsw-icon-chevron-down-outline-regular"]')).toBeNull();
    await act(() => {
      rerender(vueH(JobListAction, { ...props([job({ status: "stopping" })]) }));
    });
    expect(screen.getByRole("button")).toBe(trigger);
    expect(trigger.querySelector('[data-state="ongoing"]')).not.toBeNull();
    await act(() => {
      rerender(vueH(JobListAction, { ...props([job({ status: "completed" })]) }));
    });
    expect(screen.getByRole("button")).toBe(trigger);
    expect(trigger.querySelector('[data-state="ongoing"]')).toBeNull();
    const icon = trigger.querySelector('[data-icon="dsw-icon-layers-outline-regular"]');
    expect(icon?.getAttribute("width")).toBe("14");
    expect(trigger.querySelectorAll("svg")).toHaveLength(1);
  });
  it("falls back to the total when nothing is live", () => {
    render(
      vueH(JobListAction, { ...props([job({ status: "completed", finishedAt: 1700000003000 })]) }),
    );
    expect(screen.getByRole("button", { name: "1 个后台任务" })).toBeDefined();
  });
});
describe("JobListAction hover", () => {
  async function pointer(
    target: Element,
    type: "pointerover" | "pointerout",
    pointerType = "mouse",
  ): Promise<void> {
    // jsdom lacks PointerEvent; preserve its pointer type on the native event.
    const event = new MouseEvent(type === "pointerover" ? "pointerenter" : "pointerleave", {
      bubbles: false,
    });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    await fireEvent(target, event);
  }
  async function advance(ms: number): Promise<void> {
    await act(() => {
      vi.advanceTimersByTime(ms);
    });
  }
  async function hoverOpen(): Promise<HTMLElement> {
    const trigger = screen.getByRole("button", { name: "1 个后台任务" });
    await pointer(trigger, "pointerover");
    await advance(149);
    expect(screen.queryByRole("list")).toBeNull();
    await advance(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    return trigger;
  }
  it("keeps the compact trigger click-only and shows its count tooltip after 500ms", async () => {
    vi.useFakeTimers();
    render(vueH(JobListAction, { ...props([job()]) }));
    const trigger = screen.getByRole("button");
    const count = trigger.querySelector<HTMLElement>("[data-job-count]")!;
    count.style.display = "none";
    await pointer(trigger, "pointerover");
    await advance(499);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
    await advance(1);
    expect(screen.getByRole("tooltip").textContent).toBe("1 个后台任务");
    await fireEvent.click(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
    await pointer(trigger, "pointerout");
    await advance(500);
    expect(screen.getByRole("list")).toBeDefined();
    await fireEvent.click(trigger);
    expect(screen.queryByRole("list")).toBeNull();
  });
  it("cancels pending wide hover when CSS hides the count and compact clicks close hover-opened lists", async () => {
    vi.useFakeTimers();
    render(vueH(JobListAction, { ...props([job()]) }));
    const trigger = screen.getByRole("button");
    const count = trigger.querySelector<HTMLElement>("[data-job-count]")!;
    await pointer(trigger, "pointerover");
    await advance(100);
    count.style.display = "none";
    await advance(50);
    expect(screen.queryByRole("list")).toBeNull();
    await pointer(trigger, "pointerout");
    count.style.display = "";
    await hoverOpen();
    count.style.display = "none";
    await fireEvent.click(trigger);
    expect(screen.queryByRole("list")).toBeNull();
  });
  it("shows count on keyboard focus immediately and opens and pins with ArrowDown", async () => {
    vi.useFakeTimers();
    render(vueH(JobListAction, { ...props([job()]) }));
    const trigger = screen.getByRole("button");
    trigger.querySelector<HTMLElement>("[data-job-count]")!.style.display = "none";
    await fireEvent.keyDown(document.body, { key: "Tab" });
    await act(() => {
      trigger.focus();
    });
    expect(screen.getByRole("tooltip").textContent).toBe("1 个后台任务");
    await fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await act(async () => {
      vi.runAllTicks();
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    const row = screen.getByRole("button", {
      name: zh["row.expandAria"].replace("{label}", "pnpm run build"),
    });
    expect(document.activeElement).toBe(row);
    await pointer(trigger, "pointerout");
    await advance(120);
    expect(screen.getByRole("list")).toBeDefined();
    await fireEvent.keyDown(row, { key: "Escape" });
    expect(screen.queryByRole("list")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("waits for hover, bridges the portal gap, and closes after leaving both surfaces", async () => {
    vi.useFakeTimers();
    const observe = vi.fn(() => () => {});
    const { container } = render(vueH(JobListAction, { ...props([job()], observe) }));
    const trigger = await hoverOpen();
    const menu = screen.getByRole("list").parentElement!;
    expect(container.contains(menu)).toBe(false);
    expect(observe).not.toHaveBeenCalled();
    await pointer(trigger, "pointerout");
    await advance(119);
    await pointer(menu, "pointerover");
    await advance(120);
    expect(screen.getByRole("list")).toBeDefined();
    await pointer(menu, "pointerout");
    await advance(119);
    expect(screen.getByRole("list")).toBeDefined();
    await advance(1);
    expect(screen.queryByRole("list")).toBeNull();
  });
  it("cancels short hover and preserves a returning pointer during leave grace", async () => {
    vi.useFakeTimers();
    render(vueH(JobListAction, { ...props([job()]) }));
    const trigger = screen.getByRole("button");
    await pointer(trigger, "pointerover");
    await advance(149);
    await pointer(trigger, "pointerout");
    await advance(150);
    expect(screen.queryByRole("list")).toBeNull();
    await hoverOpen();
    await pointer(trigger, "pointerout");
    await advance(100);
    await pointer(trigger, "pointerover");
    await advance(120);
    expect(screen.getByRole("list")).toBeDefined();
  });
  it("pins a hover-opened list on click until explicit dismissal", async () => {
    vi.useFakeTimers();
    render(vueH(JobListAction, { ...props([job()]) }));
    const trigger = await hoverOpen();
    await fireEvent.click(trigger);
    await pointer(trigger, "pointerout");
    await advance(120);
    expect(screen.getByRole("list")).toBeDefined();
    await fireEvent.click(trigger);
    expect(screen.queryByRole("list")).toBeNull();
    await hoverOpen();
    await fireEvent.click(trigger);
    await fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("list")).toBeNull();
    await hoverOpen();
    await pointer(trigger, "pointerout");
    await advance(120);
    expect(screen.queryByRole("list")).toBeNull();
  });
  it("ignores touch hover while keeping tap usable", async () => {
    vi.useFakeTimers();
    render(vueH(JobListAction, { ...props([job()]) }));
    const trigger = screen.getByRole("button");
    await pointer(trigger, "pointerover", "touch");
    await advance(150);
    expect(screen.queryByRole("list")).toBeNull();
    await fireEvent.click(trigger);
    await pointer(trigger, "pointerout", "touch");
    await advance(120);
    expect(screen.getByRole("list")).toBeDefined();
    await fireEvent.click(trigger);
    expect(screen.queryByRole("list")).toBeNull();
  });
  it("pins keyboard focus and releases expanded output on Escape or hover close", async () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    const observe = vi.fn(() => stop);
    render(vueH(JobListAction, { ...props([outputJob()], observe) }));
    const trigger = await hoverOpen();
    await pointer(trigger, "pointerout");
    await act(() => {
      trigger.focus();
    });
    await fireEvent.keyDown(trigger, { key: "Tab" });
    const row = screen.getByRole("button", {
      name: zh["row.expandAria"].replace("{label}", "pnpm run build"),
    });
    expect(document.activeElement).toBe(row);
    await advance(120);
    await fireEvent.click(row);
    expect(observe).toHaveBeenCalledTimes(1);
    await fireEvent.keyDown(row, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    expect(stop).toHaveBeenCalledTimes(1);
    await hoverOpen();
    expect(observe).toHaveBeenCalledTimes(2);
    await pointer(trigger, "pointerout");
    await advance(120);
    expect(screen.queryByRole("list")).toBeNull();
    expect(stop).toHaveBeenCalledTimes(2);
  });
  it("pins pointer interaction so leaving cannot interrupt stop confirmation", async () => {
    vi.useFakeTimers();
    render(vueH(JobListAction, { ...props([job()]) }));
    const trigger = await hoverOpen();
    await pointer(trigger, "pointerout");
    const stop = screen.getByTitle(zh["kill.stop"].replace("{label}", "pnpm run build"));
    await fireEvent.pointerDown(stop);
    await fireEvent.click(stop);
    await pointer(screen.getByRole("list").parentElement!, "pointerout");
    await advance(120);
    expect(stop.getAttribute("data-kill-state")).toBe("armed");
    expect(screen.getByRole("list")).toBeDefined();
  });
  it("dismisses a hover-opened list with Escape while focus is elsewhere", async () => {
    vi.useFakeTimers();
    render(vueH(JobListAction, { ...props([job()]) }));
    await hoverOpen();
    await fireEvent.keyDown(document.body, { key: "a" });
    expect(screen.getByRole("list")).toBeDefined();
    await fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("list")).toBeNull();
  });
  it.each(["opening", "closing"] as const)(
    "cleans up a pending %s timer on unmount",
    async (phase) => {
      vi.useFakeTimers();
      const mountedView4 = render(vueH(JobListAction, { ...props([job()]) }));
      const unmount = (...args: Parameters<typeof mountedView4.unmount>) => {
        mountedView4.unmount(...args);
      };
      const trigger = screen.getByRole("button");
      await pointer(trigger, "pointerover");
      if (phase === "closing") {
        await advance(150);
        await pointer(trigger, "pointerout");
      }
      unmount();
      expect(vi.getTimerCount()).toBe(0);
      await advance(150);
      expect(screen.queryByRole("list")).toBeNull();
    },
  );
  it("releases expanded output and pending hover close before showing another session", async () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    const observe = vi.fn(() => stop);
    const first = props([outputJob()], observe);
    const mountedView5 = render(vueH(JobListAction, { ...first }));
    const rerender = (...args: Parameters<typeof mountedView5.rerender>) => {
      mountedView5.rerender(...args);
    };
    const trigger = await hoverOpen();
    const row = screen.getByRole("button", {
      name: zh["row.expandAria"].replace("{label}", "pnpm run build"),
    });
    await fireEvent.click(row);
    expect(observe).toHaveBeenCalledTimes(1);
    await pointer(trigger, "pointerout");
    const nextId = "next-session" as SessionId;
    await act(() => {
      rerender(
        vueH(JobListAction, {
          ...first,
          sessionId: nextId,
          useJobs: (select) =>
            computed(() => select({ rows: { [nextId]: [outputJob()] }, observed: {} })),
        }),
      );
    });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await hoverOpen();
    await advance(120);
    expect(screen.getByRole("list")).toBeDefined();
    expect(observe).toHaveBeenLastCalledWith(nextId, "bash-1");
  });
  it("cancels pending hover and clears pins on session change or an empty roster", async () => {
    vi.useFakeTimers();
    const first = props([job()]);
    const nextId = "next-session" as SessionId;
    const next: JobListActionProps = {
      ...first,
      sessionId: nextId,
      useJobs: (select) => computed(() => select({ rows: { [nextId]: [job()] }, observed: {} })),
    };
    const mountedView6 = render(vueH(JobListAction, { ...first }));
    const rerender = (...args: Parameters<typeof mountedView6.rerender>) => {
      mountedView6.rerender(...args);
    };
    await pointer(screen.getByRole("button"), "pointerover");
    await act(() => {
      rerender(vueH(JobListAction, { ...next }));
    });
    await advance(150);
    expect(screen.queryByRole("list")).toBeNull();
    const trigger = await hoverOpen();
    await fireEvent.click(trigger);
    await act(() => {
      rerender(vueH(JobListAction, { ...first }));
    });
    expect(screen.queryByRole("list")).toBeNull();
    await pointer(screen.getByRole("button"), "pointerover");
    await act(() => {
      rerender(vueH(JobListAction, { ...props([]) }));
    });
    await advance(150);
    expect(vi.getTimerCount()).toBe(0);
    await act(() => {
      rerender(vueH(JobListAction, { ...first }));
    });
    await hoverOpen();
    await fireEvent.click(screen.getByRole("button", { name: "1 个后台任务" }));
    await act(() => {
      rerender(vueH(JobListAction, { ...props([]) }));
    });
    await act(() => {
      rerender(vueH(JobListAction, { ...first }));
    });
    expect(screen.queryByRole("list")).toBeNull();
  });
});
describe("JobListAction rows", () => {
  it("renders a settled job without retained output as a static row", async () => {
    render(
      vueH(JobListAction, {
        ...props([
          job({
            id: "subagent-1" as JobView["id"],
            kind: "subagent",
            label: "explore the repo",
            status: "completed",
            finishedAt: 1700000003000,
          }),
        ]),
      }),
    );
    expect(screen.getByRole("button", { name: "1 个后台任务" })).toBeDefined();
    await openList();
    expect(screen.getByText("explore the repo")).toBeDefined();
    expect(
      screen.queryByRole("button", {
        name: zh["row.expandAria"].replace("{label}", "explore the repo"),
      }),
    ).toBeNull();
  });
  it("offers a panel on a live row before any output arrived", async () => {
    render(vueH(JobListAction, { ...props([job({ label: "warming up" })]) }));
    await openList();
    expect(
      screen.getByRole("button", { name: zh["row.expandAria"].replace("{label}", "warming up") }),
    ).toBeDefined();
  });
  it("shows the live progress line in place of the status word", async () => {
    render(
      vueH(JobListAction, { ...props([job({ status: "stopping", progress: "winding down" })]) }),
    );
    await openList();
    const list = screen.getByRole("list", { name: zh["list.aria"] });
    expect(within(list).getByText("pnpm run build")).toBeDefined();
    expect(within(list).getByText("winding down")).toBeDefined();
  });
  it("folds the settled tail behind its count while live work exists, and clears on demand", async () => {
    const settled = [
      job({
        id: "bash-2" as JobView["id"],
        label: "settled work",
        status: "completed",
        finishedAt: 1700000012000,
      }),
    ];
    render(vueH(JobListAction, { ...props([job(), ...settled]) }));
    await openList();
    expect(screen.getByText(zh["section.live"], { selector: "li" })).toBeDefined();
    const toggle = screen.getByRole("button", {
      name: zh["section.settledCount"].replace("{count}", "1"),
    });
    // Folded by default while something runs; the toggle expands it.
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("settled work")).toBeNull();
    await fireEvent.click(toggle);
    expect(screen.getByText("settled work")).toBeDefined();
    // Clearing hides the tail client-side and drops the whole section line.
    await fireEvent.click(screen.getByRole("button", { name: zh["section.clear"] }));
    expect(screen.queryByText("settled work")).toBeNull();
    expect(screen.queryByRole("button", { name: zh["section.clear"] })).toBeNull();
  });
  it("opens the settled tail by default when nothing is live", async () => {
    render(
      vueH(JobListAction, { ...props([job({ status: "completed", finishedAt: 1700000012000 })]) }),
    );
    await openList();
    expect(screen.getByText("pnpm run build")).toBeDefined();
    expect(
      screen
        .getByRole("button", { name: zh["section.settledCount"].replace("{count}", "1") })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });
  it("clearing drops an expanded settled panel with its rows", async () => {
    const observe = vi.fn(() => () => {});
    render(
      vueH(JobListAction, {
        ...props(
          [
            outputJob({
              id: "bash-2" as JobView["id"],
              label: "settled work",
              status: "completed",
              finishedAt: 1700000012000,
            }),
          ],
          observe,
        ),
      }),
    );
    await openList();
    // Nothing live: the tail is open; expand the settled row's output panel.
    await fireEvent.click(
      screen.getByRole("button", { name: zh["row.expandAria"].replace("{label}", "settled work") }),
    );
    expect(observe).toHaveBeenCalledWith(SESSION, "bash-2");
    await fireEvent.click(screen.getByRole("button", { name: zh["section.clear"] }));
    expect(screen.queryByText("settled work")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: zh["row.collapseAria"].replace("{label}", "settled work"),
      }),
    ).toBeNull();
  });
  it("shows a settled duration and ticks a live one", async () => {
    vi.useFakeTimers({ now: 1700000020000 });
    render(
      vueH(JobListAction, {
        ...props([
          job({ startedAt: 1700000015000 }),
          job({
            id: "bash-2" as JobView["id"],
            status: "completed",
            startedAt: 1700000000000,
            finishedAt: 1700000012000,
          }),
          job({
            id: "bash-3" as JobView["id"],
            status: "completed",
            startedAt: 1699996200000,
            finishedAt: 1700000000000,
          }),
          job({
            id: "bash-4" as JobView["id"],
            status: "completed",
            startedAt: 1699999900000,
            finishedAt: 1699999972000,
          }),
        ]),
      }),
    );
    await openList();
    await fireEvent.click(
      screen.getByRole("button", { name: zh["section.settledCount"].replace("{count}", "3") }),
    );
    expect(screen.getByText("5秒")).toBeDefined();
    expect(screen.getByText("12秒")).toBeDefined();
    expect(screen.getByText("1小时3分")).toBeDefined();
    expect(screen.getByText("1分12秒")).toBeDefined();
    await act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("6秒")).toBeDefined();
  });
  it("lists rows with kind, label, and detail-or-status", async () => {
    render(
      vueH(JobListAction, {
        ...props([
          outputJob(),
          outputJob({
            id: "bash-2" as JobView["id"],
            status: "failed",
            detail: "exit code: 3",
            finishedAt: 1700000002000,
          }),
        ]),
      }),
    );
    await openList();
    await fireEvent.click(
      screen.getByRole("button", { name: zh["section.settledCount"].replace("{count}", "1") }),
    );
    const list = screen.getByRole("list", { name: zh["list.aria"] });
    const items = within(list).getAllByRole("listitem");
    // The section line is a listitem too now: live row, section, settled row.
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain("pnpm run build");
    // A live row's second line is kind · duration; the status word only
    // appears through a detail (none while running).
    expect(items[0]?.textContent).toMatch(/小时|分|秒/);
    expect(items[2]?.textContent).toContain("exit code: 3");
  });
  it("orders live rows first by start and settled rows newest-first with tie-breaks", async () => {
    const settled = (id: string, label: string, startedAt: number, finishedAt?: number): JobView =>
      job({
        id: id as JobView["id"],
        label,
        status: "completed",
        startedAt,
        ...(finishedAt !== undefined ? { finishedAt } : {}),
      });
    render(
      vueH(JobListAction, {
        ...props([
          settled("bash-a", "settled-a", 10, 100),
          settled("bash-c", "settled-c", 80, 100),
          settled("bash-b", "settled-b", 90),
          settled("bash-e", "settled-e", 95, 50),
          settled("bash-d", "settled-d", 10, 200),
          job({ id: "bash-l1" as JobView["id"], label: "live-1", startedAt: 5 }),
          job({ id: "bash-l2" as JobView["id"], label: "live-2", startedAt: 3 }),
        ]),
      }),
    );
    await openList();
    await fireEvent.click(
      screen.getByRole("button", { name: zh["section.settledCount"].replace("{count}", "5") }),
    );
    const labels = within(screen.getByRole("list", { name: zh["list.aria"] }))
      .getAllByRole("listitem")
      .map((item) => item.querySelector("[title]")?.getAttribute("title"))
      .filter(
        (title): title is string =>
          title != null && !title.startsWith("已运行") && !title.startsWith("耗时"),
      );
    expect(labels).toEqual([
      "live-2",
      "live-1",
      "settled-d",
      "settled-a",
      "settled-c",
      "settled-b",
      "settled-e",
    ]);
    expect(screen.getAllByText(zh["status.completed"]).length).toBeGreaterThan(0);
  });
  it("breaks a settled tie on start order so map iteration never decides it", async () => {
    render(
      vueH(JobListAction, {
        ...props([
          job({
            id: "bash-2" as JobView["id"],
            label: "second",
            status: "completed",
            startedAt: 1700000000000 + 10,
            finishedAt: 1700000000000 + 100,
          }),
          job({
            id: "bash-1" as JobView["id"],
            label: "first",
            status: "completed",
            startedAt: 1700000000000,
            finishedAt: 1700000000000 + 100,
          }),
        ]),
      }),
    );
    await openList();
    expect(
      within(screen.getByRole("list"))
        .getAllByRole("listitem")
        .map((row) => row.querySelector("[title]")?.getAttribute("title"))
        .filter((title) => title !== undefined),
    ).toEqual(["first", "second"]);
  });
  it("prefers the producer detail over the generic status word", async () => {
    render(
      vueH(JobListAction, {
        ...props([
          job({ status: "killed", detail: "signal: SIGTERM", finishedAt: 1700000000000 + 2000 }),
        ]),
      }),
    );
    await openList();
    expect(within(screen.getByRole("list")).getByText("signal: SIGTERM")).toBeDefined();
  });
  it("renders settled status words and every lifecycle indicator", async () => {
    render(
      vueH(JobListAction, {
        ...props([
          job({ id: "bash-1" as JobView["id"], label: "a", status: "running" }),
          job({ id: "bash-2" as JobView["id"], label: "b", status: "stopping" }),
          job({
            id: "bash-3" as JobView["id"],
            label: "c",
            status: "completed",
            finishedAt: 1700000000000,
          }),
          job({
            id: "bash-4" as JobView["id"],
            label: "d",
            status: "killed",
            finishedAt: 1700000000000,
          }),
          job({
            id: "bash-5" as JobView["id"],
            label: "e",
            status: "failed",
            finishedAt: 1700000000000,
          }),
        ]),
      }),
    );
    await openList();
    await fireEvent.click(
      screen.getByRole("button", { name: zh["section.settledCount"].replace("{count}", "3") }),
    );
    for (const word of ["已完成", "已取消", "已失败"]) {
      expect(within(screen.getByRole("list")).getByText(word)).toBeDefined();
    }
    expect(
      [...screen.getByRole("list").querySelectorAll("li [data-state]")].map((node) =>
        node.getAttribute("data-state"),
      ),
    ).toEqual(["ongoing", "warning", "done", "warning", "error"]);
  });
});
describe("JobListAction observation", () => {
  it("marks killed rows, renders every output line unfolded, and copies the command", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const lines = Array.from({ length: 24 }, (_value, index) => `line ${index + 1}`).join("\n");
    const view: ObservedJob = {
      jobId: "bash-1" as JobView["id"],
      text: lines,
      gapBefore: false,
      streaming: false,
    };
    render(
      vueH(JobListAction, {
        ...props([outputJob({ status: "killed", finishedAt: 1700000001000 })], undefined, {
          "bash-1": view,
        }),
      }),
    );
    await openList();
    expect(screen.getByText(zh["status.killed"])).toBeDefined();
    await fireEvent.click(
      screen.getByRole("button", {
        name: zh["row.expandAria"].replace("{label}", "pnpm run build"),
      }),
    );
    // The panel scrolls instead of folding: every line renders, no fold control.
    expect(screen.getByText("line 1")).toBeDefined();
    expect(screen.getByText("line 24")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: zh["terminal.expandAria"].replace("{n}", "8") }),
    ).toBeNull();
    // The panel draws no state dot or label of its own — the row carries it.
    expect(screen.queryByText(zh["terminal.done"])).toBeNull();
    // The copy control carries the command, not the output.
    await act(async () => {
      await fireEvent.click(screen.getByRole("button", { name: zh["terminal.copy"] }));
    });
    expect(writeText).toHaveBeenCalledWith("pnpm run build");
  });
  it("anchors the portaled list with CSS without reading geometry on resize or ancestor scroll", async () => {
    const { container } = render(vueH(JobListAction, { ...props([outputJob()]) }));
    const trigger = screen.getByRole("button", { name: "1 个后台任务" });
    const anchor = trigger.closest("div")!;
    const measure = vi.spyOn(anchor, "getBoundingClientRect");
    await fireEvent.click(trigger);
    const list = screen.getByRole("list", { name: zh["list.aria"] });
    const menu = list.closest<HTMLElement>("[data-menu-material]")!;
    expect(menu.parentElement).toBe(document.body);
    expect(container.contains(list)).toBe(false);
    expect(anchor.style.anchorName).not.toBe("");
    expect(menu.style.positionAnchor).toBe(anchor.style.anchorName);
    expect(menu.style.left).toBe("");
    expect(menu.style.top).toBe("");
    await fireEvent(window, new Event("resize"));
    await fireEvent.scroll(container);
    expect(menu.style.positionAnchor).toBe(anchor.style.anchorName);
    expect(measure).not.toHaveBeenCalled();
  });
  it("gives independent job controls separate CSS anchors", () => {
    render(
      vueH(Fragment, {}, [
        vueH(JobListAction, { ...props([outputJob()]) }),
        vueH(JobListAction, { ...props([outputJob()]) }),
      ]),
    );
    const triggers = screen.getAllByRole("button", { name: "1 个后台任务" });
    const first = triggers[0]!.closest("div")!;
    const second = triggers[1]!.closest("div")!;
    expect(first.style.anchorName).not.toBe("");
    expect(second.style.anchorName).not.toBe("");
    expect(first.style.anchorName).not.toBe(second.style.anchorName);
  });
  it("keeps visual viewport changes out of inline placement and closes normally", async () => {
    const viewport = Object.assign(new EventTarget(), {
      width: 600,
      height: 500,
      offsetLeft: 40,
      offsetTop: 60,
    });
    vi.stubGlobal("visualViewport", viewport);
    const listen = vi.spyOn(viewport, "addEventListener");
    render(vueH(JobListAction, { ...props([outputJob()]) }));
    const trigger = screen.getByRole("button", { name: "1 个后台任务" });
    await fireEvent.click(trigger);
    const menu = screen
      .getByRole("list", { name: zh["list.aria"] })
      .closest<HTMLElement>("[data-menu-material]")!;
    const placement = menu.style.positionAnchor;
    await act(() => {
      viewport.offsetLeft = 100;
      viewport.offsetTop = 120;
      viewport.dispatchEvent(new Event("scroll"));
      viewport.height = 200;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(menu.style.positionAnchor).toBe(placement);
    expect(menu.style.left).toBe("");
    expect(menu.style.top).toBe("");
    expect(menu.style.getPropertyValue("--dsh-anchored-max-width")).toBe("");
    expect(menu.style.getPropertyValue("--dsh-anchored-max-height")).toBe("");
    expect(listen).not.toHaveBeenCalled();
    await fireEvent.click(trigger);
    expect(screen.queryByRole("list", { name: zh["list.aria"] })).toBeNull();
  });
  it("keeps portaled controls interactive and releases observation on dismissal and unmount", async () => {
    const stop = vi.fn();
    const observe = vi.fn(() => stop);
    const mountedView7 = render(vueH(JobListAction, { ...props([outputJob()], observe) }));
    const { container } = mountedView7;
    const unmount = (...args: Parameters<typeof mountedView7.unmount>) => {
      mountedView7.unmount(...args);
    };
    const trigger = screen.getByRole("button", { name: "1 个后台任务" });
    trigger.focus();
    await fireEvent.click(trigger);
    const list = screen.getByRole("list", { name: zh["list.aria"] });
    expect(container.contains(list)).toBe(false);
    const row = screen.getByRole("button", {
      name: zh["row.expandAria"].replace("{label}", "pnpm run build"),
    });
    await fireEvent.pointerDown(row);
    await fireEvent.click(row);
    expect(screen.getByRole("list", { name: zh["list.aria"] })).toBe(list);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    const kill = screen.getByTitle(zh["kill.stop"].replace("{label}", "pnpm run build"));
    await fireEvent.pointerDown(kill);
    await fireEvent.click(kill);
    expect(kill.getAttribute("data-kill-state")).toBe("armed");
    expect(screen.getByRole("list", { name: zh["list.aria"] })).toBe(list);
    row.focus();
    await fireEvent.keyDown(row, { key: "Escape" });
    expect(screen.queryByRole("list", { name: zh["list.aria"] })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(stop).toHaveBeenCalledTimes(1);
    await fireEvent.click(trigger);
    expect(observe).toHaveBeenCalledTimes(2);
    await fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("list", { name: zh["list.aria"] })).toBeNull();
    expect(stop).toHaveBeenCalledTimes(2);
    await fireEvent.click(trigger);
    expect(observe).toHaveBeenCalledTimes(3);
    const reopened = screen.getByRole("list", { name: zh["list.aria"] });
    unmount();
    expect(document.body.contains(reopened)).toBe(false);
    expect(stop).toHaveBeenCalledTimes(3);
  });
  it("ignores other keys while open and closes once the roster empties", async () => {
    const settledPair = [
      outputJob({ id: "bash-1" as JobView["id"], status: "completed", finishedAt: 2 }),
      outputJob({ id: "bash-2" as JobView["id"], status: "completed", finishedAt: 3 }),
    ];
    const mountedView8 = render(vueH(JobListAction, { ...props(settledPair) }));
    const rerender = (...args: Parameters<typeof mountedView8.rerender>) => {
      mountedView8.rerender(...args);
    };
    expect(screen.getByRole("button", { name: "2 个后台任务" })).toBeDefined();
    await openList();
    const list = screen.getByRole("list", { name: zh["list.aria"] });
    await fireEvent.keyDown(list, { key: "a" });
    expect(screen.getByRole("list", { name: zh["list.aria"] })).toBeDefined();
    // The roster emptying unmounts the control entirely; the open flag resets first.
    await act(() => {
      rerender(vueH(JobListAction, { ...props([]) }));
    });
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("starts observing on expand with the session identity, renders the live text, and stops on collapse", async () => {
    const stop = vi.fn();
    const observe = vi.fn(() => stop);
    const view: ObservedJob = {
      jobId: "bash-1" as JobView["id"],
      text: "compiling…\n",
      gapBefore: false,
      streaming: true,
    };
    render(vueH(JobListAction, { ...props([outputJob()], observe, { "bash-1": view }) }));
    await openList();
    await fireEvent.click(
      screen.getByRole("button", {
        name: zh["row.expandAria"].replace("{label}", "pnpm run build"),
      }),
    );
    expect(observe).toHaveBeenCalledWith(SESSION, "bash-1");
    expect(screen.getByText("compiling…")).toBeDefined();
    await fireEvent.click(
      screen.getByRole("button", {
        name: zh["row.collapseAria"].replace("{label}", "pnpm run build"),
      }),
    );
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("renders a running panel with the prompt alone for a live row whose output has not arrived", async () => {
    const view: ObservedJob = {
      jobId: "bash-1" as JobView["id"],
      text: "",
      gapBefore: false,
      streaming: true,
    };
    render(vueH(JobListAction, { ...props([job()], undefined, { "bash-1": view }) }));
    await openList();
    await fireEvent.click(
      screen.getByRole("button", {
        name: zh["row.expandAria"].replace("{label}", "pnpm run build"),
      }),
    );
    expect(
      screen.getByRole("list", { name: zh["list.aria"] }).querySelector("[data-running]"),
    ).not.toBeNull();
    expect(screen.queryByText(zh["terminal.noOutput"])).toBeNull();
  });
  it("surfaces retention gaps and stream failures above the panel", async () => {
    const view: ObservedJob = {
      jobId: "bash-1" as JobView["id"],
      text: "tail only",
      gapBefore: true,
      streaming: false,
      error: "connection lost",
    };
    render(vueH(JobListAction, { ...props([outputJob()], undefined, { "bash-1": view }) }));
    await openList();
    await fireEvent.click(
      screen.getByRole("button", {
        name: zh["row.expandAria"].replace("{label}", "pnpm run build"),
      }),
    );
    expect(screen.getByText(zh["output.gap"])).toBeDefined();
    expect(screen.getByText("实时输出流中断：connection lost")).toBeDefined();
  });
  it("bridges Tab between the trigger and the portaled list and closes on Escape", async () => {
    render(vueH(JobListAction, { ...props([job()]) }));
    const trigger = screen.getAllByRole("button")[0]!;
    await fireEvent.keyDown(trigger, { key: "Tab" });
    await openList();
    const [first, last] = within(screen.getByRole("list", { name: zh["list.aria"] })).getAllByRole(
      "button",
    );
    trigger.focus();
    // Shift+Tab from the trigger leaves toward the controls before it.
    expect(await fireEvent.keyDown(trigger, { key: "Tab", shiftKey: true })).toBe(true);
    expect(document.activeElement).toBe(trigger);
    // Tab from the trigger enters the list.
    expect(await fireEvent.keyDown(trigger, { key: "Tab" })).toBe(false);
    expect(document.activeElement).toBe(first);
    // Inside the list Tab stays the browser's until an end is reached.
    expect(await fireEvent.keyDown(first!, { key: "Tab" })).toBe(true);
    // Tab off the last control resumes from the trigger's place in the page.
    expect(await fireEvent.keyDown(last!, { key: "Tab" })).toBe(true);
    expect(document.activeElement).toBe(trigger);
    // Shift+Tab off the first control returns to the trigger itself.
    first!.focus();
    expect(await fireEvent.keyDown(first!, { key: "Tab", shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(trigger);
    first!.focus();
    await fireEvent.keyDown(first!, { key: "Escape" });
    expect(screen.queryByRole("list", { name: zh["list.aria"] })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("stops observation when the popover closes via Escape", async () => {
    const stop = vi.fn();
    render(vueH(JobListAction, { ...props([outputJob()], () => stop) }));
    await openList();
    await fireEvent.click(
      screen.getByRole("button", {
        name: zh["row.expandAria"].replace("{label}", "pnpm run build"),
      }),
    );
    await fireEvent.keyDown(screen.getByRole("list", { name: zh["list.aria"] }), { key: "Escape" });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("list", { name: zh["list.aria"] })).toBeNull();
  });
  it("folds an expanded panel whose row left the roster", async () => {
    const stop = vi.fn();
    // One stable observe identity across renders, as the inject face provides.
    const observe = () => stop;
    const mountedView9 = render(vueH(JobListAction, { ...props([outputJob()], observe) }));
    const rerender = (...args: Parameters<typeof mountedView9.rerender>) => {
      mountedView9.rerender(...args);
    };
    await openList();
    await fireEvent.click(
      screen.getByRole("button", {
        name: zh["row.expandAria"].replace("{label}", "pnpm run build"),
      }),
    );
    await act(() => {
      rerender(
        vueH(JobListAction, {
          ...props([outputJob({ id: "bash-2" as JobView["id"], label: "other" })], observe),
        }),
      );
    });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: zh["row.collapseAria"].replace("{label}", "other") }),
    ).toBeNull();
  });
});
describe("JobListAction human kill", () => {
  const stopTitle = (label: string): string => zh["kill.stop"].replace("{label}", label);
  it("offers the stop control only on running rows", async () => {
    render(
      vueH(JobListAction, {
        ...props([
          job(),
          job({
            id: "bash-2" as JobView["id"],
            label: "done",
            status: "completed",
            finishedAt: 1700000100000,
          }),
        ]),
      }),
    );
    await openList();
    expect(screen.getByTitle(stopTitle("pnpm run build"))).toBeDefined();
    expect(screen.queryByTitle(stopTitle("done"))).toBeNull();
  });
  it("arms on the first press and kills on the confirming press", async () => {
    const killJob = vi.fn(async () => true);
    render(vueH(JobListAction, { ...props([job()], undefined, {}, killJob) }));
    await openList();
    const stop = screen.getByTitle(stopTitle("pnpm run build"));
    await fireEvent.click(stop);
    expect(killJob).not.toHaveBeenCalled();
    expect(stop.getAttribute("data-kill-state")).toBe("armed");
    expect(screen.getByTitle(zh["kill.confirm"])).toBe(stop);
    // The armed step is legible without hover: the button carries the label.
    expect(stop.textContent).toBe(zh["kill.confirmAction"]);
    await act(async () => {
      await fireEvent.click(stop);
    });
    expect(killJob).toHaveBeenCalledWith(SESSION, "bash-1");
    // An admitted kill stays pending: the unary response and the jobs frames
    // have no cross-carrier ordering, so only the authoritative frame (the row
    // leaving the killable set) releases the control — never the response.
    expect(stop.getAttribute("data-kill-state")).toBe("pending");
    expect(stop.hasAttribute("disabled")).toBe(true);
  });
  it("an armed press disarms after the confirmation window", async () => {
    vi.useFakeTimers();
    const killJob = vi.fn(async () => true);
    render(vueH(JobListAction, { ...props([job()], undefined, {}, killJob) }));
    await openList();
    const stop = screen.getByTitle(stopTitle("pnpm run build"));
    await fireEvent.click(stop);
    expect(stop.getAttribute("data-kill-state")).toBe("armed");
    await act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(stop.getAttribute("data-kill-state")).toBe("idle");
    expect(killJob).not.toHaveBeenCalled();
  });
  it("a rejected kill shows its hint and then resets", async () => {
    // Fake timers from the start so the failed-hint reset arms on the fake clock.
    vi.useFakeTimers();
    const killJob = vi.fn(async () => false);
    render(vueH(JobListAction, { ...props([job()], undefined, {}, killJob) }));
    await openList();
    const stop = screen.getByTitle(stopTitle("pnpm run build"));
    await fireEvent.click(stop);
    await act(async () => {
      await fireEvent.click(stop);
    });
    expect(stop.getAttribute("data-kill-state")).toBe("failed");
    expect(screen.getByTitle(zh["kill.failed"])).toBe(stop);
    await act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(stop.getAttribute("data-kill-state")).toBe("idle");
  });
  it("arming a second row disarms the first", async () => {
    render(
      vueH(JobListAction, {
        ...props([job(), job({ id: "bash-2" as JobView["id"], label: "pnpm run watch" })]),
      }),
    );
    await openList();
    const first = screen.getByTitle(stopTitle("pnpm run build"));
    await fireEvent.click(first);
    expect(first.getAttribute("data-kill-state")).toBe("armed");
    const second = screen.getByTitle(stopTitle("pnpm run watch"));
    await fireEvent.click(second);
    expect(second.getAttribute("data-kill-state")).toBe("armed");
    expect(first.getAttribute("data-kill-state")).toBe("idle");
  });
  it("a kill resolving after another row armed leaves the newer phase alone", async () => {
    let resolveKill!: (ok: boolean) => void;
    const killJob = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveKill = resolve;
        }),
    );
    render(
      vueH(JobListAction, {
        ...props(
          [job(), job({ id: "bash-2" as JobView["id"], label: "pnpm run watch" })],
          undefined,
          {},
          killJob,
        ),
      }),
    );
    await openList();
    const first = screen.getByTitle(stopTitle("pnpm run build"));
    await fireEvent.click(first);
    await fireEvent.click(first);
    expect(killJob).toHaveBeenCalledTimes(1);
    // While the first kill is in flight, the user arms the second row; the
    // late resolution must not clobber that newer phase.
    const second = screen.getByTitle(stopTitle("pnpm run watch"));
    await fireEvent.click(second);
    expect(second.getAttribute("data-kill-state")).toBe("armed");
    await act(async () => {
      resolveKill(false);
    });
    expect(second.getAttribute("data-kill-state")).toBe("armed");
    expect(first.getAttribute("data-kill-state")).toBe("idle");
  });
  it("clears an armed phase whose row stopped being killable", async () => {
    const mountedView10 = render(vueH(JobListAction, { ...props([job()]) }));
    const rerender = (...args: Parameters<typeof mountedView10.rerender>) => {
      mountedView10.rerender(...args);
    };
    await openList();
    const stop = screen.getByTitle(stopTitle("pnpm run build"));
    await fireEvent.click(stop);
    expect(stop.getAttribute("data-kill-state")).toBe("armed");
    await act(() => {
      rerender(vueH(JobListAction, { ...props([job({ status: "stopping" })]) }));
    });
    // The stopping row offers no kill control any more, and the stale phase is gone.
    expect(screen.queryByTitle(stopTitle("pnpm run build"))).toBeNull();
    expect(document.querySelector("[data-kill-state]")).toBeNull();
  });
});
it.each([1, 2, 5, 21])("renders count-independent Russian labels for %i jobs", async (count) => {
  const jobs = Array.from({ length: count }, (_, i) => job({ id: `job-${i}` as JobView["id"] }));
  const translate: JobListActionProps["t"] = makeTranslate(ru);
  const view = render(vueH(JobListAction, { ...props(jobs), t: translate }));
  expect(screen.getByRole("button", { name: `Фоновые задачи: ${count}` })).toBeDefined();
  await act(() => {
    view.rerender(
      vueH(JobListAction, {
        ...props(jobs.map((item) => ({ ...item, status: "completed", finishedAt: 1700000003000 }))),
        t: translate,
      }),
    );
  });
  expect(screen.getByRole("button", { name: `Фоновые задачи: ${count}` })).toBeDefined();
});
