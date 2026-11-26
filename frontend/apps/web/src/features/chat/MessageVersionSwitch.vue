<script setup lang="ts">
import { Button } from '@eap/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  /** Sibling versions of one message node, oldest first. */
  versions: ReadonlyArray<{ id: string }>
  current: string
  disabled: boolean
}>()
const emit = defineEmits<{ change: [direction: -1 | 1] }>()
const { t } = useI18n()
const position = computed(() => props.versions.findIndex((node) => node.id === props.current) + 1)
</script>

<template>
  <div v-if="versions.length > 1" class="turn-version" data-testid="message-versions">
    <Button
      size="sm"
      variant="ghost"
      :aria-label="t('chat.previousVersion')"
      :disabled="disabled || versions[0]?.id === current"
      @click="emit('change', -1)"
      >‹</Button
    >
    <span>{{ position }} / {{ versions.length }}</span>
    <Button
      size="sm"
      variant="ghost"
      :aria-label="t('chat.nextVersion')"
      :disabled="disabled || versions.at(-1)?.id === current"
      @click="emit('change', 1)"
      >›</Button
    >
  </div>
</template>
