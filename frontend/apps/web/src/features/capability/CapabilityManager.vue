<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  runtimeApi,
  type CapabilityItem,
  type CapabilityKindSummary,
  type CapabilityResponse,
  type McpProbeResult,
  type McpServerItem,
  type McpServerRequest,
} from "@eap/runtime-client";
import { Badge, Button, Checkbox, ConfirmBox, Feedback, Input, Select, Tabs } from "@eap/ui";
import { Table, type TableColumn } from "@eap/plugin-table";
import { errorMessage } from "../../lib/presentation";
import CliProgramManager from "./CliProgramManager.vue";

const emit = defineEmits<{ (event: "saved"): void }>();

const catalog = ref<CapabilityResponse | null>(null);
const loading = ref(false);
const message = ref("");
const messageKind = ref<"error" | "success">("success");
const tab = ref("overview");

/** Drafts, keyed by capability: a note explains a switch, a binary points a CLI capability at a file. */
const notesDraft = ref<Record<string, string>>({});
const serverProbe = ref<Record<string, McpProbeResult>>({});

const blankForm = (): McpServerRequest => ({
  id: "",
  name: "",
  transport: "stdio",
  endpoint: "",
  tools: [],
  trusted: false,
  enabled: false,
});
const form = ref<McpServerRequest>(blankForm());
const toolsDraft = ref("");
const editing = ref("");
const serverEditor = ref(false);
const toolDraft = ref("");
const deletingServer = ref<McpServerItem | null>(null);
const deletingServerBusy = ref(false);
const deleteRefusal = ref("");
const toolNames = computed(() => [...new Set(toolsDraft.value.split(/[,，\s]+/).filter(Boolean))]);
function addTool() {
  const name = toolDraft.value.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,60}$/.test(name))
    return feedback("error", "工具名只允许小写字母、数字、下划线和连字符。");
  toolsDraft.value = [...new Set([...toolNames.value, name])].join(", ");
  toolDraft.value = "";
}
function removeTool(name: string) {
  toolsDraft.value = toolNames.value.filter((tool) => tool !== name).join(", ");
}

const kinds = computed<CapabilityKindSummary[]>(() => catalog.value?.kinds ?? []);
const items = computed<CapabilityItem[]>(() => catalog.value?.items ?? []);
const capabilityColumns: TableColumn[] = [
  { key: "name", title: "能力", mono: true },
  { key: "kindLabel", title: "种类" },
  { key: "scopeLabel", title: "范围" },
  { key: "availability", title: "状态" },
  { key: "experts", title: "引用专家" },
];
/** A kind earns a tab when it can be managed or has entries; HTTP currently has neither. */
const visibleKinds = computed(() => kinds.value.filter((kind) => kind.visible));
const capabilityTabs = computed(() => [
  { id: "overview", label: "总览" },
  ...visibleKinds.value.map((kind) => ({
    id: kind.id,
    label: kind.count ? `${kind.label} · ${kind.count}` : kind.label,
  })),
]);
const currentKind = computed(() => kinds.value.find((kind) => kind.id === tab.value) ?? null);
const servers = computed<McpServerItem[]>(() => catalog.value?.mcpServers ?? []);
const settings = computed(() => catalog.value?.settings ?? {});

function itemsOf(kindId: string) {
  return items.value.filter((item) => item.kind === kindId);
}
/** Labels for availability states, taken from the runtime so the UI cannot invent its own wording. */
const availabilityLabels = computed(() => {
  const labels: Record<string, string> = {};
  for (const item of items.value) labels[item.availability] = item.availabilityLabel;
  return labels;
});
function availabilityParts(kind: CapabilityKindSummary) {
  return Object.entries(kind.availability)
    .filter(([id, count]) => id !== "total" && Number(count) > 0)
    .map(([id, count]) => `${availabilityLabels.value[id] ?? id} ${count}`);
}
function availabilityClass(value: string) {
  return value === "available" ? "eap-badge--success" : "eap-badge--warning";
}
function feedback(kind: "error" | "success", text: string) {
  messageKind.value = kind;
  message.value = text;
}

async function refresh() {
  loading.value = true;
  try {
    catalog.value = await runtimeApi.capabilities();
    for (const item of items.value) {
      if (notesDraft.value[item.name] === undefined) notesDraft.value[item.name] = item.notes;
    }
    if (!kinds.value.some((kind) => kind.id === tab.value) && tab.value !== "overview")
      tab.value = "overview";
  } catch (error) {
    feedback("error", errorMessage(error));
  } finally {
    loading.value = false;
  }
}
onMounted(refresh);
defineExpose({ refresh });

/** The switch every kind shares. The backend refuses it while an enabled expert depends on the capability. */
async function toggle(item: CapabilityItem) {
  const next = !item.enabled;
  if (!next && item.usedBy.length) {
    feedback(
      "error",
      `能力 ${item.name} 正被已启用专家引用：${item.usedBy.join("、")}。后端会拒绝停用，请先停用这些专家或从它们的流程中移除该节点。`,
    );
    return;
  }
  try {
    await runtimeApi.setCapabilityActivation(item.name, next, notesDraft.value[item.name] ?? "");
    feedback("success", `${item.name} 已${next ? "启用" : "停用"}。`);
    await refresh();
    emit("saved");
  } catch (error) {
    feedback("error", errorMessage(error));
  }
}

async function saveNote(item: CapabilityItem) {
  try {
    await runtimeApi.setCapabilityActivation(
      item.name,
      item.enabled,
      notesDraft.value[item.name] ?? "",
    );
    feedback("success", `已保存 ${item.name} 的备注。`);
    await refresh();
  } catch (error) {
    feedback("error", errorMessage(error));
  }
}

async function setServerActivation(server: McpServerItem, enabled: boolean, trusted: boolean) {
  try {
    await runtimeApi.setMcpServerActivation(server.id, enabled, trusted);
    feedback(
      "success",
      `${server.id} 已更新。注册不等于可用：只有同时启用并信任，其工具才会被发布。`,
    );
    await refresh();
    emit("saved");
  } catch (error) {
    feedback("error", errorMessage(error));
  }
}

async function runServerProbe(server: McpServerItem) {
  try {
    const result = await runtimeApi.probeMcpServer(server.id);
    serverProbe.value = { ...serverProbe.value, [server.id]: result };
    feedback(result.reachable ? "success" : "error", result.message);
  } catch (error) {
    feedback("error", errorMessage(error));
  }
}

async function removeServer(server: McpServerItem) {
  deletingServerBusy.value = true;
  try {
    await runtimeApi.deleteMcpServer(server.id);
    feedback("success", `${server.id} 已删除。`);
    await refresh();
    emit("saved");
    deletingServer.value = null;
  } catch (error) {
    feedback("error", errorMessage(error));
    deleteRefusal.value = errorMessage(error);
  } finally {
    deletingServerBusy.value = false;
  }
}

function editServer(server: McpServerItem) {
  serverEditor.value = true;
  editing.value = server.id;
  form.value = {
    id: server.id,
    name: server.name,
    transport: server.transport,
    endpoint: server.endpoint,
    tools: [...server.tools],
    trusted: server.trusted,
    enabled: server.enabled,
  };
  toolsDraft.value = server.tools.join(", ");
  tab.value = "mcp";
}

function resetForm() {
  serverEditor.value = false;
  editing.value = "";
  form.value = blankForm();
  toolsDraft.value = "";
}

async function submitServer() {
  const tools = toolsDraft.value
    .split(/[,，\s]+/)
    .map((tool) => tool.trim())
    .filter(Boolean);
  const payload: McpServerRequest = { ...form.value, tools };
  try {
    if (editing.value) await runtimeApi.updateMcpServer(editing.value, payload);
    else await runtimeApi.saveMcpServer(payload);
    feedback("success", `已保存 ${payload.id}。服务器默认不启用、不信任，专家仍需逐工具声明授权。`);
    resetForm();
    await refresh();
    emit("saved");
  } catch (error) {
    feedback("error", errorMessage(error));
  }
}
</script>

<template>
  <div class="page-head">
    <p class="eyebrow">CAPABILITIES</p>
    <h1>能力目录</h1>
  </div>

  <Feedback
    tone="info"
    v-if="message"
    :class="messageKind === 'error' ? 'eap-feedback--error' : 'eap-feedback--success'"
    role="status"
  >
    {{ message }}
  </Feedback>

  <Tabs v-model="tab" class="manager-tabs" label="能力种类" :tabs="capabilityTabs" />

  <!-- 总览 -->
  <section v-if="tab === 'overview'" class="view">
    <p v-if="loading && !catalog" class="hint">正在读取能力目录…</p>
    <article v-for="kind in kinds" :key="kind.id" class="eap-panel panel-block cap-group">
      <header class="cap-head">
        <div class="cap-head__main">
          <h2>
            <Badge class="cap-head__scope" :tone="kind.expertScoped ? 'warning' : 'neutral'">
              {{ kind.scopeLabel }}
            </Badge>
            {{ kind.label }} <span class="mono kind-id">{{ kind.id }}</span>
          </h2>
          <p>{{ kind.description }}</p>
        </div>
        <div class="cap-head__status">
          <Badge tone="warning" v-if="!kind.manageable">无管理入口</Badge>
          <span class="cap-status">{{
            availabilityParts(kind).join(" · ") || "暂无能力"
          }}</span>
        </div>
        <div v-if="kind.manageable" class="cap-head__tools">
          <Button variant="secondary" size="sm" @click="tab = kind.id">进入管理</Button>
        </div>
      </header>
    </article>

    <article
      v-if="(catalog?.unregistered ?? []).length || (catalog?.undeclared ?? []).length"
      class="eap-panel panel-block"
    >
      <h2>能力声明不一致</h2>
      <Feedback tone="error" v-if="(catalog?.unregistered ?? []).length">
        已声明但没有实现：{{ (catalog?.unregistered ?? []).join("、") }}。引用它们的专家节点无法执行。
      </Feedback>
      <Feedback tone="error" v-if="(catalog?.undeclared ?? []).length">
        已实现但未声明：{{ (catalog?.undeclared ?? []).join("、") }}。专家清单无法引用它们。
      </Feedback>
    </article>

    <article class="eap-panel panel-block">
      <h2>全部能力</h2>
      <Table :columns="capabilityColumns" :rows="items" row-key="name">
        <template #availability="{ row }">
          <Badge tone="neutral" :class="availabilityClass(row.availability)">{{
            row.availabilityLabel
          }}</Badge>
        </template>
        <template #experts="{ row }">
          {{
            row.usedBy.join("、") ||
            (row.declaredBy.length ? row.declaredBy.join("、") + "（草稿）" : "—")
          }}
        </template>
      </Table>
    </article>
  </section>

  <!-- 某一类 -->
  <section v-else class="view">
    <article v-if="currentKind && tab !== 'cli'" class="eap-panel panel-block cap-group">
      <header class="cap-head">
        <div class="cap-head__main">
          <h2>
            <Badge class="cap-head__scope" :tone="currentKind.expertScoped ? 'warning' : 'neutral'">
              {{ currentKind.scopeLabel }}
            </Badge>
            {{ currentKind.label }} <span class="mono kind-id">{{ currentKind.id }}</span>
          </h2>
          <p>{{ currentKind.description }}</p>
        </div>
        <div class="cap-head__status">
          <span class="cap-status">{{ currentKind.count }} 项</span>
        </div>
      </header>
    </article>

    <!-- 内置命令 -->
    <template v-if="tab === 'command'">
      <article v-for="item in itemsOf('command')" :key="item.name" class="eap-panel panel-block cap-group">
        <header class="cap-head">
          <div class="cap-head__main">
            <h2>
              {{ item.title }} <code class="mono">{{ item.name }}</code>
            </h2>
            <p>{{ item.summary }}</p>
          </div>
          <div class="cap-head__status">
            <Badge tone="neutral" :class="availabilityClass(item.availability)">{{
              item.availabilityLabel
            }}</Badge>
          </div>
          <div class="cap-head__tools">
            <Button
              :variant="item.enabled ? 'secondary' : 'primary'"
              size="sm"
              @click="toggle(item)"
            >
              {{ item.enabled ? "停用" : "启用" }}
            </Button>
          </div>
        </header>
        <dl class="cap-meta">
          <dt>执行器</dt>
          <dd>{{ item.executor }}</dd>
          <dt>发布事实</dt>
          <dd>
            {{ item.facts.length }} 项<template v-if="item.facts.length">
              · <span class="mono">{{ item.facts.slice(0, 4).join("、") }}</span></template
            >
          </dd>
          <dt>引用情况</dt>
          <dd>
            <template v-if="item.usedBy.length">已启用专家：{{ item.usedBy.join("、") }}</template>
            <template v-else-if="item.declaredBy.length"
              >草稿引用：{{ item.declaredBy.join("、") }}（不影响停用）</template
            >
            <template v-else>暂无专家引用</template>
          </dd>
        </dl>
        <div class="note-row">
          <Input
            v-model="notesDraft[item.name]"
            placeholder="备注：为什么停用/启用它（会显示在目录里）"
            :aria-label="item.name + ' 的备注'"
          />
          <Button variant="ghost" size="sm" @click="saveNote(item)">保存备注</Button>
        </div>
        <p v-if="item.usedBy.length" class="hint">
          仍被已启用专家引用时，后端会拒绝停用并点名这些专家——停用会让它们的节点在执行时失败。
        </p>
      </article>
      <article v-if="!itemsOf('command').length" class="eap-panel panel-block">
        <p class="hint">运行时没有注册任何内置命令。</p>
      </article>
    </template>

    <!-- 本地 CLI -->
    <CliProgramManager
      v-else-if="tab === 'cli'"
      :items="items"
      :kind="currentKind"
      @saved="
        refresh();
        emit('saved');
      "
    />

    <!-- MCP 工具 -->
    <template v-else-if="tab === 'mcp'">
      <article class="eap-panel panel-block">
        <header class="cap-head">
          <div class="cap-head__main">
            <h2>MCP 服务器</h2>
            <p>登记服务器地址和它声明的工具。默认不启用。</p>
          </div>
          <div class="cap-head__status">
            <span class="cap-status">
              {{ servers.length }} 个服务器 ·
              {{ servers.reduce((count, server) => count + server.tools.length, 0) }} 个工具
            </span>
          </div>
          <div class="cap-head__tools">
            <Button
              variant="primary"
              size="sm"
              @click="
                resetForm();
                serverEditor = true;
              "
              >＋ 登记服务器</Button
            >
          </div>
        </header>
      </article>
      <article v-if="serverEditor" class="eap-panel panel-block">
        <h2>{{ editing ? "编辑服务器 " + editing : "登记 MCP 服务器" }}</h2>
        <p class="hint">地址中不要填写 Token 或密钥。</p>
        <div class="editor-grid">
          <label class="field-label">
            服务器标识
            <Input
              v-model="form.id"
              class="mono"
              :disabled="Boolean(editing)"
              placeholder="files"
            />
            <small class="field-help">只允许小写字母、数字、下划线和连字符。</small>
          </label>
          <label class="field-label">
            显示名称
            <Input v-model="form.name" placeholder="文件服务器" />
          </label>
          <label class="field-label">
            传输方式
            <Select v-model="form.transport">
              <option value="stdio">stdio（本机进程）</option>
              <option value="http">http（远端地址）</option>
              <option value="sse">sse（远端事件流）</option>
            </Select>
          </label>
          <label class="field-label">
            {{ form.transport === "stdio" ? "启动命令" : "服务地址" }}
            <Input
              v-model="form.endpoint"
              class="mono"
              :placeholder="
                form.transport === 'stdio'
                  ? 'npx -y @modelcontextprotocol/server-filesystem'
                  : 'https://example.com/mcp'
              "
            />
          </label>
          <label class="field-label">
            工具声明清单
            <Input v-model="toolsDraft" class="mono" placeholder="search, read" />
            <small class="field-help"
              >工具名同样只能用小写字母、数字、下划线和连字符；清单是操作者声明，尚未与服务器协商。</small
            >
          </label>
        </div>
        <div class="form-actions">
          <Input
            v-model="toolDraft"
           
            aria-label="新增工具名称"
            placeholder="新增工具：search"
          /><Button variant="secondary" @click="addTool">添加工具</Button>
        </div>
        <div class="form-actions">
          <Button
            variant="ghost"
            v-for="tool in toolNames"
            :key="tool"
            :aria-label="'移除工具 ' + tool"
            @click="removeTool(tool)"
          >
            {{ tool }} ×
          </Button>
        </div>
        <p class="hint">
          <label><Checkbox v-model="form.enabled" /> 登记后即启用</label>
          <label><Checkbox v-model="form.trusted" /> 登记后即信任</label>
        </p>
        <div class="form-actions">
          <Button variant="primary" @click="submitServer">
            {{ editing ? "保存修改" : "登记服务器" }}
          </Button>
          <Button variant="ghost" @click="resetForm">取消</Button>
        </div>
      </article>

      <p v-if="!servers.length" class="eap-panel panel-block hint">
        尚未登记任何 MCP
        服务器，因此没有专家级工具可被调用。这是如实状态，不是错误：目录不会因为「应该有」就列出不存在的能力。
      </p>

      <article v-for="server in servers" :key="server.id" class="eap-panel panel-block">
        <header class="cap-head">
          <div class="cap-head__main">
            <h2>
              {{ server.name }} <span class="mono kind-id">{{ server.id }}</span>
            </h2>
            <p class="mono">{{ server.transport }} · {{ server.endpoint || "（未填写地址）" }}</p>
          </div>
          <div class="cap-head__status">
            <Badge :tone="server.usable ? 'success' : 'warning'">
              {{ server.usable ? "可用于专家授权" : "不可用" }}
            </Badge>
            <span class="cap-status">{{ server.tools.length }} 个工具</span>
          </div>
        </header>
        <dl class="cap-meta">
          <dt>工具声明清单</dt>
          <dd class="mono">{{ server.tools.join("、") || "空（不会发布任何能力）" }}</dd>
          <dt>发布的能力</dt>
          <dd class="mono">{{ server.capabilities.join("、") || "—" }}</dd>
          <dt>已授权专家</dt>
          <dd>{{ server.authorisedExperts.join("、") || "暂无（需由专家清单声明 mcpTools）" }}</dd>
        </dl>
        <p v-for="problem in server.problems" :key="problem" class="requirement-line">
          {{ problem }}
        </p>
        <div class="form-actions">
          <Button
            variant="secondary"
            :class="server.enabled ? 'eap-button--secondary' : 'eap-button--primary'"
            @click="setServerActivation(server, !server.enabled, server.trusted)"
          >
            {{ server.enabled ? "停用" : "启用" }}
          </Button>
          <Button
            variant="secondary"
            :class="server.trusted ? 'eap-button--secondary' : 'eap-button--primary'"
            @click="setServerActivation(server, server.enabled, !server.trusted)"
          >
            {{ server.trusted ? "撤回信任" : "信任" }}
          </Button>
          <Button variant="ghost" @click="runServerProbe(server)">探测</Button>
          <Button variant="ghost" @click="editServer(server)">编辑</Button>
          <Button
            variant="ghost"
            @click="
              deletingServer = server;
              deleteRefusal = '';
            "
          >
            删除
          </Button>
        </div>
        <div v-if="serverProbe[server.id]" class="dry-result">
          <p class="hint">{{ serverProbe[server.id]?.message }}</p>
          <p class="hint mono">
            连通检查：{{ serverProbe[server.id]?.verified ? "已通过" : "未通过" }}
          </p>
        </div>
        <p class="hint">撤回信任、停用或删除被已启用专家授权使用的服务器，后端会拒绝并点名专家。</p>
      </article>

      <article class="eap-panel panel-block">
        <h2>由服务器发布的能力</h2>
        <p v-if="!itemsOf('mcp').length" class="hint">
          还没有任何服务器发布工具，因此没有专家级能力。
        </p>
        <ul v-else class="list">
          <li v-for="item in itemsOf('mcp')" :key="item.name" class="list-item">
            <span>
              <b class="mono">{{ item.name }}</b>
              <small>{{ item.summary }}</small>
              <small class="hint"
                >已授权专家：{{ item.authorisedExperts.join("、") || "暂无" }}</small
              >
            </span>
            <Badge tone="neutral" :class="availabilityClass(item.availability)">
              {{ item.availabilityLabel }}
            </Badge>
          </li>
        </ul>
      </article>
    </template>

    <!-- 其他种类：还没有管理入口，如实说明，不给出一个点了没有反应的界面 -->
    <article v-else class="eap-panel panel-block">
      <p class="hint">该种类还没有管理入口。</p>
      <ul v-if="itemsOf(currentKind?.id ?? '').length" class="list">
        <li v-for="item in itemsOf(currentKind?.id ?? '')" :key="item.name" class="list-item">
          <span
            ><b class="mono">{{ item.name }}</b
            ><small>{{ item.summary }}</small></span
          >
          <Badge tone="neutral" :class="availabilityClass(item.availability)">{{
            item.availabilityLabel
          }}</Badge>
        </li>
      </ul>
      <p v-else class="hint">该种类当前没有任何能力。</p>
    </article>

    <p v-if="Object.keys(settings).length" class="hint">
      已记录的开关设置：<span class="mono">{{ Object.keys(settings).join("、") }}</span>
    </p>
  </section>
  <ConfirmBox
    v-if="deletingServer"
    :title="'删除 MCP 服务器 ' + deletingServer.id"
    :impact="[
      '该服务器的 ' + deletingServer.tools.length + ' 个工具将从目录移除。',
      '已启用专家仍持有工具授权时无法删除。',
    ]"
    confirm-label="确认删除服务器"
    :busy="deletingServerBusy"
    :refusal="deleteRefusal"
    danger
    @confirm="removeServer(deletingServer)"
    @cancel="deletingServer = null"
  />
</template>
