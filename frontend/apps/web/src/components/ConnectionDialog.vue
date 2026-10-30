<script setup lang="ts">
/**
 * Thin Dialog shell shared by model settings and chat history.
 * Domain forms stay in the calling feature. Not a second modal implementation.
 */
import { Dialog } from "@eap/ui";

const emit = defineEmits<{ close: [] }>();
defineProps<{ title: string; busy: boolean }>();
</script>

<template>
  <Dialog
    :title="title"
    :busy="busy"
    size="lg"
    :show-header="false"
    data-testid="connection-dialog"
    @close="emit('close')"
  >
    <div class="connection-dialog-content work-page">
      <slot />
    </div>
  </Dialog>
</template>
