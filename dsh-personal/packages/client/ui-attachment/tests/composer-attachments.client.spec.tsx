// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "vue";
import { fireEvent } from "@testing-library/dom";
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from "./vue-render.ts";
import type {
  ComposerAttachment,
  ComposerAttachmentsOwnerProps,
  ComposerAttachmentsProps,
} from "@deepseek-ai/dsh-client-ui-conversation/client";
import { ComposerAttachments } from "../src/client/ComposerAttachments.tsx";
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const t = ((key: string, params?: Readonly<Record<string, unknown>>): string => {
  const messages: Record<string, string> = {
    "attachment.pending": "待发送附件",
    "attachment.scrollLeft": "向左滚动附件",
    "attachment.scrollRight": "向右滚动附件",
    "file.pending": "待发送文件",
    "file.uploading": "上传中…",
    "file.uploadFailed": "上传失败，点击重试",
    "file.label": "文件",
    "image.pending": "待发送图片",
    "image.original": "原图",
    "image.preview": "原图预览",
    "image.closePreview": "关闭原图预览",
    "image.openOriginal": "查看原图",
    "attachment.dropBlocked": "当前无法添加文件或图片",
    "attachment.dropTitle": "文件或图片拖动到此处即可添加",
  };
  if (key === "file.remove") {
    const name = params?.name;
    return `移除文件 ${typeof name === "string" ? name : ""}`;
  }
  if (key === "file.retry") {
    const name = params?.name;
    return `重试上传 ${typeof name === "string" ? name : ""}`;
  }
  if (key === "image.remove") {
    const name = params?.name;
    return `移除图片 ${typeof name === "string" ? name : ""}`;
  }
  if (key === "attachment.dropDesc") {
    const count = params?.count;
    const size = params?.size;
    return `图片限制：最多 ${typeof count === "number" ? String(count) : ""} 张，每张 ${typeof size === "string" ? size : ""}`;
  }
  return messages[key] ?? key;
}) as ComposerAttachmentsProps["t"];
function attachment(id: string, name = `${id}.png`): ComposerAttachment {
  return {
    kind: "image",
    id: id as ComposerAttachment["id"],
    file: new File([Uint8Array.of(1)], name, { type: "image/png" }),
    previewUrl: `blob:${id}`,
  };
}
function fileDraft(id: string, name = `${id}.pdf`): ComposerAttachment {
  return {
    kind: "file",
    id: id as ComposerAttachment["id"],
    file: new File([Uint8Array.of(1, 2, 3)], name, { type: "application/pdf" }),
  };
}
function props(
  overrides: Partial<ComposerAttachmentsOwnerProps> = {},
): InstanceType<typeof ComposerAttachments>["$props"] {
  return {
    attachments: [],
    canAcceptDrop: true,
    onAddFiles: () => {},
    onRemoveAttachment: () => {},
    uploads: {},
    onRetryFile: () => {},
    uploadFailureText: (reason: string) => `refused:${reason}`,
    t,
    ...overrides,
    readFileDrag: () => undefined,
  };
}
describe("ComposerAttachments", () => {
  it("accepts file drops anywhere on the document and keeps non-file drags native", async () => {
    const onAddFiles = vi.fn();
    const view = await act(async () =>
      render(
        h(
          ComposerAttachments,
          {
            ...props({
              onAddFiles,
              dropLimits: { count: 20, size: "5MB" },
            }),
          },
          undefined,
        ),
      ),
    );
    expect(await act(async () => fireEvent.dragEnter(document.body, { dataTransfer: null }))).toBe(
      true,
    );
    const textTransfer = { types: ["text/plain"], files: [], dropEffect: "none" };
    expect(
      await act(async () => fireEvent.dragEnter(document.body, { dataTransfer: textTransfer })),
    ).toBe(true);
    expect(
      await act(async () => fireEvent.dragOver(document.body, { dataTransfer: textTransfer })),
    ).toBe(true);
    expect(
      await act(async () => fireEvent.drop(document.body, { dataTransfer: textTransfer })),
    ).toBe(true);
    expect(view.queryByRole("status")).toBeNull();
    const image = attachment("dropped").file;
    const dataTransfer = { types: ["Files"], files: [image], items: [], dropEffect: "none" };
    expect(await act(async () => fireEvent.dragEnter(document.body, { dataTransfer }))).toBe(false);
    expect(view.getByRole("status").textContent).toContain("文件或图片拖动到此处即可添加");
    expect(view.getByRole("status").textContent).toContain("图片限制：最多 20 张，每张 5MB");
    expect(await act(async () => fireEvent.dragOver(document.body, { dataTransfer }))).toBe(false);
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(await act(async () => fireEvent.drop(document.body, { dataTransfer }))).toBe(false);
    expect(onAddFiles).toHaveBeenCalledWith([image], new Set());
    expect(view.queryByRole("status")).toBeNull();
  });
  it("reports dropped directories from the entry API beside the dropped files", async () => {
    const onAddFiles = vi.fn();
    await act(async () => render(h(ComposerAttachments, { ...props({ onAddFiles }) }, undefined)));
    const folder = new File([], "project");
    const note = new File([Uint8Array.of(1)], "notes.md", { type: "text/markdown" });
    const entry = (isDirectory: boolean | null, file: File) => ({
      kind: "file",
      getAsFile: () => new File([], file.name),
      webkitGetAsEntry: () => (isDirectory === null ? null : { isDirectory }),
    });
    await act(async () =>
      fireEvent.drop(document.body, {
        dataTransfer: {
          types: ["Files"],
          files: [folder, note],
          items: [
            entry(true, folder),
            entry(false, note),
            { kind: "string", getAsFile: () => null },
          ],
          dropEffect: "none",
        },
      }),
    );
    expect(onAddFiles).toHaveBeenCalledWith([folder, note], new Set([folder]));
    // An entry API that answers nothing, or a browser without it, reports no directories.
    await act(async () =>
      fireEvent.drop(document.body, {
        dataTransfer: {
          types: ["Files"],
          files: [note],
          items: [entry(null, note), { kind: "file", getAsFile: () => note }, entry(true, folder)],
          dropEffect: "none",
        },
      }),
    );
    expect(onAddFiles).toHaveBeenLastCalledWith([note], new Set());
  });
  it("tracks nested file drags and clears an aborted drag", async () => {
    const view = await act(async () => render(h(ComposerAttachments, { ...props() }, undefined)));
    const dataTransfer = { types: ["Files"], files: [], items: [], dropEffect: "none" };
    await act(async () =>
      fireEvent.dragLeave(document.body, {
        dataTransfer: { types: ["text/plain"], files: [], dropEffect: "none" },
      }),
    );
    await act(async () => fireEvent.dragEnter(document.body, { dataTransfer }));
    await act(async () => fireEvent.dragEnter(document.body, { dataTransfer }));
    await act(async () =>
      fireEvent.dragLeave(document.body, { dataTransfer, clientX: 5, clientY: 5 }),
    );
    expect(view.getByRole("status")).toBeTruthy();
    await act(async () =>
      fireEvent.dragLeave(document.body, { dataTransfer, clientX: 5, clientY: 5 }),
    );
    expect(view.queryByRole("status")).toBeNull();
    await act(async () => fireEvent.dragEnter(document.documentElement, { dataTransfer }));
    const leftViewport = new Event("dragleave", { bubbles: true, cancelable: true });
    Object.defineProperties(leftViewport, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: -1 },
      clientY: { value: 5 },
    });
    await act(() => fireEvent(document.documentElement, leftViewport));
    expect(view.queryByRole("status")).toBeNull();
    await act(async () => fireEvent.dragEnter(document.body, { dataTransfer }));
    await act(async () => fireEvent.dragEnd(window, { dataTransfer }));
    expect(view.queryByRole("status")).toBeNull();
  });
  it("shows a blocked drop without forwarding its files", async () => {
    const onAddFiles = vi.fn();
    const view = await act(async () =>
      render(h(ComposerAttachments, { ...props({ canAcceptDrop: false, onAddFiles }) }, undefined)),
    );
    const image = attachment("blocked").file;
    const dataTransfer = { types: ["Files"], files: [image], items: [], dropEffect: "copy" };
    await act(async () => fireEvent.dragEnter(document.body, { dataTransfer }));
    expect(view.getByRole("status").textContent).toBe("当前无法添加文件或图片");
    await act(async () => fireEvent.dragOver(document.body, { dataTransfer }));
    expect(dataTransfer.dropEffect).toBe("none");
    await act(async () => fireEvent.drop(document.body, { dataTransfer }));
    expect(onAddFiles).not.toHaveBeenCalled();
    expect(view.queryByRole("status")).toBeNull();
  });
  it("routes rail removal and closes previews on Escape or attachment removal", async () => {
    const onRemoveAttachment = vi.fn();
    const image = attachment("draft-1", "pixel.png");
    const initial = props({ attachments: [image], onRemoveAttachment });
    const view = await act(async () => render(h(ComposerAttachments, { ...initial }, undefined)));
    await act(async () =>
      fireEvent.click(view.getByRole("button", { name: "移除图片 pixel.png" })),
    );
    expect(onRemoveAttachment).toHaveBeenCalledWith(image.id);
    await act(async () => fireEvent.click(view.getByTitle("查看原图")));
    expect(view.getByRole("dialog", { name: "原图预览" })).toBeTruthy();
    await act(async () =>
      view.rerender(
        h(ComposerAttachments, { ...props({ attachments: [], onRemoveAttachment }) }, undefined),
      ),
    );
    expect(view.queryByRole("dialog", { name: "原图预览" })).toBeNull();
    await act(async () => view.rerender(h(ComposerAttachments, { ...initial }, undefined)));
    await act(async () => fireEvent.click(view.getByTitle("查看原图")));
    await act(async () => fireEvent.keyDown(window, { key: "Escape" }));
    expect(view.queryByRole("dialog", { name: "原图预览" })).toBeNull();
  });
  it("keeps images and files in pick order inside one attachment rail", async () => {
    const view = await act(async () =>
      render(
        h(
          ComposerAttachments,
          {
            ...props({
              attachments: [attachment("first"), fileDraft("middle"), attachment("last")],
              uploads: {
                middle: {
                  status: "ready",
                  receiptId: "receipt-middle" as never,
                  file: { attachmentId: "file-middle" as never, name: "middle.pdf", bytes: 3 },
                },
              },
            }),
          },
          undefined,
        ),
      ),
    );
    const rail = view.getByRole("group", { name: "待发送附件" });
    expect(
      [...rail.children].map((child) => {
        const image = child.querySelector("img");
        return image?.getAttribute("alt") ?? child.querySelector("[title]")?.getAttribute("title");
      }),
    ).toEqual(["first.png", "middle.pdf", "last.png"]);
    expect(view.queryByRole("group", { name: "待发送文件" })).toBeNull();
  });
  it("labels an unnamed attachment and its original-image preview", async () => {
    const image = attachment("unnamed", "");
    const view = await act(async () =>
      render(h(ComposerAttachments, { ...props({ attachments: [image] }) }, undefined)),
    );
    expect(view.getByAltText("待发送图片")).toBeTruthy();
    await act(async () => fireEvent.click(view.getByTitle("查看原图")));
    expect(view.getByAltText("原图")).toBeTruthy();
  });
});
describe("ComposerAttachments image uploads", () => {
  it("shows image upload progress, retries a failed image, and explains one the Host refused", async () => {
    const onRetryFile = vi.fn();
    const view = await act(async () =>
      render(
        h(
          ComposerAttachments,
          {
            ...props({
              attachments: [
                attachment("measured"),
                attachment("streaming"),
                attachment("failed"),
                attachment("refused"),
                attachment("ready"),
              ],
              uploads: {
                measured: { status: "uploading", loaded: 1, total: 2 },
                streaming: { status: "uploading", loaded: 3 },
                failed: { status: "error", message: "boom" },
                refused: {
                  status: "error",
                  message: "too wide",
                  reason: "IMAGE_DIMENSION_TOO_LARGE",
                },
                ready: { status: "ready", receiptId: "receipt-ready" as never },
              },
              onRetryFile,
            }),
          },
          undefined,
        ),
      ),
    );
    expect(view.container.querySelector('[style="width: 50%;"]')).toBeTruthy();
    expect(
      view.getAllByTitle("查看原图").map((button) => button.getAttribute("aria-busy")),
    ).toEqual(["true", "true", "false"]);
    await act(async () =>
      fireEvent.click(view.getByRole("button", { name: "重试上传 failed.png" })),
    );
    expect(onRetryFile).toHaveBeenCalledWith("failed");
    // A refusal names its reason and offers neither retry nor preview; removal stays available.
    await act(async () =>
      fireEvent.click(view.getByRole("button", { name: "refused:IMAGE_DIMENSION_TOO_LARGE" })),
    );
    expect(onRetryFile).toHaveBeenCalledTimes(1);
    expect(view.queryByRole("button", { name: "重试上传 refused.png" })).toBeNull();
    expect(view.getByRole("button", { name: "移除图片 refused.png" })).toBeTruthy();
    expect(view.queryByRole("dialog", { name: "原图预览" })).toBeNull();
  });
  it("explains a failed image on hover and pins a refusal on tap", async () => {
    vi.useFakeTimers();
    try {
      const view = await act(async () =>
        render(
          h(
            ComposerAttachments,
            {
              ...props({
                attachments: [attachment("failed"), attachment("refused")],
                uploads: {
                  failed: { status: "error", message: "boom" },
                  refused: {
                    status: "error",
                    message: "too wide",
                    reason: "IMAGE_DIMENSION_TOO_LARGE",
                  },
                },
              }),
            },
            undefined,
          ),
        ),
      );
      // The stubbed ResizeObserver never measures, so the bubble mounts unplaced and hidden.
      const bubble = () => view.queryByRole("tooltip", { hidden: true });
      const retry = view.getByRole("button", { name: "重试上传 failed.png" });
      await act(async () => fireEvent.pointerEnter(retry));
      expect(bubble()).toBeNull();
      await act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(bubble()?.textContent).toBe("上传失败，点击重试");
      await act(async () => fireEvent.pointerLeave(retry));
      expect(bubble()).toBeNull();
      const refused = view.getByRole("button", { name: "refused:IMAGE_DIMENSION_TOO_LARGE" });
      await act(async () => fireEvent.click(refused));
      expect(bubble()?.textContent).toBe("refused:IMAGE_DIMENSION_TOO_LARGE");
      expect(refused.getAttribute("aria-describedby")).toBe(bubble()?.id);
      await act(async () => fireEvent.pointerLeave(refused));
      expect(bubble()?.textContent).toBe("refused:IMAGE_DIMENSION_TOO_LARGE");
    } finally {
      vi.useRealTimers();
    }
  });
  it("names an image without a file name in its preview, retry, and remove controls", async () => {
    const view = await act(async () =>
      render(
        h(
          ComposerAttachments,
          {
            ...props({
              attachments: [attachment("pasted", ""), attachment("shown", "")],
              uploads: { pasted: { status: "error", message: "boom" } },
            }),
          },
          undefined,
        ),
      ),
    );
    expect(view.getByRole("button", { name: "重试上传 待发送图片" })).toBeTruthy();
    expect(view.getAllByRole("button", { name: "移除图片 待发送图片" })).toHaveLength(2);
    expect(view.getByAltText("待发送图片")).toBeTruthy();
  });
});
describe("ComposerAttachments file drafts", () => {
  it("renders uploading, ready, and failed cards with remove and retry affordances", async () => {
    const onRemoveAttachment = vi.fn();
    const onRetryFile = vi.fn();
    const view = await act(async () =>
      render(
        h(
          ComposerAttachments,
          {
            ...props({
              attachments: [fileDraft("up"), fileDraft("ok"), fileDraft("bad")],
              uploads: {
                up: { status: "uploading", loaded: 1, total: 4 },
                ok: {
                  status: "ready",
                  receiptId: "receipt-ok" as never,
                  file: { attachmentId: "file-ok" as never, name: "ok.pdf", bytes: 3 },
                },
                bad: { status: "error", message: "boom" },
              },
              onRemoveAttachment,
              onRetryFile,
            }),
          },
          undefined,
        ),
      ),
    );
    const group = view.getByRole("group", { name: "待发送附件" });
    expect(group.textContent).toContain("上传中…");
    expect(view.container.querySelector('[style="width: 25%;"]')).toBeTruthy();
    expect(group.textContent).toContain("ok.pdf");
    expect(group.textContent).toContain("PDF 3B");
    expect(group.textContent).toContain("上传失败，点击重试");
    await act(async () => fireEvent.click(view.getByRole("button", { name: "重试上传 bad.pdf" })));
    expect(onRetryFile).toHaveBeenCalledWith("bad");
    await act(async () => fireEvent.click(view.getByRole("button", { name: "移除文件 ok.pdf" })));
    expect(onRemoveAttachment).toHaveBeenCalledWith("ok");
  });
  it("treats a draft without upload state as uploading and keeps retry separate from remove", async () => {
    const onRetryFile = vi.fn();
    const onRemoveAttachment = vi.fn();
    const view = await act(async () =>
      render(
        h(
          ComposerAttachments,
          {
            ...props({
              attachments: [fileDraft("pending"), fileDraft("bad")],
              uploads: { bad: { status: "error", message: "boom" } },
              onRetryFile,
              onRemoveAttachment,
            }),
          },
          undefined,
        ),
      ),
    );
    expect(view.getByRole("group", { name: "待发送附件" }).textContent).toContain("上传中…");
    const retry = view.getByRole("button", { name: "重试上传 bad.pdf" });
    const remove = view.getByRole("button", { name: "移除文件 bad.pdf" });
    expect(retry.contains(remove)).toBe(false);
    await act(async () => fireEvent.click(remove));
    expect(onRemoveAttachment).toHaveBeenCalledWith("bad");
    expect(onRetryFile).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(retry));
    expect(onRetryFile).toHaveBeenCalledWith("bad");
  });
  it("uses the localized file label when the browser supplies no name", async () => {
    const view = await act(async () =>
      render(
        h(
          ComposerAttachments,
          {
            ...props({
              attachments: [fileDraft("unnamed", "")],
              uploads: {
                unnamed: {
                  status: "ready",
                  receiptId: "receipt-unnamed" as never,
                  file: { attachmentId: "file-unnamed" as never, name: "file", bytes: 3 },
                },
              },
            }),
          },
          undefined,
        ),
      ),
    );
    const group = view.getByRole("group", { name: "待发送附件" });
    expect(group.textContent).toContain("文件");
    expect(group.textContent).toContain("3B");
  });
  it("uses the shared leading-dot suffix in ready-file metadata", async () => {
    const view = await act(async () =>
      render(
        h(
          ComposerAttachments,
          {
            ...props({
              attachments: [fileDraft("env", ".env")],
              uploads: {
                env: {
                  status: "ready",
                  receiptId: "receipt-env" as never,
                  file: { attachmentId: "file-env" as never, name: ".env", bytes: 3 },
                },
              },
            }),
          },
          undefined,
        ),
      ),
    );
    expect(view.getByTitle(".env").textContent).toContain("ENV 3B");
  });
});
it("accepts internal file tokens only inside the composer without the full-page overlay", async () => {
  const file = new File([Uint8Array.of(1, 2)], "original.pdf", { type: "application/pdf" });
  const onAddFiles = vi.fn();
  const view = await act(async () =>
    render(
      h("div", { "data-composer-card": true, "data-testid": "composer" }, [
        h(
          ComposerAttachments,
          {
            ...props({ onAddFiles }),
            readFileDrag: (transfer) =>
              transfer.getData("application/x-dsh-file") === "token" ? file : undefined,
          },
          undefined,
        ),
      ]),
    ),
  );
  const data = new Map([["application/x-dsh-file", "token"]]);
  const transfer = {
    types: ["application/x-dsh-file"],
    items: [],
    files: [],
    getData: (key: string) => data.get(key) ?? "",
  };
  await act(async () => fireEvent.dragEnter(document.body, { dataTransfer: transfer }));
  await act(async () => fireEvent.dragOver(document.body, { dataTransfer: transfer }));
  await act(async () => fireEvent.drop(document.body, { dataTransfer: transfer }));
  expect(onAddFiles).not.toHaveBeenCalled();
  const target = view.getByTestId("composer");
  await act(async () => fireEvent.dragEnter(target, { dataTransfer: transfer }));
  await act(async () => fireEvent.dragOver(target, { dataTransfer: transfer }));
  expect(view.queryByText("文件或图片拖动到此处即可添加")).toBeNull();
  await act(async () => fireEvent.drop(target, { dataTransfer: transfer }));
  expect(onAddFiles).toHaveBeenCalledExactlyOnceWith([file], new Set());
  data.set("application/x-dsh-file", "foreign");
  await act(async () => fireEvent.drop(target, { dataTransfer: transfer }));
  expect(onAddFiles).toHaveBeenCalledOnce();
});
