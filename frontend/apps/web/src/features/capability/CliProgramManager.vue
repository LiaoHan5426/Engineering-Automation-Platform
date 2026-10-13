<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { runtimeApi, type CapabilityItem, type CliProgramItem, type CliOperationItem, type CliProbeResult } from "@eap/runtime-client";
import { errorMessage } from "../../lib/presentation";
import ConfirmBox from "../../components/ConfirmBox.vue";

const props = defineProps<{ items: CapabilityItem[] }>();
const emit = defineEmits<{ saved: [] }>();
const programs = ref<CliProgramItem[]>([]);
const busy = ref(false);
const message = ref("");
const failed = ref(false);
const filter = ref("all");
const programEditor = ref(false);
const programForm = ref({ id: "", name: "", binary: "" });
const operationProgram = ref("");
const operationEditing = ref(false);
const operationForm = ref({ capabilityId: "", title: "", args: "[]", description: "" });
const binaryDraft = ref<Record<string, string>>({});
const notesDraft = ref<Record<string, string>>({});
const probes = ref<Record<string, CliProbeResult>>({});
const pendingDelete = ref<{ programId: string; operationId?: string; title: string } | null>(null);
const itemFor = (id: string) => props.items.find(item => item.name === id);
const visiblePrograms = computed(() => programs.value.filter(program => filter.value === "all" || program.operations.some(op => {
  const item = itemFor(op.capabilityId);
  return filter.value === "disabled" ? item?.enabled === false : item?.availability !== "available";
})));
async function refresh() {
  programs.value = (await runtimeApi.cliPrograms()).items;
  for (const program of programs.value) binaryDraft.value[program.id] = program.channel.source === "operator" ? program.channel.binary : "";
  for (const item of props.items) if (notesDraft.value[item.name] === undefined) notesDraft.value[item.name] = item.notes;
}
onMounted(() => action(refresh));
watch(() => props.items, () => { void refresh().catch(error => { failed.value = true; message.value = errorMessage(error); }); });
async function action(work: () => Promise<unknown>, success = "") {
  if (busy.value) return;
  busy.value = true; message.value = ""; failed.value = false;
  try { await work(); message.value = success; }
  catch (error) { failed.value = true; message.value = errorMessage(error); }
  finally { busy.value = false; }
}
async function changed() { await refresh(); emit("saved"); }
function addOperation(program: CliProgramItem, operation?: CliOperationItem) {
  operationProgram.value = program.id;
  operationEditing.value = !!operation;
  operationForm.value = operation ? { capabilityId: operation.capabilityId, title: operation.title, args: JSON.stringify(operation.args), description: operation.description } : { capabilityId: "", title: "", args: "[]", description: "" };
}
async function register() {
  await action(async () => { await runtimeApi.registerCliProgram(programForm.value); programEditor.value = false; programForm.value = {id:"",name:"",binary:""}; await changed(); }, "CLI 程序已登记，请按需增加操作。");
}
async function saveOperation() {
  await action(async () => {
    const args: unknown = JSON.parse(operationForm.value.args);
    if (!Array.isArray(args) || !args.every(arg => typeof arg === "string")) throw new Error("固定参数应填写字符串数组，例如 [\"log\", \"--oneline\", \"-10\"]");
    await runtimeApi.saveCliOperation(operationProgram.value, { ...operationForm.value, args }, operationEditing.value);
    operationProgram.value = ""; await changed();
  }, "操作已保存，可以在专家流程中选择。");
}
async function configure(program: CliProgramItem, reset = false) {
  await action(async () => { await runtimeApi.configureCliProgram(program.id, reset ? "" : binaryDraft.value[program.id] ?? ""); await changed(); }, "程序位置已更新，对其下全部操作生效。");
}
async function probe(program: CliProgramItem) {
  await action(async () => { const result = await runtimeApi.probeCliProgram(program.id); probes.value[program.id] = result; if (!result.success) throw new Error(result.message); }, "程序探测成功。");
}
async function toggle(operation: CliOperationItem) {
  const item = itemFor(operation.capabilityId); if (!item) return;
  await action(async () => { await runtimeApi.setCapabilityActivation(item.name, !item.enabled, item.notes); await changed(); }, "操作状态已更新。");
}
async function saveNote(operation: CliOperationItem) {
  const item = itemFor(operation.capabilityId); if (!item) return;
  await action(async () => { await runtimeApi.setCapabilityActivation(item.name, item.enabled, notesDraft.value[item.name] ?? ""); await changed(); }, "操作备注已保存。");
}
async function remove() {
  const target = pendingDelete.value; if (!target) return;
  await action(async () => {
    if (target.operationId) await runtimeApi.deleteCliOperation(target.programId, target.operationId);
    else await runtimeApi.deleteCliProgram(target.programId);
    pendingDelete.value = null; await changed();
  }, "已删除。");
}
</script>

<template>
  <article class="eap-panel panel-block">
    <header class="panel-head">
      <div><h2>CLI 程序</h2><p>一个程序登记一次。Git 已预置 status、diff 操作，可以直接在专家流程中选择。</p></div>
      <button class="eap-button eap-button--primary" :disabled="busy" @click="programEditor = !programEditor">＋ 登记程序</button>
    </header>
    <p v-if="message" class="eap-feedback" :class="failed ? 'eap-feedback--error' : 'eap-feedback--success'" role="status">{{ message }}</p>
    <form v-if="programEditor" class="form-grid" @submit.prevent="register">
      <label>程序标识<input v-model="programForm.id" required placeholder="eslint" /></label>
      <label>程序名称<input v-model="programForm.name" required placeholder="ESLint" /></label>
      <label>可执行文件<input v-model="programForm.binary" required placeholder="eslint 或绝对路径" /></label>
      <div class="form-actions"><button class="eap-button eap-button--primary" :disabled="busy">登记程序</button><button type="button" class="eap-button" @click="programEditor = false">取消</button></div>
    </form>
    <div class="form-actions"><label>显示范围<select v-model="filter"><option value="all">全部</option><option value="problem">需处理</option><option value="disabled">包含已停用操作</option></select></label><span class="hint">{{ programs.length }} 个程序 · {{ items.filter(item => item.kind === 'cli').length }} 个操作</span></div>
  </article>
  <article v-for="program in visiblePrograms" :key="program.id" class="eap-panel panel-block">
    <header class="panel-head"><div><h2>{{ program.name }} <code>{{ program.id }}</code></h2><p>{{ program.operations.length }} 个操作 · {{ program.builtin ? '预置程序' : '手动程序' }}</p></div><button v-if="!program.builtin" class="eap-button eap-button--ghost" :disabled="busy" @click="pendingDelete = {programId:program.id,title:program.name}">删除程序</button></header>
    <dl class="cap-meta"><dt>默认程序</dt><dd class="mono">{{ program.binary }}</dd><dt>当前生效</dt><dd class="mono">{{ program.channel.binary }}</dd><dt>解析路径</dt><dd class="mono">{{ program.channel.resolvedPath ?? '缺少可执行文件' }}</dd></dl>
    <div class="form-actions"><input v-model="binaryDraft[program.id]" class="workspace-input mono" :placeholder="program.binary" :aria-label="program.name + ' 二进制位置'" /><button class="eap-button" :disabled="busy" @click="configure(program)">保存位置</button><button class="eap-button" :disabled="busy" @click="configure(program,true)">恢复默认</button><button class="eap-button" :disabled="busy" @click="probe(program)">探测程序</button></div>
    <pre v-if="probes[program.id]" class="mono dry-result">{{ probes[program.id]?.message }}{{ probes[program.id]?.output ? '\n' + probes[program.id]?.output : '' }}</pre>
    <header class="panel-head"><h3>可调用操作</h3><button class="eap-button eap-button--ghost" :disabled="busy" @click="addOperation(program)">＋ 增加操作</button></header>
    <form v-if="operationProgram === program.id" class="form-grid" @submit.prevent="saveOperation">
      <label>能力标识<input v-model="operationForm.capabilityId" :disabled="operationEditing" required placeholder="git-log" /></label><label>操作名称<input v-model="operationForm.title" required placeholder="查看最近提交" /></label>
      <label class="wide">固定参数数组<textarea v-model="operationForm.args" class="mono" required placeholder='["log", "--oneline", "-10"]'></textarea></label><label class="wide">用途说明<input v-model="operationForm.description" /></label>
      <p class="hint wide">手动操作返回脱敏进程输出和退出码。被已启用专家引用的操作须先解除引用，才能修改或删除。</p>
      <div class="form-actions"><button class="eap-button eap-button--primary" :disabled="busy">保存操作</button><button type="button" class="eap-button" @click="operationProgram = ''">取消</button></div>
    </form>
    <div class="table-scroll"><table class="facts-table"><thead><tr><th>操作</th><th>参数</th><th>状态 / 引用</th><th>管理</th></tr></thead><tbody>
      <tr v-for="operation in program.operations" :key="operation.capabilityId"><td>{{ operation.title }}<br /><code>{{ operation.capabilityId }}</code><br /><span class="hint">{{ operation.builtin ? '预置操作' : '手动操作' }}</span><details><summary>用途与备注</summary><p class="hint">{{ operation.description || '暂无用途说明' }}</p><input v-model="notesDraft[operation.capabilityId]" class="workspace-input" :aria-label="operation.capabilityId + ' 备注'" /><button class="eap-button" :disabled="busy" @click="saveNote(operation)">保存备注</button></details></td><td class="mono">{{ JSON.stringify(operation.args) }}</td><td>{{ itemFor(operation.capabilityId)?.availabilityLabel ?? '加载中' }}<br /><span class="hint">{{ itemFor(operation.capabilityId)?.usedBy.join('、') || '无已启用专家引用' }}</span></td><td><div class="form-actions"><button class="eap-button" :disabled="busy" @click="toggle(operation)">{{ itemFor(operation.capabilityId)?.enabled ? '停用' : '启用' }}</button><button v-if="!operation.builtin" class="eap-button" :disabled="busy" @click="addOperation(program,operation)">编辑</button><button v-if="!operation.builtin" class="eap-button eap-button--ghost" :disabled="busy" @click="pendingDelete = {programId:program.id,operationId:operation.capabilityId,title:operation.title}">删除</button></div></td></tr>
    </tbody></table></div>
    <p v-if="!program.operations.length" class="hint">程序已登记。增加一个固定参数操作后，即可在专家流程中使用。</p>
  </article>
  <ConfirmBox v-if="pendingDelete" :title="'删除' + pendingDelete.title" :impact="[pendingDelete.operationId ? '删除后该操作将从能力目录移除；仍被已启用专家引用时无法删除。' : '将移除此程序及其所有操作；仍被已启用专家引用时无法删除。']" confirm-label="确认删除" :busy="busy" :refusal="failed ? message : undefined" danger @confirm="remove" @cancel="pendingDelete = null" />
</template>
