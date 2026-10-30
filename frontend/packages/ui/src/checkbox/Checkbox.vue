<script setup lang="ts">
import { computed, useAttrs } from "vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  modelValue?: boolean | readonly unknown[];
  value?: unknown;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [boolean | unknown[]];
  change: [Event];
}>();
const attrs = useAttrs();
const extra = computed(() => {
  const { class: _class, onChange: _onChange, checked: _checked, ...rest } = attrs;
  return rest;
});
const checked = computed(() =>
  Array.isArray(props.modelValue) ? props.modelValue.includes(props.value) : Boolean(props.modelValue),
);

function onChange(event: Event) {
  const next = (event.target as HTMLInputElement).checked;
  if (Array.isArray(props.modelValue)) {
    const list = props.modelValue.filter((item) => item !== props.value);
    emit("update:modelValue", next ? [...list, props.value] : list);
  } else {
    emit("update:modelValue", next);
  }
  emit("change", event);
}
</script>

<template>
  <input
    :class="['eap-checkbox', attrs.class]"
    type="checkbox"
    :checked="checked"
    :value="typeof value === 'string' || typeof value === 'number' ? value : undefined"
    :disabled="disabled"
    v-bind="extra"
    @change="onChange"
  />
</template>

<style src="./checkbox.css"></style>
