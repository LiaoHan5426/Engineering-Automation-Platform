// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createApp, h, nextTick, ref, type App } from "vue";
import type { TaskContext } from "@eap/runtime-client";
import { i18n } from "../../lib/i18n";
import TaskComposer from "./TaskComposer.vue";

let app: App | undefined;
let element: HTMLDivElement | undefined;
afterEach(() => { app?.unmount(); element?.remove(); sessionStorage.clear(); });
const empty = (): TaskContext => ({ mode: "chat", expert: "general", instructions: "", reasoning: "default", approval: "review", files: [], prototypeVersionId: "" });
async function mount() {
  const context = ref(empty());
  element = document.createElement("div");
  document.body.append(element);
  app = createApp({ render: () => h(TaskComposer, { context: context.value, disabled: false, reasoningEfforts: [],
    onUpdate: (value: TaskContext) => { context.value = value; } }) });
  app.use(i18n).mount(element);
  await nextTick();
  return context;
}
describe("engineering task composer", () => {
  it("keeps a version handoff pending while hidden or sending, then consumes it once", async () => {
    const context = ref(empty()), active = ref(false), disabled = ref(false);
    element = document.createElement('div'); document.body.append(element);
    app = createApp({ render: () => h(TaskComposer, { context: context.value, active: active.value, disabled: disabled.value, reasoningEfforts: [], onUpdate: value => { context.value = value; } }) });
    app.use(i18n).mount(element);
    sessionStorage.setItem('eap.chat.prototype', 'new-version');
    disabled.value = true; active.value = true; await nextTick();
    expect(context.value.prototypeVersionId).toBe('');
    expect(sessionStorage.getItem('eap.chat.prototype')).toBe('new-version');
    disabled.value = false; await nextTick();
    expect(context.value.prototypeVersionId).toBe('new-version');
    expect(sessionStorage.getItem('eap.chat.prototype')).toBeNull();
    context.value.prototypeVersionId = ''; active.value = false; await nextTick(); active.value = true; await nextTick();
    expect(context.value.prototypeVersionId).toBe('');
  });
  it("takes a saved Builder version into code mode without sending or writing", async () => {
    sessionStorage.setItem("eap.chat.prototype", "saved-version");
    const context = await mount();
    expect(context.value.prototypeVersionId).toBe("saved-version");
    expect(context.value.mode).toBe("code");
    expect(context.value.expert).toBe("frontend");
    expect(sessionStorage.getItem("eap.chat.prototype")).toBeNull();
    expect(element?.textContent).toContain("不会执行命令");
  });
  it("changes expert and approval as actual context and disables unsupported reasoning", async () => {
    const context = await mount();
    expect(element!.querySelectorAll('.context-toolbar select')).toHaveLength(3);
    const buttons = element!.querySelectorAll('.context-toolbar button');
    (buttons[0] as HTMLButtonElement).click();
    await nextTick();
    const tabs = element!.querySelectorAll('[role="tab"]');
    (tabs[1] as HTMLButtonElement).click();
    await nextTick();
    const expert = element!.querySelector('.composer-popup select') as HTMLSelectElement;
    expert.value = 'sql';
    expert.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    expect(context.value.expert).toBe('sql');
    (buttons[1] as HTMLButtonElement).click();
    await nextTick();
    expect(element!.querySelector('.composer-categories')).toBeNull();
    const selects = element!.querySelectorAll('.context-toolbar select');
    const approval = selects[1] as HTMLSelectElement;
    approval.value = 'read_only';
    approval.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    expect(context.value.approval).toBe('read_only');
    expect((selects[2] as HTMLSelectElement).disabled).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();
    expect(element!.querySelector('.composer-popup')).toBeNull();
  });
});
