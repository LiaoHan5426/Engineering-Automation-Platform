import { describe, expect, it } from "vite-plus/test";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import App from "../App.vue";
import { i18n } from "../lib/i18n";
import { workbench, chatBinding, type ChatBinding } from '../features/shell/workbench';

const render = () => renderToString(createSSRApp(App).use(i18n));

describe("console shell", () => {
  it("renders the product console with navigation, pipeline and inspector", async () => {
    const html = await render();
    expect(html).toContain('data-testid="project-tree"');
    expect(html).not.toContain("本机分组树 · 不是仓库文件树");
    expect(html).not.toContain("边界说明");
    expect(html).toContain("自由对话");
    expect(html).toContain("设置");
    expect(html).not.toContain("上下文详情");
    expect(html).not.toContain("流水线走向");
    expect(html).not.toContain('class="rail"');
  });

  it("scopes the inspector to the current page instead of leaving one global panel", async () => {
    const html = await render();
    expect(html).not.toContain("顶部状态条的四个数字都注明了出处");
    expect(html).not.toContain("聚合视图，本页没有可逐项检查的对象");
    expect(html).not.toContain("全局说明（与页面无关）");
    expect(html).not.toContain("inspector-card");
  });

  it("keeps an in-flight send visible and uncancellable on another page", async () => {
    const binding: ChatBinding = {
      history: [], activeId: null, references: [], draft: "仍在发送", sending: true, workspaceLabel: "", memory: "",
      model: "", connectionName: "", approval: "review", goal: "chat", executionMode: "chat", scenarioId: null,
      proposalFiles: [], verification: "not_requested", select: () => {}, create: () => {},
    };
    chatBinding.value = binding;
    try {
      const html = await render();
      expect(html).toContain("发送仍在进行，这次请求不能取消");
      expect(html).toContain("刷新或重启后不会继续");
      expect(html).not.toContain("取消发送");
    } finally { chatBinding.value = null; }
  });
});

// ---------------------------------------------------------------------------
// 信息架构：左栏不是一串平级入口，干活的面与配置是两组。
// 起因同原型契约——八个入口平级，其中五个是配置，落地页还是一张仪表盘。
// 2026-10-15：「任务」并入分析工作台，因为一次分析的输入与它的过程本来就是同一件事的两半。
const railHtml = (html: string) => html.slice(html.indexOf('class="desktop-sidebar"'), html.indexOf("</aside>", html.indexOf('class="desktop-sidebar"')));

describe("console information architecture", () => {
  it("provides five application entries and a contextual code sidebar", async () => {
    const html = await render();
    const activity = html.slice(html.indexOf('class="activity-bar"'), html.indexOf('</nav>'));
    expect((activity.match(/<button/g) ?? []).length).toBe(5);
    for (const name of ["code · 编程", "work · 办公", "场景", "专家", "设置"]) expect(activity).toContain(name);
    const rail = railHtml(html);
    expect(rail).toContain("分析工作台");
    expect(rail).toContain("新分组");
    expect(rail).toContain("任务看板");
    expect(rail).not.toContain("规则库");
    expect(rail).not.toContain("专家定义");
  });

  it("lands on the code workspace with a composer, not a dashboard", async () => {
    const html = await render();
    expect(html).toContain("preview-composer");
    expect(html).toContain('class="composer-draft"');
    expect(html).not.toContain("studio-stream");
    expect(html).not.toContain('id="view-overview"');
    expect(html).not.toContain("尚未建立对话");
  });

  it("keeps SQL metrics off the code landing page", async () => {
    const html = await render();
    expect(html).not.toContain("status-strip");
    expect(html).not.toContain("模型调用占比");
    expect(html).not.toContain("确定性覆盖");
  });
  it('uses the same workspace, navigation and composer for both HTTP sources', async () => {
    const original = workbench.preview;
    try {
      workbench.preview = true; const mock = await render();
      workbench.preview = false; const live = await render();
      for (const html of [mock, live]) {
        expect(html).toContain('data-testid="chat-workspace"');
        expect(html).toContain('data-testid="workspace-welcome"');
        expect(html).toContain('class="chat-composer preview-composer preview-input-box"');
        expect(html).not.toContain('data-testid="preview-workspace"');
        expect(html).not.toContain('使用真实服务');
        expect(html).not.toContain('使用演示数据');
        expect(html).not.toContain('preview-switch');
      }
      expect(railHtml(mock)).toEqual(railHtml(live));
    } finally { workbench.preview = original; }
  });
});
