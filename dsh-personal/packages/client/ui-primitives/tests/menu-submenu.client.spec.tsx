// @vitest-environment jsdom
/** Submenu interactions use explicit geometry and pointer capabilities, not the host screen. */
import { defineComponent, h, shallowRef, Fragment } from "vue";
import { fireEvent, screen } from "@testing-library/dom";
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from "./vue-render.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Menu, MenuItemButton, type MenuEntry } from "../src/Menu.tsx";
import { POINTER_GRACE_MS } from "../src/pointer-grace.ts";
let panel: DOMRect;
let row: DOMRect;
let childHeight: number;
let hover: boolean;
beforeEach(() => {
  panel = new DOMRect(100, 100, 200, 300);
  row = new DOMRect(104, 140, 192, 34);
  childHeight = 100;
  hover = true;
  vi.stubGlobal("innerWidth", 1024);
  vi.stubGlobal("innerHeight", 768);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: hover })),
  );
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.tagName === "BUTTON" ? row : panel;
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.className.includes("submenu") ? childHeight : panel.height;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function pointer(
  target: Element,
  type: "pointerover" | "pointerout" | "pointerdown",
  pointerType: "mouse" | "pen" | "touch",
  relatedTarget: EventTarget | null = null,
) {
  const event = new MouseEvent(type, { bubbles: true, relatedTarget });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  await act(() => fireEvent(target, event));
  if (type === "pointerover" || type === "pointerout") {
    for (let node: Element | null = target; node; node = node.parentElement) {
      if (relatedTarget instanceof Node && node.contains(relatedTarget)) continue;
      const crossing = new MouseEvent(type === "pointerover" ? "pointerenter" : "pointerleave", {
        relatedTarget,
      });
      Object.defineProperty(crossing, "pointerType", { value: pointerType });
      await act(() => fireEvent(node, crossing));
    }
  }
}
const entries = [
  {
    id: "parent",
    label: "Applications",
    submenu: [
      { id: "disabled", label: "Unavailable", disabled: true },
      { id: "first", label: "First app" },
      { id: "second", label: "Second app" },
    ],
  },
  { id: "other", label: "Other action" },
];
const Fixture = defineComponent(
  ({
    onSelect = () => {},
    backLabel = "Go back",
  }: {
    onSelect?: (id: string) => void;
    backLabel?: string;
  }) => {
    const open = shallowRef(false);
    return () =>
      h(
        Menu,
        {
          open: open.value,
          submenuBackLabel: backLabel,
          items: entries,
          onClose: () => {
            open.value = false;
          },
          onSelect: (id) => {
            onSelect(id);
            open.value = false;
          },
        },
        {
          anchor: () =>
            h(
              "button",
              {
                onClick: () => {
                  open.value = true;
                },
              },
              ["More"],
            ),
          default: () => [
            h(
              MenuItemButton,
              {
                onSelect: () => {
                  open.value = false;
                },
              },
              { default: () => ["Plugin action"] },
            ),
          ],
        },
      );
  },
  { props: ["onSelect", "backLabel"], inheritAttrs: false },
);
const ExternalTriggerFixture = defineComponent(
  ({ onClose }: { onClose: () => void }) => {
    const trigger = shallowRef<HTMLButtonElement | null>(null);
    const open = shallowRef(false);
    return () =>
      h(Fragment, null, [
        h(
          "button",
          {
            ref: trigger,
            "data-context-menu-trigger": "",
            "aria-haspopup": "menu",
            onClick: () => {
              open.value = !open.value;
            },
          },
          [h("span", null, ["External more"])],
        ),
        h(
          Menu,
          {
            open: open.value,
            portal: true,
            contextual: true,
            returnFocus: () => trigger.value,
            isExternalTrigger: (node) => trigger.value?.contains(node) === true,
            anchorRef: trigger,
            items: entries,
            onClose: () => {
              onClose();
              open.value = false;
            },
          },
          { anchor: () => null },
        ),
      ]);
  },
  { props: ["onClose"], inheritAttrs: false },
);
async function openMenu() {
  const trigger = screen.getByRole("button", { name: "More" });
  await act(() => {
    trigger.focus();
  });
  await act(() => fireEvent.click(trigger));
  return trigger;
}
function childMenu() {
  return screen.getByRole("menuitem", { name: "First app" }).closest<HTMLElement>('[role="menu"]')!;
}
describe("Menu submenus", () => {
  it("links a portaled named anchor to its menu and restores existing controls after closing", async () => {
    const anchor = () => h("button", { "aria-controls": "existing-panel" }, "Linked anchor");
    const view = render(
      h(Menu, { open: true, portal: true, items: entries, onClose: () => {} }, { anchor }),
    );
    await act(() => {});
    const trigger = screen.getByRole("button", { name: "Linked anchor" });
    const menu = screen.getByRole("menu");
    expect(trigger.getAttribute("aria-controls")).toBe(`existing-panel ${menu.id}`);
    expect(menu.id).not.toBe("");
    await act(() => {
      view.rerender(
        h(Menu, { open: false, portal: true, items: entries, onClose: () => {} }, { anchor }),
      );
    });
    expect(trigger.getAttribute("aria-controls")).toBe("existing-panel");
  });
  it("dismisses an initially open portal when its named anchor becomes inert", async () => {
    const close = vi.fn();
    const view = render(
      h("aside", {}, [
        h(
          Menu,
          { open: true, portal: true, items: entries, onClose: close },
          { anchor: () => h("button", {}, "Named anchor") },
        ),
      ]),
    );
    await act(() => {});
    expect(screen.getByRole("menuitem", { name: "Applications" })).toBeTruthy();
    view.container.querySelector("aside")!.setAttribute("inert", "");
    await act(() => {});
    expect(close).toHaveBeenCalledOnce();
  });
  it("dismisses a non-contextual menu when an external marked trigger is pressed", async () => {
    const close = vi.fn();
    render(
      h(Fragment, null, [
        h("button", { "data-context-menu-trigger": "" }, ["Header more"]),
        h(Menu, { open: true, items: entries, onClose: close }, { anchor: () => null }),
      ]),
    );
    await act(() => fireEvent.pointerDown(screen.getByRole("button", { name: "Header more" })));
    expect(close).toHaveBeenCalledOnce();
  });
  it("does not activate an external popup trigger on ArrowRight", async () => {
    render(h(ExternalTriggerFixture, { onClose: vi.fn() }, undefined));
    const trigger = screen.getByRole("button", { name: "External more" });
    await act(() => {
      trigger.focus();
    });
    await act(() => fireEvent.click(trigger));
    await act(() => fireEvent.keyDown(trigger, { key: "ArrowRight" }));
    expect(screen.getByRole("menu")).toBeDefined();
    expect(document.activeElement).toBe(trigger);
  });
  it("dismisses on a return-focus subtree that is not marked as a menu trigger", async () => {
    const close = vi.fn();
    const restore = document.createElement("div");
    const target = document.createElement("button");
    restore.append(target);
    document.body.append(restore);
    try {
      render(
        h(
          Menu,
          {
            open: true,
            contextual: true,
            returnFocus: () => restore,
            items: entries,
            onClose: close,
          },
          { anchor: () => null },
        ),
      );
      await act(() => fireEvent.pointerDown(target));
      expect(close).toHaveBeenCalledOnce();
    } finally {
      restore.remove();
    }
  });
  it.each(["mouse", "pen"] as const)(
    "accepts a secondary %s when the primary pointer cannot hover",
    async (pointerType) => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) => ({ matches: query === "(any-hover: hover)" })),
      );
      render(h(Fixture, null, undefined));
      await openMenu();
      const parent = screen.getByRole("menuitem", { name: "Applications" });
      await pointer(parent, "pointerover", "touch");
      await act(() => fireEvent.mouseOver(parent));
      expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
      await pointer(parent, "pointerover", pointerType);
      expect(screen.getByRole("menuitem", { name: "First app" })).toBeDefined();
    },
  );
  it("lets an external return-focus trigger toggle closed through pointerdown then click", async () => {
    const close = vi.fn();
    render(h(ExternalTriggerFixture, { onClose: close }, undefined));
    const target = screen.getByText("External more");
    await act(() => fireEvent.pointerDown(target));
    await act(() => fireEvent.click(target));
    expect(screen.getByRole("menu")).toBeDefined();
    await act(() => fireEvent.pointerDown(target));
    expect(close).not.toHaveBeenCalled();
    await act(() => fireEvent.click(target));
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it.each(["removed", "disabled", "empty"] as const)(
    "restores the root page when the active parent becomes %s",
    async (change) => {
      vi.stubGlobal("innerWidth", 390);
      const props = { open: true, anchor: null, submenuBackLabel: "Go back", onClose: vi.fn() };
      const view = render(h(Menu, { ...props, items: entries }, { anchor: () => props.anchor }));
      await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
      expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First app" }));
      const changed: MenuEntry[] =
        change === "removed"
          ? [entries[1]!]
          : [
              { ...entries[0]!, ...(change === "disabled" ? { disabled: true } : { submenu: [] }) },
              entries[1]!,
            ];
      await act(() => {
        view.rerender(h(Menu, { ...props, items: changed }, { anchor: () => props.anchor }));
      });
      expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
      expect(screen.getByRole("menuitem", { name: "Other action" })).toBeDefined();
      expect(document.activeElement).toBe(
        screen.getByRole("menuitem", {
          name: change === "empty" ? "Applications" : "Other action",
        }),
      );
      await act(() => {
        view.rerender(h(Menu, { ...props, items: entries }, { anchor: () => props.anchor }));
      });
      expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
      expect(
        screen.getByRole("menuitem", { name: "Applications" }).getAttribute("aria-expanded"),
      ).toBe("false");
    },
  );
  it.each([390, 1024])(
    "restores focus when an active footer submenu is removed at %ipx",
    async (width) => {
      vi.stubGlobal("innerWidth", width);
      const props = { open: true, anchor: null, items: [entries[1]!], onClose: vi.fn() };
      const view = render(
        h(Menu, { ...props, footer: [entries[0]!] }, { anchor: () => props.anchor }),
      );
      await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
      await act(() => {
        view.rerender(h(Menu, { ...props }, { anchor: () => props.anchor }));
      });
      expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Other action" }));
    },
  );
  it("preserves focus already moved outside an invalidated submenu", async () => {
    vi.stubGlobal("innerWidth", 390);
    const props = { open: true, anchor: h("button", null, ["Outside control"]), onClose: vi.fn() };
    const view = render(h(Menu, { ...props, items: entries }, { anchor: () => props.anchor }));
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
    const outside = screen.getByRole("button", { name: "Outside control" });
    await act(() => {
      outside.focus();
    });
    await act(() => {
      view.rerender(h(Menu, { ...props, items: [entries[1]!] }, { anchor: () => props.anchor }));
    });
    expect(screen.getByRole("menuitem", { name: "Other action" })).toBeDefined();
    expect(document.activeElement).toBe(outside);
  });
  it("returns focus to the anchor when invalidation leaves no enabled root row", async () => {
    vi.stubGlobal("innerWidth", 390);
    const props = { open: true, anchor: h("button", null, ["More"]), onClose: vi.fn() };
    const view = render(
      h(Menu, { ...props, items: [entries[0]!] }, { anchor: () => props.anchor }),
    );
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
    await act(() => {
      view.rerender(h(Menu, { ...props, items: [] }, { anchor: () => props.anchor }));
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "More" }));
  });
  it("shows a chevron, isolates the child keyboard walk, and returns before closing the root", async () => {
    render(h(Fixture, null, undefined));
    const trigger = await openMenu();
    const parent = screen.getByRole("menuitem", { name: "Applications" });
    expect(
      parent.querySelector('[data-icon="dsw-icon-chevron-right-outline-regular"]'),
    ).not.toBeNull();
    await act(() => {
      parent.focus();
    });
    expect(parent.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(parent);
    await act(() => fireEvent.keyDown(parent, { key: "ArrowRight" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First app" }));
    await act(() => fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Second app" }));
    await act(() => fireEvent.keyDown(document.activeElement!, { key: "Home" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First app" }));
    await act(() => fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" }));
    expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
    expect(document.activeElement).toBe(parent);
    await act(() => fireEvent.keyDown(parent, { key: "ArrowRight" }));
    await act(() => fireEvent.keyDown(document.activeElement!, { key: "Escape" }));
    expect(screen.getByRole("menu")).toBeDefined();
    expect(document.activeElement).toBe(parent);
    await act(() => fireEvent.keyDown(parent, { key: "Escape" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it.each(["click", "Tab"])(
    "selects the child with %s once and restores the original trigger",
    async (method) => {
      const select = vi.fn();
      render(h(Fixture, { onSelect: select }, undefined));
      const trigger = await openMenu();
      await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
      const child = screen.getByRole("menuitem", { name: "First app" });
      await act(() => fireEvent.pointerDown(child));
      expect(screen.getAllByRole("menu")).toHaveLength(2);
      if (method === "click") await act(() => fireEvent.click(child));
      else await act(() => fireEvent.keyDown(child, { key: "Tab" }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(select).toHaveBeenCalledExactlyOnceWith("first");
      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    },
  );
  it("portals a side child anchored to the parent card at the active row offset, outside parent scrolling", async () => {
    panel = new DOMRect(780, 620, 200, 120);
    row = new DOMRect(784, 680, 192, 34);
    render(h(Fixture, null, undefined));
    await openMenu();
    const parent = screen.getByRole("menuitem", { name: "Applications" });
    await act(() => fireEvent.click(parent));
    const menu = childMenu();
    const root = parent.closest<HTMLElement>('[role="menu"]')!;
    expect(menu.parentElement).toBe(document.body);
    expect(root.contains(menu)).toBe(false);
    expect(menu.getAttribute("data-submenu-layout")).toBe("side");
    expect(menu.style.visibility).toBe("");
    // CSS anchors own placement and flipping; the card names its anchor and sets no coordinates.
    const box = root.querySelector<HTMLElement>(
      ':scope > [aria-hidden="true"][style*="anchor-name"]',
    );
    expect(box?.style.anchorName).toBe(menu.style.getPropertyValue("--dsh-submenu-parent"));
    expect(menu.style.left).toBe("");
    expect(menu.style.top).toBe("");
    expect(menu.style.getPropertyValue("--dsh-submenu-height")).toBe("100px");
    expect(menu.style.getPropertyValue("--dsh-submenu-row-offset")).toBe("60px");
    row = new DOMRect(784, 650, 192, 34);
    await act(() => fireEvent.scroll(root.querySelector('[role="presentation"]')!));
    expect(menu.style.getPropertyValue("--dsh-submenu-row-offset")).toBe("30px");
  });
  it("re-measures the row offset on observed size changes and stops observing on close", async () => {
    const observers: {
      callback: ResizeObserverCallback;
      observed: Element[];
      disconnect: ReturnType<typeof vi.fn>;
    }[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private readonly record;
        constructor(callback: ResizeObserverCallback) {
          this.record = { callback, observed: [] as Element[], disconnect: vi.fn() };
          observers.push(this.record);
        }
        observe(element: Element) {
          this.record.observed.push(element);
        }
        unobserve() {}
        disconnect() {
          this.record.disconnect();
        }
      },
    );
    render(h(Fixture, null, undefined));
    await openMenu();
    const parent = screen.getByRole("menuitem", { name: "Applications" });
    await act(() => fireEvent.click(parent));
    const menu = childMenu();
    const observer = observers.at(-1)!;
    expect(observer.observed).toEqual(
      expect.arrayContaining([parent, menu, parent.closest('[role="menu"]')]),
    );
    expect(menu.style.getPropertyValue("--dsh-submenu-row-offset")).toBe("40px");
    row = new DOMRect(104, 200, 192, 34);
    await act(() => {
      observer.callback([], {} as ResizeObserver);
    });
    expect(menu.style.getPropertyValue("--dsh-submenu-row-offset")).toBe("100px");
    await act(() => fireEvent.keyDown(menu, { key: "Escape" }));
    expect(observer.disconnect).toHaveBeenCalled();
  });
  it("uses one visible panel at 390px and a localized non-selecting return action", async () => {
    vi.stubGlobal("innerWidth", 390);
    panel = new DOMRect(170, 100, 200, 300);
    const select = vi.fn();
    render(h(Fixture, { onSelect: select, backLabel: "返回上级" }, undefined));
    await openMenu();
    const parent = screen.getByRole("menuitem", { name: "Applications" });
    await act(() => fireEvent.click(parent));
    const menu = childMenu();
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(menu.getAttribute("data-submenu-layout")).toBe("page");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First app" }));
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "返回上级" })));
    expect(select).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(parent);
    expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
  });
  it("keeps a narrow menu on its parent page until explicit submenu activation", async () => {
    vi.stubGlobal("innerWidth", 390);
    const close = vi.fn();
    render(
      h(
        Menu,
        {
          open: true,
          autoFocus: true,
          submenuBackLabel: "Go back",
          items: entries,
          onClose: close,
        },
        { anchor: () => null },
      ),
    );
    const parent = screen.getByRole("menuitem", { name: "Applications" });
    expect(document.activeElement).toBe(parent);
    expect(parent.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
    await act(() => fireEvent.keyDown(parent, { key: "Escape" }));
    expect(close).toHaveBeenCalledOnce();
    await act(() => fireEvent.keyDown(parent, { key: "ArrowRight" }));
    expect(screen.getByRole("menuitem", { name: "Go back" })).toBeDefined();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First app" }));
  });
  it("uses the caller parent label when no explicit return label was supplied", async () => {
    vi.stubGlobal("innerWidth", 390);
    render(h(Menu, { open: true, items: entries, onClose: () => {} }, { anchor: () => null }));
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
    const back = screen.getByRole("menuitem", { name: "Applications" });
    expect(
      back.querySelector('[data-icon="dsw-icon-chevron-left-outline-regular"]'),
    ).not.toBeNull();
    await act(() => fireEvent.click(back));
    expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
  });
  it("preserves the focused child DOM node while resizing between side and single-panel placement", async () => {
    render(h(Fixture, null, undefined));
    await openMenu();
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
    const child = screen.getByRole("menuitem", { name: "Second app" });
    await act(() => {
      child.focus();
    });
    vi.stubGlobal("innerWidth", 390);
    await act(() => fireEvent(window, new Event("resize")));
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(document.activeElement).toBe(child);
    vi.stubGlobal("innerWidth", 1024);
    await act(() => fireEvent(window, new Event("resize")));
    expect(screen.getAllByRole("menu")).toHaveLength(2);
    expect(document.activeElement).toBe(child);
  });
  it("keeps wide touch devices in side placement and ignores touch and compatibility mouse hover", async () => {
    hover = false;
    render(h(Fixture, null, undefined));
    await openMenu();
    const parent = screen.getByRole("menuitem", { name: "Applications" });
    await pointer(parent, "pointerover", "touch");
    await act(() => fireEvent.mouseOver(parent));
    await pointer(parent, "pointerover", "mouse");
    expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
    await pointer(parent, "pointerdown", "touch");
    await act(() => fireEvent.click(parent));
    expect(screen.getAllByRole("menu")).toHaveLength(2);
    expect(childMenu().getAttribute("data-submenu-layout")).toBe("side");
    expect(screen.queryByRole("menuitem", { name: "Go back" })).toBeNull();
    hover = true;
    await pointer(screen.getByRole("menuitem", { name: "Other action" }), "pointerover", "touch");
    await act(() => fireEvent.mouseOver(screen.getByRole("menuitem", { name: "Other action" })));
    expect(screen.getByRole("menuitem", { name: "First app" })).toBeDefined();
  });
  it.each(["Other action", "Plugin action"])(
    "keeps keyboard navigation after hovering root row %s",
    async (name) => {
      render(h(Fixture, null, undefined));
      await openMenu();
      const parent = screen.getByRole("menuitem", { name: "Applications" });
      await act(() => fireEvent.click(parent));
      const menu = childMenu();
      const target = screen.getByRole("menuitem", { name });
      await pointer(menu, "pointerover", "mouse", parent);
      await pointer(menu, "pointerout", "mouse", target);
      await pointer(target, "pointerover", "mouse", menu);
      expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
      expect(document.activeElement).toBe(parent);
      await act(() => fireEvent.keyDown(parent, { key: "ArrowDown" }));
      expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Other action" }));
    },
  );
  it("keeps child keyboard navigation when hover replaces its submenu", async () => {
    render(
      h(
        Menu,
        {
          open: true,
          onClose: () => {},
          items: [
            entries[0]!,
            {
              id: "next",
              label: "Next group",
              submenu: [{ id: "next-one", label: "Next choice" }],
            },
          ],
        },
        { anchor: () => null },
      ),
    );
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
    const menu = childMenu();
    const next = screen.getByRole("menuitem", { name: "Next group" });
    await pointer(menu, "pointerover", "mouse");
    await pointer(menu, "pointerout", "mouse", next);
    await pointer(next, "pointerover", "mouse", menu);
    expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
    expect(document.activeElement).toBe(next);
    await act(() => fireEvent.keyDown(next, { key: "ArrowRight" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Next choice" }));
    await act(() => fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" }));
    expect(document.activeElement).toBe(next);
  });
  it("does not return to the submenu parent when a root row already holds focus", async () => {
    render(h(Fixture, null, undefined));
    await openMenu();
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
    const target = screen.getByRole("menuitem", { name: "Other action" });
    await act(() => {
      target.focus();
    });
    await pointer(target, "pointerover", "mouse");
    expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
    expect(document.activeElement).toBe(target);
  });
  it("returns child focus after pointer grace so root arrow navigation can continue", async () => {
    render(h(Fixture, null, undefined));
    await openMenu();
    const parent = screen.getByRole("menuitem", { name: "Applications" });
    await act(() => fireEvent.click(parent));
    const menu = childMenu();
    await pointer(menu, "pointerover", "mouse", parent);
    await pointer(menu, "pointerout", "mouse", document.body);
    await act(() => {
      vi.advanceTimersByTime(POINTER_GRACE_MS);
    });
    expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
    expect(document.activeElement).toBe(parent);
    await act(() => fireEvent.keyDown(parent, { key: "ArrowDown" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Other action" }));
  });
  it.each(["More", "Other action"])(
    "preserves focus moved to %s before pointer grace ends",
    async (name) => {
      render(h(Fixture, null, undefined));
      await openMenu();
      const parent = screen.getByRole("menuitem", { name: "Applications" });
      await act(() => fireEvent.click(parent));
      const menu = childMenu();
      await pointer(menu, "pointerover", "mouse", parent);
      await pointer(menu, "pointerout", "mouse", document.body);
      const target = screen.getByRole(name === "More" ? "button" : "menuitem", { name });
      await act(() => {
        target.focus();
      });
      await act(() => {
        vi.advanceTimersByTime(POINTER_GRACE_MS);
      });
      expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
      expect(document.activeElement).toBe(target);
    },
  );
  it("allows crossing the hover gap and cancels stale grace after keyboard return", async () => {
    render(h(Fixture, null, undefined));
    await openMenu();
    const parent = screen.getByRole("menuitem", { name: "Applications" });
    await pointer(parent, "pointerover", "mouse");
    await pointer(parent, "pointerout", "mouse");
    await pointer(childMenu(), "pointerover", "mouse");
    await act(() => {
      vi.advanceTimersByTime(POINTER_GRACE_MS);
    });
    expect(screen.getByRole("menuitem", { name: "First app" })).toBeDefined();
    await pointer(parent, "pointerout", "mouse");
    await act(() => fireEvent.keyDown(document, { key: "Escape" }));
    await act(() => fireEvent.click(parent));
    await act(() => {
      vi.advanceTimersByTime(POINTER_GRACE_MS);
    });
    expect(screen.getByRole("menuitem", { name: "First app" })).toBeDefined();
    await pointer(screen.getByRole("menuitem", { name: "Plugin action" }), "pointerover", "mouse");
    expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
  });
  it("moves focus from a removed return row to the first child on width expansion", async () => {
    vi.stubGlobal("innerWidth", 390);
    render(h(Fixture, null, undefined));
    await openMenu();
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
    await act(() => {
      screen.getByRole("menuitem", { name: "Go back" }).focus();
    });
    vi.stubGlobal("innerWidth", 1024);
    await act(() => fireEvent(window, new Event("resize")));
    expect(screen.queryByRole("menuitem", { name: "Go back" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First app" }));
  });
  it("keeps the return row reachable when a narrow child has no enabled choices", async () => {
    vi.stubGlobal("innerWidth", 390);
    render(
      h(
        Menu,
        {
          open: true,
          submenuBackLabel: "Go back",
          onClose: () => {},
          items: [
            {
              id: "parent",
              label: "Applications",
              submenu: [{ id: "disabled", label: "Unavailable", disabled: true }],
            },
          ],
        },
        { anchor: () => null },
      ),
    );
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Go back" }));
  });
  it("preserves the document composition guard across child opening and placement updates", async () => {
    render(h(Menu, { open: true, items: entries, onClose: vi.fn() }, { anchor: () => null }));
    const parent = screen.getByRole("menuitem", { name: "Applications" });
    await act(() => fireEvent.compositionStart(document));
    await act(() => fireEvent.click(parent));
    vi.stubGlobal("innerWidth", 390);
    await act(() => fireEvent(window, new Event("resize")));
    await act(() => fireEvent.keyDown(document, { key: "Escape" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First app" }));
    await act(() => fireEvent.compositionEnd(document));
    await act(() => fireEvent.keyUp(document, { key: "Enter" }));
    await act(() => fireEvent.keyDown(document, { key: "Escape" }));
    expect(document.activeElement).toBe(parent);
    expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
  });
  it("walks the single-panel child and closes to the original anchor on Shift+Tab", async () => {
    vi.stubGlobal("innerWidth", 390);
    render(h(Fixture, null, undefined));
    const trigger = await openMenu();
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
    await act(() => fireEvent.keyDown(document.activeElement!, { key: "End" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Second app" }));
    await act(() => fireEvent.keyDown(document.activeElement!, { key: "Home" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Go back" }));
    await act(() => fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First app" }));
    await act(() => fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("cancels a pending child close when the root closes and reopens", async () => {
    const props = { anchor: null, items: entries, onClose: vi.fn() };
    const view = render(h(Menu, { ...props, open: true }, { anchor: () => props.anchor }));
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
    const child = childMenu();
    await pointer(child, "pointerover", "mouse");
    await pointer(child, "pointerout", "mouse", document.body);
    await act(() => {
      view.rerender(h(Menu, { ...props, open: false }, { anchor: () => props.anchor }));
    });
    await act(() => {
      view.rerender(h(Menu, { ...props, open: true }, { anchor: () => props.anchor }));
    });
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
    await act(() => {
      vi.advanceTimersByTime(POINTER_GRACE_MS);
    });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First app" }));
  });
  it.each([false, true])(
    "requires caller opt-in for external controls even in contextual=%s menus",
    async (contextual) => {
      const close = vi.fn();
      const props = { open: true, anchor: null, contextual, items: entries, onClose: close };
      const view = render(
        h(Fragment, null, [
          h("button", { "data-context-menu-trigger": "" }, ["External"]),
          h(Menu, { ...props }, {}),
        ]),
      );
      const external = screen.getByRole("button", { name: "External" });
      await act(() => fireEvent.pointerDown(external));
      expect(close).toHaveBeenCalledOnce();
      await act(() => {
        view.rerender(
          h(Fragment, null, [
            h("button", { "data-context-menu-trigger": "" }, ["External"]),
            h(Menu, { ...props, isExternalTrigger: (node) => external.contains(node) }, {}),
          ]),
        );
      });
      await act(() => fireEvent.pointerDown(external.firstChild!));
      expect(close).toHaveBeenCalledOnce();
      await act(() => fireEvent.pointerDown(document.body));
      expect(close).toHaveBeenCalledTimes(2);
    },
  );
  it.each([false, true])(
    "handles child context gestures only in contextual=%s menus",
    async (contextual) => {
      const close = vi.fn();
      render(
        h(
          Menu,
          { open: true, contextual: contextual, items: entries, onClose: close },
          { anchor: () => null },
        ),
      );
      await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
      const child = screen.getByRole("menuitem", { name: "First app" });
      const nativeMenuAllowed = await act(() => fireEvent.contextMenu(child));
      expect(nativeMenuAllowed).toBe(!contextual);
      expect(close).toHaveBeenCalledTimes(contextual ? 1 : 0);
    },
  );
  it("does not collapse a compact child on touch leave", async () => {
    render(
      h(
        Menu,
        { open: true, compact: true, dense: true, items: entries, onClose: vi.fn() },
        { anchor: () => null },
      ),
    );
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
    const child = childMenu();
    await pointer(child, "pointerover", "touch");
    await pointer(child, "pointerout", "touch", document.body);
    await act(() => {
      vi.advanceTimersByTime(POINTER_GRACE_MS);
    });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First app" }));
  });
  it("retains an activated page when an armed side-card grace expires after resizing", async () => {
    render(h(Fixture, null, undefined));
    await openMenu();
    const parent = screen.getByRole("menuitem", { name: "Applications" });
    await act(() => fireEvent.click(parent));
    const child = childMenu();
    await pointer(child, "pointerover", "mouse");
    await pointer(child, "pointerout", "mouse", document.body);
    vi.stubGlobal("innerWidth", 390);
    await act(() => fireEvent(window, new Event("resize")));
    await act(() => {
      vi.advanceTimersByTime(POINTER_GRACE_MS);
    });
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    await pointer(child, "pointerover", "mouse");
    await pointer(child, "pointerout", "mouse", document.body);
    await act(() => {
      vi.advanceTimersByTime(POINTER_GRACE_MS);
    });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First app" }));
  });
  it("keeps focus on an enabled parent when its hovered child becomes empty", async () => {
    const props = { open: true, anchor: null, onClose: vi.fn() };
    const view = render(h(Menu, { ...props, items: entries }, { anchor: () => props.anchor }));
    const parent = screen.getByRole("menuitem", { name: "Applications" });
    await act(() => {
      parent.focus();
    });
    await act(() => {
      view.rerender(
        h(
          Menu,
          { ...props, items: [{ ...entries[0]!, submenu: [] }, entries[1]!] },
          { anchor: () => props.anchor },
        ),
      );
    });
    expect(document.activeElement).toBe(parent);
    expect(screen.queryByRole("menuitem", { name: "First app" })).toBeNull();
  });
  it("ignores nested custom menu rows and text-target events during submenu exclusivity", async () => {
    render(
      h(
        Menu,
        { open: true, items: entries, onClose: vi.fn() },
        {
          anchor: () => null,
          default: () => [
            h("div", { role: "menu" }, [h("button", { role: "menuitem" }, ["Nested row"])]),
            h("span", null, ["Non-row text"]),
          ],
        },
      ),
    );
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Applications" })));
    await pointer(screen.getByRole("menuitem", { name: "Nested row" }), "pointerover", "mouse");
    const event = new MouseEvent("pointerover", { bubbles: true });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    await act(() => fireEvent(screen.getByText("Non-row text").firstChild!, event));
    expect(screen.getByRole("menuitem", { name: "First app" })).toBeDefined();
  });
  it("does not open disabled submenu parents and dismisses on outside pointerdown", async () => {
    const close = vi.fn();
    render(
      h(
        Menu,
        { open: true, items: [{ ...entries[0]!, disabled: true }], onClose: close },
        { anchor: () => null },
      ),
    );
    await pointer(screen.getByRole("menuitem"), "pointerover", "mouse");
    await act(() => fireEvent.click(screen.getByRole("menuitem")));
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    await act(() => fireEvent.pointerDown(document.body));
    expect(close).toHaveBeenCalledOnce();
  });
});
