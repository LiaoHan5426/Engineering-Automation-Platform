import { h, nextTick } from "vue";
// @vitest-environment jsdom
import { contextMenuHook } from "@deepseek-ai/dsh-client-test-runtime";
import { render, cleanup, act } from "@deepseek-ai/dsh-client-test-runtime/src/vue-test.ts";
import { fireEvent } from "@testing-library/dom";
type ComponentProps<
  T extends abstract new (...args: never[]) => {
    $props: unknown;
  },
> = InstanceType<T>["$props"];
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { FileReference, FolderReference } from "../src/client/FileReference.tsx";
import { en } from "../src/client/locales.ts";
import { brandString } from "@deepseek-ai/dsh-brand";
afterEach(cleanup);
type Props = ComponentProps<typeof FileReference>;
function props(openFile: Props["openFile"]): Props {
  return {
    node: { id: "file", start: 0, end: 14, data: { path: "docs/a b.md", label: "a b.md" } },
    raw: '@"docs/a b.md"',
    interactive: true,
    openFile,
    t: makeTranslate(en),
    useContextMenu: contextMenuHook(),
    sessionId: brandString<SessionId>("original"),
    resolveFilePath: (path) => `/workspace/${path}`,
  } as Props;
}
describe("FileReference", () => {
  it("opens the decoded path and leaves summaries and folders non-interactive", async () => {
    const openFile = vi.fn();
    const input = props(openFile);
    const view = render(h(FileReference, { ...input }));
    await nextTick();
    await act(() => {
      fireEvent.click(view.getByRole("button", { name: "a b.md" }));
    });
    expect(openFile).toHaveBeenCalledWith("docs/a b.md");
    expect(view.queryByRole("dialog")).toBeNull();
    await view.rerender(h(FileReference, { ...input, interactive: false }));
    await nextTick();
    expect(view.getByText("a b.md").getAttribute("title")).toBe('@"docs/a b.md"');
    expect(view.queryByRole("button")).toBeNull();
    await view.rerender(
      h(FolderReference, {
        ...input,
        node: {
          id: "folder",
          start: 0,
          end: 6,
          data: { path: "docs/", label: "docs" },
        },
        raw: "@docs/",
      }),
    );
    await nextTick();
    expect(view.getByText("docs").getAttribute("title")).toBe("@docs/");
    expect(view.queryByRole("button")).toBeNull();
  });
  it("keeps a navigation failure local and retries or closes without losing the reference", async () => {
    const openFile = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("unavailable");
      })
      .mockImplementationOnce(() => {
        throw new Error("still unavailable");
      })
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error("unavailable again");
      });
    const view = render(h(FileReference, { ...props(openFile) }));
    await nextTick();
    await act(() => {
      fireEvent.click(view.getByRole("button", { name: "a b.md" }));
    });
    expect(view.getByRole("dialog", { name: "Couldn’t open file" }).textContent).toContain(
      "Couldn’t open “docs/a b.md”",
    );
    await act(() => {
      fireEvent.click(view.getByRole("button", { name: "Retry" }));
    });
    expect(view.getByRole("dialog")).toBeTruthy();
    await act(() => {
      fireEvent.click(view.getByRole("button", { name: "Retry" }));
    });
    expect(view.queryByRole("dialog")).toBeNull();
    expect(openFile.mock.calls).toEqual([["docs/a b.md"], ["docs/a b.md"], ["docs/a b.md"]]);
    await act(() => {
      fireEvent.click(view.getByRole("button", { name: "a b.md" }));
    });
    await act(() => {
      fireEvent.click(view.getAllByRole("button", { name: "Close" }).at(-1)!);
    });
    expect(view.queryByRole("dialog")).toBeNull();
    expect(view.getByRole("button", { name: "a b.md" })).toBeTruthy();
  });
});
it("declares workspace-relative targets for pointer and keyboard gestures and leaves previews inert", async () => {
  const open = vi.fn();
  const input = props(vi.fn());
  let root = "/first";
  const resolveFilePath = vi.fn((path: string) => `${root}/${path}`);
  const view = render(
    h(FileReference, {
      ...input,
      useContextMenu: contextMenuHook(open),
      resolveFilePath: resolveFilePath,
    }),
  );
  await nextTick();
  expect(resolveFilePath).not.toHaveBeenCalled();
  root = "/workspace";
  const chip = view.getByRole("button", { name: "a b.md" });
  chip.getBoundingClientRect = () => new DOMRect(20, 30, 100, 20);
  await act(() => {
    fireEvent.contextMenu(chip, { clientX: 40, clientY: 50 });
  });
  await act(() => {
    fireEvent.keyDown(chip, { key: "F10", shiftKey: true });
  });
  expect(open.mock.calls).toEqual([
    [
      { kind: "file", value: { sessionId: "original", path: "/workspace/docs/a b.md" } },
      { x: 40, y: 50 },
    ],
    [
      { kind: "file", value: { sessionId: "original", path: "/workspace/docs/a b.md" } },
      { x: 20, y: 50 },
    ],
  ]);
  expect(input.openFile).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(chip);
  await view.rerender(
    h(FileReference, { ...input, useContextMenu: contextMenuHook(open), interactive: false }),
  );
  await nextTick();
  expect(await act(() => fireEvent.contextMenu(view.getByText("a b.md")))).toBe(true);
  expect(open).toHaveBeenCalledTimes(2);
});
