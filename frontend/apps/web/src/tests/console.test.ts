import { describe, expect, it } from "vite-plus/test";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import App from "../App.vue";
import { i18n } from "../lib/i18n";

const render = () => renderToString(createSSRApp(App).use(i18n));

describe("console shell", () => {
  it("renders the product console with navigation, pipeline and inspector", async () => {
    const html = await render();
    expect(html).toContain("工程自动化平台");
    expect(html).toContain("分析工作台");
    expect(html).toContain("设置");
    expect(html).toContain("上下文详情");
    expect(html).not.toContain("流水线走向");
    expect(html).not.toContain('class="rail"');
  });

  it("scopes the inspector to the current page instead of leaving one global panel", async () => {
    const html = await render();
    // 检查器标注当前页面，并给出该页的说明，而不是一句与页面无关的通用提示。
    // 落地页已改为分析工作台，所以这里应当是工作台的说明，不再是那张聚合视图的空话。
    expect(html).toContain("顶部状态条的四个数字都注明了出处");
    expect(html).not.toContain("聚合视图，本页没有可逐项检查的对象");
    expect(html).toContain("全局说明（与页面无关）");
    // 检查器标注的是当前页面：落地页是工作台，所以它讲的是工作台，并停在这一页的空态上。
    // 「inspector-card」是选中某一条发现之后才出现的东西，落地时不应存在。
    expect(html).not.toContain("inspector-card");
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
    expect(rail).toContain("对话");
    expect(rail).not.toContain("规则库");
    expect(rail).not.toContain("专家定义");
  });

  it("lands on the workbench with a task stream and a composer, not a dashboard", async () => {
    const html = await render();
    // 第一屏是「会话列表 + 任务流 + 输入框」，不是一张配置表或一堵计数卡墙。
    expect(html).toContain("studio-stream");
    expect(html).toContain("尚未选择分析任务");
    expect(html).toContain("composer-goal");
    expect(html).toContain("开始分析");
    // 概览不再是一个独立的视图。
    expect(html).not.toContain('id="view-overview"');
    expect(html).not.toContain("尚未建立对话");
  });

  it("folds the old overview numbers into a status strip on the workbench", async () => {
    const html = await render();
    expect(html).toContain("status-strip");
    for (const label of ["已注册能力", "专家定义", "模型调用占比"]) {
      expect(html).toContain(label);
    }
    // 口径那一行还在，且收在折叠块里，不把工作台顶成卡片墙。
    expect(html).toContain("status-more");
    expect(html).toContain("这些数字从哪来");
  });
});
