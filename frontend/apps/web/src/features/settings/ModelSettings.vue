<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Feedback } from '@eap/ui';
import { runtimeApi, type ModelConnection } from '@eap/runtime-client';
import ConnectionDialog from './ConnectionDialog.vue';
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
import { errorMessage } from '../../lib/presentation';
const { t } = useI18n();
const connections = ref<ModelConnection[]>([]);
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
    if (saved.enabled && previousRevision !== saved.revision) {
      try { saved = await runtimeApi.refreshConnectionModels(saved.id); }
      catch { connectionNote.value = t("modelUi.cached"); }
    }
    managing.value = saved;
    editingId.value = saved.id;
    connectionOk.value = true;
    connectionNote.value = t("chat.connectionSaved");
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
  <div class="page-head"><p class="eyebrow">SETTINGS</p><h1>{{ t('composerUi.modelSettings') }}</h1><p>{{ t('composerUi.modelSettingsHint') }}</p></div>
    <ChatGptAccountCard ref="accountLogin" @connected="accountConnected" @changed="refreshConnections" />
    <section class="connection-settings-card" data-testid="model-connections">
      <div class="connection-list-heading"><h2>{{ t("chat.connections") }} <span class="hint">{{ connections.length }}</span></h2><Button type="button" variant="primary" :disabled="connectionBusy" @click="newConnection">＋ {{ t("composerUi.addConnection") }}</Button></div>
      <p class="hint" role="status">{{ t("modelUi.connectionHint") }}</p>

      <p v-if="!connections.length" class="connections-empty">{{ t("composerUi.noConnections") }}</p>
      <ul>
        <li v-for="item in connections" :key="item.id">
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
      <ConnectionDialog v-if="managing" :title="t('modelUi.catalog')" :busy="true" @close="managing = null"><ModelCatalogEditor :connection="managing" @saved="refreshConnections" @close="managing = null" /></ConnectionDialog>
      <ConnectionDialog v-if="editorOpen" :title="editingId ? t('chat.connectionEdit') : t('composerUi.addConnection')" :busy="connectionBusy" @close="editorOpen = false; form.secret = ''">
      <form class="connection-form" @submit.prevent="saveConnection">
        <div class="connection-editor-heading"><h3>{{ editingId ? t("chat.connectionEdit") : t("composerUi.addConnection") }}</h3><Button type="button" variant="secondary" :disabled="connectionBusy" @click="editorOpen = false; form.secret = ''">{{ t("composerUi.close") }}</Button></div>
        <label>{{ t("task.preset") }}
          <select :value="form.baseUrl.includes('deepseek') ? 'https://api.deepseek.com' : form.baseUrl === 'https://api.openai.com' ? form.baseUrl : 'custom'" @change="presetChanged">
            <option value="https://api.openai.com">OpenAI API Key</option><option value="https://api.deepseek.com">DeepSeek API Key</option><option value="custom">{{ t("composerUi.customConnection") }}</option>
          </select>
        </label>
        <label>{{ t("chat.connectionName") }} <input v-model="form.name" required /></label>
        <label>{{ t("chat.connectionUrl") }} <input v-model="form.baseUrl" required /></label>
        <label>
          {{ t("chat.connectionSecret") }}
          <input v-model="form.secret" type="password" autocomplete="new-password" :placeholder="editingId ? t('chat.connectionSecretKeep') : t('chat.connectionSecret')" />
        </label>
        <label><input v-model="form.enabled" type="checkbox" /> {{ t("chat.connectionEnabled") }}</label>
        <label><input v-model="form.defaultSelected" type="checkbox" /> {{ t("chat.connectionDefault") }}</label>
        <Button variant="primary" type="submit" :disabled="connectionBusy">{{ t("chat.connectionSave") }}</Button>
        <Feedback v-if="connectionNote && !connectionOk" tone="warning">{{ connectionNote }}</Feedback>
      </form>
      </ConnectionDialog>
      <Feedback v-if="connectionNote" :tone="connectionOk ? 'info' : 'warning'">{{ connectionNote }}</Feedback>
    </section>
</section>
</template>
