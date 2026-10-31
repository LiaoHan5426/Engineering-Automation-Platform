// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createApp, h, nextTick, ref, type App } from "vue";
import { DatePicker, Drawer, Segmented, Splitter, Tree, type TreeNode } from "@eap/ui";
let app: App | undefined, root: HTMLElement | undefined;
afterEach(() => { app?.unmount(); root?.remove(); });
function mount(render: () => ReturnType<typeof h>) { root = document.createElement("div"); document.body.append(root); app = createApp({ render }); app.mount(root); return root; }

it("keeps date values timezone-free and clears to an empty value", async () => {
  const value = ref("2026-10-31");
  const host = mount(() => h(DatePicker, { label: "Due", modelValue: value.value, min: "2026-10-01", max: "2026-12-31", "onUpdate:modelValue": next => { value.value = next; } }));
  const input = host.querySelector("input")!;
  expect(input.type).toBe("date"); expect(input.min).toBe("2026-10-01"); expect(input.value).toBe("2026-10-31");
  input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); await nextTick(); expect(value.value).toBe("");
});

it("Tree shares mouse and keyboard expansion without toggling leaves", async () => {
  const toggle = vi.fn(), select = vi.fn();
  const items: TreeNode[] = [{ id: "folder", label: "Folder", children: [{ id: "file", label: "File" }] }, { id: "off", label: "Off", disabled: true }];
  const host = mount(() => h(Tree, { items, label: "Files", onToggle: toggle, onSelect: select }));
  const folder = host.querySelector('[role="treeitem"]') as HTMLElement;
  folder.focus(); folder.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await nextTick(); await nextTick();
  expect(folder.getAttribute("aria-expanded")).toBe("true");
  expect(host.querySelectorAll('[role="treeitem"]')).toHaveLength(3);
  (host.querySelectorAll('[role="treeitem"]')[1] as HTMLElement).click(); await nextTick();
  expect(select.mock.calls.at(-1)?.[0].id).toBe("file"); expect(toggle).toHaveBeenCalledTimes(1);
  (host.querySelectorAll('[role="treeitem"]')[2] as HTMLElement).click(); expect(select).toHaveBeenCalledTimes(1);
});

it("Segmented preserves a required selection and disables unsupported choices", async () => {
  const value = ref("light");
  const host = mount(() => h(Segmented, { label: "Theme", modelValue: value.value, options: [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "off", label: "Off", disabled: true }], "onUpdate:modelValue": next => { value.value = next; } }));
  host.querySelectorAll("button")[1]!.click(); await nextTick(); expect(value.value).toBe("dark");
  host.querySelectorAll("button")[1]!.click(); await nextTick(); expect(value.value).toBe("dark");
  host.querySelectorAll("button")[2]!.click(); expect(value.value).toBe("dark");
});

it("Drawer reuses Dialog escape/busy handling and portal scope", async () => {
  const close = vi.fn(), busy = ref(true);
  const host = mount(() => h(Drawer, { title: "Files", busy: busy.value, onClose: close }));
  await nextTick();
  const panel = document.querySelector('.eap-drawer [role="dialog"]') as HTMLElement;
  expect(panel).not.toBeNull(); expect(host.querySelector('[role="dialog"]')).toBeNull();
  panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(close).not.toHaveBeenCalled();
  busy.value = false; await nextTick(); panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(close).toHaveBeenCalledTimes(1);
});

it("Splitter mounts with the requested split and follows external changes", async () => {
  const value = ref(58);
  const host = mount(() => h(Splitter, { label: "Resize", modelValue: value.value, min: 44, max: 72, "onUpdate:modelValue": next => { value.value = next; } }, { start: () => "Main", end: () => "Side" }));
  await nextTick(); await nextTick(); await nextTick();
  const handle = host.querySelector('[role="separator"]')!;
  expect(handle.getAttribute("aria-valuenow")).toBe("58");
  value.value = 64;
  await nextTick(); await nextTick();
  expect(handle.getAttribute("aria-valuenow")).toBe("64");
  expect(value.value).toBe(64);
});
