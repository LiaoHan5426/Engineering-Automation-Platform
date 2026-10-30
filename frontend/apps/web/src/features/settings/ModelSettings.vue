<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Feedback, Input, Select } from '@eap/ui';
import type { ModelConnection } from '@eap/runtime-client';
import { modelApi as runtimeApi } from '../chat/chatService';
import { useMockServices } from '../../lib/serviceConfig';
import ConnectionDialog from '../../components/ConnectionDialog.vue';
import ModelCatalogEditor from './ModelCatalogEditor.vue';
import ChatGptAccountCard from './ChatGptAccountCard.vue';
const accountLogin = ref<{ start: (id?: string) => Promise<void> } | null>(null);
async function accountConnected(id: string) {
  try { const result = await runtimeApi.refreshConnectionModels(id); await refreshConnections(); managing.value = result; }
  catch (error) { connectionNote.value = errorMessage(error); await refreshConnections(); }
}
async function disconnect(item: ModelConnection) {
  connectionBusy.value = true;
  try { await runtimeApi.disconnectChatGpt(item.id); await refreshConnections(); }
  catch (error) { connectionNote.value = errorMessage(error); }
  finally { connectionBusy.value = false; }
}
const managing = ref<ModelConnection | null>(null);
const catalogBusy = ref(false);
import { errorMessage } from '../../lib/presentation';
const { t } = useI18n();
const connections = ref<ModelConnection[]>([]);
const search = ref('');
const visibleConnections = computed(() => connections.value.filter(item => `${item.name} ${item.baseUrl}`.toLowerCase().includes(search.value.toLowerCase())));
const allowedCount = computed(() => connections.value.filter(item => item.enabled).reduce((sum, item) => sum + item.allowedModels.length, 0));
async function refreshConnections() { connections.value = (await runtimeApi.modelConnections()).items; }
onMounted(async () => { try { await refreshConnections(); } catch (error) { connectionNote.value = errorMessage(error); } });
const editorOpen = ref(false);
const editingId = ref<string | null>(null);
const connectionNote = ref("");
const connectionOk = ref(false);
const connectionBusy = ref(false);
const form = ref({
  name: "",
  baseUrl: "https://api.openai.com",
  secret: "",
  enabled: true,
  defaultSelected: true,
});

function presetChanged(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (value === 'custom') { form.value.baseUrl = ''; return; }
  form.value.baseUrl = value;

}
function newConnection() {
  editorOpen.value = true;
  editingId.value = null;
  form.value = { name: "", baseUrl: "https://api.openai.com", secret: "", enabled: true, defaultSelected: connections.value.length === 0 };
  connectionNote.value = "";
}

function editConnection(item: ModelConnection) {
  editorOpen.value = true;
  editingId.value = item.id;
  form.value = {
    name: item.name,
    baseUrl: item.baseUrl,
    secret: "",
    enabled: item.enabled,
    defaultSelected: item.defaultSelected,
  };
  connectionNote.value = "";
}

async function saveConnection() {
  if (connectionBusy.value) return;
  connectionBusy.value = true;
  connectionOk.value = false;
  connectionNote.value = "";
  try {
    const previousRevision = connections.value.find(item => item.id === editingId.value)?.revision;
    let saved = await runtimeApi.saveModelConnection(
      { ...form.value, secret: form.value.secret },
      editingId.value ?? undefined,
    );
    form.value.secret = "";
    let catalogCached = false;
    if (saved.enabled && previousRevision !== saved.revision) {
      try {
        saved = await runtimeApi.refreshConnectionModels(saved.id);
        if (saved.discoveryError?.trim()) catalogCached = true;
      } catch { catalogCached = true; }
    }
    managing.value = saved;
    connectionOk.value = !catalogCached;
    connectionNote.value = catalogCached ? t("modelUi.cached") : t("modelUi.saveThenSelect");
    await refreshConnections();
    editorOpen.value = false;
    editingId.value = null;
  } catch (error) {
    connectionOk.value = false;
    connectionNote.value = errorMessage(error);
  } finally {
    connectionBusy.value = false;
  }
}

async function toggleConnection(item: ModelConnection) {
  if (connectionBusy.value) return;
  connectionBusy.value = true;
  try {
    await runtimeApi.setModelConnectionEnabled(item.id, !item.enabled);
    await refreshConnections();
  } catch (error) {
    connectionOk.value = false;
    connectionNote.value = errorMessage(error);
  } finally {
    connectionBusy.value = false;
  }
}

async function makeDefault(item: ModelConnection) {
  if (connectionBusy.value) return;
  connectionBusy.value = true;
  try {
    await runtimeApi.setDefaultModelConnection(item.id);
    await refreshConnections();
  } catch (error) {
    connectionOk.value = false;
    connectionNote.value = errorMessage(error);
  } finally {
    connectionBusy.value = false;
  }
}

</script>
<template>
<section class="view work-page model-settings-workspace">
  <div class="page-head"><p class="eyebrow">SETTINGS</p><h1>{{ t('composerUi.modelSettings') }}</h1></div>
    <div class="model-overview"><span>{{ t('chat.connections') }} <strong>{{ connections.length }}</strong></span><span>{{ t('modelUi.allowedCount') }} <strong>{{ allowedCount }}</strong></span></div>
    <ChatGptAccountCard ref="accountLogin" @connected="accountConnected" @changed="refreshConnections" />
    <section class="connection-settings-card" data-testid="model-connections">
      <div class="connection-list-heading"><h2>{{ t("chat.connections") }} <span class="hint">{{ connections.length }}</span></h2><Button type="button" variant="primary" :disabled="connectionBusy" @click="newConnection">＋ {{ t("composerUi.addConnection") }}</Button></div>
      <p class="hint" role="status">{{ t("modelUi.connectionHint") }}</p>

      <p v-if="!connections.length" class="connections-empty">{{ t("composerUi.noConnections") }}</p>
      <Input v-model="search" class="connection-search" type="search" :aria-label="t('modelUi.search')" :placeholder="t('modelUi.search')" />
      <ul class="connection-cards">
        <li v-for="item in visibleConnections" :key="item.id">
          <div class="connection-identity"><strong>{{ item.name }}</strong><span>{{ item.defaultModel || t("modelUi.pending") }}</span><small>{{ item.baseUrl }}</small></div>
          <span v-if="item.secretPresent"> · {{ t("hidden") }}</span>
          <span v-if="item.defaultSelected"> · {{ t("chat.connectionDefault") }}</span>
          <span v-if="!item.enabled"> · {{ t("chat.disabled") }}</span>
            <Button variant="secondary" type="button" :disabled="connectionBusy" @click="item.kind === 'chatgpt-plan' ? accountLogin?.start(item.id) : editConnection(item)">
              {{ t(item.kind === 'chatgpt-plan' ? "authUi.reconnect" : "chat.connectionEdit") }}
            </Button>
            <Button variant="secondary" type="button" :disabled="connectionBusy" @click="toggleConnection(item)">
              {{ item.enabled ? t("chat.connectionDisable") : t("chat.connectionEnabled") }}
            </Button>
            <Button
              v-if="!item.defaultSelected"
              variant="secondary"
              type="button"
              :disabled="connectionBusy"
              @click="makeDefault(item)"
            >
              {{ t("chat.connectionDefault") }}
            </Button>
            <Button v-if="item.kind === 'chatgpt-plan'" type="button" variant="secondary" :disabled="connectionBusy" @click="disconnect(item)">{{ t("authUi.disconnect") }}</Button>
            <Button variant="secondary" type="button" :disabled="connectionBusy" @click="managing = item">{{ t("modelUi.manage") }} · {{ item.allowedModels.length }}</Button>
        </li>
      </ul>
      <ConnectionDialog v-if="managing" :title="t('modelUi.catalog')" :busy="catalogBusy" @close="managing = null"><ModelCatalogEditor :connection="managing" @busy="catalogBusy = $event" @saved="refreshConnections" @close="managing = null" /></ConnectionDialog>
      <ConnectionDialog v-if="editorOpen" :title="editingId ? t('chat.connectionEdit') : t('composerUi.addConnection')" :busy="connectionBusy" @close="editorOpen = false; form.secret = ''">
      <form class="connection-form" @submit.prevent="saveConnection">
        <p v-if="useMockServices" class="hint">{{ t('preview.connectionMock') }}</p>
        <div class="connection-editor-heading"><h3>{{ editingId ? t("chat.connectionEdit") : t("composerUi.addConnection") }}</h3><Button type="button" variant="secondary" :disabled="connectionBusy" @click="editorOpen = false; form.secret = ''">{{ t("composerUi.close") }}</Button></div>
        <label>{{ t("task.preset") }}
          <Select :model-value="form.baseUrl.includes('deepseek') ? 'https://api.deepseek.com' : form.baseUrl === 'https://api.openai.com' ? form.baseUrl : 'custom'" @change="presetChanged">
            <option value="https://api.openai.com">OpenAI API Key</option><option value="https://api.deepseek.com">DeepSeek API Key</option><option value="custom">{{ t("composerUi.customConnection") }}</option>
          </Select>
        </label>
        <label>{{ t("chat.connectionName") }} <Input v-model="form.name" required /></label>
        <label>{{ t("chat.connectionUrl") }} <Input v-model="form.baseUrl" required /></label>
        <label>
          {{ t("chat.connectionSecret") }}
          <Input v-model="form.secret" type="password" autocomplete="new-password" :placeholder="editingId ? t('chat.connectionSecretKeep') : t('chat.connectionSecret')" />
        </label>
        <label><Checkbox v-model="form.enabled" /> {{ t("chat.connectionEnabled") }}</label>
        <label><Checkbox v-model="form.defaultSelected" /> {{ t("chat.connectionDefault") }}</label>
        <Button variant="primary" type="submit" :disabled="connectionBusy">{{ t("chat.connectionSave") }}</Button>
        <Feedback v-if="connectionNote && !connectionOk" tone="warning">{{ connectionNote }}</Feedback>
      </form>
      </ConnectionDialog>
      <Feedback v-if="connectionNote" :tone="connectionOk ? 'info' : 'warning'">{{ connectionNote }}</Feedback>
    </section>
</section>
</template>
<style scoped>
.model-settings-workspace{max-width:1200px;margin:auto;padding:24px 32px}.model-pipeline{display:grid;gap:6px;margin:0 0 8px;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--surface-3, var(--surface));font-size:12px;line-height:1.55;color:var(--text-soft)}.model-pipeline strong{color:var(--text);font-size:13px}.model-overview{display:flex;gap:24px;flex-wrap:wrap;padding:14px 0 22px;color:var(--text-soft);font-size:12px}.model-overview strong{margin-left:8px;color:var(--text)}.connection-search{width:100%;max-width:340px;margin:16px 0}.connection-cards{display:grid;gap:12px;list-style:none;padding:0}.connection-cards>li{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}.connection-identity{display:grid;gap:5px;flex:1 1 220px;min-width:0}.connection-identity strong{font-size:14px}.connection-identity span,.connection-identity small{font-size:11px;color:var(--text-soft);overflow-wrap:anywhere}.connection-cards :deep(button){font-size:11px;padding:7px 10px}.model-settings-workspace :deep(.connection-settings-card){padding:20px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}@media(max-width:760px){.model-settings-workspace{padding:16px 12px}.model-pipeline{padding:10px 12px}.connection-cards>li{padding:12px}.connection-cards :deep(button){flex:1 1 auto;min-width:0}.connection-dialog{width:calc(100vw - 16px);max-height:calc(100dvh - 24px)}}
</style>
