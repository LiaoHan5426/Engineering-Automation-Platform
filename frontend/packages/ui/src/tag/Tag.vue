<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: "primary" | "success" | "warning" | "danger" | "info";
    effect?: "light" | "plain" | "dark";
    size?: "sm" | "md";
    closable?: boolean;
    disabled?: boolean;
  }>(),
  { type: "primary", effect: "light", size: "md", closable: false, disabled: false },
);
const emit = defineEmits<{ close: [MouseEvent]; click: [MouseEvent] }>();

function onClick(event: MouseEvent) {
  if (event.defaultPrevented) return;
  emit("click", event);
}
function onClose(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  emit("close", event);
}
</script>

<template>
  <component
    :is="closable ? 'button' : 'span'"
    class="eap-tag"
    :class="[`eap-tag--${type}`, `eap-tag--${effect}`, `eap-tag--${size}`]"
    :type="closable ? 'button' : undefined"
    :disabled="closable ? disabled : undefined"
    @click="onClick"
  >
    <slot />
    <span v-if="closable" class="eap-tag__close" aria-hidden="true" @click="onClose">×</span>
  </component>
</template>

<style src="./tag.css"></style>
