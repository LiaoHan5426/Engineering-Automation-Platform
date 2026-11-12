<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Dialog, Button, Input, Textarea, Feedback, ConfirmBox } from '@eap/ui'
import { runtimeApi } from '@eap/runtime-client'
import { errorMessage } from '../../lib/presentation'
const props = defineProps<{
  baseId: string
  document: { id: string; title: string; content: string }
}>()
const emit = defineEmits<{
  close: []
  saved: [document: { id: string; title: string; content: string }]
}>()
const { t } = useI18n()
const title = ref(props.document.title),
  content = ref(props.document.content)
const busy = ref(false),
  error = ref(''),
  discard = ref(false)
const dirty = computed(
  () => title.value !== props.document.title || content.value !== props.document.content,
)
async function save() {
  if (busy.value || !dirty.value || !title.value.trim() || !content.value.trim()) return
  busy.value = true
  error.value = ''
  try {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(props.document.content),
    )
    const expectedHash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
    await runtimeApi.updateKnowledgeDocument(props.baseId, props.document.id, {
      title: title.value,
      content: content.value,
      expectedHash,
    })
    const page = await runtimeApi.knowledgeDocuments(props.baseId)
    const current = page.items.find((item) => item.id === props.document.id)
    if (!current || current.title !== title.value || current.content !== content.value)
      throw new Error(t('product.documentReadback'))
    emit('saved', current)
  } catch (failure) {
    error.value = errorMessage(failure)
  } finally {
    busy.value = false
  }
}
function close() {
  if (busy.value) return
  if (dirty.value) discard.value = true
  else emit('close')
}
</script>
<template>
  <Dialog :title="t('product.editDocument')" size="lg" :busy="busy" @close="close">
    <div class="document-editor">
      <Feedback v-if="error" tone="error">{{ error }}</Feedback>
      <p>{{ t('product.documentEditBoundary') }}</p>
      <Input
        v-model="title"
        :aria-label="t('product.documentTitle')"
        maxlength="1000"
        :disabled="busy"
        data-testid="knowledge-edit-title"
      />
      <Textarea
        v-model="content"
        :aria-label="t('product.documentBody')"
        rows="16"
        maxlength="200000"
        :disabled="busy"
        data-testid="knowledge-edit-content"
      />
    </div>
    <template #footer
      ><Button
        variant="primary"
        :disabled="busy || !dirty || !title.trim() || !content.trim()"
        data-testid="knowledge-edit-save"
        @click="save"
        >{{ t('historyUi.save') }}</Button
      ></template
    >
  </Dialog>
  <ConfirmBox
    v-if="discard"
    :title="t('desktop.boardUnsaved')"
    :impact="[t('desktop.boardDiscardImpact')]"
    :confirm-label="t('desktop.boardDiscard')"
    @confirm="emit('close')"
    @cancel="discard = false"
  />
</template>
<style scoped>
.document-editor {
  display: grid;
  gap: 12px;
  min-width: 0;
}
</style>
