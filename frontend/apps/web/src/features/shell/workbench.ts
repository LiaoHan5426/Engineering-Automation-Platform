import { reactive, shallowRef, watch } from "vue";
import type { CodeProposal } from '@eap/runtime-client';
import { useMockServices } from '../../lib/serviceConfig';

export type ExecutionMode = "chat" | "plan" | "agent";
export type WorkMode = "code" | "work";
export type PanelId = "summary" | "changes" | "files" | "terminal" | null;
export type BoardColumn = "planned" | "ready" | "running" | "acceptance" | "done";

export type DeliveryInput = { versionId: string; pagePath: string; pageLabel: string };

export type SessionExtras = { scenarioId: string | null; experts: CatalogExpert[]; resources: string[]; projectId: string | null; executionMode?: ExecutionMode; delivery?: DeliveryInput };

export {
  localProjectState as localProjects,
  projectLabel,
  projectIntendedPath,
  selectLocalProject,
  updateProjectIntendedPath,
  createLocalProject,
  renameLocalProject,
  removeLocalProject,
} from "./localProjects";
import { localProjectState, selectLocalProject } from "./localProjects";

export function sessionProjectId(id: string | null | undefined) {
  if (!id) return null;
  return workbench.sessionExtras[id]?.projectId ?? null;
}

export function assignSessionProject(id: string, projectId: string | null) {
  const current = workbench.sessionExtras[id] ?? { scenarioId: null, experts: [], resources: [], projectId: null };
  current.resources ??= [];
  current.projectId = projectId;
  workbench.sessionExtras[id] = current;
  return current;
}

/** Drop local-group bindings when a group label is deleted; sessions become unbound. */
export function detachSessionsFromProject(projectId: string) {
  for (const extras of Object.values(workbench.sessionExtras)) {
    if (extras.projectId === projectId) extras.projectId = null;
  }
}

export type ChatBinding = {
  history: Array<{ id: string; title: string; archived: boolean; updatedAt?: string }>;
  activeId: string | null;
  busyIds?: string[];
  rename?: (id: string) => void;
  archive?: (id: string) => void;
  remove?: (id: string) => void;
  references: string[];
  localFiles?: string[];
  versionId?: string;
  draft: string;
  sending: boolean;
  workspaceLabel: string;
  memory: string;
  model: string;
  connectionName: string;
  approval: string;
  goal: string;
  executionMode: string;
  scenarioId: string | null;
  proposalFiles: string[];
  appliedFiles?: string[];
  proposal?: CodeProposal | null;
  writeRefused?: boolean;
  verification: string;
  verificationChecks?: Array<{ name: string; exitCode: number | null; summary: string }>;
  select: (id: string) => void;
  create: () => void;
};

export type ScenarioStatus = "partial" | "missing" | "disabled";

export type Scenario = {
  builtin?: boolean;
  workflow?: 'prototype-to-code';
  id: string;
  name: string;
  status: ScenarioStatus;
  modes: Array<WorkMode>;
  summary: string;
  instructions: string;
  tools: string[];
  skills: string[];
  mcp: string[];
  dependencies: Array<{ name: string; state: "installed" | "missing" | "unconfigured" | "denied"; where: string }>;
};

export type CatalogExpert = {
  id: string;
  name: string;
  category: string;
  version: string;
  resources: string;
  guidance: string;
  mine: boolean;
  /** Shown but not selectable; mirrors frame-064 coming-soon experts. */
  comingSoon?: boolean;
};

export type BoardTask = {
  id: string;
  title: string;
  column: BoardColumn;
  note: string;
};

export type LayoutDraft = {
  id: string;
  savedAt: string;
  sidebar: boolean;
  popover: boolean;
  panel: boolean;
  title?: string;
  placeholder?: string;
  sidebarWidth?: number;
  accent?: string;
  acceptance?: string[];
};

export const scenarios = reactive<Scenario[]>([
  {
    id: "prototype-to-code",
    workflow: 'prototype-to-code',
    name: "原型到代码",
    status: "partial",
    modes: ["code", "work"],
    summary: "对照现有页面做可点击布局草案，确认后再谈实现。",
    instructions: "先选定仓库与页面，保存设计版本，再读取相关源码。缺条件时停在本页。",
    tools: ["仓库只读（未接通）", "候选写入（需逐次确认）"],
    skills: [],
    mcp: [],
    dependencies: [
      { name: "Builder 原型编辑", state: "installed", where: "本页设计步骤。切换场景不会安装插件。" },
      { name: "本地服务进程绑定根", state: "unconfigured", where: "本页开发准备。空配置时 colocated 应绑定检测工作区；未绑定时不能代持远端授权库。" },
      { name: "生成前文件快照", state: "missing", where: "本页开发准备的基线哈希，当前为未知。" },
    ],
  },
  {
    id: "code-review",
    name: "代码审阅",
    status: "missing",
    modes: ["code"],
    summary: "审阅已有改动。仓库 diff 尚未接通。",
    instructions: "只读查看候选与目录中原有修改。当前没有独立审查器。",
    tools: ["git diff（未接通）"],
    skills: [],
    mcp: [],
    dependencies: [
      { name: "授权仓库读取", state: "installed", where: "会话源文件面板 · 只读浏览已接通，查看不授予写入。" },
      { name: "仓库 diff 审阅", state: "missing", where: "会话源文件面板 · 候选与变更面；独立 diff 审阅器未接通。" },
    ],
  },
  {
    id: "free-explore",
    name: "自由探索",
    status: "partial",
    modes: ["work", "code"],
    summary: "自己决定怎么做；不预装技能或 MCP。",
    instructions: "没有固定工作指引。选用后仍须自行选择模型与审批策略。",
    tools: [],
    skills: [],
    mcp: [],
    dependencies: [],
  },
  {
    id: 'project-report', name: '项目文档编写', status: 'partial', modes: ['work'],
    summary: '从已有材料整理项目说明与交付清单。', instructions: '先明确受众和输出格式，再整理资料；演示不会导出真实文档。',
    tools: ['文档整理（模拟）'], skills: [], mcp: [], dependencies: [{ name: '文档输出（模拟）', state: 'installed', where: '仅页面内模拟，不会导出文件。' }],
  },
  {
    id: "doc-writing",
    name: "文档编写",
    status: "partial",
    modes: ["work"],
    summary: "文档编写与转换：覆盖 docx/pdf/pptx/xlsx；缺技能时跳过对应能力。",
    instructions: "可选用；缺依赖的导出能力不会接通，不会写入本机文件。",
    tools: ["文档导出（未接通）"],
    skills: ["doc", "pdf", "pptx", "xlsx"],
    mcp: [],
    dependencies: [
      { name: "skill doc", state: "missing", where: "场景声明的文档技能；未安装，不会导出。" },
      { name: "skill pdf", state: "missing", where: "场景声明的 PDF 技能；未安装，会跳过。" },
      { name: "skill pptx", state: "missing", where: "场景声明的演示文稿技能；未安装，会跳过。" },
      { name: "skill xlsx", state: "missing", where: "场景声明的表格技能；未安装，会跳过。" },
    ],
  },
  {
    id: "policy-analysis",
    name: "政策分析",
    status: "disabled",
    modes: ["work"],
    summary: "看原文、看变化。敬请期待。",
    instructions: "场景未开放，不能应用到会话。",
    tools: [],
    skills: [],
    mcp: [],
    dependencies: [{ name: "政策分析插件", state: "denied", where: "全局未开放。" }],
  },
  {
    id: "competitive-analysis",
    name: "竞品分析",
    status: "disabled",
    modes: ["work"],
    summary: "产品、市场、研发与业绩。敬请期待。",
    instructions: "场景未开放，不能应用到会话。",
    tools: [],
    skills: [],
    mcp: [],
    dependencies: [{ name: "竞品分析插件", state: "denied", where: "全局未开放。" }],
  },
  {
    id: "internal-office",
    name: "对内办公",
    status: "disabled",
    modes: ["work"],
    summary: "写日志、搭云效，敬请期待。",
    instructions: "场景未开放，不能应用到会话。",
    tools: [],
    skills: [],
    mcp: [],
    dependencies: [{ name: "对内办公插件", state: "denied", where: "全局未开放。" }],
  },
]);

export const expertCatalog: CatalogExpert[] = [
  { id: "fe-vue", name: "前端实现", category: "工程", version: "demo-1", resources: "未接入仓库读取", guidance: "复用现有 Vue 组件，不新建空壳。", mine: true },
  { id: "reviewer", name: "代码审阅", category: "质量", version: "demo-1", resources: "只读候选 diff", guidance: "指出最小修改和已有脏文件。", mine: false },
  { id: "writer", name: "文档整理", category: "办公", version: "demo-1", resources: "无外部工具", guidance: "只整理已给出的材料。", mine: true },
  { id: "policy-kb", name: "公司政策知识专家", category: "办公", version: "demo-0", resources: "知识库未接入", guidance: "敬请期待；不能加入当前任务。", mine: false, comingSoon: true },
];

const columns: BoardColumn[] = ["planned", "ready", "running", "acceptance", "done"];

export const chatBinding = shallowRef<ChatBinding | null>(null);

/** First self-validation delivery page; generation-prep only, not a write grant. */
export const DELIVERY_TARGET_PATH = "frontend/apps/web/src/features/chat/TaskComposer.vue";

export const workbench = reactive({
  preview: useMockServices,
  workMode: "code" as WorkMode,
  executionMode: "chat" as ExecutionMode,
  panel: null as PanelId,
  sidebarOpen: false,
  origin: "chat",
  pendingNewChat: false,
  /** Seeded into the draft once after pendingNewChat / create(). Cleared after apply. */
  pendingDraft: "",
  get selectedProjectId() { return localProjectState.selectedId; },
  set selectedProjectId(id: string | null) { selectLocalProject(id); },
  pendingMockHandoff: false,
  pendingBoardDraft: null as { sessionId: string; title: string } | null,
  modelMenuToken: 0,
  policyMenuToken: 0,
  notice: "",
  selectedScenario: "prototype-to-code",
  deliveryTargetPath: DELIVERY_TARGET_PATH,
  sessionExtras: {} as Record<string, SessionExtras>,
  tasks: [
    { id: "task-nav", title: "调整设置侧栏与输入框", column: "planned" as BoardColumn, note: "" },
    { id: "task-sql", title: "保留 SQL 分析工作台", column: "ready" as BoardColumn, note: "" },
  ],
  drafts: [] as LayoutDraft[],
  layoutEditor: { sidebar: true, popover: false, panel: false, title: 'EAP Workspace', placeholder: 'Describe a task…', sidebarWidth: 120, accent: '#347f70' },
  sessionPanels: {} as Record<string, PanelId>,
});

export function sessionKey() {
  return chatBinding.value?.activeId ?? "scratch";
}

export function rememberPanel(id: string | null, panel: PanelId) {
  workbench.sessionPanels[id ?? "scratch"] = panel;
  workbench.panel = panel;
}

export function restorePanel(id: string | null) {
  workbench.panel = workbench.sessionPanels[id ?? "scratch"] ?? null;
}

export function rememberSessionExecution(id: string | null) {
  workbench.executionMode = workbench.sessionExtras[id ?? "scratch"]?.executionMode ?? "chat";
}

export function adoptScratch(id: string) {
  const scratch = workbench.sessionExtras.scratch;
  const current = workbench.sessionExtras[id] ?? { scenarioId: null, experts: [], resources: [], projectId: null };
  if (scratch?.executionMode && !current.executionMode) current.executionMode = scratch.executionMode;
  if (scratch?.scenarioId && !current.scenarioId) current.scenarioId = scratch.scenarioId;
  if (scratch && scratch.experts.length > 0 && current.experts.length === 0) current.experts = [...scratch.experts];
  if (scratch?.delivery && !current.delivery) current.delivery = scratch.delivery;
  current.resources ??= [];
  if (scratch) current.projectId = scratch.projectId ?? null;
  else current.projectId ??= null;
  workbench.sessionExtras[id] = current;
  if (scratch) delete workbench.sessionExtras.scratch;
  workbench.executionMode = current.executionMode ?? "chat";
  if (Object.prototype.hasOwnProperty.call(workbench.sessionPanels, "scratch") && workbench.sessionPanels[id] === undefined) {
    workbench.sessionPanels[id] = workbench.sessionPanels.scratch ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(workbench.sessionPanels, "scratch")) delete workbench.sessionPanels.scratch;
}

export function takeBoardDraft(active: boolean) {
  if (!active || !workbench.pendingBoardDraft) return null;
  const draft = workbench.pendingBoardDraft;
  workbench.pendingBoardDraft = null;
  return draft;
}

export function setExecutionMode(mode: ExecutionMode) {
  workbench.executionMode = mode;
  currentExtras().executionMode = mode;
}

export function currentExtras() {
  const key = sessionKey();
  const current = workbench.sessionExtras[key] ?? { scenarioId: null, experts: [], resources: [], projectId: null };
  current.resources ??= [];
  current.projectId ??= null;
  workbench.sessionExtras[key] = current;
  return current;
}

export function toggleResource(id: string) {
  const extras = currentExtras();
  extras.resources = extras.resources.includes(id) ? extras.resources.filter((item) => item !== id) : [...extras.resources, id];
}

export function applyScenario(id: string) {
  const scenario = scenarios.find((item) => item.id === id);
  if (!scenario || scenario.status === "disabled" || !scenario.modes.includes(workbench.workMode)) return false;
  currentExtras().scenarioId = id;
  workbench.notice = "applied";
  return true;
}

export function addExpert(id: string) {
  const expert = expertCatalog.find((item) => item.id === id);
  if (!expert || expert.comingSoon) return false;
  const extras = currentExtras();
  if (!extras.experts.some((item) => item.id === id)) extras.experts = [...extras.experts, expert];
  workbench.notice = "expert";
  return true;
}

export function removeExpert(id: string) {
  const extras = currentExtras();
  extras.experts = extras.experts.filter((item) => item.id !== id);
}

export function moveTask(id: string, column: BoardColumn) {
  const task = workbench.tasks.find((item) => item.id === id);
  if (!task) return "missing";
  const from = columns.indexOf(task.column);
  const to = columns.indexOf(column);
  if (column === "done") {
    task.note = "rejected";
    return "rejected";
  }
  if (Math.abs(to - from) > 1) {
    task.note = "rejected";
    return "rejected";
  }
  task.column = column;
  task.note = "moved";
  return "moved";
}

const DRAFT_KEY = "eap.layout-draft.v1";
const EXTRAS_KEY = useMockServices ? "mock.eap.session-extras.v1" : "eap.session-extras.v1";
const PANELS_KEY = useMockServices ? "mock.eap.session-panels.v1" : "eap.session-panels.v1";
const EXTRAS_LIMIT = 40;
const PANEL_VALUES = new Set(["summary", "changes", "files", "terminal"]);

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function readExpert(raw: unknown): CatalogExpert | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  const known = expertCatalog.find((item) => item.id === row.id);
  if (known) return { ...known };
  if (typeof row.name !== "string" || !row.name.trim()) return null;
  return {
    id: row.id.trim().slice(0, 64),
    name: row.name.trim().slice(0, 80),
    category: typeof row.category === "string" ? row.category.slice(0, 40) : "",
    version: typeof row.version === "string" ? row.version.slice(0, 40) : "",
    resources: typeof row.resources === "string" ? row.resources.slice(0, 120) : "",
    guidance: typeof row.guidance === "string" ? row.guidance.slice(0, 240) : "",
    mine: row.mine === true,
  };
}

function readDelivery(raw: unknown): DeliveryInput | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  if (typeof row.versionId !== "string" || typeof row.pagePath !== "string" || typeof row.pageLabel !== "string") return undefined;
  return {
    versionId: row.versionId.slice(0, 80),
    pagePath: row.pagePath.slice(0, 260),
    pageLabel: row.pageLabel.slice(0, 120),
  };
}

function readExtras(raw: unknown): SessionExtras | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const execution = row.executionMode;
  return {
    scenarioId: typeof row.scenarioId === "string" && row.scenarioId ? row.scenarioId.slice(0, 64) : null,
    experts: Array.isArray(row.experts) ? row.experts.flatMap((item) => { const expert = readExpert(item); return expert ? [expert] : []; }).slice(0, 12) : [],
    resources: Array.isArray(row.resources) ? row.resources.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 64)).slice(0, 32) : [],
    projectId: typeof row.projectId === "string" && row.projectId ? row.projectId.slice(0, 64) : null,
    executionMode: execution === "chat" || execution === "plan" || execution === "agent" ? execution : undefined,
    delivery: readDelivery(row.delivery),
  };
}

/** UI preference only — never a write grant or process cwd. */
export function loadSessionExtras(storage: Pick<Storage, "getItem"> | undefined = browserStorage()) {
  try {
    const parsed = JSON.parse(storage?.getItem(EXTRAS_KEY) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      workbench.sessionExtras = {};
      return;
    }
    const next: Record<string, SessionExtras> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id !== "string" || !id.trim() || id.length > 128) continue;
      const extras = readExtras(value);
      if (extras) next[id] = extras;
    }
    workbench.sessionExtras = next;
  } catch {
    workbench.sessionExtras = {};
  }
}

export function persistSessionExtras(storage: Pick<Storage, "setItem"> | undefined = browserStorage()) {
  try {
    const entries = Object.entries(workbench.sessionExtras).slice(-EXTRAS_LIMIT);
    storage?.setItem(EXTRAS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* 本机存储失败时仍保留内存副本 */
  }
}

loadSessionExtras();
watch(() => workbench.sessionExtras, () => persistSessionExtras(), { deep: true, flush: "sync" });

/** UI preference only — which task panel was open for a conversation. */
export function loadSessionPanels(storage: Pick<Storage, "getItem"> | undefined = browserStorage()) {
  try {
    const parsed = JSON.parse(storage?.getItem(PANELS_KEY) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      workbench.sessionPanels = {};
      return;
    }
    const next: Record<string, PanelId> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id !== "string" || !id.trim() || id.length > 128) continue;
      if (value === null) {
        next[id] = null;
        continue;
      }
      if (typeof value === "string" && PANEL_VALUES.has(value)) next[id] = value as PanelId;
    }
    workbench.sessionPanels = next;
  } catch {
    workbench.sessionPanels = {};
  }
}

export function persistSessionPanels(storage: Pick<Storage, "setItem"> | undefined = browserStorage()) {
  try {
    const entries = Object.entries(workbench.sessionPanels).slice(-EXTRAS_LIMIT);
    storage?.setItem(PANELS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* 本机存储失败时仍保留内存副本 */
  }
}

loadSessionPanels();
watch(() => workbench.sessionPanels, () => persistSessionPanels(), { deep: true, flush: "sync" });

export function loadLayoutDrafts(storage: Pick<Storage, "getItem"> | undefined) {
  try {
    const parsed = JSON.parse(storage?.getItem(DRAFT_KEY) ?? "null");
    workbench.drafts = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === "string") : [];
  } catch {
    workbench.drafts = [];
  }
}

export function saveLayoutDraft(draft: Omit<LayoutDraft, "id" | "savedAt">, storage: Pick<Storage, "getItem" | "setItem"> | undefined) {
  const next: LayoutDraft = { ...draft, id: `draft-${Date.now()}-${workbench.drafts.length}`, savedAt: new Date().toISOString() };
  workbench.drafts = [next, ...workbench.drafts].slice(0, 8);
  try { storage?.setItem(DRAFT_KEY, JSON.stringify(workbench.drafts)); } catch { /* 本机存储失败时仍保留内存副本 */ }
  return next;
}
