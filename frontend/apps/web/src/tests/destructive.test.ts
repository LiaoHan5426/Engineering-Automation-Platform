import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { ConfirmBox } from "@eap/ui";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import DatabaseManager from "../features/database/DatabaseManager.vue";
import KnowledgeManager from "../features/knowledge/KnowledgeManager.vue";

/**
 * The destructive-action contract from `docs/frontend-prototype.md`:
 *
 * > 删除 goes through a modal that names the impact and, when the backend refuses, keeps the confirm
 * > button present but disabled with the reason beside it.
 *
 * These assertions are behavioural (what actually renders) plus one meta-check on the source, because
 * `window.confirm` is the exact thing that makes this contract unverifiable: it blocks the page, it
 * cannot be asserted, and it cannot print a list of consequences.
 */
describe("destructive actions", () => {
  it("has no window.confirm anywhere in the console source", () => {
    const offenders: string[] = [];
    const srcRoot = join(import.meta.dirname, "..");
    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
      });
    }
    for (const file of walk(srcRoot)) {
      if (!file.endsWith(".vue") && !file.endsWith(".ts")) continue;
      // This test file names the pattern it forbids; a mention here is not a call site.
      if (file.endsWith("destructive.test.ts")) continue;
      const source = readFileSync(file, "utf8");
      for (const line of source.split("\n")) {
        // A mention inside a comment explains the rule; a call site is an invocation.
        const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        if (/window\s*\.\s*(confirm|alert)\s*\(/.test(code))
          offenders.push(relative(srcRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the confirm button in place, disabled, when the runtime refuses", async () => {
    // 后端拒绝时按钮仍在原位但禁用：理由写在旁边，而不是把控件藏起来。
    const html = await renderToString(
      createSSRApp(ConfirmBox, {
        title: "删除规则包 my-team-sql？",
        impact: ["该包有 4 条规则。"],
        confirmLabel: "删除规则包",
        refusal: "规则包正被已启用的专家引用：[orders-sql]",
        busy: false,
      }),
    );
    expect(html).toContain("正被已启用的专家引用");
    // 确认按钮没有被移除——它在，只是 disabled。
    expect(html).toContain("删除规则包");
    expect(html).toMatch(/<button[^>]*\bdisabled\b[^>]*>[\s\S]*?删除规则包/);
    expect(html).toContain("按钮仍在原位但已禁用");
  });

  it("does not render a knowledge deletion entry until a base is selected", async () => {
    const html = await renderToString(createSSRApp(KnowledgeManager));
    // 未选中知识库时不渲染删除入口；确认模态更不会凭空出现。
    expect(html).toContain("知识工作台");
    expect(html).not.toContain("删除知识库");
    expect(html).not.toContain("eap-confirm");
  });

  it("does not render a profile deletion entry until a profile is selected", async () => {
    const html = await renderToString(createSSRApp(DatabaseManager));
    expect(html).not.toContain("删除资料");
    expect(html).not.toContain("eap-confirm");
  });
});
