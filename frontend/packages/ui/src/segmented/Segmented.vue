<script setup lang="ts">
import { ToggleGroupItem, ToggleGroupRoot } from "reka-ui";
const model = defineModel<string>({ required: true });
defineProps<{ label: string; options: ReadonlyArray<{ value: string; label: string; disabled?: boolean; testId?: string; description?: string }>; disabled?: boolean; orientation?: "horizontal" | "vertical" }>();
function update(value: unknown) { if (typeof value === "string" && value) model.value = value; }
</script>
<template>
  <ToggleGroupRoot class="eap-segmented" type="single" :orientation="orientation" :model-value="model" :aria-label="label" :disabled="disabled" @update:model-value="update">
    <ToggleGroupItem v-for="option in options" :key="option.value" class="eap-segmented__item" :data-testid="option.testId" :value="option.value" :disabled="option.disabled"><span>{{ option.label }}</span><small v-if="option.description">{{ option.description }}</small></ToggleGroupItem>
  </ToggleGroupRoot>
</template>
<style src="./segmented.css"></style>
