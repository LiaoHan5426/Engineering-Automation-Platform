import { h, nextTick } from "vue";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render as mountNative,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
import { readTextSelection, selectedText } from "../src/client/chat/text-selection.ts";
function readSelection(root: HTMLElement, selection: Selection | null) {
  const result = readTextSelection(root, selection);
  return result === null ? null : { text: selectedText(result) };
}
const markdownLabels = {
  code: { copyLabel: "Copy", copiedLabel: "Copied" },
  footnotes: "Footnotes",
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("quote selection", () => {
  it("extracts one source block and omits Markdown control copy", async () => {
    const view = await render(
      h("div", { "data-chat-flow": "" }, [
        h("div", { "data-text-interaction-source": "" }, [
          h("span", null, ["Hello "]),
          h("button", { type: "button" }, ["Copy"]),
          h("span", null, ["world"]),
        ]),
      ]),
    );
    const root = view.container.querySelector<HTMLElement>("[data-chat-flow]")!;
    const sourceRoot = view.container.querySelector<HTMLElement>("[data-text-interaction-source]")!;
    const range = document.createRange();
    range.selectNodeContents(sourceRoot);
    range.getBoundingClientRect = () => ({ left: 10, top: 20, width: 30, height: 10 }) as DOMRect;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(readSelection(root, selection)).toMatchObject({
      text: "Hello world",
    });
  });
  it("rejects cross-block and pending text selections", async () => {
    const view = await render(
      h("div", { "data-chat-flow": "" }, [
        h("div", { "data-text-interaction-source": "" }, ["one"]),
        h("span", null, ["pending"]),
        h("div", { "data-text-interaction-source": "" }, ["two"]),
      ]),
    );
    const root = view.container.querySelector<HTMLElement>("[data-chat-flow]")!;
    const sources = view.container.querySelectorAll("[data-text-interaction-source]");
    const range = document.createRange();
    range.setStart(sources[0]!.firstChild!, 0);
    range.setEnd(sources[1]!.firstChild!, 3);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(readSelection(root, selection)).toBeNull();
  });
  it("keeps one visible newline for the Markdown hard-break DOM pair", async () => {
    const view = await render(
      h("div", { "data-chat-flow": "" }, [
        h("div", { "data-text-interaction-source": "" }, [
          h("span", null, ["first"]),
          h("br", null, []),
          "\n",
          h("span", null, ["second"]),
        ]),
      ]),
    );
    const root = view.container.querySelector<HTMLElement>("[data-chat-flow]")!;
    const sourceRoot = view.container.querySelector<HTMLElement>("[data-text-interaction-source]")!;
    const range = document.createRange();
    range.selectNodeContents(sourceRoot);
    range.getBoundingClientRect = () => ({ left: 50, top: 60, width: 20, height: 10 }) as DOMRect;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const candidate = readSelection(root, selection);

    expect(candidate).toMatchObject({
      text: "first\nsecond",
    });
  });
  it("projects Markdown soft line breaks as visible spaces", async () => {
    const view = await render(
      h("div", { "data-chat-flow": "" }, [
        h("div", { "data-text-interaction-source": "" }, [h("p", null, ["hello\nworld"])]),
      ]),
    );
    const root = view.container.querySelector<HTMLElement>("[data-chat-flow]")!;
    const sourceRoot = view.container.querySelector<HTMLElement>("[data-text-interaction-source]")!;
    const range = document.createRange();
    range.selectNodeContents(sourceRoot);
    range.getBoundingClientRect = () => ({ left: 50, top: 60, width: 20, height: 10 }) as DOMRect;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(readSelection(root, selection)).toMatchObject({ text: "hello world" });
    const text = sourceRoot.querySelector("p")!.firstChild!;
    range.setStart(text, 6);
    range.setEnd(text, 11);

    expect(readSelection(root, selection)).toMatchObject({ text: "world" });
  });
  it("omits code banners while preserving preformatted line breaks", async () => {
    const view = await render(
      h("div", { "data-chat-flow": "" }, [
        h("div", { "data-text-interaction-source": "" }, [
          h("div", { "data-text-interaction-exclude": "" }, ["typescript"]),
          h("pre", { style: { whiteSpace: "pre-wrap" } }, ["const x = 1\nreturn x"]),
        ]),
      ]),
    );
    const root = view.container.querySelector<HTMLElement>("[data-chat-flow]")!;
    const sourceRoot = view.container.querySelector<HTMLElement>("[data-text-interaction-source]")!;
    const range = document.createRange();
    range.selectNodeContents(sourceRoot);
    range.getBoundingClientRect = () => ({ left: 50, top: 60, width: 20, height: 10 }) as DOMRect;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(readSelection(root, selection)).toMatchObject({ text: "const x = 1\nreturn x" });
  });
  it("uses one synthetic newline when a hard break has no text-node newline", async () => {
    const view = await render(
      h("div", { "data-chat-flow": "" }, [
        h("div", { "data-text-interaction-source": "" }, [
          h("span", null, ["first"]),
          h("br", null, []),
          h("span", null, ["second"]),
        ]),
      ]),
    );
    const root = view.container.querySelector<HTMLElement>("[data-chat-flow]")!;
    const sourceRoot = view.container.querySelector<HTMLElement>("[data-text-interaction-source]")!;
    const range = document.createRange();
    range.selectNodeContents(sourceRoot);
    range.getBoundingClientRect = () => ({ left: 50, top: 60, width: 20, height: 10 }) as DOMRect;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const candidate = readSelection(root, selection);

    expect(candidate).toMatchObject({
      text: "first\nsecond",
    });
  });
  it("preserves visible boundaries between adjacent Markdown blocks", async () => {
    const view = await render(
      h("div", { "data-chat-flow": "" }, [
        h("div", { "data-text-interaction-source": "" }, [
          h("p", null, ["first"]),
          h("p", null, ["second"]),
        ]),
      ]),
    );
    const root = view.container.querySelector<HTMLElement>("[data-chat-flow]")!;
    const sourceRoot = view.container.querySelector<HTMLElement>("[data-text-interaction-source]")!;
    const range = document.createRange();
    range.selectNodeContents(sourceRoot);
    range.getBoundingClientRect = () => ({ left: 50, top: 60, width: 20, height: 10 }) as DOMRect;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const candidate = readSelection(root, selection);

    expect(candidate).toMatchObject({
      text: "first\nsecond",
    });
  });
  it("omits Markdown renderer whitespace between adjacent blocks", async () => {
    const view = await render(
      h("div", { "data-chat-flow": "" }, [
        h("div", { "data-text-interaction-source": "" }, [
          h(MarkdownText, { text: "first\n\nsecond", labels: markdownLabels }),
        ]),
      ]),
    );
    const root = view.container.querySelector<HTMLElement>("[data-chat-flow]")!;
    const sourceRoot = view.container.querySelector<HTMLElement>("[data-text-interaction-source]")!;
    const paragraphs = sourceRoot.querySelectorAll("p");

    expect(paragraphs[0]!.nextSibling?.textContent).toBe("\n");
    const range = document.createRange();
    range.setStart(paragraphs[0]!.firstChild!, 0);
    range.setEnd(paragraphs[1]!.firstChild!, "second".length);
    range.getBoundingClientRect = () => ({ left: 50, top: 60, width: 20, height: 10 }) as DOMRect;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(readSelection(root, selection)).toMatchObject({ text: "first\nsecond" });
  });
  it("maps visible KaTeX text while omitting its duplicate MathML branch", async () => {
    const view = await render(
      h("div", { "data-chat-flow": "" }, [
        h("div", { "data-text-interaction-source": "" }, [
          h("span", { class: "katex" }, [
            h("span", { class: "katex-mathml" }, ["hidden TeX source"]),
            h("span", { class: "katex-html", "aria-hidden": "true" }, ["x + 1"]),
          ]),
        ]),
      ]),
    );
    const root = view.container.querySelector<HTMLElement>("[data-chat-flow]")!;
    const visible = view.container.querySelector<HTMLElement>(".katex-html")!;
    const range = document.createRange();
    range.selectNodeContents(visible);
    range.getBoundingClientRect = () => ({ left: 50, top: 60, width: 20, height: 10 }) as DOMRect;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(readSelection(root, selection)).toMatchObject({ text: "x + 1" });
  });
});
describe("text source boundaries", () => {
  function source(html: string) {
    const root = document.createElement("div");
    const source = document.createElement("div");
    source.setAttribute("data-text-interaction-source", "");
    source.innerHTML = html;
    root.append(source);
    const range = document.createRange();
    range.selectNodeContents(source);
    return { root, source, range };
  }
  it("preserves table cells, existing tabs, and inline code reference buttons", async () => {
    const fixture = source(
      '<table><tbody><tr><td>one</td><td>two</td></tr><tr><td style="white-space:pre">three\t</td><td>four</td></tr><tr><td>five</td><td style="white-space:pre">\tsix</td></tr></tbody></table><code><button>reference</button></code>',
    );

    expect(selectedText(fixture)).toBe("one\ttwo\nthree\tfour\nfive\tsix\nreference");
  });
  it("omits hidden content, comments, and empty text nodes", async () => {
    const fixture = source(
      '<!-- renderer --><span aria-hidden="true">decoration</span><span hidden>hidden</span><span class="sr-only">spoken</span><span>visible</span>',
    );
    fixture.source.append(document.createTextNode(""));
    fixture.range.selectNodeContents(fixture.source);

    expect(selectedText(fixture)).toBe("visible");
    const hidden = fixture.source.querySelector("span")!;
    fixture.range.selectNodeContents(hidden);

    expect(selectedText(fixture)).toBeNull();
    fixture.range.setStart(hidden.firstChild!, 0);
    fixture.range.setEnd(hidden.firstChild!, 4);

    expect(selectedText(fixture)).toBeNull();
  });
  it("rejects whitespace-only and detached sources outside the area", async () => {
    const fixture = source("   ");

    expect(selectedText(fixture)).toBeNull();
    const selection = window.getSelection()!;
    selection.removeAllRanges();

    expect(readTextSelection(fixture.root, null)).toBeNull();

    expect(readTextSelection(fixture.root, selection)).toBeNull();
    document.body.append(fixture.root);
    try {
      selection.addRange(fixture.range);

      expect(readTextSelection(document.createElement("div"), selection)).toBeNull();
      fixture.source.hidden = true;

      expect(readTextSelection(fixture.root, selection)).toBeNull();
    } finally {
      fixture.root.remove();
      selection.removeAllRanges();
    }
  });
  it("projects text in a document without a browsing context", async () => {
    const doc = document.implementation.createHTMLDocument();
    const source = doc.createElement("div");
    source.textContent = "hello\nworld";
    const range = doc.createRange();
    range.selectNodeContents(source);

    expect(selectedText({ source, range })).toBe("hello world");
  });
});
async function render(...args: Parameters<typeof mountNative>) {
  const view = mountNative(...args);
  await nextTick();
  return view;
}
