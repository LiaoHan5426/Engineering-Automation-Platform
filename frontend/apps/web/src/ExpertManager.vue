<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, toRaw } from "vue";
import { runtimeApi, type CapabilityItem, type CapabilityKindSummary } from "./api";
import { errorMessage } from "./presentation";
import { isExpertScoped as capabilityIsExpertScoped, offersAsNode, unknownDeclaredTools as findUnknownDeclaredTools, undeclaredScopedNodes as findUndeclaredScopedNodes } from "./capabilityScope";
type ExpertDefinition = {
  id: string;
  name: string;
  knowledgeBases?: string[];
  databaseProfiles?: string[];
  steps?: Step[];
  edges?: Array<{ source: string; target: string }>;
  capabilities?: string[];
  rules?: string[];
  rulePacks?: string[];
  /** Expert-scoped capabilities (MCP tools) this expert is authorised to call. */
  mcpTools?: string[];
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
const isBuiltin = computed(() => states.value[id.value]?.builtin === true);
const selectedRules = ref<string[]>(["database.credentials.never-expose"]);
const ruleChoices = [
  { id: "database.credentials.never-expose", name: "禁止泄露数据库凭据" },
  { id: "candidate-sql.must-preserve-semantics", name: "候选 SQL 必须保持原语义" },
];
const loadError = ref("");
const nodeCapability = ref("sql.parse");
const fallbackCapabilities = [
  "sql.parse",
  "knowledge.search",
  "database.schema.read",
  "database.index.read",
  "database.explain",
  "git-status",
  "git-diff",
  "rg-search",
];
// Capabilities and rule packs come from the backend catalog so the editor can never offer an
// option the runtime cannot execute or resolve.
const catalogCapabilities = ref<string[]>([]);
const catalogCapabilityItems = ref<CapabilityItem[]>([]);
const capabilityKinds = ref<CapabilityKindSummary[]>([]);
const nodeOptions = computed(() =>
  catalogCapabilities.value.length ? catalogCapabilities.value : fallbackCapabilities,
);
/**
 * Capabilities offered to the editor, grouped by how they are executed (built-in command / local CLI /
 * MCP tool / HTTP service). Grouping is what keeps an operator from wiring a CLI node into an
 * environment that has no such binary.
 */
const capabilityGroups = computed(() => {
  const groups: Array<{ label: string; options: CapabilityItem[] }> = [];
  if (catalogCapabilityItems.value.length) {
    groups.push(
      ...capabilityKinds.value
        .map((kind) => ({
          label: kind.label + "（" + kind.id + " · " + kind.scopeLabel + "）",
          // Expert-scoped capabilities are deliberately excluded here: the platform has them, this
          // expert does not — that is the whole point of the authorisation block below. Switched-off
          // platform capabilities are excluded too: the runtime refuses to resolve them, and the
          // disabledPlatform hint below says which ones and why.
          options: catalogCapabilityItems.value.filter(
            (item) => item.kind === kind.id && offersAsNode(item, disabledPlatform.value),
          ),
        }))
        .filter((group) => group.options.length),
    );
  } else {
    groups.push({
      label: "能力",
      options: nodeOptions.value.map((name) => ({ name, title: "", kind: "" }) as CapabilityItem),
    });
  }
  // A declared expert-scoped tool becomes selectable as a node — and only a declared one does, which is
  // exactly the difference between "the platform has it" and "this expert may call it".
  const scopedOptions = declaredMcpTools.value.map(
    (name) =>
      catalogCapabilityItems.value.find((item) => item.name === name) ??
      ({ name, title: "专家级能力（已授权本专家）", kind: "mcp", scope: "expert" } as CapabilityItem),
  );
  if (scopedOptions.length) groups.push({ label: "专家级（已授权本专家）", options: scopedOptions });
  return groups;
});
const selectedRulePacks = ref<string[]>([]);
const rulePackChoices = ref<
  Array<{ id: string; name: string; ruleCount: number; shipped: boolean; requires: string[] }>
>([]);
/**
 * Expert-scoped capabilities (MCP tools, remote endpoints). The platform never enables them globally,
 * so they are not offered as ordinary nodes: the expert declares them here, activation records the
 * grant, and only then can a node use one — in this expert's own session.
 */
const expertScopedCapabilities = ref<string[]>([]);
/**
 * Platform capabilities the operator switched off in the capability catalog. The picker filters them
 * out through {@code offersAsNode}, and the reason is shown below the selector, because a silently
 * missing option is indistinguishable from a broken one.
 */
const disabledPlatform = ref<string[]>([]);
const expertScopedVocabulary = ref<string[]>([]);
const mcpServers = ref<Array<{ id: string; name: string; trusted: boolean; enabled: boolean; tools: string[] }>>([]);
const declaredMcpTools = ref<string[]>([]);
const mcpToolToGrant = ref("");
const mcpToolChoices = computed(() =>
  expertScopedVocabulary.value.filter((id) => !declaredMcpTools.value.includes(id)),
);
function isExpertScoped(capability: string) {
  return capabilityIsExpertScoped(capability, catalogCapabilityItems.value, expertScopedVocabulary.value);
}
function addMcpTool() {
  const next = mcpToolToGrant.value || mcpToolChoices.value[0];
  if (next && !declaredMcpTools.value.includes(next)) declaredMcpTools.value = [...declaredMcpTools.value, next];
  mcpToolToGrant.value = "";
}
function removeMcpTool(tool: string) {
  declaredMcpTools.value = declaredMcpTools.value.filter((entry) => entry !== tool);
  // A node whose authorisation just disappeared would be rejected on save anyway; drop it here so the
  // graph never looks runnable when it is not.
  steps.value = steps.value.filter((step) => step.capability !== tool);
}
/** Node capabilities that are expert-scoped but not declared — rejected by the backend, caught here. */
const undeclaredScopedNodes = computed(() =>
  findUndeclaredScopedNodes(steps.value, declaredMcpTools.value, catalogCapabilityItems.value, expertScopedVocabulary.value),
);
/** Declared tools the platform does not publish: a manifest cannot bring a server into existence. */
const unknownDeclaredTools = computed(() =>
  findUnknownDeclaredTools(declaredMcpTools.value, expertScopedVocabulary.value),
);
/**
 * Capabilities the currently selected rule packs need but the graph does not provide. Without this the
 * expert would save fine and simply never produce those findings.
 */
const graphCapabilities = computed(() => new Set(steps.value.map((step) => step.capability)));
const missingCapabilities = computed(() => {
  const needed = new Set<string>();
  for (const id of selectedRulePacks.value) {
    const pack = rulePackChoices.value.find((entry) => entry.id === id);
    for (const capability of pack?.requires ?? []) needed.add(capability);
  }
  return [...needed].filter((capability) => !graphCapabilities.value.has(capability)).sort();
});
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
  try {
    const catalog = await runtimeApi.expertCatalog();
    catalogCapabilities.value = catalog.capabilities ?? [];
    catalogCapabilityItems.value = catalog.capabilityItems ?? [];
    capabilityKinds.value = catalog.capabilityKinds ?? [];
    expertScopedCapabilities.value = catalog.expertScoped ?? [];
    disabledPlatform.value = catalog.disabledPlatform ?? [];
    expertScopedVocabulary.value = catalog.expertScopedVocabulary ?? [];
    mcpServers.value = catalog.mcpServers ?? [];
    rulePackChoices.value = (catalog.rulePacks ?? []).map((pack) => ({
      id: pack.id,
      name: pack.name,
      ruleCount: pack.ruleCount,
      shipped: pack.shipped,
      requires: pack.requires ?? [],
    }));
  } catch {
    catalogCapabilities.value = [];
    catalogCapabilityItems.value = [];
    capabilityKinds.value = [];
    rulePackChoices.value = [];
    disabledPlatform.value = [];
  }
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
  selectedRulePacks.value = [];
  declaredMcpTools.value = [];
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
  selectedRulePacks.value = [...((item.rulePacks as string[] | undefined) ?? [])];
  declaredMcpTools.value = [...((item.mcpTools as string[] | undefined) ?? [])];
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
  // `steps` is the single source of truth for capabilities; a duplicate `capabilities` array used to be
  // written here and could silently disagree with the graph.
  const base = { ...((original.value ?? {}) as Record<string, unknown>) };
  delete base.capabilities;
  return {
    id: id.value,
    name: name.value,
    manifest: JSON.stringify({
      ...base,
      apiVersion: "eap/v1",
      kind: "Expert",
      id: id.value,
      name: name.value,
      knowledgeBases: selectedKnowledge.value,
      databaseProfiles: selectedDatabases.value,
      steps: steps.value,
      edges: edges.value,
      rules: selectedRules.value,
      rulePacks: selectedRulePacks.value,
      // MCP tools are authorisation, not scheduling: declared here, granted on activation, and only
      // then resolvable for this expert's nodes.
      mcpTools: declaredMcpTools.value,
    }),
  };
}
async function submit(save: boolean) {
  const graph = inspectGraph(steps.value, edges.value);
  if (graph.errors.length) {
    message.value = graph.errors.join("；");
    return;
  }
  if (missingCapabilities.value.length) {
    message.value =
      "所选规则包需要能力 " +
      missingCapabilities.value.join("、") +
      "，但流程中没有对应节点：这些规则永远不会命中。请添加对应能力节点，或取消勾选对应规则包。";
    return;
  }
  if (unknownDeclaredTools.value.length) {
    message.value =
      "以下能力是专家级能力（MCP/远端工具），但平台尚未登记对应服务器并放行其工具：" +
      unknownDeclaredTools.value.join("、") +
      "。清单不能让一个服务器存在，请先在能力目录登记服务器与工具白名单。";
    return;
  }
  if (undeclaredScopedNodes.value.length) {
    message.value =
      "节点 " +
      undeclaredScopedNodes.value.map((step) => step.id).join("、") +
      " 使用了专家级能力，但本专家清单未声明授权：MCP 工具不会全局启用，请先在下方勾选对应工具。";
    return;
  }
  if (save && isBuiltin.value) {
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
  } catch (error) {
    message.value = "资料或能力目录加载失败：" + errorMessage(error);
  }
}
async function activate(value: boolean) {
  if (busy.value || dirty.value) return;
  if (
    value &&
    !window.confirm(
      "启用此专家将授权：\n" +
        "· 知识库读取（" +
        (selectedKnowledge.value.join(",") || "无") +
        "）\n· 脱敏数据库资料读取（" +
        (selectedDatabases.value.join(",") || "无") +
        "）\n· 执行流程中声明的能力（" +
        (steps.value.map((step) => step.capability).join(",") || "无") +
        "）\n· MCP 工具（" +
        (declaredMcpTools.value.join(",") || "无") +
        "）：仅本专家可用，不向其他专家开放\n\n是否确认授权？",
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
            isBuiltin
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
            :disabled="busy || isBuiltin || !id.trim() || !name.trim()"
            @click="submit(true)"
          >
            {{ busy ? "处理中…" : "保存草稿" }}
          </button>
          <button
            v-if="!isBuiltin && states[id]"
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
                <optgroup v-for="group in capabilityGroups" :key="group.label" :label="group.label">
                  <option v-for="option in group.options" :key="option.name" :value="option.name">
                    {{ option.name }}<template v-if="option.title"> — {{ option.title }}</template>
                  </option>
                </optgroup></select
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
          <p v-if="disabledPlatform.length" class="hint">
            以下能力已在「能力目录」中停用，因此不出现在上面的选择器里：<span class="mono">{{ disabledPlatform.join("、") }}</span>。
            需要用到它们时，请先在能力目录中重新启用；停用状态会被后端在保存与启用时拒绝。
          </p>
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
          <h3>规则包（专家判定依据）</h3>
          <div class="choice-list">
            <label v-for="pack in rulePackChoices" :key="pack.id" class="pack-choice"
              ><input v-model="selectedRulePacks" type="checkbox" :value="pack.id" />
              <span
                >{{ pack.name }}
                <span class="hint">· {{ pack.ruleCount }} 条规则{{ pack.shipped ? " · 内置" : "" }}</span>
                <small class="requirement-line">
                  需要能力：{{
                    pack.requires.length ? pack.requires.join("、") : "未声明（该包无法通过校验）"
                  }}
                </small></span
              ></label
            >
            <p v-if="!rulePackChoices.length" class="hint">
              没有可引用的规则包。请先到「规则库」复制或新建一个规则包；未引用规则包的专家只做解析与事实抽取。
            </p>
          </div>
          <p v-if="missingCapabilities.length" class="eap-feedback eap-feedback--error">
            所选规则包需要能力 <b>{{ missingCapabilities.join("、") }}</b
            >，但流程中没有对应的能力节点：这些规则依赖的事实不会被产出，规则永远不会命中。请添加对应节点，或取消勾选该规则包。
          </p>
          <small
            >规则包决定该专家命中哪些检查、严重级、证据与建议，并决定何时把压缩后的证据提交给模型；规则本身是数据，可在「规则库」中编辑与试算。规则包所需能力必须与流程节点一致，启用时后端会再次校验。</small
          >
          <h3>MCP 工具授权（专家级能力）</h3>
          <p class="hint">
            MCP 工具不会被平台全局启用：只有这里声明、并在启用时授权的工具，才会成为本专家的节点，且调用发生在
            本专家本次执行自己的会话里。平台未登记或未信任的服务器不会出现在可选项里。
          </p>
          <div class="choice-list">
            <label v-for="tool in declaredMcpTools" :key="tool"
              ><input type="checkbox" checked @change="removeMcpTool(tool)" />
              <span class="mono">{{ tool }}</span></label
            >
            <p v-if="!declaredMcpTools.length" class="hint">未授权任何 MCP 工具。</p>
          </div>
          <div class="form-actions">
            <select v-model="mcpToolToGrant" aria-label="选择要授权的 MCP 工具" :disabled="!mcpToolChoices.length">
              <option v-for="tool in mcpToolChoices" :key="tool" :value="tool">{{ tool }}</option>
            </select>
            <button class="eap-button" :disabled="!mcpToolChoices.length" @click="addMcpTool">授权该工具</button>
          </div>
          <p v-if="!mcpServers.length" class="hint">
            当前没有登记任何 MCP 服务器，因此没有工具可授权（平台专家级能力 {{ expertScopedCapabilities.length }} 项）。这是如实状态，不是错误。
          </p>
          <div v-else class="choice-list">
            <p v-for="server in mcpServers" :key="server.id" class="hint">
              <b>{{ server.name }}</b> <span class="mono">{{ server.id }}</span> ·
              {{ server.trusted && server.enabled ? "已启用并信任" : "未启用或未信任" }} ·
              工具：<span class="mono">{{ server.tools.join("、") || "无" }}</span>
            </p>
          </div>
          <p v-if="unknownDeclaredTools.length" class="eap-feedback eap-feedback--error">
            清单声明的工具 <b>{{ unknownDeclaredTools.join("、") }}</b> 未在任何已启用并信任的 MCP
            服务器中发布：清单不能凭名字让一个服务器存在。
          </p>
          <p v-if="undeclaredScopedNodes.length" class="eap-feedback eap-feedback--error">
            节点 <b>{{ undeclaredScopedNodes.map((step) => step.id).join("、") }}</b>
            使用了专家级能力但未声明授权，保存会被拒绝。请在上方授权对应工具，或移除该节点。
          </p>
          <h3>节点属性</h3>
          <template v-if="selectedStep"
            ><small>节点标识：{{ selectedStep.id }}</small
            ><label>显示名称<input v-model="selectedStep.label" class="workspace-input" /></label
            ><label
              >调用能力<input
                v-model="selectedStep.capability"
                class="workspace-input"
                placeholder="sql.parse" /></label
            ><small v-if="isExpertScoped(selectedStep.capability)" class="requirement-line">
              专家级能力：不会全局启用，只在本专家本次执行的会话内调用；移除授权后该节点会一并移除。
            </small
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
