// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createApp, h, nextTick, ref, type App } from "vue";
import { ActionCard, Button, DropdownMenu, SvgActionPath } from "@eap/ui";
let app: App | undefined, root: HTMLElement | undefined;
afterEach(() => { app?.unmount(); root?.remove(); });
function mount(render: () => ReturnType<typeof h>) { root = document.createElement("div"); document.body.append(root); app = createApp({ render }); app.mount(root); return root; }

it("keeps card actions separate from its primary native button", async () => {
  const activate = vi.fn(), action = vi.fn(), disabled = ref(false);
  const host = mount(() => h(ActionCard, { label: "Open record", disabled: disabled.value, onActivate: activate }, {
    default: () => "Record", actions: () => h(Button, { onClick: action }, () => "Copy"),
  }));
  const buttons = host.querySelectorAll("button");
  expect(buttons[0]!.getAttribute("aria-label")).toBe("Open record");
  expect(host.querySelector("button button")).toBeNull();
  buttons[1]!.click(); expect(action).toHaveBeenCalledOnce(); expect(activate).not.toHaveBeenCalled();
  buttons[0]!.click(); expect(activate).toHaveBeenCalledOnce();
  disabled.value = true; await nextTick(); buttons[0]!.click(); expect(activate).toHaveBeenCalledOnce();
});

it("gives SVG actions Enter, Space, optional Delete and disabled behavior", async () => {
  const activate = vi.fn(), disabled = ref(false);
  const host = mount(() => h("svg", [h(SvgActionPath, { d: "M0 0 L10 10", label: "Remove edge", deleteKey: true, disabled: disabled.value, onActivate: activate })]));
  const path = host.querySelector("path")!;
  for (const key of ["Enter", " ", "Delete"]) path.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  expect(activate).toHaveBeenCalledTimes(3);
  disabled.value = true; await nextTick(); path.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(activate).toHaveBeenCalledTimes(3); expect(path.getAttribute("tabindex")).toBe("-1");
});

it("menus keep native disabled semantics and select once before closing", async () => {
  const open = ref(false), select = vi.fn();
  const host = mount(() => h(DropdownMenu, { label: "Actions", open: open.value, "onUpdate:open": next => { open.value = next; }, onSelect: select,
    items: [{ id: "off", label: "Unavailable", disabled: true }, { id: "copy", label: "Copy" }],
  }, () => h(Button, {}, () => "Actions")));
  host.querySelector("button")!.click(); await nextTick(); await nextTick();
  const items = document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
  expect(items[0]!.disabled).toBe(true); items[0]!.click(); expect(select).not.toHaveBeenCalled();
  items[1]!.click(); await nextTick(); expect(select).toHaveBeenCalledExactlyOnceWith("copy"); expect(open.value).toBe(false);
  await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
});
