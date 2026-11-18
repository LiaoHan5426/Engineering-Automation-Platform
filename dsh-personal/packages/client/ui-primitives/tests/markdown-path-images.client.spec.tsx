import { nextTick } from "vue";
import { h } from "vue";
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "./content-render.ts";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { MarkdownText } from "./markdown-test-components.tsx";
import type { MarkdownPathImages } from "../src/markdown/MarkdownText.tsx";
afterEach(cleanup);
const LOCAL_IMAGE = "![diagram](/tmp/graph.png)";
/** Drop the per-mount load tag to compare against the resolver's URL. */
const resolverSrc = (image: Element | null | undefined): string | undefined =>
  image?.getAttribute("src")?.replace(/[?&]load=\d+$/u, "");
const mapping = (value: string): string | undefined =>
  value === "/tmp/graph.png" ? "https://cdn.example.com/graph.png" : undefined;
describe("MarkdownText local-path images", () => {
  it("renders authored alt text when no path vocabulary exists", async () => {
    const { container } = render(h(MarkdownText, { text: LOCAL_IMAGE }));
    await nextTick();
    await nextTick();
    expect(container.querySelector("img")).toBeNull();
    await nextTick();
    expect(screen.getByText("diagram")).toBeTruthy();
  });
  it("rewrites a local image path through the vocabulary", async () => {
    const pathImages: MarkdownPathImages = { resolve: mapping };
    const { container } = render(h(MarkdownText, { text: LOCAL_IMAGE, pathImages: pathImages }));
    await nextTick();
    const image = container.querySelector("img");
    await nextTick();
    expect(image?.getAttribute("src")).toBe("https://cdn.example.com/graph.png");
    await nextTick();
    expect(image?.getAttribute("alt")).toBe("diagram");
  });
  it.each(["diagram", ""])("shows authored text after an image fails with alt %j", async (alt) => {
    const pathImages: MarkdownPathImages = { resolve: mapping };
    const { container } = render(
      h(MarkdownText, { text: `![${alt}](/tmp/graph.png)`, pathImages: pathImages }),
    );
    await nextTick();
    await fireEvent.error(screen.getByAltText(alt));
    await nextTick();
    expect(container.querySelector("img")).toBeNull();
    await nextTick();
    expect(container.textContent).toBe(alt || "/tmp/graph.png");
  });
  it("loads a replacement destination after the preceding image failed", async () => {
    const pathImages: MarkdownPathImages = { resolve: (value) => `https://example.com${value}` };
    const { container, rerender } = render(
      h(MarkdownText, { text: LOCAL_IMAGE, pathImages: pathImages }),
    );
    await nextTick();
    await fireEvent.error(screen.getByRole("img"));
    rerender(h(MarkdownText, { text: "![](/tmp/replacement.png)", pathImages: pathImages }));
    await nextTick();
    expect(resolverSrc(container.querySelector("img"))).toBe(
      "https://example.com/tmp/replacement.png",
    );
  });
  it("keeps the alt fallback when the vocabulary misses", async () => {
    const pathImages: MarkdownPathImages = { resolve: () => undefined };
    const { container } = render(h(MarkdownText, { text: LOCAL_IMAGE, pathImages: pathImages }));
    await nextTick();
    await nextTick();
    expect(container.querySelector("img")).toBeNull();
    await nextTick();
    expect(screen.getByText("diagram")).toBeTruthy();
  });
  it("accepts data and blob vocabulary results", async () => {
    const data: MarkdownPathImages = { resolve: () => "data:image/png;base64,AAAA" };
    const blob: MarkdownPathImages = { resolve: () => "blob:https://example.com/id" };
    const dataRender = render(h(MarkdownText, { text: LOCAL_IMAGE, pathImages: data }));
    await nextTick();
    const blobRender = render(h(MarkdownText, { text: LOCAL_IMAGE, pathImages: blob }));
    await nextTick();
    await nextTick();
    expect(dataRender.container.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,AAAA",
    );
    await nextTick();
    expect(blobRender.container.querySelector("img")?.getAttribute("src")).toBe(
      "blob:https://example.com/id",
    );
  });
  it("rejects non-absolute vocabulary results", async () => {
    for (const result of ["relative.png", "/api/image?path=%2Ftmp%2Fx.png", "ftp://host/x.png"]) {
      const pathImages: MarkdownPathImages = { resolve: () => result };
      const { container, unmount } = render(
        h(MarkdownText, { text: LOCAL_IMAGE, pathImages: pathImages }),
      );
      await nextTick();
      expect(container.querySelector("img")).toBeNull();
      unmount();
    }
    await nextTick();
  });
  it("accepts only the Desktop media routes from a local image resolver", async () => {
    const src = "dsh-app://app/api/file?path=%2Ftmp%2Fgraph.png";
    const view = render(
      h(MarkdownText, { text: LOCAL_IMAGE, streaming: true, pathImages: { resolve: () => src } }),
    );
    await nextTick();
    await nextTick();
    expect(view.container.querySelector("img")).toBeNull();
    view.rerender(h(MarkdownText, { text: LOCAL_IMAGE, pathImages: { resolve: () => src } }));
    await nextTick();
    await nextTick();
    expect(resolverSrc(view.getByRole("img"))).toBe(src);
    const detail = "dsh-app://app/api/plugin-market/detail-file?document=d&path=a.png";
    const bundle =
      "dsh-app://app/api/plugin-manager/detail-file?bundle=b&document=README.md&path=a.png";
    for (const route of [detail, bundle]) {
      view.rerender(h(MarkdownText, { text: LOCAL_IMAGE, pathImages: { resolve: () => route } }));
      await nextTick();
      expect(view.getByRole("img").getAttribute("src")).toBe(route);
    }
    await nextTick();
    for (const result of [
      "dsh-app://shell/api/file?path=x",
      "dsh-app://app/assets/image.png",
      "dsh-app://app/api/file-other?path=x",
      "dsh-app://app.example/api/file?path=x",
      "dsh-app://app/api/plugin-market/other?path=x",
      "dsh-app://app/api/plugin-manager/other?path=x",
    ]) {
      view.rerender(h(MarkdownText, { text: LOCAL_IMAGE, pathImages: { resolve: () => result } }));
      await nextTick();
      expect(view.container.querySelector("img")).toBeNull();
    }
    await nextTick();
    view.rerender(h(MarkdownText, { text: `![diagram](${src})` }));
    await nextTick();
    await nextTick();
    expect(view.container.querySelector("img")).toBeNull();
  });
  it("gives each newly mounted image of one path its own source and keeps it across rerenders", async () => {
    const pathImages: MarkdownPathImages = {
      resolve: () => "https://example.com/api/file?path=%2Ftmp%2Fgraph.png",
    };
    const first = render(h(MarkdownText, { text: LOCAL_IMAGE, pathImages: pathImages }));
    await nextTick();
    const src = first.container.querySelector("img")?.getAttribute("src");
    await nextTick();
    expect(src).toMatch(/^https:\/\/example\.com\/api\/file\?path=%2Ftmp%2Fgraph\.png&load=\d+$/u);
    first.rerender(h(MarkdownText, { text: LOCAL_IMAGE, pathImages: pathImages }));
    await nextTick();
    await nextTick();
    expect(first.container.querySelector("img")?.getAttribute("src")).toBe(src);
    const second = render(h(MarkdownText, { text: LOCAL_IMAGE, pathImages: pathImages }));
    await nextTick();
    await nextTick();
    expect(second.container.querySelector("img")?.getAttribute("src")).not.toBe(src);
    const bare = render(
      h(MarkdownText, {
        text: LOCAL_IMAGE,
        pathImages: { resolve: () => "https://example.com/api/file" },
      }),
    );
    await nextTick();
    await nextTick();
    expect(bare.container.querySelector("img")?.getAttribute("src")).toMatch(
      /^https:\/\/example\.com\/api\/file\?load=\d+$/u,
    );
  });
  it("leaves remote images untouched even when the vocabulary maps them", async () => {
    const remote = "![remote](https://example.com/a.png)";
    const pathImages: MarkdownPathImages = { resolve: () => "https://cdn.example.com/b.png" };
    const { container } = render(h(MarkdownText, { text: remote, pathImages: pathImages }));
    await nextTick();
    await nextTick();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.com/a.png");
  });
  it("rewrites reference-style local image destinations", async () => {
    const reference = ["![diagram][fig]", "", "[fig]: /tmp/graph.png"].join("\n");
    const pathImages: MarkdownPathImages = { resolve: mapping };
    const { container } = render(h(MarkdownText, { text: reference, pathImages: pathImages }));
    await nextTick();
    await nextTick();
    expect(resolverSrc(container.querySelector("img"))).toBe("https://cdn.example.com/graph.png");
  });
  it("applies the vocabulary only to settled renders, never while streaming", async () => {
    const pathImages: MarkdownPathImages = { resolve: mapping };
    const { container, rerender } = render(
      h(MarkdownText, { text: LOCAL_IMAGE, streaming: true, pathImages: pathImages }),
    );
    await nextTick();
    await nextTick();
    // Streaming messages may still grow, so their prose keeps the inert alt
    // fallback until the settled pass self-heals it.
    expect(container.querySelector("img")).toBeNull();
    rerender(h(MarkdownText, { text: LOCAL_IMAGE, pathImages: pathImages }));
    await nextTick();
    expect(resolverSrc(container.querySelector("img"))).toBe("https://cdn.example.com/graph.png");
  });
});
