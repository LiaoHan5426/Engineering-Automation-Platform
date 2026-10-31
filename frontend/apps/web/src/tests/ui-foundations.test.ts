// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createApp, h, nextTick, ref, type App } from "vue";
import { Button, Collapse, Dialog, Pagination, Progress, Radio } from "@eap/ui";
import { applyAppearance, applyTokens, getTheme } from "@eap/style";

let app: App | undefined;
let root: HTMLElement | undefined;
afterEach(() => { app?.unmount(); root?.remove(); });
function mount(render: () => ReturnType<typeof h>) {
  root = document.createElement("div"); document.body.append(root);
  app = createApp({ render }); app.mount(root);
  return root;
}

it("preserves custom button events, native submit type and disabled semantics", async () => {
  const click = vi.fn(), disabled = ref(false);
  const host = mount(() => h(Button, { variant: "custom", type: "submit", disabled: disabled.value, onClick: click, "aria-label": "Save" }));
  const button = host.querySelector("button")!;
  expect(button.type).toBe("submit"); expect(button.getAttribute("aria-label")).toBe("Save");
  button.click(); expect(click).toHaveBeenCalledTimes(1);
  disabled.value = true; await nextTick(); button.click(); expect(click).toHaveBeenCalledTimes(1);
});

it("emits collapse state and reacts to externally controlled close", async () => {
  const open = ref(false);
  const host = mount(() => h(Collapse, { open: open.value, summary: "Evidence", "onUpdate:open": value => { open.value = value; } }, () => "Content"));
  const details = host.querySelector("details")!;
  details.open = true; details.dispatchEvent(new Event("toggle")); await nextTick();
  expect(open.value).toBe(true);
  open.value = false; await nextTick(); expect(details.open).toBe(false);
  expect(host.querySelector("summary")?.textContent).toBe("Evidence");
});

it("clamps pagination after row removal and prevents navigation when disabled", async () => {
  const page = ref(3), total = ref(61), disabled = ref(false);
  const host = mount(() => h(Pagination, { modelValue: page.value, total: total.value, pageSize: 20, disabled: disabled.value, "onUpdate:modelValue": value => { page.value = value; } }));
  host.querySelectorAll("button")[1]!.click(); await nextTick(); expect(page.value).toBe(4);
  total.value = 2; await nextTick(); await nextTick(); expect(page.value).toBe(1);
  total.value = 80; disabled.value = true; await nextTick();
  host.querySelectorAll("button")[1]!.click(); expect(page.value).toBe(1);
});

it("keeps numeric radio values and independent group selection", async () => {
  const selected = ref<string | number>(1);
  const host = mount(() => h("div", [1, 2].map(value => h(Radio, {
    name: "mode", value, modelValue: selected.value, "onUpdate:modelValue": next => { selected.value = next!; },
  }))));
  host.querySelectorAll("input")[1]!.click(); await nextTick();
  expect(selected.value).toBe(2); expect(host.querySelectorAll("input")[0]!.checked).toBe(false);
});

it("represents unknown progress without a false percentage", async () => {
  const value = ref<number | undefined>(undefined);
  const host = mount(() => h(Progress, { label: "Loading", value: value.value, max: 10 }));
  expect(host.querySelector("progress")?.hasAttribute("value")).toBe(false);
  value.value = 99; await nextTick(); expect(host.querySelector("progress")?.value).toBe(10);
});

it("scopes appearance and portals without changing the document theme", async () => {
  const original = getTheme();
  const host = mount(() => h("div"));
  applyAppearance({ theme: "dark", skin: "console", density: "compact", layout: { railWidth: 420, sidebarWidth: Number.NaN } }, host);
  applyTokens({ "--eap-color-primary": "rebeccapurple" }, host);
  expect(getTheme(host)).toBe("dark"); expect(getTheme()).toBe(original);
  expect(host.style.getPropertyValue("--eap-layout-rail-width")).toBe("420px");
  expect(host.style.getPropertyValue("--eap-layout-sidebar-width")).toBe("");
  applyTokens({ "--eap-color-primary": null }, host);
  expect(host.style.getPropertyValue("--eap-color-primary")).toBe("");
  const portal = document.createElement("div"); host.append(portal);
  const modal = createApp({ render: () => h(Dialog, { title: "Scoped", teleportTo: portal }) });
  const mountPoint = document.createElement("div"); host.append(mountPoint);
  try {
    modal.mount(mountPoint); await nextTick();
    expect(portal.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Scoped");
  } finally { modal.unmount(); }
});
