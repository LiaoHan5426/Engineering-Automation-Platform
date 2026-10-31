<script setup lang="ts">
import Button from "../button/Button.vue";
defineProps<{ label: string; disabled?: boolean; selected?: boolean }>();
defineEmits<{ activate: [MouseEvent] }>();
</script>
<template>
  <article class="eap-action-card" :data-selected="selected || undefined" :data-disabled="disabled || undefined">
    <Button class="eap-action-card__trigger" variant="card" :aria-label="label" :aria-pressed="selected" :disabled="disabled" @click="$emit('activate', $event)" />
    <div class="eap-action-card__content"><slot /></div>
    <div v-if="$slots.actions" class="eap-action-card__actions"><slot name="actions" /></div>
  </article>
</template>
<style src="./action-card.css"></style>
