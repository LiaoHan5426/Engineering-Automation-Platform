// @vitest-environment jsdom
/** Menu backing lifetime and placement identity. */
import { shallowRef, Teleport } from "vue";
import { h, Fragment } from "vue";
import { screen } from "@testing-library/dom";
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from "./vue-render.ts";
import { afterEach, expect, it } from "vite-plus/test";
import { MenuSurface } from "../src/MenuSurface.tsx";
afterEach(cleanup);
it("keeps each backing after its menu anchor and removes it when unmounted", async () => {
  const ref = shallowRef<HTMLDivElement | null>(null);
  const view = await act(async () =>
    render(
      h(
        Teleport,
        { to: "body" },
        {
          default: () => [
            h(
              MenuSurface,
              {
                elementRef: (value) => {
                  ref.value = value;
                },
                role: "menu",
                compact: true,
              },
              { default: () => [h("button", null, ["Action"])] },
            ),
          ],
        },
      ),
    ),
  );
  const menu = screen.getByRole("menu");
  const backing = document.querySelector<HTMLElement>("[data-menu-backing]")!;
  expect(ref.value).toBe(menu);
  expect(menu.compareDocumentPosition(backing) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(backing.style.getPropertyValue("--dsh-menu-anchor")).toBe(
    menu.style.getPropertyValue("--dsh-menu-anchor"),
  );
  expect(backing.getAttribute("aria-hidden")).toBe("true");
  view.unmount();
  expect(document.querySelector("[data-menu-backing]")).toBeNull();
});
it("gives simultaneously open menus independent anchors and follows visibility changes", async () => {
  const view = await act(async () =>
    render(
      h(Fragment, null, [
        h(MenuSurface, { role: "menu" }, undefined),
        h(MenuSurface, { role: "menu" }, undefined),
      ]),
    ),
  );
  const anchors = screen
    .getAllByRole("menu")
    .map((menu) => menu.style.getPropertyValue("--dsh-menu-anchor"));
  expect(new Set(anchors).size).toBe(2);
  expect(document.querySelectorAll("[data-menu-backing]")).toHaveLength(2);
  await act(async () => {
    view.rerender(h(MenuSurface, { role: "menu", style: { visibility: "hidden" } }, undefined));
  });
  expect(document.querySelector<HTMLElement>("[data-menu-backing]")!.style.visibility).toBe(
    "hidden",
  );
});
