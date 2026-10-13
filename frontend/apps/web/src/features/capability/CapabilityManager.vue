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
import { Button, ConfirmBox, Badge, Feedback } from "@eap/ui";
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
/** A kind earns a tab when it can be managed or has entries; HTTP currently has neither. */
const visibleKinds = computed(() => kinds.value.filter((kind) => kind.visible));
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
    <p>
      按执行方式分成四类，每类都有自己的管理入口：内置命令在运行时内执行，本地 CLI 需要二进制存在，
      MCP 工具来自显式信任的服务器，HTTP
      服务尚未接入。目录以运行时与处理器声明为准，不是专家定义里的名字清单。
    </p>
    <p class="hint">
      每类能改什么由后端声明，界面不自行推测：内置命令只能启用/停用，本地 CLI
      程序可手动登记并增加固定参数操作， MCP 工具的服务器由操作者登记。手动 CLI
      操作返回脱敏进程证据；发布结构化事实由专用处理器实现。
    </p>
  </div>

  <Feedback
    tone="info"
    v-if="message"
    :class="messageKind === 'error' ? 'eap-feedback--error' : 'eap-feedback--success'"
    role="status"
  >
    {{ message }}
  </Feedback>

  <nav class="manager-tabs" aria-label="能力种类">
    <button :class="{ active: tab === 'overview' }" @click="tab = 'overview'">总览</button>
    <button
      v-for="kind in visibleKinds"
      :key="kind.id"
      :class="{ active: tab === kind.id }"
      @click="tab = kind.id"
    >
      {{ kind.label }}<template v-if="kind.count"> · {{ kind.count }}</template>
    </button>
  </nav>

  <!-- 总览 -->
  <section v-if="tab === 'overview'" class="view">
    <p v-if="loading && !catalog" class="hint">正在读取能力目录…</p>
    <article v-for="kind in kinds" :key="kind.id" class="eap-panel panel-block cap-group">
      <header class="panel-head">
        <div>
          <h2>
            {{ kind.label }} <span class="mono kind-id">{{ kind.id }}</span>
            <Badge
              tone="neutral"
              :class="kind.expertScoped ? 'eap-badge--warning' : 'eap-badge--neutral'"
            >
              {{ kind.scopeLabel }}
            </Badge>
            <Badge tone="warning" v-if="!kind.manageable">无管理入口</Badge>
          </h2>
          <p>{{ kind.description }}</p>
        </div>
        <Badge tone="neutral">{{ kind.count }} 项</Badge>
      </header>
      <p class="hint">
        当前状态：<template v-if="availabilityParts(kind).length">{{
          availabilityParts(kind).join(" · ")
        }}</template
        ><template v-else>暂无能力</template>
      </p>
      <dl class="cap-meta">
        <dt>管理入口</dt>
        <dd>{{ kind.management.label }}：{{ kind.management.description }}</dd>
        <dt>如何产生</dt>
        <dd>{{ kind.management.creation }}</dd>
      </dl>
      <p v-if="kind.manageable" class="hint">
        <Button variant="ghost" @click="tab = kind.id"> 进入{{ kind.label }}管理 </Button>
      </p>
    </article>

    <article class="eap-panel panel-block">
      <h2>声明与注册一致性</h2>
      <p
        v-if="!(catalog?.unregistered ?? []).length && !(catalog?.undeclared ?? []).length"
        class="hint"
      >
        专家清单可引用的能力与运行时实际注册的处理器一一对应。
      </p>
      <Feedback tone="error" v-if="(catalog?.unregistered ?? []).length">
        已声明但没有实现的能力：{{
          (catalog?.unregistered ?? []).join("、")
        }}。专家清单引用它们会导致节点无法执行。
      </Feedback>
      <Feedback tone="error" v-if="(catalog?.undeclared ?? []).length">
        已实现但未在声明词表中的能力：{{
          (catalog?.undeclared ?? []).join("、")
        }}。专家清单无法引用它们。
      </Feedback>
      <p class="hint">
        可全局引用（平台级）{{ (catalog?.globallyUsable ?? []).length }} 项；专家级
        {{ (catalog?.expertScoped ?? []).length }} 项，只能通过专家授权使用。 停用中的能力
        {{ (catalog?.disabledCapabilities ?? []).length }} 项。
      </p>
    </article>

    <article class="eap-panel panel-block">
      <h2>全部能力</h2>
      <div class="table-scroll">
        <table class="facts-table">
          <thead>
            <tr>
              <th>能力</th>
              <th>种类</th>
              <th>范围</th>
              <th>状态</th>
              <th>引用专家</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.name">
              <td class="mono">{{ item.name }}</td>
              <td>{{ item.kindLabel }}</td>
              <td>{{ item.scopeLabel }}</td>
              <td>
                <Badge tone="neutral" :class="availabilityClass(item.availability)">{{
                  item.availabilityLabel
                }}</Badge>
              </td>
              <td>
                {{
                  item.usedBy.join("、") ||
                  (item.declaredBy.length ? item.declaredBy.join("、") + "（草稿）" : "—")
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>

  <!-- 某一类 -->
  <section v-else class="view">
    <article v-if="currentKind" class="eap-panel panel-block">
      <header class="panel-head">
        <div>
          <h2>
            {{ currentKind.label }} <span class="mono kind-id">{{ currentKind.id }}</span>
            <Badge
              tone="neutral"
              :class="currentKind.expertScoped ? 'eap-badge--warning' : 'eap-badge--neutral'"
            >
              {{ currentKind.scopeLabel }}
            </Badge>
          </h2>
          <p>{{ currentKind.description }}</p>
        </div>
        <Badge tone="neutral">{{ currentKind.count }} 项</Badge>
      </header>
      <div class="requirement-block">
        <p class="requirement"><b>这里可以改什么：</b>{{ currentKind.management.description }}</p>
        <p class="requirement"><b>能力本身是怎么来的：</b>{{ currentKind.management.creation }}</p>
      </div>
    </article>

    <!-- 内置命令 -->
    <template v-if="tab === 'command'">
      <article v-for="item in itemsOf('command')" :key="item.name" class="eap-panel panel-block">
        <header class="panel-head">
          <div>
            <h2>
              {{ item.title }} <code class="mono">{{ item.name }}</code>
            </h2>
            <p>{{ item.summary }}</p>
          </div>
          <Badge tone="neutral" :class="availabilityClass(item.availability)">{{
            item.availabilityLabel
          }}</Badge>
        </header>
        <dl class="cap-meta">
          <dt>执行器</dt>
          <dd class="mono">{{ item.executor }}</dd>
          <dt>发布事实</dt>
          <dd class="mono">
            {{ item.facts.length }} 项<template v-if="item.facts.length">
              · {{ item.facts.slice(0, 4).join("、") }}</template
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
        <div class="form-actions">
          <input
            v-model="notesDraft[item.name]"
            class="workspace-input"
            placeholder="备注：为什么停用/启用它（会显示在目录里）"
            :aria-label="item.name + ' 的备注'"
          />
          <Button variant="ghost" @click="saveNote(item)">保存备注</Button>
          <Button
            variant="secondary"
            :class="item.enabled ? 'eap-button--secondary' : 'eap-button--primary'"
            @click="toggle(item)"
          >
            {{ item.enabled ? "停用" : "启用" }}
          </Button>
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
      @saved="
        refresh();
        emit('saved');
      "
    />

    <!-- MCP 工具 -->
    <template v-else-if="tab === 'mcp'">
      <article class="eap-panel panel-block">
        <header class="panel-head">
          <div>
            <h2>MCP 服务器</h2>
            <p>
              {{ servers.length }} 个服务器 ·
              {{ servers.reduce((count, server) => count + server.tools.length, 0) }} 个声明工具
            </p>
          </div>
          <Button
            variant="primary"
            @click="
              resetForm();
              serverEditor = true;
            "
            >＋ 登记服务器</Button
          >
        </header>
      </article>
      <article v-if="serverEditor" class="eap-panel panel-block">
        <h2>{{ editing ? "编辑服务器 " + editing : "登记 MCP 服务器" }}</h2>
        <p class="hint">
          服务器由外部提供，平台只记录它的位置与工具声明清单。<b>登记不等于启用</b>：默认不启用、不信任；
          即使启用并信任，专家仍须在清单里声明该工具、启用时写入授权，才可能被调用。 地址里不要放
          Token 或密钥，凭据请用环境变量注入。
        </p>
        <div class="editor-grid">
          <label class="field-label">
            服务器标识
            <input
              v-model="form.id"
              class="workspace-input mono"
              :disabled="Boolean(editing)"
              placeholder="files"
            />
            <small class="field-help"
              >会拼进能力标识
              mcp.&lt;服务器&gt;.&lt;工具&gt;，只允许小写字母、数字、下划线和连字符。</small
            >
          </label>
          <label class="field-label">
            显示名称
            <input v-model="form.name" class="workspace-input" placeholder="文件服务器" />
          </label>
          <label class="field-label">
            传输方式
            <select v-model="form.transport" class="workspace-input">
              <option value="stdio">stdio（本机进程）</option>
              <option value="http">http（远端地址）</option>
              <option value="sse">sse（远端事件流）</option>
            </select>
          </label>
          <label class="field-label">
            {{ form.transport === "stdio" ? "启动命令" : "服务地址" }}
            <input
              v-model="form.endpoint"
              class="workspace-input mono"
              :placeholder="
                form.transport === 'stdio'
                  ? 'npx -y @modelcontextprotocol/server-filesystem'
                  : 'https://example.com/mcp'
              "
            />
          </label>
          <label class="field-label">
            工具声明清单
            <input v-model="toolsDraft" class="workspace-input mono" placeholder="search, read" />
            <small class="field-help"
              >工具名同样只能用小写字母、数字、下划线和连字符；清单是操作者声明，尚未与服务器协商。</small
            >
          </label>
        </div>
        <div class="form-actions">
          <input
            v-model="toolDraft"
            class="workspace-input"
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
          <label><input v-model="form.enabled" type="checkbox" /> 登记后即启用</label>
          <label><input v-model="form.trusted" type="checkbox" /> 登记后即信任</label>
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
        <header class="panel-head">
          <div>
            <h2>
              {{ server.name }} <span class="mono kind-id">{{ server.id }}</span>
              <Badge
                tone="neutral"
                :class="server.usable ? 'eap-badge--success' : 'eap-badge--warning'"
              >
                {{ server.usable ? "可用于专家授权" : "不可用" }}
              </Badge>
            </h2>
            <p class="mono">{{ server.transport }} · {{ server.endpoint || "（未填写地址）" }}</p>
          </div>
          <Badge tone="neutral">{{ server.tools.length }} 个工具</Badge>
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
            协议验证：{{
              serverProbe[server.id]?.verified ? "已通过" : "未验证（MCP 客户端尚未实现）"
            }}
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
      <p class="hint">
        {{ currentKind?.management.creation ?? "该种类还没有管理入口。" }}
      </p>
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
