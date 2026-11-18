// @vitest-environment jsdom
/** Portal menus delegate minimum width and viewport limits to CSS. */
import { defineComponent, shallowRef } from "vue";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { h, Fragment } from "vue";
import { screen } from "@testing-library/dom";
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from "./vue-render.ts";
import { Menu } from "../src/Menu.tsx";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Menu anchor minimum width", () => {
  it("registers only the external trigger as its anchor", async () => {
    const Fixture = defineComponent(
      () => {
        const trigger = shallowRef<HTMLButtonElement | null>(null);
        return () => {
          return h(Fragment, null, [
            h("button", { ref: trigger }, ["Tools"]),
            h(
              Menu,
              {
                open: true,
                portal: true,
                anchorRef: trigger,
                items: [{ id: "one", label: "One" }],
                onClose: vi.fn(),
              },
              { anchor: () => null },
            ),
          ]);
        };
      },
      { props: [] },
    );
    await act(async () => render(h(Fixture)));
    const trigger = screen.getByRole("button", { name: "Tools" });
    const name = screen.getByRole("menu").style.positionAnchor;
    expect(name).not.toBe("");
    expect(
      [...document.querySelectorAll<HTMLElement>("[style]")].filter(
        (node) => node.style.anchorName === name,
      ),
    ).toEqual([trigger]);
  });
  it("enables anchor-width matching and clears it when the option is removed", async () => {
    const props = {
      open: true,
      portal: true,
      align: "end" as const,
      anchor: h("button", null, ["Tools"]),
      onClose: vi.fn(),
    };
    const view = await act(async () =>
      render(
        h(
          Menu,
          { ...props, minWidthFromAnchor: true, items: [{ id: "one", label: "One" }] },
          { anchor: () => props.anchor },
        ),
      ),
    );
    const menu = screen.getByRole("menu");
    expect(menu.hasAttribute("data-match-anchor-width")).toBe(true);
    expect(menu.style.minWidth).toBe("");
    expect(menu.style.positionAnchor).not.toBe("");
    await act(async () => {
      view.rerender(
        h(Menu, { ...props, items: [{ id: "one", label: "One" }] }, { anchor: () => props.anchor }),
      );
    });
    expect(screen.getByRole("menu").hasAttribute("data-match-anchor-width")).toBe(false);
  });
  it("keeps matching declarative when the visual viewport is narrower than its anchor", async () => {
    const readRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    vi.stubGlobal(
      "visualViewport",
      Object.assign(new EventTarget(), {
        width: 200,
        height: 400,
        offsetLeft: 40,
        offsetTop: 60,
      }),
    );
    await act(async () =>
      render(
        h(
          Menu,
          {
            open: true,
            portal: true,
            minWidthFromAnchor: true,
            align: "end",
            items: [{ id: "one", label: "One" }],
            onClose: vi.fn(),
          },
          { anchor: () => h("button", { style: { width: 280 } }, ["Tools"]) },
        ),
      ),
    );
    const menu = screen.getByRole("menu");
    expect(menu.hasAttribute("data-match-anchor-width")).toBe(true);
    expect(menu.style.minWidth).toBe("");
    expect(menu.style.left).toBe("");
    expect(readRect).not.toHaveBeenCalled();
  });
});
