<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, toRaw } from "vue";
import { runtimeApi } from "./api";
import { errorMessage } from "./presentation";
type ExpertDefinition = {
  id: string;
  name: string;
  knowledgeBases?: string[];
  databaseProfiles?: string[];
  steps?: Step[];
  edges?: Array<{ source: string; target: string }>;
  capabilities?: string[];
  rules?: string[];
  [key: string]: unknown;
};
const emit = defineEmits<{ saved: []; run: [id: string] }>();
const original = ref<ExpertDefinition | null>(null);
const baseline = ref("");
const library = ref<Array<{ id: string; name: string }>>([]);
const selectedKnowledge = ref<string[]>([]);
const selectedDatabases = ref<string[]>([]);
const databaseLibrary = ref<Array<{ id: string; label: string }>>([]);
const states = ref<Record<string, { enabled: boolean; builtin: boolean; revision: number }>>({});
const enabled = computed(() => states.value[id.value]?.enabled === true);
const selectedRules = ref<string[]>(["database.credentials.never-expose"]);
const ruleChoices = [
  { id: "database.credentials.never-expose", name: "禁止泄露数据库凭据" },
  { id: "candidate-sql.must-preserve-semantics", name: "候选 SQL 必须保持原语义" },
];
const loadError = ref("");
const nodeCapability = ref("sql.parse");
const nodeOptions = ref([
  "sql.parse",
  "knowledge.search",
  "database.schema.read",
  "database.index.read",
  "database.explain",
]);
const dirty = computed(() => editing.value && baseline.value !== definition().manifest);
function canLeave() {
  return !dirty.value || window.confirm("当前修改尚未保存，是否放弃修改？");
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onUnmounted(() => window.removeEventListener("beforeunload", beforeUnload));
import WorkflowCanvas from "./WorkflowCanvas.vue";
import { inspectGraph, type WorkflowNode } from "./workflowGraph";
type Step = WorkflowNode;
const items = ref<ExpertDefinition[]>([]);
const id = ref("");
const name = ref("");

const steps = ref<Step[]>([]);
const message = ref("");
const busy = ref(false);
const editing = ref(false);
const selectedNode = ref("");
const selectedStep = computed(() => steps.value.find((step) => step.id === selectedNode.value));
const filter = ref("");
const visibleItems = computed(() =>
  items.value.filter((item) =>
    (item.name + item.id).toLowerCase().includes(filter.value.toLowerCase()),
  ),
);
function addNode() {
  const node = {
    id: crypto.randomUUID(),
    label: nodeCapability.value,
    capability: nodeCapability.value,
    required: true,
  };
  steps.value.push(node);
  selectedNode.value = node.id;
}
function connectInOrder() {
  if (edges.value.length || steps.value.length < 2) return;
  edges.value = steps.value.slice(1).map((step, index) => ({
    source: steps.value[index]!.id,
    target: step.id,
  }));
  message.value = "已按当前列表排列创建串行依赖，请检查箭头方向；此后执行顺序由连线定义。";
}
function removeNode() {
  const node = selectedNode.value;
  steps.value = steps.value.filter((step) => step.id !== node);
  edges.value = edges.value.filter((edge) => edge.source !== node && edge.target !== node);
  selectedNode.value = "";
}
const edges = ref<Array<{ source: string; target: string }>>([]);
watch(dirty, (value) => {
  if (value) window.addEventListener("beforeunload", beforeUnload);
  else window.removeEventListener("beforeunload", beforeUnload);
});
async function load() {
  const response = await runtimeApi.experts();
  states.value = response.states ?? {};
  items.value = response.items.map((text) => JSON.parse(text) as ExpertDefinition);
}
function create() {
  if (!canLeave()) return;
  original.value = null;
  editing.value = true;
  selectedNode.value = "";
  id.value = "";
  name.value = "";
  selectedKnowledge.value = [];
  selectedDatabases.value = [];
  selectedRules.value = ["database.credentials.never-expose"];
  steps.value = [];
  edges.value = [];
  message.value = "";
  baseline.value = definition().manifest;
}
function edit(item: ExpertDefinition) {
  if (!canLeave()) return;
  item = toRaw(item);
  original.value = structuredClone(item);
  editing.value = true;
  selectedNode.value = "";
  edges.value = structuredClone(item.edges ?? []);
  id.value = item.id;
  name.value = item.name;
  selectedKnowledge.value = [...(item.knowledgeBases ?? [])];
  selectedDatabases.value = [...(item.databaseProfiles ?? [])];
  selectedRules.value = [...new Set(["database.credentials.never-expose", ...(item.rules ?? [])])];
  steps.value = structuredClone(
    item.steps ??
      (item.capabilities ?? []).map((capability: string, index: number) => ({
        id: "step-" + (index + 1),
        capability,
        required: true,
      })),
  );
  if (item.steps && item.edges === undefined) {
    edges.value = steps.value.slice(1).map((step, index) => ({
      source: steps.value[index]!.id,
      target: step.id,
    }));
    message.value = "旧版顺序步骤已转换为显式依赖连线，请确认后保存草稿。";
  } else {
    message.value = !item.steps ? "该定义仅有能力清单，没有执行顺序；请手动连接节点。" : "";
  }
  baseline.value = definition().manifest;
}
function copyExpert() {
  if (!original.value) return;
  id.value = original.value.id + "-copy";
  name.value = original.value.name + "（副本）";
  message.value = "已复制，请修改标识后保存为新专家。";
}
function definition() {
  return {
    id: id.value,
    name: name.value,
    manifest: JSON.stringify({
      ...original.value,
      apiVersion: "eap/v1",
      kind: "Expert",
      id: id.value,
      name: name.value,
      knowledgeBases: selectedKnowledge.value,
      databaseProfiles: selectedDatabases.value,
      steps: steps.value,
      edges: edges.value,
      capabilities: [...new Set(steps.value.map((s) => s.capability))],
      rules: selectedRules.value,
    }),
  };
}
async function submit(save: boolean) {
  const graph = inspectGraph(steps.value, edges.value);
  if (graph.errors.length) {
    message.value = graph.errors.join("；");
    return;
  }
  if (save && id.value === "sql-expert") {
    message.value = "内置专家不可覆盖，请点击复制为新专家。";
    return;
  }
  const ids = new Set(steps.value.map((step) => step.id));
  if (ids.size !== steps.value.length || steps.value.some((step) => !step.id || !step.capability)) {
    message.value = "节点标识必须唯一，节点能力不能为空";
    return;
  }
  if (edges.value.some((edge) => !ids.has(edge.source) || !ids.has(edge.target))) {
    message.value = "连线引用了已删除的节点，请移除该连线";
    return;
  }
  const pending = new Set(ids);
  const ordered: Step[] = [];
  while (pending.size) {
    const next = steps.value.find(
      (step) =>
        pending.has(step.id) &&
        !edges.value.some((edge) => edge.target === step.id && pending.has(edge.source)),
    );
    if (!next) {
      message.value = "流程存在循环连线，请调整后保存";
      return;
    }
    ordered.push(next);
    pending.delete(next.id);
  }
  steps.value = ordered;
  busy.value = true;
  const submitted = definition();
  try {
    const result = save
      ? await runtimeApi.saveExpert(submitted)
      : await runtimeApi.validateExpert(submitted);
    message.value = save
      ? "草稿已保存"
      : result.valid
        ? "定义校验通过"
        : (result.errors ?? []).join("；");
    if (save) {
      baseline.value = submitted.manifest;
      await load();
      emit("saved");
    }
  } catch (error) {
    message.value = errorMessage(error);
  } finally {
    busy.value = false;
  }
}
async function refreshData() {
  try {
    await load();
    loadError.value = "";
  } catch (error) {
    loadError.value = errorMessage(error);
  }
  try {
    library.value = (await runtimeApi.knowledgeBases()).items;
  } catch (error) {
    message.value = "知识库列表加载失败：" + errorMessage(error);
  }
  try {
    databaseLibrary.value = (await runtimeApi.databases()).items;
    nodeOptions.value = (await runtimeApi.expertCatalog()).capabilities;
  } catch (error) {
    message.value = "资料或能力目录加载失败：" + errorMessage(error);
  }
}
async function activate(value: boolean) {
  if (busy.value || dirty.value) return;
  if (
    value &&
    !window.confirm(
      "启用此专家将允许其读取所选知识库（" +
        selectedKnowledge.value.join(",") +
        "）及脱敏数据库资料（" +
        selectedDatabases.value.join(",") +
        "），并执行流程中声明的本地能力。是否确认授权？",
    )
  )
    return;
  busy.value = true;
  try {
    await runtimeApi.activateExpert(id.value, value);
    await load();
    message.value = value ? "专家已启用并获得所选资料读取授权" : "专家已停用，资料读取授权已撤销";
    emit("saved");
  } catch (error) {
    message.value = errorMessage(error);
  } finally {
    busy.value = false;
  }
}
defineExpose({ refresh: refreshData });
onMounted(refreshData);
</script>
<template>
  <section class="manager-workspace">
    <aside class="manager-list eap-panel">
      <div class="manager-toolbar">
        <h2>专家</h2>
        <button class="eap-button eap-button--primary" :disabled="busy" @click="create">
          ＋ 新建
        </button>
      </div>
      <p v-if="loadError" class="error-message" role="alert">{{ loadError }}</p>
      <button
        v-if="loadError"
        class="eap-button"
        @click="
          load()
            .then(() => (loadError = ''))
            .catch((error) => (loadError = errorMessage(error)))
        "
      >
        重试加载
      </button>
      <input
        v-model="filter"
        class="workspace-input"
        aria-label="搜索专家"
        placeholder="搜索名称或标识"
      />
      <button
        v-for="item in visibleItems"
        :key="item.id"
        class="manager-item"
        :class="{ active: id === item.id }"
        :disabled="busy"
        @click="edit(item)"
      >
        <strong>{{ item.name }}</strong
        ><small>{{ item.id }}</small>
      </button>
      <p v-if="!visibleItems.length" class="empty-state">暂无匹配专家，点击新建开始配置。</p>
    </aside>
    <div v-if="!editing" class="eap-panel empty-state">
      <h2>构建专家工作流</h2>
      <p>选择专家编辑流程，或创建一个新专家。</p>
      <p>添加能力节点 → 连接节点 → 配置属性 → 校验并保存</p>
      <button class="eap-button eap-button--primary" @click="create">新建专家</button>
    </div>
    <div v-else class="editor-workspace">
      <div class="eap-panel manager-toolbar">
        <div>
          <h2>{{ name || "新专家" }}</h2>
          <small>{{
            id === "sql-expert"
              ? "内置模板 · 请复制后保存"
              : dirty
                ? "草稿 · 有未保存修改"
                : enabled
                  ? "已启用 · 读取授权已生效"
                  : "草稿 · 尚未启用运行"
          }}</small>
        </div>
        <div>
          <button v-if="original" class="eap-button" :disabled="busy" @click="copyExpert">
            复制为新专家</button
          ><button class="eap-button" :disabled="busy" @click="submit(false)">校验</button
          ><button
            class="eap-button eap-button--primary"
            :disabled="busy || id === 'sql-expert' || !id.trim() || !name.trim()"
            @click="submit(true)"
          >
            {{ busy ? "处理中…" : "保存草稿" }}
          </button>
          <button
            v-if="id !== 'sql-expert' && states[id]"
            class="eap-button"
            :disabled="busy || dirty"
            @click="activate(!enabled)"
          >
            {{ enabled ? "停用并撤销授权" : "启用并授权" }}
          </button>
          <button
            v-if="enabled"
            class="eap-button"
            :disabled="busy || dirty"
            @click="emit('run', id)"
          >
            进入运行工作台
          </button>
        </div>
      </div>
      <p v-if="message" class="feedback" role="status">{{ message }}</p>
      <div class="editor-grid">
        <div class="eap-panel">
          <div class="manager-toolbar">
            <h3>流程画布</h3>
            <div class="form-actions">
              <select v-model="nodeCapability" aria-label="选择节点能力">
                <option v-for="option in nodeOptions" :key="option">{{ option }}</option></select
              ><button class="eap-button eap-button--primary" @click="addNode">＋ 添加节点</button>
              <button
                v-if="steps.length > 1 && !edges.length"
                class="eap-button"
                @click="connectInOrder"
              >
                按当前排列串联
              </button>
            </div>
          </div>
          <WorkflowCanvas :nodes="steps" :edges="edges" @select="selectedNode = $event" />
          <p v-if="!steps.length" class="empty-state">点击添加节点开始编排。</p>
        </div>
        <aside class="eap-panel property-panel">
          <h3>专家信息</h3>
          <label
            >标识<input v-model="id" class="workspace-input" placeholder="sql-reviewer" /></label
          ><label>名称<input v-model="name" class="workspace-input" /></label>
          <h3>知识库配置</h3>
          <div class="choice-list">
            <label v-for="base in library" :key="base.id"
              ><input v-model="selectedKnowledge" type="checkbox" :value="base.id" />{{
                base.name
              }}</label
            ><label
              v-for="base in selectedKnowledge.filter(
                (key) => !library.some((item) => item.id === key),
              )"
              :key="base"
              ><input v-model="selectedKnowledge" type="checkbox" :value="base" />{{
                base
              }}（未加载的定义引用）</label
            >
          </div>
          <small>保存只登记引用；点击启用并授权后，运行时才允许读取所选知识库。</small>
          <h3>数据库资料授权</h3>
          <div class="choice-list">
            <label v-for="profile in databaseLibrary" :key="profile.id"
              ><input v-model="selectedDatabases" type="checkbox" :value="profile.id" />{{
                profile.label
              }}</label
            >
          </div>
          <small>仅授权读取人工登记的脱敏快照，不授权连接或执行业务数据库。</small>
          <h3>规则配置</h3>
          <div class="choice-list">
            <label v-for="rule in ruleChoices" :key="rule.id"
              ><input
                v-model="selectedRules"
                type="checkbox"
                :value="rule.id"
                :disabled="rule.id === 'database.credentials.never-expose'"
              />{{ rule.name }}</label
            >
            <label
              v-for="rule in selectedRules.filter(
                (key) => !ruleChoices.some((item) => item.id === key),
              )"
              :key="rule"
              ><input v-model="selectedRules" type="checkbox" :value="rule" />{{ rule }}</label
            >
          </div>
          <small
            >运行时强制检查凭据保护和资料读取范围；模型建议未通过语义或性能验证，不会自动执行。</small
          >
          <h3>节点属性</h3>
          <template v-if="selectedStep"
            ><small>节点标识：{{ selectedStep.id }}</small
            ><label>显示名称<input v-model="selectedStep.label" class="workspace-input" /></label
            ><label
              >调用能力<input
                v-model="selectedStep.capability"
                class="workspace-input"
                placeholder="sql.parse" /></label
            ><label
              ><input v-model="selectedStep.required" type="checkbox" /> 失败时阻止后续执行</label
            ><button class="eap-button" @click="removeNode">移除节点及连线</button></template
          >
          <p v-else class="empty-state">点击画布上的节点标题查看属性。</p>
          <details>
            <summary>高级：Manifest</summary>
            <pre>{{ definition().manifest }}</pre>
          </details>
          <small>保存修改会停用专家并撤销原授权，确认新配置后需要重新启用。</small>
        </aside>
      </div>
    </div>
  </section>
</template>
