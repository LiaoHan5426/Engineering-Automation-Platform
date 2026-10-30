<script setup lang="ts">
import { computed, ref, useAttrs } from "vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  modelValue?: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [string];
  input: [Event];
}>();
const attrs = useAttrs();
const root = ref<HTMLTextAreaElement | null>(null);
const extra = computed(() => {
  const { class: _class, onInput: _onInput, value: _value, ...rest } = attrs;
  return rest;
});
const shown = computed(() => String(props.modelValue ?? attrs.value ?? ""));

function onInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
  emit("input", event);
}

defineExpose({
  focus: () => root.value?.focus(),
  scrollIntoView: (options?: ScrollIntoViewOptions) => root.value?.scrollIntoView(options),
});
</script>

<template>
  <textarea ref="root" :class="['eap-textarea', attrs.class]" :disabled="disabled" :value="shown" v-bind="extra" @input="onInput" />
</template>

<style src="./field.css"></style>
