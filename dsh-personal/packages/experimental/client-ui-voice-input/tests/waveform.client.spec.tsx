// @vitest-environment jsdom
/** Measured microphone levels drive geometry; quiet audio never creates a synthetic signal. */
import { afterEach, expect, it, vi } from "vitest";
import { h } from "vue";
import {} from "@testing-library/dom";
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from "./vue-render.client.ts";
import { Waveform } from "../src/client/Waveform.tsx";
import { Recording } from "../src/client/audio.ts";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("samples real levels, throttles drawing, and cancels animation on unmount", async () => {
  let frame: FrameRequestCallback = () => {};
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 7;
    }),
  );
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const recording = new Recording(() => {});
  const amplitude = vi.spyOn(recording, "amplitude").mockReturnValue(0.1);
  const view = await act(async () =>
    render(h(Waveform, { recording: recording, label: "Recording" }, undefined)),
  );
  const lines = view.container.querySelectorAll("line");
  await act(() => {
    frame(0);
  });
  expect(Number(lines[79]!.getAttribute("y2"))).toBeGreaterThan(21);
  await act(() => {
    frame(20);
  });
  expect(amplitude).toHaveBeenCalledOnce();
  await act(() => {
    frame(50);
  });
  expect(amplitude).toHaveBeenCalledTimes(2);
  await act(async () =>
    view.rerender(h(Waveform, { recording: undefined, label: "Recording" }, undefined)),
  );
  await act(() => {
    frame(100);
  });
  expect(lines[79]!.getAttribute("y2")).toBe("21");
  view.unmount();
  expect(cancel).toHaveBeenCalledWith(7);
});
