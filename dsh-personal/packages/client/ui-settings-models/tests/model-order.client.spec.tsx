import { defineComponent, h as vh, shallowRef } from "vue";
// @vitest-environment jsdom
/** Provider-local ordering preserves row instances and unfinished model edits. */
import { createEvent, fireEvent, screen, within } from "@testing-library/dom";
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekModelsEditor } from "../src/client/DeepSeekModelsEditor.tsx";
import type { DeepSeekModelDraft } from "../src/client/DeepSeekModelsEditor.tsx";
import { ModelListEditor } from "../src/client/ModelListEditor.tsx";
import { en } from "../src/client/locales.ts";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const Editor = defineComponent(
  (props: {
    family: "deepseek" | "pi-ai";
    initial: DeepSeekModelDraft[];
    changed: (models: DeepSeekModelDraft[]) => void;
    disabled?: boolean;
  }) => {
    const modelsRef = shallowRef(props.initial);
    const setModels = (next: typeof modelsRef.value) => {
      modelsRef.value = next;
    };
    return () => {
      const models = modelsRef.value;
      const shared = {
        models,
        disabled: props.disabled === true,
        overridden: true,
        t: (key: keyof typeof en) => en[key],
        onChange: (next: DeepSeekModelDraft[]): void => {
          props.changed(next);
          setModels(next);
        },
        onReset: (): void => {
          setModels(props.initial);
        },
      };
      return props.family === "deepseek"
        ? vh(DeepSeekModelsEditor, {
            ...shared,
            defaultContextWindow: undefined,
            defaultMaxTokens: undefined,
          })
        : vh(ModelListEditor, {
            ...shared,
            probe: { settingsNs: "llm-pi-ai" },
            onBusyChange: () => {},
            operations: {
              discoverModels: vi.fn(),
              storeCredential: vi.fn(),
              removeCredential: vi.fn(),
              writeSettings: vi.fn(),
            },
          });
    };
  },
  { inheritAttrs: false, props: ["family", "initial", "changed", "disabled"] },
);
function handle(position: number): HTMLButtonElement {
  return screen.getByRole("button", { name: `${en.reorderModel} ${String(position)}` });
}
function row(button: HTMLButtonElement): HTMLElement {
  const entry = button.closest("[data-row-key]");
  if (!(entry instanceof HTMLElement)) throw new Error("Model row is missing");
  return entry;
}
function transfer() {
  return {
    setData: vi.fn(),
    effectAllowed: "",
    dropEffect: "",
    setDragImage: vi.fn<(image: HTMLElement, x: number, y: number) => void>(),
  };
}
/** jsdom's DragEvent fallback drops pointer coordinates from event options. */
async function fireDrag(
  target: HTMLElement,
  kind: "dragOver" | "drop",
  clientY: number,
  dataTransfer: ReturnType<typeof transfer>,
) {
  const event = kind === "dragOver" ? createEvent.dragOver(target) : createEvent.drop(target);
  Object.defineProperties(event, {
    clientY: { value: clientY },
    dataTransfer: { value: dataTransfer },
  });
  await fireEvent(target, event);
}
async function leave(target: HTMLElement, relatedTarget: Node | null = null) {
  const event = createEvent.dragLeave(target);
  Object.defineProperty(event, "relatedTarget", { value: relatedTarget });
  await fireEvent(target, event);
}
describe.each(["deepseek", "pi-ai"] as const)("%s model ordering", (family) => {
  it("keeps name editing expanded after blur and restores disclosure focus on collapse", async () => {
    render(
      vh(Editor, { family: family, initial: [{ id: "first", name: "First" }], changed: vi.fn() }),
    );
    const name = screen.getByLabelText<HTMLInputElement>(`${en.modelName} 1`);
    const toggle = screen.getByRole("button", { name: `${en.modelAdvanced} 1` });
    await act(() => {
      name.focus();
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await act(() => {
      handle(1).focus();
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await act(() => {
      name.focus();
    });
    await fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    expect(screen.getByLabelText(`${en.modelName} 1`)).toBe(name);
  });
  it("moves a complete model and its expanded capacity draft to the drop position", async () => {
    const first = {
      id: "first",
      name: "First",
      contextWindow: 4096,
      input: ["image"],
      hidden: { preserved: true },
    };
    const second = { id: "second", maxTokens: 1024 };
    const third = { id: "third" };
    const changed = vi.fn();
    render(vh(Editor, { family: family, initial: [first, second, third], changed: changed }));
    const identity = screen.getByLabelText<HTMLInputElement>(`${en.modelId} 1`);
    const source = handle(1);
    const destination = row(handle(3));
    await fireEvent.click(screen.getByRole("button", { name: `${en.modelAdvanced} 1` }));
    await fireEvent.input(screen.getByLabelText(`${en.contextWindow} 1`), {
      target: { value: "unfinished" },
    });
    await fireEvent.input(screen.getByLabelText(`${en.maxTokens} 1`), {
      target: { value: "2000" },
    });
    changed.mockClear();
    const dataTransfer = transfer();
    await fireEvent.dragStart(source, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledExactlyOnceWith(
      "application/x-dsh-model-order",
      "1",
    );
    await fireEvent.dragOver(destination, { dataTransfer });
    expect(changed).not.toHaveBeenCalled();
    await fireEvent.drop(destination, { dataTransfer });
    await fireEvent.dragEnd(source);
    expect(changed).toHaveBeenCalledExactlyOnceWith([
      second,
      third,
      { ...first, contextWindow: Number.NaN, maxTokens: 2000 },
    ]);
    expect(screen.getByLabelText(`${en.modelId} 3`)).toBe(identity);
    expect(screen.getByLabelText<HTMLInputElement>(`${en.contextWindow} 3`).value).toBe(
      "unfinished",
    );
    expect(screen.getByLabelText<HTMLInputElement>(`${en.maxTokens} 3`).value).toBe("2000");
    expect(screen.queryByLabelText(`${en.contextWindow} 1`)).toBeNull();
    expect(first.contextWindow).toBe(4096);
  });
  it("moves with arrow keys, retains focus, and ignores moves past either end", async () => {
    const changed = vi.fn();
    render(
      vh(Editor, {
        family: family,
        initial: [{ id: "first" }, { id: "second" }],
        changed: changed,
      }),
    );
    const source = handle(1);
    expect(source.getAttribute("aria-description")).toBe(en.reorderModelHelp);
    source.focus();
    await fireEvent.keyDown(source, { key: "ArrowUp" });
    await fireEvent.keyDown(source, { key: "Enter" });
    expect(changed).not.toHaveBeenCalled();
    await fireEvent.keyDown(source, { key: "ArrowDown" });
    expect(handle(2)).toBe(source);
    expect(document.activeElement).toBe(source);
    await fireEvent.keyDown(source, { key: "ArrowDown" });
    expect(changed).toHaveBeenCalledExactlyOnceWith([{ id: "second" }, { id: "first" }]);
    await fireEvent.keyDown(source, { key: "ArrowUp" });
    expect(changed).toHaveBeenLastCalledWith([{ id: "first" }, { id: "second" }]);
  });
  it("marks and inserts before or after a row, ignoring adjacent insertions that keep the order", async () => {
    const changed = vi.fn();
    render(
      vh(Editor, {
        family: family,
        initial: [{ id: "first" }, { id: "second" }, { id: "third" }],
        changed: changed,
      }),
    );
    const source = handle(3);
    const destination = row(handle(1));
    vi.spyOn(destination, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 200, 40));
    const dataTransfer = transfer();
    await fireEvent.dragStart(source, { dataTransfer });
    await fireDrag(destination, "dragOver", 110, dataTransfer);
    expect(destination.dataset.dropTarget).toBe("before");
    await fireDrag(destination, "dragOver", 130, dataTransfer);
    expect(destination.dataset.dropTarget).toBe("after");
    await fireDrag(destination, "dragOver", 130, dataTransfer);
    await fireDrag(destination, "drop", 110, dataTransfer);
    await fireEvent.dragEnd(source);
    expect(changed).toHaveBeenCalledExactlyOnceWith([
      { id: "third" },
      { id: "first" },
      { id: "second" },
    ]);
    expect(destination.dataset.dropTarget).toBeUndefined();
    changed.mockClear();
    const adjacent = row(handle(2));
    vi.spyOn(adjacent, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 200, 40));
    await fireEvent.dragStart(source, { dataTransfer });
    await fireDrag(adjacent, "drop", 110, dataTransfer);
    await fireEvent.dragEnd(source);
    await fireEvent.dragStart(handle(2), { dataTransfer });
    await fireDrag(row(source), "drop", 0, dataTransfer);
    await fireEvent.dragEnd(handle(2));
    expect(changed).not.toHaveBeenCalled();
  });
  it("previews the whole expanded row from its handle and cleans it up at drag end or unmount", async () => {
    const view = render(
      vh(Editor, { family: family, initial: [{ id: "first" }], changed: vi.fn() }),
    );
    const source = handle(1);
    await fireEvent.click(screen.getByRole("button", { name: `${en.modelAdvanced} 1` }));
    const dataTransfer = transfer();
    await fireEvent.dragStart(source, { dataTransfer });
    const preview = dataTransfer.setDragImage.mock.calls[0]![0];
    expect(preview.inert).toBe(true);
    expect(preview.getAttribute("aria-hidden")).toBe("true");
    expect(preview.querySelector("[data-row-key]")).toBeNull();
    expect(within(preview).getByLabelText<HTMLInputElement>(`${en.modelId} 1`).value).toBe("first");
    expect(within(preview).getByLabelText(`${en.contextWindow} 1`).tabIndex).toBe(-1);
    expect(row(source).draggable).toBe(false);
    await fireEvent.dragEnd(source);
    expect(preview.isConnected).toBe(false);
    await fireEvent.dragEnd(source);
    await fireEvent.dragStart(source, { dataTransfer });
    const nextPreview = dataTransfer.setDragImage.mock.calls[1]![0];
    view.unmount();
    expect(nextPreview.isConnected).toBe(false);
  });
  it("keeps canceled, same-row, foreign, and disabled drops from changing the draft", async () => {
    const changed = vi.fn();
    const initial = [{ id: "first" }, { id: "second" }];
    const view = render(vh(Editor, { family: family, initial: initial, changed: changed }));
    const source = handle(1);
    const destination = row(handle(2));
    const dataTransfer = transfer();
    await fireEvent.drop(destination, { dataTransfer });
    await fireEvent.dragStart(source, { dataTransfer });
    await fireEvent.drop(row(source), { dataTransfer });
    await fireEvent.dragStart(source, { dataTransfer });
    await fireEvent.dragOver(destination, { dataTransfer });
    await fireEvent.dragEnd(source);
    await fireEvent.drop(destination, { dataTransfer });
    expect(changed).not.toHaveBeenCalled();
    await view.rerender(
      vh(Editor, { family: family, initial: initial, changed: changed, disabled: true }),
    );
    expect(source.disabled).toBe(true);
    expect(source.draggable).toBe(false);
    await fireEvent.keyDown(source, { key: "ArrowDown" });
    await fireEvent.drop(destination, { dataTransfer });
    expect(changed).not.toHaveBeenCalled();
  });
  it("clears an outside insertion marker without clearing another row or an internal transition", async () => {
    const changed = vi.fn();
    render(
      vh(Editor, {
        family: family,
        initial: [{ id: "first" }, { id: "second" }, { id: "third" }],
        changed: changed,
      }),
    );
    const source = handle(1);
    const second = row(handle(2));
    const third = row(handle(3));
    const dataTransfer = transfer();
    await fireEvent.dragStart(source, { dataTransfer });
    await fireEvent.dragOver(second, { dataTransfer });
    await leave(second, second.querySelector("input"));
    expect(second.dataset.dropTarget).toBe("after");
    await fireEvent.dragOver(third, { dataTransfer });
    await leave(second, third);
    expect(third.dataset.dropTarget).toBe("after");
    await leave(third, document.body);
    expect(third.dataset.dropTarget).toBeUndefined();
    await fireEvent.dragOver(second, { dataTransfer });
    await leave(second);
    expect(second.dataset.dropTarget).toBeUndefined();
    await fireEvent.dragEnd(source);
    expect(changed).not.toHaveBeenCalled();
  });
  it("keeps the animated list mounted when its last row is removed", async () => {
    render(vh(Editor, { family: family, initial: [{ id: "first" }], changed: vi.fn() }));
    const list = row(handle(1)).parentElement!;
    await fireEvent.click(screen.getByRole("button", { name: `${en.removeModel} 1` }));
    expect(list.isConnected).toBe(true);
    expect(screen.getByText(en.modelsEmpty)).toBeDefined();
  });
  it("keeps blank rows distinct through editing, moves, removal, and addition", async () => {
    render(vh(Editor, { family: family, initial: [{ id: "" }, { id: "" }], changed: vi.fn() }));
    const first = screen.getByLabelText<HTMLInputElement>(`${en.modelId} 1`);
    const second = screen.getByLabelText<HTMLInputElement>(`${en.modelId} 2`);
    first.focus();
    await fireEvent.input(first, { target: { value: "renamed" } });
    expect(document.activeElement).toBe(first);
    await fireEvent.keyDown(handle(1), { key: "ArrowDown" });
    expect(screen.getByLabelText(`${en.modelId} 2`)).toBe(first);
    expect(screen.getByLabelText(`${en.modelId} 1`)).toBe(second);
    await fireEvent.click(screen.getByRole("button", { name: `${en.removeModel} 1` }));
    expect(screen.getByLabelText(`${en.modelId} 1`)).toBe(first);
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    expect(screen.getByLabelText(`${en.modelId} 2`)).not.toBe(second);
    await fireEvent.keyDown(handle(2), { key: "ArrowUp" });
    expect(screen.getByLabelText(`${en.modelId} 2`)).toBe(first);
  });
  it("restores inherited order and clears row drafts when defaults are restored", async () => {
    render(
      vh(Editor, {
        family: family,
        initial: [{ id: "first" }, { id: "second" }],
        changed: vi.fn(),
      }),
    );
    await fireEvent.click(screen.getByRole("button", { name: `${en.modelAdvanced} 1` }));
    await fireEvent.input(screen.getByLabelText(`${en.contextWindow} 1`), {
      target: { value: "bad" },
    });
    await fireEvent.keyDown(handle(1), { key: "ArrowDown" });
    await fireEvent.click(screen.getByRole("button", { name: en.resetModels }));
    expect(screen.getByLabelText<HTMLInputElement>(`${en.modelId} 1`).value).toBe("first");
    expect(screen.queryByLabelText(`${en.contextWindow} 1`)).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: `${en.modelAdvanced} 1` }));
    expect(screen.getByLabelText<HTMLInputElement>(`${en.contextWindow} 1`).value).toBe("");
  });
});
it("does not accept another provider editor's dragged model", async () => {
  const firstChanged = vi.fn();
  const secondChanged = vi.fn();
  const first = render(
    vh(Editor, { family: "pi-ai", initial: [{ id: "a" }, { id: "b" }], changed: firstChanged }),
  );
  const second = render(
    vh(Editor, { family: "deepseek", initial: [{ id: "c" }, { id: "d" }], changed: secondChanged }),
  );
  const source = within(first.container).getByRole<HTMLButtonElement>("button", {
    name: `${en.reorderModel} 1`,
  });
  const destination = within(second.container).getByRole<HTMLButtonElement>("button", {
    name: `${en.reorderModel} 2`,
  });
  const dataTransfer = transfer();
  await fireEvent.dragStart(source, { dataTransfer });
  await fireEvent.dragOver(row(destination), { dataTransfer });
  await fireEvent.drop(row(destination), { dataTransfer });
  await fireEvent.dragEnd(source);
  expect(firstChanged).not.toHaveBeenCalled();
  expect(secondChanged).not.toHaveBeenCalled();
});
