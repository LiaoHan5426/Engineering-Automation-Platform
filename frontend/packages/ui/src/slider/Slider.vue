<script setup lang="ts">
import { computed, useAttrs } from "vue";

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    modelValue?: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
  }>(),
  { min: 0, max: 100, step: 1 },
);
const emit = defineEmits<{
  "update:modelValue": [number];
  input: [Event];
}>();
const attrs = useAttrs();
const extra = computed(() => {
  const { class: _class, onInput: _onInput, value: _value, ...rest } = attrs;
  return rest;
});

function onInput(event: Event) {
  emit("update:modelValue", Number((event.target as HTMLInputElement).value));
  emit("input", event);
}
</script>

<template>
  <input
    :class="['eap-slider', attrs.class]"
    type="range"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :value="modelValue"
    v-bind="extra"
    @input="onInput"
  />
</template>

<style src="./slider.css"></style>
