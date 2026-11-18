// @vitest-environment jsdom
import { effectScope, shallowRef } from "vue";
import { flushVue as act } from "./vue-render.ts";
import { afterEach, beforeEach, onTestFinished, describe, expect, it, vi } from "vite-plus/test";
import { useClipboardCopy } from "../src/use-clipboard-copy.ts";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const writeText = vi.fn<(text: string) => Promise<void>>();
beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});
afterEach(() => {
  vi.useRealTimers();
  if (originalClipboard === undefined) Reflect.deleteProperty(navigator, "clipboard");
  else Object.defineProperty(navigator, "clipboard", originalClipboard);
});

function mountCopy(text: string) {
  const source = shallowRef(text);
  const scope = effectScope();
  const result = scope.run(() => useClipboardCopy(() => source.value));
  if (result === undefined) throw new Error("Missing copy scope");
  onTestFinished(() => {
    scope.stop();
  });
  return {
    result,
    rerender: (next: { text: string }) => {
      source.value = next.text;
    },
    unmount: () => {
      scope.stop();
    },
  };
}

/** Complete the clipboard promise and its success feedback callback. */
async function settleCopy(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useClipboardCopy", () => {
  it("copies current text, blocks success-window repeats, and resets after one second", async () => {
    const { result, rerender } = mountCopy("first");
    const callback = result.onCopy;
    rerender({ text: "first" });
    expect(result.onCopy).toBe(callback);
    await act(() => {
      result.onCopy();
    });
    expect(writeText).toHaveBeenCalledWith("first");
    await settleCopy();
    expect(result.copied.value).toBe(true);
    await act(() => {
      result.onCopy();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    await act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.copied.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    rerender({ text: "second" });
    await act(() => {
      result.onCopy();
    });
    expect(writeText).toHaveBeenLastCalledWith("second");
    await settleCopy();
  });

  it("blocks overlapping writes and ignores completion after unmount", async () => {
    let finish: (() => void) | undefined;
    writeText.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result, unmount } = mountCopy("pending");
    await act(() => {
      result.onCopy();
      result.onCopy();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(result.copied.value).toBe(false);
    unmount();
    finish!();
    await settleCopy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps failure unconfirmed and allows another attempt", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const { result } = mountCopy("retry");
    await act(() => {
      result.onCopy();
    });
    await settleCopy();
    expect(result.copied.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await act(() => {
      result.onCopy();
    });
    await settleCopy();
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(result.copied.value).toBe(true);
  });

  it("releases its success reset timer on unmount", async () => {
    const { result, unmount } = mountCopy("done");
    await act(() => {
      result.onCopy();
    });
    await settleCopy();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
