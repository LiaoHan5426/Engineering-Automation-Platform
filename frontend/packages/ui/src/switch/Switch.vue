<script setup lang="ts">
import { computed, useAttrs } from "vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  modelValue?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [boolean];
  change: [boolean];
}>();
const attrs = useAttrs();
const extra = computed(() => {
  const { class: _class, onClick: _onClick, ...rest } = attrs;
  return rest;
});

function toggle() {
  if (props.disabled) return;
  const next = !props.modelValue;
  emit("update:modelValue", next);
  emit("change", next);
}
</script>

<template>
  <button
    :class="['eap-switch', attrs.class]"
    type="button"
    role="switch"
    :aria-checked="modelValue === true"
    :disabled="disabled"
    v-bind="extra"
    @click="toggle"
  >
    <span class="eap-switch__thumb" />
  </button>
</template>

<style src="./switch.css"></style>
