import { describe, expect, it } from "vite-plus/test";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import ExpertManager from "../features/expert/ExpertManager.vue";
import CapabilityManager from "../features/capability/CapabilityManager.vue";
import KnowledgeManager from "../features/knowledge/KnowledgeManager.vue";
import DatabaseManager from "../features/database/DatabaseManager.vue";
import RuleManager from "../features/rule/RuleManager.vue";

describe("management page initialization", () => {
  it("opens structured database metadata management", async () => {
    const html = await renderToString(createSSRApp(DatabaseManager));
    expect(html).toContain("数据库资料");
    expect(html).toContain("元数据快照");
  });
  it("offers profile deletion as a boundary of a saved profile, not a stray button", async () => {
    const html = await renderToString(createSSRApp(DatabaseManager));
    // 三种动作都在列表里；删除入口只在选中已有资料后出现，未选中时不渲染。
    expect(html).toContain("选择资料查看、编辑或删除");
    expect(html).not.toContain("删除资料");
  });
  it("opens expert management without accessing uninitialized state", async () => {
    const html = await renderToString(createSSRApp(ExpertManager));
    expect(html).toContain("构建专家工作流");
    expect(html).toContain("新建专家");
  });
  it("opens knowledge management with a clear selection prompt", async () => {
    const html = await renderToString(createSSRApp(KnowledgeManager));
    expect(html).toContain("知识工作台");
    expect(html).toContain("知识检索");
  });
  it("opens the rule library without the architecture essay", async () => {
    const html = await renderToString(createSSRApp(RuleManager));
    expect(html).toContain("规则库");
    expect(html).toContain("事实与运算符词表");
    expect(html).not.toContain("规则是数据，不是代码");
  });
  it("opens the capability catalog without the architecture essay", async () => {
    const html = await renderToString(createSSRApp(CapabilityManager));
    expect(html).toContain("能力目录");
    expect(html).toContain("总览");
    expect(html).not.toContain("每类能改什么由后端声明");
    expect(html).not.toContain("手动 CLI 操作返回脱敏进程证据");
  });
  it("renders one capability sub-page at a time instead of stacking them", async () => {
    const html = await renderToString(createSSRApp(CapabilityManager));
    // 子页签是真的切换：默认只渲染总览，其余子页的内容不进入 DOM。
    expect(html).toContain("manager-tabs");
    expect(html).not.toContain("登记 MCP 服务器");
    expect(html).not.toContain("声明二进制");
  });
});
