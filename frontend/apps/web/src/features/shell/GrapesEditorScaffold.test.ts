// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp, h, nextTick, type App } from "vue";
import { i18n } from "../../lib/i18n";
import { resetPrototypeSchemaForTests } from "./prototypeSchema";
import GrapesEditorScaffold from "./GrapesEditorScaffold.vue";
vi.mock('grapesjs', () => { throw new Error('Editor unavailable in this test'); });

let app: App | undefined;
let root: HTMLDivElement | undefined;

beforeEach(() => {
  localStorage.clear();
  resetPrototypeSchemaForTests();
});

afterEach(() => {
  app?.unmount();
  root?.remove();
  localStorage.clear();
  resetPrototypeSchemaForTests();
});

describe("grapes editor scaffold", () => {
  it("stays honest when grapesjs is unavailable and still saves a local schema", async () => {
    root = document.createElement("div");
    document.body.append(root);
    app = createApp({ render: () => h(GrapesEditorScaffold) });
    app.use(i18n).mount(root);
    await vi.waitFor(() => expect(root!.querySelector("[data-testid=grapes-status]")?.textContent).toMatch(/脚手架|Scaffold/));
    await vi.waitFor(() => expect(root!.querySelector("[data-testid=grapes-boundary]")?.textContent).toMatch(/HTML\/CSS|Vue/));
    const title = root.querySelector("[data-testid=grapes-title]") as HTMLInputElement;
    title.value = "Grapes scaffold";
    title.dispatchEvent(new Event("input"));
    (root.querySelector("[data-testid=grapes-save]") as HTMLButtonElement).click();
    await nextTick();
    expect(root.querySelector("[data-testid=grapes-note]")?.textContent).toMatch(/已保存|saved/i);
    expect(localStorage.getItem("eap.prototype-schema.v1")).toContain("Grapes scaffold");
  });
});
