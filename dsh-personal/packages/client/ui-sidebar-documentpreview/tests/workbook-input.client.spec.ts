// @vitest-environment jsdom
/** Native input adaptations preserve engine-owned navigation and unrelated controls. */
import { h } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
vi.mock("luckysheet-preview:assets", () => ({ css: "", scripts: [] }));
import { Workbook } from "../src/client/excel/Workbook.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture() {
  let load: EventListenerOrEventListenerObject | null = null;
  vi.spyOn(HTMLIFrameElement.prototype, "addEventListener").mockImplementation(
    function (type, listener) {
      if (type === "load") load = listener;
    },
  );
  const view = render(h(Workbook, { sheets: [], language: "en", label: "Budget" }));
  const frame = view.container.querySelector("iframe");
  if (frame?.contentWindow == null) throw new Error("Missing workbook realm");
  const doc = frame.contentWindow.document;
  const create = vi.fn(() => {
    doc.body.innerHTML =
      '<div id="workbook"><div id="luckysheet-grid-window-1"><div id="luckysheet-cell-main"></div></div><div id="luckysheet-scrollbar-x"></div><div id="luckysheet-scrollbar-y"></div><div id="luckysheet-sheet-container-c"></div><div id="luckysheet-functionbox-cell"></div><div id="luckysheet-rich-text-editor" tabindex="0"></div><input id="other"></div>';
  });
  const resize = vi.fn();
  frame.contentWindow.luckysheet = {
    create,
    destroy: vi.fn(),
    resize,
    getRangeHtml: () => "<table><tr><td>99</td><td>=1+1</td></tr></table>",
  };
  await act(() => {
    if (typeof load === "function") load.call(frame, new Event("load"));
    else load?.handleEvent(new Event("load"));
  });
  const element = (id: string) => {
    const node = doc.getElementById(id);
    if (node === null) throw new Error(`Missing ${id}`);
    return node;
  };
  return { view, doc, element, frame, resize };
}

it.each(["right", "left", "oversized", "visible", "zero width", "disposed", "old realm"] as const)(
  "reveals the selected sheet after its owned resize: %s",
  async (condition) => {
    const callbacks: (() => void)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class implements ResizeObserver {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(() => callback([], this));
        }
      },
    );
    const { view, doc, frame, element, resize } = await fixture();
    const port = element("luckysheet-sheet-container-c");
    const selected = port.appendChild(doc.createElement("div"));
    selected.className = "luckysheet-sheets-item-active";
    let offset = 100;
    const write = vi.fn((value: number) => {
      offset = value;
    });
    Object.defineProperty(port, "scrollLeft", { get: () => offset, set: write });
    vi.spyOn(port, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, condition === "zero width" ? 0 : 91, 29),
    );
    const bounds = vi
      .spyOn(selected, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(0, 0, 20, 29));
    resize.mockImplementation(() => {
      const [left, width] =
        condition === "left"
          ? [-20, 80]
          : condition === "right"
            ? [60, 40]
            : condition === "oversized"
              ? [83, 97]
              : [5, 80];
      bounds.mockImplementation(() => new DOMRect(left - (offset - 100), 0, width, 29));
    });
    if (condition === "disposed") view.unmount();
    if (condition === "old realm")
      vi.spyOn(frame, "contentDocument", "get").mockReturnValue(
        document.implementation.createHTMLDocument(),
      );
    const notify = callbacks[0];
    if (notify === undefined) throw new Error("Missing workbook resize observer");
    await act(notify);
    const delta =
      condition === "right" ? 9 : condition === "left" ? -20 : condition === "oversized" ? 89 : 0;
    expect(offset).toBe(100 + delta);
    expect(write).toHaveBeenCalledTimes(delta === 0 ? 0 : 1);
    expect(resize).toHaveBeenCalledTimes(
      condition === "disposed" || condition === "old realm" ? 0 : 1,
    );
    if (condition === "oversized") {
      await act(notify);
      expect(write).toHaveBeenCalledTimes(1);
      expect(offset).toBe(189);
    }
  },
);

it("passes both pixel axes through engine scrollports and leaves other wheel gestures alone", async () => {
  const { view, element } = await fixture();
  const grid = element("luckysheet-cell-main");
  const x = element("luckysheet-scrollbar-x"),
    y = element("luckysheet-scrollbar-y");
  x.scrollLeft = 240;
  y.scrollTop = 240;
  const wheel = (target: HTMLElement, init: WheelEventInit) =>
    target.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init }));
  expect(wheel(grid, { deltaX: 37, deltaY: 19 })).toBe(false);
  expect([x.scrollLeft, y.scrollTop]).toEqual([277, 259]);
  expect(wheel(grid, { deltaX: -13, deltaY: -11 })).toBe(false);
  expect([x.scrollLeft, y.scrollTop]).toEqual([264, 248]);
  for (const options of [
    { ctrlKey: true },
    { metaKey: true },
    { deltaMode: 1 },
    { deltaMode: 2 },
    { deltaX: 0, deltaY: 0 },
  ]) {
    expect(wheel(grid, { deltaX: 10, deltaY: 10, ...options })).toBe(true);
  }
  expect(wheel(element("luckysheet-functionbox-cell"), { deltaX: 40 })).toBe(true);
  expect([x.scrollLeft, y.scrollTop]).toEqual([264, 248]);
  const tabs = element("luckysheet-sheet-container-c");
  expect(wheel(tabs, { deltaY: 180 })).toBe(false);
  expect(tabs.scrollLeft).toBe(180);
  expect([x.scrollLeft, y.scrollTop]).toEqual([264, 248]);
  view.unmount();
  expect(wheel(grid, { deltaX: 37, deltaY: 19 })).toBe(true);
  expect([x.scrollLeft, y.scrollTop]).toEqual([264, 248]);
});

it("scrolls sheet arrows by exactly 150 pixels without invoking the native interval", async () => {
  const { view, doc, element } = await fixture();
  const tabs = element("luckysheet-sheet-container-c");
  const right = doc.createElement("button");
  right.id = "luckysheet-sheets-rightscroll";
  const icon = right.appendChild(doc.createElement("span"));
  const left = doc.createElement("button");
  left.id = "luckysheet-sheets-leftscroll";
  element("workbook").append(left, right);
  const native = vi.fn();
  right.addEventListener("click", native);
  icon.click();
  expect(tabs.scrollLeft).toBe(150);
  expect(native).not.toHaveBeenCalled();
  left.click();
  expect(tabs.scrollLeft).toBe(0);
  const unrelated = vi.fn();
  element("other").addEventListener("click", unrelated);
  element("other").click();
  expect(unrelated).toHaveBeenCalledOnce();
  view.unmount();
  icon.click();
  expect(tabs.scrollLeft).toBe(0);
  expect(native).toHaveBeenCalledOnce();
});

it("blocks editable sheet gestures while preserving native clicks and other controls", async () => {
  const { view, element } = await fixture();
  const tabs = element("luckysheet-sheet-container-c");
  const sheet = tabs.appendChild(tabs.ownerDocument.createElement("span"));
  const down = vi.fn(),
    click = vi.fn();
  tabs.addEventListener("mousedown", down);
  tabs.addEventListener("click", click);
  expect(
    sheet.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })),
  ).toBe(true);
  expect(down).not.toHaveBeenCalled();
  expect(
    sheet.dispatchEvent(
      new MouseEvent("mousedown", { button: 2, bubbles: true, cancelable: true }),
    ),
  ).toBe(false);
  expect(
    sheet.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
  ).toBe(false);
  sheet.click();
  expect(click).toHaveBeenCalledOnce();
  const other = element("other");
  other.addEventListener("mousedown", down);
  expect(
    other.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })),
  ).toBe(true);
  expect(down).toHaveBeenCalledOnce();
  view.unmount();
  expect(
    sheet.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
  ).toBe(true);
});

it.each(["restore", "other control", "unfocused document", "disposed", "input retained"] as const)(
  "restores only the owned table-copy focus: %s",
  async (condition) => {
    const { view, doc, element } = await fixture();
    vi.spyOn(doc, "hasFocus").mockReturnValue(condition !== "unfocused document");
    const editor = element("luckysheet-rich-text-editor");
    const focus = vi.spyOn(editor, "focus");
    const input = doc.createElement("textarea");
    input.value = '<table data-type="luckysheet_copy_action_table"><tr><td>99</td></tr></table>';
    doc.body.append(input);
    input.focus();
    const setData = vi.fn();
    const event = Object.assign(new Event("copy", { bubbles: true, cancelable: true }), {
      clipboardData: { setData },
    });
    expect(input.dispatchEvent(event)).toBe(false);
    expect(setData.mock.calls).toEqual([
      ["text/html", "<table><tr><td>99</td><td>=1+1</td></tr></table>"],
      ["text/plain", "99\t=1+1\n"],
    ]);
    if (condition !== "input retained") input.remove();
    if (condition === "other control") element("other").focus();
    if (condition === "disposed") view.unmount();
    await act(() => {});
    expect(focus).toHaveBeenCalledTimes(condition === "restore" ? 1 : 0);
    if (condition === "restore") {
      expect(doc.activeElement).toBe(editor);
      expect(editor.tabIndex).toBe(0);
    }
  },
);

it("rejects editor mutation keys without replacing native navigation or selection", async () => {
  const { element } = await fixture();
  const editor = element("luckysheet-rich-text-editor");
  const key = (value: string, init: KeyboardEventInit = {}) =>
    editor.dispatchEvent(
      new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...init }),
    );
  for (const value of ["M", "Delete", "Backspace", "Enter", "F2"]) expect(key(value)).toBe(false);
  for (const value of ["v", "x"]) expect(key(value, { ctrlKey: true })).toBe(false);
  for (const value of ["ArrowRight", "ArrowLeft", "Home", "End", "F3"])
    expect(key(value)).toBe(true);
  for (const value of ["a", "c"]) expect(key(value, { ctrlKey: true })).toBe(true);
  for (const type of ["beforeinput", "paste", "drop", "cut"])
    expect(editor.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))).toBe(false);
});

it("leaves ordinary input copying to the browser", async () => {
  const { doc, element } = await fixture();
  const input = element("other");
  input.focus();
  const setData = vi.fn();
  expect(
    input.dispatchEvent(
      Object.assign(new Event("copy", { bubbles: true, cancelable: true }), {
        clipboardData: { setData },
      }),
    ),
  ).toBe(true);
  await act(() => {});
  expect(setData).not.toHaveBeenCalled();
  expect(doc.activeElement).toBe(input);
});
