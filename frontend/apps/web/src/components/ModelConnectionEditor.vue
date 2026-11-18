<script setup lang="ts">
// Application model-domain editor shared by settings and contextual chat setup.
// Dialog/Confirm primitives remain in @eap/ui; no route or conversation mutations.
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Checkbox, ConfirmBox, Feedback, Input, Select } from '@eap/ui'
import type { ModelConnection, ModelWireApi } from '@eap/runtime-client'
import { modelApi as runtimeApi } from '../features/chat/chatService'
import { errorMessage } from '../lib/presentation'
import ConnectionDialog from './ConnectionDialog.vue'
import ModelCatalogEditor from './ModelCatalogEditor.vue'
const { t } = useI18n()
const emit = defineEmits<{
  changed: [items: ModelConnection[]]
  busy: [value: boolean]
  closed: []
}>()
const connections = ref<ModelConnection[]>([])
const managing = ref<ModelConnection | null>(null)
const catalogBusy = ref(false)
const catalogEditor = ref<InstanceType<typeof ModelCatalogEditor> | null>(null)
function manageConnection(item: ModelConnection) {
  connectionNote.value = ''
  readbackFailed.value = false
  managing.value = item
}
async function refreshConnections() {
  connections.value = (await runtimeApi.modelConnections()).items
  emit('changed', connections.value)
}
const editorOpen = ref(false)
const editorForm = ref<HTMLFormElement>()
const editingId = ref<string | null>(null)
const connectionNote = ref('')
const connectionOk = ref(false)
const connectionBusy = ref(false)
const form = ref({
  name: '',
  wireApi: 'chat-completions' as ModelWireApi,
  baseUrl: 'https://api.openai.com',
  secret: '',
  enabled: true,
  defaultSelected: true,
})
// Only keep the comparison snapshot in memory; never persist connection secrets.
const initialForm = ref({ ...form.value })
const discardConnection = ref(false)
const connectionDirty = computed(() =>
  (Object.keys(form.value) as (keyof typeof form.value)[]).some(
    (key) => form.value[key] !== initialForm.value[key],
  ),
)
let leaveCallback: (() => void) | undefined
function closeConnection() {
  if (connectionBusy.value) return
  discardConnection.value = false
  editorOpen.value = false
  editingId.value = null
  form.value.secret = ''
  const callback = leaveCallback
  leaveCallback = undefined
  callback?.()
}
function guardLeave(onDiscard?: () => void): boolean {
  if (connectionBusy.value || catalogBusy.value) return false
  if (managing.value) return catalogEditor.value?.guardLeave(onDiscard) ?? false
  if (editorOpen.value && connectionDirty.value) {
    leaveCallback = onDiscard
    discardConnection.value = true
    return false
  }
  closeConnection()
  return true
}
function keepConnection() {
  discardConnection.value = false
  leaveCallback = undefined
}
defineExpose({ guardLeave, newConnection, editConnection, manageConnection })
function requestCloseConnection() {
  if (connectionBusy.value) return
  if (connectionDirty.value) discardConnection.value = true
  else closeConnection()
}
const connectionPreset = computed(() =>
  form.value.baseUrl.includes('deepseek')
    ? 'https://api.deepseek.com'
    : form.value.baseUrl === 'https://api.openai.com'
      ? form.value.baseUrl
      : 'custom',
)

function presetChanged(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'custom') {
    form.value.baseUrl = ''
    return
  }
  form.value.baseUrl = value
}
function newConnection(items: ModelConnection[]) {
  connections.value = [...items]
  editorOpen.value = true
  editingId.value = null
  form.value = {
    name: '',
    wireApi: 'chat-completions',
    baseUrl: 'https://api.openai.com',
    secret: '',
    enabled: true,
    defaultSelected: connections.value.length === 0,
  }
  initialForm.value = { ...form.value }
  discardConnection.value = false
  connectionNote.value = ''
}

function editConnection(item: ModelConnection, items: ModelConnection[]) {
  connections.value = [...items]
  editorOpen.value = true
  editingId.value = item.id
  form.value = {
    name: item.name,
    wireApi: item.wireApi ?? 'chat-completions',
    baseUrl: item.baseUrl,
    secret: '',
    enabled: item.enabled,
    defaultSelected: item.defaultSelected,
  }
  initialForm.value = { ...form.value }
  discardConnection.value = false
  connectionNote.value = ''
}

async function saveConnection() {
  if (connectionBusy.value) return
  connectionBusy.value = true
  connectionOk.value = false
  connectionNote.value = ''
  try {
    const previous = connections.value.find((item) => item.id === editingId.value)
    const protocolOnly =
      previous &&
      previous.baseUrl === form.value.baseUrl &&
      !form.value.secret.trim() &&
      (previous.wireApi ?? 'chat-completions') !== form.value.wireApi
    let saved = await runtimeApi.saveModelConnection(
      { ...form.value, secret: form.value.secret },
      editingId.value ?? undefined,
    )
    form.value.secret = ''
    editorOpen.value = false
    editingId.value = null
    // Keep the accepted server identity even if the following overview read fails.
    const savedIndex = connections.value.findIndex((item) => item.id === saved.id)
    if (savedIndex < 0) connections.value.push(saved)
    else connections.value[savedIndex] = saved
    emit('changed', connections.value)
    let catalogCached = false
    if (saved.enabled && previous?.revision !== saved.revision && !protocolOnly) {
      try {
        saved = await runtimeApi.refreshConnectionModels(saved.id)
        if (saved.discoveryError?.trim()) catalogCached = true
      } catch {
        catalogCached = true
      }
    }
    managing.value = saved
    readbackFailed.value = false
    connectionOk.value = !catalogCached
    connectionNote.value = catalogCached ? t('modelUi.cached') : t('modelUi.saveThenSelect')
    try {
      await refreshConnections()
    } catch (error) {
      readbackFailed.value = true
      connectionOk.value = false
      connectionNote.value = t('modelUi.refreshAfterSaveFailed', { error: errorMessage(error) })
    }
  } catch (error) {
    connectionOk.value = false
    connectionNote.value = errorMessage(error)
  } finally {
    connectionBusy.value = false
  }
}

const readbackFailed = ref(false)
watch(
  () => editorOpen.value || !!managing.value || connectionBusy.value || catalogBusy.value,
  (open, previous) => {
    if (previous && !open) emit('closed')
  },
  { flush: 'post' },
)
watch(
  () => connectionBusy.value || catalogBusy.value,
  async (value, previous) => {
    emit('busy', value)
    if (value || !previous) return
    await nextTick()
    if (document.activeElement !== document.body) return
    if (editorOpen.value)
      editorForm.value?.querySelector<HTMLButtonElement>('button[type=submit]')?.focus()
    else if (managing.value) catalogEditor.value?.focus()
  },
  { flush: 'sync' },
)
async function readCatalog(): Promise<boolean> {
  try {
    await refreshConnections()
    readbackFailed.value = false
    connectionNote.value = ''
    return true
  } catch (error) {
    readbackFailed.value = true
    connectionOk.value = false
    connectionNote.value = t('modelUi.refreshAfterSaveFailed', { error: errorMessage(error) })
    return false
  }
}
async function retryReadback() {
  if (connectionBusy.value || catalogBusy.value) return
  connectionBusy.value = true
  try {
    await refreshConnections()
    readbackFailed.value = false
    connectionOk.value = true
    connectionNote.value = t('modelUi.saveThenSelect')
  } catch (error) {
    connectionNote.value = t('modelUi.refreshAfterSaveFailed', { error: errorMessage(error) })
  } finally {
    connectionBusy.value = false
  }
}
</script>
<template>
  <ConnectionDialog
    v-if="managing"
    :title="t('modelUi.catalog')"
    :busy="catalogBusy || connectionBusy"
    @close="catalogEditor?.requestClose()"
    ><ModelCatalogEditor
      ref="catalogEditor"
      :connection="managing"
      :readback="readCatalog"
      :external-busy="connectionBusy"
      @busy="catalogBusy = $event"
      @close="managing = null"
    />
    <Feedback v-if="connectionNote" :tone="connectionOk ? 'info' : 'warning'">{{
      connectionNote
    }}</Feedback>
    <Button
      v-if="readbackFailed"
      data-testid="connection-readback-retry"
      type="button"
      :disabled="connectionBusy || catalogBusy"
      @click="retryReadback"
      >{{ t('product.retry') }}</Button
    >
  </ConnectionDialog>
  <ConnectionDialog
    v-if="editorOpen"
    :title="editingId ? t('chat.connectionEdit') : t('composerUi.addConnection')"
    :busy="connectionBusy"
    @close="requestCloseConnection"
  >
    <form ref="editorForm" class="connection-form" @submit.prevent="saveConnection">
      <div class="connection-editor-heading">
        <h3>{{ editingId ? t('chat.connectionEdit') : t('composerUi.addConnection') }}</h3>
        <Button
          type="button"
          variant="secondary"
          :disabled="connectionBusy"
          @click="requestCloseConnection"
          >{{ t('composerUi.close') }}</Button
        >
      </div>
      <label
        >{{ t('task.preset') }}
        <Select :disabled="connectionBusy" :model-value="connectionPreset" @change="presetChanged">
          <option value="https://api.openai.com">OpenAI API Key</option>
          <option value="https://api.deepseek.com">DeepSeek API Key</option>
          <option value="custom">{{ t('composerUi.customConnection') }}</option>
        </Select>
      </label>
      <label
        >{{ t('chat.connectionName') }}
        <Input :disabled="connectionBusy" v-model="form.name" required
      /></label>
      <label
        >{{ t('chat.connectionUrl') }}
        <Input :disabled="connectionBusy" v-model="form.baseUrl" required
      /></label>
      <label>
        {{ t('modelUi.wireApi') }}
        <Select v-model="form.wireApi" data-testid="wire-api" :disabled="connectionBusy">
          <option value="chat-completions">Chat Completions</option>
          <option value="responses">Responses</option>
        </Select>
      </label>
      <p v-if="form.wireApi === 'responses'" class="hint">
        {{ t('modelUi.protocolToolsUnavailable') }}
      </p>
      <label>
        {{ t('chat.connectionSecret') }}
        <Input
          v-model="form.secret"
          :disabled="connectionBusy"
          type="password"
          autocomplete="new-password"
          :placeholder="editingId ? t('chat.connectionSecretKeep') : t('chat.connectionSecret')"
        />
      </label>
      <label
        ><Checkbox :disabled="connectionBusy" v-model="form.enabled" />
        {{ t('chat.connectionEnabled') }}</label
      >
      <label
        ><Checkbox :disabled="connectionBusy" v-model="form.defaultSelected" />
        {{ t('chat.connectionDefault') }}</label
      >
      <Button variant="primary" type="submit" :disabled="connectionBusy">{{
        t('chat.connectionSave')
      }}</Button>
      <Feedback v-if="connectionNote && !connectionOk" tone="warning">{{
        connectionNote
      }}</Feedback>
    </form>
  </ConnectionDialog>
  <ConfirmBox
    v-if="discardConnection"
    :title="t('product.discardTitle')"
    :impact="[t('product.discardImpact')]"
    :confirm-label="t('product.discard')"
    :busy="connectionBusy"
    @confirm="closeConnection"
    @cancel="keepConnection"
  />
</template>
