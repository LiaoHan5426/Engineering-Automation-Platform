// @vitest-environment jsdom
import { computed, h as vueH, shallowRef } from "vue";
import { contextMenuHook } from "@deepseek-ai/dsh-client-test-runtime";
/** Image Blob ownership, media types, pane-contained rendering, and failure states. */
import { bindSnapshotSelector } from "@deepseek-ai/dsh-client-test-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { fireEvent, screen } from "@testing-library/dom";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { TabId } from "@deepseek-ai/dsh-client-ui-dockkit";
import { ImageBody, imageMediaType, type ImageBodyProps } from "../src/client/image/ImageBody.tsx";
import { en } from "../src/client/image/locales.ts";
import { createZoomStore } from "../src/client/zoom/store.ts";
const translations: ReadonlyMap<string, string> = new Map(Object.entries(en));
let createDescriptor: PropertyDescriptor | undefined;
let revokeDescriptor: PropertyDescriptor | undefined;
const create = vi.fn<(blob: Blob) => string>();
const revoke = vi.fn<(url: string) => void>();
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
  createDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  revokeDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  create
    .mockReset()
    .mockImplementation(() => `blob:https://preview.invalid/${create.mock.calls.length}`);
  revoke.mockReset();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
});
afterEach(() => {
  try {
    cleanup();
  } finally {
    if (createDescriptor === undefined) Reflect.deleteProperty(URL, "createObjectURL");
    else Object.defineProperty(URL, "createObjectURL", createDescriptor);
    if (revokeDescriptor === undefined) Reflect.deleteProperty(URL, "revokeObjectURL");
    else Object.defineProperty(URL, "revokeObjectURL", revokeDescriptor);
    vi.restoreAllMocks();
  }
});
function props(
  path = "asset.png",
  data: Uint8Array<ArrayBuffer> = new Uint8Array([1, 2, 3]),
  instance = createZoomStore().create(),
  controller = new AbortController(),
): ImageBodyProps {
  const useStore = bindSnapshotSelector(instance);
  return {
    fileDrag,
    useContextMenu: contextMenuHook(vi.fn()),
    resourceAddress: `dsh-resource://file/session/image/${path}`,
    content: { kind: "bytes", data },
    wrap: false,
    sessionId: "image" as SessionId,
    useTabInfo: () => shallowRef({ tab: { id: "image-tab" as TabId, signal: controller.signal } }),
    useResource: () => shallowRef({ value: undefined }),
    useStore,
    actions: instance.actions,
    retainTab: vi.fn(),
    scrollportRef: vi.fn(),
    t: (key, params) => {
      const value = translations.get(key) ?? key;
      return params === undefined
        ? value
        : Object.entries(params).reduce(
            (text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)),
            value,
          );
    },
  } as ImageBodyProps;
}
describe("ImageBody", () => {
  it("releases an image when its tab is removed before the store publishes", async () => {
    const instance = createZoomStore().create();
    const input = props("asset.png", new Uint8Array([1]), instance);
    const info = input.useTabInfo();
    instance.actions.zoom(info.value.tab.id, { kind: "fit-width" });
    const committed = shallowRef(true);
    const strictInfo = computed(() => {
      if (!committed.value) throw new Error("tab is no longer committed");
      return info.value;
    });
    const view = render(vueH(ImageBody, { ...input, useTabInfo: () => strictInfo }));
    await act(() => {
      committed.value = false;
      instance.actions.forget(info.value.tab.id);
      view.unmount();
    });
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:https://preview.invalid/1");
  });
  it.each([
    ["png", "image/png"],
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["gif", "image/gif"],
    ["webp", "image/webp"],
    ["bmp", "image/bmp"],
    ["ico", "image/x-icon"],
    ["svg", "image/svg+xml"],
  ] as const)("assigns .%s bytes the %s Blob media type", async (extension, mediaType) => {
    const view = render(
      vueH(ImageBody, {
        ...props(`asset.${extension}`),
      }),
    );
    const image = await screen.findByRole("img", { hidden: true });
    expect(create.mock.calls[0]?.[0].type).toBe(mediaType);
    expect(image.getAttribute("src")).toBe("blob:https://preview.invalid/1");
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 10 });
    await act(() => fireEvent.load(image));
    expect(screen.getByRole("toolbar", { name: "Zoom controls" })).toBeTruthy();
    view.unmount();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:https://preview.invalid/1");
  });
  it("allows a contained image to drag, then shows it after decoding succeeds", async () => {
    render(
      vueH(ImageBody, {
        ...props("photo.svg"),
      }),
    );
    const image = await screen.findByRole("img", { hidden: true });
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 50 });
    expect(image.getAttribute("alt")).toBe("Image preview: photo.svg");
    expect(image.getAttribute("decoding")).toBe("async");
    expect(image.getAttribute("draggable")).toBe("true");
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(image.parentElement?.hasAttribute("hidden")).toBe(true);
    await act(() => fireEvent.load(image));
    expect(image.parentElement?.hasAttribute("hidden")).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Choose zoom" }).textContent).toContain("100%");
  });
  it("revokes replaced bytes and reports image decode and Blob creation failures", async () => {
    const initial = props();
    const view = render(
      vueH(ImageBody, {
        ...initial,
      }),
    );
    const first = await screen.findByRole("img", { hidden: true });
    await act(() => fireEvent.error(first));
    expect(screen.getByRole("alert").textContent).toBe(en.failed);
    const changed = props("asset.png", new Uint8Array([4, 5, 6]));
    await view.rerender(
      vueH(ImageBody, {
        ...changed,
      }),
    );
    await screen.findByRole("img", { hidden: true });
    expect(revoke).toHaveBeenCalledWith("blob:https://preview.invalid/1");
    create.mockImplementationOnce(() => {
      throw new Error("Blob unavailable");
    });
    await view.rerender(
      vueH(ImageBody, {
        ...props("changed.png", new Uint8Array([7])),
      }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(en.failed);
    view.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:https://preview.invalid/2");
  });
  it("rejects text delivery and an unregistered suffix without creating a Blob", async () => {
    const initial = props();
    const view = render(
      vueH(ImageBody, {
        ...initial,
        content: { kind: "text", text: "plain", pages: [], eof: true },
      }),
    );
    expect(screen.getByRole("alert").textContent).toBe(en.unsupported);
    await view.rerender(
      vueH(ImageBody, {
        ...props("asset.unknown"),
      }),
    );
    expect(screen.getByRole("alert").textContent).toBe(en.unsupported);
    expect(create).not.toHaveBeenCalled();
  });
  it("matches media types case-insensitively on decoded path suffixes", () => {
    expect(imageMediaType("folder/PHOTO.JPEG")).toBe("image/jpeg");
    expect(imageMediaType("folder/no-extension")).toBeUndefined();
    expect(imageMediaType("folder/photo.avif")).toBeUndefined();
  });
  it("retains image zoom without recreating the image or Blob URL", async () => {
    const instance = createZoomStore().create();
    const initial = props("diagram.svg", new Uint8Array([4, 5, 6]), instance);
    const view = render(
      vueH(ImageBody, {
        ...initial,
      }),
    );
    const image = await screen.findByRole("img", { hidden: true });
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 200 });
    await act(() => fireEvent.load(image));
    expect(screen.getByRole("button", { name: "Choose zoom" }).textContent).toContain("38%");
    await act(() => fireEvent.click(screen.getByRole("button", { name: "Choose zoom" })));
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "150%" })));
    expect(instance.getSnapshot().byTab["image-tab" as TabId]).toEqual({
      kind: "fixed",
      scale: 1.5,
    });
    expect(screen.getByRole("img")).toBe(image);
    expect(create).toHaveBeenCalledOnce();
    await view.rerender(
      vueH(ImageBody, {
        ...props(
          "diagram.svg",
          initial.content.kind === "bytes" ? initial.content.data : new Uint8Array(),
          instance,
        ),
      }),
    );
    expect(screen.getByRole("img")).toBe(image);
    expect(screen.getByRole("button", { name: "Choose zoom" }).textContent).toContain("150%");
    await act(() => fireEvent.click(screen.getByRole("button", { name: "Choose zoom" })));
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Fit width" })));
    expect(instance.getSnapshot().byTab["image-tab" as TabId]).toEqual({ kind: "fit-width" });
  });
});
const fileDrag = {
  prepare: vi.fn(async () => ({ start: () => true, release: () => {} })),
  reportFailure: vi.fn(),
};
it("opens the original image menu from the preview", async () => {
  const p = props("asset.svg");
  const openMenu = vi.fn();
  p.useContextMenu = contextMenuHook(openMenu);
  render(
    vueH(ImageBody, {
      ...p,
    }),
  );
  const image = await screen.findByRole("img", { hidden: true });
  await act(() => fireEvent.contextMenu(image, { clientX: 35, clientY: 46 }));
  expect(openMenu).toHaveBeenLastCalledWith(
    {
      kind: "image",
      value: {
        sessionId: "image",
        path: "asset.svg",
        url: "blob:https://preview.invalid/1",
        mediaType: "image/svg+xml",
      },
    },
    { x: 35, y: 46 },
  );
});
