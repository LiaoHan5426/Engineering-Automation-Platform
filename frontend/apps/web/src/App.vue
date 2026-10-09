<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import CapabilityManager from "./CapabilityManager.vue";
import ExpertManager from "./ExpertManager.vue";
import KnowledgeManager from "./KnowledgeManager.vue";
import DatabaseManager from "./DatabaseManager.vue";
import RuleManager from "./RuleManager.vue";
import { runtimeApi, type CapabilityItem, type CapabilityKindSummary, type SqlAnalysis, type SqlFinding, type TaskResult } from "./api";
import { errorMessage, statusLabel } from "./presentation";

const views = [
  { id: "overview", name: "概览", icon: "⌂", hint: "运行时状态与最近任务" },
  { id: "tasks", name: "任务", icon: "▤", hint: "提交需求并查看执行证据" },
  { id: "sql", name: "SQL 分析室", icon: "▷", hint: "确定性分析与压缩后的模型观察" },
  { id: "experts", name: "专家工作室", icon: "◈", hint: "编排能力节点、依赖与授权" },
  { id: "rules", name: "规则库", icon: "▤", hint: "查看规则、条件与试算结果" },
  { id: "knowledge", name: "知识库", icon: "▢", hint: "录入业务知识并带来源检索" },
  { id: "databases", name: "数据库资料", icon: "▦", hint: "登记脱敏表结构与索引快照" },
  { id: "capabilities", name: "能力目录", icon: "⚙", hint: "运行时实际注册的确定性工具" },
];
const hashView = typeof location !== "undefined" ? location.hash.slice(1) : "";
const activeView = ref(views.some((v) => v.id === hashView) ? hashView : "overview");
const currentView = computed(() => views.find((v) => v.id === activeView.value)!);

/**
 * 检查器是「按页面取值」的：每个页面声明自己能检查什么，切换页面立刻回到该页的说明，
 * 绝不把上一页的选中项留在那里。只有真正产出逐项结果（发现）的页面才显示选中卡片。
 */
const INSPECTOR_PAGES: Record<string, { hint: string; pipeline?: boolean }> = {
  overview: { hint: "聚合视图，本页没有可逐项检查的对象；点击「最近任务」的一行可进入任务页查看证据。", pipeline: true },
  tasks: { hint: "执行时间线、状态机位置与证据来源在本页内联展示。", pipeline: true },
  sql: { hint: "点击任意一条发现，这里显示它的严重级、证据与语义保持建议。", pipeline: true },
  experts: { hint: "专家的能力引用、知识库与 MCP 工具授权在该专家面板内联展示。" },
  rules: { hint: "规则包的条件、所需能力与试算结果在规则面板内联展示。" },
  knowledge: { hint: "知识库只登记与检索文本，没有可逐项检查的对象。" },
  databases: { hint: "表结构与索引快照在点击「查看」时于资料面板内联展示。" },
  capabilities: { hint: "能力的种类、范围、可用状态与管理入口在能力目录内联展开。" },
};
const inspector = computed(() => INSPECTOR_PAGES[activeView.value] ?? { hint: "本页没有可逐项检查的对象。" });
watch(activeView, (value) => {
  if (typeof location !== "undefined") location.hash = value;
});
function hashChange() {
  const id = location.hash.slice(1);
  if (views.some((v) => v.id === id)) activeView.value = id;
}

const runtimeStatus = ref("检测中");
const refreshing = ref(false);
const errors = ref<Record<string, string>>({});
const capabilities = ref<string[]>([]);
const capabilityItems = ref<CapabilityItem[]>([]);
const capabilityKinds = ref<CapabilityKindSummary[]>([]);
const expertCount = ref(0);
const capabilityManager = ref<{ refresh: () => Promise<void> } | null>(null);
const expertManager = ref<{ refresh: () => Promise<void> } | null>(null);
const knowledgeManager = ref<{ refresh: () => Promise<void> } | null>(null);
const databaseManager = ref<{ refresh: () => Promise<void> } | null>(null);
const ruleManager = ref<{ refresh: () => Promise<void> } | null>(null);
const registeredExperts = ref<
  Array<{ id: string; name: string; databaseProfiles?: string[]; steps?: Array<{ capability: string }> }>
>([]);
const databaseInfo = ref<
  Array<{ id: string; label: string; engine: string; environment: string; credentialsExposed: boolean }>
>([]);

const history = ref<TaskResult[]>([]);
const task = ref<TaskResult | null>(null);
const goal = ref("");
const taskBusy = ref(false);
const taskError = ref("");

const searchPattern = ref("");
const selectedExpert = ref("");
const selectedDatabase = ref("");
const explainText = ref("");
const enhanceModel = ref(false);
const sqlQuestion = ref("");
const sql = ref("");
const sqlResult = ref<SqlAnalysis | null>(null);
const sqlBusy = ref(false);
const sqlError = ref("");
const copyMessage = ref("");
const selectedFinding = ref<SqlFinding | null>(null);

const allowedDatabases = computed(() =>
  databaseInfo.value.filter((profile) =>
    registeredExperts.value
      .find((expert) => expert.id === selectedExpert.value)
      ?.databaseProfiles?.includes(profile.id),
  ),
);
const findings = computed<SqlFinding[]>(() => sqlResult.value?.deterministicAnalysis?.findings ?? []);
const selectedExpertDef = computed(() =>
  registeredExperts.value.find((expert) => expert.id === selectedExpert.value),
);
const needsPattern = computed(() =>
  selectedExpertDef.value?.steps?.some((step) => step.capability === "rg-search"),
);
const decision = computed(() => sqlResult.value?.modelAdvisor?.decision ?? "unavailable");
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
    ["health", async () => {
      const health = await runtimeApi.health();
      runtimeStatus.value = health.status === "ok" ? "已连接" : "服务降级";
    }],
    ["capabilities", async () => {
      const catalog = await runtimeApi.capabilities();
      capabilities.value = catalog.capabilities;
      capabilityItems.value = catalog.items ?? [];
      capabilityKinds.value = catalog.kinds ?? [];
    }],
    ["databases", async () => {
      databaseInfo.value = (await runtimeApi.databases()).items;
    }],
    ["experts", async () => {
      const response = await runtimeApi.experts();
      expertCount.value = response.items.length;
      registeredExperts.value = response.items
        .map((text) => JSON.parse(text))
        .filter((expert) => response.states?.[expert.id]?.enabled);
      if (!registeredExperts.value.some((expert) => expert.id === selectedExpert.value)) {
        selectedExpert.value = registeredExperts.value[0]?.id ?? "";
      }
    }],
    ["tasks", async () => {
      history.value = (await runtimeApi.tasks()).items;
    }],
  ] as const;
  await Promise.all(
    jobs.map(async ([key, work]) => {
      try {
        await work();
      } catch (error) {
        errors.value[key] = errorMessage(error);
        if (key === "health") runtimeStatus.value = "未连接";
      }
    }),
  );
  if (activeView.value === "experts") await expertManager.value?.refresh();
  if (activeView.value === "knowledge") await knowledgeManager.value?.refresh();
  if (activeView.value === "databases") await databaseManager.value?.refresh();
  if (activeView.value === "rules") await ruleManager.value?.refresh();
  refreshing.value = false;
}

async function submitTask() {
  if (taskBusy.value || !goal.value.trim()) return;
  taskBusy.value = true;
  taskError.value = "";
  task.value = null;
  try {
    task.value = await runtimeApi.createTask(goal.value);
    history.value = [task.value, ...history.value.filter((t) => t.id !== task.value!.id)];
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
  if (sqlBusy.value || (!sql.value.trim() && !sqlQuestion.value.trim() && !searchPattern.value.trim()))
    return;
  sqlBusy.value = true;
  sqlError.value = "";
  sqlResult.value = null;
  selectedFinding.value = null;
  copyMessage.value = "";
  try {
    let plan: Record<string, unknown> | undefined;
    if (explainText.value.trim()) {
      const parsed = JSON.parse(explainText.value);
      plan = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!plan || typeof plan !== "object" || Array.isArray(plan))
        throw new Error("执行计划需要是 JSON 对象或 PostgreSQL EXPLAIN JSON 数组");
    }
    sqlResult.value = await runtimeApi.analyzeSql(sql.value, sqlQuestion.value, {
      expertId: selectedExpert.value,
      databaseId: selectedDatabase.value || undefined,
      explainPlan: plan,
      enhanceWithModel: enhanceModel.value,
      pattern: searchPattern.value || undefined,
    });
    selectedFinding.value = findings.value[0] ?? null;
  } catch (error) {
    sqlError.value = errorMessage(error);
  } finally {
    sqlBusy.value = false;
  }
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

onMounted(() => {
  window.addEventListener("hashchange", hashChange);
  void refresh();
});
onUnmounted(() => window.removeEventListener("hashchange", hashChange));
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand"><b>EAP</b><span>工程自动化平台</span></div>
      <span class="ws">工作空间 <b>{{ currentView.name }}</b></span>
      <div class="spacer" />
      <span class="eap-chip" :class="runtimeStatus === '已连接' ? 'ok' : 'warn'">
        <i class="dot" />运行时{{ runtimeStatus }}
      </span>
      <button class="eap-button eap-button--secondary" :disabled="refreshing" @click="refresh">
        {{ refreshing ? "刷新中…" : "刷新" }}
      </button>
    </header>

    <div class="body">
      <nav class="rail" aria-label="主导航">
        <div class="rail__eyebrow">工作空间</div>
        <button
          v-for="view in views"
          :key="view.id"
          class="nav"
          :class="{ active: activeView === view.id }"
          :aria-current="activeView === view.id ? 'page' : undefined"
          @click="activeView = view.id"
        >
          <span class="ic">{{ view.icon }}</span>{{ view.name }}
        </button>
        <div class="rail__foot">确定性能力优先<br /><b>结果必须有独立证据</b><br />模型仅作待验证观察</div>
      </nav>

      <main class="workbench">
        <p v-if="errors.health" class="eap-feedback eap-feedback--error" role="alert">
          {{ errors.health }}
        </p>

        <!-- OVERVIEW -->
        <section v-if="activeView === 'overview'" class="view">
          <div class="page-head">
            <p class="eyebrow">ENGINEERING AUTOMATION PLATFORM</p>
            <h1>概览</h1>
            <p>确定性能力优先处理；仅在证据不足时才压缩后调用模型。</p>
          </div>
          <div class="metrics">
            <article class="metric"><span>已注册能力</span><strong>{{ capabilities.length }}</strong><small>{{ kindSummary }}</small></article>
            <article class="metric"><span>专家定义</span><strong>{{ expertCount }}</strong><small>内置 + 自定义</small></article>
            <article class="metric"><span>任务记录</span><strong>{{ history.length }}</strong><small>最近 100 项</small></article>
            <article class="metric"><span>运行时</span><strong>{{ runtimeStatus }}</strong><small>loopback</small></article>
          </div>
          <article class="eap-panel panel-block">
            <h2>确定性优先</h2>
            <p class="hint">
              平台先运行本地确定性能力并生成结构化证据；只有当确定性证据不足或操作者显式请求时，
              才会把压缩后的证据提交给模型。模型输出始终是与确定性发现分开展示的待验证观察。
            </p>
          </article>
          <article class="eap-panel panel-block">
            <header class="panel-head">
              <div><h2>最近任务</h2><p>点击任务查看执行证据。</p></div>
            </header>
            <table v-if="history.length" class="data-table">
              <thead><tr><th>目标</th><th>状态</th><th>决策</th></tr></thead>
              <tbody>
                <tr v-for="entry in history.slice(0, 8)" :key="entry.id" class="clickable" @click="activeView = 'tasks'; selectHistory(entry)">
                  <td>{{ entry.goal }}</td>
                  <td><span class="eap-badge eap-badge--neutral">{{ statusLabel(entry.status) }}</span></td>
                  <td>{{ statusLabel(entry.decision) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="empty-state">暂无任务记录。</p>
          </article>
        </section>

        <!-- TASKS -->
        <section v-if="activeView === 'tasks'" class="view">
          <div class="page-head">
            <p class="eyebrow">TASKS</p>
            <h1>任务与证据时间线</h1>
            <p>当前支持仓库状态、差异与本地检索；执行状态与实际工具输出分开呈现。</p>
          </div>
          <div class="grid-2">
            <article class="eap-panel">
              <h2>新建任务</h2>
              <form @submit.prevent="submitTask">
                <label class="field-label" for="task-goal">你希望完成什么？</label>
                <textarea id="task-goal" v-model="goal" class="workspace-input" rows="4" :disabled="taskBusy"
                  placeholder="例如：检查当前仓库的 Git 状态" />
                <div class="form-actions">
                  <button type="submit" class="eap-button eap-button--primary" :disabled="taskBusy || !goal.trim()">
                    {{ taskBusy ? "正在执行…" : "提交任务" }}
                  </button>
                  <button type="button" class="eap-button" :disabled="taskBusy" @click="goal = ''">清空</button>
                </div>
              </form>
              <p v-if="taskError" class="eap-feedback eap-feedback--error" role="alert">{{ taskError }}</p>
              <p class="hint">尚无可靠的本地能力处理的需求会明确进入待规划状态，不会执行无关工具。</p>
            </article>
            <article class="eap-panel">
              <h2>执行证据</h2>
              <div v-if="task" class="timeline">
                <div class="result-heading">
                  <strong>{{ statusLabel(task.status) }}</strong>
                  <span class="eap-badge" :class="task.decision === 'accepted' ? 'eap-badge--success' : 'eap-badge--warning'">
                    {{ statusLabel(task.decision) }}
                  </span>
                </div>
                <p>{{ task.goal }}</p>
                <small class="mono">任务编号：{{ task.id }}</small>
                <p v-if="task.status === 'needs-planning'" class="planning-note">
                  尚无可靠的本地能力处理此需求，没有执行无关工具。请补充具体操作目标，或进入 SQL 分析室。
                </p>
                <p v-if="!task.observations" class="planning-note">历史接口当前只返回任务摘要，未返回工具输出。</p>
                <div v-for="(item, index) in task.observations ?? []" :key="index" class="tl-item">
                  <div class="tl-rail"><i :class="item.success ? 'ok' : 'warn'" /><span class="line" /></div>
                  <div class="tl-body">
                    <div class="t">{{ item.capability }} · {{ item.success ? "成功" : "失败" }}</div>
                    <div class="meta">退出码 {{ item.exitCode }}</div>
                    <pre v-if="item.stdout">{{ item.stdout }}</pre>
                    <pre v-if="item.stderr" class="err">{{ item.stderr }}</pre>
                  </div>
                </div>
              </div>
              <p v-else class="empty-state">提交任务或从下方历史选择，以查看证据。</p>
            </article>
          </div>
          <article class="eap-panel panel-block">
            <h2>任务历史</h2>
            <div class="list">
              <button v-for="entry in history" :key="entry.id" class="list-item" :class="{ active: task?.id === entry.id }"
                :disabled="taskBusy" @click="selectHistory(entry)">
                <span><b>{{ entry.goal }}</b><small>{{ statusLabel(entry.status) }} · {{ statusLabel(entry.decision) }}</small></span>
              </button>
            </div>
            <p v-if="!history.length" class="empty-state">暂无任务记录。</p>
          </article>
        </section>

        <!-- SQL STUDIO -->
        <section v-if="activeView === 'sql'" class="view">
          <div class="page-head">
            <p class="eyebrow">SQL STUDIO</p>
            <h1>SQL 分析室</h1>
            <p>选择已启用专家按显式依赖执行；模型仅在需要时被压缩调用，且作为待验证观察展示。</p>
          </div>
          <div class="grid-2">
            <article class="eap-panel">
              <h2>分析输入</h2>
              <form @submit.prevent="analyzeSql">
                <label v-if="needsPattern" class="field-label">本地检索目标
                  <input v-model="searchPattern" class="workspace-input" :disabled="sqlBusy" placeholder="例如 TODO 或具体符号名" />
                </label>
                <label class="field-label" for="expert-selector">执行专家</label>
                <select id="expert-selector" v-model="selectedExpert" class="workspace-input" :disabled="sqlBusy">
                  <option v-for="expert in registeredExperts" :key="expert.id" :value="expert.id">{{ expert.name }}</option>
                </select>
                <label for="sql-question" class="field-label">业务问题 / 目标</label>
                <textarea id="sql-question" v-model="sqlQuestion" class="workspace-input" rows="2" :disabled="sqlBusy"
                  placeholder="描述慢查询现象、数据规模和期望结果" />
                <label for="sql-code" class="field-label">待分析 SQL</label>
                <textarea id="sql-code" v-model="sql" class="workspace-input code-input" rows="10" :disabled="sqlBusy"
                  spellcheck="false" placeholder="SELECT …（仅检索知识时可留空）" />
                <details>
                  <summary>可选上下文：数据库资料与执行计划</summary>
                  <label class="field-label" for="database-selector">已授权资料</label>
                  <select id="database-selector" v-model="selectedDatabase" class="workspace-input" :disabled="sqlBusy">
                    <option value="">不使用数据库资料</option>
                    <option v-for="profile in allowedDatabases" :key="profile.id" :value="profile.id">{{ profile.label }}</option>
                  </select>
                  <p v-if="!allowedDatabases.length" class="hint">
                    当前专家没有已配置的数据库资料，请在专家工作室中选择资料后重新启用并授权。
                  </p>
                  <label class="field-label" for="explain-input">EXPLAIN JSON 快照</label>
                  <textarea id="explain-input" v-model="explainText" class="workspace-input code-input" rows="4" :disabled="sqlBusy"
                    placeholder="粘贴自行取得的 EXPLAIN JSON，平台不会自动执行 SQL" />
                </details>
                <label class="row hint" style="margin-top: 12px">
                  <input v-model="enhanceModel" type="checkbox" :disabled="sqlBusy" />
                  显式请求模型增强（输出仍为待验证观察）
                </label>
                <p class="hint">不要粘贴密码、连接字符串或业务数据。默认只执行确定性流程，不调用模型，不自动连接数据库执行 SQL。</p>
                <div class="form-actions">
                  <button type="submit" class="eap-button eap-button--primary"
                    :disabled="sqlBusy || (!sql.trim() && !sqlQuestion.trim() && !searchPattern.trim())">
                    {{ sqlBusy ? "正在分析…" : "开始分析" }}
                  </button>
                  <button type="button" class="eap-button" :disabled="sqlBusy"
                    @click="sql = ''; sqlQuestion = ''; sqlResult = null; sqlError = ''; explainText = ''; selectedDatabase = ''; selectedFinding = null">
                    清空
                  </button>
                </div>
              </form>
              <p v-if="sqlError" class="eap-feedback eap-feedback--error" role="alert">{{ sqlError }}</p>
            </article>

            <article class="eap-panel" id="resultCard">
              <header class="panel-head">
                <div><h2>分析结果</h2><p>建议、证据与模型走向分开展示</p></div>
                <span v-if="sqlResult" class="eap-badge eap-badge--success">{{ statusLabel(sqlResult.status) }}</span>
              </header>
              <p v-if="sqlBusy" class="eap-feedback" role="status">正在分析并检索知识…</p>
              <div v-else-if="sqlResult" class="result">
                <div class="pipeline">
                  <div class="stage done">
                    <div class="n">1 · 确定性</div><div class="t">已运行</div>
                    <div class="s">{{ findings.length }} 条发现 · 置信度 {{ sqlResult.deterministicAnalysis?.deterministicConfidence ?? "—" }}</div>
                  </div>
                  <div class="stage" :class="decision === 'enhance' ? 'model' : 'skip'">
                    <div class="n">2 · 决策</div><div class="t">{{ decisionText(decision) }}</div>
                    <div class="s">{{ sqlResult.modelAdvisor?.rationale ?? "—" }}</div>
                  </div>
                  <div class="stage" :class="sqlResult.modelEnhancement === 'unverified-observation' ? 'model' : ''">
                    <div class="n">3 · 模型</div><div class="t">{{ modelEnhancementText(sqlResult.modelEnhancement) }}</div>
                    <div class="s" v-if="compression?.compressionRatio != null">
                      压缩比 {{ Math.round((compression.compressionRatio ?? 0) * 100) }}% · 预计 {{ compression.estimatedTokens }} tokens
                    </div>
                    <div class="s" v-else>确定性完成，无需模型</div>
                  </div>
                </div>

                <h3>发现（{{ findings.length }}）</h3>
                <div class="findings">
                  <button v-for="finding in findings" :key="finding.code" class="finding"
                    :class="{ sel: selectedFinding?.code === finding.code }" @click="selectedFinding = finding">
                    <span class="sev" :class="finding.severity">{{ severityText(finding.severity) }}</span>
                    <span>
                      <span class="code mono">{{ finding.code }}</span>
                      <p class="evidence">{{ finding.evidence }}</p>
                      <span class="cat">类别：{{ finding.category }}</span>
                    </span>
                  </button>
                  <p v-if="!findings.length" class="empty-state">
                    未触发确定性规则。这不代表 SQL 已通过优化检查，请补充表结构与执行计划。
                  </p>
                </div>

                <h3>适用规则包（{{ sqlResult.rulePacks?.length ?? 0 }}）</h3>
                <div class="chips">
                  <span v-for="pack in sqlResult.rulePacks ?? []" :key="pack.id" class="eap-badge eap-badge--neutral">
                    {{ pack.name }} · {{ pack.ruleCount }} 条规则
                    <template v-if="pack.requires?.length"> · 需要 {{ pack.requires.join("、") }}</template>
                  </span>
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
                      <span class="eap-badge" :class="check.met ? 'eap-badge--success' : 'eap-badge--warning'">
                        {{ check.met ? "能力齐备" : "缺少 " + check.missing.join("、") }}
                      </span>
                      <span class="hint">需要：{{ check.required.join("、") }}</span>
                    </div>
                  </div>
                </template>

                <template v-if="blockedRules.length">
                  <h3>未判定的规则（{{ blockedRules.length }}）</h3>
                  <p class="eap-feedback">
                    下列规则依赖的能力本次没有执行，因此它们的证据缺失。这 <b>不等于</b> 没有发现问题。
                  </p>
                  <ul class="advice-list">
                    <li v-for="item in blockedRules" :key="item.rule">
                      <code class="mono">{{ item.rule }}</code> · 缺少能力
                      {{ item.missingCapabilities.join("、") }} · 相关事实
                      {{ item.missingFacts.join("、") }}
                    </li>
                  </ul>
                </template>

                <details v-if="factEntries.length">
                  <summary>命中事实（{{ factEntries.length }}）</summary>
                  <p class="hint">发现来自这些结构事实；规则包只能引用词表中已声明的事实。</p>
                  <table class="data-table facts-table">
                    <thead><tr><th>事实</th><th>值</th></tr></thead>
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
                <p v-else class="empty-state">本次没有返回可验证建议，请补充上下文。</p>

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
                        <span class="eap-badge" :class="node.state === 'succeeded' ? 'eap-badge--success' : 'eap-badge--warning'">
                          {{ statusLabel(node.state) }}
                        </span>
                      </div>
                      <small class="mono">{{ node.capability }}</small>
                      <p>{{ node.message }}</p>
                    </li>
                  </ol>
                </details>

                <details v-if="sqlResult.safety?.length">
                  <summary>安全与执行说明</summary>
                  <ul><li v-for="item in sqlResult.safety" :key="item">{{ item }}</li></ul>
                </details>

                <div class="form-actions">
                  <button class="eap-button" :disabled="!sqlResult.advice?.length && !sqlResult.expertAdvice" @click="copyResult">复制建议</button>
                  <span role="status" class="hint">{{ copyMessage }}</span>
                </div>
              </div>
              <div v-else class="empty-state">填写问题或 SQL 后开始分析，结果将在此显示。</div>
            </article>
          </div>
        </section>

        <!-- MANAGERS -->
        <KeepAlive>
          <ExpertManager ref="expertManager" v-if="activeView === 'experts'" @saved="refresh"
            @run="selectedExpert = $event; activeView = 'sql'" />
          <KnowledgeManager ref="knowledgeManager" v-else-if="activeView === 'knowledge'" />
          <DatabaseManager ref="databaseManager" v-else-if="activeView === 'databases'" @saved="refresh" />
          <RuleManager ref="ruleManager" v-else-if="activeView === 'rules'" />
          <CapabilityManager
            ref="capabilityManager"
            v-else-if="activeView === 'capabilities'"
            @saved="refresh"
          />
        </KeepAlive>

      </main>

      <!-- INSPECTOR -->
      <aside class="inspector">
        <div class="insp-head">
          <h2>检查器</h2>
          <span class="chip">{{ currentView.name }}</span>
        </div>
        <p class="hint">{{ inspector.hint }}</p>

        <template v-if="activeView === 'sql'">
          <p v-if="!selectedFinding" class="hint">尚未选择发现：点击上方结果中的任意一条。</p>
          <div v-else class="inspector-card">
            <span class="sev" :class="selectedFinding.severity">{{ severityText(selectedFinding.severity) }}</span>
            <div class="mono insp-code">{{ selectedFinding.code }}</div>
            <div class="hint">类别：{{ selectedFinding.category }}</div>
            <div class="insp-block"><b>证据</b><br />{{ selectedFinding.evidence }}</div>
            <div class="insp-block"><b>建议（语义保持）</b><br />{{ selectedFinding.suggestion }}</div>
            <div class="insp-block"><b>确定性置信度</b> {{ selectedFinding.confidence }}</div>
          </div>
        </template>

        <template v-if="inspector.pipeline">
          <h2>当前任务的流水线走向</h2>
          <div class="pipeline pipeline--stack">
            <div class="stage done"><div class="n">1 · 确定性证据</div><div class="t">已运行</div><div class="s">AST 解析 → 规则包判定（{{ sqlResult?.rulePacks?.length ?? 0 }} 个包）</div></div>
            <div class="stage" :class="decision === 'enhance' ? 'model' : 'skip'">
              <div class="n">2 · 决策</div><div class="t">{{ decisionText(decision) }}</div>
              <div class="s">{{ sqlResult?.modelAdvisor?.rationale ?? "尚未运行分析" }}</div>
            </div>
            <div class="stage" :class="sqlResult?.modelEnhancement === 'unverified-observation' ? 'model' : ''">
              <div class="n">3 · 模型</div><div class="t">{{ modelEnhancementText(sqlResult?.modelEnhancement) }}</div>
              <div class="s" v-if="compression?.compressionRatio != null">压缩比 {{ Math.round((compression.compressionRatio ?? 0) * 100) }}%</div>
              <div class="s" v-else>预算未消耗</div>
            </div>
          </div>
        </template>

        <h2>全局说明（与页面无关）</h2>
        <p class="hint">输入与证据在平台侧脱敏；只读取显式授权的资料与知识库；未连接业务数据库；未执行输入 SQL；模型输出仅为待验证观察。</p>
      </aside>
    </div>

    <footer class="statusbar">
      <span>状态：<b>{{ runtimeStatus }}</b></span>
      <span>能力：<b>{{ capabilities.length }}</b></span>
      <span>专家：<b>{{ expertCount }}</b></span>
      <span>确定性优先：<b>100%</b></span>
      <span class="spacer" />
      <span>Apache-2.0</span>
    </footer>
  </div>
</template>
