<script setup lang="ts">
import { computed, watch } from "vue";
import Button from "../button/Button.vue";
const props = withDefaults(defineProps<{
  total: number;
  pageSize?: number;
  disabled?: boolean;
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
}>(), { pageSize: 20, label: "分页", previousLabel: "上一页", nextLabel: "下一页" });
const model = defineModel<number>({ default: 1 });
const count = computed(() => props.pageSize > 0 && Number.isFinite(props.total)
  ? Math.max(1, Math.ceil(props.total / props.pageSize)) : 1);
const current = computed(() => Math.min(count.value, Math.max(1, Math.trunc(model.value) || 1)));
watch([current, () => model.value], () => {
  if (model.value !== current.value) model.value = current.value;
}, { immediate: true });
</script>

<template>
  <nav class="eap-pagination" :aria-label="label">
    <Button size="sm" :disabled="disabled || current <= 1" @click="model = current - 1">{{ previousLabel }}</Button>
    <span aria-live="polite" aria-atomic="true">{{ current }} / {{ count }}</span>
    <Button size="sm" :disabled="disabled || current >= count" @click="model = current + 1">{{ nextLabel }}</Button>
  </nav>
</template>

<style src="./pagination.css"></style>
