// @vitest-environment happy-dom
import { afterEach, expect, it } from "vite-plus/test";
import { createApp, h, nextTick, type App } from "vue";
import { i18n } from "../../lib/i18n";
import ExpertCatalog from "./ExpertCatalog.vue";
import { currentExtras, workbench } from "./workbench";

let app: App | undefined;
let root: HTMLDivElement | undefined;

afterEach(() => {
  app?.unmount();
  root?.remove();
  workbench.notice = "";
  workbench.preview = false;
  workbench.sessionExtras = {};
});

it('shows and toggles the current task selection from the expert card', async () => {
  workbench.sessionExtras = {};
  root = document.createElement('div'); document.body.append(root);
  app = createApp(ExpertCatalog); app.use(i18n).mount(root); await nextTick();
  const add = root.querySelector('[data-testid="expert-add"]') as HTMLButtonElement;
  expect(add.getAttribute('aria-pressed')).toBe('false');
  add.click(); await nextTick();
  expect(add.getAttribute('aria-pressed')).toBe('true');
  expect(currentExtras().experts).toHaveLength(1);
  add.click(); await nextTick();
  expect(add.getAttribute('aria-pressed')).toBe('false');
  expect(currentExtras().experts).toHaveLength(0);
});

it("exposes my-experts in the header and filters by category chips", async () => {
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render: () => h(ExpertCatalog) });
  app.use(i18n).mount(root);
  await nextTick();
  expect(root.querySelector("[data-testid=expert-catalog-title]")?.textContent).toMatch(/专家市场|Expert marketplace/);
  const mine = root.querySelector("[data-testid=experts-mine]") as HTMLButtonElement;
  expect(mine.textContent).toMatch(/我的专家|My experts/);
  mine.click();
  await nextTick();
  expect(mine.getAttribute("aria-pressed")).toBe("true");
  const category = [...root.querySelectorAll("[data-testid=expert-categories] button")].find((item) => item.textContent === "办公");
  expect(category).toBeTruthy();
  (category as HTMLButtonElement).click();
  await nextTick();
  expect(root.textContent).toContain("文档整理");
});
