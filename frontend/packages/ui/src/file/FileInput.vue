<script setup lang="ts">
import { computed, ref, useAttrs } from "vue";

defineOptions({ inheritAttrs: false });

defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ change: [Event] }>();
const attrs = useAttrs();
const root = ref<HTMLInputElement | null>(null);
const extra = computed(() => {
  const { class: _class, onChange: _onChange, ...rest } = attrs;
  return rest;
});

function onChange(event: Event) {
  emit("change", event);
}

defineExpose({ click: () => root.value?.click() });
</script>

<template>
  <input
    ref="root"
    :class="['eap-file', attrs.class]"
    type="file"
    :disabled="disabled"
    v-bind="extra"
    @change="onChange"
  />
</template>

<style src="./file.css"></style>
