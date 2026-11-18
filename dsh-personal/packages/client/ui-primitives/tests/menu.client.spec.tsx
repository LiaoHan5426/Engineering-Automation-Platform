// @vitest-environment jsdom
import { defineComponent, h, shallowRef, Fragment } from "vue";
import { fireEvent, screen } from "@testing-library/dom";
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from "./vue-render.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Menu, MenuItemButton } from "../src/Menu.tsx";
import { POINTER_GRACE_MS } from "../src/pointer-grace.ts";
afterEach(cleanup);
describe("MenuItemButton", async () => {
  it("exposes the current page without preventing activation and clears it when selection moves", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      h(MenuItemButton, { current: true, onSelect: onSelect }, { default: () => ["Notes"] }),
    );
    await act(() => {});
    const row = screen.getByRole("menuitem", { name: "Notes" });
    expect(row.getAttribute("aria-current")).toBe("page");
    await act(() => fireEvent.click(row));
    expect(onSelect).toHaveBeenCalledOnce();
    await act(() => {
      rerender(
        h(MenuItemButton, { current: false, onSelect: onSelect }, { default: () => ["Notes"] }),
      );
    });
    expect(row.hasAttribute("aria-current")).toBe(false);
    await act(() => {
      rerender(h(MenuItemButton, { onSelect: onSelect }, { default: () => ["Notes"] }));
    });
    expect(row.hasAttribute("aria-current")).toBe(false);
  });
});
describe("Menu", async () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    vi.stubGlobal("CSS", {
      supports: (property: string) => property === "-webkit-backdrop-filter",
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const items = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta", disabled: true },
  ];
  it("shows items only while open; select fires onSelect", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      h(
        Menu,
        { open: false, items: items, onSelect: onSelect, onClose: () => {} },
        { anchor: () => h("span", null, ["trigger"]) },
      ),
    );
    await act(() => {});
    expect(screen.queryByRole("menu")).toBeNull();
    await act(() => {
      rerender(
        h(
          Menu,
          { open: true, items: items, selectedId: "a", onSelect: onSelect, onClose: () => {} },
          { anchor: () => h("span", null, ["trigger"]) },
        ),
      );
    });
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Alpha" })));
    expect(onSelect).toHaveBeenCalledWith("a");
  });
  it("walks component rows with the data rows and returns focus to the trigger after one is activated", async () => {
    const onAction = vi.fn();
    const Harness = defineComponent(() => {
      const open = shallowRef(true);
      return () =>
        h(
          Menu,
          {
            open: open.value,
            items: [{ id: "a", label: "Alpha" }],
            onSelect: () => {},
            onClose: () => {
              open.value = false;
            },
          },
          {
            anchor: () => h("button", { type: "button" }, ["trigger"]),
            default: () => [
              h(
                MenuItemButton,
                {
                  separatorBefore: true,
                  shortcut: { keys: ["Ctrl", "P"], aria: "Control+P" },
                  onSelect: () => {
                    onAction();
                    open.value = false;
                  },
                },
                { default: () => ["Publish"] },
              ),
            ],
          },
        );
    });
    render(h(Harness));
    await act(() => {});
    const trigger = screen.getByRole("button", { name: "trigger" });
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Alpha",
      "PublishCtrlP",
    ]);
    // The component row starts a group: one hairline, between the data row and it.
    const publishWrap = screen.getByRole("menuitem", { name: "Publish" }).parentElement;
    expect(screen.getByRole("separator").nextElementSibling).toBe(
      screen.getByRole("menuitem", { name: "Publish" }),
    );
    expect(publishWrap?.contains(screen.getByRole("separator"))).toBe(true);
    const publish = screen.getByRole("menuitem", { name: "Publish" });
    expect(publish.getAttribute("aria-keyshortcuts")).toBe("Control+P");
    trigger.focus();
    await act(() => fireEvent.keyDown(trigger, { key: "End" }));
    expect(document.activeElement).toBe(publish);
    await act(() => fireEvent.keyDown(publish, { key: "ArrowUp" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Alpha" }));
    await act(() => fireEvent.click(publish));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(trigger);
  });
  it("explains an unavailable component row on hover and focus without activating it", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    try {
      const onSelect = vi.fn();
      const reason = "Available at 15:51:37.";
      const menu = (explanation: string | undefined) =>
        h(
          Menu,
          { open: true, onClose: () => {} },
          {
            anchor: () => h("button", { type: "button" }, ["trigger"]),
            default: () => [
              h(
                MenuItemButton,
                {
                  disabled: explanation !== undefined,
                  disabledReason: explanation,
                  onSelect: onSelect,
                },
                { default: () => ["Run now"] },
              ),
            ],
          },
        );
      const { rerender } = render(menu(reason));
      await act(() => {});
      const row = screen.getByRole("menuitem", { name: "Run now", description: reason });
      expect(row.hasAttribute("disabled")).toBe(false);
      expect(row.getAttribute("aria-disabled")).toBe("true");
      await act(() => fireEvent.click(row));
      expect(onSelect).not.toHaveBeenCalled();
      await act(() => fireEvent.pointerEnter(row, { pointerType: "mouse" }));
      await act(() => {
        vi.advanceTimersByTime(499);
      });
      expect(screen.queryByRole("tooltip")).toBeNull();
      await act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole("tooltip").textContent).toBe(reason);
      await act(() => fireEvent.pointerLeave(row, { pointerType: "mouse" }));
      expect(screen.queryByRole("tooltip")).toBeNull();
      // The arrow walk reaches the row, and keyboard focus shows the reason at once.
      const trigger = screen.getByRole("button", { name: "trigger" });
      await act(() => fireEvent.keyDown(document.body, { key: "Tab" }));
      trigger.focus();
      await act(() => fireEvent.keyDown(trigger, { key: "ArrowDown" }));
      expect(document.activeElement).toBe(row);
      expect(screen.getByRole("tooltip").textContent).toBe(reason);
      // A reason that goes away keeps the focused row mounted and makes it an ordinary row.
      await act(() => {
        rerender(menu(undefined));
      });
      expect(document.activeElement).toBe(row);
      expect(row.hasAttribute("aria-disabled")).toBe(false);
      expect(row.hasAttribute("aria-describedby")).toBe(false);
      expect(screen.queryByRole("tooltip")).toBeNull();
      await act(() => fireEvent.click(row));
      expect(onSelect).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
  it("closes an explained unavailable row on Tab and returns focus to the trigger", async () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(
      h(
        Menu,
        { open: true, onClose: onClose },
        {
          anchor: () => h("button", { type: "button" }, ["trigger"]),
          default: () => [
            h(
              MenuItemButton,
              {
                disabled: true,
                disabledReason: "Wait for the next run interval",
                onSelect: onSelect,
              },
              { default: () => ["Run now"] },
            ),
          ],
        },
      ),
    );
    await act(() => {});
    const trigger = screen.getByRole("button", { name: "trigger" });
    trigger.focus();
    await act(() => fireEvent.keyDown(trigger, { key: "ArrowDown" }));
    const row = screen.getByRole("menuitem", { name: "Run now" });
    expect(document.activeElement).toBe(row);
    await act(() => fireEvent.keyDown(row, { key: "Tab" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });
  it("disabled item does not select; Escape and outside pointerdown close", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      h(
        Menu,
        { open: true, items: items, onSelect: onSelect, onClose: onClose },
        { anchor: () => h("span", null, ["trigger"]) },
      ),
    );
    await act(() => {});
    await act(() => {
      screen.getByRole("menuitem", { name: "Beta" }).click();
    });
    expect(onSelect).not.toHaveBeenCalled();
    await act(() => fireEvent.keyDown(document, { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(() => fireEvent.pointerDown(document.body));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("inside pointerdown does not close", async () => {
    const onClose = vi.fn();
    render(
      h(
        Menu,
        { open: true, items: items, onSelect: () => {}, onClose: onClose },
        { anchor: () => h("span", null, ["trigger"]) },
      ),
    );
    await act(() => {});
    await act(() => fireEvent.pointerDown(screen.getByRole("menuitem", { name: "Alpha" })));
    expect(onClose).not.toHaveBeenCalled();
  });
  it("window blur closes only when focus moved into an iframe", async () => {
    const onClose = vi.fn();
    render(
      h(
        Menu,
        { open: true, items: items, onSelect: () => {}, onClose: onClose },
        { anchor: () => h("span", null, ["trigger"]) },
      ),
    );
    await act(() => {});
    // An app or tab switch blurs the window without focusing an iframe: stays open.
    await act(() => fireEvent.blur(window));
    expect(onClose).not.toHaveBeenCalled();
    // A pointerdown inside a cross-origin iframe never reaches this document;
    // the focus move it causes is the one signal left, and it closes.
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    try {
      iframe.focus();
      expect(document.activeElement).toBe(iframe);
      await act(() => fireEvent.blur(window));
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      iframe.remove();
    }
  });
  it("selected item shows the trailing check; align=end, side=top, and className apply", async () => {
    const { container } = render(
      h(
        Menu,
        {
          open: true,
          align: "end",
          side: "top",
          className: "x",
          items: items,
          selectedId: "a",
          onSelect: () => {},
          onClose: () => {},
        },
        { anchor: () => h("span", null, ["trigger"]) },
      ),
    );
    await act(() => {});
    expect((container.firstElementChild as HTMLElement).classList.contains("x")).toBe(true);
    const menu = screen.getByRole("menu");
    expect(menu.className).toMatch(/sideTop|alignEnd/);
    const selected = screen.getByRole("menuitem", { name: "Alpha" });
    expect(selected.querySelector("svg")).not.toBeNull();
    const other = screen.getByRole("menuitem", { name: "Beta" });
    expect(other.querySelector("svg")).toBeNull();
    await act(() => fireEvent.keyDown(document, { key: "a" }));
  });
  it("fill selection holds the row fill instead of a trailing check", async () => {
    render(
      h(
        Menu,
        {
          open: true,
          selection: "fill",
          items: items,
          selectedId: "a",
          onSelect: () => {},
          onClose: () => {},
        },
        { anchor: () => h("span", null, ["trigger"]) },
      ),
    );
    await act(() => {});
    const selected = screen.getByRole("menuitem", { name: "Alpha" });
    expect(selected.querySelector("svg")).toBeNull();
    expect(selected.className).toMatch(/selectedFill/);
    const other = screen.getByRole("menuitem", { name: "Beta" });
    expect(other.className).not.toMatch(/selectedFill/);
  });
  it("renders a leading icon and a separator between groups", async () => {
    render(
      h(
        Menu,
        {
          open: true,
          compact: true,
          items: [
            { id: "a", label: "Alpha", icon: h("svg", { "data-testid": "ic" }, undefined) },
            { type: "separator", id: "s1" },
            { id: "c", label: "Create" },
          ],
          onSelect: () => {},
          onClose: () => {},
        },
        { anchor: () => h("span", null, ["trigger"]) },
      ),
    );
    await act(() => {});
    expect(screen.getByTestId("ic")).toBeDefined();
    expect(screen.getByRole("separator")).toBeDefined();
  });
  it("Tab settles the focused row; Shift+Tab closes back to the anchor", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      h(
        Menu,
        { open: true, autoFocus: true, items: items, onSelect: onSelect, onClose: onClose },
        { anchor: () => h("button", { type: "button" }, ["trigger"]) },
      ),
    );
    await act(() => {});
    // autoFocus parks the keyboard on the first row; Tab settles it like Enter.
    const alpha = screen.getByRole("menuitem", { name: "Alpha" });
    expect(document.activeElement).toBe(alpha);
    expect(alpha.getAttribute("data-dsh-automatic-focus")).toBe("");
    expect(await act(() => fireEvent.keyDown(alpha, { key: "Tab" }))).toBe(false);
    expect(alpha.getAttribute("data-dsh-automatic-focus")).toBeNull();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("a");
    // Shift+Tab leaves like Escape: closed, with the trigger taking the keyboard.
    await act(() => fireEvent.keyDown(alpha, { key: "Tab", shiftKey: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "trigger" }));
  });
  it("Tab from the trigger enters the open list, and elsewhere on the page stays native", async () => {
    render(
      h(
        Menu,
        { open: true, items: items, onSelect: () => {}, onClose: () => {} },
        { anchor: () => h("button", { type: "button" }, ["trigger"]) },
      ),
    );
    await act(() => {});
    const trigger = screen.getByRole("button", { name: "trigger" });
    trigger.focus();
    expect(await act(() => fireEvent.keyDown(trigger, { key: "Tab" }))).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Alpha" }));
    // A keyboard outside both the anchor and the list keeps the traversal.
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    expect(await act(() => fireEvent.keyDown(outside, { key: "Tab" }))).toBe(true);
    outside.remove();
  });
  it("walks the list with the arrows without autoFocus, wrapping at both ends", async () => {
    const onClose = vi.fn();
    const rows = [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
      { id: "c", label: "Gamma" },
    ];
    render(
      h(
        Menu,
        { open: true, items: rows, onSelect: () => {}, onClose: onClose },
        { anchor: () => h("button", { type: "button" }, ["trigger"]) },
      ),
    );
    await act(() => {});
    const trigger = screen.getByRole("button", { name: "trigger" });
    const alpha = screen.getByRole("menuitem", { name: "Alpha" });
    const beta = screen.getByRole("menuitem", { name: "Beta" });
    const gamma = screen.getByRole("menuitem", { name: "Gamma" });
    trigger.focus();
    // autoFocus is off: the menu opens with the keyboard on the anchor, and the
    // first step enters at the near end.
    expect(document.activeElement).toBe(trigger);
    expect(await act(() => fireEvent.keyDown(trigger, { key: "ArrowDown" }))).toBe(false);
    expect(document.activeElement).toBe(alpha);
    await act(() => fireEvent.keyDown(alpha, { key: "ArrowDown" }));
    await act(() => fireEvent.keyDown(beta, { key: "ArrowDown" }));
    expect(document.activeElement).toBe(gamma);
    await act(() => fireEvent.keyDown(gamma, { key: "ArrowDown" })); // wraps forwards
    expect(document.activeElement).toBe(alpha);
    await act(() => fireEvent.keyDown(alpha, { key: "ArrowUp" })); // wraps backwards
    expect(document.activeElement).toBe(gamma);
    await act(() => fireEvent.keyDown(gamma, { key: "Home" }));
    expect(document.activeElement).toBe(alpha);
    await act(() => fireEvent.keyDown(alpha, { key: "End" }));
    expect(document.activeElement).toBe(gamma);
    // Escape closes and hands the keyboard back to the anchor.
    await act(() => fireEvent.keyDown(gamma, { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });
  it("enters at the last enabled row on ↑ and steps over a disabled one", async () => {
    render(
      h(
        Menu,
        { open: true, items: items, onSelect: () => {}, onClose: () => {} },
        { anchor: () => h("button", { type: "button" }, ["trigger"]) },
      ),
    );
    await act(() => {});
    const trigger = screen.getByRole("button", { name: "trigger" });
    trigger.focus();
    // Beta is disabled: it is not a step target, so Alpha is the only row.
    expect(await act(() => fireEvent.keyDown(trigger, { key: "ArrowUp" }))).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Alpha" }));
  });
  it("renders a non-interactive heading label and a danger row", async () => {
    const onSelect = vi.fn();
    render(
      h(
        Menu,
        {
          open: true,
          items: [
            { type: "label", id: "h", text: "Group by" },
            { id: "del", label: "Delete", danger: true },
          ],
          onSelect: onSelect,
          onClose: () => {},
        },
        { anchor: () => h("span", null, ["trigger"]) },
      ),
    );
    await act(() => {});
    const heading = screen.getByText("Group by");
    expect(heading.getAttribute("role")).toBe("presentation");
    // The heading is not a menu item — only the danger row is interactive.
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    const danger = screen.getByRole("menuitem", { name: "Delete" });
    expect(danger.className).toMatch(/danger/);
    await act(() => fireEvent.click(danger));
    expect(onSelect).toHaveBeenCalledWith("del");
  });
  it("closeOnPointerLeave closes a grace after the pointer leaves trigger and list; default never does", async () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      const { rerender } = render(
        h(
          Menu,
          {
            open: true,
            closeOnPointerLeave: true,
            items: items,
            onSelect: () => {},
            onClose: onClose,
          },
          { anchor: () => h("span", null, ["trigger"]) },
        ),
      );
      await act(() => {});
      const wrapper = screen.getByText("trigger").parentElement as HTMLElement;
      await act(() => fireEvent.pointerLeave(wrapper));
      // Still open through the grace: the pointer may be crossing the gap.
      await act(() => {
        vi.advanceTimersByTime(POINTER_GRACE_MS - 1);
      });
      expect(onClose).not.toHaveBeenCalled();
      await act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
      await act(() => {
        rerender(
          h(
            Menu,
            { open: true, items: items, onSelect: () => {}, onClose: onClose },
            { anchor: () => h("span", null, ["trigger"]) },
          ),
        );
      });
      await act(() => fireEvent.pointerLeave(wrapper));
      await act(() => {
        vi.advanceTimersByTime(POINTER_GRACE_MS * 10);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("coming back inside the grace keeps the list open (trigger and list are one region)", async () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(
        h(
          Menu,
          {
            open: true,
            closeOnPointerLeave: true,
            items: items,
            onSelect: () => {},
            onClose: onClose,
          },
          { anchor: () => h("span", null, ["trigger"]) },
        ),
      );
      await act(() => {});
      const wrapper = screen.getByText("trigger").parentElement as HTMLElement;
      await act(() => fireEvent.pointerLeave(wrapper));
      await act(() => {
        vi.advanceTimersByTime(POINTER_GRACE_MS - 50);
      });
      await act(() => fireEvent.pointerEnter(wrapper));
      await act(() => {
        vi.advanceTimersByTime(POINTER_GRACE_MS * 10);
      });
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("a close from selection disarms the pending grace close", async () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      const { rerender } = render(
        h(
          Menu,
          {
            open: true,
            closeOnPointerLeave: true,
            items: items,
            onSelect: () => {},
            onClose: onClose,
          },
          { anchor: () => h("span", null, ["trigger"]) },
        ),
      );
      await act(() => {});
      const wrapper = screen.getByText("trigger").parentElement as HTMLElement;
      await act(() => fireEvent.pointerLeave(wrapper));
      // The owner closes for its own reason (selection/Escape) mid-grace; the
      // armed timer must not survive to shut a list reopened right after.
      await act(() => {
        rerender(
          h(
            Menu,
            {
              open: false,
              closeOnPointerLeave: true,
              items: items,
              onSelect: () => {},
              onClose: onClose,
            },
            { anchor: () => h("span", null, ["trigger"]) },
          ),
        );
      });
      await act(() => {
        vi.advanceTimersByTime(POINTER_GRACE_MS * 10);
      });
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("leaving a closed list arms nothing", async () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(
        h(
          Menu,
          {
            open: false,
            closeOnPointerLeave: true,
            items: items,
            onSelect: () => {},
            onClose: onClose,
          },
          { anchor: () => h("span", null, ["trigger"]) },
        ),
      );
      await act(() => {});
      await act(() =>
        fireEvent.pointerLeave(screen.getByText("trigger").parentElement as HTMLElement),
      );
      await act(() => {
        vi.advanceTimersByTime(POINTER_GRACE_MS * 10);
      });
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("a list click does not bubble to the anchor row (portal synthetic-event path)", async () => {
    const rowClick = vi.fn();
    render(
      h("div", { onClick: rowClick }, [
        h(
          Menu,
          { open: true, items: items, onSelect: () => {}, onClose: () => {} },
          { anchor: () => h("span", null, ["trigger"]) },
        ),
      ]),
    );
    await act(() => {});
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Alpha" })));
    expect(rowClick).not.toHaveBeenCalled();
  });
  it("closes an open submenu when the pointer or focus reaches a component row", async () => {
    render(
      h(
        Menu,
        {
          open: true,
          items: [{ id: "p", label: "Parent", submenu: [{ id: "s", label: "Sub" }] }],
          onSelect: () => {},
          onClose: () => {},
        },
        {
          anchor: () => h("span", null, ["trigger"]),
          default: () => [h(MenuItemButton, { onSelect: () => {} }, { default: () => ["Row"] })],
        },
      ),
    );
    await act(() => {});
    const parent = screen.getByRole("menuitem", { name: "Parent" });
    await act(() => {
      parent.focus();
    });
    expect(screen.getByRole("menuitem", { name: "Sub" })).toBeDefined();
    // Rows inside the card are not top-level rows: focusing one keeps it open.
    await act(() => {
      screen.getByRole("menuitem", { name: "Sub" }).focus();
    });
    expect(screen.getByRole("menuitem", { name: "Sub" })).toBeDefined();
    await act(() => {
      screen.getByRole("menuitem", { name: "Row" }).focus();
    });
    expect(screen.queryByRole("menuitem", { name: "Sub" })).toBeNull();
    await act(() => fireEvent.pointerEnter(parent.parentElement as HTMLElement));
    expect(screen.getByRole("menuitem", { name: "Sub" })).toBeDefined();
    await act(() => fireEvent.pointerOver(screen.getByRole("menuitem", { name: "Row" })));
    expect(screen.queryByRole("menuitem", { name: "Sub" })).toBeNull();
  });
  it("opens a submenu on hover and selects a nested item", async () => {
    const onSelect = vi.fn();
    render(
      h(
        Menu,
        {
          open: true,
          compact: true,
          items: [
            { id: "plain", label: "Plain" },
            {
              id: "new",
              label: "New Workspace",
              submenu: [
                {
                  id: "ok",
                  label: "Create ok",
                  icon: h("svg", { "data-testid": "sub-ic" }, undefined),
                  shortcut: { keys: ["⌘", "N"], aria: "Meta+N" },
                },
              ],
            },
          ],
          onSelect: onSelect,
          onClose: () => {},
        },
        { anchor: () => h("span", null, ["trigger"]) },
      ),
    );
    await act(() => {});
    const plain = screen.getByRole("menuitem", { name: "Plain" });
    await act(() => fireEvent.pointerEnter(plain.parentElement as HTMLElement));
    await act(() => {
      plain.focus();
    });
    const parent = screen.getByRole("menuitem", { name: "New Workspace" });
    const wrap = parent.parentElement as HTMLElement;
    await act(() => fireEvent.click(parent));
    expect(onSelect).not.toHaveBeenCalled();
    await act(() => {
      parent.focus();
    });
    await act(() => fireEvent.pointerEnter(wrap));
    expect(screen.getByTestId("sub-ic")).toBeDefined();
    expect(
      screen.getByRole("menuitem", { name: "Create ok" }).getAttribute("aria-keyshortcuts"),
    ).toBe("Meta+N");
    expect(
      screen.getByRole("menuitem", { name: "Create ok" }).querySelectorAll("kbd"),
    ).toHaveLength(2);
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Create ok" })));
    expect(onSelect).toHaveBeenCalledWith("ok");
    await act(() => {
      plain.focus();
    });
    expect(screen.queryByRole("menuitem", { name: "Create ok" })).toBeNull();
  });
  it("anchors a portal menu to an external element and restores its anchor name", async () => {
    const anchor = shallowRef<HTMLButtonElement | null>(null);
    const Fixture = (props: { open: boolean }) =>
      h(Fragment, null, [
        h("button", { ref: anchor, style: { anchorName: "--existing-anchor" } }, ["External"]),
        h(
          Menu,
          { portal: true, open: props.open, anchorRef: anchor, items: items, onClose: () => {} },
          { anchor: () => null },
        ),
      ]);
    const view = render(h(Fixture, { open: true }));
    await act(() => {});
    const menu = screen.getByRole("menu");
    expect(menu.style.positionAnchor).not.toBe("");
    expect(menu.style.positionAnchor).toBe(anchor.value?.style.anchorName);
    expect(menu.style.positionAnchor).not.toBe("--existing-anchor");
    expect(menu.style.left).toBe("");
    expect(menu.style.top).toBe("");
    await act(() => {
      view.rerender(h(Fixture, { open: false }));
    });
    expect(anchor.value?.style.anchorName).toBe("--existing-anchor");
  });
  it("waits for an external anchor before displaying the portal menu", async () => {
    const anchor = shallowRef<HTMLButtonElement | null>(null);
    render(
      h(
        Menu,
        { portal: true, open: true, anchorRef: anchor, items: items, onClose: () => {} },
        { anchor: () => null },
      ),
    );
    await act(() => {});
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("focuses once an external anchor mounts and preserves row focus while it moves", async () => {
    const anchor = shallowRef<HTMLButtonElement | null>(null);
    function Fixture({ present, margin = 0 }: { present: boolean; margin?: number }) {
      return h(Fragment, null, [
        present && h("button", { ref: anchor, style: { marginLeft: margin } }, ["External"]),
        h(
          Menu,
          {
            portal: true,
            open: true,
            autoFocus: true,
            anchorRef: anchor,
            items: [...items, { id: "c", label: "Gamma" }],
            onClose: () => {},
          },
          { anchor: () => null },
        ),
      ]);
    }
    const geometry = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    try {
      const view = render(h(Fixture, { present: false }, undefined));
      await act(() => {});
      expect(screen.queryByRole("menu")).toBeNull();
      await act(() => {
        view.rerender(h(Fixture, { present: true }, undefined));
      });
      const name = screen.getByRole("menu").style.positionAnchor;
      expect(name).toBe(anchor.value?.style.anchorName);
      expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Alpha" }));
      screen.getByRole("menuitem", { name: "Gamma" }).focus();
      await act(() => {
        view.rerender(h(Fixture, { present: true, margin: 80 }, undefined));
      });
      expect(screen.getByRole("menu").style.positionAnchor).toBe(name);
      expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Gamma" }));
      expect(geometry).not.toHaveBeenCalled();
    } finally {
      geometry.mockRestore();
    }
  });
  it("uses a replacement external ref for inside clicks, keyboard entry and focus return", async () => {
    const first = shallowRef<HTMLButtonElement | null>(null);
    const second = shallowRef<HTMLButtonElement | null>(null);
    const onClose = vi.fn();
    function Fixture({ useSecond }: { useSecond: boolean }) {
      return h(Fragment, null, [
        h("button", { ref: first }, ["First trigger"]),
        h("button", { ref: second }, ["Second trigger"]),
        h(
          Menu,
          {
            open: true,
            portal: true,
            anchorRef: useSecond ? second : first,
            items: items,
            onClose: onClose,
          },
          { anchor: () => null },
        ),
      ]);
    }
    const view = render(h(Fixture, { useSecond: false }, undefined));
    await act(() => {});
    await act(() => {
      view.rerender(h(Fixture, { useSecond: true }, undefined));
    });
    await act(() => fireEvent.pointerDown(second.value!));
    expect(onClose).not.toHaveBeenCalled();
    await act(() => fireEvent.pointerDown(first.value!));
    expect(onClose).toHaveBeenCalledTimes(1);
    second.value!.focus();
    await act(() => fireEvent.keyDown(second.value!, { key: "ArrowDown" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Alpha" }));
    await act(() => fireEvent.keyDown(document, { key: "Escape" }));
    expect(document.activeElement).toBe(second.value);
  });
  it("leaves browser zoom and viewport panning to CSS without geometry reads or viewport listeners", async () => {
    const viewport = Object.assign(new EventTarget(), {
      width: 500,
      height: 400,
      offsetLeft: 40,
      offsetTop: 60,
    });
    vi.stubGlobal("visualViewport", viewport);
    const add = vi.spyOn(viewport, "addEventListener");
    const geometry = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    try {
      const view = render(
        h(
          Menu,
          { portal: true, open: true, align: "end", items: items, onClose: () => {} },
          { anchor: () => h("button", null, ["Open"]) },
        ),
      );
      await act(() => {});
      const menu = screen.getByRole("menu");
      const name = menu.style.positionAnchor;
      expect(name).not.toBe("");
      await act(() => {
        viewport.offsetLeft = 100;
        viewport.offsetTop = 120;
        viewport.height = 200;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("resize"));
      });
      expect(menu.style.positionAnchor).toBe(name);
      expect(menu.style.left).toBe("");
      expect(menu.style.top).toBe("");
      expect(menu.style.getPropertyValue("--dsh-anchored-max-height")).toBe("");
      expect(geometry).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
      view.unmount();
    } finally {
      geometry.mockRestore();
      add.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it("gives separate portal menus independent CSS anchors", async () => {
    const view = render(
      h(Fragment, null, [
        h(
          Menu,
          { portal: true, open: true, items: items, onClose: () => {} },
          { anchor: () => h("button", null, ["First"]) },
        ),
        h(
          Menu,
          { portal: true, open: true, items: items, onClose: () => {} },
          { anchor: () => h("button", null, ["Second"]) },
        ),
      ]),
    );
    await act(() => {});
    const menus = screen.getAllByRole("menu");
    const first = screen.getByRole("button", { name: "First" }).parentElement!;
    const second = screen.getByRole("button", { name: "Second" }).parentElement!;
    expect(menus[0]!.style.positionAnchor).toBe(first.style.anchorName);
    expect(menus[1]!.style.positionAnchor).toBe(second.style.anchorName);
    expect(menus[0]!.style.positionAnchor).not.toBe(menus[1]!.style.positionAnchor);
    view.unmount();
  });
  it("portal mode renders the list under body, positions it fixed, and still closes on outside pointerdown", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      h(
        Menu,
        { portal: true, open: true, items: items, onSelect: onSelect, onClose: onClose },
        { anchor: () => h("span", null, ["trigger"]) },
      ),
    );
    await act(() => {});
    const menu = screen.getByRole("menu");
    // Outside the anchor wrapper subtree — overflow-clipping ancestors can't crop it.
    expect(container.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.positionAnchor).not.toBe("");
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Alpha" })));
    expect(onSelect).toHaveBeenCalledWith("a");
    await act(() => fireEvent.pointerDown(menu));
    expect(onClose).not.toHaveBeenCalled();
    // Non-Node targets (e.g. window itself) are ignored, not treated as outside.
    const nonNodeTarget = new Event("pointerdown", { bubbles: true });
    Object.defineProperty(nonNodeTarget, "target", { value: window });
    document.dispatchEvent(nonNodeTarget);
    expect(onClose).not.toHaveBeenCalled();
    await act(() => fireEvent.pointerDown(document.body));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("passes top-end placement to CSS without writing measured coordinates", async () => {
    render(
      h(
        Menu,
        {
          portal: true,
          open: true,
          align: "end",
          side: "top",
          items: items,
          onSelect: () => {},
          onClose: () => {},
        },
        { anchor: () => h("span", null, ["trigger"]) },
      ),
    );
    await act(() => {});
    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("data-anchor-side")).toBe("top");
    expect(menu.getAttribute("data-anchor-align")).toBe("end");
    expect(menu.style.positionAnchor).not.toBe("");
    for (const edge of ["left", "top", "right", "bottom"] as const)
      expect(menu.style[edge]).toBe("");
  });
  it("renders footer rows in a pinned section below the items; they still select", async () => {
    const onSelect = vi.fn();
    render(
      h(
        Menu,
        {
          open: true,
          items: items,
          footer: [{ id: "new", label: "Create new" }],
          onSelect: onSelect,
          onClose: () => {},
        },
        { anchor: () => h("span", null, ["trigger"]) },
      ),
    );
    await act(() => {});
    const footerItem = screen.getByRole("menuitem", { name: "Create new" });
    expect(footerItem.closest('div[class*="footer"]')).not.toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Alpha" }).closest('div[class*="footer"]'),
    ).toBeNull();
    await act(() => fireEvent.click(footerItem));
    expect(onSelect).toHaveBeenCalledWith("new");
  });
  it("caps the list height for internal scrolling including menus with submenus", async () => {
    const { rerender } = render(
      h(
        Menu,
        { open: true, items: items, onSelect: () => {}, onClose: () => {} },
        { anchor: () => h("span", null, ["trigger"]) },
      ),
    );
    await act(() => {});
    expect(screen.getByRole("menu").className).toMatch(/scrollable/);
    await act(() => {
      rerender(
        h(
          Menu,
          {
            open: true,
            items: [{ id: "p", label: "Parent", submenu: [{ id: "s", label: "Sub" }] }],
            onSelect: () => {},
            onClose: () => {},
          },
          { anchor: () => h("span", null, ["trigger"]) },
        ),
      );
    });
    expect(screen.getByRole("menu").className).toMatch(/scrollable/);
  });
});
