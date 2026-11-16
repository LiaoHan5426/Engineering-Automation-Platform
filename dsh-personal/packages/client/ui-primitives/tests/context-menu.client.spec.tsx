// @vitest-environment jsdom
import { contextMenuHook } from "@deepseek-ai/dsh-client-test-runtime";
import { h } from "vue";
import { fireEvent, screen, waitFor } from "@testing-library/dom";
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from "./vue-render.ts";
import { afterEach, expect, it, vi } from "vitest";
import { Menu, MenuItemButton } from "../src/Menu.tsx";
import { ReferenceChip } from "../src/user-text.tsx";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  cleanup();
  document.documentElement.style.removeProperty("--dsh-frame-top-clearance");
});
it("places pointer menus at the cursor above the frame inset and focuses after portal placement", async () => {
  document.documentElement.style.setProperty("--dsh-frame-top-clearance", "96px");
  const close = vi.fn();
  const view = await act(async () =>
    render(
      h(
        Menu,
        {
          open: true,
          portal: true,
          autoFocus: true,
          contextual: true,
          onClose: close,
          anchorPoint: { x: 200, y: 20 },
          items: [{ id: "copy", label: "Copy" }],
        },
        { anchor: () => null },
      ),
    ),
  );
  const menu = screen.getByRole("menu");
  const point = view.container.firstElementChild as HTMLElement;
  expect(point.style.left).toBe("200px");
  expect(point.style.top).toBe("20px");
  expect(menu.style.positionAnchor).toBe(point.style.anchorName);
  expect(menu.style.top).toBe("");
  await waitFor(() => {
    expect(document.activeElement).toBe(screen.getByRole("menuitem"));
  });
  await act(async () => fireEvent.pointerDown(document.body, { button: 2 }));
  expect(close).not.toHaveBeenCalled();
  await act(async () => fireEvent.pointerDown(document.body, { button: 0 }));
  expect(close).toHaveBeenCalledOnce();
});
it.each([false, true])(
  "captures the point in layout coordinates once with visual-origin client coordinates=%s",
  async (visualOrigin) => {
    const viewport = Object.assign(new EventTarget(), { offsetLeft: 40, offsetTop: 60 });
    const subscribe = vi.spyOn(viewport, "addEventListener");
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("CSS", {
      supports: (property: string) => visualOrigin && property === "-webkit-backdrop-filter",
    });
    const props = {
      portal: true,
      contextual: true,
      anchor: null,
      onClose: vi.fn(),
      items: [{ id: "copy", label: "Copy" }],
    };
    const view = await act(async () =>
      render(
        h(
          Menu,
          { ...props, open: true, anchorPoint: { x: 200, y: 100 } },
          { anchor: () => props.anchor },
        ),
      ),
    );
    const point = (): HTMLElement => view.container.firstElementChild as HTMLElement;
    expect(point().style.left).toBe(visualOrigin ? "240px" : "200px");
    expect(point().style.top).toBe(visualOrigin ? "160px" : "100px");
    viewport.offsetLeft = 80;
    viewport.offsetTop = 120;
    await act(async () =>
      view.rerender(
        h(
          Menu,
          { ...props, open: true, anchorPoint: { x: 200, y: 100 } },
          { anchor: () => props.anchor },
        ),
      ),
    );
    expect(point().style.left).toBe(visualOrigin ? "240px" : "200px");
    expect(point().style.top).toBe(visualOrigin ? "160px" : "100px");
    await act(async () =>
      view.rerender(
        h(
          Menu,
          { ...props, open: false, anchorPoint: { x: 200, y: 100 } },
          { anchor: () => props.anchor },
        ),
      ),
    );
    await act(async () =>
      view.rerender(
        h(
          Menu,
          { ...props, open: true, anchorPoint: { x: 200, y: 100 } },
          { anchor: () => props.anchor },
        ),
      ),
    );
    expect(point().style.left).toBe(visualOrigin ? "280px" : "200px");
    expect(point().style.top).toBe(visualOrigin ? "220px" : "100px");
    await act(async () =>
      view.rerender(
        h(
          Menu,
          { ...props, open: true, anchorPoint: { x: 220, y: 130 } },
          { anchor: () => props.anchor },
        ),
      ),
    );
    expect(point().style.left).toBe(visualOrigin ? "300px" : "220px");
    expect(point().style.top).toBe(visualOrigin ? "250px" : "130px");
    expect(subscribe).not.toHaveBeenCalled();
  },
);
it("groups data icons per divider, preserves component rows, and makes exit frames inert", async () => {
  const props = {
    open: true,
    portal: true,
    contextual: true,
    anchor: null,
    onClose: vi.fn(),
    items: [
      { id: "first", label: "First", icon: h("svg", null, undefined) },
      { id: "second", label: "Second" },
      { type: "separator" as const, id: "split" },
      { id: "third", label: "Third" },
    ],
  };
  const view = await act(async () =>
    render(
      h(
        Menu,
        { ...props },
        {
          default: () => [h(MenuItemButton, { onSelect: () => {} }, { default: () => ["Plugin"] })],
          anchor: () => props.anchor,
        },
      ),
    ),
  );
  expect(
    screen
      .getByRole("menuitem", { name: "First" })
      .firstElementChild?.getAttribute("aria-hidden") === "true",
  ).toBe(true);
  expect(
    screen
      .getByRole("menuitem", { name: "Second" })
      .firstElementChild?.getAttribute("aria-hidden") === "true",
  ).toBe(true);
  expect(
    screen
      .getByRole("menuitem", { name: "Third" })
      .firstElementChild?.getAttribute("aria-hidden") === "true",
  ).toBe(false);
  expect(
    screen
      .getByRole("menuitem", { name: "Plugin" })
      .firstElementChild?.getAttribute("aria-hidden") === "true",
  ).toBe(false);
  await act(async () =>
    view.rerender(h(Menu, { ...props, exiting: "replace" }, { anchor: () => props.anchor })),
  );
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.querySelector('[data-menu-phase="replace"]')).not.toBeNull();
});
it("aligns data groups, footers and submenus independently without modifying slot rows", async () => {
  const hasColumn = (row: HTMLElement) =>
    row.firstElementChild?.getAttribute("aria-hidden") === "true";
  const view = await act(async () =>
    render(
      h(
        Menu,
        {
          open: true,
          contextual: true,
          onClose: () => {},
          items: [
            { id: "plain", label: "Plain" },
            { type: "separator", id: "split" },
            { type: "label", id: "heading", text: "Actions" },
            { id: "icon", label: "Icon", icon: h("svg", null, undefined) },
            { id: "aligned", label: "Aligned" },
            {
              id: "parent",
              label: "Parent",
              submenu: [
                { id: "child", label: "Child" },
                { type: "separator", id: "subsplit" },
                { id: "subicon", label: "Sub icon", icon: h("svg", null, undefined) },
                { id: "subaligned", label: "Sub aligned" },
              ],
            },
          ],
          footer: [
            { id: "footer", label: "Footer" },
            { id: "footerIcon", label: "Footer icon", icon: h("svg", null, undefined) },
          ],
        },
        {
          default: () => [
            h(MenuItemButton, { onSelect: () => {} }, { default: () => ["Plugin plain"] }),
            h(
              MenuItemButton,
              { icon: h("svg", null, undefined), onSelect: () => {} },
              { default: () => ["Plugin icon"] },
            ),
          ],
          anchor: () => null,
        },
      ),
    ),
  );
  expect(hasColumn(screen.getByRole("menuitem", { name: "Plain" }))).toBe(false);
  expect(hasColumn(screen.getByRole("menuitem", { name: "Aligned" }))).toBe(true);
  expect(screen.getByRole("menuitem", { name: "Aligned" }).firstElementChild?.textContent).toBe("");
  expect(hasColumn(screen.getByRole("menuitem", { name: "Footer" }))).toBe(true);
  expect(hasColumn(screen.getByRole("menuitem", { name: "Plugin plain" }))).toBe(false);
  expect(screen.getByRole("menuitem", { name: "Plugin icon" }).querySelector("svg")).not.toBeNull();
  await act(() => screen.getByRole("menuitem", { name: "Parent" }).focus());
  expect(hasColumn(screen.getByRole("menuitem", { name: "Child" }))).toBe(false);
  expect(hasColumn(screen.getByRole("menuitem", { name: "Sub aligned" }))).toBe(true);
  await act(async () =>
    view.rerender(
      h(
        Menu,
        {
          open: true,
          contextual: true,
          onClose: () => {},
          items: [
            { id: "icon", label: "Icon", icon: h("svg", null, undefined) },
            { id: "plain", label: "Plain" },
          ],
          footer: [{ id: "footer", label: "Footer" }],
        },
        { anchor: () => null },
      ),
    ),
  );
  expect(hasColumn(screen.getByRole("menuitem", { name: "Plain" }))).toBe(true);
  expect(hasColumn(screen.getByRole("menuitem", { name: "Footer" }))).toBe(false);
  await act(async () =>
    view.rerender(
      h(
        Menu,
        {
          open: true,
          onClose: () => {},
          items: [
            { id: "icon", label: "Icon", icon: h("svg", null, undefined) },
            { id: "plain", label: "Plain" },
          ],
          footer: [{ id: "footer", label: "Footer" }],
        },
        { anchor: () => null },
      ),
    ),
  );
  expect(hasColumn(screen.getByRole("menuitem", { name: "Plain" }))).toBe(false);
  expect(hasColumn(screen.getByRole("menuitem", { name: "Footer" }))).toBe(false);
});
it("keeps a menu-only reference focusable without inventing an activation action", async () => {
  const open = vi.fn();
  await act(async () =>
    render(
      h(
        ReferenceChip,
        {
          appearance: "file",
          label: "Reference",
          title: "File reference",
          contextMenuProps: contextMenuHook(open)().getTriggerProps({
            kind: "image",
            value: { url: "file" },
          }),
        },
        undefined,
      ),
    ),
  );
  const chip = screen.getByText("Reference");
  expect(chip.tabIndex).toBe(0);
  expect(chip.tagName).toBe("SPAN");
  await act(async () => fireEvent.keyDown(chip, { key: "F10", shiftKey: true }));
  expect(open).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(chip);
});
it("keeps reference activation separate from selection and repeated clicks", async () => {
  const activate = vi.fn();
  const open = vi.fn();
  await act(async () =>
    render(
      h(
        ReferenceChip,
        {
          appearance: "file",
          label: "Reference",
          title: "Reference",
          onActivate: activate,
          contextMenuProps: contextMenuHook(open)().getTriggerProps({
            kind: "image",
            value: { url: "file" },
          }),
        },
        undefined,
      ),
    ),
  );
  const chip = screen.getByRole("button");
  await act(async () => fireEvent.click(chip, { detail: 2 }));
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(chip);
  selection.addRange(range);
  try {
    expect(selection.isCollapsed).toBe(false);
    await act(async () => fireEvent.click(chip, { detail: 1 }));
    expect(activate).not.toHaveBeenCalled();
    await act(async () => fireEvent.contextMenu(chip));
    expect(open).toHaveBeenCalledOnce();
  } finally {
    selection.removeAllRanges();
  }
  await act(async () => fireEvent.click(chip, { detail: 1 }));
  expect(activate).toHaveBeenCalledOnce();
});
