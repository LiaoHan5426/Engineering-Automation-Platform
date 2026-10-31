<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { isAxiosError } from 'axios';
import { useI18n } from 'vue-i18n';
import { Button, Select } from '@eap/ui';
import { runtimeApi, type BoardTask, type PrototypeVersionRecord } from '@eap/runtime-client';
import PrototypeVersionViewer from './PrototypeVersionViewer.vue';
const props = defineProps<{ task: BoardTask; disabled?: boolean }>();
const emit = defineEmits<{ saved: [task: BoardTask]; refresh: []; pending: [value: boolean] }>();
const { t } = useI18n();
const versions = ref<PrototypeVersionRecord[]>([]), loading = ref(false), busy = ref(false), note = ref('');
const selectedId = ref(''), selectionRevision = ref(0), viewing = ref('');
const linked = ref<PrototypeVersionRecord | null>(null);
const stale = computed(() => props.task.revision !== selectionRevision.value);
const blocked = computed(() => !!props.disabled || props.task.executionActive || busy.value || stale.value);
const changed = computed(() => (selectedId.value || null) !== props.task.prototypeVersionId);
let ticket = 0;
function adoptSaved() { selectedId.value = props.task.prototypeVersionId || ''; selectionRevision.value = props.task.revision; }
async function load() {
  const current = ++ticket; loading.value = true; linked.value = null; note.value = '';
  try {
    const pages = await Promise.all([runtimeApi.prototypeVersions('builder-alpha'), runtimeApi.prototypeVersions('builder-beta')]);
    const items = pages.flatMap(page => page.items);
    const saved = props.task.prototypeVersionId ? items.find(item => item.id === props.task.prototypeVersionId) ?? await runtimeApi.prototypeVersion(props.task.prototypeVersionId) : null;
    if (current !== ticket) return;
    versions.value = items; linked.value = saved;
    if (saved && !items.some(item => item.id === saved.id)) versions.value.push(saved);
  } catch { if (current === ticket) { versions.value = []; note.value = t('boardPrototype.loadFailed'); } }
  finally { if (current === ticket) loading.value = false; }
}
async function save() {
  if (blocked.value || loading.value || !changed.value) return;
  busy.value = true; note.value = '';
  const current = ticket;
  const id = props.task.id, revision = selectionRevision.value, versionId = selectedId.value || null;
  try {
    const task = await runtimeApi.setBoardPrototype(id, { projectId: props.task.projectId, revision, versionId });
    if (current !== ticket || props.task.id !== id) return;
    selectionRevision.value = task.revision; selectedId.value = task.prototypeVersionId || '';
    linked.value = versions.value.find(item => item.id === task.prototypeVersionId) ?? null;
    emit('saved', task); note.value = t('boardPrototype.saved');
  } catch (error) {
    if (current !== ticket || props.task.id !== id) return;
    note.value = t(isAxiosError(error) && error.response?.status === 409 ? 'boardPrototype.conflict' : 'boardPrototype.saveFailed');
    emit('refresh');
  } finally { if (current === ticket && props.task.id === id) busy.value = false; }
}
watch(() => props.task.id, () => { ticket++; busy.value = false; viewing.value = ''; adoptSaved(); void load(); }, { immediate: true });
watch(() => props.task.prototypeVersionId, () => {
  linked.value = versions.value.find(item => item.id === props.task.prototypeVersionId) ?? null;
});
watch([changed, busy, stale], () => emit('pending', changed.value || busy.value || stale.value), { immediate: true });
onBeforeUnmount(() => { ticket++; emit('pending', false); });
</script>
<template>
  <section class="board-prototype" data-testid="board-prototype-panel">
    <h3>{{ t('boardPrototype.title') }}</h3><p>{{ t('boardPrototype.hint') }}</p>
    <p v-if="task.prototypeVersionId" data-testid="board-prototype-current">{{ t('boardPrototype.linked') }}：{{ linked?.title || task.prototypeVersionId }}<br><code>{{ task.prototypeVersionId }}</code><br><code v-if="linked">SHA-256: {{ linked.contentHash }}</code></p>
    <p v-else>{{ t('boardPrototype.none') }}</p>
    <div class="board-prototype__actions"><Button v-if="task.prototypeVersionId" size="sm" data-testid="board-prototype-view-current" @click="viewing = task.prototypeVersionId">{{ t('boardPrototype.view') }}</Button></div>
    <label>{{ t('boardPrototype.choose') }}<Select v-model="selectedId" data-testid="board-prototype-select" :disabled="blocked || loading"><option value="">{{ t('boardPrototype.none') }}</option><option v-for="version in versions" :key="version.id" :value="version.id">{{ version.title || version.id }} · {{ version.sourceRef }} · {{ version.createdAt || version.id }}</option></Select></label>
    <div class="board-prototype__actions">
      <Button size="sm" :disabled="blocked || loading || !changed" data-testid="board-prototype-save" @click="save">{{ t('boardPrototype.save') }}</Button>
      <Button size="sm" :disabled="loading || !selectedId" data-testid="board-prototype-preview" @click="viewing = selectedId">{{ t('boardPrototype.previewChoice') }}</Button>
      <Button size="sm" :disabled="loading || busy" @click="load">{{ t('boardPrototype.refresh') }}</Button>
      <Button v-if="stale" size="sm" :disabled="busy" data-testid="board-prototype-adopt" @click="adoptSaved">{{ t('boardPrototype.adopt') }}</Button>
    </div>
    <p v-if="stale" role="status">{{ t('boardPrototype.stale') }}</p>
    <p v-if="task.executionActive" role="status">{{ t('boardPrototype.active') }}</p>
    <p v-if="note" role="status">{{ note }}</p>
    <PrototypeVersionViewer v-if="viewing" :version-id="viewing" @close="viewing = ''" />
  </section>
</template>
<style scoped>
.board-prototype{display:grid;gap:10px;min-width:0;padding-top:14px;border-top:1px solid var(--border)}h3{margin:0;font-size:14px}label{display:grid;gap:8px}.board-prototype :deep(.eap-select){max-width:100%}.board-prototype__actions{display:flex;gap:8px;flex-wrap:wrap}code{overflow-wrap:anywhere;font-size:11px}
</style>
