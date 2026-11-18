import { h } from "vue";
// @vitest-environment jsdom
/** Session terminal recovery hides ordinary work and keeps failed lookup retryable. */
import { afterEach, expect, it, vi } from "vite-plus/test";
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { fireEvent } from "@testing-library/dom";
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { TerminalRecovery } from "../src/client/TerminalRecovery.tsx";
import { en } from "../src/client/locales.ts";
afterEach(cleanup);
function props(restore: () => Promise<void>): InstanceType<typeof TerminalRecovery>["$props"] {
  // The renderer supplies Session shares; recovery needs only the injected callback and copy.
  return { restore, t: makeTranslate(en) } as InstanceType<typeof TerminalRecovery>["$props"];
}
it("restores on mount without adding controls during a successful lookup", async () => {
  const pending = Promise.withResolvers<undefined>();
  const restore = vi.fn(() => pending.promise);
  const view = render(h(TerminalRecovery, { ...props(restore) }));
  try {
    expect(restore).toHaveBeenCalledOnce();
    expect(view.container.childElementCount).toBe(0);
    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });
    await view.rerender(h(TerminalRecovery, { ...props(restore) }));
    expect(restore).toHaveBeenCalledOnce();
    expect(view.container.childElementCount).toBe(0);
  } finally {
    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });
  }
});
it.each([new Error("Host unavailable"), "Host unavailable"])(
  "offers recovery retry for a failed lookup: %s",
  async (reason) => {
    const pending = Promise.withResolvers<undefined>();
    const restore = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(reason)
      .mockImplementationOnce(() => pending.promise);
    const view = render(h(TerminalRecovery, { ...props(restore) }));
    try {
      const retry = await view.findByRole("button", { name: en.retryRecovery });
      expect(retry.getAttribute("title")).toBe("Terminal recovery failed: Host unavailable");
      await act(() => {
        fireEvent.click(retry);
      });
      expect(restore).toHaveBeenCalledTimes(2);
      expect(view.container.childElementCount).toBe(0);
      await act(async () => {
        pending.resolve(undefined);
        await pending.promise;
      });
      expect(view.container.childElementCount).toBe(0);
    } finally {
      await act(async () => {
        pending.resolve(undefined);
        await pending.promise;
      });
    }
  },
);
it("keeps the current Session failure when an earlier Session lookup later succeeds", async () => {
  const pending = Promise.withResolvers<undefined>();
  const previous = vi.fn(() => pending.promise);
  const current = vi.fn(async () => {
    throw new Error("Current Session failed");
  });
  const view = render(h(TerminalRecovery, { ...props(previous) }));
  try {
    await view.rerender(h(TerminalRecovery, { ...props(current) }));
    const retry = await view.findByRole("button", { name: en.retryRecovery });
    expect(retry.getAttribute("title")).toContain("Current Session failed");
    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });
    expect(view.getByRole("button", { name: en.retryRecovery }).getAttribute("title")).toContain(
      "Current Session failed",
    );
  } finally {
    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });
  }
});
it("ignores an earlier Session failure after a replacement Session recovers", async () => {
  const pending = Promise.withResolvers<undefined>();
  const previous = vi.fn(() => pending.promise);
  const completed = Promise.resolve();
  const current = vi.fn(() => completed);
  const view = render(h(TerminalRecovery, { ...props(previous) }));
  try {
    await view.rerender(h(TerminalRecovery, { ...props(current) }));
    await act(async () => {
      await completed;
    });
    await act(async () => {
      pending.reject(new Error("Previous Session failed"));
      await expect(pending.promise).rejects.toThrow("Previous Session failed");
    });
    expect(view.container.childElementCount).toBe(0);
  } finally {
    pending.resolve(undefined);
    await Promise.allSettled([pending.promise]);
  }
});
