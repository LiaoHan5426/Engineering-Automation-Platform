import { h, nextTick } from "vue";
// @vitest-environment jsdom
import { contextMenuHook } from "@deepseek-ai/dsh-client-test-runtime";
import {
  cleanup,
  render as renderNative,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import { fireEvent as dispatchDom } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { MarkdownDelegateProvider, MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
afterEach(cleanup);
it("leaves undeclared plugin links alone and binds only explicitly rendered Markdown targets", async () => {
  const open = vi.fn();
  const custom = vi.fn();
  const view = await render(
    h(
      MarkdownDelegateProvider,
      { getTriggerProps: contextMenuHook(open)().getTriggerProps, openFile: () => {} },
      {
        default: () => [
          h("a", { href: "https://example.com/plugin" }, ["Plugin link"]),
          h(MarkdownText, {
            text: "[File](docs/file.ts#L42)",
            labels: { code: { copyLabel: "Copy", copiedLabel: "Copied" }, footnotes: "Footnotes" },
          }),
          h(
            "button",
            { ...contextMenuHook(custom)().getTriggerProps({ kind: "pluginDocument", id: "one" }) },
            ["Plugin target"],
          ),
        ],
      },
    ),
  );
  expect(await fireEvent.contextMenu(view.getByRole("link", { name: "Plugin link" }))).toBe(true);
  expect(open).not.toHaveBeenCalled();
  const file = view.getByRole("button", { name: "File" });
  await fireEvent.contextMenu(file, { clientX: 40, clientY: 50 });
  expect(open).toHaveBeenLastCalledWith(
    { kind: "file", path: "docs/file.ts", line: 42 },
    { x: 40, y: 50 },
  );
  file.getBoundingClientRect = () => new DOMRect(30, 40, 100, 20);
  await fireEvent.keyDown(file, { key: "F10", shiftKey: true });
  expect(open).toHaveBeenLastCalledWith(
    { kind: "file", path: "docs/file.ts", line: 42 },
    { x: 30, y: 60 },
  );
  expect(document.activeElement).toBe(file);
  await fireEvent.contextMenu(view.getByRole("button", { name: "Plugin target" }), {
    clientX: 70,
    clientY: 80,
  });
  expect(custom).toHaveBeenCalledExactlyOnceWith(
    { kind: "pluginDocument", id: "one" },
    { x: 70, y: 80 },
  );
  expect(open).toHaveBeenCalledTimes(2);
});

const fireEvent = {
  async contextMenu(...args: Parameters<typeof dispatchDom.contextMenu>) {
    await nextTick();
    const result = dispatchDom.contextMenu(...args);
    await nextTick();
    return result;
  },
  async keyDown(...args: Parameters<typeof dispatchDom.keyDown>) {
    await nextTick();
    const result = dispatchDom.keyDown(...args);
    await nextTick();
    return result;
  },
};

async function render(...args: Parameters<typeof renderNative>) {
  const view = renderNative(...args);
  await nextTick();
  return view;
}
