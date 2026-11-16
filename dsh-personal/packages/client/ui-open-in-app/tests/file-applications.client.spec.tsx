// @vitest-environment jsdom
/** Shared association reads retain one native request until the last control leaves. */
import { shallowRef } from "vue";
import {
  flushVue as act,
  cleanupVue as cleanup,
  renderHookVue as renderHook,
} from "./vue-render.ts";
import { afterEach, expect, it, vi } from "vitest";
import type { SessionWorkspacePathApplication } from "@deepseek-ai/dsh-api-session-controller/types";
import { useFileApplications } from "../src/client/file-applications.ts";

afterEach(cleanup);
const music = [{ id: "music", name: "Music", default: true, icon: null }];

it("shares the initial read and publishes a menu refresh to both controls", async () => {
  const query = vi.fn(async () => music);
  const first = renderHook(() => useFileApplications("/file.mp3", () => query, true));
  const second = renderHook(() => useFileApplications("/file.mp3", () => query, true));
  await act(async () => {});
  expect(query).toHaveBeenCalledOnce();
  expect(first.result.current.value.apps).toBe(second.result.current.value.apps);
  query.mockResolvedValueOnce([{ id: "player", name: "Player", default: true, icon: null }]);
  await act(async () => {
    second.result.current.value.refresh();
  });
  expect(query).toHaveBeenCalledTimes(2);
  expect(first.result.current.value.apps[0]?.id).toBe("player");
  expect(second.result.current.value.apps).toBe(first.result.current.value.apps);
});

it("cancels only after the last consumer leaves and discards the released result", async () => {
  const pending = Promise.withResolvers<readonly SessionWorkspacePathApplication[] | null>();
  const query = vi.fn((_path: string, _signal: AbortSignal) => pending.promise);
  const first = renderHook(() => useFileApplications("/file.mp3", () => query, true));
  const second = renderHook(() => useFileApplications("/file.mp3", () => query, true));
  const signal = query.mock.calls[0]![1];
  first.unmount();
  expect(signal.aborted).toBe(false);
  second.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    pending.resolve(music);
  });
  const next = renderHook(() => useFileApplications("/file.mp3", () => query, true));
  expect(query).toHaveBeenCalledTimes(2);
  await act(async () => {});
  expect(next.result.current.value.apps).toEqual(music);
});

it("keeps disabled controls out of the query and permits refresh only while retained", async () => {
  const query = vi.fn(async () => music);
  const enabled = shallowRef(false);
  const view = renderHook(() => useFileApplications("/file.mp3", () => query, enabled));
  await act(() => {
    view.result.current.value.refresh();
  });
  expect(query).not.toHaveBeenCalled();
  enabled.value = true;
  await act(async () => {});
  expect(view.result.current.value.apps).toEqual(music);
  enabled.value = false;
  await act(() => {
    view.result.current.value.refresh();
  });
  expect(query).toHaveBeenCalledOnce();
});

it("releases old targets and readers when reactive inputs change", async () => {
  const pending = Promise.withResolvers<readonly SessionWorkspacePathApplication[] | null>();
  const first = vi.fn((_path: string, _signal: AbortSignal) => pending.promise);
  const second = vi.fn(async (_path: string, _signal: AbortSignal) => music);
  const target = shallowRef("/first.mp3");
  const reader =
    shallowRef<
      (
        path: string,
        signal: AbortSignal,
      ) => Promise<readonly SessionWorkspacePathApplication[] | null>
    >(first);
  const view = renderHook(() => useFileApplications(target, reader, true));
  const originalSignal = first.mock.calls[0]![1];
  target.value = "/second.mp3";
  expect(originalSignal.aborted).toBe(true);
  const nextSignal = first.mock.calls[1]![1];
  reader.value = second;
  expect(nextSignal.aborted).toBe(true);
  await act(async () => {});
  expect(second).toHaveBeenCalledWith("/second.mp3", expect.any(AbortSignal));
  expect(view.result.current.value.apps).toEqual(music);
  await act(() => {
    pending.resolve([]);
  });
  expect(view.result.current.value.apps).toEqual(music);
});
