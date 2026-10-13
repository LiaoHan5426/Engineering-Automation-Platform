<script setup lang="ts">
import Button from "../button/Button.vue";
import Feedback from "../feedback/Feedback.vue";

/**
 * The one confirmation surface in the console.
 *
 * 1. A destructive action names its impact, not just its verb.
 * 2. The confirm button is never removed; when the runtime refuses, it stays disabled with the reason.
 * 3. `window.confirm` is not used: it cannot be asserted and cannot show consequences.
 */
defineProps<{
  title: string;
  impact: string[];
  confirmLabel: string;
  refusal?: string;
  busy?: boolean;
  danger?: boolean;
}>();
defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <div class="eap-confirm" role="dialog" aria-modal="true" :aria-label="title">
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
          {{ busy ? "处理中…" : confirmLabel }}
        </Button>
        <Button @click="$emit('cancel')">取消</Button>
      </div>
      <p v-if="refusal" class="eap-confirm__hint">
        按钮仍在原位但已禁用：拒绝的原因在它旁边，而不是把它藏起来。
      </p>
    </div>
  </div>
</template>

<style src="./confirm-box.css"></style>
