// @vitest-environment happy-dom
import { afterEach, expect, it } from "vite-plus/test";
import { createApp, h, nextTick, type App } from "vue";
import { Button, Dialog } from "@eap/ui";

let app: App | undefined;
let root: HTMLDivElement | undefined;
afterEach(() => {
  app?.unmount();
  root?.remove();
  document.querySelectorAll("[data-testid=eap-dialog]").forEach((node) => node.remove());
});

it("renders a shared dialog shell with close and backdrop dismiss", async () => {
  let closed = 0;
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({
    setup() {
      return () => h(Dialog, {
        title: "Shared dialog",
        closeLabel: "关闭",
        closeTestId: "dialog-close",
        "onClose": () => { closed += 1; },
      }, { default: () => h("p", "body copy") });
    },
  });
  app.mount(root);
  await nextTick();
  const shell = document.querySelector("[data-testid=eap-dialog]");
  expect(shell).not.toBeNull();
  expect(shell?.querySelector("[role=dialog]")?.getAttribute("aria-label")).toBe("Shared dialog");
  expect(shell?.textContent).toContain("body copy");
  (document.querySelector("[data-testid=dialog-close]") as HTMLButtonElement).click();
  expect(closed).toBe(1);
  (shell?.querySelector(".eap-dialog-backdrop") as HTMLButtonElement).click();
  expect(closed).toBe(2);
});

it("keeps the shared Button size variants available for dialog actions", () => {
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({
    setup() {
      return () => h(Button, { variant: "primary", size: "sm" }, () => "Save");
    },
  });
  app.mount(root);
  const button = root.querySelector("button");
  expect(button?.className).toContain("eap-button--primary");
  expect(button?.className).toContain("eap-button--sm");
  expect(button?.textContent).toBe("Save");
});
