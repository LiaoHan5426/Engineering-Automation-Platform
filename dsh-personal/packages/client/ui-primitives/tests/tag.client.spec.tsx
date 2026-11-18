// @vitest-environment jsdom
import { screen } from "@testing-library/dom";
import { renderVue as render } from "./vue-render.ts";
import { h } from "vue";
import { describe, expect, it } from "vite-plus/test";
import { Tag } from "../src/Tag.tsx";
import type { TagTone } from "../src/Tag.tsx";
const TONES = [
  "outline",
  "solid",
  "neutral",
  "quiet",
  "success",
  "info",
  "warning",
  "danger",
] as const;
describe("Tag", () => {
  it("renders its caller-owned copy in a non-interactive span", () => {
    render(h(Tag, {}, () => ["Built-in"]));
    const tag = screen.getByText("Built-in");
    expect(tag.tagName).toBe("SPAN");
    expect(tag.closest("button")).toBeNull();
  });
  it.each(TONES)("carries tone %s as data-tone", (tone) => {
    const { container } = render(h(Tag, { tone: tone }, () => ["label"]));
    const tag = container.firstElementChild as HTMLElement;
    expect(tag.dataset["tone"]).toBe(tone);
  });
  it("defaults to the outline tone", () => {
    const { container } = render(h(Tag, {}, () => ["label"]));
    expect((container.firstElementChild as HTMLElement).dataset["tone"]).toBe("outline");
  });
  it("keeps a caller class alongside its own so a render site can place it", () => {
    const { container } = render(h(Tag, { className: "placed" }, () => ["label"]));
    const tag = container.firstElementChild as HTMLElement;
    expect(tag.classList.contains("placed")).toBe(true);
    expect(tag.classList.length).toBeGreaterThan(1);
  });
  it("rejects unknown tones at the type level", () => {
    const bad = (tone: TagTone) => tone;
    // @ts-expect-error 'muted' is not one of the eight tones
    expect(bad("muted")).toBe("muted");
  });
});
