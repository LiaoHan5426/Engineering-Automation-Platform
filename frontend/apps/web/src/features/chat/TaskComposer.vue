<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button, Feedback, FileInput, Input, Popover, Select, Tag, Textarea } from "@eap/ui";
import { runtimeApi, type TaskContext, type PrototypeVersionRecord, type WorkspaceSource } from "@eap/runtime-client";
import RepositoryBrowser from '../../components/RepositoryBrowser.vue';
import { pendingScenarioDependencies } from '../shell/scenarioDependencies';
import { identityAuthorized, runtimeIdentity } from '../shell/runtimeIdentity';
import { assignSessionProject, addExpert, currentExtras, expertCatalog, localProjects, projectLabel, removeExpert, scenarios, sessionKey, setExecutionMode, toggleResource, workbench } from "../shell/workbench";
import { acceptFiles, FILE_CAP, type IncomingFile } from "./acceptFiles";
import { popupPlacement } from './popupPlacement';

const props = withDefaults(defineProps<{ active?: boolean; preview?: boolean; context: TaskContext; disabled: boolean; refreshingModels?: boolean; reasoningEfforts: Array<"low" | "medium" | "high">; modelLabel?: string }>(), { active: true, preview: false, refreshingModels: false, modelLabel: "" });
const reasoningSupported = computed(() => props.reasoningEfforts.length > 0);
const shownEffort = computed(() => props.context.reasoning !== "default" && props.reasoningEfforts.includes(props.context.reasoning) ? props.context.reasoning : "default");
const emit = defineEmits<{ update: [context: TaskContext]; refresh: [] }>();
const { t } = useI18n();
const menu = ref(false), executionOpen = ref(false), policyOpen = ref(false), modelOpen = ref(false), category = ref<"files" | "instructions" | "actions" | "experts" | "skills" | "mcp">("files"), note = ref(""), query = ref("");
const workspacePicker = ref(false), versionsBusy = ref(false);
/** Layered + menu mirrors §0B.2 frame-024: files / instructions / actions / experts / skills / MCP. */
const menuCategories = ["files", "instructions", "actions", "experts", "skills", "mcp"] as const;
const demoResources = [{ id: "skill:vue-layout", kind: "skill", label: "preview.skill" }, { id: "mcp:files", kind: "mcp", label: "preview.mcp" }] as const;
const needle = computed(() => query.value.trim().toLowerCase());
function matches(value: string) { return !needle.value || value.toLowerCase().includes(needle.value); }
const visibleExperts = computed(() => expertCatalog.filter((item) => matches(item.name) || matches(item.category)));
const visibleResources = computed(() => demoResources.filter((item) => item.kind === (category.value === "mcp" ? "mcp" : "skill") && matches(t(item.label))));
const counts = computed(() => ({
  files: props.context.files.length + (props.context.prototypeVersionId ? 1 : 0),
  experts: currentExtras().experts.length + (props.context.expert === "general" ? 0 : 1),
  instructions: props.context.instructions.trim() ? 1 : 0,
  actions: 0,
  skills: props.preview ? currentExtras().resources.filter((id) => id.startsWith("skill:")).length : 0,
  mcp: props.preview ? currentExtras().resources.filter((id) => id.startsWith("mcp:")).length : 0,
}));
function categoryLabel(tab: (typeof menuCategories)[number]) {
  if (tab === "files") return t("composerUi.files");
  if (tab === "instructions") return t("composerUi.guidance");
  if (tab === "actions") return t("composerUi.actions");
  if (tab === "experts") return t("composerUi.experts");
  return t("desktop." + tab);
}
const searchPlaceholder = computed(() => {
  if (category.value === "files") return t("composerUi.searchFiles");
  if (category.value === "instructions") return t("composerUi.searchGuidance");
  if (category.value === "experts") return t("composerUi.searchExperts");
  if (category.value === "skills") return t("composerUi.searchSkills");
  if (category.value === "mcp") return t("composerUi.searchMcp");
  return t("composerUi.search");
});
const hasExtraChips = computed(() => {
  const extras = currentExtras();
  return props.context.expert !== "general" || props.context.files.length > 0 || Boolean(props.context.prototypeVersionId) || extras.experts.length > 0 || extras.resources.length > 0;
});
const activeScene = computed(() => scenarios.find((item) => item.id === currentExtras().scenarioId) ?? null);
const sceneMissingDeps = computed(() => pendingScenarioDependencies(activeScene.value?.dependencies ?? [], identityAuthorized(runtimeIdentity.value)));
/** Session binding only — sidebar selection does not pretend the draft is bound. */
const scopeProjectId = computed(() => currentExtras().projectId);
function changeScopeProject(id: string) {
  const next = id || null;
  workbench.selectedProjectId = next;
  assignSessionProject(sessionKey(), next);
}
const root = ref<HTMLElement | null>(null);
const popupStyle = ref<Record<string, string>>({});
function positionPopup(button: HTMLElement | null) {
  if (!button) return;
  popupStyle.value = popupPlacement(button.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
}
function placePopup(event: Event) {
  const button = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  positionPopup(button);
}
function hidePopups() { menu.value = false; executionOpen.value = false; policyOpen.value = false; modelOpen.value = false; }
function closePopups() {
  hidePopups();
  const field = root.value?.closest("form")?.querySelector("textarea");
  if (field instanceof HTMLElement) field.focus();
}
function dismiss(event: Event) { if (!root.value?.contains(event.target as Node)) hidePopups(); }
onMounted(() => { document.addEventListener("pointerdown", dismiss); window.addEventListener('resize', hidePopups); });
onUnmounted(() => { document.removeEventListener("pointerdown", dismiss); window.removeEventListener('resize', hidePopups); });
const versions = ref<PrototypeVersionRecord[]>([]);
const filesInput = ref<{ click: () => void } | null>(null);
const selectedVersion = computed(() => versions.value.find((version) => version.id === props.context.prototypeVersionId));
function change<K extends keyof TaskContext>(key: K, value: TaskContext[K]) {
  if (key === "prototypeVersionId") {
    const versionId = String(value ?? "");
    emit("update", {
      ...props.context,
      prototypeVersionId: versionId,
      mode: versionId ? "code" : props.context.mode,
      expert: versionId ? "frontend" : props.context.expert,
      targetPath: versionId ? workbench.deliveryTargetPath : "",
    });
    return;
  }
  emit("update", { ...props.context, [key]: value });
}
function applyIncoming(incoming: IncomingFile[]) {
  const result = acceptFiles(props.context.files, incoming, props.preview);
  if (!result.ok) { note.value = t(result.reason === "media" ? "task.pasteMedia" : "task.fileLimit"); return; }
  change("files", result.files);
  if (result.note === "media") note.value = t("preview.mediaReference");
}
function referenceSource(source: WorkspaceSource) {
  if (props.disabled || source.denial || !source.exists || !source.excerpt || !source.baseHash) return;
  const content = `Repository source excerpt: ${source.path}\nSHA-256: ${source.baseHash}\n${source.excerpt}`;
  const name = source.path;
  if (props.context.files.some(file => file.name === name && file.content === content)) { workspacePicker.value = false; return; }
  const result = acceptFiles(props.context.files, [{ name, size: new TextEncoder().encode(content).length, text: content, media: false }], false);
  if (!result.ok) { note.value = t('task.fileLimit'); return; }
  change('files', result.files); note.value = ''; workspacePicker.value = false;
}
async function describeFile(file: File): Promise<IncomingFile> {
  const media = file.type.startsWith("image/") || file.type.startsWith("video/") || /\.(png|jpe?g|webp|mp4)$/i.test(file.name);
  return { name: file.name || "pasted.txt", size: file.size, text: media ? "" : await file.text(), media };
}
async function filesChanged(event: Event) {
  note.value = "";
  const input = event.target as HTMLInputElement;
  try { applyIncoming(await Promise.all(Array.from(input.files ?? []).map(describeFile))); }
  catch { note.value = t("task.fileLimit"); }
  finally { input.value = ""; }
}
async function onPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []);
  if (!files.length || props.disabled) return;
  event.preventDefault();
  note.value = "";
  try { applyIncoming(await Promise.all(files.map(describeFile))); }
  catch { note.value = t("task.fileLimit"); }
}
function importPrototype() {
  if (!props.active || props.disabled) return;
  const pending = sessionStorage.getItem("eap.chat.prototype");
  if (pending) {
    sessionStorage.removeItem("eap.chat.prototype");
    emit("update", { ...props.context, prototypeVersionId: pending, mode: "code", expert: "frontend", targetPath: workbench.deliveryTargetPath });
  }
}
onMounted(importPrototype);
watch(() => [props.active, props.disabled], importPrototype);
function takeModelMenu() {
  if (!workbench.modelMenuToken || !props.active || props.disabled) return;
  workbench.modelMenuToken = 0;
  menu.value = false;
  executionOpen.value = false;
  policyOpen.value = false;
  modelOpen.value = true;
  positionPopup(root.value?.querySelector<HTMLElement>('[data-testid="model-picker"]') ?? null);
}
watch(() => workbench.modelMenuToken, takeModelMenu);
function takePolicyMenu() {
  if (!workbench.policyMenuToken || !props.active) return;
  workbench.policyMenuToken = 0;
  if (props.disabled) return;
  menu.value = false;
  executionOpen.value = false;
  modelOpen.value = false;
  policyOpen.value = true;
  positionPopup(root.value?.querySelector<HTMLElement>('[data-testid="approval-policy"]') ?? null);
}
watch(() => workbench.policyMenuToken, takePolicyMenu);
watch(() => props.active, active => { if (!active) closePopups(); else takeModelMenu(); });
function chooseExecution(mode: "chat" | "plan" | "agent") { setExecutionMode(mode); executionOpen.value = false; }
function choosePolicy(approval: TaskContext["approval"]) { change("approval", approval); policyOpen.value = false; }
function chooseEffort(effort: TaskContext["reasoning"]) { change("reasoning", effort); }
function openContextMenu(event: Event) {
  placePopup(event);
  category.value = "files";
  menu.value = !menu.value;
  executionOpen.value = false;
  policyOpen.value = false;
  modelOpen.value = false;
}
const effortLabel = computed(() => shownEffort.value === "default" ? t("task.modelDefault") : t("task." + shownEffort.value));
const contextCount = computed(() => ({
  files: props.context.files.length,
  limit: FILE_CAP,
  count: props.context.files.length + (props.context.prototypeVersionId ? 1 : 0) + currentExtras().experts.length + currentExtras().resources.length,
}));
function chooseExpert(id: string) { if (currentExtras().experts.some((item) => item.id === id)) removeExpert(id); else addExpert(id); }
function manageExperts() { hidePopups(); if (typeof location !== "undefined") location.hash = "expert-catalog"; }
async function loadVersions() {
  if (versionsBusy.value) return;
  versionsBusy.value = true;
  try {
    const pages = await Promise.all([runtimeApi.prototypeVersions("builder-alpha"), runtimeApi.prototypeVersions("builder-beta")]);
    versions.value = pages.flatMap((page) => page.items);
    note.value = "";
  } catch { note.value = t("task.versionUnavailable"); }
  finally { versionsBusy.value = false; }
}
</script>

<template>
  <div ref="root" class="composer-stack" @paste="onPaste" @keydown.esc.stop.prevent="closePopups">
    <div class="composer-scope" data-testid="composer-scope">
      <label>
        <span class="sr-only">{{ t("desktop.composerScope") }}</span>
        <Select data-testid="composer-scope-select" :disabled="disabled" :model-value="scopeProjectId ?? ''" @change="changeScopeProject(($event.target as HTMLSelectElement).value)">
          <option value="">{{ t("desktop.composerScopeFree") }}</option>
          <option v-for="project in localProjects.projects" :key="project.id" :value="project.id">{{ projectLabel(project.id) }}</option>
        </Select>
      </label>
    </div>
    <div v-if="hasExtraChips" class="context-chips">
      <Tag v-if="context.expert !== 'general'" closable type="info" :disabled="disabled" @click="change('expert', 'general')" @close="change('expert', 'general')">{{ t('task.' + context.expert) }}</Tag>
      <Tag v-for="(file, index) in context.files" :key="index" closable type="info" :disabled="disabled" @click="change('files', context.files.filter((_, i) => i !== index))" @close="change('files', context.files.filter((_, i) => i !== index))">📎 {{ file.name }}</Tag>
      <Tag v-if="context.prototypeVersionId" closable type="info" :disabled="disabled" @click="change('prototypeVersionId', '')" @close="change('prototypeVersionId', '')">▧ {{ selectedVersion?.title || context.prototypeVersionId.slice(0, 8) }}</Tag>
      <Tag v-for="expert in currentExtras().experts" :key="expert.id" closable :disabled="disabled" @click="removeExpert(expert.id)" @close="removeExpert(expert.id)">{{ t('desktop.collab') }}：{{ expert.name }}</Tag>
      <Tag v-for="id in currentExtras().resources" :key="id" closable type="success" :disabled="disabled" @click="toggleResource(id)" @close="toggleResource(id)">{{ t(demoResources.find(item => item.id === id)?.label || 'preview.simulated') }}</Tag>
    </div>
    <slot name="draft" />
    <div class="task-context" data-testid="task-context">
    <div class="context-toolbar">
      <Button variant="secondary" type="button" data-testid="composer-add" class="composer-add" :disabled="disabled" :aria-label="t('task.context')" :aria-expanded="menu" @click="placePopup($event); menu = !menu; policyOpen = false; executionOpen = false; modelOpen = false">＋</Button>
      <Tag v-if="activeScene" closable :type="sceneMissingDeps.length ? 'warning' : 'success'" data-testid="composer-scene-chip" :title="sceneMissingDeps.length ? t('desktop.pendingDependencyCheck') + ' · ' + sceneMissingDeps.join('、') : undefined" :disabled="disabled" @click="currentExtras().scenarioId = null" @close="currentExtras().scenarioId = null">
        <span v-if="sceneMissingDeps.length" aria-hidden="true">⚠</span>
        {{ t('desktop.scenes') }}：{{ activeScene.name }}
      </Tag>
      <div class="bar-picker">
        <Button variant="secondary" type="button" data-testid="execution-mode" :disabled="disabled" :aria-expanded="executionOpen" @click="placePopup($event); executionOpen = !executionOpen; menu = false; policyOpen = false; modelOpen = false">{{ t("desktop.execution" + (workbench.executionMode === "chat" ? "Chat" : workbench.executionMode === "plan" ? "Plan" : "Agent")) }}</Button>
        <Popover v-if="executionOpen" class="composer-popup execution-menu" :style="popupStyle" :label="t('desktop.executionChat')">
          <button type="button" data-testid="execution-chat" :aria-pressed="workbench.executionMode === 'chat'" @click="chooseExecution('chat')">{{ t("desktop.executionChat") }} · {{ t("desktop.executionChatHint") }}</button>
          <button type="button" data-testid="execution-plan" :aria-pressed="workbench.executionMode === 'plan'" :disabled="!preview" :title="preview ? undefined : t('desktop.executionModeOff')" @click="chooseExecution('plan')">{{ t("desktop.executionPlan") }} · {{ t("desktop.executionPlanHint") }}<template v-if="!preview"> · {{ t("desktop.executionModeOff") }}</template></button>
          <button type="button" data-testid="execution-agent" :aria-pressed="workbench.executionMode === 'agent'" :disabled="!preview" :title="preview ? undefined : t('desktop.executionModeOff')" @click="chooseExecution('agent')">{{ t("desktop.executionAgent") }} · {{ t("desktop.executionAgentHint") }}<template v-if="!preview"> · {{ t("desktop.executionModeOff") }}</template></button>
          <button type="button" data-testid="execution-plugin" disabled :title="t('desktop.executionModeOff')">{{ t("desktop.executionPlugin") }} · {{ t("desktop.executionPluginHint") }} · {{ t("desktop.executionModeOff") }}</button>
        </Popover>
      </div>
      <div class="bar-picker">
        <Button variant="secondary" type="button" data-testid="approval-policy" :disabled="disabled" :aria-expanded="policyOpen" @click="placePopup($event); policyOpen = !policyOpen; menu = false; executionOpen = false; modelOpen = false">{{ context.approval === "read_only" ? t("task.readOnlyShort") : t("task.askPolicy") }}</Button>
        <Popover v-if="policyOpen" class="composer-popup execution-menu" :style="popupStyle" :label="t('task.askPolicy')" data-testid="approval-menu">
          <p class="hint" data-testid="risk-review-off">{{ t("desktop.riskReviewOff") }}</p>
          <button type="button" data-testid="approval-review" :aria-pressed="context.approval !== 'read_only'" @click="choosePolicy('review')">{{ t("task.askPolicy") }} · {{ t("task.askPolicyHint") }}</button>
          <button type="button" data-testid="approval-ai-review" disabled>{{ t("task.aiReview") }} · {{ t("desktop.aiReviewHint") }}</button>
          <button type="button" data-testid="approval-read-only" :aria-pressed="context.approval === 'read_only'" @click="choosePolicy('read_only')">{{ t("task.readOnlyShort") }} · {{ t("task.readOnlyHint") }}</button>
          <button type="button" data-testid="approval-full" disabled>{{ t("task.fullAccess") }} · {{ t("task.fullAccessOff") }}</button>
          <button type="button" data-testid="approval-tool-perms" disabled>{{ t("task.toolPerms") }} · {{ t("desktop.notConnected") }}</button>
        </Popover>
      </div>
      <button type="button" class="context-meter" data-testid="context-meter" :disabled="disabled" :aria-expanded="menu" :title="t('desktop.contextMeterHint', contextCount)" @click="openContextMenu($event)">{{ t("desktop.contextMeter", contextCount) }}</button>
      <div class="bar-picker model-picker">
        <Button variant="secondary" type="button" data-testid="model-picker" :disabled="disabled" :aria-expanded="modelOpen" @click="placePopup($event); modelOpen = !modelOpen; menu = false; executionOpen = false; policyOpen = false">{{ modelLabel || t("modelUi.pending") }} · {{ effortLabel }}</Button>
        <Popover v-if="modelOpen" class="composer-popup model-menu" :style="popupStyle" :label="t('modelUi.selection')">
          <div class="model-effort-head" data-testid="model-effort-head">
            <strong>{{ effortLabel }}</strong>
            <small>{{ modelLabel || t("modelUi.pending") }}</small>
          </div>
          <slot name="model" />
          <p class="effort-caption">{{ t("desktop.effortHeading") }}</p>
          <div class="effort-row">
            <button type="button" :aria-pressed="shownEffort === 'default'" :disabled="disabled" @click="chooseEffort('default')">{{ t("task.modelDefault") }}</button>
            <button v-for="effort in reasoningEfforts" :key="effort" type="button" :data-testid="'effort-' + effort" :aria-pressed="shownEffort === effort" :disabled="disabled" @click="chooseEffort(effort)">{{ t("task." + effort) }}</button>
          </div>
          <p v-if="!reasoningSupported" class="hint">{{ t("task.reasoningUnsupported") }}</p>
          <button type="button" data-testid="model-refresh" :disabled="disabled || refreshingModels" :aria-busy="refreshingModels" @click="emit('refresh')">{{ t(refreshingModels ? "desktop.catalogRefreshing" : "desktop.refreshModels") }}</button>
          <slot name="settings" />
        </Popover>
      </div>
      <slot name="send" />
    </div>
    <Popover v-if="menu" class="composer-popup composer-add-menu" :style="popupStyle" :label="t('task.context')" data-testid="composer-add-menu">
      <Input v-model="query" class="composer-search" type="search" data-testid="composer-search" :aria-label="searchPlaceholder" :placeholder="searchPlaceholder" />
      <div class="composer-layers">
        <div class="composer-categories" role="listbox" :aria-label="t('task.context')">
          <button v-for="tab in menuCategories" :key="tab" type="button" role="option" :data-testid="'composer-cat-' + tab" :aria-selected="category === tab" @click="category = tab">
            <span>{{ categoryLabel(tab) }}</span>
            <small>{{ counts[tab] }}</small>
          </button>
          <button type="button" role="option" data-testid="composer-cat-unattended" disabled :aria-selected="false">
            <span>{{ t("desktop.unattended") }}</span>
            <small>{{ t("desktop.unattendedOff") }}</small>
          </button>
        </div>
        <div class="composer-popup-content">
          <template v-if="category === 'files'">
            <button type="button" class="menu-choice" data-testid="pick-workspace-file" :disabled="disabled" :aria-expanded="workspacePicker" @click="workspacePicker = !workspacePicker">{{ t('composerUi.workspacePick') }}</button>
            <RepositoryBrowser v-if="workspacePicker" selectable :disabled="disabled" @select="referenceSource" />
            <FileInput ref="filesInput" multiple :accept="preview ? '.vue,.ts,.tsx,.js,.jsx,.json,.md,.txt,.sql,.java,.css,.html,.png,.jpg,.jpeg,.webp,.mp4' : '.vue,.ts,.tsx,.js,.jsx,.json,.md,.txt,.sql,.java,.css,.html'" hidden @change="filesChanged" />
            <Button type="button" variant="secondary" data-testid="upload-local-file" :disabled="disabled" @click="filesInput?.click()">{{ t('composerUi.uploadLocal') }}</Button>
            <Button type="button" variant="secondary" :disabled="disabled || versionsBusy" @click="loadVersions">{{ t('task.loadVersions') }}</Button>
            <label>{{ t('task.version') }}<Select :disabled="disabled" :model-value="context.prototypeVersionId" @change="change('prototypeVersionId', ($event.target as HTMLSelectElement).value)"><option value="">{{ t('task.noVersion') }}</option><option v-for="version in versions.filter(item => matches(item.title))" :key="version.id" :value="version.id">{{ version.title }} · {{ version.id.slice(0, 8) }}</option></Select></label>
            <slot name="tools" />
          </template>
          <template v-else-if="category === 'actions'">
            <p class="hint" data-testid="actions-empty">{{ t('composerUi.actionsEmpty') }}</p>
            <label>{{ t("task.goal") }}<Select :model-value="context.mode" :disabled="disabled" @change="change('mode', ($event.target as HTMLSelectElement).value as TaskContext['mode'])"><option value="chat">{{ t("task.discuss") }}</option><option value="code">{{ t("task.generate") }}</option></Select></label>
          </template>
          <template v-else-if="category === 'experts'">
            <label>{{ t("modelUi.guidanceRole") }}
              <Select :model-value="context.expert" :disabled="disabled" @change="change('expert', ($event.target as HTMLSelectElement).value as TaskContext['expert'])">
                <option value="general">{{ t("task.general") }}</option><option value="sql">{{ t("task.sql") }}</option><option value="frontend">{{ t("task.frontend") }}</option>
              </Select>
            </label>
            <p class="hint" data-testid="expert-kind">{{ t("desktop.collab") }}。{{ t("desktop.expertDisconnected") }}</p>
            <button v-for="expert in visibleExperts" :key="expert.id" type="button" class="menu-choice expert-choice" :aria-pressed="currentExtras().experts.some(item => item.id === expert.id)" :disabled="disabled" @click="chooseExpert(expert.id)">
              <span>{{ expert.name }} <small>{{ expert.category }} · {{ expert.version }}</small></span>
              <small>{{ t("desktop.expertGuidance") }}：{{ expert.guidance }}</small>
              <small>{{ t("desktop.expertResources") }}：{{ expert.resources }}</small>
            </button>
            <button type="button" class="menu-choice" data-testid="manage-experts" @click="manageExperts">{{ t('composerUi.manageExperts') }}</button>
          </template>
          <template v-else-if="category === 'skills' || category === 'mcp'">
            <p class="hint" data-testid="resource-empty">{{ preview ? t('preview.resourceHint') : t(category === 'skills' ? 'desktop.skillsEmpty' : 'desktop.mcpEmpty') }}</p>
            <button v-for="item in (preview ? visibleResources : [])" :key="item.id" type="button" class="menu-choice" :aria-pressed="currentExtras().resources.includes(item.id)" :disabled="disabled" @click="toggleResource(item.id)">{{ t(item.label) }} · {{ t('preview.simulated') }}</button>
          </template>
          <label v-else>{{ t('task.guidance') }}<Textarea :disabled="disabled" :model-value="context.instructions" rows="3" maxlength="4000" @input="change('instructions', ($event.target as HTMLTextAreaElement).value)" /></label>
          <p class="hint">{{ t('task.contextNotice') }}</p>
        </div>
      </div>
    </Popover>
    <p v-if="!preview && (workbench.executionMode === 'agent' || workbench.executionMode === 'plan')" class="hint">{{ t("desktop.executionBlocked") }}</p>

    <Feedback v-if="note" tone="warning">{{ note }}</Feedback>
    </div>
  </div>
</template>

<style scoped>
.composer-stack { display: grid; gap: 8px; }
.composer-scope { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 2px 2px 0; }
.composer-scope :deep(.eap-select) { max-width: min(280px, 70vw); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); border: 0; }
.task-context { min-width: 0; }
.context-toolbar { display: flex; flex-wrap: nowrap; align-items: center; gap: 10px; }
.context-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.model-picker { min-width: 0; }
.model-picker :deep(.eap-button) { max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.execution-picker, .bar-picker { position: static; }
.execution-menu { display: grid; gap: 6px; }
.execution-menu button { text-align: left; padding: 8px; border: 0; background: transparent; border-radius: 8px; }
.execution-menu button[aria-pressed="true"] { background: #e7f3ee; color: #287b6c; }
.execution-menu button:disabled { color: #7a887f; }
.composer-add-menu { min-width: min(420px, 92vw); }
.composer-layers { display: grid; grid-template-columns: minmax(110px, 34%) minmax(0, 1fr); gap: 10px; align-items: start; min-width: 0; }
.composer-popup-content { min-width: 0; overflow-wrap: anywhere; }
.composer-popup-content :is(input,select,textarea) { min-width: 0; max-width: 100%; }
.composer-categories { display: grid; gap: 2px; }
.composer-categories button { display: flex; justify-content: space-between; gap: 8px; width: 100%; text-align: left; border: 0; background: transparent; padding: 8px 10px; border-radius: 8px; cursor: pointer; font: inherit; }
.composer-categories button[aria-selected="true"] { background: #e7f3ee; color: #287b6c; }
.composer-categories small { color: #7a887f; }
.context-meter { margin-left: auto; border: 0; background: transparent; padding: 4px 6px; border-radius: 8px; font: inherit; font-size: 11px; color: #68746e; cursor: pointer; white-space: nowrap; }
.context-meter:hover:not(:disabled) { background: #e7f3ee; color: #287b6c; }
.context-meter:disabled { cursor: not-allowed; opacity: 0.65; }
.context-meter[aria-expanded="true"] { background: #e7f3ee; color: #287b6c; }
.model-effort-head { display: grid; gap: 2px; padding: 4px 8px 8px; border-bottom: 1px solid #e4ebe4; margin-bottom: 6px; }
.model-effort-head strong { font-size: 14px; color: #24352c; }
.model-effort-head small { color: #7a887f; font-size: 12px; }
.effort-caption { margin: 4px 8px 0; font-size: 11px; color: #7a887f; }
.context-toolbar label { display: grid; gap: 5px; font-size: 12px; }
.context-toolbar select { padding: 7px; border: 1px solid #dce3ee; border-radius: 8px; background: var(--color-surface, white); }
.context-menu { display: grid; gap: 12px; padding: 16px; margin: 12px 0; background: #f6f8fc; border-radius: 12px; }
.context-menu textarea { width: 100%; display: block; }
.context-chips { margin: 10px 0; }
.composer-search { width: 100%; margin-bottom: 10px; padding: 8px; border: 1px solid #dce3ee; border-radius: 8px; }
.menu-choice { display: flex; justify-content: space-between; gap: 8px; width: 100%; text-align: left; border: 0; background: transparent; padding: 8px; border-radius: 8px; cursor: pointer; }
.expert-choice { display: grid; justify-content: start; }
.menu-choice[aria-pressed="true"] { background: #e7f3ee; }
.menu-choice small { color: #7a887f; }
.effort-row { display: flex; flex-wrap: wrap; gap: 6px; }
.effort-row button, .model-menu > button { border: 0; background: transparent; text-align: left; padding: 8px; border-radius: 8px; cursor: pointer; }
.effort-row button[aria-pressed="true"] { background: #e7f3ee; }
.model-picker { margin-left: 0; }
.composer-categories button:disabled { opacity: .55; cursor: default; }
.composer-add { min-width: 34px; padding-inline: 10px; font-size: 16px; line-height: 1; }
</style>
