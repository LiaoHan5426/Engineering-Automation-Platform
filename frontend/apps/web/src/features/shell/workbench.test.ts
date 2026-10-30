// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { addExpert, applyScenario, assignSessionProject, adoptScratch, chatBinding, currentExtras, loadLayoutDrafts, loadSessionExtras, loadSessionPanels, moveTask, rememberPanel, rememberSessionExecution, restorePanel, saveLayoutDraft, setExecutionMode, takeBoardDraft, workbench } from "./workbench";

beforeEach(() => {
  localStorage.clear();
  workbench.sessionExtras = {};
  chatBinding.value = null;
  workbench.tasks = [
    { id: "task-nav", title: "调整设置侧栏与输入框", column: "planned", note: "" },
    { id: "task-sql", title: "保留 SQL 分析工作台", column: "ready", note: "" },
  ];
  workbench.notice = "";
  workbench.executionMode = "chat";
  workbench.drafts = [];
  workbench.pendingBoardDraft = null;
  workbench.panel = null;
  workbench.sessionPanels = {};
});

describe("workbench demo state", () => {
  it("applies a scenario without clearing the recorded draft", () => {
    const extras = currentExtras();
    extras.scenarioId = null;
    const draft = "保留这段需求";
    expect(applyScenario("doc-writing")).toBe(false);
    expect(applyScenario("prototype-to-code")).toBe(true);
    expect(currentExtras().scenarioId).toBe("prototype-to-code");
    expect(draft).toBe("保留这段需求");
  });

  it("reads a board task once and does not keep it pending", () => {
    workbench.pendingBoardDraft = { sessionId: "preview-1", title: "验收证据检查" };
    expect(takeBoardDraft(false)).toBeNull();
    expect(workbench.pendingBoardDraft?.title).toBe("验收证据检查");
    expect(takeBoardDraft(true)?.title).toBe("验收证据检查");
    expect(workbench.pendingBoardDraft).toBeNull();
  });

  it("rejects skipping acceptance and allows one demo step", () => {
    expect(moveTask("task-nav", "done")).toBe("rejected");
    expect(workbench.tasks[0].column).toBe("planned");
    expect(moveTask("task-nav", "ready")).toBe("moved");
    expect(moveTask("task-nav", "running")).toBe("moved");
    expect(moveTask("task-nav", "acceptance")).toBe("moved");
    expect(moveTask("task-nav", "done")).toBe("rejected");
    expect(workbench.tasks[0].column).toBe("acceptance");
  });

  it("restores each session's execution mode and keeps a draft choice on the new conversation", () => {
    workbench.sessionExtras.a = { scenarioId: "prototype-to-code", experts: [], resources: [], projectId: "local-eap", executionMode: "agent" };
    workbench.sessionExtras.b = { scenarioId: null, experts: [], resources: [], projectId: null, executionMode: "chat" };
    rememberSessionExecution("a");
    expect(workbench.executionMode).toBe("agent");
    rememberSessionExecution("b");
    expect(workbench.executionMode).toBe("chat");
    setExecutionMode("plan");
    expect(workbench.sessionExtras.scratch?.executionMode).toBe("plan");
    adoptScratch("new-1");
    expect(workbench.sessionExtras["new-1"]?.executionMode).toBe("plan");
    expect(workbench.sessionExtras.scratch).toBeUndefined();
    rememberSessionExecution("a");
    expect(workbench.executionMode).toBe("agent");
  });

  it("keeps the detail panel with each conversation", () => {
    rememberPanel("a", "summary");
    rememberPanel("b", null);
    restorePanel("b");
    expect(workbench.panel).toBeNull();
    restorePanel("a");
    expect(workbench.panel).toBe("summary");
    rememberPanel("a", "changes");
    restorePanel("b");
    expect(workbench.panel).toBeNull();
    restorePanel("a");
    expect(workbench.panel).toBe("changes");
  });

  it("keeps a session on the selected local group without treating the label as a repository", () => {
    workbench.selectedProjectId = "local-eap";
    assignSessionProject("session-a", workbench.selectedProjectId);
    assignSessionProject("session-b", null);
    expect(workbench.sessionExtras["session-a"]?.projectId).toBe("local-eap");
    expect(workbench.sessionExtras["session-b"]?.projectId).toBeNull();
  });

  it("reopens a saved layout draft", () => {
    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
    const saved = saveLayoutDraft({ sidebar: false, popover: true, panel: true }, storage);
    workbench.drafts = [];
    loadLayoutDrafts(storage);
    expect(workbench.drafts[0]).toMatchObject({ id: saved.id, sidebar: false, popover: true, panel: true });
  });

  it("persists scenario and expert picks across a reload of session extras", () => {
    expect(applyScenario("prototype-to-code")).toBe(true);
    expect(addExpert("writer")).toBe(true);
    expect(currentExtras().scenarioId).toBe("prototype-to-code");
    expect(currentExtras().experts.map((item) => item.id)).toEqual(["writer"]);
    const key = [...Array(localStorage.length)].map((_, i) => localStorage.key(i)).find((item) => item?.includes("session-extras"));
    expect(key).toBeTruthy();
    const raw = localStorage.getItem(key!);
    expect(raw).toContain("prototype-to-code");
    workbench.sessionExtras = {};
    localStorage.setItem(key!, raw!);
    loadSessionExtras();
    expect(workbench.sessionExtras.scratch?.scenarioId).toBe("prototype-to-code");
    expect(workbench.sessionExtras.scratch?.experts.map((item) => item.id)).toEqual(["writer"]);
    expect(workbench.sessionExtras.scratch?.experts[0]?.guidance).toContain("整理");
  });

  it("persists the open task panel across a reload", () => {
    rememberPanel("scratch", "summary");
    expect(workbench.panel).toBe("summary");
    const key = [...Array(localStorage.length)].map((_, i) => localStorage.key(i)).find((item) => item?.includes("session-panels"));
    expect(key).toBeTruthy();
    const raw = localStorage.getItem(key!);
    expect(raw).toContain("summary");
    workbench.sessionPanels = {};
    workbench.panel = null;
    localStorage.setItem(key!, raw!);
    loadSessionPanels();
    restorePanel("scratch");
    expect(workbench.panel).toBe("summary");
    rememberPanel("scratch", "changes");
    restorePanel("scratch");
    expect(workbench.panel).toBe("changes");
  });
});
