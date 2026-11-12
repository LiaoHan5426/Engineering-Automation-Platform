<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Dialog } from '@eap/ui'
import type { ChatTurn } from './chatSession'
import { chatMarkdown } from './chatExport'
const props = defineProps<{ title: string; conversationId: string; turns: readonly ChatTurn[] }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const content = computed(() =>
  chatMarkdown({
    ...props,
    labels: {
      boundary: t('desktop.exportBoundary'),
      user: t('desktop.exportUser'),
      assistant: t('desktop.exportAssistant'),
      status: t('desktop.exportStatus'),
      execution: t('desktop.exportExecution'),
      verification: t('desktop.exportVerification'),
      artifacts: t('desktop.exportArtifact'),
    },
  }),
)
function download() {
  const url = URL.createObjectURL(
    new Blob([content.value], { type: 'text/markdown;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download =
    'eap-chat-' + props.conversationId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) + '.md'
  link.click()
  // Release only after the browser has consumed the download click.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>
<template>
  <Dialog
    :title="t('desktop.moreExport')"
    :close-label="t('preview.close')"
    size="lg"
    data-testid="chat-export-dialog"
    @close="emit('close')"
  >
    <p>{{ t('desktop.exportBoundary') }}</p>
    <p>{{ t('desktop.exportContents', { count: turns.length }) }}</p>
    <pre class="chat-export-preview" data-testid="chat-export-preview">{{ content }}</pre>
    <template #footer
      ><Button variant="primary" data-testid="chat-export-download" @click="download">{{
        t('desktop.exportDownload')
      }}</Button></template
    >
  </Dialog>
</template>
<style scoped>
.chat-export-preview {
  max-height: 50vh;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
