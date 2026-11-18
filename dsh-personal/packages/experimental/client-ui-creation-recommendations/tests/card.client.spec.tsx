// @vitest-environment jsdom
import { h as vueH, Fragment, reactive } from "vue";
import { act, cleanup, fireEvent, render, screen, waitFor } from "./vue-render.client.ts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { brandString } from "@deepseek-ai/dsh-brand";
import type { ActionCardId } from "@deepseek-ai/dsh-action-cards/types";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { FoldedText } from "@deepseek-ai/dsh-client-ui-action-cards/src/client/Card.tsx";
import type { ActionCardFields, ActionCardResult } from "@deepseek-ai/dsh-action-cards/types";
import { PageCardBody, type PageCardProps } from "../src/client/Card.tsx";
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { en, zh } from "../src/client/locales.ts";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const cardId = brandString<ActionCardId>("creation-1");
const ACTION = "create_personalized_page";
type Act = (verb: string, payload?: ActionCardFields) => Promise<ActionCardResult | undefined>;
function props(
  decision?: {
    phase: string;
    data?: ActionCardFields;
  },
  chinese = true,
  details: ActionCardFields = { slot: "sidebar-right" },
): PageCardProps & {
  act: ReturnType<typeof vi.fn<Act>>;
} {
  const proposal = {
    cardId,
    turn: 1,
    action: ACTION,
    title: "Counter",
    brief: "Keep my task count visible.",
    details,
  };
  return {
    proposal,
    decision: decision === undefined ? undefined : { cardId, action: ACTION, ...decision },
    sessionId: brandString<SessionId>("session-1"),
    summary: vueH(Fragment, {}, [
      vueH("strong", {}, [proposal.title]),
      vueH("p", {}, [proposal.brief]),
    ]),
    fallback: vueH("p", {}, ["frame fallback"]),
    Folded: FoldedText,
    act: vi.fn<Act>(async () => ({ status: "accepted" })),
    infoDismissed: createSnapshotStore(true),
    t: makeTranslate(chinese ? zh : en),
  };
}
it("starts with the recommended location, lets the user change it, and starts only on Create", async () => {
  const value = props();
  render(vueH(PageCardBody, { ...value }));
  expect(screen.getByText("Counter")).toBeTruthy();
  const location = screen.getByRole("button", { name: "添加到: 右侧栏" });
  expect(screen.queryByRole("menu")).toBeNull();
  await fireEvent.click(location);
  expect(screen.getAllByRole("menuitem")).toHaveLength(4);
  await fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  await fireEvent.click(location);
  await fireEvent.click(screen.getByRole("menuitem", { name: /会话 Tab/ }));
  expect(screen.queryByRole("menu")).toBeNull();
  expect(value.act).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole("button", { name: "创建" }));
  await waitFor(() => {
    expect(value.act).toHaveBeenCalledExactlyOnceWith("create", { slot: "page" });
  });
});
it("ignores a stale Create button when proposal details become invalid before the render flush", async () => {
  const value = props(undefined, false);
  const proposal = reactive({ ...value.proposal });
  render(vueH(PageCardBody, { ...value, proposal }));
  const create = screen.getByRole<HTMLButtonElement>("button", { name: "Create" });
  await act(() => {
    proposal.details = { slot: "invalid" };
    create.click();
  });
  expect(value.act).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  expect(screen.getByText("frame fallback")).toBeTruthy();
  expect(screen.queryByText("Counter")).toBeNull();
});
it("requires a written location, preserves its draft, and passes only the chosen location on Create", async () => {
  const value = props();
  const mountedView1 = render(vueH(PageCardBody, { ...value }));
  const rerender = (...args: Parameters<typeof mountedView1.rerender>) =>
    mountedView1.rerender(...args);
  await fireEvent.click(screen.getByRole("button", { name: "添加到: 右侧栏" }));
  await fireEvent.click(screen.getByRole("menuitem", { name: /自行撰写/ }));
  const input = screen.getByRole("textbox", { name: zh.customLabel });
  expect(screen.getByRole("button", { name: "创建" }).hasAttribute("disabled")).toBe(true);
  await fireEvent.change(input, { target: { value: "  左侧入口打开全屏日历  " } });
  expect(value.act).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole("button", { name: "创建" }));
  await waitFor(() => {
    expect(value.act).toHaveBeenCalledWith("create", {
      slot: "sidebar-right",
      customLocation: "左侧入口打开全屏日历",
    });
  });
  await rerender(vueH(PageCardBody, { ...value }));
  await fireEvent.click(screen.getByRole("button", { name: "添加到: 自行撰写" }));
  await fireEvent.click(screen.getByRole("menuitem", { name: /全局页面/ }));
  expect(screen.queryByRole("textbox")).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "创建" }));
  await waitFor(() => {
    expect(value.act).toHaveBeenLastCalledWith("create", { slot: "sidebar-left" });
  });
  await fireEvent.click(screen.getByRole("button", { name: "添加到: 全局页面" }));
  await fireEvent.click(screen.getByRole("menuitem", { name: /自行撰写/ }));
  expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toBe("  左侧入口打开全屏日历  ");
});
it("shows the recorded placement once settled, not the location picked before the decision", async () => {
  const value = props(undefined, false);
  const mountedView2 = render(vueH(PageCardBody, { ...value }));
  const rerender = (...args: Parameters<typeof mountedView2.rerender>) =>
    mountedView2.rerender(...args);
  await fireEvent.click(screen.getByRole("button", { name: "Add to: Right sidebar" }));
  await fireEvent.click(screen.getByRole("menuitem", { name: /Write your own/ }));
  await fireEvent.change(screen.getByRole("textbox", { name: en.customLabel }), {
    target: { value: "Next to the composer" },
  });
  await rerender(
    vueH(PageCardBody, {
      ...props({ phase: "dismissed", data: { slot: "sidebar-right" } }, false),
    }),
  );
  expect(screen.getByText("Add to · Right sidebar")).toBeTruthy();
  expect(screen.queryByText(/Next to the composer/)).toBeNull();
});
it("restores a written location after cancellation and preserves it on retry", async () => {
  const value = props({
    phase: "cancelled",
    data: { slot: "page", customLocation: "右侧查看当前会话的 Context" },
  });
  const mountedView3 = render(vueH(PageCardBody, { ...value }));
  const rerender = (...args: Parameters<typeof mountedView3.rerender>) =>
    mountedView3.rerender(...args);
  expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toBe("右侧查看当前会话的 Context");
  await fireEvent.click(screen.getByRole("button", { name: "重新创建" }));
  await waitFor(() => {
    expect(value.act).toHaveBeenCalledWith("create", {
      slot: "page",
      customLocation: "右侧查看当前会话的 Context",
    });
  });
  await rerender(
    vueH(PageCardBody, {
      ...props({
        phase: "installed",
        data: { slot: "page", customLocation: "右侧查看当前会话的 Context" },
      }),
    }),
  );
  expect(screen.getByText("添加到 · 右侧查看当前会话的 Context")).toBeTruthy();
});
it("opens the cost notice until dismissed, remembers dismissal, and allows reopening", async () => {
  const value = props();
  value.infoDismissed.set(false);
  const first = render(vueH(PageCardBody, { ...value }));
  expect(screen.getByRole("note").textContent).toContain(zh.creationCost);
  await fireEvent.click(screen.getByRole("button", { name: zh.creationInfo }));
  expect(value.infoDismissed.getSnapshot()).toBe(true);
  expect(screen.queryByRole("note")).toBeNull();
  first.unmount();
  render(vueH(PageCardBody, { ...value }));
  expect(screen.queryByRole("note")).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: zh.creationInfo }));
  expect(screen.getByRole("note").textContent).toContain(zh.creationBackground);
  expect(value.act).not.toHaveBeenCalled();
});
it("disables pending decisions, labels only a pending Create as starting, and supports dismissal without starting a child", async () => {
  const value = props();
  value.infoDismissed.set(false);
  const dismissal = Promise.withResolvers<ActionCardResult | undefined>();
  const creation = Promise.withResolvers<ActionCardResult | undefined>();
  value.act.mockReturnValueOnce(dismissal.promise).mockReturnValueOnce(creation.promise);
  render(vueH(PageCardBody, { ...value }));
  await fireEvent.click(screen.getByRole("button", { name: "暂不需要" }));
  expect(value.infoDismissed.getSnapshot()).toBe(true);
  expect(screen.getByRole("button", { name: "添加到: 右侧栏" }).hasAttribute("disabled")).toBe(
    true,
  );
  expect(screen.getByRole("button", { name: "暂不需要" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "创建" }).hasAttribute("disabled")).toBe(true);
  expect(screen.queryByRole("button", { name: "开始创建…" })).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: zh.creationInfo }));
  expect(screen.getByRole("note").textContent).toContain(zh.creationCost);
  expect(value.act).toHaveBeenCalledWith("dismiss", { slot: "sidebar-right" });
  await act(async () => {
    dismissal.resolve({
      status: "settled",
      decision: { cardId, action: ACTION, phase: "dismissed" },
    });
  });
  await fireEvent.click(screen.getByRole("button", { name: "创建" }));
  expect(screen.getByRole("button", { name: "开始创建…" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "暂不需要" }).hasAttribute("disabled")).toBe(true);
  await act(async () => {
    creation.resolve({ status: "accepted" });
  });
  expect(screen.getByRole("button", { name: "创建" }).hasAttribute("disabled")).toBe(false);
});
it.each(["installing", "dismissed", "replaced"] as const)(
  "restores %s without repeat actions",
  (phase) => {
    render(
      vueH(PageCardBody, {
        ...props(
          phase === "replaced" ? { phase } : { phase, data: { slot: "sidebar-left" } },
          false,
          { slot: "sidebar-left" },
        ),
      }),
    );
    expect(screen.getByRole("status").textContent).toBe(en[phase]);
    expect(screen.getAllByRole("button")).toEqual([
      screen.getByRole("button", { name: en.creationInfo }),
    ]);
    expect(screen.getByText("Add to · Global page")).toBeTruthy();
  },
);
it.each([true, false])(
  "explains cost and background creation without starting work (Chinese: %s)",
  async (chinese) => {
    const value = props(undefined, chinese);
    const copy = chinese ? zh : en;
    render(vueH(PageCardBody, { ...value }));
    const button = screen.getByRole("button", { name: copy.creationInfo });
    expect(screen.queryByRole("note")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await fireEvent.click(button);
    const note = screen.getByRole("note");
    expect(note.id).toBe(button.getAttribute("aria-controls"));
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(note.textContent).toContain(copy.creationMethod);
    expect(note.textContent).toContain(copy.creationCost);
    expect(note.textContent).toContain(copy.creationBackground);
    expect(screen.getByRole("button", { name: copy.create }).hasAttribute("disabled")).toBe(false);
    await fireEvent.click(button);
    expect(screen.queryByRole("note")).toBeNull();
    expect(value.act).not.toHaveBeenCalled();
  },
);
it("offers cancellation beside the location during generation, then waits for cleanup before retrying", async () => {
  const value = props({
    phase: "creating",
    data: { slot: "page", bundleName: "@dsh-local/view-fixture" },
  });
  const pending = Promise.withResolvers<ActionCardResult | undefined>();
  value.act.mockImplementation(() => pending.promise);
  const mountedView4 = render(vueH(PageCardBody, { ...value }));
  const rerender = (...args: Parameters<typeof mountedView4.rerender>) =>
    mountedView4.rerender(...args);
  expect(screen.queryByText(zh.sourceRetained)).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: zh.creationInfo }));
  expect(screen.getByText(zh.sourceRetained)).toBeTruthy();
  const cancel = screen.getByRole("button", { name: "取消创建" });
  expect(cancel.parentElement).toBe(screen.getByText(`${zh.location} · ${zh.page}`).parentElement);
  await fireEvent.click(cancel);
  expect(value.act).toHaveBeenCalledWith("cancel", undefined);
  expect(screen.getByRole("button", { name: "正在取消…" }).hasAttribute("disabled")).toBe(true);
  expect(screen.queryByRole("button", { name: "重新创建" })).toBeNull();
  await act(async () => {
    pending.resolve({ status: "accepted" });
  });
  await rerender(vueH(PageCardBody, { ...props({ phase: "cancelled", data: { slot: "page" } }) }));
  expect(screen.getByRole("button", { name: "重新创建" })).toBeTruthy();
  await rerender(vueH(PageCardBody, { ...props({ phase: "installing", data: { slot: "page" } }) }));
  expect(screen.getByRole("status").textContent).toBe(zh.installing);
  expect(screen.queryByRole("button", { name: "取消创建" })).toBeNull();
});
it.each(["failed", "interrupted", "cancelled", "unconfirmed"] as const)(
  "offers an explicit retry after %s",
  async (phase) => {
    const value = props({ phase, data: { slot: "page" } });
    render(vueH(PageCardBody, { ...value }));
    await fireEvent.click(screen.getByRole("button", { name: "重新创建" }));
    await waitFor(() => {
      expect(value.act).toHaveBeenCalledWith("create", { slot: "page" });
    });
  },
);
it("offers only Undo, beside the location, on installed and earlier kept plugins, with the actual application outcome", async () => {
  const value = props({ phase: "installed", data: { slot: "page", application: "applied" } });
  const mountedView5 = render(vueH(PageCardBody, { ...value }));
  const rerender = (...args: Parameters<typeof mountedView5.rerender>) =>
    mountedView5.rerender(...args);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  const undo = screen.getByRole("button", { name: zh.undo });
  expect(screen.getAllByRole("button")).toEqual([
    screen.getByRole("button", { name: zh.creationInfo }),
    undo,
  ]);
  expect(undo.parentElement).toBe(screen.getByText(`${zh.location} · ${zh.page}`).parentElement);
  await fireEvent.click(undo);
  await waitFor(() => {
    expect(value.act).toHaveBeenCalledWith("undo", undefined);
  });
  const kept = props({ phase: "kept", data: { slot: "page", application: "restart-required" } });
  await rerender(vueH(PageCardBody, { ...kept }));
  expect(screen.getByText(zh["restart-required"])).toBeTruthy();
  expect(screen.getAllByRole("button")).toEqual([
    screen.getByRole("button", { name: zh.creationInfo }),
    screen.getByRole("button", { name: zh.undo }),
  ]);
  await fireEvent.click(screen.getByRole("button", { name: zh.undo }));
  await waitFor(() => {
    expect(kept.act).toHaveBeenCalledWith("undo", undefined);
  });
});
it("offers only Restore on a removed card, labels it while pending and explains missing page files", async () => {
  const value = props({
    phase: "removed",
    data: { slot: "page", bundleName: "@dsh-local/view-fixture", application: "applied" },
  });
  const pending = Promise.withResolvers<ActionCardResult | undefined>();
  value.act.mockImplementation(() => pending.promise);
  render(vueH(PageCardBody, { ...value }));
  expect(screen.getByRole("status").textContent).toBe(zh.removed);
  const restore = screen.getByRole("button", { name: zh.restore });
  expect(screen.getAllByRole("button")).toEqual([
    screen.getByRole("button", { name: zh.creationInfo }),
    restore,
  ]);
  expect(restore.parentElement).toBe(screen.getByText(`${zh.location} · ${zh.page}`).parentElement);
  await fireEvent.click(restore);
  expect(value.act).toHaveBeenCalledExactlyOnceWith("restore", undefined);
  expect(screen.getByRole("button", { name: zh.restoring }).hasAttribute("disabled")).toBe(true);
  await act(async () => {
    pending.resolve({ status: "refused", reason: "source-missing" });
  });
  expect(screen.getByRole("alert").textContent).toBe(zh["source-missing"]);
  expect(screen.getByRole("button", { name: zh.restore }).hasAttribute("disabled")).toBe(false);
});
it.each([
  ["installed", "failed", zh.applicationFailed],
  ["kept", "cancelled", zh.applicationCancelled],
  ["removed", "overridden", zh.overridden],
] as const)(
  "describes a %s receipt whose change ended %s with application copy, not phase copy",
  (phase, application, text) => {
    render(vueH(PageCardBody, { ...props({ phase, data: { slot: "page", application } }) }));
    expect(screen.getAllByRole("status").map((status) => status.textContent)).toEqual([
      zh[phase],
      text,
    ]);
  },
);
it("leaves a failed creation to its phase line when the change also failed to apply", () => {
  render(
    vueH(PageCardBody, {
      ...props({ phase: "failed", data: { slot: "page", application: "failed" } }),
    }),
  );
  expect(screen.getAllByRole("status").map((status) => status.textContent)).toEqual([zh.failed]);
});
it("keeps uncertain actions recoverable on refusal and connection loss", async () => {
  const value = props();
  value.act
    .mockResolvedValueOnce({ status: "refused", reason: "unavailable" })
    .mockResolvedValueOnce({ status: "refused", reason: "read-only" })
    .mockResolvedValueOnce({ status: "unconfirmed", reason: "later-reason" })
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("disconnected"));
  render(vueH(PageCardBody, { ...value }));
  for (const text of [
    zh.unavailable,
    zh["read-only"],
    zh.unavailable,
    zh.transport,
    zh.transport,
  ]) {
    await fireEvent.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(text);
    });
  }
});
it("shows supplied initial content as folded data below the plan and omits it otherwise", async () => {
  const view = render(vueH(PageCardBody, { ...props() }));
  expect(screen.queryByText("预填内容")).toBeNull();
  const items = "1. 导出成功\n2. 断网提示清楚";
  await view.rerender(
    vueH(PageCardBody, {
      ...props(undefined, true, { slot: "sidebar-right", initialContent: items }),
    }),
  );
  expect(screen.getByText("预填内容")).toBeTruthy();
  expect(screen.getByText(/导出成功/).textContent).toBe(items);
  expect(screen.queryByRole("button", { name: "展开内容" })).toBeNull();
  await view.rerender(
    vueH(PageCardBody, {
      ...props(undefined, true, { slot: "sidebar-right", initialContent: "条".repeat(131) }),
    }),
  );
  await fireEvent.click(screen.getByRole("button", { name: "展开内容" }));
  expect(screen.getByRole("button", { name: "收起内容" }).getAttribute("aria-expanded")).toBe(
    "true",
  );
});
it("shows only the frame fallback for invalid fields and ignores unknown phases and invalid data", () => {
  const invalid = render(vueH(PageCardBody, { ...props(undefined, true, { slot: "elsewhere" }) }));
  expect(screen.getByText("frame fallback")).toBeTruthy();
  expect(screen.queryByText("Counter")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  invalid.unmount();
  render(
    vueH(PageCardBody, { ...props({ phase: "archived", data: { slot: "elsewhere" } }, false) }),
  );
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByText("Add to · Right sidebar")).toBeTruthy();
});
