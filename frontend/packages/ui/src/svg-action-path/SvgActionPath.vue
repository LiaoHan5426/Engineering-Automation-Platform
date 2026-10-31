<script setup lang="ts">
const props = defineProps<{ d: string; label: string; disabled?: boolean; deleteKey?: boolean }>();
const emit = defineEmits<{ activate: [MouseEvent | KeyboardEvent] }>();
function activate(event: MouseEvent | KeyboardEvent) { if (!props.disabled) emit("activate", event); }
function keydown(event: KeyboardEvent) {
  if (["Enter", " "].includes(event.key) || (props.deleteKey && event.key === "Delete")) {
    event.preventDefault();
    if (!event.repeat) activate(event);
  }
}
</script>
<template>
  <path class="eap-svg-action-path" :d="d" role="button" :tabindex="disabled ? -1 : 0" :aria-label="label" :aria-disabled="disabled || undefined" @click="activate" @keydown="keydown"><title>{{ label }}</title></path>
</template>
<style src="./svg-action-path.css"></style>
