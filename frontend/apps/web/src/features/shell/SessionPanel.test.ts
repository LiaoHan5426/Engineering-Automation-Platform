// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createApp, h, nextTick, type App } from "vue";
import { runtimeApi, type CodeProposal } from "@eap/runtime-client";
import { i18n } from "../../lib/i18n";
import SessionPanel from "../../components/SessionPanel.vue";
import { chatBinding, workbench, type ChatBinding } from "./workbench";

let app: App | undefined;
let root: HTMLDivElement | undefined;
beforeEach(() => vi.spyOn(runtimeApi, 'workspaceFiles').mockResolvedValue({ path: '', entries: [], denial: 'AUTHORIZED_ROOT_MISSING', truncated: false }));
afterEach(() => { app?.unmount(); root?.remove(); chatBinding.value = null; workbench.sessionExtras = {}; vi.restoreAllMocks(); });

function binding(extra: Partial<ChatBinding> = {}): ChatBinding {
  return {
    history: [], activeId: "s1", references: [], draft: "", sending: false, workspaceLabel: "", memory: "",
    model: "", connectionName: "", approval: "review", goal: "chat", executionMode: "chat", scenarioId: null,
    proposalFiles: [], verification: "not_requested", select: () => {}, create: () => {}, ...extra,
  };
}

it("replaces the summary when the active session changes", async () => {
  chatBinding.value = binding({ activeId: "a", executionMode: "agent", scenarioId: "prototype-to-code", proposalFiles: ["src/App.vue"], references: ["notes.md"], model: "reasoning-demo", connectionName: "Mock" });
  workbench.sessionExtras.a = { scenarioId: "prototype-to-code", experts: [], resources: [], projectId: "local-eap", executionMode: "agent" };
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render: () => h(SessionPanel, { mode: "summary" }) });
  app.use(i18n).mount(root);
  await nextTick();
  expect(root.textContent).toContain("智能体");
  expect(root.textContent).toContain("原型到代码");
  expect(root.textContent).toContain("候选 1 个文件");
  expect(root.textContent).toContain("基线未知，不能把候选当成可以写入");
  expect(root.textContent).toContain("notes.md");
  expect(root.querySelector('[data-testid="panel-session"]')?.textContent).toMatch(/只反映当前会话|Shows this session only/);
  expect(root.querySelector('[data-testid="session-project"]')?.textContent).toMatch(/本机项目分组：EAP|Local project group: EAP/);
  expect(root.querySelector('[data-testid="expert-none"]')?.textContent).toMatch(/未加入协作专家|No collaborator expert/);
  expect(root.querySelector('[data-testid="risk-review-off"]')?.textContent).toMatch(/风险审核未接入|Risk review is not connected/);
  expect(root.querySelector('[data-testid="run-recovery-off"]')?.textContent).toMatch(/不会恢复后台 Run|will not resume a background Run/);
  chatBinding.value = binding({ activeId: "b", executionMode: "chat", scenarioId: null, proposalFiles: [], references: [] });
  workbench.sessionExtras.b = { scenarioId: null, experts: [], resources: [], projectId: null, executionMode: "chat" };
  await nextTick();
  expect(root.textContent).toContain("聊天");
  expect(root.textContent).not.toContain("原型到代码");
  expect(root.textContent).toContain("无候选");
  expect(root.textContent).toContain("这次回复没有待确认的写入");
  expect(root.textContent).not.toContain("基线未知");
  expect(root.querySelector('[data-testid="panel-session"]')?.textContent).toMatch(/只反映当前会话|Shows this session only/);
  expect(root.querySelector('[data-testid="session-project"]')?.textContent).toMatch(/未绑定项目分组|no project group/);
  chatBinding.value = binding({ activeId: "b", proposalFiles: ["src/App.vue"], writeRefused: true });
  await nextTick();
  expect(root.textContent).toContain("这次写入已拒绝，不会应用");
  expect(root.textContent).toContain("仓库文件未读取");
  expect(root.textContent).not.toContain("notes.md");
});

it("lists this session's steps and clears them with the session", async () => {
  chatBinding.value = binding({ activeId: "a", draft: "保留正文", sending: true, proposalFiles: ["src/App.vue"] });
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render: () => h(SessionPanel, { mode: "summary" }) });
  app.use(i18n).mount(root);
  await nextTick();
  const steps = root.querySelector("[data-testid=summary-steps]")?.textContent ?? "";
  expect(steps).toContain("草稿仍在输入框");
  expect(steps).toContain("发送仍在进行");
  expect(steps).toContain("候选 1 个文件");
  expect(steps).toContain("无执行号");
  expect(steps).toContain("交互验收：未完成");
  chatBinding.value = binding({ activeId: "b", draft: "  ", sending: false, proposalFiles: [] });
  await nextTick();
  const next = root.querySelector("[data-testid=summary-steps]")?.textContent ?? "";
  expect(next).toContain("输入框没有草稿");
  expect(next).toContain("当前没有进行中的发送");
  expect(next).toContain("无候选");
  expect(next).not.toContain("草稿仍在输入框");
  expect(next).toContain("无执行号");
});

it("shows an empty background state as 暂无 without inventing a run", async () => {
  chatBinding.value = binding({ activeId: "a" });
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render: () => h(SessionPanel, { mode: "summary" }) });
  app.use(i18n).mount(root);
  await nextTick();
  expect(root.querySelector("[data-testid=summary-none]")?.textContent).toMatch(/暂无|None/);
  expect(root.querySelector("[data-testid=summary-background]")?.textContent).toMatch(/当前没有后台任务|No background tasks/);
  expect(root.querySelector("[data-testid=run-recovery-off]")?.textContent).toMatch(/不会恢复|will not resume/);
});

it("traces the adopted expert version, guidance and resource scope", async () => {
  chatBinding.value = binding({ activeId: "a" });
  workbench.sessionExtras.a = {
    scenarioId: null, resources: [], projectId: null,
    experts: [{ id: "writer", name: "文档整理", category: "办公", version: "demo-1", resources: "无外部工具", guidance: "只整理已给出的材料。", mine: true }],
  };
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render: () => h(SessionPanel, { mode: "summary" }) });
  app.use(i18n).mount(root);
  await nextTick();
  expect(root.textContent).toContain("文档整理@demo-1");
  expect(root.textContent).toContain("只整理已给出的材料。");
  expect(root.textContent).toContain("无外部工具");
  expect(root.textContent).toContain("工具未接入");
  expect(root.querySelector('[data-testid="expert-trace"]')?.textContent).toContain("文档整理@demo-1");
  chatBinding.value = binding({ activeId: "b" });
  workbench.sessionExtras.b = { scenarioId: null, experts: [], resources: [], projectId: null };
  await nextTick();
  expect(root.textContent).not.toContain("只整理已给出的材料。");
  expect(root.querySelector('[data-testid="expert-none"]')?.textContent).toMatch(/未加入协作专家|No collaborator expert/);
});

it("shows the delivery input with local UI preview still short of acceptance", async () => {
  chatBinding.value = binding({ activeId: "a" });
  workbench.sessionExtras.a = {
    scenarioId: "prototype-to-code", experts: [], resources: [], projectId: null,
    delivery: { versionId: "draft-1", pagePath: "frontend/apps/web/src/features/chat/TaskComposer.vue", pageLabel: "preview.pageComposer" },
  };
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render: () => h(SessionPanel, { mode: "summary" }) });
  app.use(i18n).mount(root);
  await nextTick();
  expect(root.textContent).toContain("draft-1");
  expect(root.textContent).toContain("TaskComposer.vue");
  expect(root.textContent).toContain("无退出码");
  expect(root.textContent).toContain("页面预览：可打开本机 UI");
  expect(root.textContent).toContain("/#chat");
  expect(root.textContent).toContain("交互验收：未完成");
  expect(root.textContent).not.toContain("demo passed");
});

it("keeps a recorded verification value from looking complete", async () => {
  chatBinding.value = binding({ verification: "passed" });
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render: () => h(SessionPanel, { mode: "summary" }) });
  app.use(i18n).mount(root);
  await nextTick();
  expect(root.textContent).toContain("记录值：passed");
  expect(root.textContent).toContain("没有逐条退出码，不能显示完成");
  expect(root.textContent).toContain("退出码：无");
});

it("keeps a local upload apart from the design version and the unread repository", async () => {
  chatBinding.value = binding({ localFiles: ["notes.md"], versionId: "draft-1", references: ["notes.md", "draft-1"] });
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render: () => h(SessionPanel, { mode: "files" }) });
  app.use(i18n).mount(root);
  await nextTick();
  const uploads = root.querySelector('[data-testid="files-local-uploads"]')?.textContent ?? "";
  const version = root.querySelector('[data-testid="files-design-version"]')?.textContent ?? "";
  expect(uploads).toContain("本地上传");
  expect(uploads).toContain("notes.md");
  expect(uploads).toContain("哈希：未知");
  expect(version).toContain("设计版本");
  expect(version).toContain("draft-1");
  expect(root.querySelector('[data-testid="repository-browser"]')).not.toBeNull();
  expect(root.querySelector('[data-testid="repo-tree-hint"]')?.textContent).toMatch(/展开目录|Expand folders/);
});

it("keeps candidate, applied and unread directory changes apart", async () => {
  const proposal: CodeProposal = {
    id: "p", conversationId: "s1", workspace: "w", summary: "s", applied: false, writeAllowed: false, verification: "not_requested",
    files: [{ path: "src/App.vue", before: "a", content: "b", baseHash: "" }],
  };
  chatBinding.value = binding({ activeId: "a", proposalFiles: ["src/App.vue"], appliedFiles: ["src/done.vue"], proposal });
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render: () => h(SessionPanel, { mode: "changes" }) });
  app.use(i18n).mount(root);
  await nextTick();
  const text = root.textContent ?? "";
  const candidate = text.indexOf("本次候选");
  const applied = text.indexOf("本次已应用");
  const existing = text.indexOf("目录中原有修改");
  expect(candidate).toBeGreaterThanOrEqual(0);
  expect(candidate).toBeLessThan(text.indexOf("src/App.vue"));
  expect(text.indexOf("src/App.vue")).toBeLessThan(applied);
  expect(applied).toBeLessThan(text.indexOf("src/done.vue"));
  expect(text.indexOf("src/done.vue")).toBeLessThan(existing);
  expect(text).toContain("未读取工作区");
  expect(text).toContain("生成前基线：未知");
  expect(text).toContain("当前不能应用");
  expect(text).toContain("不能用候选内容覆盖");
  expect(root.querySelector('[data-testid="live-verification-config"]')?.textContent).toMatch(/未启用|verification\.enabled=false|Verification config: off/i);
  expect(text).toContain("typecheck：未请求，退出码：无");
  expect(text).toContain("test：未请求，退出码：无");
  expect(text).toContain("build：未请求，退出码：无");
  expect(text).toContain("页面预览：可打开本机 UI");
  expect(text).toContain("/#chat");
  expect(text).toContain("交互验收：未完成");
  expect(text).toContain("不能显示完成");
  expect(root.querySelector('[data-testid="panel-session"]')?.textContent).toMatch(/只反映当前会话|Shows this session only/);
  (root.querySelector(".codex-file") as HTMLButtonElement).click();
  await nextTick();
  expect(root.querySelector(".codex-file[aria-pressed='true']")?.textContent).toContain("src/App.vue");
  chatBinding.value = binding({
    activeId: "b",
    proposalFiles: ["src/Other.vue"],
    proposal: {
      ...proposal,
      conversationId: "b",
      files: [{ path: "src/Other.vue", before: "x", content: "y", baseHash: "hash" }],
    },
  });
  await nextTick();
  expect(root.textContent).toContain("src/Other.vue");
  expect(root.textContent).not.toContain("src/App.vue");
  expect(root.querySelector(".codex-file[aria-pressed='true']")?.textContent).toContain("src/Other.vue");
});
