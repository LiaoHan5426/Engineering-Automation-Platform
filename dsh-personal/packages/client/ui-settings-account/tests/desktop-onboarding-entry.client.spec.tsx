import { h, shallowRef, computed } from "vue";
// @vitest-environment jsdom
import type { GlobalStandardProps } from "@deepseek-ai/dsh-client-ui-slots";
import { screen } from "@testing-library/dom";
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { AccountSnapshot } from "../src/client/AccountSection.tsx";
import { DesktopOnboardingEntry } from "../src/client/DesktopOnboardingEntry.tsx";
import type { DesktopOnboardingState } from "../src/client/onboarding-contract.ts";
import { zh, type AccountKey } from "../src/client/locales.ts";
let appRoot: HTMLDivElement;
it.each([false, true])("resizes only after eligibility resolves (completed=%s)", async (done) => {
  const setActive = vi.fn();
  vi.stubGlobal("dshOnboarding", { setActive });
  const view = await mount(done, true);
  expect(setActive).not.toHaveBeenCalled();
  await view.resolve();
  if (done) expect(setActive).not.toHaveBeenCalled();
  else {
    expect(setActive).toHaveBeenCalledExactlyOnceWith(true);
    await view.finish();
    expect(setActive).toHaveBeenLastCalledWith(false);
  }
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  appRoot = document.createElement("div");
  appRoot.id = "root";
  appRoot.inert = false;
  document.body.append(appRoot);
});
afterEach(() => {
  cleanup();
  appRoot.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount(initiallyDone = false, initiallyLoading = false) {
  const state = shallowRef<DesktopOnboardingState>({
    creditFunded: false,
    visible: !initiallyDone && !initiallyLoading,
    status: initiallyLoading ? "loading" : "ready",
    error: null,
    progress: {
      version: 1,
      step: initiallyDone ? "done" : "welcome",
      purpose: null,
      process: null,
      completion: initiallyDone ? "completed" : null,
      usage: "compact",
      developerTools: false,
    },
  });
  const account = shallowRef<AccountSnapshot>({
    view: {
      status: "credential-stored",
      attempt: null,
      links: { usageUrl: "https://example.com/usage", topUpUrl: "https://example.com/top_up" },
    },
    failed: false,
    details: undefined,
    avatar: undefined,
  });
  // This entry consumes only its injected selectors; the shell owns the global hooks.
  const globals = {} as GlobalStandardProps;
  const setVisible = vi.fn();
  const element = () =>
    h(DesktopOnboardingEntry, {
      ...globals,
      setVisible: setVisible,
      useOnboarding: (select) => computed(() => select(state.value)),
      useAccount: (select) => computed(() => select(account.value)),
      update: async () => true,
      complete: async () => true,
      retry: async () => true,
      t: (key) => (key in zh ? zh[key as AccountKey] : key),
    });
  const view = render(element());
  await act(() => {
    vi.runOnlyPendingTimers();
  });
  return {
    unmount: () => {
      view.unmount();
    },
    setVisible,
    async resolve() {
      state.value = { ...state.value, status: "ready", visible: !initiallyDone };
      await view.rerender(element());
    },
    async finish(status: DesktopOnboardingState["status"] = "ready") {
      state.value = {
        ...state.value,
        visible: false,
        status,
        progress: { ...state.value.progress, step: "done", completion: "completed" },
      };
      await view.rerender(element());
    },
    async fail() {
      state.value = { ...state.value, status: "error", error: "settings" };
      await view.rerender(element());
    },
    async signOut() {
      account.value = { ...account.value, view: { ...account.value.view!, status: "signed-out" } };
      state.value = { ...state.value, visible: false };
      await view.rerender(element());
    },
  };
}
it("retains the last page while successful completion reveals the workspace", async () => {
  const view = await mount();
  expect(appRoot.style.opacity).toBe("0");
  await view.finish();
  expect(
    screen.getByRole("heading", { name: `${zh.onboardingWelcome} ${zh.onboardingBrand}` }),
  ).toBeTruthy();
  expect(document.querySelector("[data-exiting]")).not.toBeNull();
  expect(appRoot.style.opacity).toBe("");
  expect(appRoot.inert).toBe(true);
  await act(() => {
    vi.advanceTimersByTime(179);
  });
  expect(document.querySelector("[data-exiting]")).not.toBeNull();
  await act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(document.querySelector("[data-exiting]")).toBeNull();
  expect(appRoot.inert).toBe(false);
});
it("keeps a failed completion visible and the workspace hidden", async () => {
  const view = await mount();
  await view.fail();
  await act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(
    screen.getByRole("heading", { name: `${zh.onboardingWelcome} ${zh.onboardingBrand}` }),
  ).toBeTruthy();
  expect(document.querySelector("[data-exiting]")).toBeNull();
  expect(appRoot.inert).toBe(true);
  expect(appRoot.style.opacity).toBe("0");
});
it("waits for completion confirmation after the settings stream first reports done", async () => {
  const view = await mount();
  await view.finish("saving");
  expect(screen.getByRole("heading")).toBeTruthy();
  expect(screen.getByRole("button", { name: zh.onboardingStart }).hasAttribute("disabled")).toBe(
    true,
  );
  expect(document.querySelector("[data-exiting]")).toBeNull();
  expect(appRoot.style.opacity).toBe("0");
  await act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(appRoot.inert).toBe(true);
  await view.finish();
  expect(document.querySelector("[data-exiting]")).not.toBeNull();
  await act(() => {
    vi.advanceTimersByTime(180);
  });
  expect(screen.queryByRole("heading")).toBeNull();
  expect(appRoot.inert).toBe(false);
});
it("removes the completed page immediately when motion is reduced", async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  const view = await mount();
  await view.finish();
  expect(screen.queryByRole("heading")).toBeNull();
  expect(appRoot.inert).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
it("does not replay an exit when an already completed installation mounts", async () => {
  await mount(true);
  expect(screen.queryByRole("heading")).toBeNull();
  expect(appRoot.inert).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
it.each([false, true])(
  "removes onboarding immediately on sign-out, including during exit=%s",
  async (exiting) => {
    const view = await mount();
    if (exiting) await view.finish();
    await view.signOut();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(appRoot.inert).toBe(false);
    expect(appRoot.style.opacity).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  },
);
it("cancels pending completion teardown when the entry unmounts", async () => {
  const view = await mount();
  await view.finish();
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(appRoot.inert).toBe(false);
  expect(appRoot.style.opacity).toBe("");
});
it.each([false, true])(
  "covers the workspace until initial onboarding eligibility resolves (completed=%s)",
  async (done) => {
    const view = await mount(done, true);
    expect(appRoot.inert).toBe(true);
    expect(appRoot.style.opacity).toBe("0");
    expect(screen.getByRole("status").textContent).toBe(zh.onboardingLoading);
    await view.resolve();
    expect(screen.queryByRole("status")).toBeNull();
    expect(appRoot.inert).toBe(!done);
    if (!done) expect(screen.getByRole("button", { name: zh.onboardingStart })).toBeTruthy();
  },
);
it("withholds notices through loading, completion confirmation, and the exit animation", async () => {
  const view = await mount(false, true);
  expect(view.setVisible).toHaveBeenLastCalledWith(true);
  await view.resolve();
  await view.finish("saving");
  expect(view.setVisible).not.toHaveBeenCalledWith(false);
  await view.finish();
  await act(() => {
    vi.advanceTimersByTime(179);
  });
  expect(view.setVisible).not.toHaveBeenCalledWith(false);
  await act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(view.setVisible).toHaveBeenLastCalledWith(false);
});
it("does not release notices when onboarding is closed before completion", async () => {
  const view = await mount();
  view.unmount();
  expect(view.setVisible).not.toHaveBeenCalledWith(false);
});
