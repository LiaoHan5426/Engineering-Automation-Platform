// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createApp, h, nextTick, type App } from "vue";
import { Tag } from "@eap/ui";

let app: App | undefined;
let root: HTMLDivElement | undefined;
afterEach(() => {
  app?.unmount();
  root?.remove();
});

it("renders a closable tag from the shared primitive and emits close from the marker", async () => {
  const close = vi.fn();
  const click = vi.fn();
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({
    setup() {
      return () => h(Tag, { closable: true, type: "warning", onClose: close, onClick: click }, () => "场景");
    },
  });
  app.mount(root);
  await nextTick();
  const tag = root.querySelector("button.eap-tag");
  expect(tag?.className).toContain("eap-tag--warning");
  expect(tag?.className).toContain("eap-tag--light");
  expect(tag?.textContent).toContain("场景");
  (tag?.querySelector(".eap-tag__close") as HTMLElement).click();
  expect(close).toHaveBeenCalledTimes(1);
  expect(click).not.toHaveBeenCalled();
});
