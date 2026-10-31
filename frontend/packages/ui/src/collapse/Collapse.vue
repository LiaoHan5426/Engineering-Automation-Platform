<script setup lang="ts">
defineProps<{ open?: boolean; summary?: string }>();
const emit = defineEmits<{ "update:open": [boolean]; toggle: [Event] }>();
function toggle(event: Event) {
  emit("update:open", (event.target as HTMLDetailsElement).open);
  emit("toggle", event);
}
</script>

<template>
  <details class="eap-collapse" :open="open" @toggle="toggle">
    <summary class="eap-collapse__summary"><slot name="summary">{{ summary }}</slot></summary>
    <slot />
  </details>
</template>

<style src="./collapse.css"></style>
