import { describe, expect, it } from "vite-plus/test";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import ExpertManager from "./ExpertManager.vue";
import KnowledgeManager from "./KnowledgeManager.vue";
import DatabaseManager from "./DatabaseManager.vue";

describe("management page initialization", () => {
  it("opens structured database metadata management", async () => {
    const html = await renderToString(createSSRApp(DatabaseManager));
    expect(html).toContain("数据库资料");
    expect(html).toContain("元数据快照");
  });
  it("opens expert management without accessing uninitialized state", async () => {
    const html = await renderToString(createSSRApp(ExpertManager));
    expect(html).toContain("构建专家工作流");
    expect(html).toContain("新建专家");
  });
  it("opens knowledge management with a clear selection prompt", async () => {
    const html = await renderToString(createSSRApp(KnowledgeManager));
    expect(html).toContain("知识工作台");
    expect(html).toContain("全库检索");
  });
});
