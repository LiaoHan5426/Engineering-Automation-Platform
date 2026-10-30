<script setup lang="ts">
import { computed, useAttrs } from "vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  modelValue?: string | number;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [string];
  change: [Event];
}>();
const attrs = useAttrs();
const extra = computed(() => {
  const { class: _class, onChange: _onChange, value: _value, ...rest } = attrs;
  return rest;
});
const shown = computed(() => {
  const value = props.modelValue ?? attrs.value ?? "";
  return typeof value === "number" ? value : String(value);
});

function onChange(event: Event) {
  emit("update:modelValue", (event.target as HTMLSelectElement).value);
  emit("change", event);
}
</script>

<template>
  <select :class="['eap-select', attrs.class]" :disabled="disabled" :value="shown" v-bind="extra" @change="onChange">
    <slot />
  </select>
</template>

<style src="./field.css"></style>
