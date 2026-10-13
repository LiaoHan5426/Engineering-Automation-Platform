<script setup lang="ts">
/**
 * The one confirmation surface in the console.
 *
 * Three rules from `docs/frontend-prototype.md` are encoded here rather than repeated at each call site:
 *
 * 1. A destructive action names its **impact**, not just its verb — "删除规则包 my-team-sql" is a label,
 *    "正被已启用的专家 orders-sql 引用" is a decision.
 * 2. The confirm button is never removed; when the runtime refuses, it stays in place **disabled** with the
 *    reason printed beside it. A control that vanishes cannot explain itself.
 * 3. `window.confirm` is not used anywhere: it cannot be asserted, it blocks the page, and it cannot show a
 *    list of consequences.
 */
defineProps<{
  title: string;
  impact: string[];
  confirmLabel: string;
  /** Why the runtime refused — shown beside a disabled confirm button. */
  refusal?: string;
  busy?: boolean;
  danger?: boolean;
}>();
defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <div class="confirm-overlay" role="dialog" aria-modal="true" :aria-label="title">
    <div class="confirm-box">
      <h3>{{ title }}</h3>
      <ul class="confirm-impact">
        <li v-for="line in impact" :key="line">{{ line }}</li>
      </ul>
      <p v-if="refusal" class="eap-feedback eap-feedback--error" role="alert">{{ refusal }}</p>
      <div class="form-actions">
        <button
          class="eap-button"
          :class="danger ? 'eap-button--danger' : 'eap-button--primary'"
          :disabled="busy || !!refusal"
          @click="$emit('confirm')"
        >
          {{ busy ? "处理中…" : confirmLabel }}
        </button>
        <button class="eap-button" @click="$emit('cancel')">取消</button>
      </div>
      <p v-if="refusal" class="hint">按钮仍在原位但已禁用：拒绝的原因在它旁边，而不是把它藏起来。</p>
    </div>
  </div>
</template>
