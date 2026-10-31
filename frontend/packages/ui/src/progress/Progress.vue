<script setup lang="ts">
import { computed } from "vue";
const props = withDefaults(defineProps<{ value?: number; max?: number; label: string }>(), { max: 100 });
const limit = computed(() => Number.isFinite(props.max) && props.max > 0 ? props.max : 100);
const current = computed(() => props.value === undefined || !Number.isFinite(props.value)
  ? undefined : Math.max(0, Math.min(props.value, limit.value)));
</script>
<template>
  <progress class="eap-progress" :value="current" :max="limit" :aria-label="label" />
</template>
<style src="./progress.css"></style>
