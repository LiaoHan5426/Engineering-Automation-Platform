import { h, nextTick } from "vue";
// @vitest-environment jsdom
/** The Subagent page as the Plugins page renders it: both sections on one page with one save. */
import {
  act,
  cleanup,
  render as mountNative,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import { fireEvent as dispatchDom, screen } from "@testing-library/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindSnapshotSelector } from "@deepseek-ai/dsh-client-test-runtime";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { SubagentCard, type SubagentCardProps } from "../src/client/SubagentCard.tsx";
import type { SubagentLimitsCardState } from "../src/client/subagent-limits-card-controller.ts";
import type { SettingsFieldState, SettingsFormShell } from "@deepseek-ai/dsh-client-ui-primitives";
import type { SubagentModelSelectionCardState } from "../src/client/subagent-model-selection-card-controller.ts";
import { en } from "../src/client/locales.ts";
afterEach(cleanup);
const t = (key: keyof typeof en) => en[key];
const settled: SettingsFormShell = {
  available: true,
  writable: true,
  dirty: false,
  invalid: false,
  saving: false,
  failed: false,
};
function field(text: string, rest: Partial<SettingsFieldState> = {}): SettingsFieldState {
  return { text, overridden: false, invalid: false, ...rest };
}
/** The Plugins page asks a configuration entry for its one-liner or its form; every page renders as `page` unless a test says otherwise. */
type ConfigView = "summary" | "page";
async function renderSubagent(
  limitState: Partial<SubagentLimitsCardState> = {},
  modelState: Partial<SubagentModelSelectionCardState> = {},
  view: ConfigView = "page",
) {
  const limits = createSnapshotStore<SubagentLimitsCardState>({
    ...settled,
    maxDepth: field("3"),
    maxActiveSubagents: field("8"),
    ...limitState,
  });
  const models = createSnapshotStore<SubagentModelSelectionCardState>({
    ...settled,
    enabled: false,
    candidates: [],
    catalogStatus: "idle",
    catalogPartial: false,
    conflicted: false,
    ...modelState,
  });
  const actions = {
    editLimit: vi.fn(),
    resetLimit: vi.fn(),
    toggleEnabled: vi.fn(),
    toggleModel: vi.fn(),
    retryCatalog: vi.fn(),
    save: vi.fn(),
    discard: vi.fn(),
  };
  const props = {
    ...actions,
    view,
    t,
    useSubagentLimitsCard: bindSnapshotSelector(limits),
    useSubagentModelSelectionCard: bindSnapshotSelector(models),
  } as SubagentCardProps;
  await render(h(SubagentCard, { ...props }));
  return { actions, limits, models };
}
async function renderSubagentModelSelection(
  state: Partial<SubagentModelSelectionCardState> = {},
  view: ConfigView = "page",
) {
  return (await renderSubagent({ available: false }, state, view)).actions;
}
describe("Subagent model selection fields", () => {
  it("renders the default-off preference in its staged plugin card", async () => {
    const actions = await renderSubagentModelSelection();
    const control = screen.getByRole("switch", { name: en.subagentModelSelectionToggle });
    expect(control.getAttribute("aria-checked")).toBe("false");
    await fireEvent.click(control);
    expect(actions.toggleEnabled).toHaveBeenCalledOnce();
  });
  it("groups available adapter candidates by provider", async () => {
    const actions = await renderSubagentModelSelection({
      enabled: true,
      candidates: [
        {
          key: "alpha\0fast",
          provider: "alpha",
          model: "fast",
          providerName: "Alpha API",
          modelName: "Fast",
          available: true,
          selected: true,
        },
        {
          key: "alpha\0deep",
          provider: "alpha",
          model: "deep",
          providerName: "Alpha API",
          modelName: "Deep",
          available: true,
          selected: false,
        },
      ],
      catalogStatus: "ready",
    });
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Alpha API", { exact: true })).toBeTruthy();
    await fireEvent.click(screen.getByRole("checkbox", { name: /Fast/ }));
    await fireEvent.click(screen.getByRole("checkbox", { name: /Deep/ }));
    expect(actions.toggleModel).toHaveBeenCalledWith("alpha\0fast");
    expect(actions.toggleModel).toHaveBeenCalledWith("alpha\0deep");
  });
  it("renders directory progress, failures, unavailable routes, and validation", async () => {
    await renderSubagentModelSelection({ enabled: true, catalogStatus: "loading", invalid: true });
    expect(screen.getByText(en.subagentModelSelectionLoading)).toBeTruthy();
    expect(screen.getByText(en.subagentModelSelectionRequired)).toBeTruthy();
    cleanup();
    const errorActions = await renderSubagentModelSelection({
      enabled: true,
      catalogStatus: "error",
    });
    await fireEvent.click(screen.getByRole("button", { name: en.subagentModelSelectionRetry }));
    expect(errorActions.retryCatalog).toHaveBeenCalledOnce();
    cleanup();
    await renderSubagentModelSelection({
      enabled: true,
      catalogStatus: "ready",
      catalogPartial: true,
      candidates: [
        {
          key: "legacy\0old",
          provider: "legacy",
          model: "old",
          providerName: "legacy",
          modelName: "old",
          available: false,
          selected: true,
        },
      ],
    });
    expect(screen.getByText(en.subagentModelSelectionPartial)).toBeTruthy();
    expect(screen.getByText(en.subagentModelSelectionUnavailable)).toBeTruthy();
    expect(screen.getByText(en.subagentModelSelectionUnavailableGroup)).toBeTruthy();
    cleanup();
    await renderSubagentModelSelection({ enabled: true, catalogStatus: "ready" });
    expect(screen.getByText(en.subagentModelSelectionEmpty)).toBeTruthy();
  });
  it("distinguishes a stale draft from a rejected save", async () => {
    await renderSubagentModelSelection({ dirty: true, conflicted: true });
    expect(screen.getByText(en.subagentModelSelectionConflict)).toBeTruthy();
    expect(screen.queryByText(en.saveFailed)).toBeNull();
  });
  it("renders its one-liner in the summary view, says so when unavailable, and disables writes when read-only", async () => {
    await renderSubagentModelSelection({}, "summary");
    expect(document.body.textContent).toBe(en.subagentDescription);
    cleanup();
    await renderSubagentModelSelection({ available: false });
    expect(screen.getByRole("status").textContent).toBe(en.unavailable);
    cleanup();
    const actions = await renderSubagentModelSelection({ writable: false });
    const control = screen.getByRole("switch") as HTMLButtonElement;
    expect(control.disabled).toBe(true);
    await fireEvent.click(control);
    expect(actions.toggleEnabled).not.toHaveBeenCalled();
  });
});
describe("SubagentCard", () => {
  it("discards both drafts when leaving the page", async () => {
    const { actions } = await renderSubagent({ dirty: true }, { dirty: true });
    cleanup();
    expect(actions.discard).toHaveBeenCalledOnce();
  });
  it("renders limits without model selection when only limits are served", async () => {
    await renderSubagent({}, { available: false });
    expect(screen.getByLabelText(en.subagentMaxDepth)).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
  });
  it("shows both sections on one page with one save footer", async () => {
    await renderSubagent({ dirty: true });
    expect(screen.getByRole("heading", { name: en.subagentLimitsTitle })).toBeTruthy();
    expect(screen.getByRole("heading", { name: en.subagentModelSelectionTitle })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: en.save })).toHaveLength(1);
  });
  it("reveals field rules on demand without changing staged values", async () => {
    await renderSubagent({ dirty: true, maxDepth: field("2") });
    const depthHelp = screen.getByRole("button", { name: en.subagentDepthHelpLabel });
    const capacityHelp = screen.getByRole("button", { name: en.subagentCapacityHelpLabel });
    expect(depthHelp.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(en.subagentDepthHelp)).toBeNull();
    expect(screen.queryByText(en.subagentCapacityHelp)).toBeNull();
    await fireEvent.click(depthHelp);
    expect(depthHelp.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: en.subagentDepthHelpLabel })).toBeTruthy();
    expect(screen.getByText(en.subagentDepthHelp)).toBeTruthy();
    expect(screen.getByRole("table", { name: en.subagentDepthHelpLabel })).toBeTruthy();
    expect(screen.getByRole("row", { name: `0 ${en.subagentDepthZero}` })).toBeTruthy();
    expect(screen.getByRole("row", { name: `1 ${en.subagentDepthOne}` })).toBeTruthy();
    expect(screen.getByText(en.subagentDepthOverride)).toBeTruthy();
    await fireEvent.click(capacityHelp);
    expect(screen.getByText(en.subagentCapacityHelp)).toBeTruthy();
    await fireEvent.click(depthHelp);
    expect(screen.queryByText(en.subagentDepthHelp)).toBeNull();
    expect(screen.getByLabelText(en.subagentMaxDepth)).toHaveProperty("value", "2");
    expect(screen.getByRole("button", { name: en.save })).toHaveProperty("disabled", false);
  });
  it("keeps validation visible when the rules are collapsed and links it to the input", async () => {
    await renderSubagent({ dirty: true, invalid: true, maxDepth: field("1.5", { invalid: true }) });
    const depth = screen.getByLabelText(en.subagentMaxDepth);
    const messageId = depth.getAttribute("aria-describedby")!;
    expect(document.getElementById(messageId)?.textContent).toBe(en.subagentDepthInvalid);
    expect(screen.queryByRole("region", { name: en.subagentDepthHelpLabel })).toBeNull();
  });
  it("edits and resets limits through the shared card", async () => {
    const { actions, limits } = await renderSubagent({
      dirty: true,
      maxDepth: field("3", { overridden: true }),
      maxActiveSubagents: field("8", { overridden: true }),
    });
    await fireEvent.input(screen.getByLabelText(en.subagentMaxDepth), { target: { value: "2" } });
    await fireEvent.input(screen.getByLabelText(en.subagentMaxActive), { target: { value: "12" } });
    expect(actions.editLimit.mock.calls).toEqual([
      ["maxDepth", "2"],
      ["maxActiveSubagents", "12"],
    ]);
    for (const button of screen.getAllByRole("button", { name: en.reset }))
      await fireEvent.click(button);
    expect(actions.resetLimit.mock.calls).toEqual([["maxDepth"], ["maxActiveSubagents"]]);
    await act(() => {
      limits.set({ ...limits.getSnapshot(), writable: false });
    });
    expect(screen.getByLabelText(en.subagentMaxActive)).toHaveProperty("disabled", true);
  });
  it("blocks saving both sections when a model selection is invalid or conflicted", async () => {
    const { models } = await renderSubagent({ dirty: true }, { dirty: true, invalid: true });
    expect(screen.getByRole("button", { name: en.save })).toHaveProperty("disabled", true);
    await act(() => {
      models.set({ ...models.getSnapshot(), invalid: false, conflicted: true });
    });
    expect(screen.getByRole("button", { name: en.save })).toHaveProperty("disabled", true);
  });
  it("locks both sections while either is saving and stays open after both settle", async () => {
    const { limits, models } = await renderSubagent({ dirty: true }, { dirty: true });
    await act(() => {
      limits.set({ ...limits.getSnapshot(), saving: true });
      models.set({ ...models.getSnapshot(), saving: true });
    });
    expect(screen.getByLabelText(en.subagentMaxDepth)).toHaveProperty("disabled", true);
    expect(screen.getByRole("switch")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: en.saving })).toHaveProperty("disabled", true);
    await act(() => {
      limits.set({ ...limits.getSnapshot(), saving: false, dirty: false });
    });
    expect(screen.getByRole("switch")).toHaveProperty("disabled", true);
    await act(() => {
      models.set({ ...models.getSnapshot(), saving: false, dirty: false });
    });
    expect(screen.getByRole("switch")).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: en.save })).toHaveProperty("disabled", true);
  });
  it("keeps a rejected section open after the other section saves", async () => {
    const { limits, models } = await renderSubagent({ dirty: true }, { dirty: true });
    await act(() => {
      limits.set({ ...limits.getSnapshot(), saving: true });
      models.set({ ...models.getSnapshot(), saving: true });
    });
    await act(() => {
      limits.set({ ...limits.getSnapshot(), saving: false, dirty: false });
      models.set({ ...models.getSnapshot(), saving: false, failed: true });
    });
    expect(screen.getByRole("switch")).toBeTruthy();
    expect(screen.getByText(en.saveFailed)).toBeTruthy();
    expect(screen.getByRole("button", { name: en.save })).toHaveProperty("disabled", false);
  });
  it("renders model-only deployments without limit controls", async () => {
    await renderSubagent({ available: false });
    expect(screen.getByRole("switch")).toBeTruthy();
    expect(screen.queryByLabelText(en.subagentMaxDepth)).toBeNull();
  });
});
async function render(...args: Parameters<typeof mountNative>) {
  const view = mountNative(...args);
  await nextTick();
  return view;
}
const fireEvent = new Proxy(dispatchDom, {
  get(target, key) {
    const method = Reflect.get(target, key);
    return typeof method === "function"
      ? async (...args: unknown[]) => {
          await nextTick();
          const result = method(...args);
          await nextTick();
          return result;
        }
      : method;
  },
});
