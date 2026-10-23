import { describe, expect, it } from "vite-plus/test";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import App from "../App.vue";

const render = () => renderToString(createSSRApp(App));

describe("console shell", () => {
  it("renders the product console with navigation, pipeline and inspector", async () => {
    const html = await render();
    expect(html).toContain("工程自动化平台");
    expect(html).toContain("分析工作台");
    expect(html).toContain("规则库");
    expect(html).toContain("上下文详情");
    expect(html).not.toContain("流水线走向");
    expect(html).toContain("确定性能力优先");
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
const railHtml = (html: string) => html.slice(html.indexOf('class="rail"'), html.indexOf("</nav>"));

describe("console information architecture", () => {
  it("splits the rail into 工作 and 设置 instead of one flat list", async () => {
    const rail = railHtml(await render());
    expect(rail).toContain("工作");
    expect(rail).toContain("设置");
    // 分组标签是渲染出来的眉题，不是写死在别处的一段文字。
    expect(rail).toContain("rail__eyebrow");
  });

  it("keeps 任务 out of the rail: it is the workbench's task list now", async () => {
    const html = await render();
    // 不再是第二个平级入口——任务与它的流被并进工作台。
    expect(railHtml(html)).not.toContain(">任务<");
    expect(html).toContain("studio-tasks");
    expect(html).toContain("分析任务");
  });

  it("puts the workbench before the configuration surfaces in the rail", async () => {
    const rail = railHtml(await render());
    const work = rail.indexOf("分析工作台");
    const cfg = rail.indexOf("专家定义");
    expect(work).toBeGreaterThan(-1);
    expect(cfg).toBeGreaterThan(work);
  });

  it("keeps every configuration surface inside the settings group", async () => {
    const html = await render();
    for (const name of ["专家定义", "规则库", "知识库", "数据库资料", "能力目录"]) {
      expect(html).toContain(name);
    }
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
