import { h, computed, unref, nextTick } from "vue";
import { fireEvent as fireEventNative } from "@testing-library/dom";
// @vitest-environment jsdom
/** Confirmed type filters compose with folding, live rows, raw details, and picked-row navigation. */
import {
  act as actNative,
  cleanup,
  render as renderNative,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import {
  bindSnapshotSelector,
  makeTranslate,
  sessionSnapshot,
} from "@deepseek-ai/dsh-client-test-runtime";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vite-plus/test";
import { InspectorTable, type InspectorTableProps } from "../src/client/views/InspectorTable.tsx";
import type { InspectorRecord, InspectorRow } from "../src/client/views/table-model.ts";
import { en } from "../src/client/locales.ts";
import { installInspectorTableGeometry } from "./table-geometry.client.ts";
beforeEach(() => {
  installInspectorTableGeometry();
});
afterEach(cleanup);
it("filters only on confirmation, preserves contextual ancestors, and reveals picked rows", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  onTestFinished(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  const rows = createSnapshotStore<readonly InspectorRow[]>([
    { key: "assistant", depth: 0 },
    { key: "block", parent: "assistant", depth: 1, disclosure: "closed" },
    { key: "delta", parent: "block", depth: 2 },
    { key: "end", parent: "block", depth: 2 },
    { key: "tool", depth: 0 },
  ]);
  const records = new Map<string, InspectorRecord>([
    ["assistant", { type: "assistant/message", identity: "1", location: "", value: {} }],
    [
      "block",
      { type: "block-start", identity: "2", location: "", value: { blockType: "reasoning" } },
    ],
    [
      "delta",
      {
        type: "reasoning-delta",
        identity: "3",
        location: "",
        value: { type: "reasoning-delta", index: 7, text: "thinking" },
      },
    ],
    ["end", { type: "block-end", identity: "4", location: "", value: {} }],
    ["tool", { type: "tool/call", identity: "5", location: "", value: { arguments: "{}" } }],
  ]);
  const props: InspectorTableProps = {
    title: "Session Log",
    flash: false,
    showTime: true,
    useRows: bindSnapshotSelector(rows),
    useRecord: (key: Parameters<InspectorTableProps["useRecord"]>[0]) =>
      computed(() => {
        const current = unref(key);
        return current === undefined ? undefined : records.get(current);
      }),
    typeOf: (key) => records.get(key)?.type,
    useSession: bindSnapshotSelector(
      createSnapshotStore(sessionSnapshot("filter-session" as SessionId)),
    ),
    loadOlder: async () => {},
    t: makeTranslate(en),
  };
  const ui = await render(h(InspectorTable, { ...props }));
  const trigger = ui.getByRole("button", { name: "Filter types" });
  expect(trigger.closest("th")).toBeTruthy();
  expect(ui.queryByRole("button", { name: "reasoning-delta" })).toBeNull();
  await act(async () => {
    await fireEvent.click(trigger);
  });
  await act(async () => {
    await fireEvent.input(ui.getByRole("combobox"), { target: { value: "*DeLtA*" } });
  });
  expect(ui.getByRole("option", { name: "reasoning-delta" })).toBeTruthy();
  expect(ui.getByRole("button", { name: "tool/call" })).toBeTruthy();
  expect(ui.queryByRole("button", { name: "reasoning-delta" })).toBeNull();
  await fireEvent.keyDown(ui.getByRole("combobox"), { key: "Enter" });
  expect(trigger.getAttribute("aria-pressed")).toBe("true");
  expect(ui.queryByRole("button", { name: "tool/call" })).toBeNull();
  expect(ui.queryByRole("button", { name: "block-end" })).toBeNull();
  expect(ui.getByText("Session Log · 1 / 5")).toBeTruthy();
  expect(ui.container.querySelectorAll("[data-inspector-context]")).toHaveLength(2);
  await fireEvent.click(ui.getByRole("button", { name: "reasoning-delta" }));
  expect(ui.getByText("$:").closest("ul")?.textContent).toContain("index: 7");
  await fireEvent.click(ui.getAllByRole("button", { name: "Collapse children" })[1]!);
  expect(ui.queryByRole("button", { name: "reasoning-delta" })).toBeNull();
  await ui.rerender(h(InspectorTable, { ...props, pickedRow: { key: "delta" } }));
  expect(
    ui
      .getByRole("button", { name: "reasoning-delta" })
      .closest("tr")
      ?.getAttribute("aria-selected"),
  ).toBe("true");
  expect(trigger.getAttribute("aria-pressed")).toBe("true");
  records.set("more", {
    type: "tool-call-delta",
    identity: "6",
    location: "",
    value: { argumentsDelta: "more" },
  });
  await act(() => {
    rows.set([...rows.getSnapshot(), { key: "more", depth: 0 }]);
  });
  expect(ui.getByRole("button", { name: "tool-call-delta" })).toBeTruthy();
  expect(ui.getByText("Session Log · 2 / 6")).toBeTruthy();
  await ui.rerender(h(InspectorTable, { ...props, pickedRow: { key: "tool" } }));
  expect(trigger.getAttribute("aria-pressed")).toBe("false");
  expect(
    ui.getByRole("button", { name: "tool/call" }).closest("tr")?.getAttribute("aria-selected"),
  ).toBe("true");
  expect(ui.getByText("$:").closest("ul")?.textContent).toContain('arguments: "{}"');
  await act(async () => {
    await fireEvent.click(trigger);
  });
  await fireEvent.click(ui.getByRole("option", { name: "reasoning-delta" }));
  expect(ui.queryByRole("button", { name: "tool/call" })).toBeNull();
  await act(async () => {
    await fireEvent.click(trigger);
  });
  await act(async () => {
    await fireEvent.click(ui.getByRole("button", { name: "Clear" }));
  });
  expect(ui.queryByRole("button", { name: "tool/call" })).toBeNull();
  await fireEvent.click(ui.getByRole("button", { name: "Apply filter" }));
  expect(trigger.getAttribute("aria-pressed")).toBe("false");
  expect(ui.getByRole("button", { name: "tool/call" })).toBeTruthy();
  expect(ui.queryByRole("button", { name: "reasoning-delta" })).toBeNull();
});
const fireEvent = {
  async click(...args: Parameters<typeof fireEventNative.click>) {
    await nextTick();
    const result = fireEventNative.click(...args);
    await nextTick();
    return result;
  },
  async input(...args: Parameters<typeof fireEventNative.input>) {
    await nextTick();
    const result = fireEventNative.input(...args);
    await nextTick();
    return result;
  },
  async keyDown(...args: Parameters<typeof fireEventNative.keyDown>) {
    await nextTick();
    const result = fireEventNative.keyDown(...args);
    await nextTick();
    return result;
  },
};
const render = async (...args: Parameters<typeof renderNative>) => {
  const view = renderNative(...args);
  await nextTick();
  return view;
};
const act = actNative;
