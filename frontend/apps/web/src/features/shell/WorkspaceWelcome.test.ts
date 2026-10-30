// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test';
import { createApp, h, nextTick, type App } from 'vue';
import { i18n } from '../../lib/i18n';
import WorkspaceWelcome from '../../components/WorkspaceWelcome.vue';
import { chatBinding, currentExtras, workbench } from './workbench';
let app: App;
let root: HTMLDivElement;
afterEach(() => { app?.unmount(); root?.remove(); chatBinding.value = null; workbench.sessionExtras = {}; localStorage.clear(); });
for (const preview of [false, true]) {
  it(`uses the same filtered scene and expert interactions with preview=${preview}`, async () => {
    workbench.preview = preview; workbench.workMode = 'work';
    root = document.createElement('div'); document.body.append(root);
    const applied: string[] = [];
    app = createApp({ render: () => h(WorkspaceWelcome, { onScenario: id => applied.push(id) }) });
    app.use(i18n).mount(root); await nextTick();
    expect(root.textContent).toContain('项目文档编写');
    expect(root.textContent).not.toContain('审阅已有改动');
    expect(root.querySelector('[data-testid="welcome-draft-hint"]')?.textContent).toMatch(/选择不会发送|Choosing does not send/);
    expect(root.querySelector('[data-testid="welcome-kept"]')).toBeNull();
    expect(root.querySelector('[data-testid="expert-search"]')).not.toBeNull();
    const expertSearch = root.querySelector('[data-testid="expert-search"]') as HTMLInputElement;
    expertSearch.value = '文档';
    expertSearch.dispatchEvent(new Event('input'));
    await nextTick();
    expect(root.querySelector('.expert-pills')?.textContent).toContain('文档整理');
    expect(root.querySelector('.expert-pills')?.textContent).not.toContain('前端实现');
    expertSearch.value = '';
    expertSearch.dispatchEvent(new Event('input'));
    await nextTick();
    const buttons = Array.from(root.querySelectorAll('button'));
    buttons.find(item => item.textContent?.includes('项目文档编写'))!.click();
    expect(applied).toEqual(['project-report']);
    buttons.find(item => item.textContent?.includes('文档整理'))!.click();
    expect(currentExtras().experts.map(item => item.id)).toEqual(['writer']);
    await nextTick();
    expect(root.querySelector('[data-testid="welcome-kept"]')?.textContent).toMatch(/刷新|refresh|不会清空|will not clear/);
    buttons.find(item => item.textContent?.includes('文档整理'))!.click();
    expect(currentExtras().experts).toEqual([]);
    expect(root.textContent).toContain('文档编写');
    expect(root.textContent).toContain('政策分析');
    expect(root.textContent).toMatch(/敬请期待|还在路上/);
    expect(buttons.find(item => item.textContent?.includes('对内办公'))!.disabled).toBe(true);
    expect(buttons.find(item => item.textContent?.includes('公司政策知识专家'))!.disabled).toBe(true);
    expect(buttons.find(item => item.textContent?.includes('文档编写'))!.disabled).toBe(false);
  });
}

it('keeps scenario and expert picks after remount (catalog round-trip)', async () => {
  workbench.workMode = 'work';
  workbench.preview = false;
  currentExtras().scenarioId = 'project-report';
  currentExtras().experts = [{ id: 'writer', name: '文档整理', category: '办公', version: 'demo-1', resources: '无外部工具', guidance: '只整理已给出的材料。', mine: true }];
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(WorkspaceWelcome, { onScenario: () => {} }) });
  app.use(i18n).mount(root); await nextTick();
  expect(root.querySelector('[data-testid="welcome-kept"]')?.textContent).toMatch(/不会清空|will not clear/);
  expect(root.querySelector('.expert-pills button.selected')?.textContent).toMatch(/文档整理/);
  expect(root.querySelector('.preview-scene-grid button.selected')?.textContent).toMatch(/项目文档编写/);
});
it('keeps the work scene and expert chooser beside an existing transcript', async () => {
  workbench.workMode = 'work';
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(WorkspaceWelcome, { compact: true, onScenario: () => {} }) });
  app.use(i18n).mount(root); await nextTick();
  expect(root.textContent).toContain('项目文档编写');
  expect(root.textContent).toContain('文档整理');
  expect(root.textContent).not.toContain('这次想完成什么');
});
