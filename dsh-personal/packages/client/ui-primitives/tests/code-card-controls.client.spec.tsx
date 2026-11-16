import { h, nextTick } from "vue";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "./content-render.ts";
import { CodeBlock } from "../src/markdown/CodeBlock.tsx";
import { MarkdownText } from "../src/markdown/MarkdownText.tsx";
import { ReadBlock } from "../src/ReadBlock.tsx";
import { DiffBlock } from "../src/DiffBlock.tsx";
import { diffBlockLabels, readBlockLabels } from "./labels.client.ts";
const toolbarLabels = {
  codeLabel: "Code block",
  wrapLabel: "Wrap lines",
  unwrapLabel: "Do not wrap lines",
};
const labels = { copyLabel: "Copy", copiedLabel: "Copied", toolbarLabels };
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});
describe("code-card controls", () => {
  it.each([undefined, "unregistered"])(
    "labels the %s language with the localized code title",
    async (lang) => {
      render(h(CodeBlock, { code: "plain source", lang: lang, ...labels }));
      await nextTick();
      expect(screen.getByText("Code block")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Copy" }).textContent).toBe("");
    },
  );
  it("keeps a known grammar name while its highlighter is not yet visible", async () => {
    render(h(CodeBlock, { code: "const x = 1", lang: "typescript", ...labels }));
    await nextTick();
    expect(screen.getByText("typescript")).toBeTruthy();
    expect(screen.queryByText("Code block")).toBeNull();
  });
  it.each(["code", "read", "diff"] as const)(
    "toggles %s wrapping without changing source text",
    async (kind) => {
      const code = 'const longName = "a long value whose source must stay intact"';
      const view = render(
        kind === "code"
          ? h(CodeBlock, { code: code, lang: "ts", ...labels })
          : kind === "read"
            ? h(ReadBlock, {
                lines: [{ number: 24, text: code }],
                totalLines: 30,
                lang: "ts",
                labels: { ...readBlockLabels, ...toolbarLabels },
              })
            : h(DiffBlock, {
                diffs: [{ path: "example.ts", oldText: "old", newText: code }],
                labels: { ...diffBlockLabels, ...toolbarLabels },
              }),
      );
      await nextTick();
      const button = screen.getByRole("button", { name: "Wrap lines" });
      const wasWrapped = button.getAttribute("aria-pressed") === "true";
      await fireEvent.click(button);
      expect(button.getAttribute("aria-pressed")).toBe(String(!wasWrapped));
      expect(button.getAttribute("aria-label")).toBe("Wrap lines");
      expect(view.container.textContent).toContain(code);
      await fireEvent.click(button);
      expect(button.getAttribute("aria-pressed")).toBe(String(wasWrapped));
    },
  );
  it("shows hover tooltips for copying and wrapping and updates the wrapping action", async () => {
    render(h(CodeBlock, { code: "source", ...labels }));
    await nextTick();
    const copy = screen.getByRole("button", { name: "Copy" });
    await fireEvent.pointerEnter(copy);
    expect(screen.getByRole("tooltip").textContent).toBe("Copy");
    await fireEvent.pointerLeave(copy);
    const wrap = screen.getByRole("button", { name: "Wrap lines" });
    await fireEvent.pointerEnter(wrap);
    expect(screen.getByRole("tooltip").textContent).toBe("Do not wrap lines");
    await fireEvent.click(wrap);
    expect(screen.queryByRole("tooltip")).toBeNull();
    await fireEvent.pointerEnter(wrap);
    expect(screen.getByRole("tooltip").textContent).toBe("Wrap lines");
  });
  it("copies source through the icon and announces success", async () => {
    vi.useFakeTimers();
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      render(h(CodeBlock, { code: "const x = 1\n", ...labels }));
      await act(async () => {
        await fireEvent.click(screen.getByRole("button", { name: "Copy" }));
      });
      expect(writeText).toHaveBeenCalledWith("const x = 1");
      expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    } finally {
      if (original === undefined) Reflect.deleteProperty(navigator, "clipboard");
      else Object.defineProperty(navigator, "clipboard", original);
    }
    await nextTick();
  });
  it("shows compact Markdown icon actions and preserves custom source controls", async () => {
    const view = render(
      h(MarkdownText, {
        text: "```ts\nconst x = 1\n```",
        variant: "compact",
        labels: { code: labels, footnotes: "Footnotes" },
      }),
    );
    await nextTick();
    const wrap = screen.getByRole("button", { name: "Wrap lines" });
    expect(wrap.getAttribute("aria-pressed")).toBe("true");
    await fireEvent.click(wrap);
    expect(wrap.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Copy" }).textContent).toBe("");
    view.rerender(h(CodeBlock, { code: "source", copyLabel: "Copy", copiedLabel: "Copied" }));
    await nextTick();
    expect(screen.getByRole("button", { name: "Copy" }).textContent).toBe("Copy");
  });
  it("uses the fallback title for diffs containing different languages", async () => {
    render(
      h(DiffBlock, {
        diffs: [
          { path: "example.ts", oldText: "", newText: "export {}" },
          { path: "example.py", oldText: "", newText: "print(1)" },
        ],
        labels: { ...diffBlockLabels, ...toolbarLabels },
      }),
    );
    await nextTick();
    expect(screen.getByText("Code block")).toBeTruthy();
  });
});
