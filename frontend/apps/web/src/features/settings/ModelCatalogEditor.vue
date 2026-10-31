<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ModelConnection, ModelOption } from '@eap/runtime-client';
import { modelApi as runtimeApi } from '../chat/chatService';
import { Button, Checkbox, Feedback, Input, Select, Collapse } from "@eap/ui";
import { errorMessage } from '../../lib/presentation';
const props = defineProps<{ connection: ModelConnection }>();
const emit = defineEmits<{ saved: []; close: []; busy: [value: boolean] }>();
const { t } = useI18n();
const models = ref<ModelOption[]>(props.connection.models.map(model => ({ ...model, reasoningEfforts: [...model.reasoningEfforts] })));
const allowed = ref([...props.connection.allowedModels]);
const defaultModel = ref(props.connection.defaultModel);
const manual = ref(''), search = ref(''), note = ref('');
const busy = ref(false);
watch(busy, value => emit('busy', value), { flush: 'sync' });
const discoveredAt = ref(props.connection.discoveredAt);
const discoveryError = ref(props.connection.discoveryError);
const visible = computed(() => models.value.filter(model => model.id.toLowerCase().includes(search.value.toLowerCase())));
function toggle(model: string, enabled: boolean) {
  allowed.value = enabled ? [...allowed.value, model] : allowed.value.filter(id => id !== model);
  if (!allowed.value.includes(defaultModel.value)) defaultModel.value = allowed.value[0] ?? '';
}
function add() {
  const id = manual.value.trim();
  if (!id || models.value.some(model => model.id === id)) return;
  models.value.push({ id, reasoningEfforts: [] }); manual.value = ''; search.value = '';
}
async function refresh() {
  busy.value = true; note.value = '';
  try {
    const result = await runtimeApi.refreshConnectionModels(props.connection.id);
    for (const model of result.models) if (!models.value.some(item => item.id === model.id)) models.value.push(model);
    discoveredAt.value = result.discoveredAt; discoveryError.value = result.discoveryError;
    emit('saved');
  } catch (error) { note.value = errorMessage(error); }
  finally { busy.value = false; }
}
async function save() {
  busy.value = true; note.value = '';
  try {
    await runtimeApi.configureConnectionModels(props.connection.id, { models: models.value, allowedModels: allowed.value, defaultModel: defaultModel.value });
    emit('saved'); emit('close');
  } catch (error) { note.value = errorMessage(error); }
  finally { busy.value = false; }
}
</script>
<template>
  <form class="model-catalog" @submit.prevent="save">
    <h2>{{ connection.name }} · {{ t('modelUi.catalog') }}</h2>
    <p>{{ t(connection.kind === 'chatgpt-plan' ? 'authUi.catalogHint' : 'modelUi.discoveryHint') }}</p>
    <p class="hint" data-testid="allowlist-hint">{{ t('modelUi.allowlistHint') }}</p>
    <div class="catalog-actions"><Button type="button" :disabled="busy || !connection.enabled" @click="refresh">{{ t('modelUi.refresh') }}</Button><span>{{ discoveredAt ? t('modelUi.syncedAt', { time: new Date(discoveredAt).toLocaleString() }) : t('modelUi.neverSynced') }}</span></div>
    <Feedback v-if="discoveryError" tone="warning" data-testid="catalog-cached">{{ t('modelUi.cached') }} · {{ discoveryError }}</Feedback>
    <label>{{ t('modelUi.search') }}<Input v-model="search" :disabled="busy" /></label>
    <div v-if="connection.kind !== 'chatgpt-plan'" class="catalog-manual"><Input v-model="manual" maxlength="120" :disabled="busy" :aria-label="t('modelUi.manual')" :placeholder="t('modelUi.manual')" @keydown.enter.prevent="add" /><Button type="button" :disabled="busy || !manual.trim()" @click="add">{{ t('modelUi.add') }}</Button></div>
    <p>{{ t('modelUi.effortHint') }}</p>
    <div class="catalog-models eap-scrollbar">
      <p v-if="!models.length">{{ t('modelUi.empty') }}</p>
      <div v-for="model in visible" :key="model.id" class="catalog-model">
        <label><Checkbox :model-value="allowed.includes(model.id)" :disabled="busy" @update:model-value="toggle(model.id, $event === true)" />{{ model.id }}</label>
        <Collapse><template #summary>{{ t('modelUi.efforts') }}</template><label v-for="effort in ['low', 'medium', 'high']" :key="effort"><Checkbox v-model="model.reasoningEfforts" :value="effort" :disabled="busy" />{{ t('task.' + effort) }}</label></Collapse>
      </div>
    </div>
    <label>{{ t('modelUi.default') }}<Select v-model="defaultModel" :disabled="busy"><option v-if="!allowed.length" value="">{{ t('modelUi.choose') }}</option><option v-for="id in allowed" :key="id" :value="id">{{ id }}</option></Select></label>
    <Feedback v-if="note" tone="warning">{{ note }}</Feedback>
    <div class="catalog-actions"><Button type="submit" variant="primary" :disabled="busy || !allowed.length || !allowed.includes(defaultModel)">{{ t('historyUi.save') }}</Button><Button type="button" :disabled="busy" @click="emit('close')">{{ t('composerUi.close') }}</Button></div>
  </form>
</template>
<style scoped>
.model-catalog{display:grid;gap:16px}.model-catalog h2{font-size:18px}.model-catalog p,.model-catalog .hint{font-size:12px;line-height:1.7;color:var(--text-soft);margin:0}.model-catalog>label{display:grid;gap:6px}.model-catalog input:not([type=checkbox]),.model-catalog select{min-width:0}.catalog-actions,.catalog-manual{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.catalog-manual input{flex:1}.catalog-actions span{font-size:12px}.catalog-models{max-height:min(280px,42dvh);overflow:auto;border:1px solid var(--border);border-radius:8px}.catalog-model{padding:12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.catalog-model label{display:inline-flex;align-items:center;gap:6px;overflow-wrap:anywhere}.catalog-model :deep(summary){font-size:12px}.catalog-model details label{margin-right:12px}@media(max-width:760px){.catalog-models{max-height:min(240px,36dvh)}.catalog-model{padding:10px}}
</style>
