import { h, nextTick } from "vue";
import { fireEvent as fireEventNative } from "@testing-library/dom";
// @vitest-environment jsdom
/** Raw-data height follows pointer capture and keyboard resizing without remounting the panel. */
import {
  cleanup,
  render as renderNative,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { afterEach, expect, it, vi } from "vitest";
import { InspectorDetails } from "../src/client/views/InspectorDetails.tsx";
import { en } from "../src/client/locales.ts";
afterEach(cleanup);
it("drags the upper edge, retains height across record changes, and stops on cancellation", async () => {
  const t = makeTranslate(en);
  const close = vi.fn();
  const ui = await render(h(InspectorDetails, { text: "first record", close: close, t: t }));
  const handle = ui.getByRole("separator");
  const panel = handle.parentElement!;
  vi.spyOn(ui.container, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 500));
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 300, 500, 200));
  const captures = new Set<number>();
  Object.assign(handle, {
    setPointerCapture: (id: number) => {
      captures.add(id);
    },
    hasPointerCapture: (id: number) => captures.has(id),
    releasePointerCapture: (id: number) => {
      captures.delete(id);
    },
  });
  const pointer = async (type: string, y: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, button: 0, clientY: y });
    await fireEvent(handle, event);
  };
  await pointer("pointerdown", 300);
  await pointer("pointermove", 250);
  expect(panel.style.flexBasis).toBe("50%");
  await ui.rerender(h(InspectorDetails, { text: "second record", close: close, t: t }));
  expect(handle.parentElement).toBe(panel);
  expect(panel.style.flexBasis).toBe("50%");
  await pointer("pointercancel", 250);
  await pointer("pointermove", 100);
  expect(panel.style.flexBasis).toBe("50%");
  expect(captures.size).toBe(0);
  await fireEvent.keyDown(handle, { key: "ArrowUp" });
  expect(panel.style.flexBasis).toBe("55%");
  await fireEvent.keyDown(handle, { key: "End" });
  expect(panel.style.flexBasis).toBe("80%");
  await fireEvent.keyDown(handle, { key: "Home" });
  expect(panel.style.flexBasis).toBe("15%");
  await fireEvent.click(ui.getByRole("button", { name: "Close" }));
  expect(close).toHaveBeenCalledOnce();
});
it("ignores competing pointers and missing geometry and releases capture on completion or loss", async () => {
  const ui = await render(
    h(InspectorDetails, { text: "record", close: vi.fn(), t: makeTranslate(en) }),
  );
  const handle = ui.getByRole("separator");
  const panel = handle.parentElement!;
  const captured = new Set<number>();
  Object.assign(handle, {
    setPointerCapture: (id: number) => {
      captured.add(id);
    },
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => {
      captured.delete(id);
    },
  });
  const pointer = async (type: string, pointerId = 1, button = 0, y = 300) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId, button, clientY: y });
    await fireEvent(handle, event);
  };
  await pointer("pointerdown");
  expect(captured.size).toBe(0);
  vi.spyOn(ui.container, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 500));
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 300, 500, 200));
  await pointer("pointerdown", 1, 1);
  expect(captured.size).toBe(0);
  await pointer("pointerdown");
  await pointer("pointerdown", 2);
  await pointer("pointerup", 2, 0, 100);
  expect([...captured]).toEqual([1]);
  expect(panel.style.flexBasis).toBe("40%");
  captured.clear();
  await pointer("pointerup", 1, 0, 250);
  expect(panel.style.flexBasis).toBe("50%");
  await pointer("pointercancel");
  await pointer("pointerdown");
  await pointer("lostpointercapture");
  await pointer("pointermove", 1, 0, 100);
  expect(panel.style.flexBasis).toBe("50%");
  await fireEvent.keyDown(handle, { key: "ArrowDown" });
  expect(panel.style.flexBasis).toBe("45%");
  const ignored = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  await fireEvent(handle, ignored);
  expect(ignored.defaultPrevented).toBe(false);
  handle.addEventListener(
    "pointerdown",
    () => {
      panel.remove();
    },
    { once: true, capture: true },
  );
  captured.clear();
  await pointer("pointerdown");
  expect(captured.size).toBe(0);
  ui.container.append(panel);
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
