<script setup lang="ts">
import Button from '../button/Button.vue'
import Feedback from '../feedback/Feedback.vue'
import { ref } from 'vue'
import { useFocusTrap } from '../hooks/useFocusTrap'

/**
 * The one confirmation surface in the console.
 *
 * 1. A destructive action names its impact, not just its verb.
 * 2. The confirm button is never removed; when the runtime refuses, it stays disabled with the reason.
 * 3. `window.confirm` is not used: it cannot be asserted and cannot show consequences.
 */
const props = defineProps<{
  title: string
  impact: string[]
  confirmLabel: string
  cancelLabel?: string
  refusal?: string
  busy?: boolean
  danger?: boolean
  teleportTo?: string | HTMLElement
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const root = ref<HTMLElement | null>(null)
/** Client moves the layer to body so it stacks above Dialog. SSR keeps it inline for string assertions. */
const portaled = typeof document !== 'undefined'
const { onKeydown, active } = useFocusTrap(root, {
  onEscape: () => {
    if (!props.busy) emit('cancel')
  },
  initial: (node) => node.querySelector<HTMLElement>('[data-confirm-cancel]'),
})
</script>

<template>
  <Teleport :to="teleportTo ?? 'body'" :disabled="!portaled">
    <div
      v-show="active"
      ref="root"
      class="eap-confirm"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      :aria-label="title"
      @keydown="onKeydown"
    >
      <div class="eap-confirm__dialog">
        <h3>{{ title }}</h3>
        <ul class="eap-confirm__impact">
          <li v-for="line in impact" :key="line">{{ line }}</li>
        </ul>
        <Feedback v-if="refusal" tone="error" :message="refusal" />
        <div class="eap-confirm__actions">
          <Button
            :variant="danger ? 'danger' : 'primary'"
            :disabled="busy || !!refusal"
            @click="$emit('confirm')"
          >
            {{ busy ? '处理中…' : confirmLabel }}
          </Button>
          <Button data-confirm-cancel :disabled="busy" @click="$emit('cancel')">{{
            cancelLabel ?? '取消'
          }}</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style src="./confirm-box.css"></style>
