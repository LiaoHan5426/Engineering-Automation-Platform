<script setup lang="ts">
import { Button, Feedback } from '@eap/ui'
import { useMessages } from './messages'

defineProps<{ dismissLabel: string }>()
const { entries, dismiss } = useMessages()
</script>

<template>
  <ul class="message-stack" data-testid="notify-toasts" aria-live="polite">
    <li
      v-for="item in entries"
      :key="item.id"
      class="message-stack__item"
      data-testid="notify-toast"
    >
      <Feedback
        :tone="item.tone ?? 'info'"
        :message="[item.title, item.text].filter(Boolean).join(' — ')"
      />
      <Button
        v-if="item.kind === 'notify'"
        variant="icon"
        size="sm"
        type="button"
        :aria-label="dismissLabel"
        @click="dismiss(item.id)"
        >×</Button
      >
    </li>
  </ul>
</template>

<style scoped>
.message-stack {
  position: fixed;
  z-index: 40;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: min(360px, calc(100vw - 24px));
  padding: 0;
  margin: 0;
  list-style: none;
}

.message-stack__item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  pointer-events: auto;
  background: var(--surface);
  border: 1px solid var(--border);
}
</style>
