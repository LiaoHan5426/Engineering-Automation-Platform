import { describe, expect, it } from "vite-plus/test";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "../../lib/i18n";
import BuilderWorkspace from "./BuilderWorkspace.vue";
import PluginCenter from "./PluginCenter.vue";
import { createPluginHost } from "./host";
import { memoryStore } from "./model";

describe("plugin prototype views", () => {
  it("renders two labeled mock repositories and a real Vue preview", async () => {
    const host = createPluginHost(memoryStore());
    const alpha = await renderToString(createSSRApp(BuilderWorkspace, { instanceId: "alpha", host }).use(i18n));
    const beta = await renderToString(createSSRApp(BuilderWorkspace, { instanceId: "beta", host }).use(i18n));

    expect(alpha).toContain("模拟 · ledger");
    expect(beta).toContain("模拟 · catalog");
    expect(alpha).toContain("data-testid=\"vue-preview\"");
    expect(alpha).toContain("模拟任务");
    expect(alpha).toContain("未授予 repository.write");
    expect(alpha).not.toContain("已交付");
  });

  it("lists the preinstalled plugins with requests and no grants", async () => {
    const host = createPluginHost(memoryStore());
    const html = await renderToString(createSSRApp(PluginCenter, { host }).use(i18n));
    expect(html).toContain("插件中心");
    expect(html).toContain("对话");
    expect(html).toContain("构建工作台");
    expect(html).toContain("repository.write");
    expect(html).toContain("授予");
    expect(html).toContain("无");
    expect(html).toContain(i18n.global.t("plugin.centerHint"));
  });
});
