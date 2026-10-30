// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createApp, h, nextTick, type App } from "vue";
import { runtimeApi } from "@eap/runtime-client";
import { i18n } from "../lib/i18n";
import ScenarioWorkspace from "./ScenarioWorkspace.vue";
vi.mock('grapesjs', () => { throw new Error('Canvas is browser-tested'); });
import { applyRuntimeIdentity, runtimeIdentity } from "./shell/runtimeIdentity";
import { currentExtras, scenarios, workbench } from "./shell/workbench";

const readyStatus = {
  state: "available" as const,
  provider: "mock",
  model: "gpt-test",
  configurationRevision: "t",
  lastObservedAt: null,
  errorCode: "",
  tools: { git_status: true },
  workspaceLabel: "ws-test",
  workspacePath: "J:/Code/Engineering-Automation-Platform",
  authorizedRootPath: "J:/Code/Engineering-Automation-Platform",
  authorizedRootDenial: "",
  storesUserDirectoryGrants: false,
  verificationEnabled: false,
  verificationCommands: [] as string[],
};

let app: App | undefined;
let root: HTMLDivElement | undefined;
const preview = workbench.preview;

afterEach(() => {
  app?.unmount();
  root?.remove();
  vi.restoreAllMocks();
  runtimeIdentity.value = null;
  workbench.preview = preview;
  workbench.workMode = "code";
  workbench.selectedScenario = "prototype-to-code";
  workbench.notice = "";
  workbench.executionMode = "chat";
  workbench.sessionExtras = {};
  for (let i = scenarios.length - 1; i >= 0; i -= 1) {
    if (scenarios[i]?.builtin === false) scenarios.splice(i, 1);
  }
});

async function mount() {
  workbench.preview = true;
  vi.spyOn(runtimeApi, 'aiStatus').mockResolvedValue(readyStatus);
  vi.spyOn(runtimeApi, 'workspaceDirty').mockResolvedValue({ requested: false, count: 0, paths: [], denial: 'TEST_ONLY', detail: '' });
  vi.spyOn(runtimeApi, 'prototypeVersions').mockResolvedValue({ items: [] });
  vi.spyOn(runtimeApi, 'workspaceBaseline').mockResolvedValue({ path: '', exists: false, baseHash: '', denial: 'TEST_ONLY' });
  vi.spyOn(runtimeApi, 'workspaceSource').mockResolvedValue({ path: '', exists: false, baseHash: '', bytes: 0, excerpt: '', denial: 'TEST_ONLY' });
  root = document.createElement("div");
  document.body.append(root);
  const navigated: string[] = [];
  app = createApp({ render: () => h(ScenarioWorkspace, { builderEnabled: true, chatEnabled: true, onNavigate: (id: string) => navigated.push(id) }) });
  app.use(i18n).mount(root);
  await nextTick();
  return navigated;
}

async function openSelectedDetail() {
  const id = workbench.selectedScenario;
  const open = root!.querySelector(`[data-testid=scene-open-detail][data-scene-id="${id}"]`) as HTMLButtonElement | null;
  open?.click();
  await nextTick();
}

it('opens copied scenes for editing and keeps at least one supported work mode', async () => {
  await mount();
  (root!.querySelector('[data-testid="scene-copy"]') as HTMLButtonElement).click(); await nextTick();
  expect(root!.querySelector('[data-testid="scene-basic-fields"]')).not.toBeNull();
  const scene = scenarios.find(item => item.id === workbench.selectedScenario)!;
  expect(scene.builtin).toBe(false);
  const code = root!.querySelector('[data-testid="scene-mode-code"]') as HTMLInputElement;
  const work = root!.querySelector('[data-testid="scene-mode-work"]') as HTMLInputElement;
  expect(code.disabled).toBe(false); expect(work.disabled).toBe(false);
  work.click(); await nextTick();
  expect(scene.modes).toEqual(['code']); expect(code.disabled).toBe(true);
  work.click(); await nextTick(); code.click(); await nextTick();
  expect(scene.modes).toEqual(['work']); expect(work.disabled).toBe(true);
  expect(scenarios.find(item => item.id === 'prototype-to-code')!.modes).toEqual(['code', 'work']);
});

it('returns to the originating Work conversation instead of changing to Code', async () => {
  const original = workbench.origin; workbench.origin = 'work';
  try {
    const navigated = await mount();
    (root!.querySelector('[data-testid="back-to-chat-from-scenes"]') as HTMLButtonElement).click();
    expect(navigated).toEqual(['work']);
  } finally { workbench.origin = original; }
});

it('locates repository dependencies in sources rather than unrelated model settings', async () => {
  workbench.selectedScenario = 'code-review';
  const origin = workbench.origin, panel = workbench.panel;
  workbench.origin = 'work';
  try {
    const navigated = await mount(); await openSelectedDetail();
    (root!.querySelector('[data-testid="dep-manual"]') as HTMLButtonElement).click(); await nextTick();
    expect(navigated).toEqual(['work']); expect(workbench.panel).toBe('files');
  } finally { workbench.origin = origin; workbench.panel = panel; workbench.sessionPanels = {}; }
});

it("locates a missing dependency and applies the scene without installing or widening access", async () => {
  workbench.workMode = "code";
  workbench.selectedScenario = "code-review";
  workbench.executionMode = "chat";
  workbench.sessionExtras.scratch = { scenarioId: null, experts: [], resources: ["keep"], projectId: null, executionMode: "chat" };
  const states = scenarios.map((item) => item.dependencies.map((dep) => `${dep.name}:${dep.state}`).join("|"));
  const navigated = await mount();
  expect(root!.querySelector("[data-testid=scene-tab-local]")?.getAttribute("aria-selected")).toBe("true");
  expect(root!.querySelector("[data-testid=scene-card-grid]")).not.toBeNull();
  (root!.querySelector("[data-testid=scene-tab-market]") as HTMLButtonElement).click();
  await nextTick();
  expect(root!.querySelector("[data-testid=scene-market-empty]")?.textContent).toMatch(/市场未|marketplace is not/);
  (root!.querySelector("[data-testid=scene-tab-local]") as HTMLButtonElement).click();
  await nextTick();
  const openDetail = [...root!.querySelectorAll("[data-testid=scene-open-detail]")].find((item) =>
    item.closest("li")?.textContent?.includes("代码审阅"),
  ) as HTMLButtonElement;
  openDetail.click();
  await nextTick();
  expect(root!.querySelector("[data-testid=scene-detail-view]")).not.toBeNull();
  expect(root!.querySelector("[data-testid=preset-save-off]")?.tagName).toBe("SPAN");
  expect(root!.querySelector("[data-testid=scene-upload-off]")?.tagName).toBe("SPAN");
  expect(root!.querySelector("[data-testid=scene-copy]")?.tagName).toBe("BUTTON");
  expect((root!.querySelector("[data-testid=scene-delete]") as HTMLButtonElement).disabled).toBe(true);
  expect(root!.querySelector("[data-testid=scene-modes]")?.textContent).toMatch(/Code/);
  expect(root!.querySelector("[data-testid=scene-policy-row]")?.textContent).toMatch(/工具范围|Tool range/);
  expect(root!.querySelector("[data-testid=scene-detail-tabs]")).not.toBeNull();
  expect(root!.querySelector("[data-testid=scene-tab-basic]")?.getAttribute("aria-selected")).toBe("true");
  expect(root!.querySelector("[data-testid=scene-tab-tools]")?.textContent).toMatch(/0\/\d+/);
  expect(root!.querySelector("[data-testid=scene-tab-skills]")?.textContent).toMatch(/0\/\d+/);
  expect(root!.querySelector("[data-testid=scene-tab-mcp]")?.textContent).toMatch(/0\/\d+/);
  expect(root!.querySelector("[data-testid=scene-dep-banner]")?.textContent).toMatch(/不可用|unavailable/);
  (root!.querySelector("[data-testid=scene-tab-skills]") as HTMLButtonElement).click();
  await nextTick();
  expect(root!.querySelector("[data-testid=skills-empty]")?.textContent).toMatch(/技能目录未接通|Skills catalog is not connected/);
  (root!.querySelector("[data-testid=scene-tab-mcp]") as HTMLButtonElement).click();
  await nextTick();
  expect(root!.querySelector("[data-testid=mcp-empty]")?.textContent).toMatch(/MCP 未接通|MCP is not connected/);
  (root!.querySelector("[data-testid=scene-tab-basic]") as HTMLButtonElement).click();
  await nextTick();
  expect(root!.querySelector("[data-testid=scene-basic-fields]")).not.toBeNull();
  const locate = [...root!.querySelectorAll("button")].find((item) => item.textContent === "查看位置");
  locate!.click();
  await nextTick();
  expect(root!.textContent).toMatch(/会话源文件面板/);
  (root!.querySelector("[data-testid=apply-scenario]") as HTMLButtonElement).click();
  await nextTick();
  expect(currentExtras().scenarioId).toBe("code-review");
  expect(currentExtras().resources).toEqual(["keep"]);
  expect(currentExtras().experts).toEqual([]);
  expect(workbench.executionMode).toBe("chat");
  expect(scenarios.map((item) => item.dependencies.map((dep) => `${dep.name}:${dep.state}`).join("|"))).toEqual(states);
  expect(root!.textContent).toContain("没有安装插件，也没有扩大权限");
  expect(navigated).toEqual(["chat"]);
});

it("keeps a globally disabled scene from being applied", async () => {
  workbench.workMode = "work";
  workbench.selectedScenario = "policy-analysis";
  workbench.sessionExtras.scratch = { scenarioId: null, experts: [], resources: [], projectId: null };
  await mount();
  await openSelectedDetail();
  expect(root!.querySelector("[data-testid=create-scene]")).toBeNull();
  const apply = root!.querySelector("[data-testid=apply-scenario]") as HTMLButtonElement;
  expect(apply.disabled).toBe(true);
  apply.click();
  await nextTick();
  expect(currentExtras().scenarioId).toBeNull();
  const locate = [...root!.querySelectorAll("button")].find((item) => item.textContent === "查看位置");
  locate!.click();
  await nextTick();
  expect(root!.textContent).toContain("全局未开放");
});

it("creates a blank custom scenario from the local catalog", async () => {
  workbench.workMode = "work";
  await mount();
  const before = scenarios.length;
  (root!.querySelector("[data-testid=create-scene]") as HTMLButtonElement).click();
  await nextTick();
  expect(scenarios.length).toBe(before + 1);
  expect(root!.querySelector("[data-testid=scene-detail-view]")).not.toBeNull();
  expect(scenarios.find((item) => item.id === workbench.selectedScenario)?.builtin).toBe(false);
});

it("keeps preset delete disabled and removes only in-page custom scenes", async () => {
  workbench.workMode = "work";
  await mount();
  const presetDelete = root!.querySelector('[data-testid=scene-delete][data-scene-id="doc-writing"]') as HTMLButtonElement;
  expect(presetDelete.disabled).toBe(true);
  expect(presetDelete.title).toMatch(/不可删除|cannot be deleted/i);
  expect(root!.querySelector('[data-testid=scene-copy][data-scene-id="doc-writing"]')).not.toBeNull();
  (root!.querySelector("[data-testid=create-scene]") as HTMLButtonElement).click();
  await nextTick();
  const customId = workbench.selectedScenario;
  (root!.querySelector("[data-testid=scene-back-list]") as HTMLButtonElement).click();
  await nextTick();
  const before = scenarios.length;
  (root!.querySelector(`[data-testid=scene-delete][data-scene-id="${customId}"]`) as HTMLButtonElement).click();
  await nextTick();
  expect(scenarios.length).toBe(before - 1);
  expect(scenarios.some((item) => item.id === customId)).toBe(false);
  expect(root!.querySelector("[data-testid=scene-notice]")?.textContent).toMatch(/已删除|Removed/);
});

it('uses the same design and delivery surface in mock mode without bypassing gates', async () => {
  workbench.selectedScenario = 'prototype-to-code';
  await mount();
  await openSelectedDetail();
  await vi.waitFor(() => expect(root!.querySelector('[data-testid="delivery-gate"]')).not.toBeNull());
  expect(root!.querySelector('[data-testid="prototype-flow"]')).toBeNull();
  await vi.waitFor(() => expect(root!.querySelector('[data-testid="layout-draft"]')).not.toBeNull());
  expect(root!.querySelector('[data-testid="scenario-version"]')).not.toBeNull();
  expect((root!.querySelector('[data-testid="scenario-develop"]') as HTMLButtonElement).disabled).toBe(true);
  expect(runtimeApi.prototypeVersions).toHaveBeenCalled();
  expect(runtimeApi.workspaceBaseline).toHaveBeenCalled();
});

it("keeps the mock prototype flow out of live service mode", async () => {
  workbench.preview = false;
  workbench.selectedScenario = "prototype-to-code";
  applyRuntimeIdentity({
    state: "disabled",
    provider: "none",
    model: "",
    configurationRevision: "t",
    lastObservedAt: null,
    errorCode: "",
    tools: { git_status: true },
    workspaceLabel: "ws-test",
    workspacePath: "J:/Code/Engineering-Automation-Platform",
    authorizedRootPath: "J:/Code/Engineering-Automation-Platform",
    authorizedRootDenial: "",
    storesUserDirectoryGrants: false,
    verificationEnabled: false,
    verificationCommands: [],
  });
  vi.spyOn(runtimeApi, "aiStatus").mockResolvedValue({
    state: "disabled",
    provider: "none",
    model: "",
    configurationRevision: "t",
    lastObservedAt: null,
    errorCode: "",
    tools: { git_status: true },
    workspaceLabel: "ws-test",
    workspacePath: "J:/Code/Engineering-Automation-Platform",
    authorizedRootPath: "J:/Code/Engineering-Automation-Platform",
    authorizedRootDenial: "",
    storesUserDirectoryGrants: false,
    verificationEnabled: false,
    verificationCommands: [],
  });
  vi.spyOn(runtimeApi, "prototypeVersions").mockResolvedValue({ items: [] });
  vi.spyOn(runtimeApi, "workspaceBaseline").mockResolvedValue({
    path: "frontend/apps/web/src/features/chat/TaskComposer.vue",
    exists: true,
    baseHash: "abc123def4567890",
    denial: "",
  });
  vi.spyOn(runtimeApi, "workspaceSource").mockResolvedValue({
    path: "frontend/apps/web/src/features/chat/TaskComposer.vue",
    exists: true,
    baseHash: "abc123def456",
    bytes: 1200,
    excerpt: "<script setup lang=\"ts\">",
    denial: "",
  });
  vi.spyOn(runtimeApi, "workspaceDirty").mockResolvedValue({
    requested: true,
    denial: "",
    count: 0,
    paths: [],
    detail: "",
  });
  const probe = vi.spyOn(runtimeApi, "workspaceVerificationProbe").mockResolvedValue({
    requested: true,
    denial: "",
    name: "git-version-probe",
    exitCode: 0,
    summary: "git version 2.45.0",
  });
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render: () => h(ScenarioWorkspace, { builderEnabled: true, chatEnabled: true, onNavigate: () => {} }) });
  app.use(i18n).mount(root);
  await nextTick();
  await openSelectedDetail();
  await vi.waitFor(() => expect(root!.querySelector('[data-testid="live-baseline"]')?.textContent).toContain("abc123def456"));
  await vi.waitFor(() => expect(root!.querySelector('[data-testid="live-source"]')?.textContent).toContain("1200"));
  expect(root.querySelector('[data-testid="live-source-excerpt"]')?.textContent).toContain("<script setup");
  expect(root.querySelector('[data-testid="prototype-flow"]')).toBeNull();
  expect(root.querySelector('[data-testid="delivery-gate"]')).toBeTruthy();
  await vi.waitFor(() => expect(root!.querySelector('[data-testid="layout-draft"]')).toBeTruthy());
  expect(root.querySelector('[data-testid="layout-draft-boundary"]')).toBeNull();
  expect(root.querySelector('[data-testid="scene-scope-status"]')?.textContent).toMatch(/技能未接通|Skills off/);
  expect(root.querySelector('[data-testid="scene-scope-status"]')?.textContent).toMatch(/MCP 未接通|MCP off/);
  expect(root.querySelector('[data-testid="scene-scope"]')).toBeNull();
  expect(root.querySelector('[data-testid="delivery-gate"]')?.textContent).not.toMatch(/源码：未读取|Source: not read/);
  expect(root.querySelector('[data-testid="live-repo-identity"]')?.textContent).toMatch(/进程绑定根|process-bound/i);
  expect(root.querySelector('[data-testid="host-notes"]')).toBeNull();
  expect(root.querySelector('[data-testid="no-user-grant-store"]')).toBeNull();
  expect(root.querySelector('[data-testid="scene-dependencies"]')?.textContent).toMatch(/本地服务进程绑定根 · 已提供|process-bound root · Provided/i);
  expect(root.querySelector('[data-testid="scene-dependencies"]')?.textContent).toMatch(/生成前文件快照 · 已提供|Provided/i);
  expect(root.querySelector('[data-testid="delivery-gate"]')?.textContent).not.toMatch(/本机文件桥未接通：使用方|Local file bridge is missing: operator/);
  await vi.waitFor(() => expect(root!.querySelector('[data-testid="live-dirty"]')?.textContent).toMatch(/脏文件：无|clean|no dirty/i));
  expect(root.querySelector('[data-testid="live-verification"]')?.textContent).toMatch(/未启用|verification\.enabled=false|Verification config: off/i);
  expect(root.querySelector('[data-testid="live-verification-probe"]')?.textContent).toMatch(/未请求|not requested/i);
  (root.querySelector('[data-testid="run-verification-probe"]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(probe).toHaveBeenCalled());
  await vi.waitFor(() => expect(root!.querySelector('[data-testid="live-verification-probe"]')?.textContent).toMatch(/git-version-probe.*0|exit 0/i));
  expect(root.querySelector('[data-testid="live-verification-probe"]')?.textContent).toMatch(/不代表应用验证通过|not apply verification/i);
  expect(root.querySelector('[data-testid="live-preview"]')?.textContent).toMatch(/可打开本机 UI|open local UI/i);
  expect(root.querySelector('[data-testid="live-preview-link"]')?.getAttribute("href")).toMatch(/\/#chat$/);
  expect(root.querySelector('[data-testid="acceptance-status"]')?.textContent).toMatch(/交互验收：未完成|Interaction acceptance: open/);
  expect(root.querySelector('[data-testid="acceptance-checklist"]')).toBeTruthy();
  expect(root.querySelector('[data-testid="accept-preview"]')).toBeTruthy();
  expect(root.querySelector('[data-testid="delivery-gate-list"]')?.textContent).toMatch(/没有已确认的设计版本|No accepted design version/);
  expect(root.querySelector('[data-testid="delivery-gate-list"]')?.textContent).toMatch(/没有可用的模型连接|No usable model connection/);
  expect(root.querySelector('[data-testid="gate-open-versions"]')).toBeTruthy();
  expect(root.querySelector('[data-testid="gate-open-model"]')).toBeTruthy();
  expect((root.querySelector('[data-testid="apply-scenario"]') as HTMLButtonElement).disabled).toBe(true);
  expect(root.querySelector('[data-testid="prep-blocked"]')).toBeTruthy();
});

it("hands a selected prototype version into code chat when delivery gates are open", async () => {
  workbench.preview = false;
  workbench.selectedScenario = "prototype-to-code";
  workbench.sessionExtras.scratch = { scenarioId: null, experts: [], resources: [], projectId: null, executionMode: "chat" };
  sessionStorage.clear();
  applyRuntimeIdentity(readyStatus);
  vi.spyOn(runtimeApi, "aiStatus").mockResolvedValue(readyStatus);
  vi.spyOn(runtimeApi, "prototypeVersions").mockResolvedValue({
    items: [{
      id: "saved-version",
      sourceRef: "builder-alpha",
      title: "Saved layout",
      body: "{}",
      buttonPresses: 0,
      interaction: "",
      acceptance: [],
      contentHash: "hash",
    }],
  });
  vi.spyOn(runtimeApi, "workspaceBaseline").mockResolvedValue({
    path: "frontend/apps/web/src/features/chat/TaskComposer.vue",
    exists: true,
    baseHash: "abc123def4567890",
    denial: "",
  });
  vi.spyOn(runtimeApi, "workspaceSource").mockResolvedValue({
    path: "frontend/apps/web/src/features/chat/TaskComposer.vue",
    exists: true,
    baseHash: "abc123def456",
    bytes: 1200,
    excerpt: "<script setup lang=\"ts\">",
    denial: "",
  });
  vi.spyOn(runtimeApi, "workspaceDirty").mockResolvedValue({
    requested: true,
    denial: "",
    count: 0,
    paths: [],
    detail: "",
  });
  const navigated: string[] = [];
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({
    render: () => h(ScenarioWorkspace, {
      builderEnabled: true,
      chatEnabled: true,
      onNavigate: (id: string) => navigated.push(id),
    }),
  });
  app.use(i18n).mount(root);
  await nextTick();
  await openSelectedDetail();
  await vi.waitFor(() => expect(root!.querySelectorAll('[data-testid="scenario-version"] option').length).toBeGreaterThan(1));
  await vi.waitFor(() => expect(root!.querySelector('[data-testid="live-baseline"]')?.textContent).toContain("abc123def456"));
  const select = root.querySelector('[data-testid="scenario-version"]') as HTMLSelectElement;
  select.value = "saved-version";
  select.dispatchEvent(new Event("change"));
  await nextTick();
  expect(root.querySelector('[data-testid="delivery-gate-list"]')?.textContent || "").not.toMatch(/没有已确认的设计版本|No accepted design version/);
  await vi.waitFor(() => expect(root!.querySelector('[data-testid="prep-blocked"]')).toBeNull());
  const develop = root.querySelector('[data-testid="scenario-develop"]') as HTMLButtonElement;
  expect(develop.disabled).toBe(false);
  develop.click();
  await nextTick();
  expect(sessionStorage.getItem("eap.chat.prototype")).toBe("saved-version");
  expect(navigated).toEqual(["chat"]);
  expect(currentExtras().scenarioId).toBe("prototype-to-code");
  expect(currentExtras().delivery?.versionId).toBe("saved-version");
  expect(currentExtras().delivery?.pagePath).toContain("TaskComposer.vue");
  expect(workbench.workMode).toBe("code");
});
