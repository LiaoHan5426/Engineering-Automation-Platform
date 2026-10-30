<script setup lang="ts">
/**
 * Workbench rail/dock panel shared by the chat assembly.
 * Domain state stays in features/shell. Promote to @eap/layout only when a second workbench reuses this contract.
 */
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import VerificationChecks from "../features/shell/VerificationChecks.vue";
import RepositoryBrowser from "./RepositoryBrowser.vue";
import { Input } from "@eap/ui";
import { pendingWrite } from "../features/chat/pendingWrite";
import { pagePreviewMessageKey, resolvePagePreview } from "../features/shell/pagePreview";
import { chatBinding, currentExtras, projectLabel, scenarios, sessionProjectId, workbench } from "../features/shell/workbench";
import { identityAuthorized, identityPath, runtimeIdentity } from "../features/shell/runtimeIdentity";
import { useMockServices } from "../lib/serviceConfig";

const props = defineProps<{ mode: "summary" | "changes" | "files" | "terminal" }>();
const emit = defineEmits<{ close: []; open: [target: "changes" | "files" | "terminal" | "composer" | "policy"] }>();
const { t } = useI18n();
const filesQuery = ref("");
const active = computed(() => chatBinding.value?.history.find((item) => item.id === chatBinding.value?.activeId) ?? null);
const sessionKey = computed(() => chatBinding.value?.activeId || "scratch");
const sessionTitle = computed(() => active.value?.title || t("desktop.summaryUnbound"));
const extras = computed(() => currentExtras());
const knownVerification = computed(() => chatBinding.value?.verification || "not_requested");
const scenarioName = computed(() => scenarios.find((item) => item.id === (chatBinding.value?.scenarioId || extras.value.scenarioId))?.name || "");
const executionLabel = computed(() => {
  const mode = workbench.sessionExtras[chatBinding.value?.activeId ?? "scratch"]?.executionMode || chatBinding.value?.executionMode || "chat";
  return mode === "plan" ? "desktop.executionPlan" : mode === "agent" ? "desktop.executionAgent" : "desktop.executionChat";
});
const localNames = computed(() => chatBinding.value?.localFiles ?? chatBinding.value?.references ?? []);
const versionId = computed(() => chatBinding.value?.versionId ?? "");
const selectedPath = ref("");
const proposalFiles = computed(() => chatBinding.value?.proposal?.files ?? []);
const selectedFile = computed(() => proposalFiles.value.find((file) => file.path === selectedPath.value) ?? proposalFiles.value[0] ?? null);
/** Diff selection is per session; never keep another session's file highlight. */
watch(sessionKey, () => {
  selectedPath.value = "";
});
/** UI project group for this session — never invents a directory from the process path. */
const sessionProjectLine = computed(() => {
  // Drafts use scratch extras until the first send creates a conversation id.
  const sessionId = chatBinding.value?.activeId;
  const projectId = sessionId ? sessionProjectId(sessionId) : (workbench.sessionExtras.scratch?.projectId ?? null);
  const label = projectLabel(projectId);
  return label
    ? t("desktop.sessionProjectBound", { name: label })
    : t("desktop.sessionProjectUnbound");
});
/** Process-bound local-service path observation; separate from session project grouping. */
const processPathLine = computed(() => {
  const path = identityPath(runtimeIdentity.value) || chatBinding.value?.workspaceLabel || "";
  if (!path) return t("desktop.summaryUnknown");
  return identityAuthorized(runtimeIdentity.value)
    ? t("desktop.sessionProcessPath", { path })
    : t("desktop.sessionProcessPathOpen", { path });
});
const grantIdentity = computed(() => {
  if (identityAuthorized(runtimeIdentity.value)) return t("desktop.repoAuthorized");
  if (identityPath(runtimeIdentity.value)) return t("desktop.repoUnauthorized");
  return t("desktop.repoUnknown");
});
const pendingLabel = computed(() => {
  const binding = chatBinding.value;
  const files = binding?.proposal?.files ?? (binding?.proposalFiles.length ? binding.proposalFiles.map(() => ({ baseHash: "" })) : []);
  const state = pendingWrite({ policy: binding?.approval ?? "review", files, applied: !!binding?.appliedFiles?.length, refused: !!binding?.writeRefused });
  return `desktop.pending${state.charAt(0).toUpperCase()}${state.slice(1)}`;
});
const pagePreview = computed(() =>
  resolvePagePreview({
    mock: useMockServices,
    origin: typeof window !== "undefined" ? window.location.origin : "",
  }),
);
const previewLine = computed(() =>
  pagePreview.value.ready
    ? t(pagePreviewMessageKey(pagePreview.value), { url: pagePreview.value.url })
    : t(pagePreviewMessageKey(pagePreview.value)),
);
</script>

<template>
  <aside
    class="session-panel eap-scrollbar"
    :class="{
      'is-anchor': props.mode === 'summary' || props.mode === 'changes' || props.mode === 'files',
      'is-terminal-dock': props.mode === 'terminal',
      'is-files-overlay': props.mode === 'files',
    }"
    data-testid="session-panel"
  >
    <p v-if="props.mode === 'summary' || props.mode === 'changes'" class="panel-session" data-testid="panel-session">
      <strong>{{ sessionTitle }}</strong>
      <span>{{ t("desktop.panelSessionOnly") }}</span>
      <button
        v-if="props.mode === 'summary'"
        type="button"
        class="panel-session-close"
        data-testid="close-summary"
        :aria-label="t('desktop.panelClose')"
        @click="emit('close')"
      >{{ t("desktop.panelClose") }}</button>
    </p>
    <div v-if="mode === 'summary'" class="summary-cards">
      <button type="button" class="summary-card" @click="emit('open', 'composer')">
        <span class="summary-card-head"><strong>{{ t("desktop.summaryTalk") }}</strong></span>
        <span class="summary-title">{{ sessionTitle }}</span>
        <span data-testid="session-project">{{ sessionProjectLine }}</span>
        <span class="summary-path" data-testid="session-process-path">{{ processPathLine }}</span>
        <span>{{ t(executionLabel) }}<template v-if="scenarioName"> · {{ scenarioName }}</template></span>
        <span v-if="chatBinding?.model">{{ chatBinding.connectionName }} · {{ chatBinding.model }}</span>
        <span v-if="extras.experts.length" class="expert-trace" data-testid="expert-trace">
          <span v-for="expert in extras.experts" :key="expert.id" class="expert-trace-item">
            <strong>{{ expert.name }}@{{ expert.version }}</strong>
            <small>{{ t("desktop.expertGuidance") }}：{{ expert.guidance }}</small>
            <small>{{ t("desktop.expertResources") }}：{{ expert.resources }}</small>
          </span>
          <small class="hint">{{ t("desktop.expertDisconnected") }}</small>
        </span>
        <span v-else class="hint" data-testid="expert-none">{{ t("desktop.expertNone") }}</span>
      </button>
      <section class="summary-card">
        <button type="button" @click="emit('open', 'changes')">
          <span class="summary-card-head"><strong>{{ t("desktop.summaryReview") }}</strong><em>{{ chatBinding?.approval === "read_only" ? t("task.readOnly") : t("task.review") }}</em></span>
          <span data-testid="pending-write">{{ t(pendingLabel) }}</span>
          <VerificationChecks brief :recorded="knownVerification" />
        </button>
      </section>
      <button type="button" class="summary-card" @click="emit('open', 'changes')">
        <span class="summary-card-head"><strong>{{ t("desktop.summaryDelta") }}</strong><em>{{ chatBinding?.proposalFiles.length || 0 }}</em></span>
        <span>{{ chatBinding?.proposalFiles.length ? t("desktop.summaryChanges", { count: chatBinding.proposalFiles.length }) : t("desktop.summaryNoChanges") }}</span>
      </button>
      <button type="button" class="summary-card" @click="emit('open', 'policy')">
        <span class="summary-card-head"><strong>{{ t("desktop.summaryGrant") }}</strong><em>{{ chatBinding?.approval === "read_only" ? t("task.readOnly") : t("task.review") }}</em></span>
        <span>{{ grantIdentity }}</span>
        <span data-testid="risk-review-off">{{ t("desktop.riskReviewOff") }}</span>
      </button>
      <section class="summary-card">
        <span class="summary-card-head"><strong>{{ t("desktop.summaryTasks") }}</strong></span>
        <ol data-testid="summary-steps">
          <li><button type="button" @click="emit('open', 'composer')">{{ chatBinding?.draft?.trim() ? t("desktop.stepDraft") : t("desktop.stepNoDraft") }}</button></li>
          <li><button type="button" @click="emit('open', 'composer')">{{ chatBinding?.sending ? t("desktop.stepSending") : t("desktop.stepIdle") }}</button></li>
          <li><button type="button" @click="emit('open', 'changes')">{{ chatBinding?.proposalFiles.length ? t("desktop.summaryChanges", { count: chatBinding.proposalFiles.length }) : t("desktop.summaryNoChanges") }}</button></li>
          <li><button type="button" @click="emit('open', 'terminal')">{{ t("desktop.stepProcess") }}</button></li>
          <li><button type="button" @click="emit('open', 'changes')">{{ t("desktop.acceptanceOpen") }}</button></li>
        </ol>
      </section>
      <button type="button" class="summary-card" data-testid="summary-background" @click="emit('open', 'terminal')">
        <span class="summary-card-head"><strong>{{ t("desktop.summaryProcess") }}</strong><em data-testid="summary-none">{{ t("desktop.summaryNone") }}</em></span>
        <span>{{ t("desktop.summaryBackgroundEmpty") }}</span>
        <span>{{ t("desktop.terminalOff") }}</span>
        <span data-testid="run-recovery-off">{{ t("desktop.runRecoveryOff") }}</span>
      </button>
      <button type="button" class="summary-card" @click="emit('open', 'files')">
        <span class="summary-card-head"><strong>{{ t("desktop.summaryOrigin") }}</strong></span>
        <span class="summary-path" data-testid="origin-process-path">{{ processPathLine }}</span>
        <span>{{ localNames.length ? localNames.join("、") : t("desktop.summaryNoSources") }}</span>
        <span v-if="extras.delivery" data-testid="delivery-input">
          {{ extras.delivery.versionId }}
          {{ t(extras.delivery.pageLabel) }} · {{ extras.delivery.pagePath }}
          {{ t("desktop.deliverySource") }}
          {{ t("desktop.deliveryBaseline") }}
          {{ t("desktop.deliveryChecks") }}
          <span data-testid="delivery-preview">{{ previewLine }}</span>
          {{ t("desktop.acceptanceStillOpen") }}
        </span>
      </button>
    </div>
    <div v-else-if="mode === 'terminal'" class="terminal-surface" data-testid="terminal-surface">
      <header>
        <div class="terminal-tabs" role="tablist" :aria-label="t('desktop.terminal')">
          <span class="terminal-tab" role="tab" aria-selected="true">{{ sessionTitle || t('desktop.terminal') }}</span>
          <span class="terminal-tab-add" aria-hidden="true">＋</span>
        </div>
        <div class="terminal-actions">
          <small>UTF-8</small>
          <button type="button" class="terminal-stop" data-testid="terminal-stop" disabled :title="t('desktop.terminalStopOff')">{{ t("desktop.terminalStop") }}</button>
          <button type="button" data-testid="close-terminal" :aria-label="t('desktop.panelClose')" @click="emit('close')">{{ t("desktop.panelClose") }}</button>
        </div>
      </header>
      <p class="hint terminal-hint" data-testid="run-recovery-off">{{ t("desktop.terminalDockHint") }} · {{ t("desktop.runRecoveryOff") }}</p>
      <pre data-testid="terminal-output">{{ t("desktop.terminalOff") }}</pre>
    </div>
    <div v-else-if="mode === 'files'" class="files-browser">
      <header>
        <h2>{{ t("desktop.filesOverlayTitle") }}</h2>
        <button type="button" data-testid="close-files" @click="emit('close')">{{ t("desktop.panelClose") }}</button>
      </header>
      <label class="files-search">
        <span class="sr-only">{{ t("composerUi.searchFiles") }}</span>
        <Input v-model="filesQuery" type="search" data-testid="files-search" :placeholder="t('composerUi.searchFiles')" />
      </label>
      <details class="files-meta" data-testid="files-meta" :open="!!localNames.length || !!versionId">
        <summary>{{ t("desktop.localUploads") }} / {{ t("desktop.designVersion") }}</summary>
        <section data-testid="files-local-uploads">
          <h3>{{ t("desktop.localUploads") }}</h3>
          <p class="hint">{{ t("desktop.localUploadHint") }}</p>
          <p v-if="!localNames.length" class="hint">{{ t("desktop.noLocalUploads") }}</p>
          <ul v-else><li v-for="name in localNames" :key="name">{{ name }} <small>{{ t("desktop.hashUnknown") }}</small></li></ul>
        </section>
        <section data-testid="files-design-version">
          <h3>{{ t("desktop.designVersion") }}</h3>
          <p class="hint">{{ versionId || t("desktop.noDesignVersion") }}</p>
        </section>
      </details>
      <RepositoryBrowser :key="sessionKey" :filter="filesQuery" />
    </div>
    <div v-else class="changes-review">
      <header>
        <h2>{{ t("desktop.changes") }}</h2>
        <button type="button" data-testid="close-changes" @click="emit('close')">{{ t("desktop.panelClose") }}</button>
      </header>
      <div class="codex-split">
        <div class="codex-list">
          <h3 class="change-kind change-kind-candidate">{{ t("desktop.candidateHeading") }}</h3>
          <p class="hint">{{ t("desktop.candidateOnly") }}</p>
          <p v-if="!chatBinding?.proposalFiles.length" class="hint">{{ t("desktop.noChanges") }}</p>
          <button v-for="file in proposalFiles" :key="file.path" type="button" class="codex-file" :aria-pressed="selectedFile?.path === file.path" @click="selectedPath = file.path">{{ file.path }}</button>
          <h3 class="change-kind change-kind-applied">{{ t("desktop.appliedHeading") }}</h3>
          <p v-if="!chatBinding?.appliedFiles?.length" class="hint">{{ t("desktop.noneApplied") }}</p>
          <ul v-else><li v-for="path in chatBinding.appliedFiles" :key="path">{{ path }}</li></ul>
          <h3 class="change-kind change-kind-existing">{{ t("desktop.existingHeading") }}</h3>
          <p class="hint">{{ t("desktop.existingUnread") }}</p>
          <h3>{{ t("desktop.verification") }}</h3>
          <VerificationChecks :recorded="knownVerification" :checks="chatBinding?.verificationChecks" />
        </div>
        <article v-if="selectedFile" class="mock-diff codex-detail">
          <strong>{{ selectedFile.path }}</strong>
          <small>{{ t('desktop.fileBaseline') }}：{{ selectedFile.baseHash || t('desktop.summaryUnknown') }}</small>
          <div class="codex-diff">
            <section><small>{{ t('task.before') }}</small><pre>{{ selectedFile.before ?? t('task.newFile') }}</pre></section>
            <section><small>{{ t('task.after') }}</small><pre class="added">{{ selectedFile.content }}</pre></section>
          </div>
          <p v-if="!selectedFile.baseHash.trim()" class="hint">{{ t("desktop.applyBlocked") }}</p>
          <p v-else class="hint">{{ t("desktop.recheckOnApply") }}</p>
          <p class="hint">{{ t("desktop.earlierChanges") }}</p>
        </article>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.session-panel{min-height:0;overflow:auto;padding:16px;background:#faf9f4}
.is-anchor{padding:12px;background:#faf9f4}
.panel-session{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 10px;margin:0 0 10px;padding:8px 10px;border:1px solid #e3e6dc;border-radius:10px;background:#f7f8f4;font-size:11px;line-height:1.45;color:#68746e}
.panel-session strong{font-size:12px;font-weight:650;color:#243028;overflow-wrap:anywhere}
.panel-session-close{margin-left:auto;border:0;background:transparent;color:#526258;font:inherit;font-size:12px;cursor:pointer}
.summary-cards{display:grid;gap:10px}
.summary-card{display:grid;gap:6px;width:100%;margin:0;padding:14px;border:1px solid #e3e6dc;border-radius:14px;background:#fff;color:#243028;font:inherit;text-align:left;cursor:pointer;box-shadow:0 1px 0 rgb(36 48 40 / 4%)}
.summary-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;font-weight:650}
.summary-card-head em{font-style:normal;font-size:12px;font-weight:650;color:#287b6c;background:#e7f3ee;border-radius:999px;padding:2px 8px}
.summary-title{color:#243028;font-size:13px}
.summary-path{font-family:ui-monospace,monospace;font-size:11px;overflow-wrap:anywhere}
.summary-card>button{display:grid;gap:4px;width:100%;margin:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.summary-more{font-size:12px;color:#6d7a72}
.summary-more summary{cursor:pointer}
.summary-card>span,.summary-card small{font-size:12px;line-height:1.5;color:#526258}
.summary-card small{display:block}
.expert-trace{display:grid;gap:6px;margin-top:2px;padding:8px 10px;border:1px solid #e3e6dc;border-radius:8px;background:#f7f8f4}
.expert-trace-item{display:grid;gap:2px}
.expert-trace-item strong{font-size:12px;font-weight:600;color:#243028}
.expert-trace .hint{margin-top:2px}
.summary-card ol{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px}
.summary-card li button{display:inline;width:auto;margin:0;padding:0;border:0;background:transparent;font:inherit;color:#526258;cursor:pointer}
header{display:flex;justify-content:space-between;align-items:center;gap:8px;flex:0 0 auto;margin-bottom:8px}
.is-files-overlay{display:flex;flex-direction:column;gap:8px;padding:14px;min-height:0;overflow:hidden}
.files-browser{display:grid;gap:10px;min-height:0;grid-template-rows:auto auto auto minmax(0,1fr)}
.is-files-overlay .files-browser{flex:1;min-height:0}
.is-files-overlay :deep(.repository-browser){display:flex;flex-direction:column;min-height:0}
.is-files-overlay :deep(.repo-tree){max-height:none;flex:1;min-height:120px}
.files-search input{width:100%;font:inherit;font-size:12px}
.files-meta{padding:8px 10px;border:1px solid #e3e6dc;border-radius:10px;background:#f7f8f4}
.files-meta > summary{cursor:pointer;font-size:12px;font-weight:600;color:#526258}
.files-meta[open] > summary{margin-bottom:6px}
.files-meta h3{margin:8px 0 0;font-size:12px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.is-terminal-dock{padding:0;background:#1c2430;color:#d7e2da;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.terminal-surface{display:flex;flex-direction:column;min-height:0;flex:1}
.terminal-surface > header{margin:0;padding:8px 12px;border-bottom:1px solid #2b3644;background:#161d27;color:#d7e2da}
.terminal-tabs{display:flex;align-items:center;gap:8px;min-width:0}
.terminal-tab{padding:4px 10px;border-radius:8px 8px 0 0;background:#243041;font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.terminal-tab-add{opacity:.55;font-size:14px}
.terminal-actions{display:flex;align-items:center;gap:10px;margin-left:auto}
.terminal-actions small{font-size:11px;color:#8b98a8}
.terminal-actions button{border:0;background:transparent;color:#c5d0db;font:inherit;font-size:12px;cursor:pointer}
.terminal-stop:disabled{opacity:.45;cursor:not-allowed;color:#8b98a8}
.terminal-hint{margin:8px 12px 0;color:#9aabbc}
.terminal-surface pre{flex:1;margin:8px 12px 12px;padding:12px;overflow:auto;background:#121820;color:#d7e2da;border-radius:8px;font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap}
.changes-review header{margin-bottom:10px}
.codex-split{display:grid;grid-template-columns:1fr;gap:12px;align-items:start}
.codex-diff{display:grid;grid-template-columns:1fr;gap:10px}
.codex-file{border:0;background:transparent;text-align:left;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px}
.codex-file[aria-pressed="true"]{background:#e7f3ee}
@media(min-width:1200px){.codex-split{grid-template-columns:minmax(140px,180px) minmax(0,1fr)}.codex-diff{grid-template-columns:repeat(2,minmax(0,1fr))}}
h2{margin:0;font-size:15px}
h3{margin:16px 0 0;font-size:13px}
.change-kind{padding-left:8px;border-left:3px solid #c5cec4}
.change-kind-candidate{border-color:#b49a58}
.change-kind-applied{border-color:#3d8f72}
.change-kind-existing{border-color:#8b9588}
header button{border:0;background:transparent;color:#526258;cursor:pointer}
dl{display:grid;gap:10px;margin:14px 0}
dl > div{display:grid;gap:2px}
dt{font-size:11px;color:#7a887f}
dd{margin:0;font-size:13px;overflow-wrap:anywhere}
.hint{color:#68746e;font-size:12px;line-height:1.6}
.mock-diff{display:grid;gap:8px;margin:14px 0}.mock-diff strong{font-size:11px;overflow-wrap:anywhere}.mock-diff small,dd small{display:block;font-size:10px;color:#8b9588;line-height:1.6}.mock-diff pre{font-size:11px;white-space:pre-wrap;background:#f6eeea;color:#91665b;max-height:240px}.mock-diff pre.added{background:#e8f1e5;color:#52764f}
ul,ol{padding-left:18px;font-size:13px}
</style>
