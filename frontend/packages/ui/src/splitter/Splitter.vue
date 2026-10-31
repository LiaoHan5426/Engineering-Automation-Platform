<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from "reka-ui";
const props = withDefaults(defineProps<{ label: string; direction?: "horizontal" | "vertical"; min?: number; max?: number; disabled?: boolean }>(), { direction: "horizontal", min: 15, max: 85 });
const model = defineModel<number>({ default: 50 });
const panel = ref<InstanceType<typeof SplitterPanel>>();
function bounded(value: number) { return Math.min(props.max, Math.max(props.min, Number.isFinite(value) ? value : 50)); }
function sync() { panel.value?.resize(bounded(model.value)); }
onMounted(async () => { await nextTick(); sync(); });
watch([model, () => props.min, () => props.max], sync, { flush: "post" });
function layout(sizes: number[]) { if (sizes[0] !== undefined && Math.abs(sizes[0] - model.value) > 0.01) model.value = sizes[0]; }
</script>
<template>
  <div class="eap-splitter">
  <SplitterGroup class="eap-splitter__group" :direction="direction" @layout="layout">
    <SplitterPanel ref="panel" class="eap-splitter__panel" :default-size="bounded(model)" :min-size="min" :max-size="max"><slot name="start" /></SplitterPanel>
    <SplitterResizeHandle class="eap-splitter__handle" :aria-label="label" :disabled="disabled" />
    <SplitterPanel class="eap-splitter__panel" :default-size="100 - bounded(model)" :min-size="100 - max"><slot name="end" /></SplitterPanel>
  </SplitterGroup>
  </div>
</template>
<style src="./splitter.css"></style>
