<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RichText, Button } from '@eap/ui'
defineProps<{ text: string; role: 'user' | 'assistant' }>()
const { t } = useI18n()
const copied = ref(false),
  failed = ref(false)
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    failed.value = false
  } catch {
    failed.value = true
  }
}
</script>
<template>
  <section class="chat-message-body">
    <slot name="reasoning" />
    <RichText
      v-if="text && role === 'assistant'"
      :source="text"
      :copy-label="t('richText.copy')"
      :copied-label="t('richText.copied')"
      :failed-label="t('richText.failed')"
      :render-label="t('richText.render')"
      :source-label="t('richText.source')"
    />
    <p v-else class="chat-message-body__question">{{ text }}</p>
    <slot name="references" />
    <div v-if="text" class="chat-message-body__actions">
      <Button size="sm" variant="ghost" data-testid="copy-message" @click="copy(text)">{{
        copied ? t('richText.copied') : t('richText.copy')
      }}</Button
      ><slot name="actions" />
    </div>
    <p v-if="failed" role="status">{{ t('richText.failed') }}</p>
    <slot name="evidence" />
  </section>
</template>
<style scoped>
.chat-message-body {
  min-width: 0;
}
.chat-message-body__question {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.chat-message-body__actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
</style>
