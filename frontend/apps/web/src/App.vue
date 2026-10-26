<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import CapabilityManager from "./features/capability/CapabilityManager.vue";
import ExpertManager from "./features/expert/ExpertManager.vue";
import KnowledgeManager from "./features/knowledge/KnowledgeManager.vue";
import DatabaseManager from "./features/database/DatabaseManager.vue";
import RuleManager from "./features/rule/RuleManager.vue";
import ModelSettings from "./features/settings/ModelSettings.vue";
import PluginCenter from "./features/plugins/PluginCenter.vue";
import DesktopNavigation from "./features/DesktopNavigation.vue";
import ScenarioWorkspace from "./features/ScenarioWorkspace.vue";
import PluginSlot from "./features/plugins/PluginSlot.vue";
import { createPluginHost } from "./features/plugins/host";
import { isKnownHash } from "./features/plugins/model";
import { i18n } from "./lib/i18n";
import {
  runtimeApi,
  type CapabilityItem,
  type CapabilityKindSummary,
  type SqlAnalysis,
  type SqlFinding,
  type TaskResult,
  type TaskStatistics,
} from "@eap/runtime-client";
import { EmptyState, Feedback, MetricCard, Button, Badge } from "@eap/ui";
import { errorMessage, statusLabel } from "./lib/presentation";
import { describeSecret } from "./lib/sensitive";
import { CANDIDATE_REWRITE_NOTES, candidateRewrite, rewriteUnavailable } from "./lib/rewrites";

/** Existing views remain available through the five-entry desktop shell. */
const shellPages = [
  { id: "sql", name: "分析工作台", icon: "▷", group: "工作", hint: "任务列表、任务流与新的分析输入" },
  {
    id: "plugins",
    name: i18n.global.t("plugin.center"),
    icon: "▣",
    group: "设置",
    hint: i18n.global.t("plugin.centerHint"),
  },
  { id: "model-settings", name: i18n.global.t("composerUi.modelSettings"), icon: "⚙", group: "设置", hint: i18n.global.t("composerUi.modelSettingsHint") },
  { id: "experts", name: "专家定义", icon: "◈", group: "设置", hint: "编排能力节点、依赖与授权" },
  { id: "rules", name: "规则库", icon: "▤", group: "设置", hint: "查看规则、条件与试算结果" },
  { id: "knowledge", name: "知识库", icon: "▢", group: "设置", hint: "录入业务知识并带来源检索" },
  { id: "databases", name: "数据库资料", icon: "▦", group: "设置", hint: "登记脱敏表结构与索引快照" },
  { id: "capabilities", name: "能力目录", icon: "⚙", group: "设置", hint: "运行时实际注册的确定性工具" },
];
const pluginHost = createPluginHost();
/** 落地页：打开就是能干活的地方。壳页面保持固定；插件入口由注册表按启停追加。 */
const DEFAULT_VIEW = "sql";
const pages = computed(() => [
  ...shellPages.filter((page) => page.group === "工作"),
  ...pluginHost.entries.value,
  ...shellPages.filter((page) => page.group === "设置"),
]);
const hashView = typeof location !== "undefined" ? location.hash.slice(1) : "";
const activeView = ref(isKnownHash(hashView) ? hashView : DEFAULT_VIEW);
const currentView = computed(
  () => pages.value.find((view) => view.id === activeView.value) ?? pluginHost.describe(activeView.value),
);


/**
 * 检查器是「按页面取值」的：每个页面声明自己能检查什么，切换页面立刻回到该页的说明，
 * 绝不把上一页的选中项留在那里。只有真正产出逐项结果（发现）的页面才显示选中卡片。
 */
const INSPECTOR_PAGES: Record<string, { hint: string; pipeline?: boolean }> = {
  sql: {
    hint: "顶部状态条的四个数字都注明了出处（可展开查看口径）。点击任意一条发现，这里显示它的严重级、证据、语义保持建议与三个动作：复制建议 / 查看候选改写 / 标记忽略。",
    pipeline: true,
  },
  chat: { hint: i18n.global.t("chat.hint") },
  plugins: { hint: i18n.global.t("plugin.centerHint") },
  experts: {
    hint: "专家的能力引用、知识库与 MCP 工具授权在该专家面板内联展示；画布与清单都由当前草稿渲染。",
  },
  rules: {
    hint: "规则包的条件、所需能力与试算结果在规则面板内联展示；自定义包可就地编辑规则，内置包需先复制。",
  },
  knowledge: { hint: "知识库与文档的增删改在面板内联完成；检索范围会写在检索框下方。" },
  databases: { hint: "表结构与索引快照在点击「查看」时于资料面板内联展示。" },
  capabilities: { hint: "能力的种类、范围、可用状态与管理入口在能力目录内联展开。" },
};
const inspector = computed(
  () => INSPECTOR_PAGES[activeView.value] ?? { hint: currentView.value.hint },
);
watch(activeView, (value) => {
  inspectorOpen.value = false;
  if (typeof location !== "undefined") location.hash = value;
});
function hashChange() {
  const id = location.hash.slice(1);
  if (isKnownHash(id)) activeView.value = id;
}

const runtimeStatus = ref("检测中");
const refreshing = ref(false);
const errors = ref<Record<string, string>>({});
const capabilities = ref<string[]>([]);
const capabilityItems = ref<CapabilityItem[]>([]);
const capabilityKinds = ref<CapabilityKindSummary[]>([]);
const expertCount = ref(0);
const capabilityManager = ref<{ refresh: () => Promise<void> } | null>(null);
const inspectorOpen = ref(false);
const expertManager = ref<{ refresh: () => Promise<void> } | null>(null);
const knowledgeManager = ref<{ refresh: () => Promise<void> } | null>(null);
const databaseManager = ref<{ refresh: () => Promise<void> } | null>(null);
const ruleManager = ref<{ refresh: () => Promise<void> } | null>(null);
const registeredExperts = ref<
  Array<{
    id: string;
    name: string;
    databaseProfiles?: string[];
    steps?: Array<{ capability: string }>;
  }>
>([]);
const databaseInfo = ref<
  Array<{
    id: string;
    label: string;
    engine: string;
    environment: string;
    credentialsExposed: boolean;
  }>
>([]);

const history = ref<TaskResult[]>([]);
const task = ref<TaskResult | null>(null);
const goal = ref("");
const taskBusy = ref(false);
const taskError = ref("");
/** 任务列表的状态筛选。空串 = 不筛。 */
const taskStatusFilter = ref("");
const TASK_STATUS_FILTERS = [
  { value: "completed", label: "已完成" },
  { value: "needs-planning", label: "待规划" },
  { value: "failed", label: "执行失败" },
];
const composerGoal = ref<HTMLTextAreaElement | null>(null);

const searchPattern = ref("");
const selectedExpert = ref("");
const selectedDatabase = ref("");
const explainText = ref("");
const enhanceModel = ref(false);
const sql = ref("");
const sqlResult = ref<SqlAnalysis | null>(null);
const sqlBusy = ref(false);
const sqlError = ref("");
const copyMessage = ref("");
const selectedFinding = ref<SqlFinding | null>(null);

/**
 * 工作空间在服务端不是 task 的字段——这是已定的范围，不是缺口：真正决定本地 CLI 在哪里执行的是
 * 运行时进程的执行目录（`EAP_WORKSPACE`）。所以顶栏这个下拉只是**本机视图范围**：它只过滤控制台
 * 自己标注过的执行，能力目录 / 规则库 / 知识库是应用级配置，不随它变化。切换会说明这一点。
 */
const DEFAULT_WORKSPACE = "engineering-automation-platform";
const WORKSPACE_KEY = "eap.console.workspace";
const WORKSPACES_KEY = "eap.console.workspaces";
const TASK_TAGS_KEY = "eap.console.task-workspaces";
function readStore(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    // 无 localStorage（SSR / 隐私模式）时退化为内存状态，而不是让整个页面加载失败。
    return fallback;
  }
}
function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 同上：写不进去只影响持久化，不影响本次会话 */
  }
}
function readTags(): Record<string, string> {
  try {
    return JSON.parse(readStore(TASK_TAGS_KEY, "{}")) as Record<string, string>;
  } catch {
    return {};
  }
}
function readList(key: string): string[] {
  try {
    const parsed = JSON.parse(readStore(key, "[]")) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
const workspace = ref(readStore(WORKSPACE_KEY, DEFAULT_WORKSPACE));
const workspaceAdding = ref(false);
const newWorkspace = ref("");
const knownWorkspaces = ref<string[]>(readList(WORKSPACES_KEY));
const taskTags = ref<Record<string, string>>(readTags());
const workspaceOpen = ref(false);
const workspaceMessage = ref("");
const lastRefresh = ref("");
const stats = ref<TaskStatistics | null>(null);
const statsError = ref("");
const expertStates = ref<Record<string, { enabled: boolean; builtin: boolean }>>({});

/** 决策阶段的展开说明；「跳过模型」必须能说出为什么，而不是只显示一个词。 */
const decisionOpen = ref(false);
const supplement = ref("");
const supplementMessage = ref("");
const ignoredFindings = ref<string[]>([]);
const rewriteOpen = ref(false);
function toggleRewrite() {
  rewriteOpen.value = !rewriteOpen.value;
}
const inspectorMessage = ref("");
const rerunBusy = ref(false);

const workspaceOptions = computed(() => [
  ...new Set([
    DEFAULT_WORKSPACE,
    ...knownWorkspaces.value,
    ...Object.values(taskTags.value),
    workspace.value,
  ]),
]);
/** 本机标注过的执行才属于当前工作空间；未标注的归入默认工作空间。 */
const visibleHistory = computed(() =>
  history.value.filter(
    (entry) => (taskTags.value[entry.id] ?? DEFAULT_WORKSPACE) === workspace.value,
  ),
);
/** 任务列表 = 当前工作空间 + 状态筛选。筛选只作用在列表上，不改动任务本身。 */
const filteredHistory = computed(() =>
  taskStatusFilter.value
    ? visibleHistory.value.filter((entry) => entry.status === taskStatusFilter.value)
    : visibleHistory.value,
);
/** 「＋ 新的分析」把光标送回输入框：这是使用界面里唯一需要滚动的跳转。 */
function focusComposer() {
  try {
    composerGoal.value?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    /* 无 scrollIntoView（SSR / 旧环境）时退化为直接聚焦 */
  }
  composerGoal.value?.focus();
}
/** 清空本次输入。它只清输入，不动已经产生的任务记录——那些是历史，不该被一个按钮抹掉。 */
function clearComposer() {
  goal.value = "";
  sql.value = "";
  searchPattern.value = "";
  explainText.value = "";
  selectedDatabase.value = "";
  sqlResult.value = null;
  selectedFinding.value = null;
  sqlError.value = "";
  copyMessage.value = "";
}
const enabledExpertCount = computed(
  () => Object.values(expertStates.value).filter((state) => state.enabled).length,
);
const disabledCapabilityCount = computed(
  () => capabilityItems.value.filter((item) => item.disabled).length,
);
/** 概览「模型调用占比」：null 表示还没有记录了模型走向的执行，不是 0%。 */
const modelShareText = computed(() => {
  const share = stats.value?.model.share ?? null;
  return share === null ? "尚无记录" : `${Math.round(share * 100)}%`;
});
const deterministicCoverageText = computed(() => {
  const share = stats.value?.deterministicShare ?? null;
  return share === null ? "尚无记录" : `${Math.round(share * 100)}%`;
});
/** 近 N 日实际发生了什么——决策与状态的分布，来自同一份统计，不是设计意图。 */
const windowDistribution = computed(() => {
  const source = stats.value;
  if (!source) return "";
  const decisions = Object.entries(source.byDecision).map(
    ([key, count]) => `${statusLabel(key)} ${count}`,
  );
  const statuses = Object.entries(source.byStatus).map(
    ([key, count]) => `${statusLabel(key)} ${count}`,
  );
  return [
    decisions.length ? "决策 " + decisions.join("、") : "",
    statuses.length ? "状态 " + statuses.join("、") : "",
  ]
    .filter(Boolean)
    .join(" · ");
});

const allowedDatabases = computed(() =>
  databaseInfo.value.filter((profile) =>
    registeredExperts.value
      .find((expert) => expert.id === selectedExpert.value)
      ?.databaseProfiles?.includes(profile.id),
  ),
);
const findings = computed<SqlFinding[]>(
  () => sqlResult.value?.deterministicAnalysis?.findings ?? [],
);
const selectedExpertDef = computed(() =>
  registeredExperts.value.find((expert) => expert.id === selectedExpert.value),
);
const needsPattern = computed(() =>
  selectedExpertDef.value?.steps?.some((step) => step.capability === "rg-search"),
);
const decision = computed(() => sqlResult.value?.modelAdvisor?.decision ?? "unavailable");
/**
 * 任务流显示哪一种内容，由「选中任务」与「本次会话的分析结果」共同决定：
 * - 选中的任务就是刚才那次分析（同一个 id）→ 回放完整报表（历史接口只返回摘要，报表只在会话里有）；
 * - 选中的是本地能力任务 → 回放它的请求与工具观测；
 * - 什么都没选 → 空态，把人引向左栏或底部输入框。
 */
const streamMode = computed<"empty" | "task" | "report">(() => {
  if (sqlResult.value && (!task.value || task.value.id === sqlResult.value.id)) return "report";
  if (task.value) return "task";
  return "empty";
});
const compression = computed(() => sqlResult.value?.modelAdvisor?.preprocessing);
const blockedRules = computed(() => sqlResult.value?.deterministicAnalysis?.blockedRules ?? []);
const rulePackRequirements = computed(() => sqlResult.value?.rulePackRequirements ?? []);
/** "5 内置命令 · 3 本地 CLI" — capability kinds summarised for the overview metric. */
const kindSummary = computed(() => {
  const parts = capabilityKinds.value
    .filter((kind) => kind.count > 0)
    .map((kind) => `${kind.count} ${kind.label}`);
  const scoped = capabilityItems.value.filter((item) => item.expertScoped).length;
  if (scoped) parts.push(`${scoped} 专家级`);
  return parts.length ? parts.join(" · ") : "本地确定性能力";
});
const factEntries = computed(() =>
  Object.entries(sqlResult.value?.deterministicAnalysis?.facts ?? {}),
);
function factText(value: unknown) {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (value === null || value === undefined) return "—";
  return String(value);
}

watch(selectedExpert, () => {
  selectedDatabase.value = "";
  searchPattern.value = "";
  sqlResult.value = null;
  selectedFinding.value = null;
});

async function refresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  errors.value = {};
  const jobs = [
    [
      "health",
      async () => {
        const health = await runtimeApi.health();
        runtimeStatus.value = health.status === "ok" ? "已连接" : "服务降级";
      },
    ],
    [
      "capabilities",
      async () => {
        const catalog = await runtimeApi.capabilities();
        capabilities.value = catalog.capabilities;
        capabilityItems.value = catalog.items ?? [];
        capabilityKinds.value = catalog.kinds ?? [];
      },
    ],
    [
      "databases",
      async () => {
        databaseInfo.value = (await runtimeApi.databases()).items;
      },
    ],
    [
      "experts",
      async () => {
        const response = await runtimeApi.experts();
        expertCount.value = response.items.length;
        expertStates.value = response.states ?? {};
        registeredExperts.value = response.items
          .map((text) => JSON.parse(text))
          .filter((expert) => response.states?.[expert.id]?.enabled);
        if (!registeredExperts.value.some((expert) => expert.id === selectedExpert.value)) {
          selectedExpert.value = registeredExperts.value[0]?.id ?? "";
        }
      },
    ],
    [
      "tasks",
      async () => {
        history.value = (await runtimeApi.tasks()).items;
      },
    ],
    // 概览的两个窗口数字来自运行时，而不是页面上写死的样本；取不到时如实报错，不退回占位值。
    [
      "stats",
      async () => {
        stats.value = await runtimeApi.stats();
        statsError.value = "";
      },
    ],
  ] as const;
  await Promise.all(
    jobs.map(async ([key, work]) => {
      try {
        await work();
      } catch (error) {
        errors.value[key] = errorMessage(error);
        if (key === "health") runtimeStatus.value = "未连接";
        if (key === "stats") statsError.value = errorMessage(error);
      }
    }),
  );
  if (activeView.value === "experts") await expertManager.value?.refresh();
  if (activeView.value === "knowledge") await knowledgeManager.value?.refresh();
  if (activeView.value === "databases") await databaseManager.value?.refresh();
  if (activeView.value === "rules") await ruleManager.value?.refresh();
  if (activeView.value === "capabilities") await capabilityManager.value?.refresh();
  lastRefresh.value = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  refreshing.value = false;
}

/** 一次执行结束后只重读任务与统计：它们是刚才这次运行真正改变的东西。 */
async function refreshTasks() {
  try {
    history.value = (await runtimeApi.tasks()).items;
    stats.value = await runtimeApi.stats();
    statsError.value = "";
  } catch (error) {
    statsError.value = errorMessage(error);
  }
  lastRefresh.value = new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function switchWorkspace(id: string) {
  workspace.value = id;
  workspaceOpen.value = false;
  writeStore(WORKSPACE_KEY, id);
  const count = history.value.filter(
    (entry) => (taskTags.value[entry.id] ?? DEFAULT_WORKSPACE) === id,
  ).length;
  workspaceMessage.value =
    count > 0
      ? `已切换到工作空间 ${id}：本机标注在该空间的执行有 ${count} 条。`
      : `已切换到工作空间 ${id}：还没有标注在该空间的执行。` +
        "任务在服务端不按工作空间分表，所以这里只过滤控制台本机标注过的运行；" +
        "本地执行目录请在「运行环境 → 桌面外壳 → 本地工作空间」查看（该页尚未在应用中实现）。";
}

/**
 * 新建一个「本机视图」工作空间。
 *
 * 它必须被持久化在已知列表里：只靠「标注过的执行」推导选项时，一个刚建好、还没有执行的
 * 工作空间会在切走后消失——那会看起来像是控制台把它弄丢了。
 */
function addWorkspace() {
  const name = newWorkspace.value.trim();
  if (!name) return;
  if (!knownWorkspaces.value.includes(name)) {
    knownWorkspaces.value = [...knownWorkspaces.value, name];
    writeStore(WORKSPACES_KEY, JSON.stringify(knownWorkspaces.value));
  }
  workspaceAdding.value = false;
  newWorkspace.value = "";
  switchWorkspace(name);
}

function tagTask(id: string) {
  taskTags.value = { ...taskTags.value, [id]: workspace.value };
  writeStore(TASK_TAGS_KEY, JSON.stringify(taskTags.value));
}

/**
 * 顶栏的主按钮与 分析工作台是同一个动作——不是两个行为相近的入口。
 * 没有可分析的内容时它必须说出来，而不是安静地什么都不做。
 */
function primaryAction() {
  activeView.value = "sql";
  if (!canAnalyze.value) {
    sqlError.value = "还没有可分析的内容：请在 分析工作台填写业务问题、SQL 或本地检索目标。";
    return;
  }
  void analyzeSql();
}
const canAnalyze = computed(
  () => !!sql.value.trim() || !!goal.value.trim() || !!searchPattern.value.trim(),
);

/** 重新运行 = 用同样的目标再提交一次：新增一条记录，旧记录与它的证据保持原样。 */
async function rerunTask(entry: TaskResult) {
  if (rerunBusy.value) return;
  rerunBusy.value = true;
  taskError.value = "";
  try {
    const rerun = await runtimeApi.createTask(entry.goal);
    tagTask(rerun.id);
    await refreshTasks();
    task.value = rerun;
    workspaceMessage.value = "";
  } catch (error) {
    taskError.value = errorMessage(error);
  } finally {
    rerunBusy.value = false;
  }
}

async function submitTask() {
  if (taskBusy.value || !goal.value.trim()) return;
  taskBusy.value = true;
  taskError.value = "";
  task.value = null;
  try {
    task.value = await runtimeApi.createTask(goal.value);
    tagTask(task.value.id);
    history.value = [task.value, ...history.value.filter((t) => t.id !== task.value!.id)];
    void refreshTasks();
  } catch (error) {
    taskError.value = errorMessage(error);
  } finally {
    taskBusy.value = false;
  }
}
async function selectHistory(entry: TaskResult) {
  if (taskBusy.value) return;
  taskBusy.value = true;
  taskError.value = "";
  task.value = null;
  try {
    task.value = await runtimeApi.task(entry.id);
  } catch (error) {
    taskError.value = errorMessage(error);
  } finally {
    taskBusy.value = false;
  }
}
async function analyzeSql() {
  if (sqlBusy.value) return;
  if (!canAnalyze.value) {
    sqlError.value = "请先填写业务问题、SQL 或本地检索目标。";
    return;
  }
  // 运行时会在服务端拒绝含凭据的字段；在这里先拒绝，是为了能指出**哪一个字段**、以及它看起来是什么。
  const fields: Array<[string, string]> = [
    ["SQL", sql.value],
    ["业务问题", goal.value],
    ["本地检索目标", searchPattern.value],
  ];
  for (const [label, value] of fields) {
    const reason = describeSecret(value);
    if (reason) {
      sqlError.value = `${label}里含有${reason}。平台不接收凭据，请改用环境变量或凭据存储。`;
      return;
    }
  }
  sqlBusy.value = true;
  sqlError.value = "";
  sqlResult.value = null;
  selectedFinding.value = null;
  copyMessage.value = "";
  inspectorMessage.value = "";
  rewriteOpen.value = false;
  ignoredFindings.value = [];
  decisionOpen.value = false;
  supplementMessage.value = "";
  try {
    let plan: Record<string, unknown> | undefined;
    if (explainText.value.trim()) {
      const parsed = JSON.parse(explainText.value);
      plan = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!plan || typeof plan !== "object" || Array.isArray(plan))
        throw new Error("执行计划需要是 JSON 对象或 PostgreSQL EXPLAIN JSON 数组");
    }
    const result = await runtimeApi.analyzeSql(sql.value, goal.value, {
      expertId: selectedExpert.value,
      databaseId: selectedDatabase.value || undefined,
      explainPlan: plan,
      enhanceWithModel: enhanceModel.value,
      pattern: searchPattern.value || undefined,
    });
    sqlResult.value = result;
    selectedFinding.value = null;
    // 本次会话的报表要显示出来：清掉「选中的历史任务」，否则同屏会停在上一条任务的过程回放上。
    task.value = null;
    // 这次执行和 /api/tasks 里那条记录是同一个 id（运行时用同一个 id 持久化）。
    if (result.id) tagTask(result.id);
    void refreshTasks();
  } catch (error) {
    sqlError.value = errorMessage(error);
  } finally {
    sqlBusy.value = false;
  }
}

/**
 * 补充上下文 = 把新上下文并入目标后再执行一次。
 *
 * 运行时没有 "supplement" 资源，所以这不是就地改写历史，而是再一次
 * `POST /api/experts/{id}/execute`：旧记录（含其中「未判定」的规则）原样保留，便于对比。控制台如实说明
 * 这一点，而不是把它画成一个会覆盖上一条结果的按钮。
 */
async function applySupplement() {
  const text = supplement.value.trim();
  if (!text) {
    supplementMessage.value = "请先填写要补充的上下文。";
    return;
  }
  const reason = describeSecret(text);
  if (reason) {
    supplementMessage.value = `补充内容里含有${reason}。运行时会拒绝它，请改用环境变量或凭据存储。`;
    return;
  }
  goal.value = [goal.value.trim(), text].filter(Boolean).join("\n\n");
  supplement.value = "";
  await analyzeSql();
  supplementMessage.value = sqlError.value
    ? "补充上下文后重新执行失败：" + sqlError.value
    : "已把补充上下文并入目标并重新执行了一次（POST /api/experts/{id}/execute）。上一条记录与它的证据保持原样，便于对照。";
}
async function copyResult() {
  if (!sqlResult.value) return;
  try {
    await navigator.clipboard.writeText(
      [...(sqlResult.value.advice ?? []), sqlResult.value.expertAdvice ?? ""].join("\n\n"),
    );
    copyMessage.value = "建议已复制";
  } catch {
    copyMessage.value = "复制失败，请手动选择建议文本复制";
  }
}

const severityLabel: Record<string, string> = {
  critical: "严重",
  high: "高",
  medium: "中",
  low: "低",
  info: "提示",
};
const decisionLabels: Record<string, string> = {
  enhance: "调用模型",
  skip: "跳过模型",
  unavailable: "不可用",
};
const modelLabels: Record<string, string> = {
  "unverified-observation": "已调用（待验证）",
  skipped: "已跳过",
  unavailable: "不可用",
  "not-requested": "未请求",
  /** 计划型任务从未到判定阶段：这不是「跳过了模型」，而是根本没有可跳过的阶段。 */
  "": "未到判定阶段",
};
function severityText(value: string) {
  return severityLabel[value] ?? value;
}
function decisionText(value: string) {
  return decisionLabels[value] ?? value;
}
function modelEnhancementText(value?: string) {
  return modelLabels[value ?? ""] ?? "—";
}

/**
 * 决策阶段为什么这么走。
 *
 * 「跳过模型」是这套平台最值得解释的一句话，所以它能被点开：结论、理由、提供方与耗时都来自
 * `modelAdvisor`。没有到决策阶段时也要说清楚是在哪里停下的，而不是留一个空阶段。
 */
const decisionExplanation = computed(() => {
  const advisor = sqlResult.value?.modelAdvisor;
  if (!advisor) {
    return {
      title: "本次没有到决策阶段",
      lines: [
        "决策阶段只在确定性解析通过之后运行；解析未通过或必需节点失败时，流程在更早的地方就停下了。",
        `本次状态：${sqlResult.value ? statusLabel(sqlResult.value.status) : "尚未分析"}`,
      ],
    };
  }
  const lines: string[] = [];
  if (advisor.rationale) lines.push(advisor.rationale);
  if (advisor.decision === "skip")
    lines.push("跳过不是省事：确定性证据已经足以判定，调用模型只会增加成本与不确定性。");
  if (advisor.attempted === false) lines.push("本次没有尝试调用模型。");
  if (advisor.provider || advisor.model)
    lines.push(`提供方 ${advisor.provider ?? "—"} · 模型 ${advisor.model ?? "—"}`);
  if (advisor.latencyMs !== undefined)
    lines.push(
      `耗时 ${advisor.latencyMs} ms · 提示 ${advisor.promptTokens ?? "—"} / 补全 ${advisor.completionTokens ?? "—"} tokens`,
    );
  return { title: decisionText(advisor.decision ?? "unavailable"), lines };
});

function isFindingIgnored(code: string) {
  return ignoredFindings.value.includes(code);
}

/**
 * 标记忽略只记录操作者在这一条发现上的判断：发现本身留在列表里（带标记，不删除），
 * 也绝不修改规则包 —— 否则「这条我看过了」会变成「这条不存在」。
 */
function toggleFindingIgnored(finding: SqlFinding) {
  ignoredFindings.value = isFindingIgnored(finding.code)
    ? ignoredFindings.value.filter((code) => code !== finding.code)
    : [...ignoredFindings.value, finding.code];
  inspectorMessage.value = isFindingIgnored(finding.code)
    ? `已标记忽略 ${finding.code}：只影响本次查看，规则包与证据都没有改动。`
    : `已取消 ${finding.code} 的忽略标记。`;
}

async function copyFindingAdvice(finding: SqlFinding) {
  try {
    await navigator.clipboard.writeText(finding.suggestion);
    inspectorMessage.value = "建议已复制（语义保持，未执行）";
  } catch {
    inspectorMessage.value = "复制失败，请手动选择建议文本复制";
  }
}

/** 只有能从语句本身判定的改写才给候选；其余给「为什么没有」，不给一个看起来像改写的 diff。 */
const findingRewrite = computed(() =>
  selectedFinding.value
    ? candidateRewrite(selectedFinding.value.code, sqlResult.value?.sql ?? "")
    : null,
);
const findingRewriteUnavailable = computed(() =>
  selectedFinding.value ? rewriteUnavailable(selectedFinding.value.code) : "",
);

function selectFinding(finding: SqlFinding) {
  selectedFinding.value = finding;
  inspectorOpen.value = true;
  rewriteOpen.value = false;
  inspectorMessage.value = "";
}

onMounted(() => {
  window.addEventListener("hashchange", hashChange);
  void refresh();
});
onUnmounted(() => window.removeEventListener("hashchange", hashChange));
</script>

<template>
  <div class="app" :class="{ 'app--analysis': activeView === 'sql' }">
    <header class="topbar">
      <div class="brand" aria-label="工程自动化平台"><b>EAP</b></div>
      <div v-if="activeView === 'sql'" class="menu-wrap">
        <button class="ws" :aria-expanded="workspaceOpen" @click="workspaceOpen = !workspaceOpen">
          工作空间 <b>{{ workspace }}</b
          ><span class="caret">▾</span>
        </button>
        <div v-if="workspaceOpen" class="menu" role="menu">
          <div class="menu-head">工作空间（本机视图范围）</div>
          <button
            v-for="option in workspaceOptions"
            :key="option"
            :class="{ active: option === workspace }"
            role="menuitem"
            @click="switchWorkspace(option)"
          >
            {{ option }}
          </button>
          <form v-if="workspaceAdding" class="menu-form" @submit.prevent="addWorkspace">
            <input
              v-model="newWorkspace"
              class="workspace-input"
              aria-label="新工作空间名称"
              placeholder="例如 orders-service"
            />
            <Button variant="primary" :disabled="!newWorkspace.trim()"> 添加 </Button>
          </form>
          <button v-else class="menu-add" @click="workspaceAdding = true">
            ＋ 新建本机工作空间…
          </button>
          <p class="menu-note">
            任务在服务端不按工作空间分表。这里只是把控制台本机标注过的执行分组；能力目录、规则库与
            知识库是应用级配置，不随它变化。决定本地 CLI 在哪里执行的是运行时进程的执行目录。
          </p>
        </div>
      </div>
      <span class="desktop-page-title">{{ activeView === 'scenes' ? i18n.global.t('desktop.prototype') : activeView === 'work' ? i18n.global.t('desktop.work') : currentView.name }}</span>
      <div class="spacer" />
      <span class="eap-chip" :class="runtimeStatus === '已连接' ? 'ok' : 'warn'">
        <i class="dot" />运行时{{ runtimeStatus }}
      </span>
      <Button
        variant="secondary"
        v-if="activeView === 'sql'"
        :aria-expanded="inspectorOpen"
        aria-controls="context-details"
        @click="inspectorOpen = !inspectorOpen"
        class="inspector-toggle"
      >
        查看详情
      </Button>
      <Button variant="secondary" :disabled="refreshing" @click="refresh">
        {{ refreshing ? "刷新中…" : "刷新" }}
      </Button>
      <Button v-if="activeView === 'sql'" variant="primary" :disabled="sqlBusy" @click="primaryAction">
        {{ sqlBusy ? "分析中…" : "运行分析" }}
      </Button>
    </header>
    <p v-if="workspaceMessage" class="shell-message" role="status">{{ workspaceMessage }}</p>

    <div class="body" :class="{ 'body--chat': activeView === 'chat', 'body--focused': activeView !== 'sql' }">
      <DesktopNavigation :class="{ 'desktop-navigation--chat': activeView === 'chat' }" :active-view="activeView" :pages="pages" @navigate="activeView = $event" />

      <main class="workbench">
        <Feedback tone="error" v-if="errors.health && !['chat', 'model-settings'].includes(activeView)" role="alert">
          {{ errors.health }}
        </Feedback>

        <!--
          分析工作台：使用界面，不是管理后台。
          2026-10-15 任务不再是独立页面——一次分析的输入与它的过程/结论，本来就是同一件事的两半。
        -->
        <ScenarioWorkspace v-if="activeView === 'scenes'" :builder-enabled="pluginHost.installation.value.enabled.builder" :chat-enabled="pluginHost.installation.value.enabled.chat" @navigate="activeView = $event" />
        <section v-else-if="activeView === 'work'" class="view"><h1>{{ i18n.global.t("desktop.work") }}</h1><p>{{ i18n.global.t("desktop.workPending") }}</p></section>
        <section v-else-if="activeView === 'sql'" class="view work-page analysis-workspace">
          <div class="page-head">
            <p class="eyebrow">WORKBENCH</p>
            <h1>分析工作台</h1>
            <p>
              左侧是本工作空间的分析任务：点一条任务，中间回放它的请求、执行过程与逐条发现；
              底部的输入框直接开始一次新的分析。
            </p>
            <details class="why">
              <summary>为什么平台自己不执行你的 SQL</summary>
              <p>
                平台不连接业务数据库、也不执行你输入的 SQL。执行计划快照由你自行取得后粘贴——这样
                <b>没有凭据需要保管，也不存在误在上游库执行改写的可能</b>。代价是要你多贴一次，
                换来的是这条边界永远成立。
              </p>
            </details>
          </div>

          <details class="status-strip work-overview"><summary>{{ i18n.global.t("workUi.overview") }} <span>{{ capabilityItems.length || capabilities.length }} {{ i18n.global.t("workUi.capabilities") }} · {{ expertCount }} {{ i18n.global.t("workUi.experts") }}</span></summary>
            <div class="metrics">
              <MetricCard
                label="已注册能力"
                :value="capabilityItems.length || capabilities.length"
                :detail="kindSummary"
                :source="
                  disabledCapabilityCount
                    ? `出处：/api/capabilities · ${disabledCapabilityCount} 已停用`
                    : '出处：/api/capabilities'
                "
              />
              <MetricCard
                label="专家定义"
                :value="expertCount"
                :detail="`${enabledExpertCount} 已启用 · 内置 + 自定义`"
                source="出处：/api/experts"
              />
              <MetricCard
                :label="`近 ${stats?.windowDays ?? 7} 日任务`"
                :value="stats ? stats.tasksInWindow : '—'"
                :detail="
                  stats
                    ? `共 ${stats.tasksTotal} 条记录 · ${stats.observationsInWindow} 条工具观测`
                    : '统计接口不可用'
                "
                source="出处：/api/stats，由 eap.task 实时聚合"
              />
              <MetricCard
                label="模型调用占比"
                :value="modelShareText"
                :detail="
                  stats && stats.model.recordedRuns
                    ? `${stats.model.calls} / ${stats.model.recordedRuns} 次执行真的调用了模型`
                    : '还没有记录了模型走向的执行'
                "
                source="出处：/api/stats · 分母只含记录了模型走向的执行"
              />
            </div>
            <Feedback v-if="statsError" tone="error">这几个数字取不到：{{ statsError }}</Feedback>
            <p v-else-if="stats" class="metric-note">{{ stats.note }}</p>
            <details class="status-more">
              <summary>这些数字从哪来</summary>
              <details class="why">
                <summary>为什么这四个数字可以不写死</summary>
                <p>
              已注册能力与专家定义分别读能力清单与专家清单：停用一个能力、新增一个专家，这两个数字跟着变，
              所以它们不可能和「能力目录」「专家定义」里的数字不一致。
                </p>
                <p>
                  近 {{ stats?.windowDays ?? 7 }} 日任务与模型调用占比读运行时的统计接口，而它是对
                  <code class="mono">eap.task</code>
                  的实时聚合：每次执行都会把「有没有真正调用模型」写进任务记录，
                  所以这两个数字是算出来的，不是样本。
                </p>
                <p>
                  状态栏的「确定性覆盖」与这里的值是同一个（<b>{{ deterministicCoverageText }}</b
                  >）——
                  同一个数字有两处标签，就是它开始漂移的地方。还没有记录了模型走向的执行时显示「尚无记录」而不是
                  0%：那两句话不是同一个断言。
                </p>
              </details>
              <article class="eap-panel panel-block">
                <h2>确定性优先</h2>
                <p class="hint">
                  平台先运行本地确定性能力并生成结构化证据；只有当确定性证据不足或操作者显式请求时，
                  才会把压缩后的证据提交给模型。模型输出始终是与确定性发现分开展示的待验证观察。
                </p>
                <p v-if="windowDistribution" class="hint">
                  近 {{ stats?.windowDays ?? 7 }} 日实际发生：{{ windowDistribution }}。
                  这是运行时真的做了什么，而不是设计意图。
                </p>
              </article>
            </details>
          </details>

          <!--
            2026-10-15 使用界面重构：任务不再是独立页面。
            左侧 = 本工作空间的**分析任务**（一次执行一条），中间 = 选中任务的任务流
            （请求置顶 → 执行过程 → 逐条发现），底部 = 直接开始新分析的输入区。
            这是使用界面而不是管理后台：第一眼看到的是正在做的事和下一步的输入框。
          -->
          <div class="studio">
            <aside class="studio-tasks" aria-label="分析任务列表">
              <div class="studio-side-head">
                <div>
                  <b>分析任务</b>
                  <span class="hint">本工作空间 · 点一条回看全过程</span>
                </div>
                <Button variant="secondary" @click="focusComposer">＋ 新的分析</Button>
              </div>
              <select v-model="taskStatusFilter" class="workspace-input" aria-label="按状态筛选任务">
                <option value="">全部状态</option>
                <option v-for="option in TASK_STATUS_FILTERS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <div class="task-list">
                <button
                  v-for="entry in filteredHistory"
                  :key="entry.id"
                  type="button"
                  class="task-item"
                  :class="{ 'sel-row': task?.id === entry.id }"
                  :disabled="taskBusy"
                  @click="selectHistory(entry)"
                >
                  <span class="task-item-main">
                    <b>{{ entry.goal }}</b>
                    <span class="hint mono">{{ entry.id }} · {{ statusLabel(entry.decision) }}</span>
                  </span>
                  <Badge
                    tone="neutral"
                    :class="
                      entry.status === 'completed' ? 'eap-badge--success' : 'eap-badge--warning'
                    "
                    >{{ statusLabel(entry.status) }}</Badge
                  >
                </button>
              </div>
              <EmptyState v-if="!filteredHistory.length">
                {{
                  history.length
                    ? '当前工作空间没有本机标注过的执行。切换到其它工作空间，或在下面开始一次新的分析。'
                    : '还没有分析记录。在下面的输入框描述要分析的问题，或粘贴一段 SQL。'
                }}
              </EmptyState>
              <Feedback tone="error" v-if="taskError" role="alert">{{ taskError }}</Feedback>
            </aside>

            <div class="studio-main">
              <div class="studio-stream">
                <div v-if="streamMode === 'empty'" class="stream-empty">
                  <p class="stream-empty-title">尚未选择分析任务</p>
                  <p class="hint">
                    左侧点一条任务，回看它的请求、执行过程与发现；或在下面的输入框描述要分析的问题，
                    直接开始一次新的分析。
                  </p>
                </div>
                <template v-else>
                  <div class="req-card">
                    <div class="row stream-head">
                      <div>
                        <b>{{ streamMode === "report" ? sqlResult?.id : task?.id }}</b>
                        <p class="hint mono">
                          {{
                            streamMode === "report"
                              ? `专家流程 · 模型：${modelEnhancementText(sqlResult?.modelEnhancement)}`
                              : `本地能力任务 · 模型：${modelEnhancementText(task?.modelEnhancement)}`
                          }}
                        </p>
                      </div>
                      <Badge
                        tone="neutral"
                        :class="
                          (streamMode === 'report' ? sqlResult?.status : task?.status) ===
                          'completed'
                            ? 'eap-badge--success'
                            : 'eap-badge--warning'
                        "
                        >{{
                          statusLabel(
                            streamMode === "report"
                              ? (sqlResult?.status ?? "")
                              : (task?.status ?? ""),
                          )
                        }}</Badge
                      >
                    </div>
                    <p v-if="streamMode === 'task'" class="hint">{{ task?.goal }}</p>
                    <div class="form-actions" v-if="streamMode === 'task' && task">
                      <Button variant="secondary" :disabled="rerunBusy" @click="rerunTask(task)">
                        {{ rerunBusy ? "重新提交中…" : "重新运行" }}
                      </Button>
                      <span class="hint">重新运行会新增一条执行记录，旧记录与它的证据保持原样。</span>
                    </div>
                  </div>

                  <template v-if="streamMode === 'task' && task">
                    <div class="row stream-head">
                      <h2>执行过程</h2>
                    </div>
                    <Feedback tone="warning" v-if="task.status === 'needs-planning'">
                      尚无可靠的本地能力处理此需求，没有执行无关工具。请补充具体操作目标，或在下面的输入框贴上
                      SQL。
                    </Feedback>
                    <Feedback tone="warning" v-if="!task.observations">
                      历史接口当前只返回任务摘要，未返回工具输出。
                    </Feedback>
                    <div class="timeline">
                      <div
                        v-for="(item, index) in task.observations ?? []"
                        :key="index"
                        class="tl-item"
                      >
                        <div class="tl-rail">
                          <i :class="item.success ? 'ok' : 'warn'" /><span class="line" />
                        </div>
                        <div class="tl-body">
                          <div class="t">
                            {{ item.capability }} · {{ item.success ? "成功" : "失败" }}
                          </div>
                          <div class="meta">退出码 {{ item.exitCode }}</div>
                          <pre v-if="item.stdout">{{ item.stdout }}</pre>
                          <pre v-if="item.stderr" class="err">{{ item.stderr }}</pre>
                        </div>
                      </div>
                      <EmptyState v-if="!(task.observations ?? []).length">
                        这一次执行没有返回工具输出。
                      </EmptyState>
                    </div>
                  </template>

                  <Feedback tone="info" v-if="sqlBusy" role="status">正在分析并检索知识…</Feedback>

                  <article class="eap-panel" id="resultCard" v-if="streamMode === 'report' && sqlResult">
                    <header class="panel-head">
                      <div>
                        <h2>分析结果</h2>
                        <p>建议、证据与模型走向分开展示</p>
                      </div>
                      <Badge tone="success">{{ statusLabel(sqlResult.status) }}</Badge>
                    </header>
                    <div class="result">
                      <div class="pipeline">
                        <div class="stage done">
                          <div class="n">1 · 确定性</div>
                          <div class="t">已运行</div>
                          <div class="s">
                            {{ findings.length }} 条发现 · 置信度
                            {{ sqlResult.deterministicAnalysis?.deterministicConfidence ?? "—" }}
                          </div>
                        </div>
                        <button
                          type="button"
                          class="stage stage--clickable"
                          :class="decision === 'enhance' ? 'model' : 'skip'"
                          :aria-expanded="decisionOpen"
                          @click="decisionOpen = !decisionOpen"
                        >
                          <div class="n">2 · 决策</div>
                          <div class="t">{{ decisionText(decision) }}</div>
                          <div class="s">
                            {{ sqlResult.modelAdvisor?.rationale ?? "点开看为什么没有到决策阶段" }}
                            <span class="link">{{ decisionOpen ? "收起" : "为什么？" }}</span>
                          </div>
                        </button>
                        <div
                          class="stage"
                          :class="sqlResult.modelEnhancement === 'unverified-observation' ? 'model' : ''"
                        >
                          <div class="n">3 · 模型</div>
                          <div class="t">{{ modelEnhancementText(sqlResult.modelEnhancement) }}</div>
                          <div class="s" v-if="compression?.compressionRatio != null">
                            压缩比 {{ Math.round((compression.compressionRatio ?? 0) * 100) }}% · 预计
                            {{ compression.estimatedTokens }} tokens
                          </div>
                          <div class="s" v-else>确定性完成，无需模型</div>
                        </div>
                      </div>
                      <div v-if="decisionOpen" class="decision-panel">
                        <h4>{{ decisionExplanation.title }}</h4>
                        <ul class="advice-list">
                          <li v-for="(line, index) in decisionExplanation.lines" :key="index">
                            {{ line }}
                          </li>
                        </ul>
                        <p class="hint">
                          是否调用模型由运行时按规则决定，控制台改不了这个判断。若要显式请求一次模型复核，
                          请勾选左上方的「显式请求模型增强」并重新分析——那是一次新的执行。
                        </p>
                      </div>

                      <h3>发现（{{ findings.length }}）</h3>
                      <div class="findings">
                        <button
                          v-for="finding in findings"
                          :key="finding.code"
                          class="finding"
                          :class="{
                            sel: selectedFinding?.code === finding.code,
                            ignored: isFindingIgnored(finding.code),
                          }"
                          @click="selectFinding(finding)"
                        >
                          <span class="sev" :class="finding.severity">{{
                            severityText(finding.severity)
                          }}</span>
                          <span>
                            <span class="code mono">{{ finding.code }}</span>
                            <span v-if="isFindingIgnored(finding.code)" class="ignored-tag">已忽略</span>
                            <p class="evidence">{{ finding.evidence }}</p>
                            <span class="cat">类别：{{ finding.category }}</span>
                          </span>
                        </button>
                        <EmptyState v-if="!findings.length">
                          未触发确定性规则。这不代表 SQL 已通过优化检查，请补充表结构与执行计划。
                        </EmptyState>
                      </div>

                      <h3>适用规则包（{{ sqlResult.rulePacks?.length ?? 0 }}）</h3>
                      <div class="chips">
                        <Badge tone="neutral" v-for="pack in sqlResult.rulePacks ?? []" :key="pack.id">
                          {{ pack.name }} · {{ pack.ruleCount }} 条规则
                          <template v-if="pack.requires?.length">
                            · 需要 {{ pack.requires.join("、") }}</template
                          >
                        </Badge>
                        <span v-if="!sqlResult.rulePacks?.length" class="hint">
                          该专家未声明规则包，本次仅做解析与事实抽取。
                        </span>
                      </div>

                      <template v-if="rulePackRequirements.length">
                        <h3>规则包能力需求</h3>
                        <p class="hint">
                          规则读取事实，事实由能力产出。下面列出每个规则包需要的能力，以及本次流程是否真的执行了它们。
                        </p>
                        <div class="choice-list">
                          <div v-for="check in rulePackRequirements" :key="check.id" class="requirement">
                            <code class="mono">{{ check.id }}</code>
                            <Badge
                              tone="neutral"
                              :class="check.met ? 'eap-badge--success' : 'eap-badge--warning'"
                            >
                              {{ check.met ? "能力齐备" : "缺少 " + check.missing.join("、") }}
                            </Badge>
                            <span class="hint">需要：{{ check.required.join("、") }}</span>
                          </div>
                        </div>
                      </template>

                      <template v-if="blockedRules.length">
                        <h3>未判定的规则（{{ blockedRules.length }}）</h3>
                        <Feedback tone="info">
                          下列规则依赖的能力本次没有执行，因此它们的证据缺失。这
                          <b>不等于</b> 没有发现问题。
                        </Feedback>
                        <ul class="advice-list">
                          <li v-for="item in blockedRules" :key="item.rule">
                            <code class="mono">{{ item.rule }}</code> · 缺少能力
                            {{ item.missingCapabilities.join("、") }} · 相关事实
                            {{ item.missingFacts.join("、") }}
                          </li>
                        </ul>
                      </template>

                      <section class="supplement">
                        <h3>补充上下文</h3>
                        <p class="hint">
                          运行时没有「补充」这个资源：补充上下文等于把新上下文并入目标后<b>再执行一次</b>
                          （<code class="mono">POST /api/experts/{id}/execute</code
                          >）。上一条记录与它的证据不会被改写，
                          所以「补了什么、结果怎么变」在历史里可以对照。不要粘贴密码或连接串。
                        </p>
                        <textarea
                          v-model="supplement"
                          class="workspace-input"
                          rows="3"
                          :disabled="sqlBusy"
                          placeholder="例如：orders.customer_id 已有单列索引；订单表约 2000 万行，慢在分页"
                        />
                        <div class="form-actions">
                          <Button
                            variant="secondary"
                            type="button"
                            :disabled="sqlBusy || !supplement.trim()"
                            @click="applySupplement"
                          >
                            {{ sqlBusy ? "执行中…" : "补入并重新分析" }}
                          </Button>
                          <span class="hint" role="status">{{ supplementMessage }}</span>
                        </div>
                      </section>

                      <details v-if="factEntries.length">
                        <summary>命中事实（{{ factEntries.length }}）</summary>
                        <p class="hint">发现来自这些结构事实；规则包只能引用词表中已声明的事实。</p>
                        <table class="data-table facts-table">
                          <thead>
                            <tr>
                              <th>事实</th>
                              <th>值</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="[key, value] in factEntries" :key="key">
                              <td class="mono">{{ key }}</td>
                              <td>{{ factText(value) }}</td>
                            </tr>
                          </tbody>
                        </table>
                      </details>

                      <h3>优化建议（确定性，语义保持）</h3>
                      <ol v-if="sqlResult.advice?.length" class="advice-list">
                        <li v-for="item in sqlResult.advice" :key="item">{{ item }}</li>
                      </ol>
                      <EmptyState v-else>本次没有返回可验证建议，请补充上下文。</EmptyState>

                      <section v-if="sqlResult.expertAdvice">
                        <h3>模型观察（未验证）</h3>
                        <p class="preserve-text">{{ sqlResult.expertAdvice }}</p>
                      </section>

                      <details :open="!!sqlResult.knowledgeEvidence?.length">
                        <summary>知识依据（{{ sqlResult.knowledgeEvidence?.length ?? 0 }}）</summary>
                        <div v-for="(item, index) in sqlResult.knowledgeEvidence" :key="index" class="kb">
                          <b>{{ item.knowledgeBase }} / {{ item.source }}</b>
                          <p>{{ item.excerpt }}</p>
                        </div>
                        <p v-if="!sqlResult.knowledgeEvidence?.length" class="hint">
                          没有返回匹配知识，可在知识库录入相关业务说明或验证案例。
                        </p>
                      </details>

                      <details v-if="sqlResult.nodes?.length">
                        <summary>流程执行记录</summary>
                        <ol class="execution-list">
                          <li v-for="node in sqlResult.nodes" :key="node.id">
                            <div class="result-heading">
                              <strong>{{ node.label }}</strong>
                              <Badge
                                tone="neutral"
                                :class="
                                  node.state === 'succeeded' ? 'eap-badge--success' : 'eap-badge--warning'
                                "
                              >
                                {{ statusLabel(node.state) }}
                              </Badge>
                            </div>
                            <small class="mono">{{ node.capability }}</small>
                            <p>{{ node.message }}</p>
                          </li>
                        </ol>
                      </details>

                      <details v-if="sqlResult.safety?.length">
                        <summary>安全与执行说明</summary>
                        <ul>
                          <li v-for="item in sqlResult.safety" :key="item">{{ item }}</li>
                        </ul>
                      </details>

                      <div class="form-actions">
                        <Button
                          variant="secondary"
                          :disabled="!sqlResult.advice?.length && !sqlResult.expertAdvice"
                          @click="copyResult"
                        >
                          复制建议
                        </Button>
                        <span role="status" class="hint">{{ copyMessage }}</span>
                      </div>
                    </div>
                  </article>
                </template>
              </div>

              <div class="composer" id="composer">
                <Feedback tone="error" v-if="sqlError" role="alert">{{ sqlError }}</Feedback>
                <label class="field-label" for="composer-goal">业务问题 / 目标</label>
                <textarea
                  id="composer-goal"
                  ref="composerGoal"
                  v-model="goal"
                  class="workspace-input"
                  rows="2"
                  :disabled="sqlBusy"
                  placeholder="例如：订单列表查询在数据量增长后明显变慢，想确认是否缺索引或存在可改写点"
                />
                <details class="composer-more">
                  <summary>完整输入：执行专家、待分析 SQL、数据库资料与模型</summary>
                  <label class="field-label" for="expert-selector">执行专家</label>
                  <select
                    id="expert-selector"
                    v-model="selectedExpert"
                    class="workspace-input"
                    :disabled="sqlBusy"
                  >
                    <option v-for="expert in registeredExperts" :key="expert.id" :value="expert.id">
                      {{ expert.name }}
                    </option>
                  </select>
                  <label v-if="needsPattern" class="field-label">
                    本地检索目标
                    <input
                      v-model="searchPattern"
                      class="workspace-input"
                      :disabled="sqlBusy"
                      placeholder="例如 TODO 或具体符号名"
                    />
                  </label>
                  <label class="field-label" for="sql-code">待分析 SQL</label>
                  <textarea
                    id="sql-code"
                    v-model="sql"
                    class="workspace-input code-input"
                    rows="9"
                    :disabled="sqlBusy"
                    spellcheck="false"
                    placeholder="SELECT …（仅检索知识时可留空）"
                  />
                  <label class="field-label" for="database-selector">已授权资料</label>
                  <select
                    id="database-selector"
                    v-model="selectedDatabase"
                    class="workspace-input"
                    :disabled="sqlBusy"
                  >
                    <option value="">不使用数据库资料</option>
                    <option
                      v-for="profile in allowedDatabases"
                      :key="profile.id"
                      :value="profile.id"
                    >
                      {{ profile.label }}
                    </option>
                  </select>
                  <p v-if="!allowedDatabases.length" class="hint">
                    当前专家没有已配置的数据库资料，请在专家定义中选择资料后重新启用并授权。
                  </p>
                  <label class="field-label" for="explain-input">EXPLAIN JSON 快照</label>
                  <textarea
                    id="explain-input"
                    v-model="explainText"
                    class="workspace-input code-input"
                    rows="4"
                    :disabled="sqlBusy"
                    placeholder="粘贴自行取得的 EXPLAIN JSON，平台不会自动执行 SQL"
                  />
                </details>
                <div class="composer-bar">
                  <label class="row composer-model">
                    <input v-model="enhanceModel" type="checkbox" :disabled="sqlBusy" />
                    显式请求模型增强（输出仍为待验证观察）
                  </label>
                  <span class="hint">默认不连接数据库、不执行 SQL；不要粘贴密码、连接串或业务数据。</span>
                  <Button variant="secondary" type="button" :disabled="sqlBusy" @click="clearComposer">
                    清空
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    :disabled="taskBusy || !goal.trim()"
                    @click="submitTask"
                  >
                    {{ taskBusy ? "执行中…" : "交给本地能力" }}
                  </Button>
                  <Button
                    variant="primary"
                    type="button"
                    :disabled="sqlBusy || !canAnalyze"
                    @click="primaryAction"
                  >
                    {{ sqlBusy ? "正在分析…" : "开始分析" }}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <details class="why">
            <summary>为什么模型不是第一步</summary>
            <p>
              平台先跑本地确定性能力：解析 SQL、抽取结构事实、按规则包判定。只有当确定性证据不足、
              或操作者显式请求时，才把<b>压缩后</b>的证据提交给模型。上面的决策阶段会说明这一次为什么
              调用了模型、为什么没有、或者为什么根本没走到这一步。
            </p>
            <p>
              模型输出永远单独显示在「模型观察（未验证）」下，不会并入确定性发现，也不会被当作已完成的结论；
              它既不修改发现，也不自动完成任何任务。候选改写也一样：可以对照阅读，但不会被执行，
              也不会替换你输入的 SQL。
            </p>
          </details>
        </section>

        <ModelSettings v-else-if="activeView === 'model-settings'" />
        <PluginCenter v-else-if="activeView === 'plugins'" :host="pluginHost" />

        <!-- MANAGERS -->
        <KeepAlive>
          <ExpertManager
            ref="expertManager"
            v-if="activeView === 'experts'"
            @saved="refresh"
            @run="
              selectedExpert = $event;
              activeView = 'sql';
            "
          />
          <KnowledgeManager
            ref="knowledgeManager"
            v-else-if="activeView === 'knowledge'"
            @saved="refresh"
          />
          <DatabaseManager
            ref="databaseManager"
            v-else-if="activeView === 'databases'"
            @saved="refresh"
          />
          <RuleManager ref="ruleManager" v-else-if="activeView === 'rules'" @saved="refresh" />
          <CapabilityManager
            ref="capabilityManager"
            v-else-if="activeView === 'capabilities'"
            @saved="refresh"
          />
        </KeepAlive>
        <PluginSlot :view-id="activeView" :host="pluginHost" />
      </main>

      <!-- INSPECTOR -->
      <button
        v-if="inspectorOpen"
        class="inspector-backdrop"
        aria-label="关闭上下文详情"
        @click="inspectorOpen = false"
      ></button>
      <aside id="context-details" class="inspector" :class="{ 'inspector--open': inspectorOpen }">
        <div class="insp-head">
          <h2>上下文详情</h2>
          <span class="chip">{{ currentView.name }}</span>
          <Button variant="secondary" @click="inspectorOpen = false" class="inspector-toggle"
            >关闭</Button
          >
        </div>
        <p class="hint">{{ inspector.hint }}</p>

        <template v-if="activeView === 'sql'">
          <p v-if="!selectedFinding" class="hint">尚未选择发现：点击上方结果中的任意一条。</p>
          <div v-else class="inspector-card">
            <span class="sev" :class="selectedFinding.severity">{{
              severityText(selectedFinding.severity)
            }}</span>
            <span v-if="isFindingIgnored(selectedFinding.code)" class="ignored-tag">已忽略</span>
            <div class="mono insp-code">{{ selectedFinding.code }}</div>
            <div class="hint">类别：{{ selectedFinding.category }}</div>
            <div class="insp-block"><b>证据</b><br />{{ selectedFinding.evidence }}</div>
            <div class="insp-block">
              <b>建议（语义保持）</b><br />{{ selectedFinding.suggestion }}
            </div>
            <div class="insp-block"><b>确定性置信度</b> {{ selectedFinding.confidence }}</div>
            <div class="form-actions insp-actions">
              <Button variant="secondary" @click="copyFindingAdvice(selectedFinding)">
                复制建议
              </Button>
              <Button variant="secondary" :disabled="!findingRewrite" @click="toggleRewrite">
                {{ rewriteOpen ? "收起改写" : "查看候选改写" }}
              </Button>
              <Button variant="secondary" @click="toggleFindingIgnored(selectedFinding)">
                {{ isFindingIgnored(selectedFinding.code) ? "取消忽略" : "标记忽略" }}
              </Button>
            </div>
            <Feedback v-if="inspectorMessage">{{ inspectorMessage }}</Feedback>
            <div v-if="rewriteOpen && findingRewrite" class="insp-block rew-box">
              <b>候选改写（未执行）</b>
              <p class="hint">{{ findingRewrite.note }}</p>
              <div class="diff">
                <div class="diff-side">
                  <span class="diff-tag del">− 现在</span>
                  <pre>{{ findingRewrite.before }}</pre>
                </div>
                <div class="diff-side">
                  <span class="diff-tag add">＋ 候选</span>
                  <pre>{{ findingRewrite.after }}</pre>
                </div>
              </div>
              <p class="hint">{{ findingRewrite.limitation }}</p>
              <p class="hint">{{ CANDIDATE_REWRITE_NOTES }}</p>
            </div>
            <p v-else class="hint">
              {{
                findingRewrite
                  ? "该发现有一条可从语句本身判定的候选改写；点「查看候选改写」对照阅读。"
                  : "没有候选改写：" + findingRewriteUnavailable
              }}
            </p>
          </div>
        </template>

        <template v-if="activeView === 'sql' && sqlResult && inspector.pipeline">
          <h2>当前任务的流水线走向</h2>
          <div class="pipeline pipeline--stack">
            <div class="stage done">
              <div class="n">1 · 确定性证据</div>
              <div class="t">已运行</div>
              <div class="s">
                AST 解析 → 规则包判定（{{ sqlResult?.rulePacks?.length ?? 0 }} 个包）
              </div>
            </div>
            <div class="stage" :class="decision === 'enhance' ? 'model' : 'skip'">
              <div class="n">2 · 决策</div>
              <div class="t">{{ decisionText(decision) }}</div>
              <div class="s">{{ sqlResult?.modelAdvisor?.rationale ?? "尚未运行分析" }}</div>
            </div>
            <div
              class="stage"
              :class="sqlResult?.modelEnhancement === 'unverified-observation' ? 'model' : ''"
            >
              <div class="n">3 · 模型</div>
              <div class="t">{{ modelEnhancementText(sqlResult?.modelEnhancement) }}</div>
              <div class="s" v-if="compression?.compressionRatio != null">
                压缩比 {{ Math.round((compression.compressionRatio ?? 0) * 100) }}%
              </div>
              <div class="s" v-else>预算未消耗</div>
            </div>
          </div>
        </template>

        <h2>全局说明（与页面无关）</h2>
        <p class="hint">
          输入与证据在平台侧脱敏；只读取显式授权的资料与知识库；未连接业务数据库；未执行输入
          SQL；模型输出仅为待验证观察。
        </p>
      </aside>
    </div>

    <footer v-if="activeView === 'sql'" class="statusbar">
      <span
        >状态：<b>{{ runtimeStatus }}</b></span
      >
      <span
        >工作空间：<b>{{ workspace }}</b></span
      >
      <span
        >最近刷新：<b>{{ lastRefresh || "—" }}</b></span
      >
      <span
        >确定性覆盖：<b>{{ deterministicCoverageText }}</b></span
      >
      <span
        >模型调用（近 {{ stats?.windowDays ?? 7 }} 日）：<b>{{ modelShareText }}</b></span
      >
      <span class="spacer" />
      <span>Apache-2.0</span>
    </footer>
  </div>
</template>
