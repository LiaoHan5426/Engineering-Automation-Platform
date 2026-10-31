<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { runtimeApi, type BoardTask, type BoardTaskDraft } from '@eap/runtime-client';
import { Button, Checkbox, ConfirmBox, Dialog, Input, Select, Textarea, Collapse } from "@eap/ui";
import { isAxiosError } from 'axios';
import { chatBinding, workbench, type BoardColumn } from './workbench';
import { localProjectState } from './localProjects';
import { useMockServices } from '../../lib/serviceConfig';
import BoardRunPanel from './BoardRunPanel.vue';
import BoardPrototypePanel from './BoardPrototypePanel.vue';
import { readBoardEdit, writeBoardEdit, readBoardCreate, writeBoardCreate } from './boardEdits';
const { t } = useI18n();
const columns: BoardColumn[] = ['planned', 'ready', 'running', 'acceptance', 'done'];
const query = ref(''), selectedId = ref(''), creating = ref(false), title = ref(''), note = ref('');
const priorityFilter = ref<'all' | 'p0' | 'p1' | 'p2'>('all');
const prototypePending = ref(false);
const busy = ref(false), rows = ref<BoardTask[]>([]);
const draftNotes = ref(''), draftGoal = ref(''), draftCriteria = ref('');
const draftRevision = ref(0);
const newGoal = ref(''), newCriteria = ref('');
const createRequest = ref<BoardTaskDraft | null>(null);
const draftPriority = ref<BoardTask['priority']>('none');
const createColumn = ref<'planned' | 'ready'>('planned');
const linkCurrentSession = ref(true);
const pendingAction = ref<(() => void) | null>(null);
const activeSessionId = computed(() => chatBinding.value?.activeId?.trim() || '');
const draftStore = (() => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; } })();
function persistEdit() {
  const task = selected.value; if (!task) return;
  writeBoardEdit(draftStore, task.id, useMockServices, dirty.value ? { notes: draftNotes.value, priority: draftPriority.value, revision: draftRevision.value, goal: draftGoal.value, acceptanceCriteria: draftCriteria.value } : null);
}
const dirty = computed(() => !!selected.value && (draftNotes.value !== selected.value.notes || draftPriority.value !== selected.value.priority || draftGoal.value !== selected.value.goal || draftCriteria.value !== selected.value.acceptanceCriteria));
const stale = computed(() => !!selected.value && draftRevision.value !== selected.value.revision);
function guarded(action: () => void) { if (busy.value) return; if (dirty.value) pendingAction.value = action; else action(); }
function closeDetail() { guarded(() => { selectedId.value = ''; }); }
function discardEdits() {
  const action = pendingAction.value; pendingAction.value = null;
  if (selected.value) writeBoardEdit(draftStore, selected.value.id, useMockServices, null);
  useLatest(); action?.();
}
function startCreate(column: 'planned' | 'ready' = 'planned') { guarded(() => { if (!createRequest.value) createColumn.value = column; creating.value = true; }); }
function selectTask(id: string) {
  if (id === selectedId.value) closeDetail();
  else guarded(() => { selectedId.value = id; });
}
function failureCode(error: unknown): string {
  if (!isAxiosError(error)) return '';
  return String(error.response?.data?.detail ?? error.response?.data?.error ?? '');
}
async function mutationFailed(error: unknown) {
  const code = failureCode(error);
  if (code.includes('BOARD_PREPARATION_REQUIRED')) note.value = t('desktop.boardPreparationRequired');
  else if (isAxiosError(error) && error.response?.status === 409) {
    note.value = t('desktop.boardConflict'); await load();
    // Keep the original draft revision until the user explicitly resolves the conflict.
  } else note.value = t('desktop.boardUpdateFailed');
}
function useLatest() {
  const task = selected.value; if (!task) return;
  draftNotes.value = task.notes; draftPriority.value = task.priority;
  draftGoal.value = task.goal; draftCriteria.value = task.acceptanceCriteria; draftRevision.value = task.revision;
  writeBoardEdit(draftStore, task.id, useMockServices, null);
}
function keepDraft() { if (selected.value) { draftRevision.value = selected.value.revision; persistEdit(); } }
const projectId = ref(localProjectState.selectedId || localProjectState.projects[0]?.id || 'local-eap');
const previewProjects = computed(() => localProjectState.projects.map(item => ({ id: item.id, name: item.label, directory: item.intendedPath })));
const selected = computed(() => rows.value.find(item => item.id === selectedId.value));
const tasks = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return rows.value.filter((item) => {
    if (priorityFilter.value !== 'all' && item.priority !== priorityFilter.value) return false;
    if (!needle) return true;
    return item.title.toLowerCase().includes(needle)
      || item.notes.toLowerCase().includes(needle)
      || item.goal.toLowerCase().includes(needle) || item.acceptanceCriteria.toLowerCase().includes(needle)
      || item.id.toLowerCase().includes(needle);
  });
});
const project = computed(() => previewProjects.value.find(item => item.id === projectId.value));
const selectedProject = computed(() => previewProjects.value.find(item => item.id === selected.value?.projectId));
let ticket = 0;
async function load() {
  const current = ++ticket; busy.value = true;
  try { const page = await runtimeApi.boardTasks(projectId.value); if (current === ticket) rows.value = page.items; }
  catch { if (current === ticket) note.value = t('desktop.boardLoadFailed'); }
  finally { if (current === ticket) busy.value = false; }
}
function switchProject(id: string) { if (createRequest.value) return; guarded(() => { projectId.value = id; selectedId.value = ''; note.value = ''; creating.value = false; }); }
watch(selectedId, () => {
  const task = selected.value;
  const cached = task ? readBoardEdit(draftStore, task.id, useMockServices) : null;
  draftNotes.value = cached?.notes ?? task?.notes ?? '';
  draftPriority.value = cached?.priority ?? task?.priority ?? 'none';
  draftGoal.value = cached?.goal ?? task?.goal ?? ''; draftCriteria.value = cached?.acceptanceCriteria ?? task?.acceptanceCriteria ?? '';
  draftRevision.value = cached?.revision ?? task?.revision ?? 0;
  if (cached) note.value = t(cached.revision === task?.revision ? 'desktop.boardDraftRestored' : 'desktop.boardDraftStale');
});
watch([draftNotes, draftPriority, draftGoal, draftCriteria], persistEdit, { flush: 'post' });
onMounted(() => window.addEventListener('beforeunload', persistEdit));
onBeforeUnmount(() => { ticket++; persistEdit(); window.removeEventListener('beforeunload', persistEdit); });
watch(projectId, () => {
  rows.value = [];
  createRequest.value = readBoardCreate(draftStore, projectId.value, useMockServices);
  if (createRequest.value) {
    title.value = createRequest.value.title; newGoal.value = createRequest.value.goal; newCriteria.value = createRequest.value.acceptanceCriteria;
    createColumn.value = createRequest.value.column; creating.value = true; note.value = t('desktop.boardCreateUncertain');
  }
  void load();
}, { immediate: true });
function prototypeSaved(task: BoardTask) {
  // The user may have started editing task fields while this independent request was pending.
  const preserveDraft = dirty.value;
  replace(task);
  if (!preserveDraft) useLatest();
}
function replace(task: BoardTask) { rows.value = rows.value.map(item => item.id === task.id ? task : item); }
async function move(id: string, column: BoardColumn) {
  if (busy.value) return;
  if (dirty.value || stale.value) { note.value = t('desktop.boardUnsaved'); return; }
  const task = rows.value.find(item => item.id === id); if (!task || task.column === column) return;
  if (!task.allowedColumns.includes(column)) {
    note.value = t(column === 'ready' ? 'desktop.boardPreparationRequired' : column === 'running' ? 'desktop.boardNoRun' : 'desktop.boardEvidence'); return;
  }
  busy.value = true;
  try {
    const saved = await runtimeApi.updateBoardTask(id, { projectId: task.projectId, revision: task.revision, column });
    replace(saved); if (selectedId.value === id) useLatest(); note.value = t('desktop.boardMoved');
  } catch (error) { await mutationFailed(error); }
  finally { busy.value = false; }
}
async function saveNotes() {
  const task = selected.value; if (!task || busy.value || stale.value) return;
  busy.value = true;
  try {
    const saved = await runtimeApi.updateBoardTask(task.id, { projectId: task.projectId, revision: draftRevision.value, notes: draftNotes.value, priority: draftPriority.value, goal: draftGoal.value, acceptanceCriteria: draftCriteria.value });
    replace(saved); useLatest(); note.value = t('desktop.boardFieldsSaved');
  } catch (error) { await mutationFailed(error); }
  finally { busy.value = false; }
}
async function create() {
  if (!title.value.trim() || busy.value) return;
  if (!createRequest.value && createColumn.value === 'ready' && (!newGoal.value.trim() || !newCriteria.value.trim())) {
    note.value = t('desktop.boardPreparationRequired'); return;
  }
  busy.value = true;
  createRequest.value ??= { projectId: projectId.value, title: title.value.trim(), column: createColumn.value,
    sessionId: linkCurrentSession.value ? activeSessionId.value : '', goal: newGoal.value, acceptanceCriteria: newCriteria.value, requestId: crypto.randomUUID() };
  if (!writeBoardCreate(draftStore, projectId.value, useMockServices, createRequest.value)) {
    createRequest.value = null; busy.value = false; note.value = t('desktop.boardCreateStorageFailed'); return;
  }
  try {
    // Retries retain the exact request and identity after an unknown network outcome.
    const task = await runtimeApi.createBoardTask({ ...createRequest.value });
    rows.value = [task, ...rows.value.filter(item => item.id !== task.id)];
    selectedId.value = task.id; writeBoardCreate(draftStore, projectId.value, useMockServices, null); createRequest.value = null;
    title.value = ''; newGoal.value = ''; newCriteria.value = ''; creating.value = false;
    note.value = task.sessionId ? t('desktop.boardCreatedLinked') : t('desktop.boardCreated');
  } catch (error) {
    if (isAxiosError(error) && error.response && error.response.status >= 400 && error.response.status < 500) {
      writeBoardCreate(draftStore, projectId.value, useMockServices, null); createRequest.value = null; await mutationFailed(error);
    } else note.value = t('desktop.boardCreateUncertain');
  } finally { busy.value = false; }
}
function open(task: BoardTask) {
  guarded(() => {
  // Seed chat draft only; never invent a fake conversation id from the task id.
  workbench.pendingBoardDraft = { sessionId: task.sessionId || '', title: [task.title, task.goal, task.acceptanceCriteria ? t('desktop.boardCriteria') + '：\n' + task.acceptanceCriteria : ''].filter(Boolean).join('\n\n') };
  window.location.hash = workbench.workMode === 'work' ? 'work' : 'chat';
  });
}
</script>
<template>
  <section class="preview-board" data-testid="preview-board">
    <header>
      <div>
        <p v-if="project?.name" class="eyebrow">{{ project.name }}</p>
        <h1>{{ t('desktop.board') }}</h1>
        <p>{{ t('preview.boardHint') }}</p>
        <p class="board-unattended" data-testid="board-unattended-badge">{{ t('desktop.boardUnattendedBadge') }}</p>
      </div>
      <Button variant="primary" :disabled="busy" data-testid="board-create-task" @click="startCreate()">＋ {{ t('preview.createTask') }}</Button>
    </header>
    <form v-if="creating" class="new-task-form" data-testid="board-create-form" @submit.prevent="create">
      <label>{{ t('desktop.' + createColumn) }}<Input v-model="title" required maxlength="200" :disabled="busy || !!createRequest" :placeholder="t('preview.taskTitle')" :aria-label="t('preview.taskTitle')" autofocus /></label>
      <label class="preparation-field">{{ t('desktop.boardGoal') }}<Textarea v-model="newGoal" data-testid="board-new-goal" rows="2" maxlength="4000" :required="createColumn === 'ready'" :disabled="busy || !!createRequest" /></label>
      <label class="preparation-field">{{ t('desktop.boardCriteria') }}<Textarea v-model="newCriteria" data-testid="board-new-criteria" rows="2" maxlength="4000" :required="createColumn === 'ready'" :disabled="busy || !!createRequest" /></label>
      <p class="board-notice">{{ t('desktop.boardPreparationHint') }}</p>
      <label v-if="activeSessionId" class="link-session" data-testid="board-link-session">
        <Checkbox v-model="linkCurrentSession" :disabled="busy || !!createRequest" />
        <span>{{ t('desktop.boardLinkCurrent') }} · {{ activeSessionId.slice(0, 8) }}</span>
      </label>
      <p v-else class="board-notice" data-testid="board-link-none">{{ t('desktop.boardLinkNone') }}</p>
      <Button type="submit" variant="primary" size="sm" :disabled="busy || !title.trim()">{{ t(createRequest ? 'desktop.boardRetryCreate' : 'preview.save') }}</Button>
      <Button type="button" size="sm" :disabled="busy || !!createRequest" @click="creating = false">{{ t('preview.close') }}</Button>
    </form>
    <div class="board-tools">
      <label>{{ t('desktop.boardProject') }}<Select data-testid="board-project" :disabled="busy || !!createRequest" :model-value="projectId" @change="switchProject(($event.target as HTMLSelectElement).value)"><option v-for="item in previewProjects" :key="item.id" :value="item.id">{{ item.name }}{{ item.directory ? ' · ' + item.directory : '' }}</option></Select></label>
      <Input v-model="query" type="search" data-testid="board-search" :placeholder="t('desktop.boardSearch')" :aria-label="t('desktop.boardSearch')" />
      <label>
        <span class="sr-only">{{ t('desktop.boardPriorityAll') }}</span>
        <Select v-model="priorityFilter" data-testid="board-priority">
          <option value="all">{{ t('desktop.boardPriorityAll') }}</option>
          <option value="p0">P0</option>
          <option value="p1">P1</option>
          <option value="p2">P2</option>
        </Select>
      </label>
      <span>{{ tasks.length }} · {{ t('desktop.boardDraftRecord') }}</span>
      <Button type="button" size="sm" :disabled="busy" @click="guarded(() => { selectedId = ''; note = ''; void load(); })">{{ t('desktop.boardRefresh') }}</Button>
    </div>
    <p v-if="!busy && !tasks.length && (query || priorityFilter !== 'all')" class="board-notice" role="status" data-testid="board-filter-empty">{{ t('desktop.boardFilterEmpty') }}</p>
    <p v-if="busy" role="status" data-testid="board-loading">{{ t('desktop.boardLoading') }}</p>
    <p v-if="note" class="board-notice" role="status">{{ note }}</p>
    <div class="board-scroll eap-scrollbar"><div class="board-lanes">
      <section v-for="column in columns" :key="column" class="board-lane" :data-testid="`lane-${column}`" @dragover.prevent @drop="move($event.dataTransfer?.getData('text/plain') ?? '', column)">
        <h2><span :class="column" />{{ t('desktop.' + column) }}<small>{{ tasks.filter(item => item.column === column).length }}</small></h2>
        <p class="lane-hint">{{ t('desktop.' + column + 'Hint') }}</p>
        <p v-if="column === 'ready'" class="lane-hint" data-testid="board-auto-off">{{ t('desktop.boardAutoOff') }}</p>
        <label v-if="column === 'ready'" class="auto-work" data-testid="board-auto-toggle">
          <Checkbox disabled />
          <span>{{ t('desktop.boardAutoWork') }} · {{ t('desktop.notConnected') }}</span>
        </label>
        <Button variant="card" v-for="task in tasks.filter(item => item.column === column)" :key="task.id" type="button" class="board-card" :aria-pressed="selectedId === task.id" :disabled="busy" :draggable="!busy && !task.executionActive" @dragstart="$event.dataTransfer?.setData('text/plain', task.id)" @click="selectTask(task.id)">
          <span class="card-meta">
            <small class="priority" :class="'prio-' + task.priority" data-testid="card-priority">{{ task.priority === 'none' ? t('desktop.boardUnranked') : task.priority.toUpperCase() }}</small>
            <small v-if="task.sessionId" class="card-session" data-testid="card-session" :title="task.sessionId">{{ t('desktop.boardSessionShort') }} · {{ task.sessionId.slice(0, 8) }}</small>
          </span>
          <strong>{{ task.title }}</strong>
          <span v-if="task.executionActive">{{ t('boardRun.active') }}</span>
          <span v-if="task.preparationIssues.length" class="preparation-missing">{{ t('desktop.boardPreparationMissing') }}</span>
          <span :title="task.id">{{ task.id.slice(0, 8) }}</span>
        </Button>
        <Button size="sm" variant="link" v-if="column === 'planned' || column === 'ready'" type="button" class="lane-add" :disabled="busy" data-testid="lane-add-task" @click="startCreate(column)">＋ {{ t('desktop.boardAddTask') }}</Button>
        <p v-if="!tasks.some(item => item.column === column)" class="empty-lane">{{ t('preview.noTasks') }}</p>
      </section>
    </div></div>
    <Dialog
      v-if="selected"
      :title="selected.title"
      :busy="busy || !!pendingAction"
      :close-label="t('preview.close')"
      close-test-id="board-close-detail"
      size="md"
      data-testid="board-detail-dialog"
      @close="closeDetail"
    >
      <div class="board-detail" data-testid="board-detail">
        <p data-testid="task-link">{{ t('desktop.boardProject') }}：{{ selectedProject?.name }} · {{ selectedProject?.directory || '—' }}</p>
        <p data-testid="task-session">
          {{ t('desktop.boardSession') }}：
          <template v-if="selected.sessionId"><code :title="selected.sessionId">{{ selected.sessionId.slice(0, 8) }}</code> · {{ t('desktop.boardSessionLinked') }}</template>
          <template v-else>— · {{ t('desktop.boardSessionDraft') }}</template>
        </p>
        <label>{{ t('desktop.boardPriority') }}<Select v-model="draftPriority" data-testid="task-priority" :disabled="busy || selected.executionActive"><option value="none">{{ t('desktop.boardUnranked') }}</option><option value="p0">P0</option><option value="p1">P1</option><option value="p2">P2</option></Select></label>
        <label>{{ t('desktop.boardGoal') }}<Textarea v-model="draftGoal" data-testid="task-goal" :disabled="busy || selected.executionActive" rows="3" maxlength="4000" /></label>
        <label>{{ t('desktop.boardCriteria') }}<Textarea v-model="draftCriteria" data-testid="task-criteria" :disabled="busy || selected.executionActive" rows="3" maxlength="4000" /></label>
        <p v-if="selected.preparationIssues.length" role="status" data-testid="task-preparation-missing">{{ t('desktop.boardPreparationRequired') }}</p>
        <section v-if="stale" class="board-conflict" role="alert" data-testid="board-conflict">
          <p>{{ t('desktop.boardConflictReview') }}</p>
          <dl><dt>{{ t('desktop.boardGoal') }}</dt><dd>{{ selected.goal || '—' }}</dd><dt>{{ t('desktop.boardCriteria') }}</dt><dd>{{ selected.acceptanceCriteria || '—' }}</dd><dt>{{ t('preview.taskNotes') }}</dt><dd>{{ selected.notes || '—' }}</dd><dt>{{ t('desktop.boardPriority') }}</dt><dd>{{ selected.priority === 'none' ? t('desktop.boardUnranked') : selected.priority.toUpperCase() }}</dd></dl>
          <Button size="sm" :disabled="busy || selected.executionActive" data-testid="board-use-latest" @click="useLatest">{{ t('desktop.boardUseLatest') }}</Button>
          <Button size="sm" :disabled="busy || selected.executionActive" data-testid="board-keep-draft" @click="keepDraft">{{ t('desktop.boardKeepDraft') }}</Button>
        </section>
        <label>{{ t('preview.taskNotes') }}<Textarea v-model="draftNotes" data-testid="task-notes" :disabled="busy || selected.executionActive" rows="4" maxlength="4000" /></label>
        <div class="detail-save"><span v-if="dirty" role="status">{{ t('desktop.boardUnsaved') }}</span><Button variant="primary" size="sm" :disabled="busy || selected.executionActive || !dirty || stale" data-testid="board-save-fields" @click="saveNotes">{{ t('historyUi.save') }}</Button></div>
        <div class="task-moves"><Button v-for="column in columns" :key="column" size="sm" :disabled="busy || dirty || stale || selected.column === column || !selected.allowedColumns.includes(column)" @click="move(selected.id, column)">{{ t('desktop.' + column) }}</Button><Button size="sm" :disabled="busy || selected.executionActive" @click="open(selected)">{{ t('preview.openConversation') }} ↗</Button></div>
        <BoardPrototypePanel :key="selected.id + '-prototype'" :task="selected" :disabled="busy || dirty || stale" @saved="prototypeSaved" @refresh="load" @pending="prototypePending = $event" />
        <BoardRunPanel :key="selected.id" :task="selected" :disabled="busy || dirty || stale || prototypePending" @changed="load" />
        <Collapse class="board-evidence"><template #summary>{{ t('desktop.boardEvidenceDetails') }}</template><ul class="task-evidence" data-testid="task-links"><li>{{ t('desktop.linkGoal', { title: selected.goal || '—' }) }}</li><li>{{ t('desktop.boardCriteria') }}：{{ selected.acceptanceCriteria || '—' }}</li><li>{{ t('desktop.linkRun') }}</li></ul><ul class="task-evidence" data-testid="task-evidence"><li>{{ selected.prototypeVersionId ? t('boardPrototype.designLinked') : t('desktop.evidenceDesign') }}</li><li>{{ t('desktop.evidenceRun') }}</li><li>{{ t('desktop.evidenceDiff') }}</li><li>{{ t('desktop.evidenceChecks') }}</li><li>{{ t('desktop.acceptanceOpen') }}</li></ul></Collapse>
        <p>{{ t('preview.events') }}：{{ selected.events.map(item => item === 'created' ? t('preview.createTask') : item === 'notes_updated' ? t('desktop.boardSaved') : item === 'prototype_linked' ? t('boardPrototype.linked') : item === 'prototype_unlinked' ? t('boardPrototype.unlinked') : item === 'preparation_updated' ? t('desktop.boardPreparationUpdated') : item === 'priority_updated' ? t('desktop.boardPriorityUpdated') : t('desktop.' + item)).join(' → ') }}</p>
      </div>
    </Dialog>
    <ConfirmBox v-if="pendingAction" :title="t('desktop.boardUnsaved')" :impact="[t('desktop.boardDiscardImpact')]" :confirm-label="t('desktop.boardDiscard')" @confirm="discardEdits" @cancel="pendingAction = null" />
  </section>
</template>
<style scoped>
.preview-board{display:flex;flex-direction:column;gap:18px;min-width:0;min-height:100%}header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}h1{font-size:24px;margin:4px 0 9px}header p{font-size:12px;color:var(--text-mute)}.eyebrow{font-size:10px}.board-tools{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.board-tools>span{font-size:11px;color:var(--text-mute)}:deep(.eap-input),input:not(.eap-input){max-width:320px;width:100%;min-width:0}.new-task-form,.task-moves{display:flex;gap:8px;flex-wrap:wrap}.board-scroll{overflow:auto;min-width:0;flex:1;-webkit-overflow-scrolling:touch}.board-lanes{display:grid;grid-template-columns:repeat(5,minmax(180px,1fr));gap:12px;min-height:310px}.board-lane{background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:280px}h2{font-size:13px;display:flex;align-items:center;gap:8px;margin:0;font-weight:650}h2 small{margin-left:auto;color:var(--text-mute);font-weight:600}h2>span{width:8px;height:8px;background:var(--text-mute);border-radius:50%}.lane-hint{margin:0;font-size:11px;color:var(--text-mute);line-height:1.45}
.auto-work{display:flex;align-items:center;gap:8px;margin:0;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--accent-soft);font-size:11px;color:var(--accent)}
.auto-work input{accent-color:var(--focus-ring);width:14px;height:14px;flex:0 0 14px;padding:0}
.board-unattended{display:inline-flex;margin:8px 0 0;padding:4px 10px;border-radius:999px;background:var(--eap-chart-accent-soft);color:var(--eap-chart-accent);font-size:11px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
.board-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.board-tools label{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-soft)}h2>.planned{background:var(--text-mute)}h2>.ready{background:var(--accent)}h2>.running{background:var(--warn)}h2>.acceptance{background:var(--eap-chart-accent)}h2>.done{background:var(--accent)}.board-card{display:grid;gap:8px}.card-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.board-card .priority{display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:650;letter-spacing:.02em}.prio-none{background:var(--surface-2);color:var(--text-mute)}.prio-p0{background:var(--danger-bg);color:var(--danger)}.prio-p1{background:var(--warn-bg);color:var(--warn-text)}.prio-p2{background:var(--accent-soft);color:var(--accent)}.card-session{font-size:10px;color:var(--text-soft);background:var(--surface-2);border-radius:999px;padding:2px 7px}.board-card strong{font-weight:600;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.board-card>span{font-size:10px;color:var(--text-mute)}.empty-lane{text-align:center;font-size:11px;color:var(--text-mute);margin:auto 0;padding:24px 0}.task-evidence{margin:0;padding-left:18px;font-size:12px;color:var(--text-soft);line-height:1.7}.board-notice{font-size:12px;color:var(--text-soft);line-height:1.7}.link-session{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-soft)}.link-session input{width:14px;height:14px;flex:0 0 14px;padding:0;accent-color:var(--accent)}
@media(max-width:760px){header{flex-wrap:wrap;gap:10px}h1{font-size:20px}.board-lanes{grid-template-columns:repeat(5,minmax(148px,72vw));gap:10px;padding-bottom:4px}.board-lane{padding:10px}.board-scroll{scrollbar-gutter:stable}}.new-task-form{align-items:end}.new-task-form label{display:grid;gap:6px;font-size:12px}.board-tools label{display:grid;gap:5px;font-size:12px;min-width:0}.board-tools :deep(.eap-select){max-width:min(320px,100%)}
.board-detail{display:grid;gap:12px;min-width:0}
.board-detail label{display:grid;gap:8px;font-size:12px;color:var(--text-soft)}
.board-detail p{margin:0;font-size:12px;color:var(--text-soft);line-height:1.7;overflow-wrap:anywhere}
.board-detail code{font:11px/1.4 ui-monospace,monospace;padding:1px 5px;border-radius:4px;background:var(--surface-3);color:var(--accent)}
.board-detail :deep(.eap-select){max-width:220px}
.board-detail :deep(.eap-textarea){width:100%;resize:vertical;min-height:88px}
.detail-save{display:flex;gap:12px;align-items:center;justify-content:flex-end}
.detail-save span{font-size:12px;color:var(--warn-text)}
.board-evidence{padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2)}
.board-evidence > :deep(summary){cursor:pointer;font-size:12px;font-weight:600;color:var(--text-soft)}
.new-task-form .preparation-field{flex:1 1 280px;min-width:0}.new-task-form .board-notice{flex-basis:100%;margin:0}.preparation-missing{color:var(--warn-text)}
.board-conflict{padding:12px;border:1px solid var(--eap-color-warning-border);border-radius:10px;background:var(--warn-bg)}.board-conflict dl{font-size:12px}.board-conflict dt{font-weight:600}.board-conflict dd{margin:4px 0 10px;white-space:pre-wrap;overflow-wrap:anywhere}.board-conflict :deep(.eap-button){margin:4px}
</style>
