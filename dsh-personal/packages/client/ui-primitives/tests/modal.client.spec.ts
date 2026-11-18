// @vitest-environment jsdom
import { h, nextTick } from "vue";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { fireEvent, screen } from "@testing-library/dom";
import { Modal } from "../src/Modal.tsx";
import { cleanupVue, renderVue } from "./vue-render.ts";

afterEach(cleanupVue);

it("is absent while closed; localized controls, Escape and mask retain owner close semantics", async () => {
  const onClose = vi.fn();
  const view = renderVue(
    h(Modal, { open: false, onClose, title: "Create new workspace", closeLabel: "Close" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  view.rerender(
    h(
      Modal,
      {
        open: true,
        onClose,
        title: "Create new workspace",
        closeLabel: "Configure later",
        description: "Name it.",
        contentClassName: "scrolling-content",
        shortcutModal: "create-workspace",
      },
      {
        default: () => h("input", { "aria-label": "name" }),
        footer: () => h("button", { type: "button" }, "Create"),
      },
    ),
  );
  await nextTick();
  const dialog = screen.getByRole("dialog", { name: "Create new workspace" });
  expect(dialog.parentElement?.parentElement).toBe(document.body);
  expect(dialog.getAttribute("data-shortcut-modal")).toBe("create-workspace");
  expect(screen.getByRole("button", { name: "Configure later" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
  expect(screen.getByText("Name it.").parentElement?.className).toContain("scrolling-content");
  fireEvent.keyDown(document, { key: "a" });
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(dialog.previousElementSibling!);
  expect(onClose).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Configure later" }));
  expect(onClose).toHaveBeenCalledTimes(3);
});

it("places the decorative warning icon in the title and removes chrome in headless mode", async () => {
  const view = renderVue(
    h(
      Modal,
      {
        open: true,
        tone: "warning",
        title: "Confirm change",
        closeLabel: "Close",
        onClose: () => {},
      },
      { default: () => h("p", "Review the consequences.") },
    ),
  );
  await nextTick();
  const icon = screen.getByRole("heading", { name: "Confirm change" }).querySelector("svg");
  expect(icon).not.toBeNull();
  expect(icon?.getAttribute("aria-hidden")).toBe("true");
  expect(screen.getByText("Review the consequences.").querySelector("svg")).toBeNull();
  view.rerender(
    h(
      Modal,
      { open: true, title: "Confirm change", closeLabel: "Close", onClose: () => {} },
      { default: () => "Body" },
    ),
  );
  await nextTick();
  expect(screen.getByRole("heading", { name: "Confirm change" }).querySelector("svg")).toBeNull();
  view.rerender(
    h(
      Modal,
      { open: true, headless: true, tone: "warning", title: "Confirm change", onClose: () => {} },
      { default: () => "Body" },
    ),
  );
  await nextTick();
  expect(screen.queryByRole("heading")).toBeNull();
  expect(screen.getByRole("dialog").querySelector("svg")).toBeNull();
});

it("renders a headless custom surface without close chrome or backdrop blur", async () => {
  renderVue(
    h(
      Modal,
      {
        open: true,
        onClose: () => {},
        title: "Custom surface",
        headless: true,
        backdropBlur: false,
      },
      { default: () => h("span", "Custom body") },
    ),
  );
  await nextTick();
  const dialog = screen.getByRole("dialog", { name: "Custom surface" });
  expect((dialog.previousElementSibling as HTMLElement).style.backdropFilter).toBe("none");
  expect(screen.getByText("Custom body")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

it("lets a local capture handler own Escape before the modal layer", async () => {
  const onClose = vi.fn();
  renderVue(
    h(
      Modal,
      {
        open: true,
        title: "Search",
        closeLabel: "Close",
        onClose,
        onKeyDownCapture: (event) => {
          event.preventDefault();
        },
      },
      { default: () => h("input", { "aria-label": "Search" }) },
    ),
  );
  await nextTick();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(onClose).not.toHaveBeenCalled();
});
