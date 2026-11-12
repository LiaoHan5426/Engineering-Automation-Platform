<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, ConfirmBox, Dialog, Feedback, Input, Textarea } from '@eap/ui'
import type { ChatTurn } from './chatSession'
import { apiStorageScope } from '../../lib/runtimeConfig'
const props = defineProps<{ conversationId: string; sourceKey: string; turn: ChatTurn }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const title = ref(t('desktop.workDocumentDefault')),
  body = ref(props.turn.text)
const error = ref(''),
  saved = ref(false),
  discard = ref(false)
const storageKey =
  apiStorageScope + '.eap.work-document.' + props.conversationId + '.' + props.sourceKey
const source = { text: props.turn.text, executionId: props.turn.executionId ?? null }
const storageConflict = ref(false)
const baseline = ref({ title: title.value, body: body.value })
try {
  const raw = localStorage.getItem(storageKey)
  if (raw) {
    storageConflict.value = true
    const draft: unknown = JSON.parse(raw)
    if (
      !draft ||
      typeof draft !== 'object' ||
      !('source' in draft) ||
      !('title' in draft) ||
      !('body' in draft) ||
      typeof draft.title !== 'string' ||
      typeof draft.body !== 'string' ||
      draft.title.length > 120 ||
      draft.body.length > 200000
    )
      throw new Error('Invalid document draft')
    if (JSON.stringify(draft.source) !== JSON.stringify(source))
      throw new Error('Document source changed')
    storageConflict.value = false
    title.value = draft.title
    body.value = draft.body
    baseline.value = { title: title.value, body: body.value }
  }
} catch {
  storageConflict.value = true
  error.value = t('desktop.workDocumentStorageError')
}
const dirty = computed(
  () => title.value !== baseline.value.title || body.value !== baseline.value.body,
)
function close() {
  if (dirty.value) discard.value = true
  else emit('close')
}
function save() {
  if (storageConflict.value) return
  error.value = ''
  saved.value = false
  try {
    const data = JSON.stringify({ source, title: title.value, body: body.value })
    localStorage.setItem(storageKey, data)
    if (localStorage.getItem(storageKey) !== data) throw new Error('Draft was not stored')
    baseline.value = { title: title.value, body: body.value }
    saved.value = true
  } catch {
    error.value = t('desktop.workDocumentStorageError')
  }
}
function download() {
  const content = '# ' + title.value.replace(/[\r\n]/g, ' ') + '\n\n' + body.value + '\n'
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download =
    (title.value.replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 80) || 'document') + '.md'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>
<template>
  <Dialog
    :title="t('desktop.workDocumentTitle')"
    :close-label="t('preview.close')"
    size="lg"
    data-testid="work-document-dialog"
    @close="close"
  >
    <div class="work-document-editor">
      <p>{{ t('desktop.workDocumentBoundary') }}</p>
      <p>
        {{ t('desktop.exportStatus') }}: {{ turn.status }} · {{ t('desktop.exportExecution') }}:
        {{ turn.executionId || '—' }}
      </p>
      <Feedback v-if="storageConflict" tone="warning">{{
        t('desktop.workDocumentSourceChanged')
      }}</Feedback>
      <Feedback v-else-if="error" tone="error">{{ error }}</Feedback>
      <Feedback v-if="saved && !dirty" tone="success">{{
        t('desktop.workDocumentSaved')
      }}</Feedback>
      <label
        >{{ t('desktop.workDocumentName')
        }}<Input v-model="title" maxlength="120" data-testid="work-document-name"
      /></label>
      <label
        >{{ t('desktop.workDocumentBody')
        }}<Textarea v-model="body" rows="16" maxlength="200000" data-testid="work-document-body"
      /></label>
    </div>
    <template #footer>
      <Button
        :disabled="storageConflict || !title.trim() || !body.trim()"
        data-testid="work-document-save"
        @click="save"
        >{{ t('desktop.workDocumentSave') }}</Button
      >
      <Button
        variant="primary"
        :disabled="!title.trim() || !body.trim()"
        data-testid="work-document-download"
        @click="download"
        >{{ t('desktop.exportDownload') }}</Button
      >
    </template>
  </Dialog>
  <ConfirmBox
    v-if="discard"
    :title="t('desktop.workDocumentDiscard')"
    :impact="[t('desktop.workDocumentDiscardImpact')]"
    :confirm-label="t('preview.close')"
    @confirm="emit('close')"
    @cancel="discard = false"
  />
</template>
<style scoped>
.work-document-editor,
.work-document-editor label {
  display: grid;
  gap: 12px;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
