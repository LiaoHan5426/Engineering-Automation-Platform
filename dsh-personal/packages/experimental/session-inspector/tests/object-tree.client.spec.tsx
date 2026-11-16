import { h, nextTick } from "vue";
import { fireEvent as fireEventNative } from "@testing-library/dom";
// @vitest-environment jsdom
/** Reference links stop traversal; expanded collections retain original entry values. */
import {
  act as actNative,
  cleanup,
  render as renderNative,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { afterEach, expect, it, vi } from "vitest";
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { SessionSeq, type SessionId } from "@deepseek-ai/dsh-session/types";
import { ConversationLocationIndex } from "@deepseek-ai/dsh-client-ui-conversation/client";
import {
  InspectorJsonTree,
  InspectorObjectTree,
} from "../src/client/views/InspectorObjectTree.tsx";
import type { InspectorObjects, InspectorObjectReference } from "../src/client/views/objects.ts";
import { en } from "../src/client/locales.ts";
interface TreeProbeData {
  readonly status: string;
}
declare module "@deepseek-ai/dsh-client-ui-conversation/client" {
  interface ConversationTurnDataMap {
    "tree-probe": TreeProbeData;
  }
  interface ConversationStepDataMap {
    "tree-probe": TreeProbeData;
  }
}
afterEach(cleanup);
it("expands all JSON containers and array items without object links or collection-property disclosures", async () => {
  const text = JSON.stringify({
    data: { items: Array.from({ length: 75 }, (_, index) => ({ value: index })) },
  });
  const ui = await render(h(InspectorJsonTree, { text: text, t: makeTranslate(en) }));
  expect(ui.getByText("74")).toBeTruthy();
  expect(ui.container.querySelectorAll("details:not([open])")).toHaveLength(0);
  expect(ui.queryByRole("button")).toBeNull();
  expect(ui.queryByText(`${en["object.properties"]}:`)).toBeNull();
  expect(
    [...ui.container.querySelectorAll("summary")].slice(0, 4).map((summary) => summary.textContent),
  ).toEqual(["$:  Object", "data:  Object", "items:  Array(75)", "0:  Object"]);
  const branch = ui.getByText("data:").closest("details")!;
  branch.open = false;
  await fireEvent(branch, new Event("toggle"));
  expect(ui.queryByText("74")).toBeNull();
  branch.open = true;
  await fireEvent(branch, new Event("toggle"));
  expect(ui.getByText("74")).toBeTruthy();
  expect(ui.container.querySelectorAll("details:not([open])")).toHaveLength(0);
});
it("updates JSON values while retaining collapsed fields and renders an undefined serialization", async () => {
  const t = makeTranslate(en);
  const ui = await render(h(InspectorJsonTree, { text: '{"data":{"text":"before"}}', t: t }));
  const branch = ui.getByText("data:").closest("details")!;
  branch.open = false;
  await fireEvent(branch, new Event("toggle"));
  await ui.rerender(h(InspectorJsonTree, { text: '{"data":{"text":"after"}}', t: t }));
  expect(ui.getByText("data:").closest("details")).toBe(branch);
  expect(branch.open).toBe(false);
  branch.open = true;
  await fireEvent(branch, new Event("toggle"));
  expect(ui.getByText('"after"')).toBeTruthy();
  await ui.rerender(h(InspectorJsonTree, { text: "", t: t }));
  expect(ui.getByText("undefined")).toBeTruthy();
});
it.each(["turn", "step"] as const)(
  "refreshes expanded %s Data after an in-place publication without losing disclosure state",
  async (kind) => {
    const index = new ConversationLocationIndex();
    index.appendBoundary({ seq: SessionSeq(1), time: 1, type: "turn/start", data: { turn: 1 } });
    index.appendBoundary({
      seq: SessionSeq(2),
      time: 2,
      type: "step/start",
      data: { turn: 1, step: 1 },
    });
    const target = kind === "turn" ? { kind, turn: 1 } : { kind, turn: 1, step: 1 };
    index.replaceData([
      { owner: "tree-probe", data: { ...target, key: "tree-probe", value: { status: "before" } } },
    ]);
    index.publishData();
    const turn = index.snapshot().turns.get(1)!;
    const data = kind === "turn" ? turn.data : turn.steps[0]!.data;
    const props = fixture();
    const ui = await render(h(InspectorObjectTree, { ...props, value: data }));
    for (let depth = 0; depth < 7 && ui.queryByText('"before"') === null; depth++) {
      for (const branch of ui.container.querySelectorAll<HTMLDetailsElement>(
        "details:not([open])",
      )) {
        branch.open = true;
        await fireEvent(branch, new Event("toggle"));
      }
    }
    expect(ui.getByText('"before"')).toBeTruthy();
    const expanded = [...ui.container.querySelectorAll("details[open]")];
    index.applyData([
      {
        owner: "tree-probe",
        previous: null,
        next: { ...target, key: "tree-probe", value: { status: "after" } },
      },
    ]);
    index.publishData();
    await act(() => {
      props.updates.set({});
    });
    await ui.rerender(h(InspectorObjectTree, { ...props, value: data }));
    expect(ui.getByText('"after"')).toBeTruthy();
    expect(ui.queryByText('"before"')).toBeNull();
    expect([...ui.container.querySelectorAll("details[open]")]).toEqual(expanded);
  },
);
function fixture() {
  const index = new WeakMap<object, InspectorObjectReference>();
  const updates = createSnapshotStore<object>({});
  const objects: InspectorObjects = {
    sessionId: "tree-session" as SessionId,
    updates,
    reference: (value) => index.get(value),
    row: () => undefined,
  };
  return { index, objects, updates, navigate: vi.fn(), t: makeTranslate(en) };
}
it("keeps collection enumeration bounded and reuses it across UI-only renders", async () => {
  let visited = 0;
  class CountedMap extends Map<number, string> {
    override *[Symbol.iterator](): MapIterator<[number, string]> {
      for (const entry of super[Symbol.iterator]()) {
        visited++;
        yield entry;
      }
    }
  }
  const values = new CountedMap(
    Array.from({ length: 10000 }, (_, index) => [index, `value-${index}`]),
  );
  const value = { values };
  const props = fixture();
  const ui = await render(h(InspectorObjectTree, { ...props, value: value }));
  expect(visited).toBe(0);
  await act(() => {
    props.updates.set({});
  });
  expect(visited).toBe(0);
  const branch = [...ui.container.querySelectorAll("details")][1]!;
  branch.open = true;
  await fireEvent(branch, new Event("toggle"));
  expect(visited).toBe(51);
  for (let count = 0; count < 20; count++)
    await ui.rerender(h(InspectorObjectTree, { ...props, value: value, navigate: vi.fn() }));
  expect(visited).toBe(51);
  await act(() => {
    props.updates.set({});
  });
  expect(visited).toBe(102);
  expect(branch.open).toBe(true);
});
it("renders registered nested objects as links while keeping the inspected root expandable", async () => {
  const props = fixture();
  const target = { secret: "not traversed" };
  const reference: InspectorObjectReference = {
    id: "turn:1",
    kind: "turn",
    identity: "1",
    target: { turn: 1 },
    read: () => target,
  };
  props.index.set(target, reference);
  const ui = await render(h(InspectorObjectTree, { ...props, value: { owner: target } }));
  expect(ui.queryByText("not traversed", { exact: false })).toBeNull();
  await fireEvent.click(ui.getByRole("button", { name: "↗ Turn · 1" }));
  expect(props.navigate).toHaveBeenCalledWith(reference);
  await ui.rerender(h(InspectorObjectTree, { ...props, value: target }));
  expect(ui.getByText('"not traversed"')).toBeTruthy();
});
it("expands Node Data inline but keeps its title navigable and cyclic references closed", async () => {
  const props = fixture();
  const data: Record<string, unknown> = { text: "inline node data" };
  data.self = data;
  const reference: InspectorObjectReference = {
    id: "node-data:1",
    kind: "nodeData",
    identity: "1",
    target: { nodeKey: "node-1" },
    read: () => data,
  };
  props.index.set(data, reference);
  const ui = await render(h(InspectorObjectTree, { ...props, value: { data } }));
  const link = ui.getByRole("button", { name: "↗ Node data · 1" });
  const branch = link.closest("details")!;
  expect(branch.querySelector("summary")?.textContent).toBe("data: ↗ Node data · 1 Object");
  expect(branch.open).toBe(false);
  expect(ui.queryByText('"inline node data"')).toBeNull();
  branch.open = true;
  await fireEvent(branch, new Event("toggle"));
  expect(ui.getByText('"inline node data"')).toBeTruthy();
  expect(props.navigate).not.toHaveBeenCalled();
  expect(ui.getAllByRole("button", { name: "↗ Node data · 1" })).toHaveLength(2);
  expect(ui.container.querySelectorAll("details")).toHaveLength(2);
  await fireEvent.click(link);
  expect(props.navigate).toHaveBeenCalledExactlyOnceWith(reference);
  expect(branch.open).toBe(true);
});
it("expands Maps, bounds collection pages, and terminates unregistered cycles", async () => {
  const props = fixture();
  const root: Record<string, unknown> = {};
  root.self = root;
  const ui = await render(h(InspectorObjectTree, { ...props, value: root }));
  expect(ui.getByText("↩ $")).toBeTruthy();
  await ui.rerender(
    h(InspectorObjectTree, { ...props, value: new Map([[{ name: "object key" }, "kept value"]]) }),
  );
  expect(ui.getByText("Map(1)")).toBeTruthy();
  const entry = [...ui.container.querySelectorAll("details")][1]!;
  entry.open = true;
  await fireEvent(entry, new Event("toggle"));
  expect(ui.getByText('"kept value"')).toBeTruthy();
  const key = [...ui.container.querySelectorAll("details")][2]!;
  key.open = true;
  await fireEvent(key, new Event("toggle"));
  expect(ui.getByText('"object key"')).toBeTruthy();
  await ui.rerender(
    h(InspectorObjectTree, {
      key: "array",
      ...props,
      value: Array.from({ length: 75 }, (_, index) => index),
    }),
  );
  expect(ui.getByRole("button", { name: "Show more" })).toBeTruthy();
  expect(ui.queryByText("74:")).toBeNull();
  await fireEvent.click(ui.getByRole("button", { name: "Show more" }));
  expect(ui.getByText("74:")).toBeTruthy();
});
it.each([new Error("object unavailable"), "object unavailable"])(
  "contains object enumeration failures: %s",
  async (error) => {
    const value = new Proxy(
      {},
      {
        ownKeys() {
          throw error;
        },
      },
    );
    const ui = await render(h(InspectorObjectTree, { ...fixture(), value: value }));
    expect(ui.getByRole("alert").textContent).toContain("object unavailable");
  },
);
it("marks accessors without evaluating them", async () => {
  const read = vi.fn();
  const value = Object.defineProperty({}, "accessor", { get: read, enumerable: true });
  const ui = await render(h(InspectorObjectTree, { ...fixture(), value: value }));
  expect(ui.getByText(en["object.accessor"])).toBeTruthy();
  expect(read).not.toHaveBeenCalled();
});
it("discloses non-index properties separately and marks sparse array slots", async () => {
  const array = new Array<unknown>(3);
  array[1] = undefined;
  Object.defineProperty(array, "note", { value: "custom field" });
  const recursive: {
    self?: object;
  } = {};
  recursive.self = recursive;
  Object.defineProperty(array, "recursive", { value: recursive });
  const props = fixture();
  const ui = await render(h(InspectorObjectTree, { ...props, value: array }));
  expect(ui.getAllByText(en["object.absent"])).toHaveLength(2);
  expect(ui.getByText("undefined")).toBeTruthy();
  expect(ui.queryByText('"custom field"')).toBeNull();
  const properties = ui.getByText(`${en["object.properties"]}:`).closest("details")!;
  properties.open = true;
  await fireEvent(properties, new Event("toggle"));
  expect(ui.getByText('"custom field"')).toBeTruthy();
  expect(ui.queryByText("length:")).toBeNull();
  const child = ui.getByText("recursive:").closest("details")!;
  child.open = true;
  await fireEvent(child, new Event("toggle"));
  expect(ui.getByText("↩ $.recursive")).toBeTruthy();
});
const fireEvent = new Proxy(fireEventNative, {
  apply: async (target, self, args) => {
    await nextTick();
    const result = Reflect.apply(target, self, args);
    await nextTick();
    return result;
  },
  get: (target, key) => {
    const fn = Reflect.get(target, key);
    return typeof fn === "function"
      ? async (...args: unknown[]) => {
          await nextTick();
          const result = Reflect.apply(fn, target, args);
          await nextTick();
          return result;
        }
      : fn;
  },
});
const render = async (...args: Parameters<typeof renderNative>) => {
  const view = renderNative(...args);
  await nextTick();
  return view;
};
const act = actNative;
