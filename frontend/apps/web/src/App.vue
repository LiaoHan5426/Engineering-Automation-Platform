<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import ExpertManager from "./ExpertManager.vue";
import KnowledgeManager from "./KnowledgeManager.vue";
import DatabaseManager from "./DatabaseManager.vue";
import { Badge, Button, Panel, EmptyState, Feedback } from "@eap/ui";
import { runtimeApi, type SqlAnalysis, type TaskResult } from "./api";
import { errorMessage, statusLabel } from "./presentation";
const views = [
  { id: "tasks", name: "任务工作台", hint: "提交需求，查看执行结果与独立证据" },
  { id: "sql", name: "SQL 分析", hint: "分别提供业务问题和 SQL，查看建议与知识依据" },
  { id: "experts", name: "专家编排", hint: "管理专家草稿、能力依赖与知识配置" },
  { id: "knowledge", name: "知识库", hint: "录入业务知识，查阅文档并检索已保存的内容" },
  { id: "databases", name: "数据库信息", hint: "查看后端提供的脱敏数据库元信息" },
  { id: "capabilities", name: "本地能力", hint: "查看当前运行时实际注册的确定性工具" },
];
const activeView = ref(
  views.some((v) => v.id === location.hash.slice(1)) ? location.hash.slice(1) : "tasks",
);
const currentView = computed(() => views.find((v) => v.id === activeView.value)!);
watch(activeView, (value) => {
  location.hash = value;
});
function hashChange() {
  const id = location.hash.slice(1);
  if (views.some((v) => v.id === id)) activeView.value = id;
}
const runtimeStatus = ref("检测中"),
  refreshing = ref(false),
  errors = ref<Record<string, string>>({});
const capabilities = ref<string[]>([]),
  expertCount = ref(0);
const expertManager = ref<{ refresh: () => Promise<void> } | null>(null);
const knowledgeManager = ref<{ refresh: () => Promise<void> } | null>(null);
const databaseManager = ref<{ refresh: () => Promise<void> } | null>(null);
const registeredExperts = ref<
  Array<{
    id: string;
    name: string;
    databaseProfiles?: string[];
    steps?: Array<{ capability: string }>;
  }>
>([]);
const searchPattern = ref("");
const selectedExpert = ref("sql-expert"),
  selectedDatabase = ref(""),
  explainText = ref(""),
  enhanceModel = ref(false);
const allowedDatabases = computed(() =>
  databaseInfo.value.filter((profile) =>
    registeredExperts.value
      .find((expert) => expert.id === selectedExpert.value)
      ?.databaseProfiles?.includes(profile.id),
  ),
);
watch(selectedExpert, () => {
  selectedDatabase.value = "";
  searchPattern.value = "";
  sqlResult.value = null;
});
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
const databaseInfo = ref<
  Array<{
    id: string;
    label: string;
    engine: string;
    environment: string;
    credentialsExposed: boolean;
  }>
>([]);
const history = ref<TaskResult[]>([]),
  task = ref<TaskResult | null>(null),
  goal = ref(""),
  taskBusy = ref(false),
  taskError = ref("");
const sqlQuestion = ref(""),
  sql = ref(""),
  sqlResult = ref<SqlAnalysis | null>(null),
  sqlBusy = ref(false),
  sqlError = ref(""),
  copyMessage = ref("");
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
        capabilities.value = (await runtimeApi.capabilities()).capabilities;
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
        registeredExperts.value = response.items
          .map((text) => JSON.parse(text))
          .filter((expert) => expert.id === "sql-expert" || response.states?.[expert.id]?.enabled);
      },
    ],
    [
      "tasks",
      async () => {
        history.value = (await runtimeApi.tasks()).items;
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
      }
    }),
  );
  if (activeView.value === "experts") await expertManager.value?.refresh();
  if (activeView.value === "knowledge") await knowledgeManager.value?.refresh();
  if (activeView.value === "databases") await databaseManager.value?.refresh();
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
async function analyzeSql() {
  if (
    sqlBusy.value ||
    (!sql.value.trim() && !sqlQuestion.value.trim() && !searchPattern.value.trim())
  )
    return;
  sqlBusy.value = true;
  sqlError.value = "";
  sqlResult.value = null;
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
onMounted(() => {
  window.addEventListener("hashchange", hashChange);
  void refresh();
});
onUnmounted(() => window.removeEventListener("hashchange", hashChange));
</script>
<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">EAP <span>工程自动化平台</span></div>
      <p class="eyebrow">工作空间</p>
      <nav aria-label="主导航">
        <button
          v-for="view in views"
          :key="view.id"
          :class="{ active: activeView === view.id }"
          :aria-current="activeView === view.id ? 'page' : undefined"
          @click="activeView = view.id"
        >
          {{ view.name }}
        </button>
      </nav>
      <div class="sidebar__footer">确定性能力优先<br /><span>结果必须有独立证据</span></div>
    </aside>
    <main class="content">
      <header class="topbar">
        <div>
          <p class="eyebrow">ENGINEERING AUTOMATION PLATFORM</p>
          <h1>{{ currentView.name }}</h1>
          <p class="page-description">{{ currentView.hint }}</p>
        </div>
        <div class="topbar__actions">
          <Badge
            :label="runtimeStatus"
            :tone="runtimeStatus === '已连接' ? 'success' : 'warning'"
          /><button
            class="eap-button eap-button--secondary"
            :disabled="refreshing"
            @click="refresh"
          >
            {{ refreshing ? "刷新中…" : "刷新数据" }}
          </button>
        </div>
      </header>
      <Feedback v-if="errors.health" tone="error" :message="errors.health" />
      <section v-if="activeView === 'tasks'" class="workbench">
        <div>
          <Panel
            title="新建任务"
            description="当前支持仓库状态、差异与本地检索；其他需求会明确进入待规划状态"
          >
            <form @submit.prevent="submitTask">
              <label for="task-goal" class="field-label">你希望完成什么？</label
              ><textarea
                id="task-goal"
                v-model="goal"
                class="workspace-input"
                rows="5"
                :disabled="taskBusy"
                placeholder="例如：检查当前仓库的 Git 状态"
              ></textarea>
              <div class="form-actions">
                <button
                  type="submit"
                  class="eap-button eap-button--primary"
                  :disabled="taskBusy || !goal.trim()"
                >
                  {{ taskBusy ? "正在执行…" : "提交任务" }}</button
                ><button type="button" class="eap-button" :disabled="taskBusy" @click="goal = ''">
                  清空输入
                </button>
              </div>
            </form>
            <Feedback v-if="taskError" tone="error" :message="taskError" />
            <p v-if="taskBusy" class="feedback" role="status">
              正在等待运行时返回结果，请勿重复提交。
            </p>
          </Panel>
          <Panel title="任务结果" description="执行状态与实际工具输出分开呈现">
            <div v-if="task" class="result">
              <div class="result-heading">
                <strong>{{ statusLabel(task.status) }}</strong
                ><Badge
                  :label="statusLabel(task.decision)"
                  :tone="task.decision === 'accepted' ? 'success' : 'warning'"
                />
              </div>
              <p>{{ task.goal }}</p>
              <small>任务编号：{{ task.id }}</small>
              <p v-if="task.status === 'needs-planning'" class="planning-note">
                尚无可靠的本地能力处理此需求，没有执行无关工具。请补充具体操作目标，或进入 SQL
                分析工作台处理 SQL 问题。
              </p>
              <p v-if="!task.observations" class="planning-note">
                历史接口当前只返回任务摘要，未返回工具输出，不能据此查看完整执行证据。
              </p>
              <details
                v-for="(item, index) in task.observations ?? []"
                :key="index"
                class="observation"
                open
              >
                <summary>
                  {{ item.capability }} · {{ item.success ? "成功" : "失败" }} · 退出码
                  {{ item.exitCode }}
                </summary>
                <h4 v-if="item.stdout">标准输出</h4>
                <pre v-if="item.stdout">{{ item.stdout }}</pre>
                <h4 v-if="item.stderr">错误输出</h4>
                <pre v-if="item.stderr">{{ item.stderr }}</pre>
                <p v-if="!item.stdout && !item.stderr">工具未返回文本输出。</p>
              </details>
            </div>
            <div v-else class="empty-state">
              提交任务后在这里查看结果，也可以从右侧选择历史任务。
            </div>
          </Panel>
        </div>
        <Panel title="任务历史" description="从 PostgreSQL 加载最近100项任务，点击查看完整证据"
          ><p v-if="errors.tasks" class="error-message" role="alert">{{ errors.tasks }}</p>
          <p v-if="refreshing" role="status">正在加载…</p>
          <div class="history-list">
            <button
              v-for="entry in history"
              :key="entry.id"
              class="manager-item"
              :class="{ active: task?.id === entry.id }"
              :disabled="taskBusy"
              @click="selectHistory(entry)"
            >
              <strong>{{ entry.goal }}</strong
              ><small>{{ statusLabel(entry.status) }}</small>
            </button>
          </div>
          <p v-if="!history.length && !refreshing && !errors.tasks" class="empty-state">
            暂无任务记录。
          </p></Panel
        >
      </section>
      <KeepAlive
        ><ExpertManager
          ref="expertManager"
          v-if="activeView === 'experts'"
          @saved="refresh"
          @run="
            selectedExpert = $event;
            activeView = 'sql';
          " /><KnowledgeManager
          ref="knowledgeManager"
          v-else-if="activeView === 'knowledge'" /><DatabaseManager
          ref="databaseManager"
          v-else-if="activeView === 'databases'"
          @saved="refresh"
      /></KeepAlive>
      <section v-if="activeView === 'sql'" class="sql-workbench">
        <Panel title="分析输入" description="选择已启用专家，按显式依赖执行，并返回逐节点证据">
          <form @submit.prevent="analyzeSql">
            <label
              v-if="
                registeredExperts
                  .find((expert) => expert.id === selectedExpert)
                  ?.steps?.some((step) => step.capability === 'rg-search')
              "
              >本地检索目标<input
                v-model="searchPattern"
                class="workspace-input"
                :disabled="sqlBusy"
                placeholder="例如 TODO 或具体符号名"
            /></label>
            <label class="field-label" for="expert-selector">执行专家</label
            ><select
              id="expert-selector"
              v-model="selectedExpert"
              class="workspace-input"
              :disabled="sqlBusy"
            >
              <option v-for="expert in registeredExperts" :key="expert.id" :value="expert.id">
                {{ expert.name }}
              </option>
            </select>
            <label for="sql-question" class="field-label">业务问题 / 目标</label
            ><textarea
              id="sql-question"
              v-model="sqlQuestion"
              class="workspace-input"
              rows="3"
              :disabled="sqlBusy"
              placeholder="描述慢查询现象、数据规模和期望结果"
            ></textarea
            ><label for="sql-code" class="field-label">待分析 SQL</label
            ><textarea
              id="sql-code"
              v-model="sql"
              class="workspace-input code-input"
              rows="12"
              :disabled="sqlBusy"
              spellcheck="false"
              placeholder="SELECT …（仅检索知识时可留空）"
            ></textarea>
            <details>
              <summary>可选上下文：数据库资料与执行计划</summary>
              <label class="field-label" for="database-selector">已授权资料</label
              ><select
                id="database-selector"
                v-model="selectedDatabase"
                class="workspace-input"
                :disabled="sqlBusy"
              >
                <option value="">不使用数据库资料</option>
                <option v-for="profile in allowedDatabases" :key="profile.id" :value="profile.id">
                  {{ profile.label }}
                </option>
              </select>
              <p v-if="!allowedDatabases.length" class="field-help">
                当前专家没有已配置的数据库资料，请在专家编排中选择资料后重新启用并授权。
              </p>
              <label class="field-label" for="explain-input">EXPLAIN JSON 快照</label
              ><textarea
                id="explain-input"
                v-model="explainText"
                rows="6"
                class="workspace-input code-input"
                :disabled="sqlBusy"
                placeholder="粘贴自行取得的 EXPLAIN JSON，平台不会自动执行 SQL"
              ></textarea>
            </details>
            <label class="field-help"
              ><input
                v-model="enhanceModel"
                type="checkbox"
                :disabled="sqlBusy"
              />可选本地模型增强（需后端已启用；输出仍待独立验证）</label
            >
            <p class="field-help">
              不要粘贴密码、连接字符串或业务数据。默认只执行确定性流程，不调用模型，不自动连接数据库执行
              SQL。
            </p>
            <div class="form-actions">
              <button
                class="eap-button eap-button--primary"
                :disabled="sqlBusy || (!sql.trim() && !sqlQuestion.trim() && !searchPattern.trim())"
              >
                {{ sqlBusy ? "正在分析…" : "开始分析" }}</button
              ><button
                type="button"
                class="eap-button"
                :disabled="sqlBusy"
                @click="
                  sql = '';
                  sqlQuestion = '';
                  sqlResult = null;
                  sqlError = '';
                  explainText = '';
                  selectedDatabase = '';
                "
              >
                清空
              </button>
            </div>
          </form>
          <Feedback v-if="sqlError" tone="error" :message="sqlError" />
        </Panel>
        <Panel title="分析结果" description="建议、知识依据与安全说明">
          <p v-if="sqlBusy" class="feedback" role="status">正在分析 SQL 并检索知识…</p>
          <div v-else-if="sqlResult" class="result">
            <Feedback
              v-if="sqlResult.modelEnhancement === 'unavailable'"
              message="模型增强未返回结果，确定性分析已继续完成，不需要模型即可查看本次结果。"
            />
            <div class="result-heading">
              <strong>{{ statusLabel(sqlResult.status) }}</strong
              ><small>{{ statusLabel(sqlResult.analysisMode) }}</small>
            </div>
            <p v-if="sqlResult.message" class="planning-note">{{ sqlResult.message }}</p>
            <details v-if="sqlResult.nodes?.length" open>
              <summary>流程执行记录</summary>
              <ol class="execution-list">
                <li v-for="node in sqlResult.nodes" :key="node.id">
                  <div class="result-heading">
                    <strong>{{ node.label }}</strong
                    ><Badge
                      :label="statusLabel(node.state)"
                      :tone="node.state === 'succeeded' ? 'success' : 'warning'"
                    />
                  </div>
                  <small>{{ node.capability }}</small>
                  <p>{{ node.message }}</p>
                </li>
              </ol>
            </details>
            <h3>优化建议</h3>
            <ol v-if="sqlResult.advice?.length" class="advice-list">
              <li v-for="item in sqlResult.advice" :key="item">{{ item }}</li>
            </ol>
            <p v-else class="empty-state">
              本次没有返回可验证建议。请补充表结构、索引和执行计划；这不代表 SQL 已通过优化检查。
            </p>
            <section v-if="sqlResult.expertAdvice">
              <h3>模型补充建议</h3>
              <p class="preserve-text">{{ sqlResult.expertAdvice }}</p>
            </section>
            <details :open="!!sqlResult.knowledgeEvidence?.length">
              <summary>知识依据（{{ sqlResult.knowledgeEvidence?.length ?? 0 }}）</summary>
              <article
                v-for="(item, index) in sqlResult.knowledgeEvidence"
                :key="index"
                class="observation"
              >
                <strong>{{ item.knowledgeBase }} / {{ item.source }}</strong>
                <p class="preserve-text">{{ item.excerpt }}</p>
              </article>
              <p v-if="!sqlResult.knowledgeEvidence?.length">
                没有返回匹配知识，可在知识库录入相关业务说明或验证案例。
              </p>
            </details>
            <details v-if="sqlResult.safety?.length">
              <summary>安全与执行说明</summary>
              <ul>
                <li v-for="item in sqlResult.safety" :key="item">{{ item }}</li>
              </ul>
            </details>
            <div class="form-actions">
              <Button
                label="复制建议"
                :disabled="!sqlResult.advice?.length && !sqlResult.expertAdvice"
                @click="copyResult"
              /><span role="status">{{ copyMessage }}</span>
            </div>
          </div>
          <EmptyState
            v-else
            title="等待分析"
            description="填写问题或 SQL 后开始分析，结果将在此显示。"
        /></Panel>
      </section>
      <section v-if="activeView === 'capabilities'">
        <Panel
          title="已注册能力"
          description="以运行时返回为准；专家定义中的能力标识不等于已实现的工具"
          ><p v-if="errors.capabilities" class="error-message" role="alert">
            {{ errors.capabilities }}
          </p>
          <div class="capability-grid">
            <article v-for="item in capabilities" :key="item" class="observation">
              <code>{{ item }}</code>
              <p>已在本地运行时注册</p>
            </article>
          </div>
          <p v-if="!capabilities.length && !errors.capabilities" class="empty-state">
            当前没有注册能力。
          </p>
          <p class="field-help">
            专家目录包含 {{ expertCount }} 个定义；草稿保存不代表已启用执行。
          </p></Panel
        >
      </section>
    </main>
  </div>
</template>
