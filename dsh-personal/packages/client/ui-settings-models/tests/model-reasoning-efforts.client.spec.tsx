import { defineComponent, h as vh, shallowRef } from "vue";
// @vitest-environment jsdom
/** Reasoning levels of hand-declared pi-ai models: echo, level rows, API values, refusals, and placement. */
import { fireEvent, screen, within } from "@testing-library/dom";
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { DeepSeekModelDraft } from "../src/client/DeepSeekModelsEditor.tsx";
import { validateDeepSeekModels } from "../src/client/DeepSeekModelsEditor.tsx";
import { ModelListEditor } from "../src/client/ModelListEditor.tsx";
import {
  ModelReasoningEfforts,
  validateReasoningEfforts,
} from "../src/client/ModelReasoningEfforts.tsx";
import type { ModelsOperations } from "../src/client/operations.ts";
import { en } from "../src/client/locales.ts";
afterEach(cleanup);
const t = (key: keyof typeof en): string => en[key];
const DEFAULTS = { off: null, low: "low", medium: "medium", high: "high" };
/** The levels llm-pi-ai's schema lists today. */
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
/** Render the controlled group over local state, reporting every write. */
function renderGroup(
  initial: DeepSeekModelDraft,
  options: {
    disabled?: boolean;
    levels?: readonly string[];
    levelsOnly?: boolean;
  } = {},
) {
  const writes: DeepSeekModelDraft[] = [];
  const Harness = defineComponent(
    () => {
      const modelRef = shallowRef(initial);
      const setModel = (next: typeof modelRef.value) => {
        modelRef.value = next;
      };
      return () => {
        const model = modelRef.value;
        return vh(ModelReasoningEfforts, {
          model: model,
          levels: options.levels ?? LEVELS,
          levelsOnly: options.levelsOnly ?? false,
          position: 1,
          disabled: options.disabled ?? false,
          t: t,
          onChange: (next) => {
            writes.push(next);
            setModel(next);
          },
        });
      };
    },
    { inheritAttrs: false, props: [] },
  );
  render(vh(Harness, null));
  return { writes, efforts: () => writes.at(-1)?.["reasoningEfforts"] };
}
const toggle = () => screen.getByRole("switch", { name: `${en.modelReasoning} 1` });
const levels = () =>
  screen.queryAllByRole<HTMLSelectElement>("combobox").map((select) => select.value);
const select = (row: number) =>
  screen.getByRole<HTMLSelectElement>("combobox", {
    name: `${en.modelReasoningLevel} ${String(row)}`,
  });
const value = (level: string) =>
  screen.getByRole<HTMLInputElement>("textbox", { name: `${level} ${en.modelReasoningValue}` });
const remove = (level: string) =>
  screen.getByRole<HTMLButtonElement>("button", { name: `${en.modelReasoningRemove} ${level}` });
const add = () => screen.getByRole<HTMLButtonElement>("button", { name: en.modelReasoningAdd });
const entriesOf = (efforts: unknown) => Object.entries(efforts as object);
describe("ModelReasoningEfforts", () => {
  it.each([
    ["absent", { id: "chat" }],
    ["false", { id: "chat", reasoningEfforts: false }],
  ])("shows a model whose field is %s as switched off without writing", (_label, model) => {
    const { writes } = renderGroup(model);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(levels()).toEqual([]);
    expect(writes).toEqual([]);
  });
  it("echoes stored levels in their stored order with their API values", () => {
    renderGroup({ id: "gateway", reasoningEfforts: { off: null, max: "ultra", high: "high" } });
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: en.modelReasoningHelp })).toBeTruthy();
    expect(levels()).toEqual(["off", "max", "high"]);
    expect(value("off").value).toBe("");
    expect(value("off").placeholder).toBe(en.modelReasoningOffValuePlaceholder);
    expect(value("off").disabled).toBe(true);
    expect(value("max").value).toBe("ultra");
    expect(value("high").value).toBe("high");
    // Each select offers its own level and the levels no other row uses.
    expect([...select(3).options].map((option) => option.value)).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(screen.queryByText(en.modelReasoningValueRequired)).toBeNull();
  });
  it("turns on with off, low, medium, and high while keeping other fields", async () => {
    const { writes } = renderGroup({
      id: "chat",
      contextWindow: 131072,
      compat: { supportsDeveloperRole: false },
    });
    await act(() => fireEvent.click(toggle()));
    expect(writes.at(-1)).toEqual({
      id: "chat",
      contextWindow: 131072,
      compat: { supportsDeveloperRole: false },
      reasoningEfforts: DEFAULTS,
    });
    expect(levels()).toEqual(["off", "low", "medium", "high"]);
  });
  it("removes the field when switched off and starts from the defaults when switched back on", async () => {
    const { writes } = renderGroup({ id: "chat", reasoningEfforts: { off: "none", high: "deep" } });
    await act(() => fireEvent.click(toggle()));
    expect(writes[0]).toEqual({ id: "chat" });
    await act(() => fireEvent.click(toggle()));
    expect(writes[1]).toEqual({ id: "chat", reasoningEfforts: DEFAULTS });
  });
  it("appends the next unused level above the highest row, then the lowest unused one", async () => {
    const { efforts } = renderGroup({ id: "chat", reasoningEfforts: { low: "low", max: "max" } });
    await act(() => fireEvent.click(add()));
    expect(levels()).toEqual(["low", "max", "off"]);
    expect(entriesOf(efforts())).toEqual([
      ["low", "low"],
      ["max", "max"],
      ["off", null],
    ]);
    await act(() => fireEvent.click(add()));
    expect(levels()).toEqual(["low", "max", "off", "minimal"]);
    expect(entriesOf(efforts())).toEqual([
      ["low", "low"],
      ["max", "max"],
      ["off", null],
      ["minimal", "minimal"],
    ]);
  });
  it("stops adding once every level has a row", async () => {
    renderGroup({
      id: "chat",
      reasoningEfforts: {
        off: null,
        minimal: "minimal",
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
      },
    });
    await act(() => fireEvent.click(add()));
    expect(levels()).toHaveLength(7);
    expect(add().disabled).toBe(true);
  });
  it("changes a level in place, carrying a custom value only between thinking levels", async () => {
    const { efforts } = renderGroup({
      id: "chat",
      reasoningEfforts: { low: "low", high: "deep", max: "max" },
    });
    await act(() => fireEvent.input(select(1), { target: { value: "xhigh" } }));
    expect(levels()).toEqual(["xhigh", "high", "max"]);
    expect(entriesOf(efforts())).toEqual([
      ["xhigh", "xhigh"],
      ["high", "deep"],
      ["max", "max"],
    ]);
    await act(() => fireEvent.input(select(2), { target: { value: "medium" } }));
    expect(entriesOf(efforts())).toEqual([
      ["xhigh", "xhigh"],
      ["medium", "deep"],
      ["max", "max"],
    ]);
    await act(() => fireEvent.input(select(2), { target: { value: "off" } }));
    expect(entriesOf(efforts())).toEqual([
      ["xhigh", "xhigh"],
      ["off", null],
      ["max", "max"],
    ]);
    await act(() => fireEvent.input(select(2), { target: { value: "low" } }));
    expect(entriesOf(efforts())).toEqual([
      ["xhigh", "xhigh"],
      ["low", "low"],
      ["max", "max"],
    ]);
  });
  it("edits API values, storing the level name for a cleared field and showing it once the field is left", async () => {
    const { efforts } = renderGroup({
      id: "gateway",
      reasoningEfforts: { off: "none", high: "high" },
    });
    expect(value("off").value).toBe("none");
    await act(() => fireEvent.input(value("high"), { target: { value: " deep " } }));
    expect(efforts()).toEqual({ off: "none", high: "deep" });
    await act(() => fireEvent.input(value("high"), { target: { value: "" } }));
    expect(value("high").value).toBe("");
    expect(efforts()).toEqual({ off: "none", high: "high" });
    await act(() => fireEvent.blur(value("high")));
    expect(value("high").value).toBe("high");
  });
  it.each([
    ["a level besides off without a value", { off: null, high: null }, "high"],
    ["an empty value", { off: null, high: "" }, "high"],
    ["an empty off value", { off: "", high: "high" }, "off"],
  ])("flags %s that the adapter refuses", (_label, stored, level) => {
    renderGroup({ id: "chat", reasoningEfforts: stored });
    expect(value(level).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(en.modelReasoningValueRequired)).toBeTruthy();
  });
  it("repairs a refused value with the level name once its field is left", async () => {
    const { efforts } = renderGroup({ id: "chat", reasoningEfforts: { off: null, high: null } });
    expect(value("high").value).toBe("");
    await act(() => fireEvent.focus(value("high")));
    await act(() => fireEvent.blur(value("high")));
    expect(efforts()).toEqual({ off: null, high: "high" });
    expect(value("high").getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByText(en.modelReasoningValueRequired)).toBeNull();
  });
  it("leaves an accepted value alone when its field is left", async () => {
    const { writes } = renderGroup({ id: "chat", reasoningEfforts: { high: "deep" } });
    await act(() => fireEvent.blur(value("high")));
    expect(writes).toEqual([]);
  });
  it("shows a valueless field as switched on with no levels, which the adapter refuses", async () => {
    const { writes } = renderGroup({ id: "chat", reasoningEfforts: null });
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(levels()).toEqual([]);
    expect(screen.getByText(en.modelReasoningNeedsLevel)).toBeTruthy();
    await act(() => fireEvent.click(add()));
    expect(writes.at(-1)).toEqual({ id: "chat", reasoningEfforts: { off: null } });
  });
  it("deletes a row and requires a level besides off", async () => {
    const { efforts } = renderGroup({ id: "chat", reasoningEfforts: { off: null, high: "high" } });
    expect(screen.queryByText(en.modelReasoningNeedsLevel)).toBeNull();
    await act(() => fireEvent.click(remove("high")));
    expect(levels()).toEqual(["off"]);
    expect(efforts()).toEqual({ off: null });
    expect(screen.getByText(en.modelReasoningNeedsLevel)).toBeTruthy();
    await act(() => fireEvent.click(remove("off")));
    expect(levels()).toEqual([]);
    expect(efforts()).toEqual({});
  });
  it("offers the levels it is given, seeding only the defaults the list names", async () => {
    const { efforts } = renderGroup({ id: "gateway" }, { levels: ["off", "low", "high", "ultra"] });
    await act(() => fireEvent.click(toggle()));
    expect(entriesOf(efforts())).toEqual([
      ["off", null],
      ["low", "low"],
      ["high", "high"],
    ]);
    expect([...select(3).options].map((option) => option.value)).toEqual(["high", "ultra"]);
    await act(() => fireEvent.click(add()));
    expect(levels()).toEqual(["off", "low", "high", "ultra"]);
    expect(add().disabled).toBe(true);
  });
  it("keeps a stored key the offered levels do not name", async () => {
    const { efforts } = renderGroup({
      id: "gateway",
      reasoningEfforts: { turbo: "turbo-x", high: "high" },
    });
    expect(levels()).toEqual(["turbo", "high"]);
    expect([...select(1).options].map((option) => option.value)).toEqual([
      "turbo",
      "off",
      "minimal",
      "low",
      "medium",
      "xhigh",
      "max",
    ]);
    await act(() => fireEvent.input(value("high"), { target: { value: "deep" } }));
    expect(entriesOf(efforts())).toEqual([
      ["turbo", "turbo-x"],
      ["high", "deep"],
    ]);
  });
  it("disables every control while read-only or saving", () => {
    const { writes } = renderGroup(
      { id: "chat", reasoningEfforts: { high: "deep" } },
      { disabled: true },
    );
    expect((toggle() as HTMLButtonElement).disabled).toBe(true);
    expect(select(1).disabled).toBe(true);
    expect(value("high").disabled).toBe(true);
    expect(remove("high").disabled).toBe(true);
    expect(add().disabled).toBe(true);
    toggle().click();
    remove("high").click();
    add().click();
    expect(writes).toEqual([]);
  });
});
describe("levels a protocol fixes", () => {
  const GEMINI = ["minimal", "low", "medium", "high"];
  it("starts without off, offers only its levels, and fixes each value to the level name", async () => {
    const { efforts } = renderGroup({ id: "gemini" }, { levels: GEMINI, levelsOnly: true });
    await act(() => fireEvent.click(toggle()));
    expect(efforts()).toEqual({ low: "low", medium: "medium", high: "high" });
    expect([...select(1).options].map((option) => option.value)).toEqual(["minimal", "low"]);
    expect(value("low").disabled).toBe(true);
    expect(screen.queryByText(en.modelReasoningLevelsOnly)).toBeNull();
  });
  it("resets a custom value to the new level name when a row changes level", async () => {
    const { efforts } = renderGroup(
      { id: "gemini", reasoningEfforts: { high: "ultra" } },
      { levels: GEMINI, levelsOnly: true },
    );
    await act(() => fireEvent.input(select(1), { target: { value: "medium" } }));
    expect(efforts()).toEqual({ medium: "medium" });
  });
  it("names a stored level or value outside the fixed levels", () => {
    renderGroup(
      { id: "gemini", reasoningEfforts: { off: null, high: "ultra" } },
      { levels: GEMINI, levelsOnly: true },
    );
    expect(screen.getByText(en.modelReasoningLevelsOnly)).toBeTruthy();
  });
  it.each([[{ off: null, high: "high" }], [{ high: "ultra" }], [{ xhigh: "xhigh" }]])(
    "refuses %j on a protocol accepting only its own level names",
    (stored) => {
      expect(
        validateReasoningEfforts(
          [{ id: "ok" }, { id: "gemini", reasoningEfforts: stored }],
          GEMINI,
        ),
      ).toEqual({ index: 1, key: "modelReasoningLevelsOnly" });
    },
  );
  it("accepts its own level names", () => {
    expect(
      validateReasoningEfforts(
        [{ id: "gemini", reasoningEfforts: { minimal: "minimal", high: "high" } }],
        GEMINI,
      ),
    ).toBeUndefined();
  });
});
describe("reasoning-level validation", () => {
  it.each([[{}], [null], [{ off: null }], [{ off: "none" }]])(
    "refuses %j, which offers nothing beyond off",
    (stored) => {
      expect(
        validateReasoningEfforts([{ id: "ok" }, { id: "chat", reasoningEfforts: stored }]),
      ).toEqual({ index: 1, key: "modelReasoningNeedsLevel" });
    },
  );
  it.each([[{ high: null }], [{ off: null, high: "" }], [{ off: "", high: "high" }]])(
    "refuses %j, which holds a value the adapter rejects",
    (stored) => {
      expect(validateReasoningEfforts([{ id: "chat", reasoningEfforts: stored }])).toEqual({
        index: 0,
        key: "modelReasoningValueRequired",
      });
    },
  );
  it.each([[undefined], [false], [{ high: "high" }], [{ off: null, max: "ultra" }]])(
    "accepts %j",
    (stored) => {
      expect(validateReasoningEfforts([{ id: "chat", reasoningEfforts: stored }])).toBeUndefined();
    },
  );
  it("accepts an inherited model list", () => {
    expect(validateReasoningEfforts(undefined)).toBeUndefined();
  });
  it("stays out of the shared model checker that DeepSeek and catalog rows use", () => {
    expect(
      validateDeepSeekModels([{ id: "chat", reasoningEfforts: { off: null } }]),
    ).toBeUndefined();
  });
});
describe("reasoning levels in the model list", () => {
  const operations: ModelsOperations = {
    discoverModels: () => Promise.resolve({ kind: "found", models: [] }),
    storeCredential: vi.fn(),
    removeCredential: vi.fn(),
    writeSettings: vi.fn(),
  };
  /** Render the list over local state, reporting every write. */
  function renderList(initial: DeepSeekModelDraft[]) {
    const writes: DeepSeekModelDraft[][] = [];
    const Harness = defineComponent(
      () => {
        const modelsRef = shallowRef(initial);
        const setModels = (next: typeof modelsRef.value) => {
          modelsRef.value = next;
        };
        return () => {
          const models = modelsRef.value;
          return vh(ModelListEditor, {
            models: models,
            onChange: (next) => {
              writes.push(next);
              setModels(next);
            },
            reasoningLevels: LEVELS,
            probe: { settingsNs: "llm-pi-ai" },
            operations: operations,
            disabled: false,
            t: t,
            onBusyChange: () => {},
          });
        };
      },
      { inheritAttrs: false, props: [] },
    );
    render(vh(Harness, null));
    return { writes };
  }
  it("edits a hand-declared route row", async () => {
    const { writes } = renderList([{ id: "my-reasoner" }]);
    await act(() => fireEvent.click(screen.getByRole("button", { name: `${en.modelAdvanced} 1` })));
    await act(() => fireEvent.click(toggle()));
    expect(writes.at(-1)).toEqual([{ id: "my-reasoner", reasoningEfforts: DEFAULTS }]);
  });
  it("writes only the surviving model's own levels after the row above it is deleted", async () => {
    // Rows are keyed by position, so the survivor reuses the deleted model's editor instance.
    const { writes } = renderList([{ id: "a" }, { id: "b" }]);
    await act(() => fireEvent.click(screen.getByRole("button", { name: `${en.modelAdvanced} 1` })));
    await act(() => fireEvent.click(screen.getByRole("button", { name: `${en.modelAdvanced} 2` })));
    const first = within(screen.getByRole("group", { name: `${en.modelReasoning} 1` }));
    await act(() => fireEvent.click(first.getByRole("switch")));
    await act(() =>
      fireEvent.click(first.getByRole("button", { name: `${en.modelReasoningRemove} medium` })),
    );
    await act(() =>
      fireEvent.input(first.getByRole("textbox", { name: `high ${en.modelReasoningValue}` }), {
        target: { value: "deep" },
      }),
    );
    await act(() => fireEvent.click(first.getByRole("switch")));
    await act(() => fireEvent.click(screen.getByRole("button", { name: `${en.removeModel} 1` })));
    expect(writes.at(-1)).toEqual([{ id: "b" }]);
    await act(() =>
      fireEvent.click(
        within(screen.getByRole("group", { name: `${en.modelReasoning} 1` })).getByRole("switch"),
      ),
    );
    expect(writes.at(-1)).toEqual([{ id: "b", reasoningEfforts: DEFAULTS }]);
  });
  it.each([
    ["without a level list", undefined],
    ["with an empty level list", []],
  ])(
    "shows no reasoning control %s, leaving catalog rows to the installed catalog",
    async (_label, reasoningLevels) => {
      render(
        vh(ModelListEditor, {
          models: [{ id: "gpt-5" }],
          onChange: vi.fn(),
          catalogProvider: "openai",
          reasoningLevels: reasoningLevels,
          probe: { settingsNs: "llm-pi-ai", provider: "openai" },
          operations: operations,
          disabled: false,
          t: t,
          onBusyChange: () => {},
        }),
      );
      await act(() =>
        fireEvent.click(screen.getByRole("button", { name: `${en.modelAdvanced} 1` })),
      );
      expect(screen.getByRole("group", { name: `${en.modelInputTypes} 1` })).toBeTruthy();
      expect(screen.queryByRole("switch", { name: `${en.modelReasoning} 1` })).toBeNull();
    },
  );
});
