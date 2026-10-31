<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { isAxiosError } from 'axios';
import { Button, Badge, Collapse, ConfirmBox } from '@eap/ui';
import { runtimeApi, type BoardRunPage, type BoardRunStart, type BoardTask } from '@eap/runtime-client';
import { useMockServices } from '../../lib/serviceConfig';
import PrototypeVersionViewer from './PrototypeVersionViewer.vue';
import BoardRunReview from './BoardRunReview.vue';
import type { BoardRun } from '@eap/runtime-client';
import { readRunRequest, writeRunRequest } from './boardRunRequest';
const props = defineProps<{ task: BoardTask; disabled?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const page = ref<BoardRunPage | null>(null), loading = ref(false), starting = ref(false), confirming = ref(false), note = ref('');
const pending = ref<BoardRunStart | null>(null);
const viewing = ref<{ id: string; contentHash: string } | null>(null);
const reviewing = ref<BoardRun | null>(null);
const store = (() => { try { return sessionStorage; } catch { return null; } })();
const open = computed(() => page.value?.items.some(run => ['CREATED', 'RUNNING', 'CANCELLING'].includes(run.execution.status)) ?? props.task.executionActive);
const pollingNeeded = computed(() => page.value?.items.some(run => ['CREATED', 'RUNNING', 'CANCELLING'].includes(run.execution.status) && !run.execution.unconfirmedReason));
const canStart = computed(() => !props.disabled && !loading.value && !starting.value && !open.value && props.task.column === 'ready' && props.task.preparationIssues.length === 0 && !!page.value?.availability.allowed && !pending.value);
let generation = 0, attempts = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
function stopPolling() { if (timer) clearTimeout(timer); timer = undefined; }
function errorText(error: unknown) {
  const code = isAxiosError(error) ? String(error.response?.data?.detail ?? '') : '';
  return t('boardRun.' + ({ BOARD_REVISION_CONFLICT: 'stale', BOARD_EXECUTION_ACTIVE: 'active', BOARD_PREPARATION_REQUIRED: 'prepare', BOARD_WORKSPACE_CHANGED: 'workspaceChanged', BOARD_RUN_REQUEST_CONFLICT: 'requestConflict' }[code] ?? 'failed'));
}
async function refresh(manual = false) {
  if (loading.value) return;
  if (manual) attempts = 0;
  stopPolling(); loading.value = true;
  const current = generation, id = props.task.id, projectId = props.task.projectId;
  const wasOpen = open.value;
  try {
    const data = await runtimeApi.boardRuns(id, projectId);
    if (current !== generation) return;
    page.value = data;
    if (pending.value && data.items.some(run => run.requestId === pending.value?.requestId)) {
      writeRunRequest(store, id, useMockServices, null); pending.value = null; note.value = t('boardRun.recovered');
    }
    if (wasOpen !== open.value || props.task.executionActive !== open.value) emit('changed');
  } catch { if (current === generation) note.value = t('boardRun.loadFailed'); }
  finally {
    if (current === generation) {
      loading.value = false;
      if (pollingNeeded.value || (!page.value && props.task.executionActive)) {
        if (++attempts <= 60) timer = setTimeout(() => void refresh(), 2000);
        else note.value = t('boardRun.pollPaused');
      }
    }
  }
}
function requestStart() {
  if (!canStart.value) return;
  confirming.value = true;
}
async function start() {
  confirming.value = false;
  if (starting.value || !page.value || (props.disabled && !pending.value)) return;
  pending.value ??= { projectId: props.task.projectId, revision: props.task.revision, requestId: crypto.randomUUID(), workspacePath: page.value.availability.workspacePath };
  if (!writeRunRequest(store, props.task.id, useMockServices, pending.value)) { pending.value = null; note.value = t('boardRun.storageFailed'); return; }
  const current = generation, id = props.task.id;
  starting.value = true; note.value = '';
  try {
    await runtimeApi.startBoardRun(id, { ...pending.value });
    writeRunRequest(store, id, useMockServices, null);
    if (current !== generation) return;
    pending.value = null; note.value = t('boardRun.started'); emit('changed');
  } catch (error) {
    if (current !== generation) return;
    if (isAxiosError(error) && error.response && error.response.status >= 400 && error.response.status < 500) {
      writeRunRequest(store, id, useMockServices, null); pending.value = null; note.value = errorText(error); emit('changed');
    } else note.value = t('boardRun.uncertain');
  } finally {
    if (current === generation) { starting.value = false; await refresh(true); }
  }
}
watch(() => props.task.id, () => {
  generation++; stopPolling(); viewing.value = null; reviewing.value = null; attempts = 0; page.value = null; loading.value = false; starting.value = false; confirming.value = false;
  pending.value = readRunRequest(store, props.task.id, props.task.projectId, useMockServices);
  note.value = pending.value ? t('boardRun.uncertain') : '';
  void refresh();
}, { immediate: true });
onBeforeUnmount(() => { generation++; stopPolling(); });
</script>
<template>
  <section class="board-run" data-testid="board-run-panel">
    <h3>{{ t('boardRun.title') }}</h3>
    <p>{{ t('boardRun.hint') }}</p>
    <p v-if="page?.availability.workspacePath" data-testid="board-run-workspace">{{ t('boardRun.workspace') }}：<code>{{ page.availability.workspacePath }}</code></p>
    <p v-if="page && !page.availability.allowed" role="status">{{ t('boardRun.unavailable') }} · {{ page.availability.reason }}</p>
    <p v-else-if="task.column !== 'ready' || task.preparationIssues.length || disabled" role="status">{{ t('boardRun.prepare') }}</p>
    <div class="board-run__actions">
      <Button size="sm" :disabled="!canStart" data-testid="board-run-start" @click="requestStart">{{ t('boardRun.start') }}</Button>
      <Button v-if="pending" size="sm" :disabled="starting || loading" data-testid="board-run-retry" @click="start">{{ t('boardRun.retry') }}</Button>
      <Button size="sm" :disabled="loading || starting" data-testid="board-run-refresh" @click="refresh(true)">{{ t('boardRun.refresh') }}</Button>
    </div>
    <p v-if="note" role="status" data-testid="board-run-note">{{ note }}</p>
    <p>{{ t('boardRun.cancellation') }}</p>
    <p v-if="page && !page.items.length">{{ t('boardRun.empty') }}</p>
    <article v-for="run in page?.items ?? []" :key="run.execution.id" class="board-run__item" data-testid="board-run-record">
      <div class="board-run__actions"><Badge>{{ t(run.execution.unconfirmedReason ? 'boardRun.unknown' : 'boardRun.status.' + run.execution.status) }}</Badge><code>{{ run.execution.id }}</code></div>
      <p>{{ t('boardRun.version', { version: run.taskRevision }) }} · {{ run.execution.startedAt }}</p>
      <p v-if="run.execution.unconfirmedReason" role="alert">{{ run.execution.unconfirmedReason }} · {{ t('boardRun.unknownHint') }}</p>
      <p>{{ t('boardRun.workspace') }}：{{ run.execution.workspacePath }}</p>
      <p v-if="run.execution.exitCode != null">{{ t('boardRun.exitCode') }}：{{ run.execution.exitCode }} · {{ run.execution.exitEvidence }}</p>
      <p v-if="run.execution.status === 'SUCCEEDED'">{{ t('boardRun.notAccepted') }}</p>
      <div><Button size="sm" data-testid="board-run-review" @click="reviewing = run">{{ t('boardReview.open') }}</Button></div>
      <div v-if="run.task.prototype" class="board-run__prototype" data-testid="board-run-prototype"><p>{{ t('boardPrototype.runVersion') }}：{{ run.task.prototype.title || run.task.prototype.id }}</p><code>{{ run.task.prototype.id }}<br>SHA-256: {{ run.task.prototype.contentHash }}</code><Button size="sm" data-testid="board-run-prototype-view" @click="viewing = run.task.prototype">{{ t('boardPrototype.view') }}</Button></div>
      <p v-else>{{ t('boardPrototype.runNone') }}</p>
      <Collapse><template #summary>{{ t('boardRun.snapshot') }}</template><p>{{ run.task.title }}</p><p>{{ run.task.goal }}</p><p>{{ run.task.acceptanceCriteria }}</p></Collapse>
      <Collapse :open="true"><template #summary>{{ t('boardRun.output') }}</template><pre>{{ run.execution.stdout || '—' }}</pre><pre v-if="run.execution.stderr">{{ run.execution.stderr }}</pre></Collapse>
    </article>
    <PrototypeVersionViewer v-if="viewing" :version-id="viewing.id" :expected-hash="viewing.contentHash" @close="viewing = null" />
    <BoardRunReview v-if="reviewing" :key="reviewing.execution.id" :task-id="task.id" :project-id="task.projectId" :run="reviewing" @close="reviewing = null" />
    <ConfirmBox v-if="confirming" :title="t('boardRun.confirm')" :impact="[page?.availability.workspacePath ?? '', 'git status', t('boardRun.hint')]" :confirm-label="t('boardRun.start')" :refusal="canStart ? undefined : t('boardRun.prepare')" :danger="false" @confirm="start" @cancel="confirming = false" />
  </section>
</template>
<style scoped>
.board-run{display:grid;gap:10px;padding-top:14px;border-top:1px solid var(--border);min-width:0}.board-run h3{margin:0;font-size:14px}.board-run p{white-space:pre-wrap;overflow-wrap:anywhere}.board-run__actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.board-run__item{display:grid;gap:10px;padding:12px;border:1px solid var(--border);border-radius:10px;min-width:0}.board-run code{overflow-wrap:anywhere;font-size:11px}.board-run pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;padding:10px;margin:8px 0;color:var(--eap-code-text);background:var(--eap-code-bg);border-radius:8px;font-size:11px}
.board-run__prototype{display:grid;gap:8px;justify-items:start}
</style>
