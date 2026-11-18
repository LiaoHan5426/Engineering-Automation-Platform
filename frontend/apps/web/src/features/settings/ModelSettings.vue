<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Feedback, Input } from '@eap/ui'
import { IconPlus } from '@eap/ui'
import type { ModelConnection } from '@eap/runtime-client'
import { modelApi as runtimeApi } from '../chat/chatService'
import ModelConnectionEditor from '../../components/ModelConnectionEditor.vue'
import ChatGptAccountCard from './ChatGptAccountCard.vue'
const accountLogin = ref<{ start: (id?: string) => Promise<void> } | null>(null)
async function accountConnected(id: string) {
  try {
    const result = await runtimeApi.refreshConnectionModels(id)
    await refreshConnections()
    connectionEditor.value?.manageConnection(result)
  } catch (error) {
    connectionNote.value = errorMessage(error)
    await refreshConnections()
  }
}
async function disconnect(item: ModelConnection) {
  connectionBusy.value = true
  try {
    await runtimeApi.disconnectChatGpt(item.id)
    await refreshConnections()
  } catch (error) {
    connectionNote.value = errorMessage(error)
  } finally {
    connectionBusy.value = false
  }
}
const connectionEditor = ref<InstanceType<typeof ModelConnectionEditor> | null>(null)
import { errorMessage } from '../../lib/presentation'
const { t } = useI18n()
const connections = ref<ModelConnection[]>([])
const search = ref('')
const visibleConnections = computed(() =>
  connections.value.filter((item) =>
    `${item.name} ${item.baseUrl}`.toLowerCase().includes(search.value.toLowerCase()),
  ),
)
const allowedCount = computed(() =>
  connections.value
    .filter((item) => item.enabled)
    .reduce((sum, item) => sum + item.allowedModels.length, 0),
)
async function refreshConnections() {
  connections.value = (await runtimeApi.modelConnections()).items
}
onMounted(async () => {
  try {
    await refreshConnections()
  } catch (error) {
    connectionNote.value = errorMessage(error)
  }
})
const connectionNote = ref('')
const connectionOk = ref(false)
const connectionBusy = ref(false)
function guardLeave(onDiscard?: () => void): boolean {
  if (connectionBusy.value) return false
  return connectionEditor.value?.guardLeave(onDiscard) ?? true
}
defineExpose({ guardLeave })
function newConnection() {
  connectionEditor.value?.newConnection(connections.value)
}
function editConnection(item: ModelConnection) {
  connectionEditor.value?.editConnection(item, connections.value)
}
async function toggleConnection(item: ModelConnection) {
  if (connectionBusy.value) return
  connectionBusy.value = true
  try {
    await runtimeApi.setModelConnectionEnabled(item.id, !item.enabled)
    await refreshConnections()
  } catch (error) {
    connectionOk.value = false
    connectionNote.value = errorMessage(error)
  } finally {
    connectionBusy.value = false
  }
}

async function makeDefault(item: ModelConnection) {
  if (connectionBusy.value) return
  connectionBusy.value = true
  try {
    await runtimeApi.setDefaultModelConnection(item.id)
    await refreshConnections()
  } catch (error) {
    connectionOk.value = false
    connectionNote.value = errorMessage(error)
  } finally {
    connectionBusy.value = false
  }
}
</script>
<template>
  <section class="view work-page model-settings-workspace">
    <div class="page-head">
      <p class="eyebrow">SETTINGS</p>
      <h1>{{ t('composerUi.modelSettings') }}</h1>
    </div>
    <div class="model-overview">
      <span
        >{{ t('chat.connections') }} <strong>{{ connections.length }}</strong></span
      ><span
        >{{ t('modelUi.allowedCount') }} <strong>{{ allowedCount }}</strong></span
      >
    </div>
    <ChatGptAccountCard
      ref="accountLogin"
      @connected="accountConnected"
      @changed="refreshConnections"
    />
    <section class="connection-settings-card" data-testid="model-connections">
      <div class="connection-list-heading">
        <h2>
          {{ t('chat.connections') }} <span class="hint">{{ connections.length }}</span>
        </h2>
        <Button type="button" variant="primary" :disabled="connectionBusy" @click="newConnection"
          ><IconPlus /> {{ t('composerUi.addConnection') }}</Button
        >
      </div>
      <p class="hint" role="status">{{ t('modelUi.connectionHint') }}</p>

      <p v-if="!connections.length" class="connections-empty">
        {{ t('composerUi.noConnections') }}
      </p>
      <Input
        v-model="search"
        class="connection-search"
        type="search"
        :aria-label="t('modelUi.search')"
        :placeholder="t('modelUi.search')"
      />
      <ul class="connection-cards">
        <li v-for="item in visibleConnections" :key="item.id">
          <div class="connection-identity">
            <strong>{{ item.name }}</strong
            ><span>{{ item.defaultModel || t('modelUi.pending') }}</span
            ><small>{{ item.baseUrl }}</small>
            <small>
              {{ t('modelUi.wireApi') }}:
              {{
                item.kind === 'chatgpt-plan' || item.wireApi === 'responses'
                  ? 'Responses'
                  : 'Chat Completions'
              }}
            </small>
          </div>
          <span v-if="item.secretPresent"> · {{ t('hidden') }}</span>
          <span v-if="item.defaultSelected"> · {{ t('chat.connectionDefault') }}</span>
          <span v-if="!item.enabled"> · {{ t('chat.disabled') }}</span>
          <Button
            variant="secondary"
            type="button"
            :disabled="connectionBusy"
            @click="
              item.kind === 'chatgpt-plan' ? accountLogin?.start(item.id) : editConnection(item)
            "
          >
            {{ t(item.kind === 'chatgpt-plan' ? 'authUi.reconnect' : 'chat.connectionEdit') }}
          </Button>
          <Button
            variant="secondary"
            type="button"
            :disabled="connectionBusy"
            @click="toggleConnection(item)"
          >
            {{ item.enabled ? t('chat.connectionDisable') : t('chat.connectionEnabled') }}
          </Button>
          <Button
            v-if="!item.defaultSelected"
            variant="secondary"
            type="button"
            :disabled="connectionBusy"
            @click="makeDefault(item)"
          >
            {{ t('chat.connectionDefault') }}
          </Button>
          <Button
            v-if="item.kind === 'chatgpt-plan'"
            type="button"
            variant="secondary"
            :disabled="connectionBusy"
            @click="disconnect(item)"
            >{{ t('authUi.disconnect') }}</Button
          >
          <Button
            variant="secondary"
            type="button"
            :disabled="connectionBusy"
            @click="connectionEditor?.manageConnection(item)"
            >{{ t('modelUi.manage') }} · {{ item.allowedModels.length }}</Button
          >
        </li>
      </ul>
      <Feedback v-if="connectionNote" :tone="connectionOk ? 'info' : 'warning'">{{
        connectionNote
      }}</Feedback>
      <ModelConnectionEditor
        ref="connectionEditor"
        @changed="connections = $event"
        @busy="connectionBusy = $event"
      />
    </section>
  </section>
</template>
<style scoped>
.model-settings-workspace {
  max-width: 1200px;
  margin: auto;
  padding: 24px 32px;
}
.model-pipeline {
  display: grid;
  gap: 6px;
  margin: 0 0 8px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-3, var(--surface));
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-soft);
}
.model-pipeline strong {
  color: var(--text);
  font-size: 13px;
}
.model-overview {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  padding: 14px 0 22px;
  color: var(--text-soft);
  font-size: 12px;
}
.model-overview strong {
  margin-left: 8px;
  color: var(--text);
}
.connection-search {
  width: 100%;
  max-width: 340px;
  margin: 16px 0;
}
.connection-cards {
  display: grid;
  gap: 12px;
  list-style: none;
  padding: 0;
}
.connection-cards > li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}
.connection-identity {
  display: grid;
  gap: 5px;
  flex: 1 1 220px;
  min-width: 0;
}
.connection-identity strong {
  font-size: 14px;
}
.connection-identity span,
.connection-identity small {
  font-size: 11px;
  color: var(--text-soft);
  overflow-wrap: anywhere;
}
.model-settings-workspace :deep(.connection-settings-card) {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}
@media (max-width: 760px) {
  .model-settings-workspace {
    padding: 16px 12px;
  }
  .model-pipeline {
    padding: 10px 12px;
  }
  .connection-cards > li {
    padding: 12px;
  }
  .connection-cards :deep(button) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .connection-dialog {
    width: calc(100vw - 16px);
    max-height: calc(100dvh - 24px);
  }
}
</style>
