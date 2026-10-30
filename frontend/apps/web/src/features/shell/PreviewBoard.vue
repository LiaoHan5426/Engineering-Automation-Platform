<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { runtimeApi, type BoardTask } from '@eap/runtime-client';
import { Button, Checkbox, ConfirmBox, Dialog, Input, Select, Textarea } from '@eap/ui';
import { isAxiosError } from 'axios';
import { chatBinding, workbench, type BoardColumn } from './workbench';
import { localProjectState } from './localProjects';
import { useMockServices } from '../../lib/serviceConfig';
import { readBoardEdit, writeBoardEdit } from './boardEdits';
const { t } = useI18n();
const columns: BoardColumn[] = ['planned', 'ready', 'running', 'acceptance', 'done'];
const query = ref(''), selectedId = ref(''), creating = ref(false), title = ref(''), note = ref('');
const priorityFilter = ref<'all' | 'p0' | 'p1' | 'p2'>('all');
const busy = ref(false), rows = ref<BoardTask[]>([]);
const draftNotes = ref('');
const draftPriority = ref<BoardTask['priority']>('none');
const createColumn = ref<'planned' | 'ready'>('planned');
const linkCurrentSession = ref(true);
const pendingAction = ref<(() => void) | null>(null);
const activeSessionId = computed(() => chatBinding.value?.activeId?.trim() || '');
const draftStore = typeof sessionStorage === 'undefined' ? null : sessionStorage;
function persistEdit() {
  const task = selected.value; if (!task) return;
  writeBoardEdit(draftStore, task.id, useMockServices, dirty.value ? { notes: draftNotes.value, priority: draftPriority.value, revision: task.revision } : null);
}
const dirty = computed(() => !!selected.value && (draftNotes.value !== selected.value.notes || draftPriority.value !== selected.value.priority));
function guarded(action: () => void) { if (busy.value) return; if (dirty.value) pendingAction.value = action; else action(); }
function closeDetail() { guarded(() => { selectedId.value = ''; }); }
function discardEdits() {
  const action = pendingAction.value; pendingAction.value = null;
  if (selected.value) writeBoardEdit(draftStore, selected.value.id, useMockServices, null);
  draftNotes.value = selected.value?.notes ?? ''; draftPriority.value = selected.value?.priority ?? 'none'; action?.();
}
function startCreate(column: 'planned' | 'ready' = 'planned') { guarded(() => { createColumn.value = column; creating.value = true; }); }
function selectTask(id: string) {
  if (id === selectedId.value) closeDetail();
  else guarded(() => { selectedId.value = id; });
}
async function mutationFailed(error: unknown) {
  if (isAxiosError(error) && error.response?.status === 409) { note.value = t('desktop.boardConflict'); await load(); }
  else note.value = t('desktop.boardUpdateFailed');
}
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
function switchProject(id: string) { guarded(() => { projectId.value = id; selectedId.value = ''; note.value = ''; creating.value = false; }); }
watch(selectedId, () => {
  const task = selected.value;
  const cached = task ? readBoardEdit(draftStore, task.id, useMockServices) : null;
  draftNotes.value = cached?.notes ?? task?.notes ?? '';
  draftPriority.value = cached?.priority ?? task?.priority ?? 'none';
  if (cached) note.value = t(cached.revision === task?.revision ? 'desktop.boardDraftRestored' : 'desktop.boardDraftStale');
});
watch([draftNotes, draftPriority], persistEdit, { flush: 'post' });
onMounted(() => window.addEventListener('beforeunload', persistEdit));
onBeforeUnmount(() => { persistEdit(); window.removeEventListener('beforeunload', persistEdit); });
watch(projectId, () => { rows.value = []; void load(); }, { immediate: true });
function replace(task: BoardTask) { rows.value = rows.value.map(item => item.id === task.id ? task : item); }
async function move(id: string, column: BoardColumn) {
  if (busy.value) return;
  if (column === 'done') { note.value = t('desktop.boardEvidence'); return; }
  if (column === 'running') { note.value = t('desktop.boardNoRun'); return; }
  if (column === 'acceptance') { note.value = t('desktop.boardEvidence'); return; }
  const task = rows.value.find(item => item.id === id); if (!task) return;
  busy.value = true;
  try { replace(await runtimeApi.updateBoardTask(id, { revision: task.revision, column })); note.value = t('desktop.boardMoved'); }
  catch (error) { await mutationFailed(error); }
  finally { busy.value = false; }
}
async function saveNotes() {
  const task = selected.value; if (!task || busy.value) return;
  busy.value = true;
  try { const saved = await runtimeApi.updateBoardTask(task.id, { revision: task.revision, notes: draftNotes.value, priority: draftPriority.value }); replace(saved); draftNotes.value = saved.notes; draftPriority.value = saved.priority; writeBoardEdit(draftStore, task.id, useMockServices, null); note.value = t('desktop.boardFieldsSaved'); }
  catch (error) { await mutationFailed(error); }
  finally { busy.value = false; }
}
async function create() {
  if (!title.value.trim() || busy.value) return;
  busy.value = true;
  const sessionId = linkCurrentSession.value && activeSessionId.value ? activeSessionId.value : '';
  try {
    const task = await runtimeApi.createBoardTask(projectId.value, title.value.trim(), createColumn.value, sessionId);
    rows.value.unshift(task);
    selectedId.value = task.id;
    title.value = '';
    creating.value = false;
    note.value = task.sessionId ? t('desktop.boardCreatedLinked') : t('desktop.boardCreated');
  }
  catch { note.value = t('desktop.boardLoadFailed'); }
  finally { busy.value = false; }
}
function open(task: BoardTask) {
  guarded(() => {
  // Seed chat draft only; never invent a fake conversation id from the task id.
  workbench.pendingBoardDraft = { sessionId: task.sessionId || '', title: task.title };
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
      <label>{{ t('desktop.' + createColumn) }}<Input v-model="title" required maxlength="200" :disabled="busy" :placeholder="t('preview.taskTitle')" :aria-label="t('preview.taskTitle')" autofocus /></label>
      <label v-if="activeSessionId" class="link-session" data-testid="board-link-session">
        <Checkbox v-model="linkCurrentSession" :disabled="busy" />
        <span>{{ t('desktop.boardLinkCurrent') }} · {{ activeSessionId.slice(0, 8) }}</span>
      </label>
      <p v-else class="board-notice" data-testid="board-link-none">{{ t('desktop.boardLinkNone') }}</p>
      <Button type="submit" variant="primary" size="sm" :disabled="busy || !title.trim()">{{ t('preview.save') }}</Button>
      <Button type="button" size="sm" :disabled="busy" @click="creating = false">{{ t('preview.close') }}</Button>
    </form>
    <div class="board-tools">
      <label>{{ t('desktop.boardProject') }}<Select data-testid="board-project" :disabled="busy" :model-value="projectId" @change="switchProject(($event.target as HTMLSelectElement).value)"><option v-for="item in previewProjects" :key="item.id" :value="item.id">{{ item.name }}{{ item.directory ? ' · ' + item.directory : '' }}</option></Select></label>
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
        <button v-for="task in tasks.filter(item => item.column === column)" :key="task.id" type="button" class="board-card" :aria-pressed="selectedId === task.id" :disabled="busy" :draggable="!busy" @dragstart="$event.dataTransfer?.setData('text/plain', task.id)" @click="selectTask(task.id)">
          <span class="card-meta">
            <small class="priority" :class="'prio-' + task.priority" data-testid="card-priority">{{ task.priority === 'none' ? t('desktop.boardUnranked') : task.priority.toUpperCase() }}</small>
            <small v-if="task.sessionId" class="card-session" data-testid="card-session" :title="task.sessionId">{{ t('desktop.boardSessionShort') }} · {{ task.sessionId.slice(0, 8) }}</small>
          </span>
          <strong>{{ task.title }}</strong>
          <span :title="task.id">{{ task.id.slice(0, 8) }}</span>
        </button>
        <button v-if="column === 'planned' || column === 'ready'" type="button" class="lane-add" :disabled="busy" data-testid="lane-add-task" @click="startCreate(column)">＋ {{ t('desktop.boardAddTask') }}</button>
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
        <label>{{ t('desktop.boardPriority') }}<Select v-model="draftPriority" data-testid="task-priority" :disabled="busy"><option value="none">{{ t('desktop.boardUnranked') }}</option><option value="p0">P0</option><option value="p1">P1</option><option value="p2">P2</option></Select></label>
        <label>{{ t('preview.taskNotes') }}<Textarea v-model="draftNotes" :disabled="busy" rows="4" maxlength="4000" /></label>
        <div class="detail-save"><span v-if="dirty" role="status">{{ t('desktop.boardUnsaved') }}</span><Button variant="primary" size="sm" :disabled="busy || !dirty" @click="saveNotes">{{ t('historyUi.save') }}</Button></div>
        <div class="task-moves"><Button v-for="column in columns" :key="column" size="sm" :disabled="busy || selected.column === column" @click="move(selected.id, column)">{{ t('desktop.' + column) }}</Button><Button size="sm" :disabled="busy" @click="open(selected)">{{ t('preview.openConversation') }} ↗</Button></div>
        <details class="board-evidence"><summary>{{ t('desktop.boardEvidenceDetails') }}</summary><ul class="task-evidence" data-testid="task-links"><li>{{ t('desktop.linkGoal', { title: selected.title }) }}</li><li>{{ t('desktop.linkAcceptance') }}</li><li>{{ t('desktop.linkRun') }}</li></ul><ul class="task-evidence" data-testid="task-evidence"><li>{{ t('desktop.evidenceDesign') }}</li><li>{{ t('desktop.evidenceRun') }}</li><li>{{ t('desktop.evidenceDiff') }}</li><li>{{ t('desktop.evidenceChecks') }}</li><li>{{ t('desktop.acceptanceOpen') }}</li></ul></details>
        <p>{{ t('preview.events') }}：{{ selected.events.map(item => item === 'created' ? t('preview.createTask') : item === 'notes_updated' ? t('desktop.boardSaved') : item === 'priority_updated' ? t('desktop.boardPriorityUpdated') : t('desktop.' + item)).join(' → ') }}</p>
      </div>
    </Dialog>
    <ConfirmBox v-if="pendingAction" :title="t('desktop.boardUnsaved')" :impact="[t('desktop.boardDiscardImpact')]" :confirm-label="t('desktop.boardDiscard')" @confirm="discardEdits" @cancel="pendingAction = null" />
  </section>
</template>
<style scoped>
.preview-board{display:flex;flex-direction:column;gap:18px;min-width:0;min-height:100%}header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}h1{font-size:24px;margin:4px 0 9px}header p{font-size:12px;color:#7a887f}.eyebrow{font-size:10px}.board-tools{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.board-tools>span{font-size:11px;color:#7a887f}:deep(.eap-input),input:not(.eap-input){max-width:320px;width:100%;min-width:0}button:not(.eap-button){cursor:pointer;border:1px solid var(--eap-border-color);padding:8px 12px;border-radius:8px;background:var(--eap-fill-color-blank);font-size:12px}.new-task-form,.task-moves{display:flex;gap:8px;flex-wrap:wrap}.board-scroll{overflow:auto;min-width:0;flex:1;-webkit-overflow-scrolling:touch}.board-lanes{display:grid;grid-template-columns:repeat(5,minmax(180px,1fr));gap:12px;min-height:310px}.board-lane{background:#f3f5ef;border:1px solid #e2e6da;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:280px}h2{font-size:13px;display:flex;align-items:center;gap:8px;margin:0;font-weight:650}h2 small{margin-left:auto;color:#94a091;font-weight:600}h2>span{width:8px;height:8px;background:#91a28c;border-radius:50%}.lane-hint{margin:0;font-size:11px;color:#7a887f;line-height:1.45}
.auto-work{display:flex;align-items:center;gap:8px;margin:0;padding:8px 10px;border:1px solid #d5ddd4;border-radius:10px;background:#e7f3ee;font-size:11px;color:#287b6c}
.auto-work input{accent-color:#91b6a0;width:14px;height:14px;flex:0 0 14px;padding:0}
.board-unattended{display:inline-flex;margin:8px 0 0;padding:4px 10px;border-radius:999px;background:#efe8f8;color:#6b5b8c;font-size:11px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
.board-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.board-tools label{display:flex;align-items:center;gap:6px;font-size:12px;color:#526258}
.lane-add{border:1px dashed #c5d0c4;background:transparent;color:#526258;border-radius:10px;padding:8px;font:inherit;font-size:12px}h2>.planned{background:#91a28c}h2>.ready{background:#5f8f7a}h2>.running{background:#cdab52}h2>.acceptance{background:#9f8abc}h2>.done{background:#68a38a}.board-card{display:grid;gap:8px;text-align:left;border:1px solid #e2e7dc;border-radius:12px;padding:12px;background:#fff;box-shadow:0 1px 0 rgb(36 48 40 / 4%)}.card-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.board-card .priority{display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:650;letter-spacing:.02em}.prio-none{background:#eef1ea;color:#7a887f}.prio-p0{background:#fde8e4;color:#b42318}.prio-p1{background:#fef0c7;color:#93370d}.prio-p2{background:#e7f3ee;color:#287b6c}.card-session{font-size:10px;color:#5f7a6e;background:#eef6f1;border-radius:999px;padding:2px 7px}.board-card strong{font-weight:600;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.board-card>span{font-size:10px;color:#929d8e}.empty-lane{text-align:center;font-size:11px;color:#9ba391;margin:auto 0;padding:24px 0}.task-evidence{margin:0;padding-left:18px;font-size:12px;color:#658372;line-height:1.7}.board-notice{font-size:12px;color:#658372;line-height:1.7}.task-moves button:disabled{opacity:.4;cursor:default}.link-session{display:flex;align-items:center;gap:8px;font-size:12px;color:#526258}.link-session input{width:14px;height:14px;flex:0 0 14px;padding:0;accent-color:#347f70}
@media(max-width:760px){header{flex-wrap:wrap;gap:10px}h1{font-size:20px}.board-lanes{grid-template-columns:repeat(5,minmax(148px,72vw));gap:10px;padding-bottom:4px}.board-lane{padding:10px}.board-scroll{scrollbar-gutter:stable}}
.board-card[aria-pressed=true]{border-color:#347f70;box-shadow:0 0 0 1px #347f70}.new-task-form{align-items:end}.new-task-form label{display:grid;gap:6px;font-size:12px}.board-tools label{display:grid;gap:5px;font-size:12px;min-width:0}.board-tools :deep(.eap-select){max-width:min(320px,100%)}button:disabled{cursor:default;opacity:.55}
.board-detail{display:grid;gap:12px;min-width:0}
.board-detail label{display:grid;gap:8px;font-size:12px;color:#526258}
.board-detail p{margin:0;font-size:12px;color:#658372;line-height:1.7;overflow-wrap:anywhere}
.board-detail code{font:11px/1.4 ui-monospace,monospace;padding:1px 5px;border-radius:4px;background:#e4ebe3;color:#37483e}
.board-detail :deep(.eap-select){max-width:220px}
.board-detail :deep(.eap-textarea){width:100%;resize:vertical;min-height:88px}
.detail-save{display:flex;gap:12px;align-items:center;justify-content:flex-end}
.detail-save span{font-size:12px;color:#8a6a29}
.board-evidence{padding:8px 10px;border:1px solid #e3e6dc;border-radius:10px;background:#f3f5ef}
.board-evidence > summary{cursor:pointer;font-size:12px;font-weight:600;color:#526258}
</style>
