<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ActionCard, Button, Checkbox, Input, Select, Tabs, Tag, Textarea } from "@eap/ui";
import { computed, nextTick, onBeforeUnmount, reactive, ref, toRef, watch } from "vue";
import { runtimeApi, type PrototypeVersionRecord, type VerificationProbe, type WorkspaceBaseline, type WorkspaceSource } from "@eap/runtime-client";

import { scenarioWorkspaceState } from './shell/scenarioWorkspaceState';
import { DELIVERY_TARGET_PATH, applyScenario, chatBinding, currentExtras, rememberPanel, scenarios, workbench, type Scenario } from "./shell/workbench";
import {
  ACCEPTANCE_ITEMS,
  acceptanceStatusKey,
  loadAcceptance,
  saveAcceptance,
  type AcceptanceState,
} from "./shell/acceptanceChecklist";
import { localGrantPath } from "./shell/localBridge";
import { projectIntendedPath } from "./shell/localProjects";
import { formatDirtyLine, formatVerificationConfig, identityAuthorized, identityPath, processBoundRootPath, refreshRuntimeIdentityAndDirty, runtimeIdentity, workspaceDirty } from "./shell/runtimeIdentity";
import { deliveryBlocked, resolveDeliveryGates } from "./shell/deliveryGates";
import { pagePreviewMessageKey, resolvePagePreview } from "./shell/pagePreview";
import { resolveDeliveryDependencies } from "./shell/scenarioDependencies";

const DELIVERY_PAGE = DELIVERY_TARGET_PATH;
const props = defineProps<{ builderEnabled: boolean; chatEnabled: boolean }>();
const emit = defineEmits<{ navigate: [id: string] }>();
const { t } = useI18n();
const versions = ref<PrototypeVersionRecord[]>([]);
const selected = toRef(scenarioWorkspaceState, 'versionId');
const loading = ref(false);
const error = ref("");
const blocked = ref(false);
const located = ref("");
const sceneTab = ref<"local" | "market">("local");
/** frame-080 list vs frame-088 detail — not a permanent split that buries the card grid. */
const sceneView = toRef(scenarioWorkspaceState, 'view');
const workflowTab = toRef(scenarioWorkspaceState, 'workflowTab');
/** frame-088 detail sections: basics / tools / skills / MCP. */
const detailTab = toRef(scenarioWorkspaceState, 'detailTab');
const baseline = ref<WorkspaceBaseline | null>(null);
const source = ref<WorkspaceSource | null>(null);
const prepSettled = ref(false);
const probeBusy = ref(false);
const probeResult = ref<VerificationProbe | null>(null);
const preparation = ref<HTMLElement | null>(null);
async function locateDependencyConfiguration() {
  const dependency = missingDeps.value.find(item => item.name === located.value) ?? missingDeps.value[0];
  if (!dependency) return;
  located.value = dependency.name;
  if (activeScenario.value.workflow === 'prototype-to-code') {
    sceneView.value = 'workflow';
    workflowTab.value = 'preparation';
    await nextTick(); preparation.value?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  } else if (dependency.name.includes('仓库')) {
    rememberPanel(chatBinding.value?.activeId ?? null, 'files');
    emit('navigate', workbench.origin || 'chat');
  } else if (/MCP|技能/i.test(dependency.name)) emit('navigate', 'capabilities');
}
const activeScenario = computed((): Scenario => scenarios.find((item) => item.id === workbench.selectedScenario) ?? scenarios[0]!);
function chooseScenario(id: string) {
  workbench.selectedScenario = id;
  located.value = "";
}
function openSceneDetail(id: string) {
  chooseScenario(id);
  detailTab.value = "basic";
  sceneView.value = "detail";
}
function backToSceneList() {
  sceneView.value = "list";
  detailTab.value = "basic";
}
function copyScenario() {
  const scene = activeScenario.value;
  const clone: Scenario = { ...scene, id: `custom-${Date.now()}`, builtin: false, name: `${scene.name} · Copy`, modes: [...scene.modes], tools: [...scene.tools], skills: [...scene.skills], mcp: [...scene.mcp], dependencies: scene.dependencies.map(item => ({ ...item })) };
  scenarios.push(clone); workbench.selectedScenario = clone.id;
  sceneView.value = 'detail'; detailTab.value = 'basic';
}
const sceneNotice = ref("");
function removeCustomScene(id: string) {
  const index = scenarios.findIndex((item) => item.id === id && item.builtin === false);
  if (index < 0) return;
  scenarios.splice(index, 1);
  if (workbench.selectedScenario === id) {
    workbench.selectedScenario = scenarios[0]?.id || "free-explore";
    sceneView.value = "list";
  }
  sceneNotice.value = t("desktop.sceneDeleted");
}
function createBlankScene() {
  const clone: Scenario = {
    id: `custom-${Date.now()}`,
    builtin: false,
    name: t("desktop.createScene"),
    status: "partial",
    modes: [workbench.workMode],
    summary: t("preview.customScene"),
    instructions: "",
    tools: [],
    skills: [],
    mcp: [],
    dependencies: [],
  };
  scenarios.push(clone);
  workbench.selectedScenario = clone.id;
  sceneView.value = "detail";
}
function sceneKindLabel(scene: Scenario) {
  if (scene.status === "disabled") return t("desktop.comingSoon");
  if (scene.builtin === false) return t("desktop.sceneKindPlugin");
  return t("desktop.sceneKindPreset");
}
function changeSceneMode(mode: 'code' | 'work', checked: boolean) {
  const scene = activeScenario.value;
  if (scene.builtin !== false) return;
  if (checked && !scene.modes.includes(mode)) scene.modes.push(mode);
  else if (!checked && scene.modes.length > 1) scene.modes = scene.modes.filter(item => item !== mode);
}
function dependencyLabel(state: string) {
  if (state === "installed") return "preview.depInstalled";
  if (state === "missing") return "preview.depMissing";
  if (state === "denied") return "preview.depDenied";
  if (state === "unconfigured") return "preview.depUnconfigured";
  return "preview.depUnconfigured";
}
const baselineReady = computed(() => {
  const item = baseline.value;
  return !!item && !item.denial && item.exists && !!item.baseHash && item.baseHash !== "absent";
});
const sourceReady = computed(() => {
  const item = source.value;
  return !!item && !item.denial && item.exists && !!item.excerpt && !!item.baseHash && item.baseHash !== "absent";
});
const liveDependencies = computed(() =>
  resolveDeliveryDependencies(activeScenario.value.dependencies, {
    processBound: identityAuthorized(runtimeIdentity.value),
    baselineReady: baselineReady.value,
    prepSettled: prepSettled.value,
  }),
);
const missingDeps = computed(() => liveDependencies.value.filter((item) => item.state !== "installed"));
const gates = computed(() =>
  resolveDeliveryGates({
    processBound: identityAuthorized(runtimeIdentity.value),
    baselineReady: baselineReady.value,
    sourceReady: sourceReady.value,
    versionSelected: !loading.value && !error.value && versions.value.some(item => item.id === selected.value),
    connectionState: runtimeIdentity.value?.connectionState || "",
    model: runtimeIdentity.value?.model || "",
  }),
);
const openGates = computed(() => gates.value.filter((item) => item.open));
const prepBlocked = computed(
  () =>
    activeScenario.value.workflow === "prototype-to-code"
    && (!prepSettled.value || deliveryBlocked(gates.value)),
);
function gateAction(action: "versions" | "model" | "builder" | undefined) {
  if (action === "model") emit("navigate", "model-settings");
  else if (action === "versions") workflowTab.value = 'versions';
  else if (action === "builder") emit("navigate", "builder-alpha");
}
const liveRepoLine = computed(() => {
  const path = identityPath(runtimeIdentity.value);
  const root = processBoundRootPath(runtimeIdentity.value);
  if (!path) return t("desktop.repoUnknown");
  return root
    ? `${path} · ${t("desktop.processBoundRoot")}：${root}`
    : `${path} · ${t("desktop.processBoundRootMissing")}`;
});
const liveIntendedLine = computed(() => {
  const path = projectIntendedPath(workbench.selectedProjectId);
  return path
    ? `${t("desktop.localIntendedPath")}：${path}`
    : `${t("desktop.localIntendedPath")}：${t("desktop.localIntendedPathHint")}`;
});
const liveGrantLine = computed(() => {
  const path = localGrantPath();
  return path ? `${t("desktop.localGrantPath")}：${path}` : t("desktop.localGrantMissing");
});
const liveBaselineLine = computed(() => {
  if (!prepSettled.value) return t("desktop.prepLoading");
  const item = baseline.value;
  if (!item) return t("desktop.missingBaseline");
  if (item.denial) return `${t("desktop.missingBaseline")} · ${item.denial}`;
  if (baselineReady.value) return `${DELIVERY_PAGE} · ${item.baseHash.slice(0, 12)}…`;
  return t("desktop.missingBaseline");
});
const liveSourceLine = computed(() => {
  if (!prepSettled.value) return t("desktop.prepLoading");
  const item = source.value;
  if (!item) return t("desktop.sourceUnread");
  if (item.denial) return t("desktop.sourceDenied", { code: item.denial });
  if (sourceReady.value) return t("desktop.sourceRead", { bytes: item.bytes, hash: item.baseHash.slice(0, 12) });
  return t("desktop.sourceUnread");
});
const liveDirtyLine = computed(() =>
  prepSettled.value
    ? formatDirtyLine(workspaceDirty.value, (key, values) => t(key, values ?? {}))
    : t("desktop.prepLoading"),
);
const liveVerificationLine = computed(() =>
  formatVerificationConfig(runtimeIdentity.value, (key, values) => t(key, values ?? {})),
);
const liveProbeLine = computed(() => {
  const item = probeResult.value;
  if (!item) return t("desktop.verificationProbeIdle");
  if (!item.requested) return t("desktop.verificationProbeDenied", { code: item.denial || "AUTHORIZED_ROOT_MISSING" });
  if (item.exitCode == null) {
    return t("desktop.verificationProbeNoExit", { name: item.name || "git-version-probe", summary: item.summary || "—" });
  }
  return t("desktop.verificationProbeResult", {
    name: item.name || "git-version-probe",
    code: item.exitCode,
    summary: item.summary || "—",
  });
});
const livePreview = computed(() =>
  resolvePagePreview({
    mock: workbench.preview,
    origin: typeof window !== "undefined" ? window.location.origin : "",
  }),
);
const livePreviewLine = computed(() =>
  livePreview.value.ready
    ? t(pagePreviewMessageKey(livePreview.value), { url: livePreview.value.url })
    : t(pagePreviewMessageKey(livePreview.value)),
);
const acceptance = reactive<AcceptanceState>(
  loadAcceptance(typeof sessionStorage !== "undefined" ? sessionStorage : null),
);
const acceptanceLine = computed(() => t(acceptanceStatusKey(acceptance)));
watch(
  acceptance,
  (state) => saveAcceptance({ ...state }, typeof sessionStorage !== "undefined" ? sessionStorage : null),
  { deep: true },
);

let disposed = false;
async function loadVersions() {
  if (loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const pages = await Promise.all([runtimeApi.prototypeVersions("builder-alpha"), runtimeApi.prototypeVersions("builder-beta")]);
    if (disposed) return;
    versions.value = pages.flatMap((page) => page.items);
    if (!versions.value.some((item) => item.id === selected.value)) selected.value = "";
  } catch { error.value = t("task.versionUnavailable"); }
  finally { loading.value = false; }
}
async function loadBaseline() {
  try {
    baseline.value = await runtimeApi.workspaceBaseline(DELIVERY_PAGE);
  } catch {
    baseline.value = { path: DELIVERY_PAGE, exists: false, baseHash: "", denial: "BASELINE_UNAVAILABLE" };
  }
}
async function loadSource() {
  try {
    source.value = await runtimeApi.workspaceSource(DELIVERY_PAGE);
  } catch {
    source.value = { path: DELIVERY_PAGE, exists: false, baseHash: "", bytes: 0, excerpt: "", denial: "SOURCE_UNAVAILABLE" };
  }
}
function develop() {
  if (!props.chatEnabled || loading.value || error.value || !versions.value.some((item) => item.id === selected.value)) return;
  if (prepBlocked.value) {
    blocked.value = true;
    return;
  }
  const versionId = selected.value;
  // Same handoff contract as BuilderWorkspace.useVersionInChat: TaskComposer imports on chat mount.
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem("eap.chat.prototype", versionId);
  if (!applyScenario(activeScenario.value.id)) {
    blocked.value = true;
    return;
  }
  const extras = currentExtras();
  extras.delivery = {
    versionId,
    pagePath: DELIVERY_PAGE,
    pageLabel: DELIVERY_PAGE.split("/").pop() || DELIVERY_PAGE,
  };
  workbench.workMode = "code";
  blocked.value = false;
  emit("navigate", "chat");
}
function apply() {
  const scene = activeScenario.value;
  if (!scene || scene.status === "disabled") return;
  if (scene.workflow === "prototype-to-code" && deliveryBlocked(gates.value)) {
    blocked.value = true;
    return;
  }
  if (!applyScenario(scene.id)) return;
  emit("navigate", workbench.origin || "chat");
}
const refreshingPrep = ref(false);
async function refreshPrep() {
  if (sceneView.value !== 'workflow' || refreshingPrep.value) return;
  refreshingPrep.value = true;
  prepSettled.value = false;
  try {
    await refreshRuntimeIdentityAndDirty();
    await Promise.all([loadVersions(), loadBaseline(), loadSource()]);
  } finally {
    prepSettled.value = true;
    refreshingPrep.value = false;
  }
}
async function runVerificationProbe() {
  if (probeBusy.value) return;
  probeBusy.value = true;
  try {
    probeResult.value = await runtimeApi.workspaceVerificationProbe();
  } catch {
    probeResult.value = {
      requested: false,
      denial: "PROBE_FAILED",
      name: "",
      exitCode: null,
      summary: "",
    };
  } finally {
    probeBusy.value = false;
  }
}
watch([sceneView, workflowTab], ([view, tab]) => {
  if (view !== 'workflow') return;
  if (tab === 'preparation') void refreshPrep();
  else void loadVersions();
}, { immediate: true });
onBeforeUnmount(() => { disposed = true; });
</script>

<template>
  <section class="view scenario-workspace">
    <header class="scene-head">
      <div>
        <h1>{{ t("desktop.scenes") }}</h1>
        <p>{{ t("desktop.scenarioIntro") }}</p>
      </div>
      <Button size="sm" variant="link" type="button" class="scene-back-chat" data-testid="back-to-chat-from-scenes" @click="emit('navigate', workbench.origin || (workbench.workMode === 'work' ? 'work' : 'chat'))">{{ t("desktop.backToChat") }}</Button>
    </header>
    <Tabs
      v-model="sceneTab"
      class="scene-tabs"
      data-testid="scene-tabs"
      :label="t('desktop.scenes')"
      :tabs="[
        { id: 'local', label: t('desktop.localScenes'), testId: 'scene-tab-local' },
        { id: 'market', label: t('desktop.market'), testId: 'scene-tab-market' },
      ]"
    />
    <p v-if="sceneTab === 'market'" class="hint" data-testid="scene-market-empty">{{ t("desktop.marketEmpty") }}</p>
    <div v-else-if="sceneView === 'list'" class="scene-catalog" data-testid="scene-catalog">
      <div class="scene-catalog-toolbar">
        <Button size="sm" variant="primary" type="button" class="create-scene" data-testid="create-scene" @click="createBlankScene">＋ {{ t("desktop.createScene") }}</Button>
      </div>
      <p v-if="sceneNotice" class="hint" role="status" data-testid="scene-notice">{{ sceneNotice }}</p>
      <ul class="scene-list" data-testid="scene-card-grid">
        <li v-for="scene in scenarios" :key="scene.id">
          <ActionCard class="scene-card" :label="scene.name" :data-scene-id="scene.id" @activate="openSceneDetail(scene.id)">
            <strong>{{ scene.name }}</strong>
            <small>{{ scene.modes.map((mode) => mode === "code" ? "Code" : "Work").join(" · ") }} · {{ sceneKindLabel(scene) }}</small>
            <span>{{ scene.summary }}</span>
            <template #actions>
              <Button size="sm" variant="link" type="button" class="scene-link" data-testid="scene-open-detail" :data-scene-id="scene.id" @click="openSceneDetail(scene.id)">{{ t("desktop.sceneOpenDetailShort") }}</Button>
              <Button size="sm" variant="link" type="button" class="scene-link" data-testid="scene-copy" :data-scene-id="scene.id" :title="t('preview.copyScene')" @click="chooseScenario(scene.id); copyScenario()">{{ t('desktop.sceneCopyShort') }}</Button>
              <Button size="sm" variant="link"
                v-if="scene.builtin === false"
                type="button"
                class="scene-link scene-delete"
                data-testid="scene-delete"
                :data-scene-id="scene.id"
                @click="removeCustomScene(scene.id)"
              >{{ t("desktop.sceneDelete") }}</Button>
              <Button size="sm" variant="link"
                v-else
                type="button"
                class="scene-link scene-delete"
                data-testid="scene-delete"
                :data-scene-id="scene.id"
                disabled
                :title="t('desktop.sceneDeleteOff')"
              >{{ t("desktop.sceneDelete") }}</Button>
            </template>
          </ActionCard>
        </li>
      </ul>
    </div>
    <div v-else-if="sceneView === 'detail'" class="scene-layout scene-layout-detail" data-testid="scene-detail-view">
      <article class="scene-detail">
        <div class="scene-detail-head">
          <Button type="button" size="sm" data-testid="scene-back-list" @click="backToSceneList">{{ t("desktop.backToScenes") }}</Button>
          <h2>{{ t("desktop.sceneDetail") }} · {{ activeScenario.name }}</h2>
        </div>
        <p class="scene-meta" data-testid="scene-meta">
          <span>{{ t("desktop.localScenes") }}</span>
          <span>{{ activeScenario.modes.join(" / ") }}</span>
          <span>{{ t("desktop.skillsListed", { count: activeScenario.skills.length }) }}</span>
          <span>{{ t("desktop.mcpListed", { count: activeScenario.mcp.length }) }}</span>
        </p>
        <div class="scene-detail-actions">
          <Tag type="info" size="sm" data-testid="scene-upload-off">{{ t("desktop.sceneUploadOff") }}</Tag>
          <Tag v-if="activeScenario.builtin !== false" type="warning" size="sm" data-testid="preset-save-off">{{ t("desktop.presetCannotSave") }}</Tag>
          <Button size="sm" data-testid="scene-copy" @click="copyScenario">{{ t('preview.copyScene') }}</Button>
          <Button
            v-if="activeScenario.builtin === false"
            variant="danger"
            size="sm"
            data-testid="scene-delete"
            @click="removeCustomScene(activeScenario.id)"
          >{{ t("desktop.sceneDelete") }}</Button>
          <Button
            v-else
            variant="danger"
            size="sm"
            data-testid="scene-delete"
            disabled
            :title="t('desktop.sceneDeleteOff')"
          >{{ t("desktop.sceneDelete") }}</Button>
        </div>
        <Button v-if="activeScenario.workflow === 'prototype-to-code'" variant="primary" data-testid="scene-enter-workflow" @click="sceneView = 'workflow'">{{ t('desktop.enterPrototypeWorkflow') }}</Button>
        <Tabs
          v-model="detailTab"
          class="scene-detail-tabs"
          data-testid="scene-detail-tabs"
          :label="t('desktop.sceneDetail')"
          :tabs="[
            { id: 'basic', label: t('desktop.sceneDetailBasic'), testId: 'scene-tab-basic' },
            { id: 'tools', label: `${t('desktop.sceneDetailTools')} 0/${activeScenario.tools.length}`, testId: 'scene-tab-tools' },
            { id: 'skills', label: `${t('desktop.sceneDetailSkills')} 0/${activeScenario.skills.length}`, testId: 'scene-tab-skills' },
            { id: 'mcp', label: `${t('desktop.sceneDetailMcp')} 0/${activeScenario.mcp.length}`, testId: 'scene-tab-mcp' },
          ]"
        />
        <template v-if="detailTab === 'basic'">
          <div v-if="missingDeps.length" class="dep-banner" data-testid="scene-dep-banner" role="status">
            <p>{{ t("desktop.depBanner", { count: missingDeps.length, names: missingDeps.map((item) => item.name).join("、") }) }}</p>
            <div class="dep-banner-actions">
              <Button type="button" size="sm" data-testid="dep-supplement" @click="located = missingDeps[0]?.name || ''">{{ t("desktop.depSupplement") }}</Button>
              <Button type="button" size="sm" data-testid="dep-manual" :title="t('desktop.depLocateHint')" @click="locateDependencyConfiguration">{{ t("desktop.depLocate") }}</Button>
            </div>
            <p v-if="located" class="dep-where">{{ liveDependencies.find((item) => item.name === located)?.where }}</p>
          </div>
          <fieldset class="scene-config" data-testid="scene-basic-fields">
            <label>{{ t("preview.sceneName") }}<Input :model-value="activeScenario.name" :readonly="activeScenario.builtin !== false" :disabled="activeScenario.builtin !== false" maxlength="80" @input="activeScenario.builtin === false && (activeScenario.name = ($event.target as HTMLInputElement).value)" /></label>
            <fieldset class="scene-modes" data-testid="scene-modes">
              <legend>{{ t("desktop.sceneModes") }}</legend>
              <label v-for="mode in (['code', 'work'] as const)" :key="mode"><Checkbox :data-testid="'scene-mode-' + mode" :disabled="activeScenario.builtin !== false || (activeScenario.modes.length === 1 && activeScenario.modes.includes(mode))" :model-value="activeScenario.modes.includes(mode)" @update:model-value="changeSceneMode(mode, $event === true)" /> {{ mode === 'code' ? 'Code' : 'Work' }}</label>
            </fieldset>
            <label>{{ t("preview.sceneSummary") }}<Textarea :model-value="activeScenario.summary" rows="2" maxlength="400" :readonly="activeScenario.builtin !== false" :disabled="activeScenario.builtin !== false" @input="activeScenario.builtin === false && (activeScenario.summary = ($event.target as HTMLTextAreaElement).value)" /></label>
            <div class="scene-policy-row" data-testid="scene-policy-row">
              <label>{{ t("desktop.sceneToolRange") }}
                <Select disabled :aria-label="t('desktop.sceneToolRange')">
                  <option>{{ t("desktop.sceneToolRangePreset") }}</option>
                </Select>
              </label>
              <label>{{ t("desktop.sceneChatMode") }}
                <Select disabled :aria-label="t('desktop.sceneChatMode')">
                  <option>{{ t("desktop.executionAgent") }} · {{ t("desktop.notConnected") }}</option>
                </Select>
              </label>
            </div>
            <label>{{ t("preview.sceneGuidance") }}<Textarea :model-value="activeScenario.instructions" rows="4" maxlength="4000" :readonly="activeScenario.builtin !== false" :disabled="activeScenario.builtin !== false" @input="activeScenario.builtin === false && (activeScenario.instructions = ($event.target as HTMLTextAreaElement).value)" /></label>
            <p v-if="activeScenario.builtin === false" class="hint">{{ t("preview.customScene") }}</p>
            <p v-else class="hint">{{ t("desktop.presetReadonly") }}</p>
          </fieldset>
          <h3>{{ t("desktop.dependencies") }}</h3>
          <ul data-testid="scene-dependencies">
            <li v-for="item in liveDependencies" :key="item.name">
              {{ item.name }} · {{ t(dependencyLabel(item.state)) }}
              <Button v-if="item.state !== 'installed'" type="button" size="sm" @click="located = item.name">{{ t("desktop.locateDep") }}</Button>
              <p v-if="located === item.name" class="dep-where">{{ item.where }}</p>
            </li>
          </ul>
          <p class="scope-status" data-testid="scene-scope-status">
            <span>{{ activeScenario.skills.length ? t("desktop.skillsListed", { count: activeScenario.skills.length }) : t("desktop.skillsOffShort") }}</span>
            <span>{{ activeScenario.mcp.length ? t("desktop.mcpListed", { count: activeScenario.mcp.length }) : t("desktop.mcpOffShort") }}</span>
          </p>
          <Button type="button" variant="primary" size="sm" :disabled="activeScenario.status === 'disabled' || !activeScenario.modes.includes(workbench.workMode) || prepBlocked" data-testid="apply-scenario" @click="apply">{{ t("desktop.applyScene") }}</Button>
          <p v-if="prepBlocked" class="hint" data-testid="prep-blocked">{{ t("desktop.sceneBlocked") }}</p>
          <p v-if="workbench.notice === 'applied'" role="status">{{ t("desktop.appliedScene") }}</p>
        </template>
        <template v-else-if="detailTab === 'tools'">
          <p class="hint" data-testid="scene-tools-empty">{{ t("desktop.sceneToolsEmpty") }}</p>
          <ul data-testid="scene-tools-list">
            <li v-for="tool in activeScenario.tools" :key="tool">{{ tool }}</li>
          </ul>
          <p v-if="!activeScenario.tools.length" class="hint">{{ t("desktop.notConnected") }}</p>
        </template>
        <template v-else-if="detailTab === 'skills'">
          <p v-if="!activeScenario.skills.length" class="hint" data-testid="skills-empty">{{ t("desktop.skillsEmpty") }}</p>
          <ul data-testid="scene-skills-list">
            <li v-for="skill in activeScenario.skills" :key="skill">{{ skill }} · {{ t("desktop.notConnected") }}</li>
          </ul>
        </template>
        <template v-else>
          <p v-if="!activeScenario.mcp.length" class="hint" data-testid="mcp-empty">{{ t("desktop.mcpEmpty") }}</p>
          <ul data-testid="scene-mcp-list">
            <li v-for="item in activeScenario.mcp" :key="item">{{ item }} · {{ t("desktop.notConnected") }}</li>
          </ul>
        </template>

      </article>
    </div>
    <div v-else-if="sceneView === 'workflow'" class="scene-layout" data-testid="scene-workflow-view">
      <header class="scene-detail-head">
        <Button size="sm" data-testid="workflow-back-detail" @click="sceneView = 'detail'">{{ t('desktop.backToSceneConfiguration') }}</Button>
        <h2>{{ activeScenario.name }} · {{ t('desktop.prototypeWorkflow') }}</h2>
      </header>
      <Tabs v-model="workflowTab" :label="t('desktop.prototypeWorkflow')" :tabs="[
        { id: 'versions', label: t('desktop.workflowDesignVersions'), testId: 'workflow-tab-versions' },
        { id: 'preparation', label: t('desktop.workflowPreparation'), testId: 'workflow-tab-preparation' },
      ]" />
      <section v-show="workflowTab === 'versions'" :inert="workflowTab !== 'versions'" class="workflow-section" data-testid="workflow-versions">
            <section data-testid="scenario-design-step">
              <h2>{{ t("desktop.design") }}</h2>
              <p>{{ t("desktop.designHint") }}</p>

              <Button type="button" size="sm" data-testid="scenario-open-prototype" :disabled="!builderEnabled" @click="emit('navigate', 'builder-alpha')">{{ t("desktop.layoutDraftOpenBuilder") }}</Button>
            </section>
            <section><h2>{{ t("desktop.preview") }}</h2><p>{{ t("desktop.previewHint") }}</p><Button type="button" size="sm" data-testid="scenario-open-versions" :disabled="!builderEnabled" @click="emit('navigate', 'builder-alpha')">{{ t("desktop.openVersions") }}</Button>
              <label>{{ t("desktop.chooseVersion") }}
                <Select v-model="selected" :disabled="loading || !!error" data-testid="scenario-version">
                  <option value="">{{ t("desktop.chooseVersion") }}</option>
                  <option v-for="version in versions" :key="version.id" :value="version.id">{{ version.title }} · {{ version.sourceRef }} · {{ version.id.slice(0, 8) }}</option>
                </Select>
              </label>
              <p v-if="error" role="alert">{{ error }}</p>
              <p v-else-if="!loading && !versions.length">{{ t("desktop.noVersions") }}</p>
              <Button type="button" size="sm" :disabled="loading" @click="loadVersions">{{ t("desktop.refreshVersions") }}</Button>
            </section>
      </section>
      <section v-show="workflowTab === 'preparation'" :inert="workflowTab !== 'preparation'" class="workflow-section" data-testid="workflow-preparation">
              <h2>{{ t("desktop.develop") }}</h2><p>{{ t("desktop.developHint") }}</p>
              <Button type="button" variant="primary" size="sm" :disabled="!chatEnabled || !selected || loading || !!error || prepBlocked" data-testid="scenario-develop" @click="develop">{{ t("desktop.openCode") }}</Button>
          <section ref="preparation" class="gate" data-testid="delivery-gate">
            <h2>{{ t("desktop.gateTitle") }}</h2>
            <p>{{ t("desktop.gateBody") }}</p>
            <Button type="button" size="sm" data-testid="refresh-prep" :disabled="refreshingPrep" @click="refreshPrep">{{ t("desktop.refreshPrep") }}</Button>
            <p data-testid="live-repo-identity">{{ liveRepoLine }}</p>
            <p data-testid="live-intended-path">{{ liveIntendedLine }}</p>
            <p data-testid="live-local-grant">{{ liveGrantLine }}</p>
            <p data-testid="live-baseline">{{ liveBaselineLine }}</p>
            <p data-testid="live-source">{{ liveSourceLine }}</p>
            <p v-if="sourceReady" class="hint" data-testid="live-source-excerpt">{{ source?.excerpt.slice(0, 160) }}{{ (source?.excerpt.length || 0) > 160 ? "…" : "" }}</p>
            <p data-testid="live-dirty">{{ liveDirtyLine }}</p>
            <p data-testid="live-verification">{{ liveVerificationLine }}</p>
            <Button type="button" size="sm" data-testid="run-verification-probe" :disabled="probeBusy || !prepSettled" @click="runVerificationProbe">{{ t("desktop.verificationProbeRun") }}</Button>
            <p data-testid="live-verification-probe">{{ liveProbeLine }}</p>
            <p data-testid="live-preview">{{ livePreviewLine }}</p>
            <p v-if="livePreview.ready" class="hint"><a data-testid="live-preview-link" :href="livePreview.url">{{ livePreview.url }}</a></p>
            <fieldset class="acceptance-checklist" data-testid="acceptance-checklist">
              <legend>{{ t("desktop.acceptanceTitle") }}</legend>
              <p data-testid="acceptance-status">{{ acceptanceLine }}</p>
              <label v-for="item in ACCEPTANCE_ITEMS" :key="item.id">
                <Checkbox :data-testid="'accept-' + item.id" v-model="acceptance[item.id]" />
                {{ t(item.labelKey) }}
              </label>
            </fieldset>
            <ul data-testid="delivery-gate-list">
              <li v-for="gate in openGates" :key="gate.key">
                {{ t(gate.key) }}
                <Button
                  v-if="gate.action === 'versions' || gate.action === 'builder'"
                  type="button"
                  size="sm"
                  data-testid="gate-open-versions"
                  @click="gateAction(gate.action)"
                >{{ t("desktop.gateOpenVersions") }}</Button>
                <Button
                  v-else-if="gate.action === 'model'"
                  type="button"
                  size="sm"
                  data-testid="gate-open-model"
                  @click="gateAction(gate.action)"
                >{{ t("desktop.gateOpenModel") }}</Button>
              </li>
            </ul>
            <p v-if="blocked || prepBlocked" role="status" data-testid="scene-blocked">{{ t("desktop.sceneBlocked") }} {{ liveRepoLine }}。{{ t("desktop.verificationOpen") }}</p>
          </section>
      </section>
    </div>
    <Button v-if="!builderEnabled || !chatEnabled" type="button" size="sm" @click="emit('navigate', 'plugins')">{{ t("desktop.enablePlugins") }}</Button>
  </section>
</template>

<style scoped>
.scenario-workspace{padding:24px;max-width:1180px;margin:auto;display:grid;gap:16px}
.scene-head,.draft-actions{display:flex;justify-content:space-between;gap:12px;align-items:start}
h1,h2,h3{margin:0}
.scene-tabs{display:flex;gap:8px;flex-wrap:wrap}
.scene-catalog{display:grid;gap:12px}
.scene-catalog-toolbar{display:flex;justify-content:flex-end}
.scene-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.workflow-section{display:grid;gap:16px;min-width:0}.workflow-section>section{display:grid;gap:12px;min-width:0;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}.workflow-section :deep(.eap-button){justify-self:start}.workflow-section p{margin:0;overflow-wrap:anywhere}
.scene-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;padding:0;list-style:none;align-content:start}
.scene-card{min-height:168px}
.scene-card strong{font-size:16px}
.scene-card span{font-size:12px;color:var(--text-soft);line-height:1.55}
button.scene-link{margin:0}
button.scene-link:hover{text-decoration:underline}
button.scene-delete:disabled{text-decoration:none}
.scene-detail-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.scene-detail-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.scene-config{display:grid;gap:10px;margin:0;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2)}
.scene-config>label{display:grid;gap:4px;font-size:12px;color:var(--text-soft)}
.scene-config :deep(.eap-input),.scene-config :deep(.eap-textarea),.scene-config :deep(.eap-select){width:100%;min-width:0}
.scene-modes,.scene-policy-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:0;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2)}
.scene-modes label,.scene-policy-row label{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-soft)}
.scene-policy-row label{display:grid;gap:4px}
.scene-policy-row select{width:100%;min-width:0;font:inherit;font-size:12px}
.scene-meta{display:flex;flex-wrap:wrap;gap:6px;margin:0}
.scene-meta span{padding:3px 8px;border:1px solid var(--border);border-radius:999px;background:var(--surface-2);font-size:11px;color:var(--text-soft)}
.dep-banner{display:grid;gap:8px;padding:12px;border:1px solid var(--eap-color-warning-border);border-radius:10px;background:var(--warn-bg)}
.dep-banner p{margin:0;font-size:12px;color:var(--warn-text);line-height:1.55}
.dep-banner-actions{display:flex;flex-wrap:wrap;gap:8px}
.scene-detail{display:grid;gap:10px;padding:16px;border:1px solid var(--border);border-radius:16px;background:var(--surface)}
.scenario-steps{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:0;list-style:none}
.scenario-steps li,.gate{padding:14px;background:var(--surface-2);border:1px solid var(--border);border-radius:12px}
.scope-status{display:flex;flex-wrap:wrap;gap:6px;margin:0;font-size:11px;color:var(--text-soft)}
.scope-status span{padding:3px 8px;border:1px solid var(--border);border-radius:999px;background:var(--surface-2)}
.dep-where{margin:6px 0 0;font-size:11px;color:var(--text-soft);line-height:1.5}
small{display:block;color:var(--text-soft);font-size:11px}
.scene-config{display:grid;gap:12px;min-width:0;padding:16px;border:1px solid var(--border-strong);border-radius:10px}.scene-config label{display:grid;gap:7px;font-size:12px}
.hint,p{line-height:1.55}
.acceptance-checklist{display:grid;gap:8px;margin:12px 0 0;padding:12px;border:1px dashed var(--border-strong);border-radius:10px;background:var(--surface-2)}
.acceptance-checklist legend{font-size:12px;padding:0 4px}
.acceptance-checklist label{display:flex;gap:8px;align-items:flex-start;font-size:12px;line-height:1.5}
.acceptance-checklist input{margin-top:2px;flex-shrink:0}
@media(max-width:1000px){.scene-layout,.scenario-steps{grid-template-columns:1fr}}
@media(max-width:760px){.scenario-workspace{padding:12px}.scene-head,.draft-actions{flex-wrap:wrap}.scene-detail{padding:12px}}
</style>
