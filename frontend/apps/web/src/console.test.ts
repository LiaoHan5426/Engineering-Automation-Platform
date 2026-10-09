import { describe, expect, it } from "vite-plus/test";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import App from "./App.vue";

describe("console shell", () => {
  it("renders the product console with navigation, pipeline and inspector", async () => {
    const html = await renderToString(createSSRApp(App));
    expect(html).toContain("工程自动化平台");
    expect(html).toContain("概览");
    expect(html).toContain("SQL 分析室");
    expect(html).toContain("规则库");
    expect(html).toContain("检查器");
    expect(html).toContain("流水线走向");
    expect(html).toContain("确定性能力优先");
  });

  it("scopes the inspector to the current page instead of leaving one global panel", async () => {
    const html = await renderToString(createSSRApp(App));
    // 检查器标注当前页面，并给出该页的说明，而不是一句与页面无关的通用提示。
    expect(html).toContain("聚合视图，本页没有可逐项检查的对象");
    expect(html).toContain("全局说明（与页面无关）");
    // 只有真正产出逐项结果的页面才渲染“已选中”卡片；概览页不应出现 SQL 发现的检查卡片或其提示。
    expect(html).not.toContain("点击任意一条发现");
    expect(html).not.toContain("inspector-card");
    expect(html).not.toContain("尚未选择发现");
  });
});
