<script setup lang="ts">
import { computed, useAttrs, type InputHTMLAttributes } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    disabled?: boolean;
    type?: InputHTMLAttributes["type"];
  }>(),
  { type: "text", disabled: false },
);
const emit = defineEmits<{
  "update:modelValue": [string];
  input: [Event];
}>();
const attrs = useAttrs();
const extra = computed(() => {
  const { class: _class, onInput: _onInput, value: _value, ...rest } = attrs;
  return rest;
});
const shown = computed(() => {
  const value = props.modelValue ?? attrs.value ?? "";
  return typeof value === "number" ? value : String(value);
});

function onInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
  emit("input", event);
}
</script>

<template>
  <input
    :class="['eap-input', attrs.class]"
    :type="type"
    :disabled="disabled"
    :value="shown"
    v-bind="extra"
    @input="onInput"
  />
</template>

<style src="./field.css"></style>
