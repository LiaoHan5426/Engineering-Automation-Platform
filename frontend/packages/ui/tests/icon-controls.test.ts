// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createApp, h, nextTick, ref, type App } from "vue";
import Tag from "../src/tag/Tag.vue";
import Tree from "../src/tree/Tree.vue";
import type { TreeNode } from "../src/tree/types";

let app: App | undefined;
let root: HTMLDivElement | undefined;
afterEach(() => {
  app?.unmount();
  root?.remove();
});
function mount(render: () => ReturnType<typeof h>) {
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render });
  app.mount(root);
  return root;
}
function required<T extends Element>(host: ParentNode, selector: string): T {
  const element = host.querySelector<T>(selector);
  expect(element, selector).not.toBeNull();
  return element!;
}
function decorativeIcon(host: ParentNode) {
  const icon = required<SVGSVGElement>(host, "svg");
  expect(icon.getAttribute("aria-hidden")).toBe("true");
  expect(icon.getAttribute("focusable")).toBe("false");
  expect(icon.getAttribute("stroke")).toBe("currentColor");
  return icon;
}

it("Tag uses a decorative close SVG without changing its name or click/close events", async () => {
  const close = vi.fn(), click = vi.fn(), outerClick = vi.fn();
  const disabled = ref(false);
  const host = mount(() => h("div", { onClick: outerClick }, [
    h(Tag, { closable: true, disabled: disabled.value, onClose: close, onClick: click }, () => "场景"),
  ]));
  const tag = required<HTMLButtonElement>(host, "button.eap-tag");
  const marker = required<HTMLElement>(tag, ".eap-tag__close");
  const icon = decorativeIcon(marker);
  expect(tag.type).toBe("button");
  expect(tag.textContent).toBe("场景");
  icon.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(close.mock.calls[0]![0].defaultPrevented).toBe(true);
  expect(click).not.toHaveBeenCalled();
  expect(outerClick).not.toHaveBeenCalled();
  tag.click();
  expect(click).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  disabled.value = true;
  await nextTick();
  expect(tag.disabled).toBe(true);
  tag.click();
  expect(click).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

it("Tree switches decorative chevron SVGs while retaining keyboard expansion and selection", async () => {
  const toggle = vi.fn(), select = vi.fn();
  const items: TreeNode[] = [
    { id: "folder", label: "Folder", children: [{ id: "file", label: "File" }] },
    { id: "off", label: "Off", disabled: true },
  ];
  const host = mount(() => h(Tree, { items, label: "Files", onToggle: toggle, onSelect: select }));
  await nextTick();
  const tree = required<HTMLElement>(host, '[role="tree"]');
  const folder = required<HTMLElement>(tree, '[role="treeitem"]');
  expect(tree.getAttribute("aria-label")).toBe("Files");
  const closedShape = decorativeIcon(folder).innerHTML;
  expect(folder.textContent).toBe("Folder");
  expect(folder.getAttribute("aria-expanded")).toBe("false");
  folder.focus();
  folder.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await nextTick(); await nextTick();
  expect(folder.getAttribute("aria-expanded")).toBe("true");
  expect(decorativeIcon(folder).innerHTML).not.toBe(closedShape);
  expect(toggle).toHaveBeenLastCalledWith(items[0], true);
  const rows = tree.querySelectorAll<HTMLElement>('[role="treeitem"]');
  expect(rows).toHaveLength(3);
  rows[1]!.click();
  await nextTick();
  expect(select).toHaveBeenLastCalledWith(items[0]!.children![0]);
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(rows[1]!.querySelector("svg")).toBeNull();
  rows[2]!.click();
  expect(select).toHaveBeenCalledTimes(1);
  folder.focus();
  folder.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  await nextTick(); await nextTick();
  expect(folder.getAttribute("aria-expanded")).toBe("false");
  expect(decorativeIcon(folder).innerHTML).toBe(closedShape);
  expect(toggle).toHaveBeenLastCalledWith(items[0], false);
  decorativeIcon(folder).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextTick(); await nextTick();
  expect(folder.getAttribute("aria-expanded")).toBe("true");
  expect(toggle).toHaveBeenLastCalledWith(items[0], true);
});

it("Tree keeps manual expansion controlled by the host", async () => {
  const toggle = vi.fn();
  const expanded = ref<string[]>([]);
  const items: TreeNode[] = [{ id: "lazy", label: "Lazy", children: [] }];
  const host = mount(() => h(Tree, { items, label: "Files", manualExpand: true,
    expanded: expanded.value, onToggle: toggle }));
  await nextTick();
  const branch = required<HTMLElement>(host, '[role="treeitem"]');
  const closedShape = decorativeIcon(branch).innerHTML;
  branch.click();
  await nextTick();
  expect(toggle).toHaveBeenLastCalledWith(items[0], true);
  expect(branch.getAttribute("aria-expanded")).toBe("false");
  expect(decorativeIcon(branch).innerHTML).toBe(closedShape);
  expanded.value = ["lazy"];
  await nextTick(); await nextTick();
  expect(branch.getAttribute("aria-expanded")).toBe("true");
  expect(decorativeIcon(branch).innerHTML).not.toBe(closedShape);
});

it("Tag does not render a close control when not closable", () => {
  const host = mount(() => h(Tag, {}, () => "只读"));
  expect(host.querySelector("button, .eap-tag__close, svg")).toBeNull();
  expect(host.textContent).toBe("只读");
});
