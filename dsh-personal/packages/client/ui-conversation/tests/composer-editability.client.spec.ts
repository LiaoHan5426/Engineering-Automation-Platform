// @vitest-environment jsdom
import { createEditor, type LexicalEditor } from "lexical";
import { createApp, defineComponent, h, nextTick, shallowRef } from "vue";
import { expect, it, onTestFinished, vi } from "vite-plus/test";
import { ComposerContentEditable } from "../src/client/input/editor/ComposerContentEditable.tsx";

it.each(["initial", "deferred"] as const)(
  "makes the %s editor host focusable before publishing its root",
  async (binding) => {
    const editor = createEditor({
      namespace: "composer-root-focus",
      onError: (error) => {
        throw error;
      },
    });
    const bound = shallowRef<LexicalEditor | null>(binding === "initial" ? editor : null);
    const editable = shallowRef(true);
    const container = document.createElement("div");
    document.body.append(container);
    const publications: Array<{ gate: string | null; editable: boolean; focused: boolean }> = [];
    const removeRootListener = editor.registerRootListener((root) => {
      if (root === null) return;
      root.focus();
      publications.push({
        gate: root.getAttribute("contenteditable"),
        editable: editor.isEditable(),
        focused: document.activeElement === root,
      });
    });
    const app = createApp(
      defineComponent(
        () => () =>
          h(ComposerContentEditable, {
            editor: bound.value,
            editable: editable.value,
          }),
      ),
    );
    onTestFinished(() => {
      app.unmount();
      removeRootListener();
      container.remove();
    });
    app.mount(container);
    await nextTick();
    const host = container.querySelector<HTMLDivElement>("[data-composer-input]")!;
    if (binding === "deferred") {
      expect(editor.getRootElement()).toBeNull();
      expect(host.getAttribute("contenteditable")).toBe("false");
      expect(publications).toEqual([]);
      bound.value = editor;
      await nextTick();
    }
    expect(editor.getRootElement()).toBe(host);
    expect(publications).toEqual([{ gate: "true", editable: true, focused: true }]);
    editable.value = false;
    await nextTick();
    editable.value = true;
    await nextTick();
    expect(editor.getRootElement()).toBe(host);
    expect(publications).toHaveLength(1);
  },
);

it("commits the accepted echo before changing the resident editing host gate", async () => {
  const editor = createEditor({
    namespace: "composer-gate",
    onError: (error) => {
      throw error;
    },
  });
  const bound = shallowRef<LexicalEditor | null>(editor);
  const editable = shallowRef(true);
  const echo = shallowRef("");
  const container = document.createElement("div");
  document.body.append(container);
  const app = createApp(
    defineComponent(
      () => () =>
        h("section", null, [
          h(ComposerContentEditable, { editor: bound.value, editable: editable.value }),
          h("p", { "data-echo": "" }, echo.value),
        ]),
    ),
  );
  onTestFinished(() => {
    app.unmount();
    container.remove();
  });
  app.mount(container);
  await nextTick();
  const host = container.querySelector<HTMLDivElement>("[data-composer-input]")!;
  expect(editor.getRootElement()).toBe(host);
  expect(host.getAttribute("contenteditable")).toBe("true");
  const atGate: string[] = [];
  const setAttribute = host.setAttribute.bind(host);
  const write = vi.spyOn(host, "setAttribute").mockImplementation((name, value) => {
    if (name === "contenteditable" && value === "false") {
      atGate.push(container.querySelector("[data-echo]")?.textContent ?? "");
    }
    setAttribute(name, value);
  });
  onTestFinished(() => {
    write.mockRestore();
  });
  editable.value = false;
  echo.value = "Accepted message";
  await nextTick();
  expect(atGate).toEqual(["Accepted message"]);
  expect(editor.isEditable()).toBe(false);
  expect(editor.getRootElement()).toBe(host);
  expect(host.getAttribute("contenteditable")).toBe("false");
  editable.value = true;
  await nextTick();
  expect(editor.isEditable()).toBe(true);
  expect(host.getAttribute("contenteditable")).toBe("true");
  bound.value = null;
  await nextTick();
  expect(editor.getRootElement()).toBeNull();
  expect(container.querySelector("[data-composer-input]")).toBe(host);
  expect(host.getAttribute("contenteditable")).toBe("false");
});
